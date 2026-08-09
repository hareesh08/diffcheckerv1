package export

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"

	"diffchecker/store"
)

// Format is an export file format.
type Format string

const (
	FormatCSV   Format = "csv"
	FormatJSONL Format = "jsonl"
	FormatXLSX  Format = "xlsx"
	FormatPDF   Format = "pdf"
)

var SupportedFormats = []Format{FormatCSV, FormatJSONL, FormatXLSX, FormatPDF}

// Extension returns the file extension for a format.
func Extension(f Format) string {
	switch f {
	case FormatCSV:
		return ".csv"
	case FormatJSONL:
		return ".jsonl"
	case FormatXLSX:
		return ".xlsx"
	case FormatPDF:
		return ".pdf"
	}
	return ".txt"
}

// SanitizeName converts a user-supplied name into a safe file slug.
func SanitizeName(name string) string {
	var b strings.Builder
	lastDash := false
	for _, r := range name {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
			b.WriteRune(r)
			lastDash = false
		case r == ' ', r == '-', r == '_', r == '.', r == '/', r == '\\':
			if !lastDash && b.Len() > 0 {
				b.WriteByte('-')
				lastDash = true
			}
		default:
			if !lastDash && b.Len() > 0 {
				b.WriteByte('-')
				lastDash = true
			}
		}
	}
	s := strings.Trim(b.String(), "-")
	if s == "" {
		s = "diff"
	}
	return s
}

// Results loads a page of result rows (all rows, no limit).
func Results(db *store.DB, jobID, filter string) ([]store.ResultRow, error) {
	rows, _, err := db.Results(jobID, filter, 0, int(^uint(0)>>1))
	return rows, err
}

// WriteCSV streams result changes as a CSV file.
func WriteCSV(w io.Writer, db *store.DB, jobID, filter string) error {
	rows, err := Results(db, jobID, filter)
	if err != nil {
		return err
	}
	cw := csv.NewWriter(w)
	if err := cw.Write([]string{"status", "row", "ref", "old", "new", "type"}); err != nil {
		return err
	}
	for _, r := range rows {
		for _, c := range r.Changes {
			if err := cw.Write([]string{r.Status, fmt.Sprint(r.RowNumber), c.Ref, c.Old, c.New, c.Type}); err != nil {
				return err
			}
		}
	}
	cw.Flush()
	return cw.Error()
}

// WriteJSONL streams result rows as JSON Lines.
func WriteJSONL(w io.Writer, db *store.DB, jobID, filter string) error {
	rows, err := Results(db, jobID, filter)
	if err != nil {
		return err
	}
	for _, r := range rows {
		b, err := json.Marshal(r)
		if err != nil {
			return err
		}
		if _, err := w.Write(append(b, '\n')); err != nil {
			return err
		}
	}
	return nil
}

// WriteXLSX builds an .xlsx workbook with a summary sheet and a diff sheet.
func WriteXLSX(w io.Writer, db *store.DB, jobID, filter string) error {
	rows, err := Results(db, jobID, filter)
	if err != nil {
		return err
	}
	f := excelize.NewFile()

	summary, _ := f.NewSheet("Summary")
	f.SetCellValue("Summary", "A1", "Diff summary")
	f.SetCellValue("Summary", "A2", "Filter")
	f.SetCellValue("Summary", "B2", filter)
	f.SetCellValue("Summary", "A3", "Total rows")
	f.SetCellValue("Summary", "B3", len(rows))
	f.SetActiveSheet(summary)

	sheet := "Diff"
	f.SetSheetName("Sheet1", sheet)
	f.SetCellValue(sheet, "A1", "status")
	f.SetCellValue(sheet, "B1", "row")
	f.SetCellValue(sheet, "C1", "ref")
	f.SetCellValue(sheet, "D1", "old")
	f.SetCellValue(sheet, "E1", "new")
	f.SetCellValue(sheet, "F1", "type")

	for i, r := range rows {
		rowNum := i + 2
		if len(r.Changes) == 0 {
			f.SetCellValue(sheet, fmt.Sprintf("A%d", rowNum), r.Status)
			f.SetCellValue(sheet, fmt.Sprintf("B%d", rowNum), r.RowNumber)
			continue
		}
		start := rowNum
		for j, c := range r.Changes {
			rr := start + j
			f.SetCellValue(sheet, fmt.Sprintf("A%d", rr), r.Status)
			f.SetCellValue(sheet, fmt.Sprintf("B%d", rr), r.RowNumber)
			f.SetCellValue(sheet, fmt.Sprintf("C%d", rr), c.Ref)
			f.SetCellValue(sheet, fmt.Sprintf("D%d", rr), c.Old)
			f.SetCellValue(sheet, fmt.Sprintf("E%d", rr), c.New)
			f.SetCellValue(sheet, fmt.Sprintf("F%d", rr), c.Type)
		}
	}

	f.DeleteSheet("Sheet1")
	return f.Write(w)
}

