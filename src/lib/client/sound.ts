"use client";

import { useSyncExternalStore } from "react";

/** Tiny synthesized sound effects (no audio assets), with a persisted mute toggle. */

export type Sound = "tap" | "good" | "bad" | "tick" | "start" | "end" | "cancel" | "point" | "fanfare" | "card" | "zap" | "hit" | "shield" | "sting" | "coins";

const MUTE_KEY = "tumbleword:muted";
const listeners = new Set<() => void>();
let muted: boolean | null = null;
let ctx: AudioContext | null = null;

function isMuted(): boolean {
  if (muted === null) {
    try {
      muted = localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      muted = false;
    }
  }
  return muted;
}

export function setMuted(value: boolean) {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}

export function useMuted(): [boolean, (v: boolean) => void] {
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    isMuted,
    () => true,
  );
  return [value, setMuted];
}

type Note = [freq: number, start: number, duration: number, type?: OscillatorType, gain?: number];

const SOUNDS: Record<Sound, Note[]> = {
  tap: [[660, 0, 0.04, "triangle", 0.15]],
  good: [[523, 0, 0.08, "triangle"], [784, 0.07, 0.12, "triangle"]],
  bad: [[220, 0, 0.12, "square", 0.08], [180, 0.1, 0.16, "square", 0.08]],
  tick: [[1000, 0, 0.03, "sine", 0.12]],
  start: [[392, 0, 0.1], [523, 0.1, 0.1], [784, 0.2, 0.25]],
  end: [[784, 0, 0.12], [523, 0.12, 0.12], [392, 0.24, 0.3]],
  cancel: [[300, 0, 0.18, "sawtooth", 0.08], [200, 0.12, 0.25, "sawtooth", 0.08]],
  point: [[880, 0, 0.06, "triangle", 0.12]],
  fanfare: [[523, 0, 0.12], [659, 0.12, 0.12], [784, 0.24, 0.12], [1047, 0.36, 0.4]],
  card: [[988, 0, 0.06, "triangle", 0.14], [1319, 0.06, 0.14, "triangle", 0.14]],
  zap: [[880, 0, 0.05, "square", 0.06], [440, 0.05, 0.12, "sawtooth", 0.07]],
  hit: [[330, 0, 0.1, "sawtooth", 0.08], [247, 0.08, 0.18, "square", 0.06]],
  shield: [[660, 0, 0.08, "sine"], [990, 0.06, 0.2, "sine", 0.12]],
  sting: [[196, 0, 0.18, "sawtooth", 0.1], [233, 0.16, 0.18, "sawtooth", 0.1], [392, 0.32, 0.5, "square", 0.08], [784, 0.34, 0.45, "triangle", 0.1]],
  coins: [[1319, 0, 0.05, "triangle", 0.12], [1568, 0.06, 0.05, "triangle", 0.12], [2093, 0.12, 0.16, "triangle", 0.12]],
};

export function play(sound: Sound): void {
  if (typeof window === "undefined" || isMuted()) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime;
    for (const [freq, start, duration, type = "sine", gain = 0.18] of SOUNDS[sound]) {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      amp.gain.setValueAtTime(gain, t0 + start);
      amp.gain.exponentialRampToValueAtTime(0.0001, t0 + start + duration);
      osc.connect(amp).connect(ctx.destination);
      osc.start(t0 + start);
      osc.stop(t0 + start + duration + 0.02);
    }
  } catch {
    // audio unavailable
  }
}
