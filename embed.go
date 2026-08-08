package main

import (
	"bytes"
	"embed"
	"io/fs"
	"net/http"
	"strings"
)

//go:embed all:ui/dist
var uiFS embed.FS

// uiHandler serves the embedded SPA from ui/dist with a fallback to index.html
// for unknown paths (safe for any client-side routing).
func uiHandler() http.Handler {
	sub, err := fs.Sub(uiFS, "ui/dist")
	if err != nil {
		panic(err)
	}
	fileServer := http.FileServer(http.FS(sub))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}
		// If the requested file exists (and is not a directory), serve it.
		if f, err := sub.Open(path); err == nil {
			if info, statErr := f.Stat(); statErr == nil && !info.IsDir() {
				fileServer.ServeHTTP(w, r)
				return
			}
		}
		// Otherwise serve the SPA shell.
		r.URL.Path = "/index.html"
		fileServer.ServeHTTP(w, r)
	})
}

// hasUIBuild reports whether a real ui/dist build (not the placeholder) is present.
// It inspects the EMBEDDED filesystem so the binary is self-contained and its
// behavior never depends on the current working directory. It detects a real Vite
// build by the hashed /assets/ bundle reference rather than by a placeholder marker,
// so no marker string is ever emitted into the compiled binary (a marker literal in
// source would trip CI's binary verification grep).
func hasUIBuild() bool {
	sub, err := fs.Sub(uiFS, "ui/dist")
	if err != nil {
		return false
	}
	b, err := fs.ReadFile(sub, "index.html")
	if err != nil {
		return false
	}
	return bytes.Contains(b, []byte("/assets/"))
}
