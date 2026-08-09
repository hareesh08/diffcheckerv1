import { cn } from "@/lib/utils";

export type FilterKind = "all" | "matches" | "nonmatches" | "modified" | "added" | "deleted";

export function FilterBar({
  counts,
  active,
  onChange,
}: {
  counts: { total: number; matched: number; modified: number; added: number; deleted: number };
  active: string;
  onChange: (f: FilterKind) => void;
}) {
  const items: { id: FilterKind; label: string; count: number; color?: string }[] = [
    { id: "all", label: "All", count: counts.total },
    { id: "modified", label: "Modified", count: counts.modified, color: "bg-amber-500" },
    { id: "added", label: "Added", count: counts.added, color: "bg-emerald-500" },
    { id: "deleted", label: "Deleted", count: counts.deleted, color: "bg-red-500" },
    { id: "matches", label: "Matches", count: counts.matched },
  ];

  return (
    <div className="flex items-center gap-1 overflow-x-auto px-4 py-2">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
            active === item.id
              ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground",
          )}
        >
          {item.color && <span className={cn("size-1.5 rounded-full", item.color)} />}
          {item.label}
          <span className="font-mono text-[10px] opacity-60">{item.count}</span>
        </button>
      ))}
    </div>
  );
}
