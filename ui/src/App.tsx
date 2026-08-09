import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Plus, History, Download, Sun, Moon, BookOpen, Power } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { useKeyboard } from "@/hooks/use-keyboard";
import { CommandPalette } from "@/components/shared/CommandPalette";
import { HubScreen } from "@/components/screens/HubScreen";
import { CompareScreen } from "@/components/screens/CompareScreen";
import { ResultsScreen } from "@/components/diff/ResultsScreen";
import { HistoryScreen } from "@/components/diff/HistoryScreen";
import { ExportsScreen } from "@/components/diff/ExportsScreen";
import { DocsDrawer } from "@/components/diff/DocsDrawer";
import { shutdownServer } from "@/api";

export type UploadedFile = {
  path: string;
  name: string;
  size: number;
  sheets: string[];
};

export type JobSetup = {
  fileA: UploadedFile;
  fileB: UploadedFile;
  sheetA: string;
  sheetB: string;
  options: {
    mode: "table" | "rows";
    ignoreWhitespace: boolean;
    ignoreCase: boolean;
    headerRow: number;
    rowKeyColumn: string;
  };
};

type View = "hub" | "compare" | "history" | "exports";

export default function App() {
  const [view, setView] = useState<View>("hub");
  const [compareStage, setCompareStage] = useState<"setup" | "results">("setup");
  const [setup, setSetup] = useState<JobSetup | null>(null);
  const [historyJobId, setHistoryJobId] = useState<string | null>(null);
  const { theme, toggle: toggleTheme } = useTheme();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);

  const shortcuts = useMemo(
    () => ({
      k: () => setCmdOpen((o) => !o),
      n: () => {
        setView("compare");
        setCompareStage("setup");
        setHistoryJobId(null);
        setSetup(null);
      },
      d: toggleTheme,
    }),
    [toggleTheme],
  );
  useKeyboard(shortcuts);

  function openHistoryJob(id: string) {
    setHistoryJobId(id);
    setCompareStage("results");
    setView("compare");
  }

  function goCompare() {
    setView("compare");
    setCompareStage("setup");
    setHistoryJobId(null);
    setSetup(null);
  }

  const modKey = navigator.platform?.includes("Mac") ? "⌘" : "Ctrl";

  const NAV: { id: View; label: string; icon: typeof Plus }[] = [
    { id: "compare", label: "New Compare", icon: Plus },
    { id: "history", label: "History", icon: History },
    { id: "exports", label: "Exports", icon: Download },
  ];

  return (
    <div className="flex h-screen w-full flex-col bg-background font-sans text-foreground">
      {/* Header */}
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-hairline bg-surface-raised/80 px-4 backdrop-blur-xl">
        <div className="flex items-center gap-2.5">
          <div className="grid size-6 shrink-0 place-items-center rounded-md bg-foreground text-background">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="size-3.5">
              <path d="M7 8l-4 4 4 4M17 8l4 4-4 4M14 4l-4 16" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-sm font-semibold tracking-[-0.02em]">
            Differ <span className="text-amber-500 dark:text-amber-400">Pro</span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCmdOpen(true)}
            className="flex items-center gap-1.5 rounded border border-border bg-background px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="font-mono">{modKey}+K</span>
            <span className="hidden sm:inline">search</span>
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setDocsOpen(true)}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <BookOpen className="size-3.5" />
          </button>
          <div className="h-4 w-px bg-hairline mx-0.5" />
          <div className="grid size-7 place-items-center rounded-full bg-amber-500/10 text-[10px] font-bold text-amber-600 dark:text-amber-400">
            H
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <nav className="flex w-48 shrink-0 flex-col border-r border-hairline bg-surface">
          <div className="flex-1 p-2">
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === "compare") goCompare();
                  else setView(item.id);
                }}
                className={cn(
                  "sidebar-item w-full",
                  view === item.id && compareStage === "setup"
                    ? "[aria-current='page']"
                    : "",
                )}
              >
                <item.icon className="size-4 shrink-0" />
                {item.label}
              </button>
            ))}
          </div>
          <div className="border-t border-hairline p-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="sidebar-item w-full"
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
          </div>
        </nav>

        {/* Main content */}
        <main className="flex min-w-0 flex-1 flex-col">
          {view === "hub" && <HubScreen onNewCompare={goCompare} onOpenJob={openHistoryJob} />}

          {view === "compare" && compareStage === "setup" && (
            <CompareScreen
              onRun={(s) => {
                setSetup(s);
                setCompareStage("results");
              }}
            />
          )}

          {view === "compare" && compareStage === "results" && setup && (
            <ResultsScreen
              setup={setup}
              onBack={() => setCompareStage("setup")}
              jobId={historyJobId}
              onFinished={() => setHistoryJobId(null)}
            />
          )}

          {view === "history" && <HistoryScreen onOpen={openHistoryJob} />}

          {view === "exports" && <ExportsScreen />}
        </main>
      </div>

      <CommandPalette
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        onNewCompare={goCompare}
        onGotoHistory={() => setView("history")}
        onOpenJob={openHistoryJob}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      <DocsDrawer open={docsOpen} onOpenChange={setDocsOpen} />
    </div>
  );
}
