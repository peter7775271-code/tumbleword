"use client";

import { getCard } from "@/lib/game/cards";
import type { ActiveEffect, SabotageEvent } from "@/lib/game/types";
import type { PublicPlayer } from "@/lib/shared/api";

const secondsLeft = (until: number, now: number) => Math.max(0, Math.ceil((until - now) / 1000));

/** What's happening to me right now, each with a label and countdown (never color alone). */
export function EffectChips({ effects, now, immuneUntil, clockStolenMs }: { effects: ActiveEffect[]; now: number; immuneUntil: number; clockStolenMs: number }) {
  const live = effects.filter((e) => e.expiresAt > now);
  const immune = immuneUntil > now;
  if (live.length === 0 && !immune && clockStolenMs === 0) return null;
  return (
    <ul className="flex flex-wrap items-center gap-1.5" aria-label="Effects on you">
      {live.map((e) => {
        const card = getCard(e.cardId);
        const good = e.effectType === "shield";
        return (
          <li
            key={e.id}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black ${good ? "bg-mint/20 text-mint ring-1 ring-mint" : "bg-flame/15 text-flame ring-1 ring-flame/60"}`}
          >
            <span aria-hidden>{card?.emoji}</span>
            {e.effectType === "bounty" ? "Bounty on you" : card?.name}
            {e.reflected && <span className="text-ink-300">(reflected)</span>}
            {e.effectType !== "bounty" && <span className="tabular-nums text-white">{secondsLeft(e.expiresAt, now)}s</span>}
          </li>
        );
      })}
      {immune && (
        <li className="flex items-center gap-1 rounded-full bg-sky/15 px-2.5 py-1 text-xs font-black text-sky ring-1 ring-sky">
          <span aria-hidden>✨</span> Immune <span className="tabular-nums text-white">{secondsLeft(immuneUntil, now)}s</span>
        </li>
      )}
      {clockStolenMs > 0 && (
        <li className="flex items-center gap-1 rounded-full bg-flame/15 px-2.5 py-1 text-xs font-black text-flame ring-1 ring-flame/60">
          <span aria-hidden>⏰</span> Time stolen <span className="tabular-nums text-white">−{clockStolenMs / 1000}s</span>
        </li>
      )}
    </ul>
  );
}

export interface SabotageAlert {
  id: string;
  emoji: string;
  text: string;
  tone: "bad" | "good";
}

/** Turns a feed event into a message for this player, or null if it doesn't concern them. */
export function alertFor(e: SabotageEvent, meId: string, players: PublicPlayer[]): SabotageAlert | null {
  const name = (id: string) => players.find((p) => p.id === id)?.nickname ?? "Someone";
  const card = getCard(e.cardId);
  if (!card) return null;
  if (e.reflectedBy === meId) {
    return { id: e.id, emoji: "🛡️", text: `Your shield bounced ${card.name} back at ${name(e.sourceId)}!`, tone: "good" };
  }
  if (e.sourceId === meId) {
    if (!e.reflectedBy) return null;
    return { id: e.id, emoji: "🛡️", text: `${name(e.reflectedBy)}'s shield reflected your ${card.name}!`, tone: "bad" };
  }
  if (!e.targetIds.includes(meId)) return null;
  const from = name(e.sourceId);
  if (e.assigned?.[meId]) {
    const got = getCard(e.assigned[meId]);
    return { id: e.id, emoji: "🎲", text: `${from}'s Chaos Shuffle gave you ${got?.emoji} ${got?.name}!`, tone: "bad" };
  }
  switch (card.effectType) {
    case "bounty":
      return { id: e.id, emoji: card.emoji, text: "Bounty on you! Rivals get +1 for 5+ letter words", tone: "bad" };
    case "heist":
      return { id: e.id, emoji: card.emoji, text: `${from} is planning a heist on your points…`, tone: "bad" };
    case "clock":
      return { id: e.id, emoji: card.emoji, text: `${from} stole 5 seconds from you!`, tone: "bad" };
    default:
      return { id: e.id, emoji: card.emoji, text: `${from} hit you with ${card.name}!`, tone: "bad" };
  }
}
