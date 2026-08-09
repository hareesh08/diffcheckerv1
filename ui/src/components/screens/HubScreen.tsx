import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { listHistory, type HistoryJob } from "@/api";
import type { UploadedFile } from "@/App";
import { uploadFile, getSheets, type UploadedFileMeta } from "@/api";
import { FileText, Plus, ArrowRight } from "lucide-react";
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

type Side = "a" | "b";

export function HubScreen({
  onNewCompare,
  onOpenJob,
}: {
  onNewCompare: () => void;
  onOpenJob: (id: string) => void;
}) {
  const [jobs, setJobs] = useState<HistoryJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<{ a?: UploadedFile; b?: UploadedFile }>({});
  const [busy, setBusy] = useState<{ a?: boolean; b?: boolean }>({});
  const [error, setError] = useState<string | null>(null);

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
    }
  }

  const ready = files.a && files.b;

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        {error && (
          <div className="mb-4 rounded border border-neon-red/30 bg-neon-red/5 px-3 py-2 text-xs text-foreground">
            {error}
          </div>
        )}

        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-[-0.045em] sm:text-4xl">
            Compare with confidence.
          </h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            Drop two files and surface every meaningful change in one calm, focused workspace.
          </p>
        </div>

        {/* Quick Compare */}
        <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
          <p className="eyebrow mb-3">Quick compare</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(["a", "b"] as const).map((side) => (
              <div
                key={side}
                className={cn(
                  "flex h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-background transition-all sm:h-40",
                  files[side]
                    ? "border-neon-green/40 bg-neon-green/5"
                    : "border-border hover:border-neon-blue/60",
                )}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleFile(e.dataTransfer.files?.[0] as File, side);
                }}
              >
                {files[side] ? (
                  <div className="flex flex-col items-center gap-1 text-center">
                    <span className="truncate max-w-[180px] font-mono text-xs font-semibold text-foreground">
                      {files[side]!.name}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      Source {side.toUpperCase()}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFiles((f) => ({ ...f, [side]: undefined }))}
                      className="mt-1 text-[10px] text-muted-foreground underline hover:text-foreground"
                    >
                      remove
                    </button>
                  </div>
                ) : (
                  <label className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-1">
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
                        <Plus className="size-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          Drop{" "}
                          <span className="font-semibold text-foreground">
                            Source {side.toUpperCase()}
                          </span>{" "}
                          or <span className="underline underline-offset-4">browse</span>
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
                "flex items-center gap-1.5 rounded bg-foreground px-3 py-1.5 text-xs font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-40",
              )}
            >
              Compare <ArrowRight className="size-3" />
            </button>
          </div>
        </div>

        {/* Recent */}
        <div className="mt-10">
          <p className="eyebrow mb-3">Recent comparisons</p>
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>
          ) : jobs.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No comparisons yet"
              subtitle="Run your first comparison and it will appear here."
              action={{ label: "Start comparing", onClick: onNewCompare }}
            />
          ) : (
            <div className="space-y-2">
              {jobs.map((job) => {
                const s = parseSummary(job);
                return (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => onOpenJob(job.id)}
                    className="flex w-full items-center gap-3 rounded border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-muted-foreground"
                  >
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {job.name || `${job.originalName} vs ${job.changedName}`}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                        {job.originalName} vs {job.changedName}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {(s.modified ?? 0) > 0 && (
                        <span className="rounded bg-neon-yellow/10 px-1.5 py-0.5 font-mono text-[10px] text-neon-yellow">
                          {s.modified} mod
                        </span>
                      )}
                      {(s.added ?? 0) > 0 && (
                        <span className="rounded bg-neon-green/10 px-1.5 py-0.5 font-mono text-[10px] text-neon-green">
                          {s.added} add
                        </span>
                      )}
                      {(s.deleted ?? 0) > 0 && (
                        <span className="rounded bg-neon-red/10 px-1.5 py-0.5 font-mono text-[10px] text-neon-red">
                          {s.deleted} del
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {fmtTime(job.createdAt)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Keyboard hints */}
        <div className="mt-8 flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
          <span>
            <kbd className="rounded border border-border bg-accent px-1 py-0.5 font-mono text-[9px]">
              {navigator.platform?.includes("Mac") ? "⌘" : "Ctrl"}
            </kbd>{" "}
            +{" "}
            <kbd className="rounded border border-border bg-accent px-1 py-0.5 font-mono text-[9px]">
              K
            </kbd>{" "}
            search
          </span>
          <span>
            <kbd className="rounded border border-border bg-accent px-1 py-0.5 font-mono text-[9px]">
              {navigator.platform?.includes("Mac") ? "⌘" : "Ctrl"}
            </kbd>{" "}
            +{" "}
            <kbd className="rounded border border-border bg-accent px-1 py-0.5 font-mono text-[9px]">
              N
            </kbd>{" "}
            new compare
          </span>
        </div>
      </div>
    </div>
  );
}
