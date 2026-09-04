"use client";

import { useCallback, useState } from "react";

export function usePortfolioViewModel() {
  const [stars, setStars] = useState(() => {
    if (typeof window === "undefined") return 0;
    try {
      return Number.parseInt(window.localStorage.getItem("crimson-star-count") || "0", 10) || 0;
    } catch {
      return 0;
    }
  });
  const [rendererMode, setRendererMode] = useState("loading");

  const handleStarCaught = useCallback((event) => {
    setStars(event.detail.total);
  }, []);

  const handleModeChange = useCallback((event) => {
    setRendererMode(event.detail.mode);
  }, []);

  return { stars, rendererMode, handleStarCaught, handleModeChange };
}
