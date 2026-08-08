import { useState } from "react";
import { cn } from "@/lib/utils";
import type { JobSetup } from "@/App";

function Preview({
  file,
  side,
  sheet,
  onSheet,
  sheets,
}: {
  file: { name: string };
  side: "A" | "B";
  sheet: string;
  onSheet: (v: string) => void;
  sheets: string[];
}) {
  return (
    <div className="clay-card flex flex-col rounded-lg">
      <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
        <span className="min-w-0 truncate font-mono text-[11px] text-foreground">{file.name}</span>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Source {side}
        </span>
      </div>
      <div className="flex items-center gap-2 p-3">
        <div className="flex-1">
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Sheet
          </label>
          <select
            value={sheet}
            onChange={(e) => onSheet(e.target.value)}
            className="w-full rounded border border-border bg-card px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
          >
            {sheets.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

export function ConfigureScreen({
  setup,
  onChange,
  onRun,
}: {
  setup: JobSetup;
  onChange: (s: JobSetup) => void;
  onRun: () => void;
}) {
  const { fileA, fileB, sheetA, sheetB, options } = setup;
  const [mode, setMode] = useState<"table" | "rows">(options.mode);

  function patch(partial: Partial<JobSetup>) {
    onChange({ ...setup, ...partial });
  }

  function patchOptions(partial: Partial<JobSetup["options"]>) {
    onChange({ ...setup, options: { ...setup.options, ...partial } });
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <p className="eyebrow mb-2">Workspace / Configure</p>
        <h1 className="text-3xl font-bold tracking-[-0.045em]">Tune the comparison.</h1>
        <p className="mt-2 mb-8 max-w-lg text-sm leading-relaxed text-muted-foreground">
          Confirm sheets, headers, and match logic before running the engine.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Preview file={fileA} side="A" sheet={sheetA} sheets={fileA.sheets.length ? fileA.sheets : [sheetA]} onSheet={(v) => patch({ sheetA: v })} />
          <Preview file={fileB} side="B" sheet={sheetB} sheets={fileB.sheets.length ? fileB.sheets : [sheetB]} onSheet={(v) => patch({ sheetB: v })} />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:col-span-2">
            {([
              { id: "table" as const, title: "Table — header based", body: "Aligns rows by matching column names. Best when columns move or rows are reordered." },
              { id: "rows" as const, title: "Rows — sequential", body: "Compares index by index. Best for append-only logs and fixed exports." },
            ]).map((m) => (
              <button key={m.id} type="button" onClick={() => { setMode(m.id); patchOptions({ mode: m.id }); }}
                className={cn("flex gap-3 rounded-lg border p-4 text-left transition-all",
                  mode === m.id ? "border-foreground bg-foreground/5" : "border-border bg-card hover:border-muted-foreground")}>
                <div className={cn("mt-0.5 size-3 shrink-0 rounded-full",
                  mode === m.id ? "border-4 border-foreground" : "border border-muted-foreground")} />
                <div>
                  <p className="text-xs font-semibold">{m.title}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{m.body}</p>
                </div>
              </button>
            ))}
          </div>

          <div className="flex flex-col justify-between rounded-lg border border-border bg-card p-4">
            <div className="space-y-2">
              {[
                { label: "Ignore whitespace", on: options.ignoreWhitespace, set: (v: boolean) => patchOptions({ ignoreWhitespace: v }) },
                { label: "Ignore case", on: options.ignoreCase, set: (v: boolean) => patchOptions({ ignoreCase: v }) },
              ].map((t) => (
                <button key={t.label} type="button" onClick={() => t.set(!t.on)} className="flex w-full items-center justify-between py-0.5">
                  <span className="text-[11px] font-medium">{t.label}</span>
                  <span className={cn("relative h-4 w-7 rounded-full transition-colors", t.on ? "bg-foreground" : "bg-border")}>
                    <span className={cn("absolute top-0.5 size-3 rounded-full bg-background transition-all", t.on ? "left-3.5" : "left-0.5")} />
                  </span>
                </button>
              ))}
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Header line</label>
                <input type="number" min={0} value={options.headerRow}
                  onChange={(e) => patchOptions({ headerRow: Number(e.target.value) })}
                  className="w-full rounded border border-border bg-card px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring" />
              </div>
            </div>
            <button type="button" onClick={onRun}
              className="mt-4 w-full rounded bg-neon-green px-3 py-2.5 text-xs font-semibold text-black transition-opacity hover:opacity-90 sm:py-2">
              Run comparison
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
