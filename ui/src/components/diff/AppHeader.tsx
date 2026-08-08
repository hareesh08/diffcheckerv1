import { cn } from "@/lib/utils";

export type Step = "upload" | "configure" | "results";

const STEPS: { id: Step; label: string }[] = [
  { id: "upload", label: "Upload" },
  { id: "configure", label: "Configure" },
  { id: "results", label: "Results" },
];

export function AppHeader({
  step,
  onStep,
  reached,
}: {
  step: Step;
  onStep: (s: Step) => void;
  reached: Record<Step, boolean>;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-hairline bg-surface px-4">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="grid size-6 place-items-center rounded bg-primary">
            <div className="size-2.5 border-t border-r border-primary-foreground" />
          </div>
          <span className="text-sm font-medium tracking-tight">CellDiff Pro</span>
        </div>
        <nav className="flex items-center gap-1">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1">
              {i > 0 && <div className="h-4 w-px bg-hairline" />}
              <button
                type="button"
                disabled={!reached[s.id]}
                onClick={() => onStep(s.id)}
                className={cn(
                  "rounded-md px-3 py-1 text-sm transition-colors",
                  step === s.id
                    ? "bg-accent font-semibold text-foreground"
                    : "font-medium text-muted-foreground hover:text-foreground",
                  !reached[s.id] && "cursor-not-allowed opacity-40 hover:text-muted-foreground",
                )}
              >
                {s.label}
              </button>
            </div>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Documentation
        </button>
        <div className="size-8 rounded-full bg-accent outline-1 -outline-offset-1 outline-hairline" />
      </div>
    </header>
  );
}
