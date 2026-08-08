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
	RowNumber int      `json:"rowNumber"`
	Status    string   `json:"status"`
	Changes   []Change `json:"changes"`
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
	_, err = db.Exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS rows (job_id TEXT, side TEXT, row_number INTEGER, row_json BLOB, row_hash TEXT, PRIMARY KEY(job_id, side, row_number));
CREATE TABLE IF NOT EXISTS results (job_id TEXT, row_number INTEGER PRIMARY KEY, status TEXT, changes_json BLOB);
CREATE INDEX IF NOT EXISTS results_job_status ON results(job_id, status);
`)
	if err != nil { db.Close(); return nil, err }
	return &DB{conn: db}, nil
}

func (db *DB) Close() error { return db.conn.Close() }

func (db *DB) PutRow(jobID, side string, row Row, hash string) error {
	b, err := json.Marshal(row.Values)
	if err != nil { return err }
	_, err = db.conn.Exec(`INSERT OR REPLACE INTO rows(job_id,side,row_number,row_json,row_hash) VALUES(?,?,?,?,?)`, jobID, side, row.Number, b, hash)
	return err
}

func (db *DB) PutResult(jobID string, rowNumber int, status string, changes []Change) error {
	b, err := json.Marshal(changes)
	if err != nil { return err }
	_, err = db.conn.Exec(`INSERT OR REPLACE INTO results(job_id,row_number,status,changes_json) VALUES(?,?,?,?)`, jobID, rowNumber, status, b)
	return err
}

// ResultWriter batches result inserts into transactions for performance.
type ResultWriter struct {
	db        *DB
	jobID     string
	tx        *sql.Tx
	stmt      *sql.Stmt
	batchSize int
	batched   int
}

// NewResultWriter returns a writer that batches inserts in one transaction,
// committing every batchSize rows.
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
	w.tx = tx
	w.stmt = stmt
	w.batched = 0
	return nil
}

func (w *ResultWriter) Put(rowNumber int, status string, changes []Change) error {
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
	if err := w.stmt.Close(); err != nil {
		return err
	}
	if err := w.tx.Commit(); err != nil {
		return err
	}
	w.tx = nil
	w.stmt = nil
	return w.begin()
}

// Close flushes any remaining rows.
func (w *ResultWriter) Close() error {
	if w.tx == nil {
		return nil
	}
	if err := w.stmt.Close(); err != nil {
		return err
	}
	err := w.tx.Commit()
	w.tx = nil
	w.stmt = nil
	return err
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
	where := "job_id=?"
	args := []any{jobID}
	switch filter {
	case "matches": where += " AND status='equal'"
	case "nonmatches": where += " AND status!='equal'"
	case "modified", "added", "deleted": where += " AND status=?"; args = append(args, filter)
	}
	var total int
	if err := db.conn.QueryRow("SELECT COUNT(*) FROM results WHERE "+where, args...).Scan(&total); err != nil { return nil, 0, err }
	args = append(args, pageSize, page*pageSize)
	rows, err := db.conn.Query("SELECT row_number,status,changes_json FROM results WHERE "+where+" ORDER BY row_number LIMIT ? OFFSET ?", args...)
	if err != nil { return nil, 0, err }
	defer rows.Close()
	var out []ResultRow
	for rows.Next() {
		var r ResultRow; var raw []byte
		if err := rows.Scan(&r.RowNumber, &r.Status, &raw); err != nil { return nil, 0, err }
		if err := json.Unmarshal(raw, &r.Changes); err != nil { return nil, 0, err }
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
