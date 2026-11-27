"use client";

import * as React from "react";
import { Moon, Monitor } from "lucide-react";

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

function setPref(pref: ThemePref) {
  try {
    localStorage.setItem("techtracker_theme", pref);
  } catch {
    // ignore
  }
  applyTheme(pref);
  window.dispatchEvent(new Event("techtracker-theme-change"));
}

export function ThemeToggle() {
  const pref = React.useSyncExternalStore<ThemePref>(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => {};
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handleStorage = (e: StorageEvent) => {
        if (e.key === "techtracker_theme") onStoreChange();
      };
      const handleCustom = () => onStoreChange();
      mq.addEventListener("change", handleCustom);
      window.addEventListener("storage", handleStorage);
      window.addEventListener("techtracker-theme-change", handleCustom);
      return () => {
        mq.removeEventListener("change", handleCustom);
        window.removeEventListener("storage", handleStorage);
        window.removeEventListener("techtracker-theme-change", handleCustom);
      };
    },
    () => {
      try {
        const saved = localStorage.getItem("techtracker_theme");
        if (saved === "light" || saved === "dark" || saved === "system") return saved;
      } catch {
        // ignore
      }
      return "system";
    },
    () => "system"
  );

  React.useEffect(() => {
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

  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5" role="group" aria-label="Theme preference">
      <Button type="button" variant="ghost" size="icon" className="min-w-8 size-8 sm:min-w-9 sm:size-9" aria-label="Toggle light or dark theme" onClick={() => setPref(document.documentElement.classList.contains("dark") ? "light" : "dark")}>
        <Moon className="size-4" aria-hidden="true" />
      </Button>
      <Button type="button" variant={pref === "system" ? "secondary" : "ghost"} size="icon" className="min-w-8 size-8 sm:min-w-9 sm:size-9" aria-label="Use system theme" aria-pressed={pref === "system"} onClick={() => setPref("system")}>
        <Monitor className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
