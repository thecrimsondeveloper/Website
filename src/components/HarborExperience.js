"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePortfolioViewModel } from "@/src/viewmodels/portfolio-view-model";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const destinations = [
  { id: "portfolio", label: "Portfolio", direction: "↖", href: "/home/", position: [-5, 1.5] },
  { id: "work", label: "Work", direction: "↗", href: "/projects/", position: [4.8, -2.5] },
  { id: "about", label: "About", direction: "↘", href: "/about/", position: [4.2, 3.2] },
];

export function HarborExperience({ className = "", interactive = false, navigation = false, quiet = false }) {
  const rendererRef = useRef(null);
  const pendingDestination = useRef(null);
  const [sailing, setSailing] = useState(null);
  const { stars, rendererMode, handleStarCaught, handleModeChange } = usePortfolioViewModel();

  useEffect(() => {
    const current = rendererRef.current;
    const onModeChange = (event) => {
      handleModeChange(event);
      if (event.detail.mode !== "webgl" && pendingDestination.current) {
        window.location.assign(pendingDestination.current.href);
      }
    };
    const onArrival = (event) => {
      const pending = pendingDestination.current;
      if (pending && pending.id === event.detail.id) window.location.assign(pending.href);
    };
    current?.addEventListener("star-caught", handleStarCaught);
    current?.addEventListener("renderer-mode-change", onModeChange);
    current?.addEventListener("destination-arrived", onArrival);
    import("./shader-renderer/shader-renderer.js");
    return () => {
      current?.removeEventListener("star-caught", handleStarCaught);
      current?.removeEventListener("renderer-mode-change", onModeChange);
      current?.removeEventListener("destination-arrived", onArrival);
    };
  }, [handleModeChange, handleStarCaught]);

  function sailTo(event, destination) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (pendingDestination.current) { event.preventDefault(); return; }
    if (rendererRef.current?.dataset.mode !== "webgl"
      || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!rendererRef.current.travelTo(destination.id, destination.position)) return;
    event.preventDefault();
    pendingDestination.current = { id: destination.id, href: event.currentTarget.href };
    setSailing(destination.id);
  }

  return (
    <div className={`harbor-experience ${className}`.trim()}>
      <shader-renderer
        ref={rendererRef}
        scene={`${basePath}/assets/harbor/world.json`}
        fallback-video={`${basePath}/assets/harbor/harbor-loop.webm`}
        fallback-image={`${basePath}/assets/harbor/harbor-poster.webp`}
        quality="auto"
        interactive={interactive ? "" : undefined}
        navigation={navigation ? "" : undefined}
        quiet={quiet ? "" : undefined}
        role={navigation ? "group" : "img"}
        aria-label={navigation
          ? "Interactive harbor. Drag to look around, scroll to zoom, or use arrow keys while focused. Choose a destination to sail there."
          : "A small fishing boat rocking above clear teal water, coral, rocks, fish, and drifting stars"}
        tabIndex={interactive || navigation ? 0 : undefined}
      >
        {/* The native image is the light-DOM fallback consumed by the custom element. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          slot="fallback"
          src={`${basePath}/assets/harbor/harbor-poster.webp`}
          alt="A small boat floating above a coral harbor"
        />
      </shader-renderer>
      {interactive && !navigation && (
        <div className="harbor-status" aria-live="polite">
          <span>{rendererMode === "webgl" ? "Live water" : "Calm water"}</span>
          <span>{stars} {stars === 1 ? "star" : "stars"}</span>
        </div>
      )}
      {navigation && (
        <nav className="harbor-navigation" aria-label="Harbor destinations" data-sailing={Boolean(sailing)}>
          {destinations.map((destination) => (
            <Link
              key={destination.id}
              className={`harbor-waypoint harbor-waypoint--${destination.id}${sailing === destination.id ? " is-sailing" : ""}`}
              href={destination.href}
              onClick={(event) => sailTo(event, destination)}
              aria-label={`Sail to ${destination.label}`}
            >
              <span className="harbor-waypoint__direction" aria-hidden="true">{destination.direction}</span>
              <span className="harbor-waypoint__label">{destination.label}</span>
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
