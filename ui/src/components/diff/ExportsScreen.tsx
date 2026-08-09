import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { listExports, deleteExport, type ExportRecord } from "@/api";
import { EmptyState } from "@/components/shared/EmptyState";
import { Download, X } from "lucide-react";

const formatColor: Record<string, string> = {
  csv: "bg-neon-green/10 text-neon-green",
  jsonl: "bg-neon-blue/10 text-neon-blue",
  xlsx: "bg-neon-green/10 text-neon-green",
  pdf: "bg-neon-red/10 text-neon-red",
};

function fmtDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ExportsScreen() {
  const [exports, setExports] = useState<ExportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listExports();
      setExports(data.exports || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load exports");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleDelete(id: number) {
    try {
      await deleteExport(id);
      setExports((prev) => prev.filter((e) => e.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-hairline bg-card px-5 py-4">
        <h1 className="text-2xl font-bold tracking-[-0.04em]">Exported files</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every file you exported from a comparison, with its custom name.
        </p>
      </div>

      {error && (
        <div className="border-b border-hairline bg-neon-red/5 px-5 py-2 text-xs text-foreground">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Loading...</p>
        ) : exports.length === 0 ? (
          <EmptyState
            icon={Download}
            title="No exports yet"
            subtitle="Exports you create from a comparison will appear here."
          />
        ) : (
          <div className="mx-auto max-w-3xl px-5 py-6">
            <div className="space-y-2">
              {exports.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center gap-3 rounded border border-border bg-card px-3 py-2.5"
                >
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase",
                      formatColor[e.format] ?? "bg-neutral-500/10 text-neutral-500",
                    )}
                  >
                    {e.format}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs font-semibold text-foreground">
                      {e.name}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                      {e.filter} filter · {fmtDate(e.createdAt)}
                    </p>
                  </div>
                  {e.jobId && (
                    <span className="shrink-0 font-mono text-[9px] text-muted-foreground">
                      job {e.jobId.slice(0, 8)}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(e.id)}
                    className="shrink-0 grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    title="Delete"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