// ReportRow is a flattened change row used by the HTML report.
type ReportRow struct {
	Status  string
	Row     int
	Changes []store.Change
	Old     string
	New     string
}

// WriteReport streams a styled HTML report for the browser to print as PDF.
func WriteReport(w io.Writer, db *store.DB, jobID, filter, title, origName, changedName string) error {
	rows, err := Results(db, jobID, filter)
	if err != nil {
		return err
	}
	var reportRows []ReportRow
	for _, r := range rows {
		rr := ReportRow{Status: r.Status, Row: r.RowNumber, Changes: r.Changes}
		for _, c := range r.Changes {
			rr.Old = c.Old
			rr.New = c.New
			break
		}
		reportRows = append(reportRows, rr)
	}

	fmt.Fprintf(w, `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>%s</title>
<style>
* { box-sizing: border-box; }
body { font-family: "Segoe UI", Arial, sans-serif; color: #111; margin: 32px; }
h1 { font-size: 22px; margin: 0 0 4px; }
.sub { color: #666; font-size: 13px; margin-bottom: 24px; }
table { border-collapse: collapse; width: 100%%; font-size: 12px; }
th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
th { background: #f4f4f4; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
.modified td { background: #fff8e1; }
.added td { background: #e8f5e9; }
.deleted td { background: #ffebee; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 11px; }
.badge.modified { background: #ffeb3b; }
.badge.added { background: #4caf50; color: #fff; }
.badge.deleted { background: #f44336; color: #fff; }
.badge.equal { background: #e0e0e0; }
.footer { margin-top: 24px; color: #888; font-size: 11px; }
</style></head><body>
<h1>%s</h1>
<p class="sub">%s &rarr; %s &middot; Filter: %s &middot; Generated %s</p>
<table><thead><tr><th>Row</th><th>Status</th><th>Ref</th><th>Old</th><th>New</th></tr></thead><tbody>
`,
		html.EscapeString(title),
		html.EscapeString(title),
		html.EscapeString(origName),
		html.EscapeString(changedName),
		html.EscapeString(filter),
		time.Now().Format("2006-01-02 15:04"))

	for _, r := range reportRows {
		class := ""
		if r.Status == "modified" || r.Status == "added" || r.Status == "deleted" {
			class = r.Status
		}
		fmt.Fprintf(w, `<tr class="%s"><td>%d</td><td><span class="badge %s">%s</span></td><td>%s</td><td>%s</td><td>%s</td></tr>`,
			class, r.Row, class, html.EscapeString(r.Status), html.EscapeString(refOr(r)), html.EscapeString(r.Old), html.EscapeString(r.New))
	}

	fmt.Fprintf(w, `</tbody></table>
<p class="footer">Generated by Differ Pro</p>
</body></html>`)
	return nil
}

func refOr(r ReportRow) string {
	if len(r.Changes) > 0 {
		return r.Changes[0].Ref
	}
	return ""
}
