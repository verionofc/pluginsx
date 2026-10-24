"use client";

import { useEffect, useState } from "react";

export function useLoadingDelay(isLoading: boolean, delayMs = 1500): boolean {
  const [showLoading, setShowLoading] = useState(true);

  useEffect(() => {
    if (isLoading) {
      setShowLoading(true);
      return;
    }

    const timeout = window.setTimeout(() => setShowLoading(false), delayMs);
    return () => window.clearTimeout(timeout);
  }, [delayMs, isLoading]);

  return showLoading;
}
