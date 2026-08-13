package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"diffchecker/central"
	"diffchecker/diff"
	"diffchecker/export"
	"diffchecker/job"
	"diffchecker/parse"
	"diffchecker/store"

	"github.com/google/uuid"
	"github.com/jchv/go-webview2"
)

const maxUploadBytes = 4 << 30 // 4 GB

var registry = job.NewRegistry()
var uploadsDir = "./uploads"
var jobsDir = "./jobs"
var dataDir = "./data"
var centralDB *central.DB
var httpServer *http.Server
var enableLogs atomic.Bool
var logBufferMu sync.Mutex
var logBuffer []string
const maxLogEntries = 500

type AppSettings struct {
	Logs      bool   `json:"logs"`
	BindMode  string `json:"bindMode"` // "local" | "network"
}
var appSettings = AppSettings{Logs: false, BindMode: "local"}
var settingsMu sync.Mutex

type diffRequest struct {
	Original string `json:"original"`
	Changed  string `json:"changed"`
}

type diffResponse struct {
	Ops []diff.Op `json:"ops"`
}

type uploadResponse struct {
	ID   string `json:"id"`
	Path string `json:"path"`
	Name string `json:"name"`
	Size int64  `json:"size"`
}

func isLocalhost(r *http.Request) bool {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return false
	}
	return host == "127.0.0.1" || host == "::1"
}

func encodeJSON(w http.ResponseWriter, v any) bool {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("json encode error: %v", err)
		http.Error(w, "encode error", http.StatusInternalServerError)
		return false
	}
	return true
}

func safeMkdirAll(path string, perm os.FileMode) error {
	if err := os.MkdirAll(path, perm); err != nil {
		return fmt.Errorf("mkdir %s: %w", path, err)
	}
	return nil
}

func safeMaxBytes(r *http.Request) error {
	if r.Body == nil {
		return nil
	}
	r.Body = http.MaxBytesReader(nil, r.Body, maxUploadBytes)
	return nil
}

func splitLines(s string) []string {
	if s == "" {
		return nil
	}
	return strings.Split(strings.ReplaceAll(s, "\r\n", "\n"), "\n")
}

func handleDiff(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if err := safeMaxBytes(r); err != nil {
		http.Error(w, "request too large", http.StatusRequestEntityTooLarge)
		return
	}
	var req diffRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	ops := diff.Myers(splitLines(req.Original), splitLines(req.Changed))
	encodeJSON(w, diffResponse{Ops: ops})
}

func handleUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBytes)
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		http.Error(w, "file too large or bad multipart: "+err.Error(), http.StatusBadRequest)
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "no file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	switch ext {
	case ".xlsx", ".xlsm", ".csv", ".tsv", ".txt":
		// supported
	default:
		http.Error(w, "unsupported file format (csv, tsv, txt, xlsx, xlsm): "+ext, http.StatusBadRequest)
		return
	}

	if err := safeMkdirAll(uploadsDir, 0755); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	id := uuid.NewString()
	dstPath := filepath.Join(uploadsDir, id+ext)
	dst, err := os.Create(dstPath)
	if err != nil {
		http.Error(w, "cannot save file", http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	n, err := io.Copy(dst, file)
	if err != nil {
		http.Error(w, "upload failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	encodeJSON(w, uploadResponse{
		ID:   id,
		Name: header.Filename,
		Size: n,
	})
}

func handleSheets(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if err := safeMaxBytes(r); err != nil {
		http.Error(w, "request too large", http.StatusRequestEntityTooLarge)
		return
	}
	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if req.Path == "" {
		http.Error(w, "path required", http.StatusBadRequest)
		return
	}
	abs, err := filepath.Abs(req.Path)
	if err != nil {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}
	uploadsAbs, _ := filepath.Abs(uploadsDir)
	rel, err := filepath.Rel(uploadsAbs, abs)
	if err != nil || strings.HasPrefix(rel, "..") || filepath.IsAbs(rel) {
		http.Error(w, "path must be inside uploads", http.StatusBadRequest)
		return
	}
	ext := strings.ToLower(filepath.Ext(req.Path))
	if ext == ".csv" || ext == ".tsv" || ext == ".txt" {
		encodeJSON(w, struct {
			Sheets []string `json:"sheets"`
		}{[]string{"Sheet1"}})
		return
	}
	names, err := parse.SheetNames(req.Path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	encodeJSON(w, struct {
		Sheets []string `json:"sheets"`
	}{names})
}

func handleCreateJob(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if err := safeMaxBytes(r); err != nil {
		http.Error(w, "request too large", http.StatusRequestEntityTooLarge)
		return
	}
	var req struct {
		OriginalPath string      `json:"originalPath"`
		ChangedPath  string      `json:"changedPath"`
		OriginalName string      `json:"originalName"`
		ChangedName  string      `json:"changedName"`
		SheetName    string      `json:"sheetName"`
		Options      job.Options `json:"options"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if req.OriginalPath == "" || req.ChangedPath == "" {
		http.Error(w, "both files required", http.StatusBadRequest)
		return
	}

	for _, p := range []string{req.OriginalPath, req.ChangedPath} {
		abs, err := filepath.Abs(p)
		if err != nil {
			http.Error(w, "invalid path", http.StatusBadRequest)
			return
		}
		uploadsAbs, _ := filepath.Abs(uploadsDir)
		rel, err := filepath.Rel(uploadsAbs, abs)
		if err != nil || strings.HasPrefix(rel, "..") || filepath.IsAbs(rel) {
			http.Error(w, "path must be inside uploads", http.StatusBadRequest)
			return
		}
	}

	origName := req.OriginalName
	if origName == "" {
		origName = filepath.Base(req.OriginalPath)
	}
	changedName := req.ChangedName
	if changedName == "" {
		changedName = filepath.Base(req.ChangedPath)
	}

	if err := safeMkdirAll(jobsDir, 0755); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	j := registry.New(req.Options, origName, changedName,
		req.OriginalPath, req.ChangedPath, "")
	// create job dir
	jobDir := filepath.Join(jobsDir, j.ID)
	if err := safeMkdirAll(jobDir, 0755); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	j.StorePath = filepath.Join(jobDir, "results.db")

	ctx, _ := registry.Cancellable(j.ID)
	go func() {
		defer func() {
			if rec := recover(); rec != nil {
				j.Update(func(jj *job.Job) {
					jj.Status = job.StatusFailed
					jj.Error = fmt.Sprintf("panic: %v", rec)
					jj.CompletedAt = time.Now()
				})
			}
		}()
		job.Run(ctx, j)
	}()
	encodeJSON(w, map[string]string{"jobId": j.ID})
}

func handleJobStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/api/jobs/")
	id = strings.TrimSuffix(id, "/status")
	j, ok := findJob(id)
	if !ok {
		http.Error(w, "job not found", http.StatusNotFound)
		return
	}
	encodeJSON(w, j.Snapshot())
}

func handleJobCancel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/api/jobs/")
	id = strings.TrimSuffix(id, "/cancel")
	registry.Cancel(id)
	w.WriteHeader(http.StatusOK)
}

func handleJobRows(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/api/jobs/")
	id = strings.TrimSuffix(id, "/rows")
	j, ok := findJob(id)
	if !ok {
		http.Error(w, "job not found", http.StatusNotFound)
		return
	}
	db, err := store.Open(j.StorePath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	filter := r.URL.Query().Get("filter")
	if filter == "" {
		filter = "all"
	}
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("pageSize"))
	if pageSize < 1 {
		pageSize = 100
	}
	if pageSize > 1000 {
		pageSize = 1000
	}

	rows, total, err := db.Results(j.ID, filter, page-1, pageSize)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	oCol, nCol, _ := db.Columns(j.ID)
	var columns map[string]any
	if oCol != nil || nCol != nil {
		columns = map[string]any{
			"original": oCol,
			"changed":  nCol,
		}
	}
	encodeJSON(w, map[string]any{
		"filter":    filter,
		"page":      page,
		"pageSize":  pageSize,
		"totalRows": total,
		"rows":      rows,
		"columns":   columns,
	})
}

func handleExport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/api/jobs/")
	id = strings.TrimSuffix(id, "/export")
	j, ok := findJob(id)
	if !ok {
		http.Error(w, "job not found", http.StatusNotFound)
		return
	}
	var req struct {
		Name   string `json:"name"`
		Filter string `json:"filter"`
		Format string `json:"format"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if req.Format == "" {
		req.Format = "csv"
	}
	if req.Name == "" {
		req.Name = j.OriginalName + "-vs-" + j.ChangedName
	}
	name := export.SanitizeName(req.Name)
	db, err := store.Open(j.StorePath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	// Record the export in history.
	if centralDB != nil {
		if err := centralDB.AddExport(central.Export{
			JobID:  j.ID,
			Name:   name,
			Format: req.Format,
			Filter: req.Filter,
		}); err != nil {
			log.Printf("warning: cannot record export: %v", err)
		}
	}

	switch export.Format(req.Format) {
	case export.FormatCSV:
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", "attachment; filename="+name+".csv")
		if err := export.WriteCSV(w, db, j.ID, req.Filter); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	case export.FormatJSONL:
		w.Header().Set("Content-Type", "application/x-ndjson")
		w.Header().Set("Content-Disposition", "attachment; filename="+name+".jsonl")
		if err := export.WriteJSONL(w, db, j.ID, req.Filter); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	case export.FormatXLSX:
		w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
		w.Header().Set("Content-Disposition", "attachment; filename="+name+".xlsx")
		if err := export.WriteXLSX(w, db, j.ID, req.Filter); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	case export.FormatPDF:
		// PDF is delivered as an HTML report the browser prints to PDF.
		w.Header().Set("Content-Type", "text/html")
		w.Header().Set("Content-Disposition", "attachment; filename="+name+".html")
		if err := export.WriteReport(w, db, j.ID, req.Filter, req.Name, j.OriginalName, j.ChangedName); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	default:
		http.Error(w, "unsupported format", http.StatusBadRequest)
	}
}

// handleReport serves a styled HTML report for a job (for print-to-PDF).
func handleReport(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/jobs/")
	id = strings.TrimSuffix(id, "/report")
	j, ok := findJob(id)
	if !ok {
		http.Error(w, "job not found", http.StatusNotFound)
		return
	}
	filter := r.URL.Query().Get("filter")
	if filter == "" {
		filter = "all"
	}
	db, err := store.Open(j.StorePath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()
	title := j.OriginalName + " vs " + j.ChangedName
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := export.WriteReport(w, db, j.ID, filter, title, j.OriginalName, j.ChangedName); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
}

// findJob returns a live in-memory job if present, otherwise reconstructs a
// terminal (completed/failed) job from the persisted central store and the
// on-disk results database. This lets history items be reopened after the
// owning job has left the live in-memory registry (e.g. after a restart or
// once the process moved on).
func findJob(id string) (*job.Job, bool) {
	if j, ok := registry.Get(id); ok {
		return j, true
	}
	if centralDB == nil {
		return nil, false
	}
	hj, err := centralDB.GetJob(id)
	if err != nil {
		return nil, false
	}
	if hj.Status != string(job.StatusCompleted) && hj.Status != string(job.StatusFailed) {
		// Only persisted terminal jobs have reusable results.
		return nil, false
	}
	var opts job.Options
	if err := json.Unmarshal([]byte(hj.Meta), &opts); err != nil {
		return nil, false
	}
	var summary job.Summary
	if err := json.Unmarshal([]byte(hj.Summary), &summary); err != nil {
		return nil, false
	}
	return &job.Job{
		ID:           hj.ID,
		Status:       job.Status(hj.Status),
		Mode:         hj.Mode,
		OriginalName: hj.OriginalName,
		ChangedName:  hj.ChangedName,
		Options:      opts,
		Summary:      summary,
		StorePath:    store.JobDBPath(jobsDir, hj.ID),
		CreatedAt:    hj.CreatedAt,
		CompletedAt:  hj.CompletedAt,
	}, true
}

// requireCentral ensures the central DB is available, else 503.
func requireCentral(w http.ResponseWriter) bool {
	if centralDB == nil {
		http.Error(w, "central store unavailable", http.StatusServiceUnavailable)
		return false
	}
	return true
}

// handleHistoryList GET /api/history
func handleHistoryList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !requireCentral(w) {
		return
	}
	jobs, err := centralDB.ListJobs()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	encodeJSON(w, map[string]any{"jobs": jobs})
}

// handleHistorySub handles /api/history/{id}/name and DELETE /api/history/{id}
func handleHistorySub(w http.ResponseWriter, r *http.Request) {
	if !requireCentral(w) {
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/api/history/")
	switch {
	case strings.HasSuffix(r.URL.Path, "/name") && r.Method == http.MethodPost:
		id = strings.TrimSuffix(id, "/name")
		var req struct{ Name string `json:"name"` }
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		if err := centralDB.RenameJob(id, req.Name); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		encodeJSON(w, map[string]string{"status": "ok"})
	case r.Method == http.MethodDelete:
		if err := centralDB.DeleteJob(id); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		encodeJSON(w, map[string]string{"status": "ok"})
	default:
		http.Error(w, "not found", http.StatusNotFound)
	}
}

// handleJobsFinalize POST /api/jobs/{id}/finalize persists a completed job.
func handleJobsFinalize(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/api/jobs/")
	id = strings.TrimSuffix(id, "/finalize")
	if !requireCentral(w) {
		return
	}
	j, ok := registry.Get(id)
	if !ok {
		http.Error(w, "job not found", http.StatusNotFound)
		return
	}
	snap := j.Snapshot()
	if snap.Status != job.StatusCompleted {
		http.Error(w, "job not completed", http.StatusBadRequest)
		return
	}
	name := snap.OriginalName + " vs " + snap.ChangedName
	err := centralDB.SaveJob(central.HistoryJob{
		ID:           snap.ID,
		Name:         name,
		Mode:         snap.Mode,
		OriginalName: snap.OriginalName,
		ChangedName:  snap.ChangedName,
		Status:       string(snap.Status),
		Summary:      central.JSON(snap.Summary),
		Meta:         central.JSON(snap.Options),
		CreatedAt:    snap.CreatedAt,
		CompletedAt:  snap.CompletedAt,
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	encodeJSON(w, map[string]string{"status": "saved"})
}


// handleExportsList GET /api/exports
func handleExportsList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !requireCentral(w) {
		return
	}
	exports, err := centralDB.ListExports()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	encodeJSON(w, map[string]any{"exports": exports})
}

// handleExportsDelete DELETE /api/exports/{id}
func handleExportsDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !requireCentral(w) {
		return
	}
	idStr := strings.TrimPrefix(r.URL.Path, "/api/exports/")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := centralDB.DeleteExport(id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	encodeJSON(w, map[string]any{"status": "deleted"})
}

func initDPIAware() {
	user32 := syscall.NewLazyDLL("user32.dll")
	setProcessDpiAwarenessContext := user32.NewProc("SetProcessDpiAwarenessContext")
	// DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = -4 (as opaque pointer)
	setProcessDpiAwarenessContext.Call(uintptr(0xFFFFFFFFFFFFFFFC))
}

func main() {
	initDPIAware()
	local := flag.Bool("local", true, "bind to localhost only (default)")
	network := flag.String("network", "", "bind address (e.g. 0.0.0.0 for all interfaces, overrides --local)")
	logsFlag := flag.Bool("logs", false, "enable verbose request logging")
	flag.Parse()

	if err := safeMkdirAll(uploadsDir, 0755); err != nil {
		log.Fatalf("cannot create uploads dir: %v", err)
	}
	if err := safeMkdirAll(jobsDir, 0755); err != nil {
		log.Fatalf("cannot create jobs dir: %v", err)
	}
	if err := safeMkdirAll(dataDir, 0755); err != nil {
		log.Fatalf("cannot create data dir: %v", err)
	}
	loadSettings()

	if *logsFlag {
		enableLogs.Store(true)
	} else if appSettings.Logs {
		enableLogs.Store(true)
	}

	var bindHost string
	if *network != "" {
		bindHost = *network
	} else if appSettings.BindMode == "network" {
		bindHost = "0.0.0.0"
	} else if *local {
		bindHost = "127.0.0.1"
	} else {
		bindHost = "0.0.0.0"
	}

	cDB, err := central.Open(filepath.Join(dataDir, "differ.db"))
	if err != nil {
		log.Printf("warning: cannot open central db: %v", err)
	} else {
		centralDB = cDB
		defer cDB.Close()
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/diff", handleDiff)
	mux.HandleFunc("/api/upload", handleUpload)
	mux.HandleFunc("/api/sheets", handleSheets)
	mux.HandleFunc("/api/jobs", handleCreateJob)
	mux.HandleFunc("/api/jobs/", handleJobsSub)
	mux.HandleFunc("/api/history", handleHistoryList)
	mux.HandleFunc("/api/history/", handleHistorySub)
	mux.HandleFunc("/api/exports", handleExportsList)
	mux.HandleFunc("/api/exports/", handleExportsDelete)
	mux.HandleFunc("/api/settings", handleSettingsGet)
	mux.HandleFunc("/api/settings/logs", handleSettingsLogs)
	mux.HandleFunc("/api/settings/bind", handleSettingsBindMode)
	mux.HandleFunc("/api/settings/logs/stream", handleSettingsLogsStream)
	mux.HandleFunc("/api/shutdown", handleShutdown)
	mux.HandleFunc("/api/restart", handleRestart)
	if hasUIBuild() {
		mux.Handle("/", uiHandler())
	} else {
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			w.WriteHeader(http.StatusServiceUnavailable)
			io.WriteString(w, "Differ Pro UI not built.\n\nRun `npm run build` in ui/ and rebuild the Go binary.")
		})
	}

	httpServer = &http.Server{
		Addr:         bindHost + ":8080",
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if enableLogs.Load() {
				start := time.Now()
				mux.ServeHTTP(w, r)
				msg := fmt.Sprintf("%s %s %s %s", r.Method, r.URL.Path, r.RemoteAddr, time.Since(start).Round(time.Millisecond))
				log.Print(msg)
				appendLog(msg)
			} else {
				mux.ServeHTTP(w, r)
			}
		}),
	}

	log.Printf("Listening on http://%s:8080", bindHost)
	go func() {
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	runUI("127.0.0.1:8080")

	log.Println("Shutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	httpServer.Shutdown(ctx)
}

// runUI opens a native WebView2 window pointing at the embedded UI. It blocks
// until the window is closed, then the server shuts down. If WebView2 is not
// available (e.g. no runtime installed), it falls back to opening the system
// browser instead.
func runUI(url string) {
	w := webview2.NewWithOptions(webview2.WebViewOptions{
		Debug:     false,
		AutoFocus: true,
		WindowOptions: webview2.WindowOptions{
			Title: "Differ Pro",
		},
	})
	if w == nil {
		openBrowser(url)
		return
	}
	defer w.Destroy()
	w.SetSize(1280, 800, webview2.HintNone)
	w.Navigate("http://" + url)
	w.Run()
}

// openBrowser opens the given URL in the user's default browser.
func openBrowser(url string) {
	cmd := exec.Command("rundll32", "url.dll,FileProtocolHandler", "\"http://"+url+"\"")
	cmd.Start()
}

func appendLog(msg string) {
	logBufferMu.Lock()
	logBuffer = append(logBuffer, msg)
	if len(logBuffer) > maxLogEntries {
		logBuffer = logBuffer[len(logBuffer)-maxLogEntries:]
	}
	logBufferMu.Unlock()
}

func loadSettings() {
	settingsMu.Lock()
	defer settingsMu.Unlock()
	b, err := os.ReadFile(filepath.Join(dataDir, "settings.json"))
	if err != nil {
		return
	}
	if err := json.Unmarshal(b, &appSettings); err != nil {
		log.Printf("warning: cannot parse settings: %v", err)
	}
}

func saveSettings() error {
	settingsMu.Lock()
	defer settingsMu.Unlock()
	b, _ := json.Marshal(appSettings)
	return os.WriteFile(filepath.Join(dataDir, "settings.json"), b, 0644)
}

func handleShutdown(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !isLocalhost(r) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	encodeJSON(w, map[string]string{"status": "shutting down"})
	go func() {
		time.Sleep(200 * time.Millisecond)
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		httpServer.Shutdown(ctx)
	}()
}

func handleRestart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !isLocalhost(r) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	encodeJSON(w, map[string]string{"status": "restarting"})
	go func() {
		time.Sleep(200 * time.Millisecond)
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		httpServer.Shutdown(ctx)
		cmd := exec.Command(os.Args[0], os.Args[1:]...)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		cmd.Start()
	}()
}

func handleSettingsGet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	settingsMu.Lock()
	defer settingsMu.Unlock()
	encodeJSON(w, appSettings)
}

func handleSettingsLogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Enabled bool `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	enableLogs.Store(body.Enabled)
	settingsMu.Lock()
	appSettings.Logs = body.Enabled
	settingsMu.Unlock()
	if err := saveSettings(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	encodeJSON(w, map[string]any{"logs": body.Enabled})
}

func handleSettingsBindMode(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Mode string `json:"mode"` // "local" | "network"
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if body.Mode != "local" && body.Mode != "network" {
		http.Error(w, "invalid mode", http.StatusBadRequest)
		return
	}
	settingsMu.Lock()
	appSettings.BindMode = body.Mode
	settingsMu.Unlock()
	if err := saveSettings(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	encodeJSON(w, map[string]string{"status": "restarting"})
	go func() {
		time.Sleep(200 * time.Millisecond)
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		httpServer.Shutdown(ctx)
		cmd := exec.Command(os.Args[0], os.Args[1:]...)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		cmd.Start()
	}()
}

func handleSettingsLogsStream(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	var lastIdx int
	logBufferMu.Lock()
	lastIdx = len(logBuffer)
	for _, entry := range logBuffer {
		if _, err := fmt.Fprintf(w, "data: %s\n\n", entry); err != nil {
			logBufferMu.Unlock()
			return
		}
	}
	logBufferMu.Unlock()
	flusher.Flush()

	ctx := r.Context()
	ticker := time.NewTicker(300 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			logBufferMu.Lock()
			if lastIdx < len(logBuffer) {
				for i := lastIdx; i < len(logBuffer); i++ {
					if _, err := fmt.Fprintf(w, "data: %s\n\n", logBuffer[i]); err != nil {
						logBufferMu.Unlock()
						return
					}
				}
			lastIdx = len(logBuffer)
		}
		logBufferMu.Unlock()
		flusher.Flush()
	}
	}
}

func handleJobsSub(w http.ResponseWriter, r *http.Request) {
	p := r.URL.Path
	switch {
	case strings.HasSuffix(p, "/status"):
		handleJobStatus(w, r)
	case strings.HasSuffix(p, "/rows"):
		handleJobRows(w, r)
	case strings.HasSuffix(p, "/cancel"):
		handleJobCancel(w, r)
	case strings.HasSuffix(p, "/finalize"):
		handleJobsFinalize(w, r)
	case strings.HasSuffix(p, "/export"):
		handleExport(w, r)
	case strings.HasSuffix(p, "/report"):
		handleReport(w, r)
	default:
		http.Error(w, "not found", http.StatusNotFound)
	}
}
