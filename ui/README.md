# Differ Pro UI

React + TypeScript single-page app for Differ Pro. Built with Vite, React 19, and Tailwind CSS 4.

## Development

```sh
npm install
npm run dev      # Vite dev server
npm run build    # Production build into dist/
```

The production bundle in `dist/` is embedded into the Go binary at compile time via `go:embed` (see the root `embed.go`). A fresh build is required before rebuilding the desktop app so the binary ships the latest UI.

## Source layout

```
src/
  App.tsx                  Root shell: sidebar, routing between screens
  api.ts                   Typed HTTP client for the backend API
  components/
    screens/               High-level screens (Compare, Hub, Settings)
    diff/                  Diff screens (Results, History, Exports, TextDiffView)
    shared/                Command palette, empty state, filter bar, terminal
    ui/                    Local shadcn/ui-style primitives
  hooks/                   use-keyboard, use-mobile, use-theme
  lib/                     text-diff, utils
  styles.css               Global styles + design tokens
```
