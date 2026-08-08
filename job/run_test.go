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
		if r.Changes == nil {
			t.Fatalf("row %d has nil changes; want empty array", r.RowNumber)
		}
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

func TestRunTableMode(t *testing.T) {
	dir := t.TempDir()
	orig := filepath.Join(dir, "o.csv")
	changed := filepath.Join(dir, "c.csv")
	dbPath := filepath.Join(dir, "r.db")

	writeCSV(t, orig, [][]string{
		{"Name", "Code"},
		{"Afghanistan", "AF"},
		{"Albania", "AL"},
		{"Algeria", "DZ"},
	})
	writeCSV(t, changed, [][]string{
		{"Name", "Code"},
		{"Afghanistan", "AS"},
		{"Algeria", "DZ"},
	})

	j := &Job{
		ID: "test-table", OriginalPath: orig, ChangedPath: changed, StorePath: dbPath,
		Options: Options{Mode: "table", HeaderRow: 1},
	}
	Run(context.Background(), j)
	if j.Status != StatusCompleted {
		t.Fatalf("status = %s (%s), want completed", j.Status, j.Error)
	}
	if j.Summary.ModifiedRows != 1 || j.Summary.DeletedRows != 1 || j.Summary.MatchedRows != 1 {
		t.Fatalf("summary = %+v, want modified=1 deleted=1 matched=1", j.Summary)
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
	if total != 3 {
		t.Fatalf("total = %d, want 3", total)
	}
	// Header row must not be compared as data row 1.
	if rows[0].RowNumber == 1 && rows[0].Status != "deleted" && rows[0].Status != "modified" && rows[0].Status != "added" {
		t.Fatalf("unexpected first result row: %+v", rows[0])
	}
	var sawDel, sawMod, sawMatch bool
	for _, r := range rows {
		switch r.Status {
		case "deleted":
			sawDel = true
		case "modified":
			sawMod = true
			if len(r.Changes) != 1 || r.Changes[0].Ref != "B1" {
				t.Fatalf("modified changes = %+v, want B1", r.Changes)
			}
		case "equal":
			sawMatch = true
		}
	}
	if !sawDel || !sawMod || !sawMatch {
		t.Fatalf("want deleted+modified+equal rows, got %+v", rows)
	}
}

func TestRunTableModeInsertAndReorder(t *testing.T) {
	dir := t.TempDir()
	orig := filepath.Join(dir, "o.csv")
	changed := filepath.Join(dir, "c.csv")
	dbPath := filepath.Join(dir, "r.db")

	// Original: 3 data rows keyed by "Name".
	writeCSV(t, orig, [][]string{
		{"Name", "Code"},
		{"Afghanistan", "AF"},
		{"Albania", "AL"},
		{"Algeria", "DZ"},
	})
	// Changed: inserts "Andorra" mid-file, reorders Code/Name columns.
	writeCSV(t, changed, [][]string{
		{"Code", "Name"},
		{"AF", "Afghanistan"},
		{"AD", "Andorra"},
		{"AL", "Albania"},
		{"DZ", "Algeria"},
	})

	j := &Job{
		ID: "test-insert", OriginalPath: orig, ChangedPath: changed, StorePath: dbPath,
		Options: Options{Mode: "table", HeaderRow: 1, RowKeyColumn: "Name"},
	}
	Run(context.Background(), j)
	if j.Status != StatusCompleted {
		t.Fatalf("status = %s (%s), want completed", j.Status, j.Error)
	}
	if j.Summary.ModifiedRows != 0 || j.Summary.AddedRows != 1 || j.Summary.MatchedRows != 3 {
		t.Fatalf("summary = %+v, want added=1 matched=3", j.Summary)
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
		t.Fatalf("total = %d, want 4 (3 matched + 1 added, no row overwritten)", total)
	}
	var sawAdd, sawMatch bool
	var addRowNumber int
	for _, r := range rows {
		if r.Status == "added" {
			sawAdd = true
			addRowNumber = r.RowNumber
		}
		if r.Status == "equal" {
			sawMatch = true
		}
	}
	if !sawAdd || !sawMatch {
		t.Fatalf("want added+equal rows, got %+v", rows)
	}
	_ = addRowNumber
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
