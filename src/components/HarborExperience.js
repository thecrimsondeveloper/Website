"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { profile } from "@/src/models/portfolio-model";
import { usePortfolioViewModel } from "@/src/viewmodels/portfolio-view-model";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const destinations = [
  { id: "portfolio", label: "Start here", detail: "Overview", direction: "↖", href: "/home/", position: [-5, 1.5] },
  { id: "work", label: "View work", detail: "Projects", direction: "↗", href: "/projects/", position: [4.8, -2.5] },
  { id: "about", label: "About me", detail: "Story", direction: "↘", href: "/about/", position: [4.2, 3.2] },
  { id: "contact", label: "Contact", detail: "Say hello", direction: "↗", href: `mailto:${profile.email}`, position: [-4.2, -3.7] },
];

export function HarborExperience({ className = "", interactive = false, navigation = false, quiet = false }) {
  const rendererRef = useRef(null);
  const navigationRef = useRef(null);
  const pendingDestination = useRef(null);
  const [sailing, setSailing] = useState(null);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const { stars, rendererMode, handleStarCaught, handleModeChange } = usePortfolioViewModel();

  useEffect(() => {
    const current = rendererRef.current;
    const onModeChange = (event) => {
      handleModeChange(event);
      setReady(event.detail.mode === "webgl");
      setUnavailable(event.detail.mode !== "webgl");
      if (event.detail.mode !== "webgl") {
        navigationRef.current?.querySelectorAll("[data-destination]").forEach((element) => {
          element.style.removeProperty("--waypoint-x");
          element.style.removeProperty("--waypoint-y");
        });
      }
      if (event.detail.mode !== "webgl" && pendingDestination.current) {
        window.location.assign(pendingDestination.current.href);
      }
    };
    const onError = () => setUnavailable(true);
    const onWaypoints = (event) => {
      if (current?.dataset.mode !== "webgl") return;
      for (const { id, x, y } of event.detail) {
        const waypoint = navigationRef.current?.querySelector(`[data-destination="${id}"]`);
        if (!waypoint) continue;
        waypoint.style.setProperty("--waypoint-x", `${(x * 100).toFixed(2)}%`);
        waypoint.style.setProperty("--waypoint-y", `${(y * 100).toFixed(2)}%`);
      }
    };
    const onArrival = (event) => {
      const pending = pendingDestination.current;
      if (pending && pending.id === event.detail.id) window.location.assign(pending.href);
    };
    current?.addEventListener("star-caught", handleStarCaught);
    current?.addEventListener("renderer-mode-change", onModeChange);
    current?.addEventListener("destination-arrived", onArrival);
    current?.addEventListener("waypoint-projection", onWaypoints);
    current?.addEventListener("renderer-error", onError);
    import("./shader-renderer/shader-renderer.js");
    return () => {
      current?.removeEventListener("star-caught", handleStarCaught);
      current?.removeEventListener("renderer-mode-change", onModeChange);
      current?.removeEventListener("destination-arrived", onArrival);
      current?.removeEventListener("waypoint-projection", onWaypoints);
      current?.removeEventListener("renderer-error", onError);
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
        waypoints={navigation ? JSON.stringify(destinations.map(({ id, position }) => ({ id, position }))) : undefined}
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
        <nav ref={navigationRef} className="harbor-navigation" aria-label="Harbor destinations" data-sailing={Boolean(sailing)} data-ready={ready}>
          {destinations.map((destination) => {
            const Waypoint = destination.href.startsWith("mailto:") ? "a" : Link;
            return <Waypoint
              key={destination.id}
              className={`harbor-waypoint harbor-waypoint--${destination.id}${sailing === destination.id ? " is-sailing" : ""}`}
              href={destination.href}
              onClick={(event) => sailTo(event, destination)}
              data-destination={destination.id}
              aria-label={`${destination.label}: ${destination.detail}`}
            >
              <span className="harbor-waypoint__direction" aria-hidden="true">{destination.direction}</span>
              <span className="harbor-waypoint__label">{destination.label}</span>
              <span className="harbor-waypoint__detail">{destination.detail}</span>
            </Waypoint>;
          })}
        </nav>
      )}
      {navigation && (
        <div className="harbor-game-status" aria-live="polite">
          {ready ? <span>✦ {stars} {stars === 1 ? "star" : "stars"} found</span>
            : <span>{unavailable ? "Choose a destination" : "Preparing the harbor…"}</span>}
        </div>
      )}
    </div>
  );
}
