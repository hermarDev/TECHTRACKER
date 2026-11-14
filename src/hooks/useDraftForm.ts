"use client";

import * as React from "react";

export function useDraftForm<T extends Record<string, unknown>>(
  storageKey: string,
  initialValue: T
) {
  const [values, setValues] = React.useState<T>(initialValue);
  const [isDirty, setIsDirty] = React.useState(false);
  const [restoredDraft, setRestoredDraft] = React.useState(false);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<T>;
        setValues((prev) => ({ ...prev, ...parsed }));
        setRestoredDraft(true);
        setIsDirty(true);
      }
    } catch {
      // Ignore corrupt or blocked localStorage
    }
  }, [storageKey]);

  const updateValues = React.useCallback(
    (updater: Partial<T> | ((prev: T) => T)) => {
      setValues((prev) => {
        const next =
          typeof updater === "function" ? updater(prev) : { ...prev, ...updater };
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // Ignore quota errors
        }
        return next;
      });
      setIsDirty(true);
    },
    [storageKey]
  );

  const clearDraft = React.useCallback(() => {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Ignore
    }
    setIsDirty(false);
    setRestoredDraft(false);
  }, [storageKey]);

  React.useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  return {
    values,
    setValues: updateValues,
    isDirty,
    restoredDraft,
    clearDraft,
    resetAll: () => {
      clearDraft();
      setValues(initialValue);
    },
  };
}
