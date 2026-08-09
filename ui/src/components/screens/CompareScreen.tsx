import { useState } from "react";
import { cn } from "@/lib/utils";
import type { JobSetup } from "@/App";
import { uploadFile, getSheets, type UploadedFileMeta } from "@/api";
import { Plus, ArrowRight, X } from "lucide-react";

type Side = "a" | "b";

export function CompareScreen({
  onRun,
  initialSetup,
}: {
  onRun: (setup: JobSetup) => void;
  initialSetup?: JobSetup | null;
}) {
  const [files, setFiles] = useState<{
    a?: { path: string; name: string; size: number; sheets: string[] };
    b?: { path: string; name: string; size: number; sheets: string[] };
  }>({
    a: initialSetup ? { ...initialSetup.fileA, sheets: [initialSetup.sheetA] } : undefined,
    b: initialSetup ? { ...initialSetup.fileB, sheets: [initialSetup.sheetB] } : undefined,
  });
  const [busy, setBusy] = useState<{ a?: boolean; b?: boolean }>({});
  const [error, setError] = useState<string | null>(null);
  const [sheetA, setSheetA] = useState(initialSetup?.sheetA ?? "");
  const [sheetB, setSheetB] = useState(initialSetup?.sheetB ?? "");
  const [mode, setMode] = useState<"table" | "rows">(initialSetup?.options.mode ?? "table");
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(
    initialSetup?.options.ignoreWhitespace ?? true,
  );
  const [ignoreCase, setIgnoreCase] = useState(initialSetup?.options.ignoreCase ?? false);
  const [headerRow, setHeaderRow] = useState(initialSetup?.options.headerRow ?? 1);

  const ready = files.a && files.b;

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
      if (side === "a" && sheets.sheets[0]) setSheetA(sheets.sheets[0]);
      if (side === "b" && sheets.sheets[0]) setSheetB(sheets.sheets[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy((b) => ({ ...b, [side]: false }));
    }
  }

  function handleRun() {
    if (!files.a || !files.b) return;
    onRun({
      fileA: { path: files.a.path, name: files.a.name, size: files.a.size, sheets: files.a.sheets },
      fileB: { path: files.b.path, name: files.b.name, size: files.b.size, sheets: files.b.sheets },
      sheetA: sheetA || files.a.sheets[0] || "",
      sheetB: sheetB || files.b.sheets[0] || "",
      options: { mode, ignoreWhitespace, ignoreCase, headerRow, rowKeyColumn: "" },
    });
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        {error && (
          <div className="mb-4 rounded border border-neon-red/30 bg-neon-red/5 px-3 py-2 text-xs text-foreground">
            {error}
          </div>
        )}

        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-[-0.045em] sm:text-4xl">New comparison</h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            Drop two files below, then run the comparison.
          </p>
        </div>

        {/* Drop zones */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {(["a", "b"] as const).map((side) => (
            <div
              key={side}
              className={cn(
                "flex flex-col rounded-lg border transition-all",
                files[side]
                  ? "border-neon-green/30 bg-neon-green/5"
                  : "border-dashed border-border bg-card hover:border-neon-blue/60",
              )}
            >
              {files[side] ? (
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="grid size-8 shrink-0 place-items-center rounded border border-border bg-background font-mono text-[10px] font-bold text-muted-foreground">
                    XLS
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
                    className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ) : (
                <label className="flex h-32 cursor-pointer flex-col items-center justify-center gap-2 sm:h-40">
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
                      <Plus className="size-5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        Drop{" "}
                        <span className="font-semibold text-foreground">
                          Source {side.toUpperCase()}
                        </span>{" "}
                        or <span className="underline underline-offset-4">browse</span>
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground/60">
                        .xlsx .xlsm .csv .tsv .txt
                      </span>
                    </>
                  )}
                </label>
              )}
            </div>
          ))}
        </div>

        {/* Options — progressive disclosure */}
        {ready && (
          <div className="mt-6 space-y-4 rounded-lg border border-border bg-card p-4 sm:p-5">
            <p className="eyebrow mb-2">Options</p>

            {/* Sheet selectors */}
            {(files.a!.sheets.length > 1 || files.b!.sheets.length > 1) && (
              <div className="grid grid-cols-2 gap-3">
                {(["a", "b"] as const).map((side) => (
                  <div key={side}>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Sheet {side.toUpperCase()}
                    </label>
                    <select
                      value={side === "a" ? sheetA : sheetB}
                      onChange={(e) =>
                        side === "a" ? setSheetA(e.target.value) : setSheetB(e.target.value)
                      }
                      className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
                    >
                      {files[side]!.sheets.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}

            {/* Mode */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                {
                  id: "table" as const,
                  title: "Table — header based",
                  body: "Aligns rows by matching column names.",
                },
                {
                  id: "rows" as const,
                  title: "Rows — sequential",
                  body: "Compares index by index.",
                },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={cn(
                    "flex gap-3 rounded-lg border p-3 text-left transition-all",
                    mode === m.id
                      ? "border-foreground bg-foreground/5"
                      : "border-border hover:border-muted-foreground",
                  )}
                >
                  <div
                    className={cn(
                      "mt-0.5 size-3 shrink-0 rounded-full",
                      mode === m.id
                        ? "border-4 border-foreground"
                        : "border border-muted-foreground",
                    )}
                  />
                  <div>
                    <p className="text-xs font-semibold">{m.title}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                      {m.body}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            {/* Toggle options */}
            <div className="flex flex-wrap items-center gap-4">
              {[
                { label: "Ignore whitespace", on: ignoreWhitespace, set: setIgnoreWhitespace },
                { label: "Ignore case", on: ignoreCase, set: setIgnoreCase },
              ].map((t) => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => t.set(!t.on)}
                  className="flex items-center gap-2"
                >
                  <span
                    className={cn(
                      "relative h-4 w-7 rounded-full transition-colors",
                      t.on ? "bg-foreground" : "bg-border",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 size-3 rounded-full bg-background transition-all",
                        t.on ? "left-3.5" : "left-0.5",
                      )}
                    />
                  </span>
                  <span className="text-[11px] font-medium">{t.label}</span>
                </button>
              ))}
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Header line
                </label>
                <input
                  type="number"
                  min={0}
                  value={headerRow}
                  onChange={(e) => setHeaderRow(Number(e.target.value))}
                  className="w-14 rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
          </div>
        )}

        {/* Run button */}
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            disabled={!ready}
            onClick={handleRun}
            className="flex items-center gap-2 rounded bg-neon-green px-4 py-2.5 text-xs font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Run comparison <ArrowRight className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
