import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";

const sections = [
  {
    id: "quick",
    title: "Quick start",
    body: (
      <ol className="list-decimal space-y-1.5 pl-4">
        <li>
          Upload two files — <strong>.xlsx</strong>, <strong>.xlsm</strong>, <strong>.csv</strong>,{" "}
          <strong>.tsv</strong>, or <strong>.txt</strong>.
        </li>
        <li>Choose a sheet per file (if multi-sheet) and a match mode: Table or Rows.</li>
        <li>
          Run the comparison — the engine streams both files row by row and stores results in
          SQLite.
        </li>
        <li>Review changes, filter rows, and export as CSV, JSONL, XLSX, or PDF.</li>
      </ol>
    ),
  },
  {
    id: "modes",
    title: "Match modes",
    body: (
      <div className="space-y-2">
        <div>
          <p className="font-semibold">Table — header based</p>
          <p className="mt-0.5 text-muted-foreground">
            Aligns rows by matching column names. Best when columns move or rows are reordered.
          </p>
        </div>
        <div>
          <p className="font-semibold">Rows — sequential</p>
          <p className="mt-0.5 text-muted-foreground">
            Compares index by index. Best for append-only logs and fixed exports.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "options",
    title: "Options",
    body: (
      <ul className="list-disc space-y-1.5 pl-4">
        <li>
          <strong>Ignore whitespace</strong> — trims and collapses whitespace before comparing.
        </li>
        <li>
          <strong>Ignore case</strong> — compares values case-insensitively.
        </li>
        <li>
          <strong>Header line</strong> — the 1-based row index treated as the header (0 means no
          header).
        </li>
        <li>
          <strong>Filter</strong> — All, Matches, Non-matches, Modified, Added, Deleted.
        </li>
        <li>
          <strong>View</strong> — redline (old → new), original only, or changed only.
        </li>
      </ul>
    ),
  },
  {
    id: "workspace",
    title: "Workspace",
    body: (
      <div className="space-y-2">
        <div>
          <p className="font-semibold">New Compare</p>
          <p className="mt-0.5 text-muted-foreground">
            Upload two files and configure comparison options.
          </p>
        </div>
        <div>
          <p className="font-semibold">History</p>
          <p className="mt-0.5 text-muted-foreground">
            Browse past comparisons, reopen, rename, or export them.
          </p>
        </div>
        <div>
          <p className="font-semibold">Exports</p>
          <p className="mt-0.5 text-muted-foreground">
            View and manage all exported files with custom names.
          </p>
        </div>
        <div>
          <p className="font-semibold">Settings</p>
          <p className="mt-0.5 text-muted-foreground">Toggle request logging for diagnostics.</p>
        </div>
      </div>
    ),
  },
  {
    id: "formats",
    title: "Supported formats",
    body: (
      <ul className="list-disc space-y-1 pl-4">
        <li>CSV / TSV / TXT — streamed</li>
        <li>XLSX / XLSM — streamed</li>
        <li>XLS / XLSB / ODS — not yet supported</li>
      </ul>
    ),
  },
  {
    id: "api",
    title: "REST API",
    body: (
      <div className="space-y-3">
        <p className="text-muted-foreground">
          All endpoints are available locally on the same origin.
        </p>
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Files & sheets
          </p>
          <div className="code-block">
            {`POST /api/upload
POST /api/sheets`}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Comparison jobs
          </p>
          <div className="code-block">
            {`POST /api/jobs
GET  /api/jobs/{id}/status
GET  /api/jobs/{id}/rows
POST /api/jobs/{id}/cancel
POST /api/jobs/{id}/export
POST /api/jobs/{id}/finalize
GET  /api/jobs/{id}/report`}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            History & exports
          </p>
          <div className="code-block">
            {`GET    /api/history
POST   /api/history/{id}/name
DELETE /api/history/{id}
GET    /api/exports
DELETE /api/exports/{id}`}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Settings
          </p>
          <div className="code-block">
            {`GET    /api/settings
POST   /api/settings/logs`}
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "privacy",
    title: "Privacy",
    body: (
      <p className="text-muted-foreground">
        Differ Pro runs entirely on your machine. Files are processed locally, never uploaded to any
        external server.
      </p>
    ),
  },
];

export function DocsDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="text-sm">Documentation</DrawerTitle>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-4">
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-hairline bg-surface p-3">
            <div className="grid size-8 shrink-0 place-items-center rounded-md bg-foreground text-background">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className="size-4"
              >
                <path
                  d="M7 8l-4 4 4 4M17 8l4 4-4 4M14 4l-4 16"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div>
              <p className="text-xs font-semibold">Differ Pro</p>
              <p className="text-[10px] text-muted-foreground">
                Compare text and spreadsheet files side-by-side.
              </p>
            </div>
          </div>
          <div className="space-y-4">
            {sections.map((s) => (
              <section key={s.id}>
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {s.title}
                </h3>
                <div className="rounded-lg border border-border bg-surface p-3 text-[11px] leading-relaxed">
                  {s.body}
                </div>
              </section>
            ))}
          </div>
          <p className="mt-4 text-center text-[10px] text-muted-foreground">
            Differ Pro by Hareesh D
          </p>
        </div>
        <div className="border-t border-hairline p-4">
          <DrawerClose asChild>
            <button
              type="button"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
