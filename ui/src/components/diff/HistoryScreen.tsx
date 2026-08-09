import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteHistoryJob, listHistory, renameHistoryJob, type HistoryJob } from "@/api";
import { ExportDialog } from "./ExportDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { FileText } from "lucide-react";

function fmtDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function groupLabel(iso: string): string {
  if (!iso) return "Older";
  const d = new Date(iso);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startWeek = new Date(startToday);
  startWeek.setDate(startWeek.getDate() - 7);
  if (d >= startToday) return "Today";
  if (d >= startWeek) return "This week";
  return "Older";
}

const GROUP_ORDER = ["Today", "This week", "Older"];

function parseSummary(job: HistoryJob): { modified?: number; added?: number; deleted?: number } {
  try {
    return JSON.parse(job.summary || "{}");
  } catch {
    return {};
  }
}

export function HistoryScreen({
  onOpen,
}: {
  onOpen: (
    jobId: string,
    mode: string,
    originalName: string,
    changedName: string,
    summary: string,
  ) => void;
}) {
  const [jobs, setJobs] = useState<HistoryJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [exportJob, setExportJob] = useState<HistoryJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HistoryJob | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listHistory();
      setJobs(data.jobs || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load history");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((j) =>
      [j.name, j.originalName, j.changedName, j.mode].some((s) => s?.toLowerCase().includes(q)),
    );
  }, [jobs, query]);

  const groups = useMemo(() => {
    const g: Record<string, HistoryJob[]> = {};
    for (const j of filtered) {
      const key = groupLabel(j.createdAt);
      (g[key] ||= []).push(j);
    }
    return GROUP_ORDER.filter((k) => g[k]).map((k) => ({ label: k, items: g[k]! }));
  }, [filtered]);

  async function handleRename(job: HistoryJob) {
    const next = draftName.trim();
    if (!next) {
      setRenamingId(null);
      return;
    }
    try {
      await renameHistoryJob(job.id, next);
      setRenamingId(null);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rename failed");
    }
  }

  async function handleDelete(job: HistoryJob) {
    setDeleteTarget(job);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteHistoryJob(deleteTarget.id);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-hairline bg-surface-raised px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-[-0.04em]">Comparison history</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Re-open, rename, or export any past comparison.
            </p>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search comparisons..."
            className="w-56 rounded-md border border-border bg-background px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-amber-500/40"
          />
        </div>
      </div>

      {error && (
        <div className="border-b border-hairline bg-destructive/5 px-5 py-2 text-xs text-foreground">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-2 p-5">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 w-full rounded-lg border border-border bg-card skeleton"
              />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No comparisons yet"
            subtitle="Run a comparison and it will be saved here."
          />
        ) : (
          <div className="mx-auto max-w-4xl px-5 py-6">
            {groups.map((g, gi) => (
              <div key={g.label} className={cn("mb-8", gi > 0 && "animate-fade-up")}>
                <p className="eyebrow mb-3">{g.label}</p>
                <div className="space-y-1.5">
                  {g.items.map((job) => {
                    const s = parseSummary(job);
                    return (
                      <div
                        key={job.id}
                        className="surface-card-hover flex items-center gap-3 rounded-lg px-3 py-2.5"
                      >
                        {renamingId === job.id ? (
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <input
                              autoFocus
                              value={draftName}
                              onChange={(e) => setDraftName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleRename(job);
                                if (e.key === "Escape") setRenamingId(null);
                              }}
                              className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-amber-500/40"
                            />
                            <Button size="sm" onClick={() => handleRename(job)}>
                              Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setRenamingId(null)}>
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                onOpen(
                                  job.id,
                                  job.mode,
                                  job.originalName,
                                  job.changedName,
                                  job.summary,
                                )
                              }
                              className="min-w-0 flex-1 text-left"
                            >
                              <p className="truncate text-sm font-semibold text-foreground hover:underline">
                                {job.name || `${job.originalName} vs ${job.changedName}`}
                              </p>
                              <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                                {job.originalName} vs {job.changedName} · {fmtDate(job.createdAt)}
                              </p>
                            </button>

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

                            <div className="flex shrink-0 items-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setRenamingId(job.id);
                                  setDraftName(job.name || "");
                                }}
                              >
                                Rename
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setExportJob(job)}>
                                Export
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => handleDelete(job)}>
                                Delete
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {exportJob && (
        <ExportDialog
          open
          onOpenChange={(o) => !o && setExportJob(null)}
          jobId={exportJob.id}
          defaultName={exportJob.name || `${exportJob.originalName}-vs-${exportJob.changedName}`}
          defaultFilter="nonmatches"
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete comparison</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove &quot;{deleteTarget?.name}&quot; from history? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
