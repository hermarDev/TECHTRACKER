"use client";

import * as React from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";

type ThemePref = "light" | "dark" | "system";

function applyTheme(pref: ThemePref) {
  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = pref === "dark" || (pref === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", isDark);
  document.documentElement.style.colorScheme = isDark ? "dark" : "light";
}

export function ThemeToggle() {
  const [pref, setPref] = React.useState<ThemePref>("system");

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem("techtracker_theme") as ThemePref | null;
      if (saved === "light" || saved === "dark" || saved === "system") {
        setPref(saved);
      }
    } catch {
      // ignore
    }

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handleMq = () => {
      try {
        const cur = localStorage.getItem("techtracker_theme");
        if (!cur || cur === "system") applyTheme("system");
      } catch {
        applyTheme("system");
      }
    };
    mq.addEventListener("change", handleMq);
    return () => mq.removeEventListener("change", handleMq);
  }, []);

  const toggleLightDark = () => {
    const isDarkNow = document.documentElement.classList.contains("dark");
    const next: ThemePref = isDarkNow ? "light" : "dark";
    setPref(next);
    try {
      localStorage.setItem("techtracker_theme", next);
    } catch {
      // ignore
    }
    applyTheme(next);
  };

  const setSystem = () => {
    setPref("system");
    try {
      localStorage.setItem("techtracker_theme", "system");
    } catch {
      // ignore
    }
    applyTheme("system");
  };

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={toggleLightDark}
        aria-label="Toggle light or dark theme"
        title="Switch light / dark theme"
        className="size-10 rounded-md"
      >
        <Sun className="size-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute size-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
      </Button>
      <Button
        type="button"
        variant={pref === "system" ? "secondary" : "ghost"}
        size="icon"
        onClick={setSystem}
        aria-label="Use system theme"
        aria-pressed={pref === "system"}
        title="Follow system theme"
        className="size-10 rounded-md"
      >
        <Monitor className="size-4" />
      </Button>
    </div>
  );
}
