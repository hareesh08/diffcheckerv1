import { useEffect } from "react";

export type ShortcutMap = Record<string, () => void>;

function normalize(e: KeyboardEvent): string | null {
  const mod = e.metaKey || e.ctrlKey;
  const shift = e.shiftKey;
  const alt = e.altKey;
  if (!mod) return null;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const parts: string[] = [];
  if (shift) parts.push("shift");
  if (alt) parts.push("alt");
  parts.push(key);
  return parts.join("+");
}

export function useKeyboard(shortcuts: ShortcutMap) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const combo = normalize(e);
      if (!combo) return;
      const fn = shortcuts[combo];
      if (fn) {
        e.preventDefault();
        fn();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shortcuts]);
}
