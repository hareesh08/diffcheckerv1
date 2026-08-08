package job

import (
	"context"
	"io"
	"strings"
	"time"

	"diffchecker/parse"
	"diffchecker/store"
)

// Run executes a comparison job with bounded memory.
// It streams both files, compares rows (positional or header-key aligned), and
// writes results to SQLite. All job field mutations go through j.Update so the
// HTTP layer can read a consistent snapshot without racing.
func Run(ctx context.Context, j *Job) {
	done := func(status Status, err string) {
		j.Update(func(jj *Job) {
			jj.Status = status
			jj.Error = err
			jj.CompletedAt = time.Now()
		})
	}

	db, err := store.Open(j.StorePath)
	if err != nil {
		done(StatusFailed, err.Error())
		return
	}
	defer db.Close()

	rw, err := store.NewResultWriter(db, j.ID, 5000)
	if err != nil {
		done(StatusFailed, err.Error())
		return
	}
	defer rw.Close()

	opts := j.Options

	origR, err := parse.Open(j.OriginalPath, opts.OriginalSheet)
	if err != nil {
		done(StatusFailed, "original: "+err.Error())
		return
	}
	defer origR.Close()

	newR, err := parse.Open(j.ChangedPath, opts.ChangedSheet)
	if err != nil {
		done(StatusFailed, "changed: "+err.Error())
		return
	}
	defer newR.Close()

	j.Update(func(jj *Job) { jj.Status = StatusParsing })

	j.Update(func(jj *Job) { jj.Status = StatusComparing })

	if opts.Mode == "table" {
		runTable(ctx, j, done, opts, rw, origR, newR)
	} else {
		runRows(ctx, j, done, opts, rw, origR, newR)
	}
}

