"use client";

import { useEffect, useRef } from "react";
import { usePortfolioViewModel } from "@/src/viewmodels/portfolio-view-model";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function HarborExperience({ className = "", interactive = false, quiet = false }) {
  const rendererRef = useRef(null);
  const { stars, rendererMode, handleStarCaught, handleModeChange } = usePortfolioViewModel();

  useEffect(() => {
    let mounted = true;
    import("./shader-renderer/shader-renderer.js").then(() => {
      if (!mounted || !rendererRef.current) return;
      rendererRef.current.addEventListener("star-caught", handleStarCaught);
      rendererRef.current.addEventListener("renderer-mode-change", handleModeChange);
    });

    const current = rendererRef.current;
    return () => {
      mounted = false;
      current?.removeEventListener("star-caught", handleStarCaught);
      current?.removeEventListener("renderer-mode-change", handleModeChange);
    };
  }, [handleModeChange, handleStarCaught]);

  return (
    <div className={`harbor-experience ${className}`.trim()}>
      <shader-renderer
        ref={rendererRef}
        scene={`${basePath}/assets/harbor/world.json`}
        fallback-video={`${basePath}/assets/harbor/harbor-loop.webm`}
        fallback-image={`${basePath}/assets/harbor/harbor-poster.webp`}
        quality="auto"
        interactive={interactive ? "" : undefined}
        quiet={quiet ? "" : undefined}
        role="img"
        aria-label="A small fishing boat rocking above clear teal water, coral, rocks, fish, and drifting stars"
        tabIndex={interactive ? 0 : undefined}
      >
        {/* The native image is the light-DOM fallback consumed by the custom element. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          slot="fallback"
          src={`${basePath}/assets/harbor/harbor-poster.webp`}
          alt="A small boat floating above a coral harbor"
        />
      </shader-renderer>
      {interactive && (
        <div className="harbor-status" aria-live="polite">
          <span>{rendererMode === "webgl" ? "Live water" : "Calm water"}</span>
          <span>{stars} {stars === 1 ? "star" : "stars"}</span>
        </div>
      )}
    </div>
  );
}
