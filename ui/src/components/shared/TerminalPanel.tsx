import { useEffect, useRef, useState } from "react";

export function TerminalPanel({ logs, onClear }: { logs: string[]; onClear: () => void }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="mt-4 flex flex-col overflow-hidden rounded-lg border border-hairline bg-surface-sunken">
      <div className="flex items-center justify-between border-b border-hairline px-3 py-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Terminal output
        </span>
        <button
          type="button"
          onClick={onClear}
          className="text-[10px] text-muted-foreground hover:text-foreground"
        >
          Clear
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto overflow-x-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-emerald-600 dark:text-emerald-400">
        {logs.length === 0 ? (
          <p className="text-muted-foreground">No logs yet. Toggle logging on to see output.</p>
        ) : (
          logs.map((line, i) => (
            <div key={i} className="whitespace-pre">
              {line}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
