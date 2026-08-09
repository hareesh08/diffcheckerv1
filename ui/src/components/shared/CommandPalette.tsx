import { useEffect, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { listHistory, type HistoryJob } from "@/api";
import { Plus, History, Sun, Moon, FileText } from "lucide-react";

function fmtDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function CommandPalette({
  open,
  onOpenChange,
  onNewCompare,
  onGotoHistory,
  onOpenJob,
  theme,
  onToggleTheme,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNewCompare: () => void;
  onGotoHistory: () => void;
  onOpenJob: (id: string, mode: string, originalName: string, changedName: string) => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}) {
  const [recent, setRecent] = useState<HistoryJob[]>([]);

  useEffect(() => {
    if (!open) return;
    listHistory()
      .then((d) => setRecent(d.jobs?.slice(0, 5) ?? []))
      .catch(() => {});
  }, [open]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem
            onSelect={() => {
              onNewCompare();
              onOpenChange(false);
            }}
          >
            <Plus className="size-4" />
            New comparison
          </CommandItem>
          <CommandItem
            onSelect={() => {
              onGotoHistory();
              onOpenChange(false);
            }}
          >
            <History className="size-4" />
            View history
          </CommandItem>
          <CommandItem
            onSelect={() => {
              onToggleTheme();
              onOpenChange(false);
            }}
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            {theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          </CommandItem>
        </CommandGroup>
        {recent.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Recent comparisons">
              {recent.map((job) => (
                <CommandItem
                  key={job.id}
                  onSelect={() => {
                    onOpenJob(job.id, job.mode, job.originalName, job.changedName);
                    onOpenChange(false);
                  }}
                >
                  <FileText className="size-4" />
                  <span className="min-w-0 truncate">
                    {job.name || `${job.originalName} vs ${job.changedName}`}
                  </span>
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                    {fmtDate(job.createdAt)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
