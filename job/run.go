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
// It streams both files, compares row-by-row, and writes results to SQLite.
func Run(ctx context.Context, j *Job) {
	done := func(status Status, err string) {
		j.Status = status
		j.Error = err
		j.CompletedAt = time.Now()
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

	j.Status = StatusParsing

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

	j.Status = StatusComparing

	for oErr != io.EOF || nErr != io.EOF {
		select {
		case <-ctx.Done():
			done(StatusCancelled, "")
			return
		default:
		}

		switch {
		case oErr == io.EOF && nErr == io.EOF:
			return
		case oErr == io.EOF:
			// Deleted side exhausted; remaining new rows are additions.
			if err := rw.Put(nRowNum, "added", []store.Change{
				{RowNumber: nRowNum, Ref: "A" + itoa(nRowNum), Type: "added"},
			}); err != nil {
				done(StatusFailed, err.Error())
				return
			}
			j.Summary.AddedRows++
			nRec, nErr = newR.Next()
			nRowNum++
			continue
		case nErr == io.EOF:
			// New side exhausted; remaining old rows are deletions.
			if err := rw.Put(oRowNum, "deleted", []store.Change{
				{RowNumber: oRowNum, Ref: "A" + itoa(oRowNum), Type: "deleted"},
			}); err != nil {
				done(StatusFailed, err.Error())
				return
			}
			j.Summary.DeletedRows++
			oRec, oErr = origR.Next()
			oRowNum++
			continue
		}

		// Both sides have a row. Compare.
		changes, matched := compareRow(opts, oRec, nRec, oRowNum)
		if matched {
			j.Summary.MatchedRows++
		} else {
			j.Summary.ModifiedRows++
			j.Summary.ModifiedCells += len(changes)
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

	done(StatusCompleted, "")
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
