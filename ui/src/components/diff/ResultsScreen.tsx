import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  cancelJob,
  createJob,
  finalizeJob,
  getJobRows,
  getJobStatus,
  type JobStatus,
  type ResultRow,
  type RowsResponse,
  type JobOptionsInput,
} from "@/api";
import type { JobSetup } from "@/App";
import { ExportDialog } from "./ExportDialog";
import { TextDiffView } from "./TextDiffView";
import { FilterBar } from "@/components/shared/FilterBar";
import { ArrowLeft } from "lucide-react";

const kindColor = {
  modified: "text-amber-600 dark:text-amber-400",
  added: "text-emerald-600 dark:text-emerald-400",
  deleted: "text-red-600 dark:text-red-400",
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

export function ResultsScreen({
  setup,
  onBack,
  jobId: existingJobId,
  historySummary,
  onFinished,
}: {
  setup: JobSetup;
  onBack: () => void;
  jobId?: string | null;
  historySummary?: Record<string, number> | null;
  onFinished?: (jobId: string) => void;
}) {
  const [jobId, setJobId] = useState<string | null>(existingJobId ?? null);
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(50);

  const [view, setView] = useState<"redline" | "original" | "changed">("redline");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const started = useRef(false);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());

  useEffect(() => {
    if (expandedRow === null) return;
    const key = String(expandedRow);
    const row = rowRefs.current.get(key);
    if (row) row.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  }, [expandedRow, page]);

  const loadRows = useCallback(async (job: string, pageNum: number, flt: string, ps: number) => {
    try {
      const data: RowsResponse = await getJobRows(job, {
        filter: flt,
        page: pageNum,
        pageSize: ps,
      });
      setRows(data.rows || []);
      setTotalRows(data.totalRows || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load rows");
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (existingJobId) {
      setStatus({
        id: existingJobId,
        status: "completed",
        summary: (historySummary ?? undefined) as JobStatus["summary"],
      } as JobStatus);
      loadRows(existingJobId, 1, "all", pageSize);
      return;
    }
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
              finalizeJob(created.jobId).catch(() => {});
              onFinished?.(created.jobId);
            } else if (j.status === "failed" || j.status === "cancelled") {
              clearInterval(timer);
            }
          } catch {
            /* transient */
          }
        }, 800);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to start comparison");
      }
    })();
  }, [setup, loadRows, existingJobId, onFinished, pageSize, historySummary]);

  useEffect(() => {
    if (jobId && status?.status === "completed") {
      loadRows(jobId, page, filter, pageSize);
    }
  }, [jobId, page, filter, pageSize, status?.status, loadRows]);

  const done = status?.status === "completed";
  const running =
    status?.status === "queued" || status?.status === "parsing" || status?.status === "comparing";
  const isText = setup.options.mode === "text";

  function handleCancel() {
    if (jobId) cancelJob(jobId);
  }

  const summary = status?.summary || {};
  const totalChanges =
    (summary.modifiedCells ?? 0) + (summary.addedRows ?? 0) + (summary.deletedRows ?? 0);

  let totalColumns = 0;
  for (const r of rows) {
    const len = Math.max(r.originalValues?.length ?? 0, r.changedValues?.length ?? 0);
    if (len > totalColumns) totalColumns = len;
  }
  const columns: string[] = [];
  for (let i = 0; i < totalColumns; i++) {
    columns.push(colLetter(i + 1));
  }

  const expandedRowData =
    expandedRow !== null ? rows.find((r) => r.rowNumber === expandedRow) : null;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-hairline bg-surface-raised px-4 py-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Back
          </button>
          <div className="h-4 w-px bg-hairline" />
          {!isText && (
            <div className="flex rounded-md border border-border bg-background p-0.5">
              {(["redline", "original", "changed"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={cn(
                    "rounded px-2.5 py-1 text-xs capitalize transition-colors",
                    view === v
                      ? "bg-foreground text-background font-medium"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
          )}
          <div className="h-4 w-px bg-hairline" />
          <span className="rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
            {setup.fileA.name}
          </span>
          <span className="text-[10px] text-muted-foreground">vs</span>
          <span className="rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
            {setup.fileB.name}
          </span>
        </div>
        {done && (
          <div className="flex items-center gap-2">
            {[
              { c: "bg-amber-500", n: summary.modifiedRows ?? 0, l: "Mod" },
              { c: "bg-emerald-500", n: summary.addedRows ?? 0, l: "Add" },
              { c: "bg-red-500", n: summary.deletedRows ?? 0, l: "Del" },
            ].map((s) => (
              <span
                key={s.l}
                className="flex items-center gap-1.5 px-1.5 text-[11px] text-muted-foreground"
              >
                <span className={cn("size-1.5 rounded-full", s.c)} />
                {s.n} {s.l}
              </span>
            ))}
            <div className="h-4 w-px bg-hairline" />
            <button
              onClick={() => setExportOpen(true)}
              className="rounded-md bg-foreground px-2.5 py-1 text-[10px] font-semibold text-background"
            >
              Export
            </button>
          </div>
        )}
      </div>

      {/* Filter bar */}
      {done && (
        <FilterBar
          counts={{
            total: totalRows,
            matched: summary.matchedRows ?? 0,
            modified: summary.modifiedRows ?? 0,
            added: summary.addedRows ?? 0,
            deleted: summary.deletedRows ?? 0,
          }}
          active={filter}
          onChange={(f) => {
            setFilter(f);
            setPage(1);
            setExpandedRow(null);
          }}
        />
      )}

      {/* Error */}
      {error && (
        <div className="border-b border-hairline bg-destructive/5 px-4 py-2 text-xs text-foreground">
          {error}
        </div>
      )}

      {/* Running state */}
      {!done ? (
        <div className="flex flex-1 items-center justify-center bg-background p-8">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center">
            <p className="mb-2 text-sm font-semibold">
              {status?.status === "failed"
                ? "Comparison failed"
                : status?.status === "cancelled"
                  ? "Comparison cancelled"
                  : "Comparing files..."}
            </p>
            {running && (
              <>
                <p className="mb-3 text-xs text-muted-foreground">
                  {status?.progressLabel ?? "Working..."}
                </p>
                <div className="h-2 w-full overflow-hidden rounded bg-border">
                  <div
                    className="h-full bg-amber-500 transition-all"
                    style={{ width: `${Math.round((status?.progress ?? 0) * 100)}%` }}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="mt-3 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </>
            )}
            {status?.status === "failed" && (
              <p className="mt-2 text-xs text-destructive">{status.error || "Unknown error"}</p>
            )}
            {(status?.status === "failed" || status?.status === "cancelled") && (
              <button
                type="button"
                onClick={onBack}
                className="mt-3 w-full rounded-md bg-foreground px-3 py-2 text-xs font-semibold text-background"
              >
                Back
              </button>
            )}
          </div>
        </div>
      ) : isText ? (
        <TextDiffView rows={rows} />
      ) : (
        /* Table */
        <div className="flex-1 overflow-y-auto bg-background">
          <table className="min-w-full border-separate border-spacing-0 data-cell">
            <thead className="sticky top-0 z-20">
              <tr>
                <th className="w-20 border-r border-b border-hairline bg-secondary py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Row
                </th>
                {columns.length === 0 && (
                  <th className="border-b border-hairline bg-secondary px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Cells
                  </th>
                )}
                {columns.map((c) => (
                  <th
                    key={c}
                    className="border-r border-b border-hairline bg-secondary px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={columns.length + 2}
                    className="px-3 py-8 text-center font-sans text-sm text-muted-foreground"
                  >
                    No rows match this filter.
                  </td>
                </tr>
              )}
              {rows.map((row, idx) => {
                const rowKey = String(row.rowNumber);
                const isExpanded = expandedRow === row.rowNumber;
                return (
                  <>
                    <tr
                      key={rowKey}
                      ref={(node) => {
                        if (node) rowRefs.current.set(rowKey, node);
                        else rowRefs.current.delete(rowKey);
                      }}
                      onClick={() => setExpandedRow(isExpanded ? null : row.rowNumber)}
                      className={cn(
                        "cursor-pointer transition-colors table-row-zebra",
                        row.status === "modified" && "bg-amber-500/5 hover:bg-amber-500/10",
                        row.status === "added" && "bg-emerald-500/5 hover:bg-emerald-500/10",
                        row.status === "deleted" && "bg-red-500/5 hover:bg-red-500/10",
                        isExpanded && "ring-1 ring-inset ring-amber-500/30",
                      )}
                    >
                      <td className="sticky left-0 z-10 border-r border-b border-hairline bg-inherit px-2 py-2 text-center text-[10px] text-muted-foreground">
                        {row.rowNumber}
                        <span
                          className={cn(
                            "ml-2 inline-block h-1.5 w-1.5 rounded-full align-middle",
                            row.status === "modified" && "bg-amber-500",
                            row.status === "added" && "bg-emerald-500",
                            row.status === "deleted" && "bg-red-500",
                          )}
                        />
                      </td>
                      {columns.length === 0 && (
                        <td className="border-b border-hairline px-3 py-2 font-sans text-[11px] text-muted-foreground">
                          {row.status === "equal"
                            ? "No changes"
                            : row.changes.length + " change(s)"}
                        </td>
                      )}
                      {columns.map((c, ci) => {
                        const change = row.changes.find((ch) => ch.column === ci);
                        const origVal = row.originalValues?.[ci] ?? "";
                        const changedVal = row.changedValues?.[ci] ?? "";
                        const cellVal =
                          view === "original"
                            ? origVal
                            : view === "changed"
                              ? changedVal
                              : origVal || changedVal;
                        const hasChange = !!change && !(change.old === "" && change.new === "");
                        return (
                          <td
                            key={c}
                            className={cn(
                              "border-r border-b border-hairline px-3 py-2",
                              hasChange && view === "redline" && "bg-amber-500/10",
                              hasChange && view === "original" && "bg-red-500/10",
                              hasChange && view === "changed" && "bg-emerald-500/10",
                            )}
                          >
                            {hasChange ? (
                              <>
                                <span
                                  className={cn(
                                    "rounded px-0.5",
                                    change!.type === "modified" &&
                                      "bg-amber-500/20 text-amber-600 dark:text-amber-400",
                                    change!.type === "added" &&
                                      "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400",
                                    change!.type === "deleted" &&
                                      "bg-red-500/20 text-red-600 dark:text-red-400",
                                    view === "redline" && "font-semibold",
                                    view === "original" && "text-muted-foreground",
                                    kindColor[change!.type as keyof typeof kindColor] ?? "",
                                  )}
                                >
                                  {view === "redline" ? (
                                    <>
                                      <span className="line-through opacity-60">{change!.old}</span>
                                      <span className="mx-1">→</span>
                                      <span>{change!.new}</span>
                                    </>
                                  ) : view === "original" ? (
                                    change!.old
                                  ) : (
                                    change!.new
                                  )}
                                </span>
                                <span className="ml-2 text-[9px] text-muted-foreground">
                                  [{change!.ref}]
                                </span>
                              </>
                            ) : (
                              <span className="text-muted-foreground">{cellVal}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    {/* Expanded row detail */}
                    {isExpanded && expandedRowData && (
                      <tr key={`${rowKey}-detail`}>
                        <td
                          colSpan={columns.length + 2}
                          className="border-b border-hairline bg-accent/50 px-6 py-3"
                        >
                          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Row {expandedRowData.rowNumber} detail
                          </p>
                          <div className="space-y-1.5">
                            {expandedRowData.changes
                              .filter(
                                (c) =>
                                  (c.type === "modified" ||
                                    c.type === "added" ||
                                    c.type === "deleted") &&
                                  !(c.old === "" && c.new === ""),
                              )
                              .map((c) => (
                                <div key={c.ref} className="flex items-center gap-3">
                                  <span
                                    className={cn(
                                      "shrink-0 font-mono text-[11px] font-semibold",
                                      kindColor[c.type as keyof typeof kindColor] ?? "",
                                    )}
                                  >
                                    {c.ref}
                                  </span>
                                  <span className="font-mono text-[11px] text-muted-foreground line-through">
                                    {c.old || "empty"}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">→</span>
                                  <span
                                    className={cn(
                                      "font-mono text-[11px] font-semibold",
                                      kindColor[c.type as keyof typeof kindColor] ?? "",
                                    )}
                                  >
                                    {c.new || "empty"}
                                  </span>
                                </div>
                              ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      {done && (
        <footer className="flex h-9 shrink-0 items-center justify-between border-t border-hairline bg-card px-4">
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-medium uppercase tracking-tight text-muted-foreground">
              {summary.matchedRows ?? 0} matched · {summary.modifiedRows ?? 0} modified ·{" "}
              {summary.addedRows ?? 0} added · {summary.deletedRows ?? 0} deleted
            </span>
            <div className="h-3 w-px bg-hairline" />
            <span className="text-[10px] font-medium uppercase tracking-tight text-muted-foreground">
              {totalRows.toLocaleString()} rows
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <label className="flex items-center gap-1">
              <span>Rows:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded-md border border-border bg-card px-1 py-0.5 text-[10px] outline-none focus:ring-1 focus:ring-amber-500/40"
              >
                {[25, 50, 100, 250].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <div className="h-3 w-px bg-hairline" />
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md border border-border px-1.5 py-0.5 hover:text-foreground disabled:opacity-40"
            >
              Prev
            </button>
            <span className="font-mono">
              {page} / {Math.max(1, Math.ceil(totalRows / pageSize))}
            </span>
            <button
              disabled={page * pageSize >= totalRows}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-border px-1.5 py-0.5 hover:text-foreground disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </footer>
      )}

      {jobId && (
        <ExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          jobId={jobId}
          defaultName={`${setup.fileA.name}-vs-${setup.fileB.name}`}
          defaultFilter={filter}
        />
      )}
    </div>
  );
}
