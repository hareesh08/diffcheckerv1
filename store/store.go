package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"path/filepath"

	_ "modernc.org/sqlite"
)

type Row struct {
	Number int
	Values []string
}

type Change struct {
	RowNumber int    `json:"rowNumber"`
	Column    int    `json:"column"`
	Ref       string `json:"ref"`
	Old       string `json:"old"`
	New       string `json:"new"`
	Type      string `json:"type"`
}

type ResultRow struct {
	RowNumber      int      `json:"rowNumber"`
	Status         string   `json:"status"`
	Changes        []Change `json:"changes"`
	OriginalValues []string `json:"originalValues,omitempty"`
	ChangedValues  []string `json:"changedValues,omitempty"`
}

type Summary struct {
	MatchedRows   int `json:"matchedRows"`
	ModifiedRows  int `json:"modifiedRows"`
	AddedRows     int `json:"addedRows"`
	DeletedRows   int `json:"deletedRows"`
	ModifiedCells int `json:"modifiedCells"`
}

type DB struct { conn *sql.DB }

func Open(path string) (*DB, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil { return nil, err }
	db.SetMaxOpenConns(1)
	// busy_timeout matters because reads (job rows, export) open a second pool
	// to the same file while a job's writer still holds an open transaction.
	_, err = db.Exec(`PRAGMA journal_mode=WAL;
PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS rows (job_id TEXT, side TEXT, row_number INTEGER, row_json BLOB, row_hash TEXT, PRIMARY KEY(job_id, side, row_number));
CREATE TABLE IF NOT EXISTS results (job_id TEXT, row_number INTEGER PRIMARY KEY, status TEXT, changes_json BLOB);
CREATE TABLE IF NOT EXISTS meta (job_id TEXT, key TEXT, value BLOB, PRIMARY KEY(job_id, key));
CREATE INDEX IF NOT EXISTS results_job_status ON results(job_id, status);
`)
	if err != nil { db.Close(); return nil, err }
	return &DB{conn: db}, nil
}

func (db *DB) Close() error { return db.conn.Close() }

// ResultWriter batches result inserts into transactions for performance.
type ResultWriter struct {
	db        *DB
	jobID     string
	tx        *sql.Tx
	stmt      *sql.Stmt
	rowStmt   *sql.Stmt
	metaStmt  *sql.Stmt
	batchSize int
	batched   int
}

// NewResultWriter returns a writer that batches inserts in one transaction,
// committing every batchSize rows.
//
// All writes for a job must go through this writer (Put and PutRow), because it
// holds the pool's only connection for the lifetime of its transaction.
func NewResultWriter(db *DB, jobID string, batchSize int) (*ResultWriter, error) {
	w := &ResultWriter{db: db, jobID: jobID, batchSize: batchSize}
	if err := w.begin(); err != nil {
		return nil, err
	}
	return w, nil
}

func (w *ResultWriter) begin() error {
	tx, err := w.db.conn.Begin()
	if err != nil {
		return err
	}
	stmt, err := tx.Prepare(`INSERT OR REPLACE INTO results(job_id,row_number,status,changes_json) VALUES(?,?,?,?)`)
	if err != nil {
		tx.Rollback()
		return err
	}
	rowStmt, err := tx.Prepare(`INSERT OR REPLACE INTO rows(job_id,side,row_number,row_json,row_hash) VALUES(?,?,?,?,?)`)
	if err != nil {
		stmt.Close()
		tx.Rollback()
		return err
	}
	metaStmt, err := tx.Prepare(`INSERT OR REPLACE INTO meta(job_id,key,value) VALUES(?,?,?)`)
	if err != nil {
		stmt.Close()
		rowStmt.Close()
		tx.Rollback()
		return err
	}
	w.tx = tx
	w.stmt = stmt
	w.rowStmt = rowStmt
	w.metaStmt = metaStmt
	w.batched = 0
	return nil
}

// PutRow stores the raw cell values for one side of a row inside the writer's
// current transaction, so the UI can render whole rows and not just the cells
// that changed. It reuses the writer's connection, which matters because Open
// caps the pool at one connection: any write taking its own connection while
// this transaction is open would block forever.
func (w *ResultWriter) PutRow(side string, row Row) error {
	b, err := json.Marshal(row.Values)
	if err != nil {
		return err
	}
	_, err = w.rowStmt.Exec(w.jobID, side, row.Number, b, "")
	return err
}

// closeStmts releases both prepared statements, always attempting each one.
func (w *ResultWriter) closeStmts() error {
	err := w.stmt.Close()
	if rerr := w.rowStmt.Close(); err == nil {
		err = rerr
	}
	if rerr := w.metaStmt.Close(); err == nil {
		err = rerr
	}
	w.stmt = nil
	w.rowStmt = nil
	w.metaStmt = nil
	return err
}

// PutColumns stores the resolved column headers (original and changed) for the
// job inside the writer's transaction, so they persist atomically with results.
func (w *ResultWriter) PutColumns(original, changed []string) error {
	b, err := json.Marshal(map[string][]string{"original": original, "changed": changed})
	if err != nil {
		return err
	}
	_, err = w.metaStmt.Exec(w.jobID, "columns", b)
	return err
}

