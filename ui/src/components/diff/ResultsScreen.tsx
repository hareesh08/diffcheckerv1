import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  cancelJob, createJob, downloadBlob, exportResults, getJobRows, getJobStatus,
  type JobStatus, type ResultRow, type RowsResponse, type JobOptionsInput,
} from "@/api";
import type { JobSetup } from "@/App";
import { useIsMobile } from "@/hooks/use-mobile";
import { ResultsCard } from "./ResultsCard";
import { ToolsDrawer } from "./ToolsDrawer";
import { SlidersHorizontal } from "lucide-react";

const kindColor = {
  modified: "text-neon-yellow",
  added: "text-neon-green",
  deleted: "text-neon-red",
} as const;

const rowTone = {
  equal: "hover:bg-card/40",
  modified: "bg-neon-yellow/5 hover:bg-neon-yellow/10",
  added: "bg-neon-green/5 hover:bg-neon-green/10",
  deleted: "bg-neon-red/5 hover:bg-neon-red/10",
} as const;

function colLetter(n: number) {
  let name = "";
  let c = n;
  while (c > 0) {
    c--;
    name = String.fromCharCode(65 + (c % 26)) + name;
    c = Math.floor(c / 26);
  }
  return name;
}

export function ResultsScreen({ setup, onBack }: { setup: JobSetup; onBack: () => void }) {
  const isMobile = useIsMobile();

  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(50);

  const [view, setView] = useState<"redline" | "original" | "changed">("redline");
  const [changesOnly, setChangesOnly] = useState(false);
  const [sortByChange, setSortByChange] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [mobileViewMode, setMobileViewMode] = useState<"card" | "table">("card");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const started = useRef(false);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());

  useEffect(() => {
    if (!active) return;
    const row = rowRefs.current.get(active);
    if (row) row.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  }, [active, page]);

  const loadRows = useCallback(async (job: string, pageNum: number, flt: string, ps: number) => {
    try {
      const data: RowsResponse = await getJobRows(job, { filter: flt, page: pageNum, pageSize: ps });
      setRows(data.rows || []);
      setTotalRows(data.totalRows || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load rows");
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    setStatus(null);
    setError(null);
    const options: JobOptionsInput = {
      mode: setup.options.mode,
      originalSheet: setup.sheetA,
      changedSheet: setup.sheetB,
      headerRow: setup.options.headerRow,
      rowKeyColumn: setup.options.rowKeyColumn,
      ignoreWhitespace: setup.options.ignoreWhitespace,
      ignoreCase: setup.options.ignoreCase,
      hideUnchangedRows: false,
      hideUnchangedColumns: false,
      preserveFormatting: true,
    };
    (async () => {
      try {
        const created = await createJob({
          originalPath: setup.fileA.path,
          changedPath: setup.fileB.path,
          options,
        });
        setJobId(created.jobId);
        const timer = setInterval(async () => {
          try {
            const j = await getJobStatus(created.jobId);
            setStatus(j);
            if (j.status === "completed") {
              clearInterval(timer);
              setPage(1);
              loadRows(created.jobId, 1, "all", pageSize);
            } else if (j.status === "failed" || j.status === "cancelled") {
              clearInterval(timer);
            }
          } catch { /* transient */ }
        }, 800);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to start comparison");
      }
    })();
  }, [setup, loadRows]);

  useEffect(() => {
    if (jobId && status?.status === "completed") {
      loadRows(jobId, page, filter, pageSize);
    }
  }, [jobId, page, filter, pageSize]);

  const done = status?.status === "completed";
  const running = status?.status === "queued" || status?.status === "parsing" || status?.status === "comparing";

  function handleCancel() { if (jobId) cancelJob(jobId); }

  function handleExport(format: "csv" | "jsonl") {
    if (!jobId) return;
    exportResults(jobId, filter === "all" ? "nonmatches" : filter, format)
      .then((blob) => downloadBlob(blob, `diff-${filter}.${format === "csv" ? "csv" : "jsonl"}`))
      .catch((e) => setError(e instanceof Error ? e.message : "Export failed"));
  }

  const displayRows = [...rows];
  if (changesOnly) {
    for (let i = displayRows.length - 1; i >= 0; i--) {
      if (displayRows[i]!.status === "equal") displayRows.splice(i, 1);
    }
  }
  if (sortByChange) {
    const order = { deleted: 0, modified: 1, added: 2, equal: 3 } as const;
    displayRows.sort((a, b) =>
      (order[a.status as keyof typeof order] ?? 3) - (order[b.status as keyof typeof order] ?? 3));
  }

  const summary = status?.summary || {};
  const totalChanges = (summary.modifiedCells ?? 0) + (summary.addedRows ?? 0) + (summary.deletedRows ?? 0);

  // Build column list from actual cell values, not just changes.
  let totalColumns = 0;
  for (const r of rows) {
    const len = Math.max(r.originalValues?.length ?? 0, r.changedValues?.length ?? 0);
    if (len > totalColumns) totalColumns = len;
  }
  const columns: string[] = [];
  for (let i = 0; i < totalColumns; i++) {
    columns.push(colLetter(i + 1));
  }

  // ── Mobile layout ──
  if (isMobile) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile toolbar */}
        <div className="flex shrink-0 flex-col gap-2 border-b border-hairline bg-card p-3">
          <div className="flex items-center justify-between">
            <button type="button" onClick={onBack}
              className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground">
              ← Back
            </button>
            <div className="flex items-center gap-1">
              {["card", "table"].map((m) => (
                <button key={m} type="button" onClick={() => setMobileViewMode(m as "card" | "table")}
                  className={cn("rounded px-2 py-1 text-[10px] font-medium capitalize transition-colors",
                    mobileViewMode === m ? "bg-foreground text-background" : "text-muted-foreground")}>
                  {m}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setDrawerOpen(true)}
              className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-card hover:text-foreground">
              <SlidersHorizontal className="size-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto">
            <div className="flex shrink-0 rounded border border-border bg-background p-0.5">
              {(["redline", "original", "changed"] as const).map((v) => (
                <button key={v} type="button" onClick={() => setView(v)}
                  className={cn("rounded px-2 py-0.5 text-[10px] capitalize transition-colors",
                    view === v ? "bg-foreground text-background font-medium" : "text-muted-foreground")}>
                  {v}
                </button>
              ))}
            </div>
            <div className="h-3 w-px shrink-0 bg-hairline" />
            <span className="shrink-0 rounded bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{setup.fileA.name}</span>
            <span className="shrink-0 text-[10px] text-muted-foreground">vs</span>
            <span className="shrink-0 rounded bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{setup.fileB.name}</span>
          </div>

          {done && (
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              {[
                { c: "bg-neon-yellow", n: summary.modifiedRows ?? 0, l: "Mod" },
                { c: "bg-neon-green", n: summary.addedRows ?? 0, l: "Add" },
                { c: "bg-neon-red", n: summary.deletedRows ?? 0, l: "Del" },
              ].map((s) => (
                <span key={s.l} className="flex items-center gap-1">
                  <span className={cn("size-1.5 rounded-full", s.c)} />
                  {s.n} {s.l}
                </span>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="border-b border-hairline bg-neon-red/5 px-4 py-2 text-xs text-foreground">{error}</div>
        )}

        {!done ? (
          <div className="flex flex-1 items-center justify-center bg-background p-4">
            <div className="w-full max-w-sm rounded-md border border-border bg-card p-4 text-center">
              <p className="mb-2 text-sm font-semibold">
                {status?.status === "failed" ? "Comparison failed" : status?.status === "cancelled" ? "Comparison cancelled" : "Comparing files..."}
              </p>
              {running && (
                <>
                  <p className="mb-3 text-xs text-muted-foreground">{status?.progressLabel ?? "Working..."}</p>
                  <div className="h-2 w-full overflow-hidden rounded bg-border">
                    <div className="h-full bg-foreground transition-all" style={{ width: `${Math.round((status?.progress ?? 0) * 100)}%` }} />
                  </div>
                </>
              )}
              {status?.status === "failed" && <p className="mt-2 text-xs text-neon-red">{status.error || "Unknown error"}</p>}
              {(status?.status === "failed" || status?.status === "cancelled") && (
                <button type="button" onClick={onBack}
                  className="mt-3 w-full rounded bg-foreground px-3 py-2 text-xs font-semibold text-background">
                  Back to review
                </button>
              )}
            </div>
          </div>
        ) : mobileViewMode === "card" ? (
          <div className="flex-1 overflow-auto bg-background">
            <ResultsCard rows={displayRows} view={view} active={active} onActive={setActive} />
          </div>
        ) : (
          <div className="flex-1 overflow-auto bg-background">
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 font-mono text-[11px] leading-none">
                <thead className="sticky top-0 z-20">
                  <tr>
                    <th className="w-16 border-r border-b border-hairline bg-secondary px-1 py-1.5 text-center text-[9px] font-medium uppercase tracking-wider text-muted-foreground">Row</th>
                    {columns.length === 0 && (
                      <th className="border-b border-hairline bg-secondary px-2 py-1.5 text-left text-[9px] font-medium uppercase tracking-wider text-muted-foreground">Cells</th>
                    )}
                    {columns.map((c) => (
                      <th key={c} className="border-r border-b border-hairline bg-secondary px-2 py-1.5 text-left text-[9px] font-medium uppercase tracking-wider text-muted-foreground">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.length === 0 && (
                    <tr>
                      <td colSpan={columns.length + 2} className="px-3 py-6 text-center font-sans text-xs text-muted-foreground">No rows match this filter.</td>
                    </tr>
                  )}
                  {displayRows.map((row) => {
                    const rowKey = String(row.rowNumber);
                    return (
                      <tr key={rowKey} ref={(node) => {
                        if (node) rowRefs.current.set(rowKey, node);
                        else rowRefs.current.delete(rowKey);
                      }} onClick={() => setActive(rowKey)}
                        className={cn("cursor-pointer transition-colors", rowTone[row.status as keyof typeof rowTone] ?? "hover:bg-card/40", active === rowKey && "ring-1 ring-inset ring-ring")}>
                        <td className="sticky left-0 z-10 border-r border-b border-hairline bg-secondary px-1 py-1.5 text-center text-[9px] text-muted-foreground">
                          {row.rowNumber}
                          <span className={cn("ml-1 inline-block h-1.5 w-1.5 rounded-full align-middle",
                            row.status === "modified" && "bg-neon-yellow",
                            row.status === "added" && "bg-neon-green",
                            row.status === "deleted" && "bg-neon-red")} />
                        </td>
                        {columns.length === 0 && (
                          <td className="border-b border-hairline px-2 py-1.5 font-sans text-[10px] text-muted-foreground">
                            {row.status === "equal" ? "No changes" : row.changes.length + " change(s)"}
                          </td>
                        )}
                        {columns.map((c, ci) => {
                          const change = row.changes.find((ch) => ch.column === ci);
                          const origVal = row.originalValues?.[ci] ?? "";
                          const changedVal = row.changedValues?.[ci] ?? "";
                          // Added rows have no original values and deleted rows have no
                          // changed values, so redline falls back to whichever side exists.
                          const cellVal =
                            view === "original" ? origVal : view === "changed" ? changedVal : origVal || changedVal;
                          // Added/deleted rows carry a synthetic marker change at column 0
                          // with no values; rendering it would blank out a real cell.
                          const hasChange = !!change && !(change.old === "" && change.new === "");
                          return (
                            <td key={c} className={cn("border-r border-b border-hairline px-2 py-1.5",
                              hasChange && view === "redline" && "bg-neon-yellow/10",
                              hasChange && view === "original" && "bg-neon-red/10",
                              hasChange && view === "changed" && "bg-neon-green/10")}>
                              {hasChange ? (
                                <span className={cn("rounded px-0.5",
                                  change!.type === "modified" && "bg-neon-yellow/20 text-neon-yellow",
                                  change!.type === "added" && "bg-neon-green/20 text-neon-green",
                                  change!.type === "deleted" && "bg-neon-red/20 text-neon-red",
                                  view === "redline" && "font-semibold",
                                  view === "original" && "text-muted-foreground",
                                  kindColor[change!.type as keyof typeof kindColor] ?? "")}> 
                                  {view === "redline" ? (
                                    <>
                                      <span className="line-through opacity-60">{change!.old}</span>
                                      <span className="mx-0.5">→</span>
                                      <span>{change!.new}</span>
                                    </>
                                  ) : view === "original" ? change!.old : change!.new}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">{cellVal}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Mobile pagination footer */}
        {done && (
          <div className="flex shrink-0 items-center justify-between border-t border-hairline bg-card px-3 py-2">
            <span className="text-[10px] text-muted-foreground">{totalRows.toLocaleString()} rows</span>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded border border-border px-2 py-1 hover:text-foreground disabled:opacity-40">Prev</button>
              <span className="font-mono">{page}/{Math.max(1, Math.ceil(totalRows / pageSize))}</span>
              <button disabled={page * pageSize >= totalRows} onClick={() => setPage((p) => p + 1)}
                className="rounded border border-border px-2 py-1 hover:text-foreground disabled:opacity-40">Next</button>
            </div>
          </div>
        )}

        <ToolsDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          filter={filter}
          onFilterChange={(f) => { setFilter(f); setPage(1); setDrawerOpen(false); }}
          onExport={(fmt) => { handleExport(fmt); setDrawerOpen(false); }}
          rows={rows}
          totalChanges={totalChanges}
          setup={setup}
        />
      </div>
    );
  }

  // ── Desktop layout ──
  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Tools sidebar */}
      <aside className="flex w-56 shrink-0 flex-col gap-4 border-r border-hairline bg-card p-3">
        {!done && (
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</p>
            <div className="space-y-1 text-[11px]">
              {running ? (
                <>
                  <p className="text-muted-foreground">{status?.progressLabel ?? status?.status}</p>
                  <div className="h-1.5 w-full overflow-hidden rounded bg-border">
                    <div className="h-full bg-foreground transition-all" style={{ width: `${Math.round((status?.progress ?? 0) * 100)}%` }} />
                  </div>
                  <button type="button" onClick={handleCancel}
                    className="mt-1 rounded border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground">
                    Cancel
                  </button>
                </>
              ) : status?.status === "failed" ? (
                <p className="text-neon-red">{status.error || "Failed"}</p>
              ) : status?.status === "cancelled" ? (
                <p className="text-neon-yellow">Cancelled</p>
              ) : (
                <p className="text-muted-foreground">Waiting...</p>
              )}
            </div>
            {(status?.status === "failed" || status?.status === "cancelled") && (
              <button type="button" onClick={onBack}
                className="mt-2 w-full rounded bg-foreground px-2 py-1.5 text-[10px] font-semibold text-background">
                Back to review
              </button>
            )}
          </div>
        )}

        {done && (
          <>
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tools</p>
              <div className="space-y-1.5">
                {[
                  { label: "Changes only", on: changesOnly, set: setChangesOnly },
                  { label: "Sort by change type", on: sortByChange, set: setSortByChange },
                ].map((t) => (
                  <button key={t.label} type="button" onClick={() => t.set(!t.on)}
                    className="flex w-full items-center justify-between rounded px-1 py-1 hover:bg-card/50">
                    <span className="text-[11px]">{t.label}</span>
                    <span className={cn("relative h-4 w-7 rounded-full transition-colors", t.on ? "bg-foreground" : "bg-border")}>
                      <span className={cn("absolute top-0.5 size-3 rounded-full bg-background transition-all", t.on ? "left-3.5" : "left-0.5")} />
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Sources</p>
              <div className="space-y-1 font-mono text-[10px] text-muted-foreground">
                <p className="truncate rounded bg-card/60 px-1.5 py-1">{setup.fileA.name}</p>
                <p className="truncate rounded bg-card/60 px-1.5 py-1">{setup.fileB.name}</p>
              </div>
            </div>

            <div className="mt-auto space-y-1">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Filter</p>
              <select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-[11px] outline-none focus:ring-1 focus:ring-ring">
                <option value="all">All rows</option>
                <option value="matches">Matches only</option>
                <option value="nonmatches">Non-matches</option>
                <option value="modified">Modified</option>
                <option value="added">Added</option>
                <option value="deleted">Deleted</option>
              </select>
              <p className="mt-1 mb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Export</p>
              <button onClick={() => handleExport("jsonl")}
                className="w-full rounded bg-foreground px-2 py-1.5 text-[10px] font-semibold text-background">
                Export JSONL
              </button>
              <button onClick={() => handleExport("csv")}
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground">
                Export CSV
              </button>
            </div>
          </>
        )}
      </aside>

      {/* Workbench */}
      <div className="flex flex-1 flex-col overflow-x-auto overflow-y-hidden">
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-hairline bg-card px-4">
          <div className="flex items-center gap-2">
            <div className="flex rounded border border-border bg-background p-0.5">
              {(["redline", "original", "changed"] as const).map((v) => (
                <button key={v} type="button" onClick={() => setView(v)}
                  className={cn("rounded px-2.5 py-1 text-xs capitalize transition-colors",
                    view === v ? "bg-foreground text-background font-medium" : "text-muted-foreground hover:text-foreground")}>
                  {v}
                </button>
              ))}
            </div>
            <div className="mx-1 h-4 w-px bg-hairline" />
            <span className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{setup.fileA.name}</span>
            <span className="text-[10px] text-muted-foreground">vs</span>
            <span className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{setup.fileB.name}</span>
          </div>
          {done && (
            <div className="flex items-center gap-2">
              {[
                { c: "bg-neon-yellow", n: summary.modifiedRows ?? 0, l: "Modified" },
                { c: "bg-neon-green", n: summary.addedRows ?? 0, l: "Added" },
                { c: "bg-neon-red", n: summary.deletedRows ?? 0, l: "Deleted" },
              ].map((s) => (
                <span key={s.l} className="flex items-center gap-2 px-2 py-1 text-sm text-muted-foreground">
                  <span className={cn("size-1.5 rounded-full", s.c)} />
                  {s.n} {s.l}
                </span>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="border-b border-hairline bg-neon-red/5 px-4 py-2 text-xs text-foreground">{error}</div>
        )}

        {!done ? (
          <div className="flex flex-1 items-center justify-center bg-background p-8">
            <div className="w-full max-w-md rounded-md border border-border bg-card p-6 text-center">
              <p className="mb-2 text-sm font-semibold">
                {status?.status === "failed" ? "Comparison failed" : status?.status === "cancelled" ? "Comparison cancelled" : "Comparing files..."}
              </p>
              {running && (
                <>
                  <p className="mb-3 text-xs text-muted-foreground">{status?.progressLabel ?? "Working..."}</p>
                  <div className="h-2 w-full overflow-hidden rounded bg-border">
                    <div className="h-full bg-primary transition-all" style={{ width: `${Math.round((status?.progress ?? 0) * 100)}%` }} />
                  </div>
                </>
              )}
              {status?.status === "failed" && <p className="text-xs text-diff-del">{status.error || "Unknown error"}</p>}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto bg-background">
            <table className="min-w-full border-separate border-spacing-0 font-mono text-[13px] leading-none">
              <thead className="sticky top-0 z-20">
                <tr>
                  <th className="w-24 border-r border-b border-hairline bg-secondary py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Row</th>
                  {columns.length === 0 && (
                    <th className="border-b border-hairline bg-secondary px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Cells</th>
                  )}
                  {columns.map((c) => (
                    <th key={c} className="border-r border-b border-hairline bg-secondary px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayRows.length === 0 && (
                  <tr>
                    <td colSpan={columns.length + 2} className="px-3 py-8 text-center font-sans text-sm text-muted-foreground">No rows match this filter.</td>
                  </tr>
                )}
                {displayRows.map((row) => {
                  const rowKey = String(row.rowNumber);
                  return (
                    <tr key={rowKey} ref={(node) => {
                      if (node) rowRefs.current.set(rowKey, node);
                      else rowRefs.current.delete(rowKey);
                    }} onClick={() => setActive(rowKey)}
                      className={cn("cursor-pointer transition-colors", rowTone[row.status as keyof typeof rowTone] ?? "hover:bg-card/40", active === rowKey && "ring-1 ring-inset ring-ring")}>
                      <td className="sticky left-0 z-10 border-r border-b border-hairline bg-secondary px-2 py-2 text-center text-[10px] text-muted-foreground">
                        {row.rowNumber}
                        <span className={cn("ml-2 inline-block h-1.5 w-1.5 rounded-full align-middle",
                          row.status === "modified" && "bg-neon-yellow",
                          row.status === "added" && "bg-neon-green",
                          row.status === "deleted" && "bg-neon-red")} />
                      </td>
                      {columns.length === 0 && (
                        <td className="border-b border-hairline px-3 py-2 font-sans text-[11px] text-muted-foreground">
                          {row.status === "equal" ? "No changes" : row.changes.length + " change(s)"}
                        </td>
                      )}
                      {columns.map((c, ci) => {
                        const change = row.changes.find((ch) => ch.column === ci);
                        const origVal = row.originalValues?.[ci] ?? "";
                        const changedVal = row.changedValues?.[ci] ?? "";
                        // Added rows have no original values and deleted rows have no
                        // changed values, so redline falls back to whichever side exists.
                        const cellVal =
                          view === "original" ? origVal : view === "changed" ? changedVal : origVal || changedVal;
                        // Added/deleted rows carry a synthetic marker change at column 0
                        // with no values; rendering it would blank out a real cell.
                        const hasChange = !!change && !(change.old === "" && change.new === "");
                        return (
                          <td key={c} className={cn("border-r border-b border-hairline px-3 py-2",
                            hasChange && view === "redline" && "bg-neon-yellow/10",
                            hasChange && view === "original" && "bg-neon-red/10",
                            hasChange && view === "changed" && "bg-neon-green/10")}>
                            {hasChange ? (
                              <>
                                <span className={cn("rounded px-0.5",
                                  change!.type === "modified" && "bg-neon-yellow/20 text-neon-yellow",
                                  change!.type === "added" && "bg-neon-green/20 text-neon-green",
                                  change!.type === "deleted" && "bg-neon-red/20 text-neon-red",
                                  view === "redline" && "font-semibold",
                                  view === "original" && "text-muted-foreground",
                                  kindColor[change!.type as keyof typeof kindColor] ?? "")}>
                                  {view === "redline" ? (
                                    <>
                                      <span className="line-through opacity-60">{change!.old}</span>
                                      <span className="mx-1">→</span>
                                      <span>{change!.new}</span>
                                    </>
                                  ) : view === "original" ? change!.old : change!.new}
                                </span>
                                <span className="ml-2 text-[9px] text-muted-foreground">[{change!.ref}]</span>
                              </>
                            ) : (
                              <span className="text-muted-foreground">{cellVal}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <footer className="flex h-8 shrink-0 items-center justify-between border-t border-hairline bg-card px-3">
          <div className="flex items-center gap-4">
            {done && (
              <>
                <span className="text-[10px] font-medium uppercase tracking-tight text-muted-foreground">
                  {summary.matchedRows ?? 0} matched - {summary.modifiedRows ?? 0} modified - {summary.addedRows ?? 0} added - {summary.deletedRows ?? 0} deleted
                </span>
                <div className="h-3 w-px bg-hairline" />
                <span className="text-[10px] font-medium uppercase tracking-tight text-muted-foreground">{totalRows.toLocaleString()} rows</span>
              </>
            )}
          </div>
          {done && (
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <label className="flex items-center gap-1">
                <span>Rows:</span>
                <select value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                  className="rounded border border-border bg-card px-1 py-0.5 text-[10px] outline-none focus:ring-1 focus:ring-ring">
                  {[25, 50, 100, 250].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
              <div className="h-3 w-px bg-hairline" />
              <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded border border-border px-1.5 py-0.5 hover:text-foreground disabled:opacity-40">Prev</button>
              <span className="font-mono">{page} / {Math.max(1, Math.ceil(totalRows / pageSize))}</span>
              <button disabled={page * pageSize >= totalRows} onClick={() => setPage((p) => p + 1)}
                className="rounded border border-border px-1.5 py-0.5 hover:text-foreground disabled:opacity-40">Next</button>
            </div>
          )}
        </footer>
      </div>

      {/* Changes list sidebar */}
      <aside className="flex w-72 shrink-0 flex-col border-l border-hairline bg-card">
        <div className="flex items-center justify-between border-b border-hairline p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Changes</h3>
          <span className="rounded bg-card px-1.5 py-0.5 font-mono text-[10px]">{done ? totalChanges : "-"} total</span>
        </div>
        <div className="flex-1 divide-y divide-hairline overflow-y-auto">
          {done && rows.length === 0 && <p className="p-4 text-xs text-muted-foreground">No changes to show.</p>}
          {done && rows.map((row) =>
            row.changes.filter((c) => c.type === "added" || c.type === "deleted" || c.type === "modified").map((c) => (
              <button key={c.ref} type="button" onClick={() => setActive(String(row.rowNumber))}
                className={cn("block w-full p-3 text-left transition-colors hover:bg-card/40", active === String(row.rowNumber) && "bg-card/50")}>
                <div className="mb-1 flex items-center justify-between">
                  <span className={cn("font-mono text-[11px] font-semibold", kindColor[c.type as keyof typeof kindColor] ?? "")}>
                    {c.ref} ({c.type})
                  </span>
                  <span className="text-[10px] text-muted-foreground">Row {c.rowNumber}</span>
                </div>
                {c.old || c.new ? (
                  <p className="mt-1 flex items-center gap-2 font-mono text-[10px]">
                    <span className="text-muted-foreground line-through">{c.old || "empty"}</span>
                    <span>{">"}</span>
                    <span className={cn("font-bold", kindColor[c.type as keyof typeof kindColor] ?? "")}>{c.new || "empty"}</span>
                  </p>
                ) : (
                  // Synthetic added/deleted row marker: the ref and type above say it all.
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">Entire row {c.type}</p>
                )}
              </button>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
