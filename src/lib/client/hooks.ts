"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { serverClock } from "./clock";

const noopSubscribe = () => () => {};

/** False during SSR and hydration, true afterwards (safe gate for localStorage reads). */
export function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/** Server-corrected "now", re-rendering every `intervalMs`. */
export function useServerNow(intervalMs = 250): number {
  const [now, setNow] = useState(() => serverClock.now());
  useEffect(() => {
    const id = setInterval(() => setNow(serverClock.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(REDUCED_MOTION);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Arrow-key / D-pad focus navigation for TV browsers: moves focus to the nearest
 * focusable element in the pressed direction. Enter activates buttons natively.
 */
export function useSpatialNavigation(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const dir = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
      if (!dir) return;
      const active = document.activeElement as HTMLElement | null;
      if (active?.tagName === "INPUT") return;
      const candidates = [...document.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (candidates.length === 0) return;
      e.preventDefault();
      if (!active || active === document.body || !candidates.includes(active)) {
        candidates[0].focus();
        return;
      }
      const from = active.getBoundingClientRect();
      const fx = from.left + from.width / 2;
      const fy = from.top + from.height / 2;
      let best: HTMLElement | null = null;
      let bestScore = Infinity;
      for (const el of candidates) {
        if (el === active) continue;
        const r = el.getBoundingClientRect();
        const dx = r.left + r.width / 2 - fx;
        const dy = r.top + r.height / 2 - fy;
        const along = dx * dir[0] + dy * dir[1];
        if (along <= 1) continue;
        const across = Math.abs(dx * dir[1] - dy * dir[0]);
        const score = along + across * 2;
        if (score < bestScore) {
          bestScore = score;
          best = el;
        }
      }
      best?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
