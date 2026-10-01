"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { CARD_RULES, CHAOS_POOL, TIER_STYLE, getCard } from "@/lib/game/cards";
import type { ActiveEffect, SabotageEvent } from "@/lib/game/types";
import { useReducedMotion } from "@/lib/client/hooks";
import { play } from "@/lib/client/sound";
import type { PublicPlayer } from "@/lib/shared/api";
import { Avatar } from "../ui";

const BANNER_MS = 2_000;

/** Count-only card pips: filled vs hollow shapes, plus a screen-reader count. */
export function CardPips({ count }: { count: number }) {
  return (
    <span className="flex items-center gap-[0.25rem]" role="img" aria-label={`${count} card${count === 1 ? "" : "s"} in hand`}>
      {Array.from({ length: CARD_RULES.maxHandSize }, (_, i) => (
        <span
          key={i}
          className={`h-[1.5rem] w-[1.05rem] rounded-[0.25rem] border-[0.15rem] ${i < count ? "border-amber bg-amber" : "border-ink-500 bg-transparent"}`}
          aria-hidden
        />
      ))}
    </span>
  );
}

/** Avatar wrapped in a public shield bubble and/or bounty crown. */
export function SabotageAvatar({ player, dimmed, shielded, wanted }: { player: PublicPlayer; dimmed: boolean; shielded: boolean; wanted: boolean }) {
  return (
    <span className="relative inline-grid shrink-0 place-items-center">
      <Avatar emoji={player.emoji} color={player.color} dimmed={dimmed} />
      {shielded && (
        <>
          <span className="pointer-events-none absolute -inset-[0.45rem] animate-bubble rounded-full border-[0.25rem] border-mint bg-mint/15" aria-hidden />
          <span className="absolute -bottom-[0.5rem] -right-[0.6rem] text-[1.4rem]" aria-hidden>
            🛡️
          </span>
        </>
      )}
      {wanted && (
        <span className="absolute -top-[1.5rem] text-[1.8rem] drop-shadow-[0_0.15rem_0_#0b1027]" aria-hidden>
          👑
        </span>
      )}
    </span>
  );
}

/** Small effect icons with seconds left, shown under a player's name. */
export function EffectIcons({ effects, now }: { effects: ActiveEffect[]; now: number }) {
  const shown = effects.filter((e) => e.effectType !== "shield" && e.effectType !== "bounty" && e.expiresAt > now);
  if (shown.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-[0.4rem]">
      {shown.map((e) => {
        const card = getCard(e.cardId);
        return (
          <span key={e.id} className="flex items-center gap-[0.3rem] rounded-full bg-flame/20 px-[0.6rem] py-[0.1rem] text-[1.1rem] font-black text-flame ring-1 ring-flame/50">
            <span aria-hidden>{card?.emoji}</span>
            <span className="sr-only">{card?.name}</span>
            <span className="tabular-nums text-white">{Math.max(0, Math.ceil((e.expiresAt - now) / 1000))}s</span>
          </span>
        );
      })}
    </span>
  );
}

function Name({ id, players }: { id: string; players: PublicPlayer[] }) {
  const p = players.find((x) => x.id === id);
  if (!p) return <span className="font-black">Someone</span>;
  return (
    <span className="font-black" style={{ color: p.color }}>
      {p.emoji} {p.nickname}
    </span>
  );
}

/** One readable sentence per play: "Maya played Fog Machine on Jordan". */
export function describeEvent(e: SabotageEvent, players: PublicPlayer[]): ReactNode {
  const card = getCard(e.cardId);
  if (!card) return null;
  const n = (id: string) => <Name id={id} players={players} />;
  const cardName = <span className="font-black text-white">{card.name}</span>;
  if (e.reflectedBy) {
    return (
      <>
        🛡️ {n(e.reflectedBy)} reflected {cardName} back at {n(e.sourceId)}!
      </>
    );
  }
  if (card.targeting === "self") {
    return (
      <>
        {card.emoji} {n(e.sourceId)} used {cardName}
      </>
    );
  }
  if (card.targeting === "all-others") {
    return (
      <>
        {card.emoji} {n(e.sourceId)} unleashed {cardName} on {e.targetIds.length} player{e.targetIds.length === 1 ? "" : "s"}
      </>
    );
  }
  if (card.targeting === "leader") {
    return (
      <>
        {card.emoji} {n(e.sourceId)} put a {cardName} on {n(e.targetIds[0])}
      </>
    );
  }
  return (
    <>
      {card.emoji} {n(e.sourceId)} played {cardName} on {n(e.targetIds[0])}
    </>
  );
}

