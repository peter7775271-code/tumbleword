import type { EffectModule } from "./types";

const has = (tiles: number[] | undefined, i: number) => !!tiles?.includes(i);

export const ink: EffectModule = {
  tile: ({ effect }, i) => (has(effect.tiles, i) ? { ink: true } : undefined),
};

export const padlock: EffectModule = {
  tile: ({ effect }, i) => (has(effect.tiles, i) ? { locked: true } : undefined),
};

export const tiny: EffectModule = {
  tile: () => ({ letterScale: 0.4 }),
};

export const mirror: EffectModule = {
  layer: () => ({ transform: "scaleX(-1)" }),
};

export const jelly: EffectModule = {
  motion: true,
  tile: (_ctx, i) => ({
    faceStyle: { animation: `jelly ${(1.05 + (i % 4) * 0.21).toFixed(2)}s ease-in-out ${(-i * 0.37).toFixed(2)}s infinite` },
  }),
};

export const scramble: EffectModule = {
  motion: true,
  slots: ({ effect, size }) => (effect.tiles?.length === size * size ? effect.tiles : undefined),
};
