package central

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

// HistoryJob is a persisted comparison record shown in the History screen.
type HistoryJob struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Mode         string    `json:"mode"`
	OriginalName string    `json:"originalName"`
	ChangedName  string    `json:"changedName"`
	Status       string    `json:"status"`
	Summary      string    `json:"summary"`
	Meta         string    `json:"meta"`
	CreatedAt    time.Time `json:"createdAt"`
	CompletedAt  time.Time `json:"completedAt"`
}

// Export is a record of a generated export.
type Export struct {
	ID        int64     `json:"id"`
	JobID     string    `json:"jobId,omitempty"`
	Name      string    `json:"name"`
	Format    string    `json:"format"`
	Filter    string    `json:"filter"`
	CreatedAt time.Time `json:"createdAt"`
}

// DB wraps the central SQLite database at data/differ.db.
type DB struct {
	conn *sql.DB
}

// Open opens (creating if needed) the central database.
func Open(path string) (*DB, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	_, err = db.Exec(`PRAGMA journal_mode=WAL;
PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT '',
  original_name TEXT NOT NULL DEFAULT '',
  changed_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  summary_json TEXT NOT NULL DEFAULT '{}',
  meta_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS exports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL DEFAULT '',
  filter TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
`)
	if err != nil {
		db.Close()
		return nil, err
	}
	return &DB{conn: db}, nil
}

func (db *DB) Close() error { return db.conn.Close() }

// â”€â”€ Jobs (history) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// SaveJob upserts a completed comparison into history.
func (db *DB) SaveJob(j HistoryJob) error {
	created := j.CreatedAt.Format(time.RFC3339)
	completed := ""
	if !j.CompletedAt.IsZero() {
		completed = j.CompletedAt.Format(time.RFC3339)
	}
	_, err := db.conn.Exec(`INSERT INTO jobs
(id, name, mode, original_name, changed_name, status, summary_json, meta_json, created_at, completed_at)
VALUES(?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(id) DO UPDATE SET
  name=excluded.name, mode=excluded.mode, original_name=excluded.original_name,
  changed_name=excluded.changed_name, status=excluded.status,
  summary_json=excluded.summary_json, meta_json=excluded.meta_json,
  completed_at=excluded.completed_at`,
		j.ID, j.Name, j.Mode, j.OriginalName, j.ChangedName, j.Status,
		j.Summary, j.Meta, created, completed)
	return err
}

// ListJobs returns persisted comparisons, newest first.
func (db *DB) ListJobs() ([]HistoryJob, error) {
	rows, err := db.conn.Query(`SELECT id, name, mode, original_name, changed_name,
	status, summary_json, meta_json, created_at, completed_at
	FROM jobs ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []HistoryJob
	for rows.Next() {
		var j HistoryJob
		var created, completed string
		if err := rows.Scan(&j.ID, &j.Name, &j.Mode, &j.OriginalName, &j.ChangedName,
			&j.Status, &j.Summary, &j.Meta, &created, &completed); err != nil {
			return nil, err
		}
		j.CreatedAt, _ = time.Parse(time.RFC3339, created)
		if completed != "" {
			j.CompletedAt, _ = time.Parse(time.RFC3339, completed)
		}
		out = append(out, j)
	}
	return out, rows.Err()
}

// GetJob returns a single persisted comparison by id.
func (db *DB) GetJob(id string) (HistoryJob, error) {
	var j HistoryJob
	var created, completed string
	err := db.conn.QueryRow(`SELECT id, name, mode, original_name, changed_name,
	status, summary_json, meta_json, created_at, completed_at
	FROM jobs WHERE id=?`, id).Scan(&j.ID, &j.Name, &j.Mode, &j.OriginalName, &j.ChangedName,
		&j.Status, &j.Summary, &j.Meta, &created, &completed)
	if err != nil {
		return j, err
	}
	j.CreatedAt, _ = time.Parse(time.RFC3339, created)
	if completed != "" {
		j.CompletedAt, _ = time.Parse(time.RFC3339, completed)
	}
	return j, nil
}

// RenameJob updates the display name of a comparison.
func (db *DB) RenameJob(id, name string) error {
	_, err := db.conn.Exec(`UPDATE jobs SET name=? WHERE id=?`, name, id)
	return err
}

// DeleteJob removes a comparison from history.
func (db *DB) DeleteJob(id string) error {
	_, err := db.conn.Exec(`DELETE FROM jobs WHERE id=?`, id)
	return err
}

func now() time.Time { return time.Now() }

// ── Exports ─────────────────────────────────────────────────────â”€

// AddExport records a generated export.
func (db *DB) AddExport(e Export) error {
	_, err := db.conn.Exec(`INSERT INTO exports (job_id, name, format, filter, created_at)
VALUES(?,?,?,?,?)`, e.JobID, e.Name, e.Format, e.Filter, now().Format(time.RFC3339))
	return err
}

// ListExports returns export history, newest first.
func (db *DB) ListExports() ([]Export, error) {
	rows, err := db.conn.Query(`SELECT id, job_id, name, format, filter, created_at
FROM exports ORDER BY id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Export
	for rows.Next() {
		var e Export
		var created string
		if err := rows.Scan(&e.ID, &e.JobID, &e.Name, &e.Format, &e.Filter, &created); err != nil {
			return nil, err
		}
		e.CreatedAt, _ = time.Parse(time.RFC3339, created)
		out = append(out, e)
	}
	return out, rows.Err()
}

// DeleteExport removes an export record by ID.
func (db *DB) DeleteExport(id int64) error {
	_, err := db.conn.Exec(`DELETE FROM exports WHERE id = ?`, id)
	return err
}

// Helper to build a JSON column value.
func JSON(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

// Ensure fmt is referenced even if future edits drop a caller.
var _ = fmt.Sprintf