// runRows is the positional, index-by-index comparison. It is the historical
// default; fine for append-only logs and fixed-shape exports.
func runRows(ctx context.Context, j *Job, done func(Status, string), opts Options, rw *store.ResultWriter, origR, newR parse.Reader) {
	var oRowNum, nRowNum int
	oErr, nErr := error(nil), error(nil)
	var oRec, nRec []string
	// Prime both streams.
	oRec, oErr = origR.Next()
	nRec, nErr = newR.Next()
	if oErr == nil {
		oRowNum = 1
	}
	if nErr == nil {
		nRowNum = 1
	}

	compared := 0
	for oErr != io.EOF || nErr != io.EOF {
		select {
		case <-ctx.Done():
			done(StatusCancelled, "")
			return
		default:
		}

		// Total row count is unknown while streaming, so report a live count
		// rather than a percentage. Counted here so the added-only and
		// deleted-only branches below still advance the label.
		compared++
		if compared%500 == 0 {
			j.Update(func(jj *Job) {
				jj.ProgressLabel = itoa(compared) + " rows compared"
			})
		}

		// Do not keep looping on parser errors. In particular, encoding/csv can
		// return a non-EOF error while leaving the reader usable; treating that
		// error as an empty row would leave the job stuck in "comparing".
		if oErr != nil && oErr != io.EOF {
			done(StatusFailed, "original: "+oErr.Error())
			return
		}
		if nErr != nil && nErr != io.EOF {
			done(StatusFailed, "changed: "+nErr.Error())
			return
		}

		switch {
		case oErr == io.EOF:
			// Deleted side exhausted; remaining new rows are additions.
			// Row values must go through rw, which holds the pool's only
			// connection; db.PutRow here would block forever.
			if err := rw.PutRow("changed", store.Row{Number: nRowNum, Values: nRec}); err != nil {
				done(StatusFailed, err.Error())
				return
			}
			if err := rw.Put(nRowNum, "added", []store.Change{
				{RowNumber: nRowNum, Ref: "A" + itoa(nRowNum), Type: "added"},
			}); err != nil {
				done(StatusFailed, err.Error())
				return
			}
			j.Update(func(jj *Job) { jj.Summary.AddedRows++ })
			nRec, nErr = newR.Next()
			nRowNum++
			continue
		case nErr == io.EOF:
			// New side exhausted; remaining old rows are deletions.
			if err := rw.PutRow("original", store.Row{Number: oRowNum, Values: oRec}); err != nil {
				done(StatusFailed, err.Error())
				return
			}
			if err := rw.Put(oRowNum, "deleted", []store.Change{
				{RowNumber: oRowNum, Ref: "A" + itoa(oRowNum), Type: "deleted"},
			}); err != nil {
				done(StatusFailed, err.Error())
				return
			}
			j.Update(func(jj *Job) { jj.Summary.DeletedRows++ })
			oRec, oErr = origR.Next()
			oRowNum++
			continue
		}

		// Store raw cell values for both sides so the UI can render whole rows,
		// not just the cells that changed.
		if err := rw.PutRow("original", store.Row{Number: oRowNum, Values: oRec}); err != nil {
			done(StatusFailed, err.Error())
			return
		}
		if err := rw.PutRow("changed", store.Row{Number: nRowNum, Values: nRec}); err != nil {
			done(StatusFailed, err.Error())
			return
		}

		// Both sides have a row. Compare.
		changes, matched := compareRow(opts, oRec, nRec, oRowNum)
		if matched {
			j.Update(func(jj *Job) { jj.Summary.MatchedRows++ })
		} else {
			j.Update(func(jj *Job) {
				jj.Summary.ModifiedRows++
				jj.Summary.ModifiedCells += len(changes)
			})
		}
		if len(changes) > 0 {
			if err := rw.Put(oRowNum, "modified", changes); err != nil {
				done(StatusFailed, err.Error())
				return
			}
		} else {
			if err := rw.Put(oRowNum, "equal", nil); err != nil {
				done(StatusFailed, err.Error())
				return
			}
		}

		oRec, oErr = origR.Next()
		nRec, nErr = newR.Next()
		oRowNum++
		nRowNum++
	}

	// Commit the final batch BEFORE publishing "completed". The UI polls status
	// and fetches rows the moment it sees completed, so committing afterwards
	// (via the deferred Close) would expose a truncated result set.
	if err := rw.Close(); err != nil {
		done(StatusFailed, err.Error())
		return
	}

	j.Update(func(jj *Job) {
		jj.Progress = 1
		jj.ProgressLabel = itoa(compared) + " rows compared"
	})
	done(StatusCompleted, "")
}

