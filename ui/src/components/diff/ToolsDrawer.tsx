import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";
import type { Change, ResultRow } from "@/api";

const kindColor = {
  modified: "text-diff-mod",
  added: "text-diff-add",
  deleted: "text-diff-del",
} as const;

export function ToolsDrawer({
  open,
  onOpenChange,
  filter,
  onFilterChange,
  onExport,
  rows,
  totalChanges,
  setup,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  filter: string;
  onFilterChange: (f: string) => void;
  onExport: (format: "csv" | "jsonl") => void;
  rows: ResultRow[];
  totalChanges: number;
  setup: { fileA: { name: string }; fileB: { name: string } };
}) {
  const [tab, setTab] = useState<"filter" | "export" | "changes">("filter");

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[80vh]">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="text-sm">Tools</DrawerTitle>
        </DrawerHeader>

        <div className="flex border-b border-hairline px-4">
          {(["filter", "export", "changes"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "relative px-3 py-2 text-xs font-medium capitalize transition-colors",
                tab === t ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {t}
              {tab === t && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
              )}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto px-4 py-3" style={{ maxHeight: "50vh" }}>
          {tab === "filter" && (
            <div className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Filter rows
              </p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "all", label: "All rows" },
                  { value: "matches", label: "Matches" },
                  { value: "nonmatches", label: "Non-matches" },
                  { value: "modified", label: "Modified" },
                  { value: "added", label: "Added" },
                  { value: "deleted", label: "Deleted" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onFilterChange(opt.value)}
                    className={cn(
                      "rounded-md border px-3 py-2 text-xs font-medium transition-colors",
                      filter === opt.value
                        ? "border-foreground bg-accent text-foreground"
                        : "border-border text-muted-foreground hover:border-muted-foreground",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="pt-2">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Sources
                </p>
                <div className="space-y-1 font-mono text-[10px] text-muted-foreground">
                  <p className="truncate rounded bg-accent/60 px-2 py-1.5">
                    {setup.fileA.name}
                  </p>
                  <p className="truncate rounded bg-accent/60 px-2 py-1.5">
                    {setup.fileB.name}
                  </p>
                </div>
              </div>
            </div>
          )}

          {tab === "export" && (
            <div className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Export results
              </p>
              <button
                type="button"
                onClick={() => onExport("jsonl")}
                className="w-full rounded-md bg-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground shadow-sm"
              >
                Export JSONL
              </button>
              <button
                type="button"
                onClick={() => onExport("csv")}
                className="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Export CSV
              </button>
            </div>
          )}

          {tab === "changes" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Changes
                </p>
                <span className="rounded bg-accent px-1.5 py-0.5 font-mono text-[10px]">
                  {totalChanges} total
                </span>
              </div>
              {rows.length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  No changes to show.
                </p>
              )}
              <div className="divide-y divide-hairline">
                {rows.map((row) =>
                  row.changes
                    .filter(
                      (c: Change) =>
                        c.type === "added" ||
                        c.type === "deleted" ||
                        c.type === "modified",
                    )
                    .map((c: Change) => (
                      <div key={c.ref} className="py-2.5">
                        <div className="mb-1 flex items-center justify-between">
                          <span
                            className={cn(
                              "font-mono text-[11px] font-semibold",
                              kindColor[c.type as keyof typeof kindColor] ?? "",
                            )}
                          >
                            {c.ref} ({c.type})
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            Row {c.rowNumber}
                          </span>
                        </div>
                        {(c.type === "modified" ||
                          c.type === "added" ||
                          c.type === "deleted") && (
                          <p className="flex items-center gap-2 font-mono text-[10px]">
                            <span className="text-muted-foreground line-through">
                              {c.old || "null"}
                            </span>
                            <span>{">"}</span>
                            <span
                              className={cn(
                                "font-bold",
                                kindColor[c.type as keyof typeof kindColor] ?? "",
                              )}
                            >
                              {c.new || "null"}
                            </span>
                          </p>
                        )}
                      </div>
                    )),
                )}
              </div>
            </div>
          )}
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
