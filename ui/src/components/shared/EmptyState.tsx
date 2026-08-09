import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  subtitle,
  action,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="grid size-14 place-items-center rounded-xl border border-border bg-surface">
        <Icon className="size-6 text-muted-foreground" />
      </div>
      <p className="mt-4 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">{subtitle}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background transition-opacity hover:opacity-90"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
