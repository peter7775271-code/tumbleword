"use client";

import { useState } from "react";
import { CARD_RULES, getCard, type CardDefinition } from "@/lib/game/cards";
import { cardWindow, findBountyTarget } from "@/lib/game/sabotage";
import type { PlayerView } from "@/lib/shared/api";
import { useCalmSetting } from "@/lib/client/calm";
import { Avatar } from "../ui";
import { CardFace, TierTag } from "../CardFace";

/** Why no card can be played right now (shown instead of the Play controls). */
function blockedReason(view: PlayerView, now: number): string | null {
  const round = view.room.round;
  if (!round) return "Cards can only be played during a round";
  if (view.sabotage.deadline !== null && now >= view.sabotage.deadline) return "Your time is up";
  const window = cardWindow(round, now);
  if (window === "early") return `Cards unlock in ${Math.ceil((round.startsAt + CARD_RULES.lockoutStartMs - now) / 1000)}s`;
  if (window !== "open") return "Cards are locked for the final seconds";
  if (view.sabotage.nextPlayAt > now) return `You can play again in ${Math.ceil((view.sabotage.nextPlayAt - now) / 1000)}s`;
  return null;
}

/**
 * The player's private hand: a slim bar under the board that expands into card details and targeting.
 * Selection is by hand slot so duplicate cards work.
 */
