package job

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"diffchecker/store"
)

func writeCSV(t *testing.T, path string, lines [][]string) {
	t.Helper()
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	for _, l := range lines {
		for i, c := range l {
			if i > 0 {
				f.Write([]byte(","))
			}
			f.Write([]byte(c))
		}
		f.Write([]byte("\n"))
	}
}

func TestRunRowsMode(t *testing.T) {
	dir := t.TempDir()
	orig := filepath.Join(dir, "orig.csv")
	changed := filepath.Join(dir, "changed.csv")
	dbPath := filepath.Join(dir, "results.db")

	writeCSV(t, orig, [][]string{
		{"Name", "Code"},
		{"Afghanistan", "AF"},
		{"Albania", "AL"},
	})
	writeCSV(t, changed, [][]string{
		{"Name", "Code"},
		{"Afghanistan", "AS"},
		{"Albania", "AL"},
		{"Algeria", "DZ"},
	})

	j := &Job{
		ID:           "test-1",
		OriginalPath: orig,
		ChangedPath:  changed,
		StorePath:    dbPath,
		Options: Options{
			Mode: "rows",
		},
	}

	Run(context.Background(), j)

	if j.Status != StatusCompleted {
		t.Fatalf("status = %s (%s), want completed", j.Status, j.Error)
	}
	if j.Summary.ModifiedRows != 1 {
		t.Fatalf("modified rows = %d, want 1", j.Summary.ModifiedRows)
	}
	if j.Summary.AddedRows != 1 {
		t.Fatalf("added rows = %d, want 1", j.Summary.AddedRows)
	}
	if j.Summary.MatchedRows != 2 {
		t.Fatalf("matched rows = %d, want 2", j.Summary.MatchedRows)
	}

	db, err := store.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	rows, total, err := db.Results(j.ID, "all", 0, 100)
	if err != nil {
		t.Fatal(err)
	}
	if total != 4 {
		t.Fatalf("total rows = %d, want 4", total)
	}
	found := false
	for _, r := range rows {
		if r.RowNumber == 2 && r.Status == "modified" {
			found = true
			if len(r.Changes) != 1 || r.Changes[0].Ref != "B2" || r.Changes[0].Old != "AF" || r.Changes[0].New != "AS" {
				t.Fatalf("unexpected changes: %+v", r.Changes)
			}
		}
	}
	if !found {
		t.Fatal("row 2 not marked modified")
	}

	// filter test
	nonmatch, totalNM, err := db.Results(j.ID, "nonmatches", 0, 100)
	if err != nil {
		t.Fatal(err)
	}
	if totalNM != 2 {
		t.Fatalf("nonmatch total = %d, want 2", totalNM)
	}
	_ = nonmatch
}

func TestRunIgnoreOptions(t *testing.T) {
	dir := t.TempDir()
	orig := filepath.Join(dir, "a.csv")
	changed := filepath.Join(dir, "b.csv")
	dbPath := filepath.Join(dir, "r.db")

	writeCSV(t, orig, [][]string{{"Name"}, {"  Afghanistan  "}})
	writeCSV(t, changed, [][]string{{"Name"}, {"afghanistan"}})

	j := &Job{
		ID: "test-2", OriginalPath: orig, ChangedPath: changed, StorePath: dbPath,
		Options: Options{Mode: "rows", IgnoreWhitespace: true, IgnoreCase: true},
	}
	Run(context.Background(), j)
	if j.Status != StatusCompleted {
		t.Fatalf("status = %s: %s", j.Status, j.Error)
	}
	if j.Summary.ModifiedRows != 0 || j.Summary.MatchedRows != 2 {
		t.Fatalf("with ignore opts, expected 0 modified, got %+v", j.Summary)
	}
}

func TestRunCancel(t *testing.T) {
	dir := t.TempDir()
	orig := filepath.Join(dir, "a.csv")
	changed := filepath.Join(dir, "b.csv")
	dbPath := filepath.Join(dir, "r.db")

	var lines [][]string
	for i := 0; i < 50000; i++ {
		lines = append(lines, []string{"x", "y", "z"})
	}
	writeCSV(t, orig, lines)
	writeCSV(t, changed, lines[:49999])

	ctx, cancel := context.WithCancel(context.Background())
	j := &Job{
		ID: "test-3", OriginalPath: orig, ChangedPath: changed, StorePath: dbPath,
		Options: Options{Mode: "rows"},
	}
	go func() {
		cancel()
	}()
	Run(ctx, j)
	if j.Status != StatusCancelled {
		t.Fatalf("status = %s, want cancelled", j.Status)
	}
}