func (w *ResultWriter) Put(rowNumber int, status string, changes []Change) error {
	if changes == nil {
		changes = []Change{}
	}
	b, err := json.Marshal(changes)
	if err != nil {
		return err
	}
	if _, err := w.stmt.Exec(w.jobID, rowNumber, status, b); err != nil {
		return err
	}
	w.batched++
	if w.batched >= w.batchSize {
		return w.Flush()
	}
	return nil
}

// Flush commits the current transaction and starts a new one.
func (w *ResultWriter) Flush() error {
	if w.tx == nil {
		return nil
	}
	if err := w.closeStmts(); err != nil {
		w.tx.Rollback()
		w.tx = nil
		return err
	}
	err := w.tx.Commit()
	w.tx = nil
	if err != nil {
		return err
	}
	return w.begin()
}

// Close commits any remaining rows. It is idempotent, so callers may commit
// early and still leave a deferred Close in place as a panic safety net.
func (w *ResultWriter) Close() error {
	if w.tx == nil {
		return nil
	}
	if err := w.closeStmts(); err != nil {
		w.tx.Rollback()
		w.tx = nil
		return err
	}
	err := w.tx.Commit()
	w.tx = nil
	return err
}

// Columns returns the persisted column headers (original and changed) for a
// job, or nil values when none were stored (e.g. rows/text modes).
func (db *DB) Columns(jobID string) (original, changed []string, err error) {
	var raw []byte
	err = db.conn.QueryRow(`SELECT value FROM meta WHERE job_id=? AND key='columns'`, jobID).Scan(&raw)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil, nil
		}
		return nil, nil, err
	}
	var cols struct {
		Original []string `json:"original"`
		Changed  []string `json:"changed"`
	}
	if err := json.Unmarshal(raw, &cols); err != nil {
		return nil, nil, err
	}
	return cols.Original, cols.Changed, nil
}

func (db *DB) Summary(jobID string) (Summary, error) {
	var s Summary
	err := db.conn.QueryRow(`SELECT
	COALESCE(SUM(status='equal'),0), COALESCE(SUM(status='modified'),0),
	COALESCE(SUM(status='added'),0), COALESCE(SUM(status='deleted'),0)
	FROM results WHERE job_id=?`, jobID).Scan(&s.MatchedRows, &s.ModifiedRows, &s.AddedRows, &s.DeletedRows)
	if err != nil { return s, err }
	err = db.conn.QueryRow(`SELECT COALESCE(SUM(json_array_length(changes_json)),0) FROM results WHERE job_id=? AND status='modified'`, jobID).Scan(&s.ModifiedCells)
	return s, err
}

func (db *DB) Results(jobID, filter string, page, pageSize int) ([]ResultRow, int, error) {
	where := "r.job_id=?"
	args := []any{jobID}
	switch filter {
	case "matches": where += " AND r.status='equal'"
	case "nonmatches": where += " AND r.status!='equal'"
	case "modified", "added", "deleted": where += " AND r.status=?"; args = append(args, filter)
	}
	var total int
	if err := db.conn.QueryRow("SELECT COUNT(*) FROM results r WHERE "+where, args...).Scan(&total); err != nil { return nil, 0, err }
	args = append(args, pageSize, page*pageSize)
	query := `SELECT r.row_number, r.status, r.changes_json,
		o.row_json, c.row_json
		FROM results r
		LEFT JOIN rows o ON r.job_id=o.job_id AND o.side='original' AND r.row_number=o.row_number
		LEFT JOIN rows c ON r.job_id=c.job_id AND c.side='changed' AND r.row_number=c.row_number
		WHERE ` + where + ` ORDER BY r.row_number LIMIT ? OFFSET ?`
	rows, err := db.conn.Query(query, args...)
	if err != nil { return nil, 0, err }
	defer rows.Close()
	var out []ResultRow
	for rows.Next() {
		var r ResultRow; var raw, origRaw, changedRaw []byte
		if err := rows.Scan(&r.RowNumber, &r.Status, &raw, &origRaw, &changedRaw); err != nil { return nil, 0, err }
		if err := json.Unmarshal(raw, &r.Changes); err != nil { return nil, 0, err }
		if r.Changes == nil { r.Changes = []Change{} }
		if origRaw != nil { _ = json.Unmarshal(origRaw, &r.OriginalValues) }
		if changedRaw != nil { _ = json.Unmarshal(changedRaw, &r.ChangedValues) }
		if r.OriginalValues == nil { r.OriginalValues = []string{} }
		if r.ChangedValues == nil { r.ChangedValues = []string{} }
		out = append(out, r)
	}
	return out, total, rows.Err()
}

func (db *DB) Export(jobID, filter string, w interface{ Write([]byte) (int, error) }) error {
	rows, _, err := db.Results(jobID, filter, 0, int(^uint(0)>>1))
	if err != nil { return err }
	for _, row := range rows {
		for _, c := range row.Changes {
			line := fmt.Sprintf("%s,%d,%s,%q,%q,%q\n", row.Status, row.RowNumber, c.Ref, c.Old, c.New, c.Type)
			if _, err := w.Write([]byte(line)); err != nil { return err }
		}
	}
	return nil
}

func JobDBPath(root, jobID string) string { return filepath.Join(root, jobID, "results.db") }
