import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { getSettings, setSettingsLogs } from "@/api";
import { useTheme } from "@/hooks/use-theme";

export function SettingsScreen() {
  const { theme, toggle: toggleTheme } = useTheme();
  const [logs, setLogs] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSettings().then((s) => setLogs(s.logs)).catch(() => {});
  }, []);

  async function handleLogsToggle(next: boolean) {
    setSaving(true);
    try {
      await setSettingsLogs(next);
      setLogs(next);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-hairline bg-surface-raised px-5 py-4">
        <h1 className="text-2xl font-bold tracking-[-0.04em]">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          App preferences and diagnostics.
        </p>
      </div>

      <div className="mx-auto max-w-2xl px-5 py-6">
        <div className="space-y-6">
          {/* Appearance */}
          <section className="rounded-xl border border-hairline bg-card p-4">
            <p className="eyebrow mb-3">Appearance</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Theme</p>
                <p className="text-[11px] text-muted-foreground">
                  Currently using {theme === "dark" ? "dark" : "light"} mode.
                </p>
              </div>
              <button
                type="button"
                onClick={toggleTheme}
                className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:text-foreground"
              >
                Switch to {theme === "dark" ? "light" : "dark"}
              </button>
            </div>
          </section>

          {/* Logging */}
          <section className="rounded-xl border border-hairline bg-card p-4">
            <p className="eyebrow mb-3">Diagnostics</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Request logging</p>
                <p className="text-[11px] text-muted-foreground">
                  Log every HTTP request to the server console.
                </p>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleLogsToggle(!logs)}
                className={cn(
                  "relative h-6 w-11 rounded-full transition-colors",
                  logs ? "bg-amber-500" : "bg-border",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 size-5 rounded-full bg-background transition-all",
                    logs ? "left-[22px]" : "left-0.5",
                  )}
                />
              </button>
            </div>
          </section>

          {/* Shortcuts */}
          <section className="rounded-xl border border-hairline bg-card p-4">
            <p className="eyebrow mb-3">Keyboard shortcuts</p>
            <div className="space-y-2 text-xs text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Command palette</span>
                <span className="font-mono text-[10px]">
                  {navigator.platform?.includes("Mac") ? "⌘" : "Ctrl"}+K
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>New compare</span>
                <span className="font-mono text-[10px]">
                  {navigator.platform?.includes("Mac") ? "⌘" : "Ctrl"}+N
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Toggle theme</span>
                <span className="font-mono text-[10px]">
                  {navigator.platform?.includes("Mac") ? "⌘" : "Ctrl"}+D
                </span>
              </div>
            </div>
          </section>

          {/* About */}
          <section className="rounded-xl border border-hairline bg-card p-4">
            <p className="eyebrow mb-3">About</p>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>Differ Pro — local diff engine for text and spreadsheets.</p>
              <p>Built with Go + React. All processing happens on your machine.</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
