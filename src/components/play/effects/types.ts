import type { ComponentType, CSSProperties, ReactNode } from "react";
import type { ActiveEffect } from "@/lib/game/types";

export interface EffectCtx {
  effect: ActiveEffect;
  /** Server-corrected now. */
  now: number;
  /** Reduced motion (OS setting or the player's "Reduce chaos effects" toggle). */
  calm: boolean;
  size: number;
}

/** Visual changes to one tile. Hit-testing always uses the tile's real cell, so these never move touch targets. */
export interface TileMods {
  faceStyle?: CSSProperties;
  letterScale?: number;
  /** Greyed and untappable (Padlock). */
  locked?: boolean;
  /** Covered by a blob that a 1s hold wipes away (Ink Splat). */
  ink?: boolean;
  /** Swallowed by the vortex: letter hidden, still selectable (Black Hole). */
  hidden?: boolean;
}

/**
 * How one effect type changes the controller board. Every hook is optional; the board composes
 * all active effects. Adding a new visual card = one entry in the card config + one module here.
 */
export interface EffectModule {
  /** Style for the tile layer (filters, static transforms). Path drawing lives in this layer too. */
  layer?: (ctx: EffectCtx) => CSSProperties | undefined;
  /** Wraps the tile layer, e.g. to run an animation that starts from server time. */
  Wrap?: ComponentType<{ ctx: EffectCtx; children: ReactNode }>;
  /** Visual slot for each tile id (tile ids, adjacency and the submitted path are unchanged). */
  slots?: (ctx: EffectCtx) => number[] | undefined;
  tile?: (ctx: EffectCtx, index: number) => TileMods | undefined;
  /** Drawn above the board, never intercepting touches. */
  Overlay?: ComponentType<{ ctx: EffectCtx }>;
  /** Style for the word preview above the board. */
  preview?: (ctx: EffectCtx) => CSSProperties | undefined;
  /** In calm mode the moving part is skipped and a static tinted, labelled overlay is shown instead. */
  motion?: boolean;
}
