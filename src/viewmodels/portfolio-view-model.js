"use client";

import { useCallback, useState } from "react";

export function usePortfolioViewModel() {
  const [stars, setStars] = useState(0);
  const [rendererMode, setRendererMode] = useState("loading");

  const handleStarCaught = useCallback((event) => {
    setStars(event.detail.total);
  }, []);

  const handleModeChange = useCallback((event) => {
    setRendererMode(event.detail.mode);
  }, []);

  return { stars, rendererMode, handleStarCaught, handleModeChange };
}
