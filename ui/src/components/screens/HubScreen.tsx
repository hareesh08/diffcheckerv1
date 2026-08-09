import { useCallback, useEffect, useState } from "react";
import { listHistory, type HistoryJob } from "@/api";
import {
  FileText,
  Plus,
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

export function HubScreen({
  onNewCompare,
  onOpenJob,
}: {
  onNewCompare: () => void;
  onOpenJob: (id: string, mode: string, originalName: string, changedName: string) => void;
}) {
  const [jobs, setJobs] = useState<HistoryJob[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
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

        {/* Recent */}
        <div className="mt-6 animate-fade-up">
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
