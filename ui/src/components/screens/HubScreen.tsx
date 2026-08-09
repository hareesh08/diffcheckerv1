import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { listHistory, type HistoryJob } from "@/api";
import type { UploadedFile } from "@/App";
import { uploadFile, getSheets, type UploadedFileMeta } from "@/api";
import {
  FileText,
  Plus,
  ArrowRight,
  X,
  Layers,
  Rows3,
  AlignJustify,
  Clock3,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";

function fmtDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function fmtTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 60000) return "just now";
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
  if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`;
  return fmtDate(iso);
}

function parseSummary(job: HistoryJob): { modified?: number; added?: number; deleted?: number } {
  try {
    return JSON.parse(job.summary || "{}");
  } catch {
    return {};
  }
}

const MODE_META: Record<string, { icon: LucideIcon; label: string }> = {
  text: { icon: AlignJustify, label: "Text diff" },
  table: { icon: Layers, label: "Table" },
  rows: { icon: Rows3, label: "Rows" },
};

type Side = "a" | "b";

const TEXT_EXTS = [
  "txt",
  "md",
  "log",
  "json",
  "yaml",
  "yml",
  "xml",
  "html",
  "css",
  "js",
  "ts",
  "go",
  "py",
  "java",
  "c",
  "cpp",
  "h",
  "sql",
  "sh",
  "bat",
];

function isTextFile(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return false;
  return TEXT_EXTS.includes(name.slice(dot + 1).toLowerCase());
}

function fileBadge(name: string): string {
  if (!name) return "FILE";
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1).toUpperCase() : "";
  const short = { XLSX: "XLS", XLSM: "XLS", TSV: "TSV", CSV: "CSV" } as Record<string, string>;
  return short[ext] || (ext && isTextFile(name) ? "TXT" : ext) || "FILE";
}

export function HubScreen({
  onNewCompare,
  onOpenJob,
}: {
  onNewCompare: () => void;
  onOpenJob: (id: string, mode: string, originalName: string, changedName: string) => void;
}) {
  const [jobs, setJobs] = useState<HistoryJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<{ a?: UploadedFile; b?: UploadedFile }>({});
  const [busy, setBusy] = useState<{ a?: boolean; b?: boolean }>({});
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<Side | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listHistory();
      setJobs(data.jobs?.slice(0, 8) ?? []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleFile(file: File, side: Side) {
    setError(null);
    if (!file) return;
    setBusy((b) => ({ ...b, [side]: true }));
    try {
      const meta: UploadedFileMeta = await uploadFile(file);
      const sheets = await getSheets(meta.path);
      setFiles((f) => ({
        ...f,
        [side]: { path: meta.path, name: meta.name, size: meta.size, sheets: sheets.sheets },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy((b) => ({ ...b, [side]: false }));
      setDragOver(null);
    }
  }

  const ready = files.a && files.b;

  const totals = jobs.reduce<{ modified: number; added: number; deleted: number }>(
    (acc, job) => {
      const s = parseSummary(job);
      return {
        modified: acc.modified + (s.modified ?? 0),
        added: acc.added + (s.added ?? 0),
        deleted: acc.deleted + (s.deleted ?? 0),
      };
    },
    { modified: 0, added: 0, deleted: 0 },
  );

  const stats = [
    {
      label: "Modified cells",
      value: totals.modified.toLocaleString(),
      tone: "text-amber-600 dark:text-amber-400",
      dot: "bg-amber-500",
    },
    {
      label: "Lines added",
      value: totals.added.toLocaleString(),
      tone: "text-emerald-600 dark:text-emerald-400",
      dot: "bg-emerald-500",
    },
    {
      label: "Lines removed",
      value: totals.deleted.toLocaleString(),
      tone: "text-red-600 dark:text-red-400",
      dot: "bg-red-500",
    },
    {
      label: "Recent scans",
      value: String(jobs.length),
      tone: "text-foreground",
      dot: "bg-foreground",
    },
  ];

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        {error && (
          <div className="mb-4 animate-fade-up rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-foreground">
            {error}
          </div>
        )}

        {/* Hero */}
        <div className="mb-8 animate-fade-up">
          <p className="eyebrow mb-3 flex items-center gap-2">
            <Sparkles className="size-3" /> Workspace
          </p>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-[-0.045em] sm:text-4xl">
                Compare with confidence.
              </h1>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                Drop two files and surface every meaningful change in one calm, focused workspace.
              </p>
            </div>
            <button
              type="button"
              onClick={onNewCompare}
              className="flex h-9 items-center gap-2 rounded-md bg-amber-500 px-3.5 text-xs font-semibold text-black transition-opacity hover:opacity-90"
            >
              <Plus className="size-3.5" /> New comparison
            </button>
          </div>
        </div>

        {/* Stats */}
        <div
          className="mb-8 grid animate-fade-up grid-cols-2 gap-3 stagger-1 sm:grid-cols-4"
          aria-hidden={jobs.length === 0}
        >
          {stats.map((s) => (
            <div
              key={s.label}
              className="surface-card rounded-xl p-4 transition-colors hover:border-border"
            >
              <div className="flex items-center gap-1.5">
                <span className={cn("size-1.5 rounded-full", s.dot)} />
                <span className="eyebrow">{s.label}</span>
              </div>
              <p className={cn("mt-2 font-mono text-2xl font-bold tracking-tight", s.tone)}>
                {s.value}
              </p>
            </div>
          ))}
        </div>

        {/* Quick Compare */}
        <div className="animate-fade-up stagger-2 rounded-xl border border-hairline bg-card p-4 sm:p-6">
          <p className="eyebrow mb-4">Quick compare</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(["a", "b"] as const).map((side) => (
              <div
                key={side}
                className={cn(
                  "relative rounded-lg border transition-all",
                  files[side]
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-dashed border-border bg-surface hover:border-amber-500/40",
                  dragOver === side && "border-amber-500 bg-amber-500/5",
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(side);
                }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  handleFile(e.dataTransfer.files?.[0] as File, side);
                }}
              >
                {files[side] ? (
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-background font-mono text-[10px] font-bold text-muted-foreground">
                      {fileBadge(files[side]!.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs font-semibold text-foreground">
                        {files[side]!.name}
                      </p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        Source {side.toUpperCase()} · {files[side]!.sheets.length} sheet
                        {files[side]!.sheets.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFiles((f) => ({ ...f, [side]: undefined }))}
                      className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ) : (
                  <label className="flex h-32 cursor-pointer flex-col items-center justify-center gap-2 sm:h-36">
                    <input
                      type="file"
                      accept=".xlsx,.xlsm,.csv,.tsv,.txt"
                      className="hidden"
                      disabled={busy[side]}
                      onChange={(e) => handleFile(e.target.files?.[0] as File, side)}
                    />
                    {busy[side] ? (
                      <p className="text-xs text-muted-foreground">Uploading...</p>
                    ) : (
                      <>
                        <span className="grid size-9 place-items-center rounded-full border border-border bg-background text-muted-foreground">
                          <Plus className="size-4" />
                        </span>
                        <span className="text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground">
                            Source {side.toUpperCase()}
                          </span>{" "}
                          or <span className="underline underline-offset-4">browse</span>
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground/60">
                          .xlsx · .csv · .tsv · .txt
                        </span>
                      </>
                    )}
                  </label>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={onNewCompare}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Full comparison options...
            </button>
            <button
              type="button"
              disabled={!ready}
              onClick={onNewCompare}
              className={cn(
                "flex items-center gap-1.5 rounded-md bg-foreground px-3.5 py-2 text-xs font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-40",
              )}
            >
              Compare <ArrowRight className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Recent */}
        <div className="mt-10 animate-fade-up stagger-3">
          <div className="mb-3 flex items-center justify-between">
            <p className="eyebrow flex items-center gap-2">
              <Clock3 className="size-3" /> Recent comparisons
            </p>
            {jobs.length > 0 && (
              <span className="font-mono text-[10px] text-muted-foreground">
                {jobs.length} shown
              </span>
            )}
          </div>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-16 w-full rounded-lg border border-border bg-card skeleton"
                />
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No comparisons yet"
              subtitle="Run your first comparison and it will appear here."
              action={{ label: "Start comparing", onClick: onNewCompare }}
            />
          ) : (
            <div className="space-y-1.5">
              {jobs.map((job) => {
                const s = parseSummary(job);
                const mode = MODE_META[job.mode] ?? MODE_META.rows;
                const ModeIcon = mode.icon;
                return (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => onOpenJob(job.id, job.mode, job.originalName, job.changedName)}
                    className="surface-card-hover group flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-3 text-left transition-colors"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
                      <ModeIcon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {job.name || `${job.originalName} vs ${job.changedName}`}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                        {mode.label} · {job.originalName} vs {job.changedName}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {(s.modified ?? 0) > 0 && (
                        <span className="diff-badge diff-badge-mod">{s.modified} mod</span>
                      )}
                      {(s.added ?? 0) > 0 && (
                        <span className="diff-badge diff-badge-add">{s.added} add</span>
                      )}
                      {(s.deleted ?? 0) > 0 && (
                        <span className="diff-badge diff-badge-del">{s.deleted} del</span>
                      )}
                    </div>
                    <span className="shrink-0 text-[10px] text-muted-foreground group-hover:text-foreground">
                      {fmtTime(job.createdAt)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Keyboard hints */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-hairline pt-6 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-border bg-accent px-1.5 py-0.5 font-mono text-[9px]">
              {navigator.platform?.includes("Mac") ? "⌘" : "Ctrl"} K
            </kbd>
            search
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-border bg-accent px-1.5 py-0.5 font-mono text-[9px]">
              {navigator.platform?.includes("Mac") ? "⌘" : "Ctrl"} N
            </kbd>
            new compare
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-border bg-accent px-1.5 py-0.5 font-mono text-[9px]">
              {navigator.platform?.includes("Mac") ? "⌘" : "Ctrl"} D
            </kbd>
            toggle theme
          </span>
        </div>
      </div>
    </div>
  );
}
