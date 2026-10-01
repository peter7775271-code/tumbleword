import type { EffectType } from "./types";

/*
 * Sabotage card config. Everything tunable lives here.
 * Adding a card = one entry in CARD_DEFINITIONS plus (for a new effect type) one effect
 * module in src/components/play/effects.
 */

export type CardTier = "common" | "rare" | "legendary";
export type CardTargeting = "rival" | "self" | "leader" | "all-others";

export interface CardDefinition {
  id: string;
  name: string;
  tier: CardTier;
  emoji: string;
  description: string;
  /** 0 for instant cards. */
  durationMs: number;
  targeting: CardTargeting;
  effectType: EffectType;
  /** Purely visual (eligible for Chaos Shuffle). */
  visual?: boolean;
  /** Shields can't bounce it. */
  unreflectable?: boolean;
  /** Hits even through hit/Cleanse immunity (still respects the per-round cap). */
  ignoresImmunity?: boolean;
}

export const CARD_RULES = {
  maxHandSize: 3,
  /** No cards in the opening and closing seconds of a round. */
  lockoutStartMs: 10_000,
  lockoutEndMs: 8_000,
  hitImmunityMs: 3_000,
  cleanseImmunityMs: 5_000,
  clockThiefMs: 5_000,
  maxClockStolenMs: 15_000,
  heistPoints: 3,
  bountyMinWordLength: 5,
  bountyBonusCap: 3,
  /** Covered/locked tile counts for the board-picking effects. */
  inkTiles: 4,
  padlockTiles: 2,
  blackHoleTiles: 6,
  /** Fog clears over this final stretch. */
  fogFadeMs: 2_000,
  inkWipeHoldMs: 1_000,
  /** Events kept in the public feed. */
  feedSize: 12,
} as const;

/**
 * Every player is dealt a card every `settings.cardIntervalSeconds` while there's room in their hand.
 * The tier of each dealt card is drawn with these weights (they don't need to sum to 1).
 */
export const DROP_WEIGHTS: Record<CardTier, number> = {
  common: 0.6,
  rare: 0.3,
  legendary: 0.1,
};

const card = (def: CardDefinition) => def;

export const CARD_DEFINITIONS: Record<string, CardDefinition> = Object.fromEntries(
  [
    // ---------- common: short visual annoyances ----------
    card({ id: "fog-machine", name: "Fog Machine", tier: "common", emoji: "🌫️", description: "Blurs their board and word preview.", durationMs: 8_000, targeting: "rival", effectType: "fog", visual: true }),
    card({ id: "ink-splat", name: "Ink Splat", tier: "common", emoji: "🦑", description: "Ink covers 4 tiles. Hold a blob to wipe it.", durationMs: 8_000, targeting: "rival", effectType: "ink", visual: true }),
    card({ id: "jelly-board", name: "Jelly Board", tier: "common", emoji: "🍮", description: "Their tiles wobble and drift.", durationMs: 7_000, targeting: "rival", effectType: "jelly", visual: true }),
    card({ id: "spin-cycle", name: "Spin Cycle", tier: "common", emoji: "🌀", description: "Their board slowly spins all the way round.", durationMs: 8_000, targeting: "rival", effectType: "spin", visual: true }),
    card({ id: "padlock", name: "Padlock", tier: "common", emoji: "🔒", description: "Locks 2 of their tiles.", durationMs: 6_000, targeting: "rival", effectType: "padlock", visual: true }),
    card({ id: "tiny-print", name: "Tiny Print", tier: "common", emoji: "🔬", description: "Shrinks their letters.", durationMs: 8_000, targeting: "rival", effectType: "tiny", visual: true }),
    // ---------- rare: stronger or tactical ----------
    card({ id: "scramble-eggs", name: "Scramble Eggs", tier: "rare", emoji: "🥚", description: "Shuffles where their tiles appear.", durationMs: 10_000, targeting: "rival", effectType: "scramble", visual: true }),
    card({ id: "mirror-mirror", name: "Mirror Mirror", tier: "rare", emoji: "🪞", description: "Flips their board left to right.", durationMs: 10_000, targeting: "rival", effectType: "mirror", visual: true }),
    card({ id: "clock-thief", name: "Clock Thief", tier: "rare", emoji: "⏰", description: "Their round ends 5 seconds early.", durationMs: 0, targeting: "rival", effectType: "clock" }),
    card({ id: "lights-out", name: "Lights Out", tier: "rare", emoji: "🔦", description: "Darkness. They only see around their finger.", durationMs: 6_000, targeting: "rival", effectType: "lights-out", visual: true }),
    card({ id: "shield", name: "Shield", tier: "rare", emoji: "🛡️", description: "Blocks the next sabotage and reflects it back.", durationMs: 20_000, targeting: "self", effectType: "shield" }),
    card({ id: "cleanse", name: "Cleanse", tier: "rare", emoji: "🧼", description: "Clears your effects and gives 5s of immunity.", durationMs: 0, targeting: "self", effectType: "cleanse" }),
    // ---------- legendary: loud on the big screen ----------
    card({ id: "black-hole", name: "Black Hole", tier: "legendary", emoji: "🕳️", description: "A vortex swallows 6 tiles on every other board.", durationMs: 6_000, targeting: "all-others", effectType: "black-hole", unreflectable: true, ignoresImmunity: true }),
    card({ id: "bounty", name: "Bounty", tier: "legendary", emoji: "👑", description: "Everyone else gets +1 per 5+ letter word while the leader is wanted.", durationMs: 0, targeting: "leader", effectType: "bounty" }),
    card({ id: "heist", name: "Heist", tier: "legendary", emoji: "💰", description: "At the reveal, steal up to 3 of their word points.", durationMs: 0, targeting: "rival", effectType: "heist" }),
    card({ id: "chaos-shuffle", name: "Chaos Shuffle", tier: "legendary", emoji: "🎲", description: "Every rival gets a random effect.", durationMs: 8_000, targeting: "all-others", effectType: "chaos", unreflectable: true, ignoresImmunity: true }),
  ].map((c) => [c.id, c]),
);

export const CARD_LIST: CardDefinition[] = Object.values(CARD_DEFINITIONS);

export const getCard = (id: string): CardDefinition | null => CARD_DEFINITIONS[id] ?? null;

export const cardsInTier = (tier: CardTier) => CARD_LIST.filter((c) => c.tier === tier);

/** Cards Chaos Shuffle can hand out: common or rare, purely visual. */
export const CHAOS_POOL = CARD_LIST.filter((c) => c.visual && c.tier !== "legendary");

/** Display info per tier. Always shown with a text label, never color alone. */
export const TIER_STYLE: Record<CardTier, { label: string; color: string; symbol: string }> = {
  common: { label: "Common", color: "#56B4E9", symbol: "●" },
  rare: { label: "Rare", color: "#CC79A7", symbol: "◆" },
  legendary: { label: "Legendary", color: "#FFB000", symbol: "★" },
};
