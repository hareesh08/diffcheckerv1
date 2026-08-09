import type { ResultRow } from "@/api";
import { cn } from "@/lib/utils";

export function TextDiffView({ rows }: { rows: ResultRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background p-8">
        <p className="text-sm text-muted-foreground">No lines match this filter.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-background">
      <table className="min-w-full border-separate border-spacing-0 font-mono text-[12px] leading-relaxed">
        <thead className="sticky top-0 z-20">
          <tr>
            <th className="w-20 border-b border-r border-hairline bg-secondary py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Line
            </th>
            <th className="w-1/2 border-b border-r border-hairline bg-secondary px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-red-600/70 dark:text-red-400/70">
              Original
            </th>
            <th className="w-1/2 border-b border-hairline bg-secondary px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-emerald-600/70 dark:text-emerald-400/70">
              Changed
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const old = row.originalValues?.[0] ?? "";
            const changed = row.changedValues?.[0] ?? "";
            const equal = row.status === "equal";
            const deleted = row.status === "deleted";
            const added = row.status === "added";
            return (
              <tr
                key={row.rowNumber}
                className={cn(
                  "align-top",
                  equal && "table-row-zebra text-muted-foreground",
                  (deleted || row.status === "modified") && "bg-red-500/5",
                  added && "bg-emerald-500/5",
                )}
              >
                <td className="border-r border-b border-hairline px-2 py-0.5 text-right text-[10px] text-muted-foreground select-none">
                  {row.rowNumber}
                </td>
                <td
                  className={cn(
                    "border-r border-b border-hairline whitespace-pre px-3 py-0.5",
                    deleted && "bg-red-500/10 text-red-600 dark:text-red-400",
                    row.status === "modified" && "bg-red-500/10 text-red-600 dark:text-red-400",
                  )}
                >
                  {deleted || row.status === "modified" ? (
                    <span className="line-through opacity-80">{old}</span>
                  ) : (
                    <span className={equal ? "text-muted-foreground" : ""}>{old}</span>
                  )}
                </td>
                <td
                  className={cn(
                    "border-b border-hairline whitespace-pre px-3 py-0.5",
                    added && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                    row.status === "modified" &&
                      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                  )}
                >
                  {added || row.status === "modified" ? (
                    <span>{changed}</span>
                  ) : (
                    <span className={equal ? "text-muted-foreground" : ""}>{changed}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
