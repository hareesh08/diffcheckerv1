import { useState } from "react";
import { cn } from "@/lib/utils";
import { diffLines } from "@/lib/text-diff";
import { uploadFile, getSheets, type UploadedFileMeta } from "@/api";
import type { UploadedFile } from "@/App";

const SAMPLE_A = `id,name,price
1,Mechanical Keyboard,149.00
2,Wireless Mouse,79.00
3,USB-C Cable,19.00`;

const SAMPLE_B = `id,name,price
1,Mechanical Keyboard,149.00
2,Wireless Mouse,89.00
3,USB-C Cable,19.00
4,Webcam 4K,299.00`;

const rowTone = {
  same: "",
  modified: "bg-diff-mod/8",
  added: "bg-diff-add/8",
  deleted: "bg-diff-del/8",
} as const;

type Side = "a" | "b";

export function UploadScreen({ onLoaded }: { onLoaded: (a: UploadedFile | null, b: UploadedFile | null) => void }) {
  const [tab, setTab] = useState<"text" | "excel">("excel");
  const [left, setLeft] = useState(SAMPLE_A);
  const [right, setRight] = useState(SAMPLE_B);
  const [result, setResult] = useState<ReturnType<typeof diffLines> | null>(null);
  const [files, setFiles] = useState<{ a?: UploadedFile; b?: UploadedFile }>({});
  const [busy, setBusy] = useState<{ a?: boolean; b?: boolean }>({});
  const [error, setError] = useState<string | null>(null);

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

  function removeFile(side: Side) { setFiles((f) => ({ ...f, [side]: undefined })); }
  function formatSize(b: number) { return b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : (b / 1024).toFixed(1) + " KB"; }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        {error && (
          <div className="mb-4 rounded-md border border-diff-del/30 bg-diff-del/8 px-3 py-2 text-xs text-foreground">{error}</div>
        )}
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow mb-2">Workspace / New analysis</p>
            <h1 className="text-3xl font-bold tracking-[-0.045em] sm:text-4xl">Compare with confidence.</h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">Load two sources and surface every meaningful change in one calm, focused workspace.</p>
          </div>
          <div className="flex w-full rounded-md bg-accent p-0.5 sm:w-auto">
            {(["excel", "text"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTab(t)}
                className={cn("flex-1 rounded px-2.5 py-1.5 text-xs font-medium capitalize transition-colors sm:flex-none sm:py-1",
                  tab === t ? "bg-surface text-foreground shadow-sm ring-1 ring-hairline" : "text-muted-foreground hover:text-foreground")}>
                {t === "excel" ? "Excel / CSV" : "Plain text"}
              </button>
            ))}
          </div>
        </div>

        {tab === "excel" ? (
          <div className="space-y-4">
            <div className="rounded-md border border-diff-add/30 bg-diff-add/8 px-3 py-2 text-xs text-foreground">
              Compare Excel files and other spreadsheets - .xlsx, .xlsm, .csv, .tsv, .txt
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {(["a", "b"] as const).map((side) => (
                <div key={side}
                  className="clay-card flex h-52 flex-col items-center justify-center gap-3 rounded-2xl border-dashed transition-all hover:-translate-y-0.5 hover:border-primary/50 sm:h-60"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0] as File, side); }}>
                  <label className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-2">
                    <input type="file" accept=".xlsx,.xlsm,.csv,.tsv,.txt" className="hidden" disabled={busy[side]}
                      onChange={(e) => handleFile(e.target.files?.[0] as File, side)} />
                    <div className="grid size-12 place-items-center rounded-2xl bg-primary/10 font-mono text-[10px] font-bold text-primary shadow-inner">XLS</div>
                    <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Source {side.toUpperCase()}</span>
                    {busy[side] ? (
                      <p className="text-xs text-muted-foreground">Uploading...</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">Drop spreadsheet here or <span className="text-foreground underline underline-offset-4">browse</span></p>
                    )}
                  </label>
                </div>
              ))}
            </div>

            {(files.a || files.b) && (
              <div className="space-y-2">
                {(["a", "b"] as const).map((side) =>
                  files[side] && (
                    <div key={side} className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2">
                      <div className="grid size-8 shrink-0 place-items-center rounded border border-hairline bg-grid font-mono text-[10px] text-muted-foreground">XLS</div>
                      <span className="min-w-0 truncate font-mono text-xs text-foreground">{files[side]!.name}</span>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{formatSize(files[side]!.size)}</span>
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Source {side.toUpperCase()}</span>
                      <button type="button" onClick={() => removeFile(side)}
                        className="ml-auto grid size-6 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" title="Remove">x</button>
                    </div>
                  )
                )}
              </div>
            )}

            <div className="flex justify-end">
              <button type="button" disabled={!files.a || !files.b}
                onClick={() => onLoaded(files.a ?? null, files.b ?? null)}
                className="w-full rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-40 sm:w-auto sm:py-1.5">
                Review comparison
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <textarea value={left} onChange={(e) => setLeft(e.target.value)} spellCheck={false}
                className="h-40 resize-none rounded-md border border-border bg-grid p-3 font-mono text-[12px] leading-relaxed outline-none focus:ring-1 focus:ring-ring sm:h-56" />
              <textarea value={right} onChange={(e) => setRight(e.target.value)} spellCheck={false}
                className="h-40 resize-none rounded-md border border-border bg-grid p-3 font-mono text-[12px] leading-relaxed outline-none focus:ring-1 focus:ring-ring sm:h-56" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setResult(diffLines(left, right))}
                className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:py-1.5">
                Find difference
              </button>
              <button type="button" onClick={() => { setLeft(right); setRight(left); }}
                className="rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:py-1.5">
                Swap
              </button>
              <button type="button" onClick={() => { setLeft(""); setRight(""); setResult(null); }}
                className="rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:py-1.5">
                Clear
              </button>
            </div>

            {result && (
              <div className="overflow-x-auto rounded-md border border-border bg-grid">
                <table className="w-full border-separate border-spacing-0 font-mono text-[12px]">
                  <tbody>
                    {result.map((line, i) => (
                      <tr key={i} className={rowTone[line.status]}>
                        <td className="w-10 border-r border-hairline bg-grid-header px-2 py-1 text-right text-[10px] text-muted-foreground">{line.leftNo ?? ""}</td>
                        <td className="w-1/2 border-r border-hairline px-3 py-1 whitespace-pre-wrap">{line.left ?? ""}</td>
                        <td className="w-10 border-r border-hairline bg-grid-header px-2 py-1 text-right text-[10px] text-muted-foreground">{line.rightNo ?? ""}</td>
                        <td className="px-3 py-1 whitespace-pre-wrap">{line.right ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
