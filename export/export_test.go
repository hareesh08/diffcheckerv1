package export

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/xuri/excelize/v2"

	"diffchecker/job"
	"diffchecker/store"
)

func TestSanitizeName(t *testing.T) {
	cases := map[string]string{
		"Office Laptops - Final Shortlist": "Office-Laptops-Final-Shortlist",
		"   leading and trailing  ":        "leading-and-trailing",
		"ümläut & special chars!":          "ml-ut-special-chars",
		"":                                 "diff",
	}
	for in, want := range cases {
		if got := SanitizeName(in); got != want {
			t.Errorf("SanitizeName(%q) = %q, want %q", in, got, want)
		}
	}
}

// runJob runs a small comparison and returns its results DB.
func runJob(t *testing.T) (*store.DB, string) {
	t.Helper()
	dir := t.TempDir()
	orig := filepath.Join(dir, "a.csv")
	changed := filepath.Join(dir, "b.csv")
	dbPath := filepath.Join(dir, "r.db")

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

	j := &job.Job{
		ID: "test-export", OriginalPath: orig, ChangedPath: changed, StorePath: dbPath,
		Options: job.Options{Mode: "rows"},
	}
	job.Run(context.Background(), j)
	if j.Status != job.StatusCompleted {
		t.Fatalf("job failed: %s", j.Error)
	}
	db, err := store.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db, j.ID
}

func writeCSV(t *testing.T, path string, lines [][]string) {
	t.Helper()
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	for _, l := range lines {
		if _, err := f.WriteString(strings.Join(l, ",") + "\n"); err != nil {
			t.Fatal(err)
		}
	}
}

func TestWriteCSV(t *testing.T) {
	db, id := runJob(t)
	var buf bytes.Buffer
	if err := WriteCSV(&buf, db, id, "nonmatches"); err != nil {
		t.Fatal(err)
	}
	out := buf.String()
	if !strings.Contains(out, "AF") || !strings.Contains(out, "AS") || !strings.Contains(out, "modified") {
		t.Fatalf("csv missing expected content:\n%s", out)
	}
}

func TestWriteJSONL(t *testing.T) {
	db, id := runJob(t)
	var buf bytes.Buffer
	if err := WriteJSONL(&buf, db, id, "all"); err != nil {
		t.Fatal(err)
	}
	out := buf.String()
	if !strings.Contains(out, `"rowNumber":1`) {
		t.Fatalf("jsonl missing row 1:\n%s", out)
	}
}

func TestWriteXLSX(t *testing.T) {
	db, id := runJob(t)
	var buf bytes.Buffer
	if err := WriteXLSX(&buf, db, id, "all"); err != nil {
		t.Fatal(err)
	}
	f, err := excelize.OpenReader(&buf)
	if err != nil {
		t.Fatalf("cannot reopen xlsx: %v", err)
	}
	defer f.Close()
	sheets := f.GetSheetList()
	if len(sheets) != 2 {
		t.Fatalf("expected 2 sheets, got %v", sheets)
	}
	// Diff sheet has header + rows.
	rows, err := f.GetRows("Diff")
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) < 2 {
		t.Fatalf("diff sheet too small: %v", rows)
	}
}

func TestWriteReport(t *testing.T) {
	db, id := runJob(t)
	var buf bytes.Buffer
	if err := WriteReport(&buf, db, id, "nonmatches", "My Report", "a.csv", "b.csv"); err != nil {
		t.Fatal(err)
	}
	out := buf.String()
	if !strings.Contains(out, "My Report") || !strings.Contains(out, "<table") {
		t.Fatalf("report missing expected markup:\n%s", out)
	}
}