// runTable aligns rows by column names and key value. The header row on each
// side is mapped by name, and rows are matched by the value of the key column
// when RowKeyColumn is set; otherwise a bounded lookahead re-syncs after
// inserts/deletes instead of cascading false "modified" results.
func runTable(ctx context.Context, j *Job, done func(Status, string), opts Options, rw *store.ResultWriter, origR, newR parse.Reader) {
	os := newRowSource(origR)
	ns := newRowSource(newR)

	oCol, oRec, oErr := readHeader(os, opts.HeaderRow)
	nCol, nRec, nErr := readHeader(ns, opts.HeaderRow)

	oRowNum, nRowNum := 1, 1
	// res is the monotonic result-row counter. Unlike oRowNum/nRowNum it never
	// backtracks, so an inserted row written at res=2 is not later overwritten
	// by the aligned pair that continues at res=2.
	res := 1
	compared := 0

	for oErr != io.EOF || nErr != io.EOF {
		select {
		case <-ctx.Done():
			done(StatusCancelled, "")
			return
		default:
		}

		compared++
		if compared%500 == 0 {
			j.Update(func(jj *Job) {
				jj.ProgressLabel = itoa(compared) + " rows compared"
			})
		}

		if oErr != nil && oErr != io.EOF {
			done(StatusFailed, "original: "+oErr.Error())
			return
		}
		if nErr != nil && nErr != io.EOF {
			done(StatusFailed, "changed: "+nErr.Error())
			return
		}

		// One side exhausted: the rest of the other side is adds/deletes.
		if oErr == io.EOF {
			if err := writeAdd(rw, res, nRec, j); err != nil {
				done(StatusFailed, err.Error())
				return
			}
			res++
			nRec, nErr = ns.next()
			nRowNum++
			continue
		}
		if nErr == io.EOF {
			if err := writeDelete(rw, res, oRec, j); err != nil {
				done(StatusFailed, err.Error())
				return
			}
			res++
			oRec, oErr = os.next()
			oRowNum++
			continue
		}

		oKey, nKey := keyOf(oRec, oCol, opts.RowKeyColumn), keyOf(nRec, nCol, opts.RowKeyColumn)
		if opts.RowKeyColumn != "" && oKey != "" && nKey != "" {
			if oKey == nKey {
				if err := comparePair(rw, j, res, oRec, nRec, oCol, nCol, opts); err != nil {
					done(StatusFailed, err.Error())
					return
				}
				res++
				oRec, oErr = os.next()
				nRec, nErr = ns.next()
				oRowNum++
				nRowNum++
				continue
			}

			// Keys differ. Decide insert vs delete vs key-edit via lookahead.
			if ns.containsKey(oKey, nCol, opts.RowKeyColumn) {
				// Original row's key shows up later on the changed side:
				// the current changed row is an insertion.
				if err := writeAdd(rw, res, nRec, j); err != nil {
					done(StatusFailed, err.Error())
					return
				}
				res++
				nRec, nErr = ns.next()
				nRowNum++
				continue
			}
			if os.containsKey(nKey, oCol, opts.RowKeyColumn) {
				// Changed row's key shows up later on the original side:
				// the current original row is a deletion.
				if err := writeDelete(rw, res, oRec, j); err != nil {
					done(StatusFailed, err.Error())
					return
				}
				res++
				oRec, oErr = os.next()
				oRowNum++
				continue
			}

			// Neither key found ahead: both sides changed the key value.
			// Treat as an aligned pair.
			if err := comparePair(rw, j, res, oRec, nRec, oCol, nCol, opts); err != nil {
				done(StatusFailed, err.Error())
				return
			}
			res++
			oRec, oErr = os.next()
			nRec, nErr = ns.next()
			oRowNum++
			nRowNum++
			continue
		}

		// No usable key: try whole-row lookahead to absorb inserts/deletes.
		if ns.containsRow(oRec, opts) {
			if err := writeAdd(rw, res, nRec, j); err != nil {
				done(StatusFailed, err.Error())
				return
			}
			res++
			nRec, nErr = ns.next()
			nRowNum++
			continue
		}
		if os.containsRow(nRec, opts) {
			if err := writeDelete(rw, res, oRec, j); err != nil {
				done(StatusFailed, err.Error())
				return
			}
			res++
			oRec, oErr = os.next()
			oRowNum++
			continue
		}

		// No alignment found: compare positionally.
		if err := comparePair(rw, j, res, oRec, nRec, oCol, nCol, opts); err != nil {
			done(StatusFailed, err.Error())
			return
		}
		res++
		oRec, oErr = os.next()
		nRec, nErr = ns.next()
		oRowNum++
		nRowNum++
	}

	if err := rw.Close(); err != nil {
		done(StatusFailed, err.Error())
		return
	}

	j.Update(func(jj *Job) {
		jj.Progress = 1
		jj.ProgressLabel = itoa(compared) + " rows compared"
	})
	done(StatusCompleted, "")
}

// readHeader consumes the header rows of a stream and returns the column names
// derived from them plus the first data row. headerRow is the 1-based number of
// the last header line; headerRow=0 means no header, so columns get spreadsheet
// letters A/B/... Blank header cells also fall back to those letters.
func readHeader(r *rowSource, headerRow int) ([]string, []string, error) {
	if headerRow < 0 {
		headerRow = 0
	}
	var hdr []string
	var err error
	for i := 0; i < headerRow; i++ {
		hdr, err = r.next()
		if err != nil {
			return nil, nil, err
		}
	}
	rec, err := r.next()
	if err != nil {
		return nil, nil, err
	}
	width := max(len(hdr), len(rec))
	cols := make([]string, width)
	for i := 0; i < width; i++ {
		if hdr != nil && i < len(hdr) && strings.TrimSpace(hdr[i]) != "" {
			cols[i] = hdr[i]
		} else {
			cols[i] = colName(i + 1)
		}
	}
	return cols, rec, nil
}

