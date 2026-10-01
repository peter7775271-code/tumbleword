"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getCard } from "@/lib/game/cards";
import { sabotageAwards, type SabotageAwards } from "@/lib/game/sabotage";
import type { ResolvedHeist, WordResult } from "@/lib/game/types";
import { useReducedMotion } from "@/lib/client/hooks";
import { play } from "@/lib/client/sound";
import type { PublicPlayer } from "@/lib/shared/api";
import { Avatar } from "../ui";
import type { HostControls } from "./HostApp";

type Step =
  | { kind: "intro" }
  | { kind: "dup"; word: WordResult }
  | { kind: "unique"; word: WordResult }
  | { kind: "bonus" }
  | { kind: "heist"; heist: ResolvedHeist }
  | { kind: "cards" }
  | { kind: "summary" };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Keeps the whole reveal around 20 seconds regardless of how many words were found. */
function stepDuration(step: Step, dupCount: number, uniqueCount: number): number {
  switch (step.kind) {
    case "intro":
      return 1400;
    case "dup":
      return clamp(8000 / dupCount, 300, 1200);
    case "unique":
      return clamp(10000 / uniqueCount, 150, 900);
    case "bonus":
      return 2200;
    case "heist":
      return 2600;
    case "cards":
      return 2400;
    case "summary":
      return Infinity;
  }
}

