package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"diffchecker/diff"
	"diffchecker/job"
	"diffchecker/parse"
	"diffchecker/store"

	"github.com/google/uuid"
)

const maxUploadBytes = 4 << 30 // 4 GB

var registry = job.NewRegistry()
var uploadsDir = "./uploads"
var jobsDir = "./jobs"

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
	var req diffRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	ops := diff.Myers(splitLines(req.Original), splitLines(req.Changed))
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(diffResponse{Ops: ops})
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

	os.MkdirAll(uploadsDir, 0755)
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
	json.NewEncoder(w).Encode(uploadResponse{
		ID:   id,
		Path: dstPath,
		Name: header.Filename,
		Size: n,
	})
}

func handleSheets(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	ext := strings.ToLower(filepath.Ext(req.Path))
	if ext == ".csv" || ext == ".tsv" || ext == ".txt" {
		json.NewEncoder(w).Encode(struct {
			Sheets []string `json:"sheets"`
		}{[]string{"Sheet1"}})
		return
	}
	names, err := parse.SheetNames(req.Path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(struct {
		Sheets []string `json:"sheets"`
	}{names})
}

func handleCreateJob(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		OriginalPath string `json:"originalPath"`
		ChangedPath  string `json:"changedPath"`
		SheetName    string `json:"sheetName"`
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

	os.MkdirAll(jobsDir, 0755)
	j := registry.New(req.Options, filepath.Base(req.OriginalPath), filepath.Base(req.ChangedPath),
		req.OriginalPath, req.ChangedPath, "")
	// create job dir
	jobDir := filepath.Join(jobsDir, j.ID)
	os.MkdirAll(jobDir, 0755)
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
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"jobId": j.ID})
}

func handleJobStatus(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/jobs/")
	id = strings.TrimSuffix(id, "/status")
	j, ok := registry.Get(id)
	if !ok {
		http.Error(w, "job not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(j.Snapshot())
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
	id := strings.TrimPrefix(r.URL.Path, "/api/jobs/")
	id = strings.TrimSuffix(id, "/rows")
	j, ok := registry.Get(id)
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
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"filter":    filter,
		"page":      page,
		"pageSize":  pageSize,
		"totalRows": total,
		"rows":      rows,
	})
}

func handleExport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/api/jobs/")
	id = strings.TrimSuffix(id, "/export")
	j, ok := registry.Get(id)
	if !ok {
		http.Error(w, "job not found", http.StatusNotFound)
		return
	}
	var req struct {
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
	db, err := store.Open(j.StorePath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	switch req.Format {
	case "csv":
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", "attachment; filename=diff-"+req.Filter+".csv")
		w.Write([]byte("status,row,ref,old,new,type\n"))
		if err := db.Export(j.ID, req.Filter, w); err != nil {
			return
		}
	case "jsonl":
		w.Header().Set("Content-Type", "application/x-ndjson")
		w.Header().Set("Content-Disposition", "attachment; filename=diff-"+req.Filter+".jsonl")
		rows, _, err := db.Results(j.ID, req.Filter, 0, int(^uint(0)>>1))
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		for _, row := range rows {
			b, _ := json.Marshal(row)
			w.Write(append(b, '\n'))
		}
	default:
		http.Error(w, "unsupported format", http.StatusBadRequest)
	}
}

func main() {
	os.MkdirAll(uploadsDir, 0755)
	os.MkdirAll(jobsDir, 0755)
	http.HandleFunc("/api/diff", handleDiff)
	http.HandleFunc("/api/upload", handleUpload)
	http.HandleFunc("/api/sheets", handleSheets)
	http.HandleFunc("/api/jobs", handleCreateJob)
	http.HandleFunc("/api/jobs/", handleJobsSub)
	if hasUIBuild() {
		http.Handle("/", uiHandler())
	} else {
		http.Handle("/", http.FileServer(http.Dir("./static")))
	}
	log.Println("Listening on http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
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
	case strings.HasSuffix(p, "/export"):
		handleExport(w, r)
	default:
		http.Error(w, "not found", http.StatusNotFound)
	}
}
