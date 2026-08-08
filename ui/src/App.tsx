import { useState } from "react";
import { AppHeader, type Step } from "@/components/diff/AppHeader";
import { UploadScreen } from "@/components/diff/UploadScreen";
import { ConfigureScreen } from "@/components/diff/ConfigureScreen";
import { ResultsScreen } from "@/components/diff/ResultsScreen";
import { useTheme } from "@/hooks/use-theme";

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

export default function App() {
  const [step, setStep] = useState<Step>("upload");
  const [reached, setReached] = useState<Record<Step, boolean>>({
    upload: true,
    configure: false,
    results: false,
  });
  const [setup, setSetup] = useState<JobSetup | null>(null);
  const { theme, toggle: toggleTheme } = useTheme();

  return (
    <div className="flex h-screen w-full flex-col bg-background font-sans text-foreground">
      <AppHeader
        step={step}
        onStep={(s) => {
          window.scrollTo(0, 0);
          setStep(s);
        }}
        reached={reached}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      {step === "upload" && (
        <UploadScreen
          onLoaded={(a, b) => {
            setSetup(a && b ? { fileA: a, fileB: b, sheetA: a.sheets[0] ?? "", sheetB: b.sheets[0] ?? "", options: { mode: "table", ignoreWhitespace: true, ignoreCase: false, headerRow: 1, rowKeyColumn: "" } } : null);
            setReached((r) => ({ ...r, configure: true }));
            setStep("configure");
          }}
        />
      )}
      {step === "configure" && setup && (
        <ConfigureScreen
          setup={setup}
          onChange={setSetup}
          onRun={() => {
            setReached((r) => ({ ...r, results: true }));
            setStep("results");
          }}
        />
      )}
      {step === "results" && setup && (
        <ResultsScreen setup={setup} onBack={() => setStep("configure")} />
      )}
    </div>
  );
}