export function CardTray({ view, now, onPlay }: { view: PlayerView; now: number; onPlay: (card: CardDefinition, targetId: string | null) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [launching, setLaunching] = useState<number | null>(null);
  const [calmSetting, setCalm] = useCalmSetting();
  const hand = view.sabotage.hand.map(getCard).filter((c): c is CardDefinition => !!c);
  const slot = selected !== null && selected < hand.length ? selected : null;
  const card = slot !== null ? hand[slot] : null;
  const blocked = blockedReason(view, now);
  const { players, progress, activeEffects } = view.room;
  const nextCardAt = hand.length < CARD_RULES.maxHandSize ? view.sabotage.nextCardAt : null;
  const nextIn = nextCardAt !== null ? Math.max(0, Math.ceil((nextCardAt - now) / 1000)) : null;

  const pick = (i: number) => {
    setOpen(true);
    setSelected(i === slot ? null : i);
  };

  const launch = async (targetId: string | null) => {
    if (!card || slot === null || launching !== null) return;
    setLaunching(slot);
    const ok = await onPlay(card, targetId);
    setLaunching(null);
    if (ok) {
      setSelected(null);
      setOpen(false);
    }
  };

  const shielded = (id: string) => activeEffects.some((e) => e.targetId === id && e.effectType === "shield" && e.expiresAt > now);
  const rivals = players.filter((p) => p.id !== view.me.id && p.status === "active");
  const bounty = card?.targeting === "leader" ? findBountyTarget(players.filter((p) => p.status === "active" && (p.connected || p.id === view.me.id)), progress, view.me.id) : null;
  const bountyName = bounty?.targetId ? players.find((p) => p.id === bounty.targetId)?.nickname : null;

  return (
    <section className="sticky bottom-0 z-20 -mx-4 mt-auto border-t border-white/10 bg-ink-950/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur" aria-label="Your sabotage cards">
      <div className="flex items-center gap-2">
        <span className="text-xs font-black uppercase tracking-widest text-ink-300">
          Cards {hand.length}/{CARD_RULES.maxHandSize}
        </span>
        {nextIn !== null && <span className="sr-only">Next card in {nextIn} seconds</span>}
        <div className="flex flex-1 gap-1.5">
          {Array.from({ length: CARD_RULES.maxHandSize }, (_, i) => {
            const c = hand[i];
            if (!c) {
              const countdown = i === hand.length && nextIn !== null ? `${nextIn}s` : "";
              return (
                <span key={`empty-${i}`} className="grid h-11 w-11 place-items-center rounded-xl border-2 border-dashed border-ink-700 text-xs font-black text-ink-300 tabular-nums" aria-hidden>
                  {countdown}
                </span>
              );
            }
            return (
              <button
                key={`${c.id}-${i}`}
                type="button"
                onClick={() => pick(i)}
                aria-pressed={slot === i}
                aria-label={`${c.name}, ${c.tier}`}
                className={`h-11 w-11 outline-none focus-visible:ring-4 focus-visible:ring-sky ${launching === i ? "animate-card-play" : ""}`}
              >
                <CardFace card={c} compact selected={slot === i} className="h-full w-full" />
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="rounded-full bg-ink-800 px-3 py-2 text-sm font-black outline-none focus-visible:ring-4 focus-visible:ring-sky"
        >
          {open ? "Hide ▾" : "Cards ▴"}
        </button>
      </div>

      {open && (
        <div className="mt-2 flex max-h-[45dvh] animate-fade-up flex-col gap-3 overflow-y-auto pb-1">
          {hand.length === 0 && (
            <p className="text-sm text-ink-300">
              You get a sabotage card every {view.room.settings.cardIntervalSeconds}s while your hand has room. Play them to free up slots.
            </p>
          )}
          {hand.length > 0 && !card && <p className="text-sm text-ink-300">Tap a card to see what it does.</p>}
          {card && (
            <div className="flex flex-col gap-2 rounded-2xl bg-ink-900 p-3 ring-1 ring-white/10">
              <div className="flex items-center gap-3">
                <span className="text-4xl" aria-hidden>
                  {card.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-black leading-tight">{card.name}</p>
                  <TierTag card={card} className="text-[0.65rem]" />
                </div>
              </div>
              <p className="text-sm text-ink-300">{card.description}</p>

              {blocked ? (
                <p className="rounded-xl bg-ink-800 px-3 py-2 text-center text-sm font-bold text-ink-300">⏳ {blocked}</p>
              ) : card.targeting === "rival" ? (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a target">
                  {rivals.length === 0 && <p className="text-sm text-ink-300">No rivals to target.</p>}
                  {rivals.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      disabled={!p.connected || launching !== null}
                      onClick={() => void launch(p.id)}
                      className="flex items-center gap-2 rounded-full bg-ink-800 py-1 pl-1 pr-3 text-sm font-black outline-none ring-2 ring-transparent transition active:scale-95 focus-visible:ring-sky disabled:opacity-40"
                      aria-label={`Play ${card.name} on ${p.nickname}, ${progress[p.id] ?? 0} words${shielded(p.id) ? ", shielded" : ""}${p.connected ? "" : ", offline"}`}
                    >
                      <Avatar emoji={p.emoji} color={p.color} size="sm" />
                      <span className="max-w-[7rem] truncate">{p.nickname}</span>
                      <span className="text-xs text-ink-300">{progress[p.id] ?? 0}w</span>
                      {shielded(p.id) && <span aria-hidden>🛡️</span>}
                      {!p.connected && <span className="text-xs text-ink-300">offline</span>}
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  {card.targeting === "leader" && (
                    <p className="text-sm font-bold">
                      {bounty?.casterLeads ? "You're the leader, so you can't place a bounty." : bountyName ? `Targets the leader: 👑 ${bountyName}` : "No leader to target yet."}
                    </p>
                  )}
                  {card.targeting === "all-others" && <p className="text-sm font-bold">Hits every other player at once.</p>}
                  <button
                    type="button"
                    disabled={launching !== null || (card.targeting === "leader" && !bountyName)}
                    onClick={() => void launch(null)}
                    className="rounded-2xl bg-amber py-3 text-lg font-black text-ink-950 shadow-[0_0.25em_0_#b37b00] outline-none transition active:translate-y-[0.1em] focus-visible:ring-4 focus-visible:ring-sky disabled:opacity-40"
                  >
                    Play {card.emoji} {card.name}
                  </button>
                </>
              )}
            </div>
          )}
          <div className="flex items-center justify-between gap-3 text-sm font-bold text-ink-300">
            Reduce chaos effects
            <button
              type="button"
              role="switch"
              aria-label="Reduce chaos effects"
              aria-checked={calmSetting}
              onClick={() => setCalm(!calmSetting)}
              className={`min-w-[4rem] rounded-full px-3 py-1 font-black outline-none focus-visible:ring-4 focus-visible:ring-sky ${calmSetting ? "bg-sky text-ink-950" : "bg-ink-700 text-white"}`}
            >
              {calmSetting ? "On" : "Off"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