// keyOf returns the value of the key column in rec, or "" if the column is not
// present or the option is unset.
func keyOf(rec []string, cols []string, key string) string {
	if key == "" || rec == nil {
		return ""
	}
	for i, c := range cols {
		if c == key {
			if i < len(rec) {
				return rec[i]
			}
			return ""
		}
	}
	return ""
}

// rowSource wraps a parse.Reader with a small peek buffer so alignment
// lookahead never consumes rows it later needs.
type rowSource struct {
	r   parse.Reader
	buf []row
	max int
}

type row struct {
	rec []string
	err error
}

func newRowSource(r parse.Reader) *rowSource {
	return &rowSource{r: r, max: 8}
}

// next returns the next row, consuming it.
func (s *rowSource) next() ([]string, error) {
	if len(s.buf) > 0 {
		x := s.buf[0]
		s.buf = s.buf[1:]
		return x.rec, x.err
	}
	return s.r.Next()
}

// peek fills the buffer with up to max rows without consuming them.
func (s *rowSource) peek() {
	for len(s.buf) < s.max {
		rec, err := s.r.Next()
		s.buf = append(s.buf, row{rec, err})
		if err != nil {
			return
		}
	}
}

// containsKey reports whether any buffered (unconsumed) row has the given key
// column value.
func (s *rowSource) containsKey(k string, cols []string, keyCol string) bool {
	if k == "" || keyCol == "" {
		return false
	}
	idx := -1
	for i, c := range cols {
		if c == keyCol {
			idx = i
			break
		}
	}
	if idx < 0 {
		return false
	}
	s.peek()
	for _, x := range s.buf {
		if x.err == nil && idx < len(x.rec) && x.rec[idx] == k {
			return true
		}
	}
	return false
}

// containsRow reports whether any buffered (unconsumed) row equals target
// across all columns, applying comparison normalization.
func (s *rowSource) containsRow(target []string, opts Options) bool {
	s.peek()
	for _, x := range s.buf {
		if x.err == nil && rowsSoftEqual(x.rec, target, opts) {
			return true
		}
	}
	return false
}

// rowsSoftEqual compares two rows cell by cell under the given options.
func rowsSoftEqual(a, b []string, opts Options) bool {
	n := max(len(a), len(b))
	for i := 0; i < n; i++ {
		var av, bv string
		if i < len(a) {
			av = a[i]
		}
		if i < len(b) {
			bv = b[i]
		}
		if !eq(opts, av, bv) {
			return false
		}
	}
	return true
}

// comparePair aligns, compares, and writes one original/changed pair to the
// result writer.
func comparePair(rw *store.ResultWriter, j *Job, res int, oRec, nRec, oCol, nCol []string, opts Options) error {
	origOut, changedOut, changes, matched := compareRowKeyed(opts, oRec, nRec, oCol, nCol, res)
	return writeBoth(rw, res, origOut, changedOut, res, changes, matched, j)
}

// compareRowKeyed compares two rows that have already been aligned to the
// original's column layout; it returns the reordered changed values and the
// per-column changes.
func compareRowKeyed(opts Options, oRec, nRec, oCol, nCol []string, rowNum int) (origOut, changedOut []string, changes []store.Change, matched bool) {
	// Reorder changed columns to match original column order.
	nByCol := make(map[string]string, len(nRec))
	for i, c := range nCol {
		if i < len(nRec) {
			nByCol[c] = nRec[i]
		}
	}
	origOut = oRec
	changedOut = make([]string, len(oCol))
	for i, c := range oCol {
		if v, ok := nByCol[c]; ok {
			changedOut[i] = v
		}
	}
	for i := range oCol {
		if i >= len(origOut) {
			continue
		}
		oa := origOut[i]
		na := ""
		if i < len(changedOut) {
			na = changedOut[i]
		}
		if oa == "" && na == "" {
			continue
		}
		if eq(opts, oa, na) {
			continue
		}
		changes = append(changes, store.Change{
			RowNumber: rowNum,
			Column:    i,
			Ref:       colName(i+1) + itoa(rowNum),
			Old:       oa,
			New:       na,
			Type:      "modified",
		})
	}
	return origOut, changedOut, changes, len(changes) == 0
}

