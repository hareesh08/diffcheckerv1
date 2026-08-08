# DiffChecker React UI Plan

## Goal
Rebuild UI in React, pre-built to static files, embedded into Go binary via `go:embed`. Single exe, zero runtime dependencies.

## 3 Screens

### Screen 1: Upload (Text tab)
- Two side-by-side textareas
- Find Difference / Swap / Clear buttons
- Side-by-side diff result with line numbers

### Screen 2: Upload (Excel tab)
- Green info banner: "Compare Excel files and other spreadsheets"
- Two dashed-border drop zones: Excel icon + "Drop Excel here" + Browse
- Desktop promo card on right

### Screen 3: Configure (files loaded)
- File previews with spreadsheet-style grid (col headers A-F, row numbers)
- Sheet selector + Header line input per side
- Ignore WS / Ignore Case toggles
- Mode cards: Table (header-based) vs Rows (sequential)
- Green "Find difference" button

### Screen 4: Results
- Left sidebar: Tools (toggles, sort, normalize dates)
- Center: Spreadsheet diff with Redline/Original/Changed view
- Right panel: Changes list (cell refs + old/new values)
- Stats bar: Modified (orange) / Added (green) / Deleted (blue)
- Pagination + Export CSV/JSONL

## File Structure
```
web/
├── package.json
├── vite.config.js
├── index.html
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── App.css
│   ├── api.js
│   ├── components/
│   │   ├── Header.jsx
│   │   ├── UploadZone.jsx
│   │   ├── FilePreview.jsx
│   │   ├── SheetSelector.jsx
│   │   ├── ModeCard.jsx
│   │   ├── ProgressBar.jsx
│   │   ├── ToolsSidebar.jsx
│   │   ├── DiffSpreadsheet.jsx
│   │   ├── ChangesList.jsx
│   │   └── StatsBar.jsx
│   └── styles/
│       └── variables.css
└── dist/           ← Vite output → go:embed
```

## API Layer
```js
uploadFile(file)              // POST /api/upload
getSheets(path)               // POST /api/sheets
createJob(body)               // POST /api/jobs
getJobStatus(jobId)           // GET /api/jobs/{id}/status
getJobRows(jobId, params)     // GET /api/jobs/{id}/rows
cancelJob(jobId)              // POST /api/jobs/{id}/cancel
exportResults(jobId, f, fmt)  // POST /api/jobs/{id}/export
textDiff(original, changed)   // POST /api/diff
```

## Go Integration
```go
//go:embed web/dist/*
var staticFiles embed.FS

func main() {
    // ... existing API routes ...
    sub, _ := fs.Sub(staticFiles, "web/dist")
    http.Handle("/", http.FileServer(http.FS(sub)))
}
```

## Build Steps
```bash
cd web && npm install && npm run build
cd .. && go build -o diffchecker.exe .
```

## Design Tokens
| Token | Value | Usage |
|---|---|---|
| --primary | #2EC4B6 | Buttons, active tab |
| --bg | #FFFFFF | Page background |
| --text | #1A202C | Primary text |
| --text-muted | #718096 | Labels |
| --border | #E2E8F0 | Borders |
| --modified-bg | #FFF5F5 | Modified row |
| --added-bg | #F0FFF4 | Added row |
| --font | system-ui | Body |
| --font-mono | SF Mono, Consolas | Cells |

## State Machine
App.jsx manages 3 states:
1. **upload** — drop zones visible
2. **config** — previews + selectors + mode
3. **results** — spreadsheet diff + tools + changes

No client-side router needed. Simple `useState` transitions.