export function HostReveal({ view, act, busy }: HostControls) {
  const result = view.room.lastResult!;
  const players = view.room.players;
  const reducedMotion = useReducedMotion();

  const sab = result.sabotage;
  const cardBonus = (id: string) => (sab?.players[id] ? sab.players[id].cashIn + sab.players[id].bounty : 0);
  const steps = useMemo<Step[]>(() => {
    const dups = result.words.filter((w) => w.cancelled);
    // Ascending by points so the biggest words land last.
    const uniques = result.words.filter((w) => !w.cancelled).sort((a, b) => a.points - b.points || a.word.localeCompare(b.word));
    const anyCardBonus = Object.values(result.sabotage?.players ?? {}).some((s) => s.cashIn + s.bounty > 0);
    return [
      { kind: "intro" },
      ...dups.map((word): Step => ({ kind: "dup", word })),
      ...uniques.map((word): Step => ({ kind: "unique", word })),
      ...(result.longestBonus ? [{ kind: "bonus" } as Step] : []),
      ...(result.sabotage?.heists ?? []).map((heist): Step => ({ kind: "heist", heist })),
      ...(anyCardBonus ? [{ kind: "cards" } as Step] : []),
      { kind: "summary" },
    ];
  }, [result]);
  const awards = sabotageAwards(sab);
  const dupCount = steps.filter((s) => s.kind === "dup").length;
  const uniqueCount = steps.filter((s) => s.kind === "unique").length;

  const [index, setIndex] = useState(0);
  const step = steps[index];
  const summaryIndex = steps.length - 1;
  const skip = () => setIndex(summaryIndex);

  useEffect(() => {
    if (step.kind === "summary") return;
    if (step.kind === "dup") play("cancel");
    if (step.kind === "unique") play("point");
    if (step.kind === "bonus") play("fanfare");
    if (step.kind === "heist") play("coins");
    if (step.kind === "cards") play("card");
    const t = setTimeout(() => setIndex((i) => i + 1), stepDuration(step, dupCount, uniqueCount));
    return () => clearTimeout(t);
  }, [step, dupCount, uniqueCount]);

  // Running score per player: score before this round plus points revealed so far.
  const revealed = steps.slice(0, index + 1);
  const running = new Map<string, number>();
  for (const p of players) running.set(p.id, p.score - (result.players[p.id]?.total ?? 0));
  for (const s of revealed) {
    if (s.kind === "unique") for (const id of s.word.playerIds) running.set(id, (running.get(id) ?? 0) + s.word.points);
    if (s.kind === "bonus") for (const id of result.longestBonus!.playerIds) running.set(id, (running.get(id) ?? 0) + result.players[id].bonus);
    if (s.kind === "heist") {
      running.set(s.heist.sourceId, (running.get(s.heist.sourceId) ?? 0) + s.heist.points);
      running.set(s.heist.targetId, (running.get(s.heist.targetId) ?? 0) - s.heist.points);
    }
    if (s.kind === "cards") for (const p of players) running.set(p.id, (running.get(p.id) ?? 0) + cardBonus(p.id));
  }
  if (step.kind === "summary") for (const p of players) running.set(p.id, p.score);

  const gaining = new Map<string, number>();
  if (step.kind === "unique") for (const id of step.word.playerIds) gaining.set(id, step.word.points);
  if (step.kind === "bonus") for (const id of result.longestBonus!.playerIds) gaining.set(id, result.players[id].bonus);
  if (step.kind === "heist" && step.heist.points > 0) {
    gaining.set(step.heist.sourceId, step.heist.points);
    gaining.set(step.heist.targetId, -step.heist.points);
  }
  if (step.kind === "cards") for (const p of players) if (cardBonus(p.id) > 0) gaining.set(p.id, cardBonus(p.id));

  const byId = new Map(players.map((p) => [p.id, p]));
  const cancelledSoFar = revealed.filter((s): s is Step & { kind: "dup" } => s.kind === "dup").map((s) => s.word);
  const isLastRound = result.round >= view.room.settings.rounds;

  const primaryRef = useRef<HTMLButtonElement>(null);
  const atSummary = step.kind === "summary";
  useEffect(() => {
    primaryRef.current?.focus();
  }, [atSummary]);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-[2rem]">
      <section className="flex min-h-0 flex-col gap-[1.2rem]">
        <h1 className="text-[2.4rem] font-black">
          Round {result.round} results
          <span className="ml-[1rem] text-[1.4rem] font-bold text-ink-300">
            {result.words.length} words found of {result.totalPossible} on the board
          </span>
        </h1>

        <div className="grid min-h-[16rem] flex-1 place-items-center rounded-[1.5rem] bg-ink-900/80 p-[2rem] ring-1 ring-white/10" aria-live="polite">
          {step.kind === "intro" && (
            <div className="animate-fade-up text-center">
              <p className="text-[3.5rem] font-black">Let&apos;s see who matched…</p>
              <p className="mt-[0.5rem] text-[1.8rem] text-ink-300">Shared words are cancelled for everyone.</p>
            </div>
          )}
          {step.kind === "dup" && (
            <div key={step.word.word} className="animate-pop-in text-center">
              <p className="text-[1.6rem] font-black uppercase tracking-[0.3em] text-flame">✕ Cancelled</p>
              <p className="strike my-[0.5rem] inline-block text-[6rem] font-black uppercase leading-none text-ink-300">{step.word.word}</p>
              <Finders ids={step.word.playerIds} byId={byId} />
            </div>
          )}
          {step.kind === "unique" && (
            <div key={step.word.word} className="animate-pop-in text-center">
              <p className="text-[1.6rem] font-black uppercase tracking-[0.3em] text-sky">✓ Unique</p>
              <p className="my-[0.5rem] text-[6rem] font-black uppercase leading-none">
                {step.word.word} <span className="text-amber">+{step.word.points}</span>
              </p>
              <Finders ids={step.word.playerIds} byId={byId} />
            </div>
          )}
          {step.kind === "bonus" && result.longestBonus && (
            <div className="animate-pop-in text-center">
              <p className="text-[1.6rem] font-black uppercase tracking-[0.3em] text-amber">★ Longest word bonus +3</p>
              <p className="my-[0.5rem] text-[5rem] font-black uppercase leading-none">{result.longestBonus.words.join(" · ")}</p>
              <Finders ids={result.longestBonus.playerIds} byId={byId} />
            </div>
          )}
          {step.kind === "heist" && (
            <div key={`${step.heist.sourceId}-${step.heist.targetId}`} className="animate-pop-in text-center">
              <p className="text-[1.6rem] font-black uppercase tracking-[0.3em] text-amber">💰 Heist</p>
              <p className="my-[0.5rem] text-[4.5rem] font-black leading-none">
                {step.heist.points > 0 ? `${step.heist.points} point${step.heist.points === 1 ? "" : "s"} stolen!` : "Came up empty!"}
              </p>
              <p className="flex flex-wrap items-center justify-center gap-[1rem] text-[1.8rem] font-bold">
                <PlayerName p={byId.get(step.heist.sourceId)} /> robbed <PlayerName p={byId.get(step.heist.targetId)} />
              </p>
            </div>
          )}
          {step.kind === "cards" && (
            <div className="animate-pop-in text-center">
              <p className="text-[1.6rem] font-black uppercase tracking-[0.3em] text-sky">🃏 Card bonuses</p>
              <ul className="mt-[1rem] flex flex-col gap-[0.5rem] text-[1.8rem] font-bold">
                {players
                  .filter((p) => cardBonus(p.id) > 0)
                  .map((p) => (
                    <li key={p.id} className="flex items-center justify-center gap-[0.8rem]">
                      <PlayerName p={p} />
                      <span className="text-amber">+{cardBonus(p.id)}</span>
                      <span className="text-[1.3rem] text-ink-300">
                        {[sab!.players[p.id].cashIn > 0 && `cash-in ${sab!.players[p.id].cashIn}`, sab!.players[p.id].bounty > 0 && `👑 bounty ${sab!.players[p.id].bounty}`]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
          {step.kind === "summary" && (
            <div className="w-full animate-fade-up">
              <SabotageAwardsRow awards={awards} byId={byId} className="mb-[1.2rem]" />
              {result.longestBonus && (
                <p className="mb-[1rem] text-[1.6rem]">
                  <span className="font-black text-amber">★ Longest:</span>{" "}
                  <span className="font-black uppercase">{result.longestBonus.words.join(", ")}</span>
                </p>
              )}
              <p className="mb-[0.6rem] text-[1.4rem] font-bold text-ink-300">Best words nobody found</p>
              <ul className="flex flex-wrap gap-[0.6rem]">
                {result.missed.slice(0, 10).map((w) => (
                  <li key={w} className="rounded-[0.6rem] bg-ink-800 px-[0.8rem] py-[0.3rem] text-[1.5rem] font-black uppercase">
                    {w}
                  </li>
                ))}
                {result.missed.length === 0 && <li className="text-[1.4rem] text-ink-300">You found them all. Impressive.</li>}
              </ul>
            </div>
          )}
        </div>

        {cancelledSoFar.length > 0 && (
          <ul className="flex max-h-[7rem] flex-wrap gap-[0.5rem] overflow-hidden" aria-label="Cancelled words">
            {cancelledSoFar.map((w) => (
              <li key={w.word} className="rounded-[0.5rem] bg-ink-800 px-[0.6rem] py-[0.2rem] text-[1.2rem] font-bold uppercase text-ink-300 line-through decoration-flame decoration-[0.15rem]">
                {w.word}
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-[1rem]">
          {step.kind === "summary" ? (
            <button
              ref={primaryRef}
              type="button"
              disabled={busy}
              onClick={() => void act({ type: "next" })}
              className="flex-1 rounded-[0.8rem] bg-amber py-[1rem] text-[2rem] font-black text-ink-950 shadow-[0_0.3rem_0_#b37b00] outline-none focus:ring-[0.3rem] focus:ring-sky focus:ring-offset-[0.25rem] focus:ring-offset-ink-950 disabled:opacity-40"
            >
              {busy ? "Shuffling…" : isLastRound ? "Final results ▶" : "Next round ▶"}
            </button>
          ) : (
            <button
              ref={primaryRef}
              type="button"
              onClick={skip}
              className="rounded-[0.8rem] bg-ink-700 px-[2rem] py-[0.8rem] text-[1.6rem] font-black outline-none focus:ring-[0.3rem] focus:ring-sky"
            >
              Skip ▶▶
            </button>
          )}
        </div>
      </section>

      <aside className="flex min-h-0 flex-col gap-[0.8rem]">
        <h2 className="text-[1.8rem] font-black text-ink-300">Scores</h2>
        <ol className="flex flex-col gap-[0.7rem]">
          {[...players]
            .filter((p) => result.players[p.id] || p.score > 0)
            .sort((a, b) => (running.get(b.id) ?? 0) - (running.get(a.id) ?? 0))
            .map((p) => (
              <li key={p.id} className="relative flex items-center gap-[1rem] rounded-[1rem] bg-ink-900/80 px-[1.2rem] py-[0.7rem] ring-1 ring-white/10 transition-all">
                <Avatar emoji={p.emoji} color={p.color} />
                <span className="min-w-0 flex-1 truncate text-[1.7rem] font-black">{p.nickname}</span>
                <span className="text-[2.2rem] font-black tabular-nums">{running.get(p.id) ?? 0}</span>
                {gaining.has(p.id) && !reducedMotion && (
                  <span key={index} className={`absolute right-[1rem] -top-[0.5rem] animate-fly-up text-[2rem] font-black ${gaining.get(p.id)! < 0 ? "text-flame" : "text-amber"}`}>
                    {gaining.get(p.id)! < 0 ? "−" : "+"}
                    {Math.abs(gaining.get(p.id)!)}
                  </span>
                )}
              </li>
            ))}
        </ol>
      </aside>
    </div>
  );
}

function PlayerName({ p }: { p: PublicPlayer | undefined }) {
  if (!p) return <span>Someone</span>;
  return (
    <span className="flex items-center gap-[0.5rem]">
      <Avatar emoji={p.emoji} color={p.color} size="sm" /> {p.nickname}
    </span>
  );
}

/** "Most Evil", "Most Sabotaged" (with sympathy) and "Best Reflect". Shared with the final screen. */
export function SabotageAwardsRow({ awards, byId, className = "" }: { awards: SabotageAwards; byId: Map<string, PublicPlayer>; className?: string }) {
  const names = (ids: string[]) => ids.map((id) => byId.get(id)?.nickname ?? "?").join(" & ");
  const items: { emoji: string; title: string; body: string }[] = [];
  if (awards.mostEvil) items.push({ emoji: "😈", title: "Most Evil", body: `${names(awards.mostEvil.playerIds)} · ${awards.mostEvil.count} card${awards.mostEvil.count === 1 ? "" : "s"} played` });
  if (awards.mostSabotaged) {
    items.push({ emoji: "🫂", title: "Most Sabotaged", body: `${names(awards.mostSabotaged.playerIds)} · hit ${awards.mostSabotaged.count}× (we're so sorry)` });
  }
  if (awards.bestReflect) {
    const card = getCard(awards.bestReflect.cardId);
    items.push({ emoji: "🛡️", title: "Best Reflect", body: `${names([awards.bestReflect.playerId])} bounced ${card?.name ?? "a card"} back at ${names([awards.bestReflect.attackerId])}` });
  }
  if (items.length === 0) return null;
  return (
    <ul className={`grid grid-cols-3 gap-[0.8rem] ${className}`} aria-label="Sabotage awards">
      {items.map((it) => (
        <li key={it.title} className="rounded-[1rem] bg-ink-800 px-[1rem] py-[0.7rem]">
          <p className="text-[1.3rem] font-black">
            <span aria-hidden>{it.emoji}</span> {it.title}
          </p>
          <p className="text-[1.2rem] leading-snug text-ink-300">{it.body}</p>
        </li>
      ))}
    </ul>
  );
}

function Finders({ ids, byId }: { ids: string[]; byId: Map<string, PublicPlayer> }) {
  return (
    <div className="mt-[0.8rem] flex flex-wrap justify-center gap-[1rem]">
      {ids.map((id) => {
        const p = byId.get(id);
        if (!p) return null;
        return (
          <span key={id} className="flex items-center gap-[0.5rem] text-[1.6rem] font-bold">
            <Avatar emoji={p.emoji} color={p.color} size="sm" /> {p.nickname}
          </span>
        );
      })}
    </div>
  );
}
