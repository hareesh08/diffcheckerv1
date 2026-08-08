import { useState } from "react";
import { cn } from "@/lib/utils";
import { useIsDesktop } from "@/hooks/use-mobile";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";
import { Menu, BookOpen } from "lucide-react";
import { DocsDrawer } from "./DocsDrawer";

export type Step = "upload" | "configure" | "results";

const STEPS: { id: Step; label: string }[] = [
  { id: "upload", label: "Sources" },
  { id: "configure", label: "Review" },
  { id: "results", label: "Insights" },
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
  const isDesktop = useIsDesktop();
  const [menuOpen, setMenuOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);

  function handleNav(s: Step) {
    if (!reached[s]) return;
    onStep(s);
    setMenuOpen(false);
  }

  if (isDesktop) {
    return (
      <>
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-hairline bg-surface/80 px-5 backdrop-blur-xl">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <img
              src="/logo.svg"
              alt="Differ Pro"
              className="size-6 shrink-0 rounded bg-surface"
            />
            <span className="text-[15px] font-bold tracking-[-0.03em]">Differ <span className="text-primary">Pro</span></span>
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
                      ? "bg-primary/10 font-semibold text-primary shadow-sm"
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
            onClick={() => setDocsOpen(true)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <BookOpen className="size-3.5" />
            Documentation
          </button>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs font-medium text-muted-foreground md:block">
              Hareesh D
            </span>
            <div className="grid size-9 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary shadow-sm">
              H
            </div>
          </div>
        </div>
      </header>
      <DocsDrawer open={docsOpen} onOpenChange={setDocsOpen} />
      </>
    );
  }

  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-hairline bg-surface/80 px-4 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <img
            src="/logo.svg"
            alt="Differ Pro"
            className="size-6 shrink-0 rounded bg-surface"
          />
          <span className="text-[15px] font-bold tracking-[-0.03em]">Differ <span className="text-primary">Pro</span></span>
        </div>
        <div className="flex items-center gap-1">
          <span className="mr-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {STEPS.find((s) => s.id === step)?.label}
          </span>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Menu className="size-4" />
          </button>
        </div>
      </header>

      <Drawer open={menuOpen} onOpenChange={setMenuOpen}>
        <DrawerContent>
          <DrawerHeader className="pb-2">
            <DrawerTitle className="text-sm">Navigation</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-4">
            {STEPS.map((s, i) => (
              <div key={s.id}>
                {i > 0 && <div className="my-1 h-px bg-hairline" />}
                <button
                  type="button"
                  disabled={!reached[s.id]}
                  onClick={() => handleNav(s.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-3 text-left transition-colors",
                    step === s.id
                      ? "bg-accent font-semibold text-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                    !reached[s.id] && "cursor-not-allowed opacity-40",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold",
                      step === s.id
                        ? "bg-foreground text-background"
                        : "bg-accent text-muted-foreground",
                    )}
                  >
                    {i + 1}
                  </span>
                  {s.label}
                </button>
              </div>
            ))}
          </div>
          <div className="border-t border-hairline px-4 py-2">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setDocsOpen(true);
              }}
              className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left transition-colors text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            >
              <BookOpen className="size-4" />
              Documentation
            </button>
          </div>
        </DrawerContent>
      </Drawer>
      <DocsDrawer open={docsOpen} onOpenChange={setDocsOpen} />
    </>
  );
}
