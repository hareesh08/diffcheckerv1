import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { downloadBlob, exportResultsNamed, openReport } from "@/api";

export type ExportFormat = "csv" | "jsonl" | "xlsx" | "pdf";

const FORMATS: { id: ExportFormat; label: string; desc: string }[] = [
  { id: "csv", label: "CSV", desc: "Plain text table" },
  { id: "jsonl", label: "JSONL", desc: "Line-delimited JSON" },
  { id: "xlsx", label: "XLSX", desc: "Excel workbook" },
  { id: "pdf", label: "PDF", desc: "Print-ready report" },
];

const FILTERS = [
  { value: "all", label: "All rows" },
  { value: "matches", label: "Matches" },
  { value: "nonmatches", label: "Non-matches" },
  { value: "modified", label: "Modified" },
  { value: "added", label: "Added" },
  { value: "deleted", label: "Deleted" },
];

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "diff"
  );
}

export function ExportDialog({
  open,
  onOpenChange,
  jobId,
  defaultName,
  defaultFilter,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  defaultName: string;
  defaultFilter: string;
}) {
  const [name, setName] = useState("");
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [filter, setFilter] = useState("nonmatches");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(slugify(defaultName));
      setFilter(defaultFilter === "all" ? "nonmatches" : defaultFilter);
      setError(null);
    }
  }, [open, defaultName, defaultFilter]);

  const ext = useMemo(() => (format === "pdf" ? ".html" : "." + format), [format]);

  async function handleExport() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (format === "pdf") {
        openReport(jobId, filter);
      } else {
        const blob = await exportResultsNamed(jobId, name, filter, format);
        downloadBlob(blob, `${slugify(name)}.${format}`);
      }
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Export comparison</DialogTitle>
          <DialogDescription>Choose a file name, format, and scope.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              File name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-comparison"
              className="w-full rounded border border-border bg-card px-2.5 py-1.5 font-mono text-xs outline-none focus:ring-1 focus:ring-ring"
            />
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              {slugify(name) || "diff"}
              {ext}
            </p>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Format
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {FORMATS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFormat(f.id)}
                  className={cn(
                    "rounded border px-2 py-2 text-center transition-colors",
                    format === f.id
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:border-muted-foreground",
                  )}
                >
                  <span className="block text-xs font-semibold">{f.label}</span>
                  <span
                    className={cn(
                      "mt-0.5 block text-[9px] leading-tight",
                      format === f.id ? "text-background/70" : "text-muted-foreground/70",
                    )}
                  >
                    {f.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Rows to include
            </label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full rounded border border-border bg-card px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
            >
              {FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="text-xs text-neon-red">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={busy || !name.trim()}>
            {busy ? "Exporting..." : "Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
