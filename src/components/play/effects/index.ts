import type { CSSProperties, ComponentType, ReactNode } from "react";
import type { ActiveEffect, EffectType } from "@/lib/game/types";
import { fog } from "./fog";
import { blackHole, lightsOut } from "./overlays";
import { ink, jelly, mirror, padlock, scramble, tiny } from "./simple";
import { spin } from "./spin";
import type { EffectCtx, EffectModule, TileMods } from "./types";

export type { EffectCtx, EffectModule, TileMods };

/** Effect types without an entry (Shield, Bounty, Clock Thief...) don't change the board. */
export const EFFECTS: Partial<Record<EffectType, EffectModule>> = {
  fog,
  ink,
  jelly,
  spin,
  padlock,
  tiny,
  scramble,
  mirror,
  "lights-out": lightsOut,
  "black-hole": blackHole,
};

export interface ComposedBoard {
  layerStyle: CSSProperties;
  previewStyle: CSSProperties;
  slots: number[] | null;
  tiles: TileMods[];
  wraps: { key: string; ctx: EffectCtx; Wrap: ComponentType<{ ctx: EffectCtx; children: ReactNode }> }[];
  overlays: { key: string; ctx: EffectCtx; Overlay: ComponentType<{ ctx: EffectCtx }> }[];
  /** Motion effects replaced by a static label in calm mode. */
  calmed: ActiveEffect[];
}

function merge(into: CSSProperties, add: CSSProperties | undefined) {
  if (!add) return;
  for (const [k, v] of Object.entries(add) as [keyof CSSProperties, string][]) {
    const prev = into[k];
    (into as Record<string, unknown>)[k] = (k === "filter" || k === "transform") && prev ? `${prev} ${v}` : v;
  }
}

/** Folds every live effect on this player into one description of the board. */
export function composeEffects(effects: ActiveEffect[], now: number, calm: boolean, size: number): ComposedBoard {
  const out: ComposedBoard = {
    layerStyle: {},
    previewStyle: {},
    slots: null,
    tiles: Array.from({ length: size * size }, () => ({})),
    wraps: [],
    overlays: [],
    calmed: [],
  };
  for (const effect of effects) {
    if (effect.expiresAt <= now) continue;
    const mod = EFFECTS[effect.effectType];
    if (!mod) continue;
    const ctx: EffectCtx = { effect, now, calm, size };
    if (calm && mod.motion) {
      out.calmed.push(effect);
      continue;
    }
    merge(out.layerStyle, mod.layer?.(ctx));
    merge(out.previewStyle, mod.preview?.(ctx));
    out.slots = mod.slots?.(ctx) ?? out.slots;
    if (mod.tile) {
      out.tiles.forEach((t, i) => {
        const m = mod.tile!(ctx, i);
        if (!m) return;
        Object.assign(t, { ...m, faceStyle: { ...t.faceStyle, ...m.faceStyle }, letterScale: Math.min(t.letterScale ?? 1, m.letterScale ?? 1) });
      });
    }
    if (mod.Wrap) out.wraps.push({ key: effect.id, ctx, Wrap: mod.Wrap });
    if (mod.Overlay) out.overlays.push({ key: effect.id, ctx, Overlay: mod.Overlay });
  }
  return out;
}
