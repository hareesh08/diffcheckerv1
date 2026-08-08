import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Change, ResultRow } from "@/api";

const kindColor = {
  modified: "text-diff-mod",
  added: "text-diff-add",
  deleted: "text-diff-del",
} as const;

const statusBadge = {
  equal: "bg-muted text-muted-foreground",
  modified: "bg-diff-mod/15 text-diff-mod",
  added: "bg-diff-add/15 text-diff-add",
  deleted: "bg-diff-del/15 text-diff-del",
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

export function ResultsCard({
  rows,
  view,
  active,
  onActive,
}: {
  rows: ResultRow[];
  view: "redline" | "original" | "changed";
  active: string | null;
  onActive: (rowNumber: string) => void;
}) {
  return (
    <div className="space-y-2 p-3">
      {rows.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No rows match this filter.
        </p>
      )}
      {rows.map((row) => (
        <ResultCard
          key={row.rowNumber}
          row={row}
          view={view}
          isActive={active === String(row.rowNumber)}
          onToggle={() => onActive(String(row.rowNumber))}
        />
      ))}
    </div>
  );
}

function ResultCard({
  row,
  view,
  isActive,
  onToggle,
}: {
  row: ResultRow;
  view: "redline" | "original" | "changed";
  isActive: boolean;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const maxVisible = 5;

  const totalCols = Math.max(
    row.originalValues?.length ?? 0,
    row.changedValues?.length ?? 0,
  );
  const hasValues = totalCols > 0;

  const changeMap = new Map<number, Change>();
  for (const c of row.changes) {
    // Added/deleted rows carry a synthetic marker change at column 0 with no
    // values; treating it as a real change would blank out an actual cell.
    if (c.old === "" && c.new === "") continue;
    changeMap.set(c.column, c);
  }

  const allCells: { col: number; letter: string; change: Change | null; orig: string; changed: string }[] = [];
  for (let i = 0; i < totalCols; i++) {
    allCells.push({
      col: i,
      letter: colLetter(i + 1),
      change: changeMap.get(i) ?? null,
      orig: row.originalValues?.[i] ?? "",
      changed: row.changedValues?.[i] ?? "",
    });
  }

  const changedCells = allCells.filter((c) => c.change !== null);
  const showExpand = changedCells.length > maxVisible;
  const visibleCells = expanded || !showExpand ? allCells : changedCells;

  return (
    <div
      className={cn(
        "rounded-lg border bg-surface transition-colors",
        isActive ? "border-ring" : "border-border",
        row.status === "modified" && "bg-diff-mod/5",
        row.status === "added" && "bg-diff-add/5",
        row.status === "deleted" && "bg-diff-del/5",
      )}
      onClick={onToggle}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-semibold text-muted-foreground">
            #{row.rowNumber}
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
              statusBadge[row.status as keyof typeof statusBadge] ?? "bg-muted text-muted-foreground",
            )}
          >
            {row.status}
          </span>
        </div>
        {row.status !== "equal" && (
          <span className="text-[10px] text-muted-foreground">
            {row.changes.length} change{row.changes.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="border-t border-hairline px-3 py-2">
        {!hasValues ? (
          <p className="text-xs text-muted-foreground">No cell data</p>
        ) : (
          <div className="space-y-1">
            {visibleCells.map((cell) => (
              <div
                key={cell.col}
                className={cn(
                  "flex items-start gap-2 rounded px-2 py-1.5",
                  cell.change && "bg-diff-mod/8",
                )}
              >
                <span className="shrink-0 font-mono text-[10px] font-semibold text-muted-foreground">
                  {cell.letter}
                </span>
                <div className="min-w-0 flex-1 font-mono text-xs">
                  {cell.change ? (
                    <>
                      {view === "original" ? (
                        <span className="text-muted-foreground">{cell.change.old}</span>
                      ) : view === "changed" ? (
                        <span className={cn("font-semibold", kindColor[cell.change.type as keyof typeof kindColor] ?? "")}>
                          {cell.change.new}
                        </span>
                      ) : (
                        <>
                          <span className="line-through opacity-60">{cell.change.old}</span>
                          <span className="mx-1 text-muted-foreground">→</span>
                          <span className={cn("font-semibold", kindColor[cell.change.type as keyof typeof kindColor] ?? "")}>
                            {cell.change.new}
                          </span>
                        </>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      {/* Deleted rows have no changed values and added rows no original
                          ones, so redline falls back to whichever side exists. */}
                      {view === "original"
                        ? cell.orig
                        : view === "changed"
                          ? cell.changed
                          : cell.orig || cell.changed}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {showExpand && !expanded && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(true);
                }}
                className="mt-1 w-full py-1.5 text-center text-[10px] font-medium text-muted-foreground hover:text-foreground"
              >
                Show all {allCells.length} columns
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
