"use client";

import { useSyncExternalStore } from "react";
import { useReducedMotion } from "./hooks";

/** Player-side "Reduce chaos effects" toggle, persisted per device. */

const KEY = "tumbleword:calm";
const listeners = new Set<() => void>();
let calm: boolean | null = null;

function read(): boolean {
  if (calm === null) {
    try {
      calm = localStorage.getItem(KEY) === "1";
    } catch {
      calm = false;
    }
  }
  return calm;
}

export function setCalm(value: boolean) {
  calm = value;
  try {
    localStorage.setItem(KEY, value ? "1" : "0");
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}

export function useCalmSetting(): [boolean, (v: boolean) => void] {
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => false,
  );
  return [value, setCalm];
}

/** True when moving sabotage effects should become static overlays (OS setting or the player's toggle). */
export function useCalmEffects(): boolean {
  const [setting] = useCalmSetting();
  return useReducedMotion() || setting;
}