export function EventFeed({ events, players, limit = 4 }: { events: SabotageEvent[]; players: PublicPlayer[]; limit?: number }) {
  if (events.length === 0) return null;
  return (
    <section className="rounded-[1rem] bg-ink-900/80 px-[1.2rem] py-[0.8rem] ring-1 ring-white/10" aria-label="Sabotage feed">
      <h2 className="mb-[0.4rem] text-[1rem] font-black uppercase tracking-[0.2em] text-ink-300">Sabotage</h2>
      <ol className="flex flex-col gap-[0.35rem]" aria-live="polite">
        {[...events]
          .reverse()
          .slice(0, limit)
          .map((e, i) => (
            <li key={e.id} className={`animate-fade-up text-[1.3rem] leading-tight ${i === 0 ? "" : "text-ink-300 opacity-80"}`}>
              {describeEvent(e, players)}
            </li>
          ))}
      </ol>
    </section>
  );
}

/** Watches the feed and shows a 2s full-screen banner (plus sound) for each new legendary play. */
export function LegendaryBanner({ events, players }: { events: SabotageEvent[]; players: PublicPlayer[] }) {
  const [seen, setSeen] = useState(() => new Set(events.map((e) => e.id)));
  const [banner, setBanner] = useState<SabotageEvent | null>(null);
  const fresh = events.filter((e) => !seen.has(e.id));
  if (fresh.length > 0) {
    setSeen(new Set([...seen, ...fresh.map((e) => e.id)]));
    const legendary = fresh.filter((e) => getCard(e.cardId)?.tier === "legendary").at(-1);
    if (legendary) setBanner(legendary);
  }

  useEffect(() => {
    if (!banner) return;
    play("sting");
    const t = setTimeout(() => setBanner(null), BANNER_MS);
    return () => clearTimeout(t);
  }, [banner]);

  if (!banner) return null;
  const card = getCard(banner.cardId)!;
  const tier = TIER_STYLE[card.tier];
  return (
    <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-ink-950/80" role="alert">
      <div key={banner.id} className="flex animate-banner flex-col items-center gap-[1rem] rounded-[2rem] border-[0.4rem] bg-ink-900 px-[4rem] py-[2.5rem] text-center shadow-2xl" style={{ borderColor: tier.color }}>
        <p className="text-[1.4rem] font-black uppercase tracking-[0.4em]" style={{ color: tier.color }}>
          {tier.symbol} {tier.label}
        </p>
        <p className="text-[8rem] leading-none" aria-hidden>
          {card.emoji}
        </p>
        <p className="text-[4.5rem] font-black leading-none">{card.name}</p>
        <p className="max-w-[40rem] text-[1.8rem] text-ink-300">{describeEvent(banner, players)}</p>
        {banner.assigned && <ChaosRoulette assigned={banner.assigned} players={players} />}
      </div>
    </div>
  );
}

/** Slot-machine reels landing on each rival's random effect. */
function ChaosRoulette({ assigned, players }: { assigned: Record<string, string>; players: PublicPlayer[] }) {
  const reduced = useReducedMotion();
  const spins = 3;
  return (
    <ul className="mt-[0.5rem] flex flex-wrap justify-center gap-[1.5rem]">
      {Object.entries(assigned).map(([playerId, cardId], i) => {
        const card = getCard(cardId);
        const strip = [...Array.from({ length: spins }, () => CHAOS_POOL.map((c) => c.emoji)).flat(), card?.emoji ?? "❓"];
        return (
          <li key={playerId} className="flex flex-col items-center gap-[0.4rem]">
            <span className="h-[4.5rem] w-[4.5rem] overflow-hidden rounded-[1rem] bg-ink-800 ring-2 ring-amber">
              <span
                className="flex flex-col"
                style={
                  reduced
                    ? { transform: `translateY(-${(strip.length - 1) * 4.5}rem)` }
                    : ({
                        "--roulette-end": `-${(strip.length - 1) * 4.5}rem`,
                        animation: `roulette-land ${1100 + i * 250}ms cubic-bezier(0.15, 0.85, 0.25, 1) both`,
                      } as CSSProperties)
                }
              >
                {strip.map((emoji, k) => (
                  <span key={k} className="grid h-[4.5rem] w-[4.5rem] shrink-0 place-items-center text-[3rem]">
                    {emoji}
                  </span>
                ))}
              </span>
            </span>
            <span className="text-[1.2rem] font-bold">
              <Name id={playerId} players={players} />
            </span>
            <span className="text-[1rem] text-ink-300">{card?.name}</span>
          </li>
        );
      })}
    </ul>
  );
}
