"use client";

import { useEffect, useState } from "react";
import styles from "./HomeArrival.module.css";

export function ReloadIntroOverlay() {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const isReload = document.documentElement.dataset.navigationType === "reload";

    if (!isReload) {
      setDismissed(true);
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reducedMotion ? 420 : 2050;

    document.body.classList.add("intro-locked");

    const dismiss = () => {
      document.body.classList.remove("intro-locked");
      delete document.documentElement.dataset.navigationType;
      setDismissed(true);
    };

    const timer = window.setTimeout(dismiss, duration);
    const onKeyDown = (event) => {
      if (event.key === "Escape") dismiss();
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("intro-locked");
    };
  }, []);

  if (dismissed) return null;

  return (
    <div className={styles.reloadIntro} aria-hidden="true">
      <div className={styles.introGrid} />
      <div className={styles.introSweep} />
      <div className={styles.introContent}>
        <p className={styles.introName}>Crimson Wheeler</p>
        <p className={styles.introLine}>Systems that become experiences.</p>
      </div>
    </div>
  );
}