// writeBoth stores both sides of a compared pair and records its status.
func writeBoth(rw *store.ResultWriter, rowNum int, orig, changed []string, resultRow int, changes []store.Change, matched bool, j *Job) error {
	if err := rw.PutRow("original", store.Row{Number: rowNum, Values: orig}); err != nil {
		return err
	}
	if err := rw.PutRow("changed", store.Row{Number: rowNum, Values: changed}); err != nil {
		return err
	}
	if matched {
		j.Update(func(jj *Job) { jj.Summary.MatchedRows++ })
		if err := rw.Put(resultRow, "equal", nil); err != nil {
			return err
		}
	} else {
		j.Update(func(jj *Job) {
			jj.Summary.ModifiedRows++
			jj.Summary.ModifiedCells += len(changes)
		})
		if err := rw.Put(resultRow, "modified", changes); err != nil {
			return err
		}
	}
	return nil
}

// writeDelete records a row that exists only on the original side.
func writeDelete(rw *store.ResultWriter, rowNum int, rec []string, j *Job) error {
	if err := rw.PutRow("original", store.Row{Number: rowNum, Values: rec}); err != nil {
		return err
	}
	if err := rw.Put(rowNum, "deleted", []store.Change{
		{RowNumber: rowNum, Ref: "A" + itoa(rowNum), Type: "deleted"},
	}); err != nil {
		return err
	}
	j.Update(func(jj *Job) { jj.Summary.DeletedRows++ })
	return nil
}

// writeAdd records a row that exists only on the changed side.
func writeAdd(rw *store.ResultWriter, rowNum int, rec []string, j *Job) error {
	if err := rw.PutRow("changed", store.Row{Number: rowNum, Values: rec}); err != nil {
		return err
	}
	if err := rw.Put(rowNum, "added", []store.Change{
		{RowNumber: rowNum, Ref: "A" + itoa(rowNum), Type: "added"},
	}); err != nil {
		return err
	}
	j.Update(func(jj *Job) { jj.Summary.AddedRows++ })
	return nil
}

// compareRow compares two rows cell-by-cell, applying normalization options.
// Returns the list of cell changes and whether the rows matched.
func compareRow(opts Options, oRow, nRow []string, rowNum int) ([]store.Change, bool) {
	maxCols := len(oRow)
	if len(nRow) > maxCols {
		maxCols = len(nRow)
	}
	var changes []store.Change
	matched := true
	for i := 0; i < maxCols; i++ {
		var ov, nv string
		if i < len(oRow) {
			ov = oRow[i]
		}
		if i < len(nRow) {
			nv = nRow[i]
		}
		if eq(opts, ov, nv) {
			continue
		}
		matched = false
		changes = append(changes, store.Change{
			RowNumber: rowNum,
			Column:    i,
			Ref:       colName(i+1) + itoa(rowNum),
			Old:       ov,
			New:       nv,
			Type:      "modified",
		})
	}
	return changes, matched
}

func eq(opts Options, a, b string) bool {
	if opts.IgnoreWhitespace {
		a = strings.TrimSpace(a)
		b = strings.TrimSpace(b)
	}
	if opts.IgnoreCase {
		a = strings.ToLower(a)
		b = strings.ToLower(b)
	}
	return a == b
}

func colName(n int) string {
	var name string
	for n > 0 {
		n--
		name = string(rune('A'+n%26)) + name
		n /= 26
	}
	return name
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
