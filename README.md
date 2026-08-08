# Differ Pro

Local web app for comparing text and spreadsheet files side-by-side, built with Go.

Author: Hareesh D

## Run

```
go run .
```

Open http://localhost:8080 in your browser.

## Features

### Text
- Side-by-side diff using the Myers algorithm (shortest edit script)
- Paste two texts and compare

### Excel / CSV (large-file friendly)
- Compare CSV, TSV, TXT, XLSX, XLSM files
- **Streaming, disk-backed comparison** — files up to 4 GB are processed one row at a time; results go to SQLite, never fully in memory
- Asynchronous jobs with live progress and cancellation
- Cell-level diffs with old → new values
- Ignore white space / ignore case options
- Filter results: All, Matches, Non-matches, Modified, Added, Deleted
- Paginated results (never loads the whole diff into the browser)
- Export results as CSV or JSONL (matches or non-matches)

## API

| Endpoint | Method | Description |
|---|---|---|
| `/api/diff` | POST | Text diff `{original, changed}` |
| `/api/upload` | POST | Multipart file upload, returns `{id, path, name, size}` |
| `/api/sheets` | POST | List sheets `{path}` |
| `/api/jobs` | POST | Create comparison job `{originalPath, changedPath, options}` |
| `/api/jobs/{id}/status` | GET | Job status + summary + progress |
| `/api/jobs/{id}/rows` | GET | Paginated rows `?filter=&page=&pageSize=` |
| `/api/jobs/{id}/cancel` | POST | Cancel running job |
| `/api/jobs/{id}/export` | POST | Export `{filter, format}` (csv/jsonl) |

### Job options

```json
{
  "mode": "rows",
  "originalSheet": "Sheet1",
  "changedSheet": "Sheet1",
  "ignoreWhitespace": false,
  "ignoreCase": false,
  "hideUnchangedRows": false,
  "hideUnchangedColumns": false,
  "preserveFormatting": true
}
```

## Structure

```
main.go            HTTP server + API
diff/diff.go       Myers text diff
parse/             Streaming readers (CSV/TSV/TXT, XLSX/XLSM)
job/               Async comparison job engine + runner
store/             SQLite-backed result store (batched writes)
static/index.html  Web UI
```

## Tests

```
go test ./...
```

Large files are handled by streaming readers (no `ReadAll`/`GetRows`) and batched SQLite transactions (5000-row batches).

## Format support

| Format | Streaming |
|---|---|
| CSV / TSV / TXT | ✅ |
| XLSX / XLSM | ✅ |
| XLS / XLSB / ODS | ❌ (not yet) |
