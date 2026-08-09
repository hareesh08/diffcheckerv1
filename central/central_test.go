package central

import (
	"path/filepath"
	"testing"
	"time"
)

func testDB(t *testing.T) *DB {
	t.Helper()
	dir := t.TempDir()
	db, err := Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func TestSaveAndListJobs(t *testing.T) {
	db := testDB(t)
	created, _ := time.Parse(time.RFC3339, "2024-01-01T00:00:00Z")
	j := HistoryJob{
		ID: "job-1", Name: "Laptops final", Mode: "table",
		OriginalName: "a.csv", ChangedName: "b.csv", Status: "completed",
		Summary: `{"modified":2,"added":1,"deleted":0,"matchedRows":10}`,
		Meta:    `{"mode":"table"}`,
		CreatedAt: created,
	}
	if err := db.SaveJob(j); err != nil {
		t.Fatal(err)
	}
	jobs, err := db.ListJobs()
	if err != nil {
		t.Fatal(err)
	}
	if len(jobs) != 1 || jobs[0].ID != "job-1" || jobs[0].Name != "Laptops final" {
		t.Fatalf("unexpected jobs: %+v", jobs)
	}
	// Upsert same id updates name.
	j.Name = "Renamed"
	if err := db.SaveJob(j); err != nil {
		t.Fatal(err)
	}
	jobs, _ = db.ListJobs()
	if len(jobs) != 1 || jobs[0].Name != "Renamed" {
		t.Fatalf("upsert failed: %+v", jobs)
	}
	if err := db.RenameJob("job-1", "Final name"); err != nil {
		t.Fatal(err)
	}
	jobs, _ = db.ListJobs()
	if jobs[0].Name != "Final name" {
		t.Fatalf("rename failed: %+v", jobs[0])
	}
	if err := db.DeleteJob("job-1"); err != nil {
		t.Fatal(err)
	}
	jobs, _ = db.ListJobs()
	if len(jobs) != 0 {
		t.Fatalf("delete failed: %+v", jobs)
	}
}

func TestExports(t *testing.T) {
	db := testDB(t)
	if err := db.AddExport(Export{JobID: "j1", Name: "my-report", Format: "csv", Filter: "nonmatches"}); err != nil {
		t.Fatal(err)
	}
	if err := db.AddExport(Export{JobID: "j1", Name: "other", Format: "xlsx", Filter: "all"}); err != nil {
		t.Fatal(err)
	}
	exports, err := db.ListExports()
	if err != nil {
		t.Fatal(err)
	}
	if len(exports) != 2 {
		t.Fatalf("expected 2 exports, got %d", len(exports))
	}
	// Newest first.
	if exports[0].Name != "other" || exports[1].Name != "my-report" {
		t.Fatalf("order wrong: %+v", exports)
	}
}
