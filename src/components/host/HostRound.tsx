"use client";

import { useEffect, useRef } from "react";
import { useServerNow } from "@/lib/client/hooks";
import { play } from "@/lib/client/sound";
import { BoardView } from "../BoardView";
import { Timer } from "../Timer";
import type { HostControls } from "./HostApp";
import { CardPips, EffectIcons, EventFeed, LegendaryBanner, SabotageAvatar } from "./SabotageHost";

export function HostRound({ view, connected }: HostControls) {
  const now = useServerNow(200);
  const { round, players, progress, settings, activeEffects, events } = view.room;
  const sabotage = settings.sabotageEnabled;
  const countingDown = !!round && now < round.startsAt;
  const timeUp = !!round && now >= round.endsAt;
  const countdown = round ? Math.max(1, Math.ceil((round.startsAt - now) / 1000)) : 0;
  const secondsLeft = round ? Math.ceil((round.endsAt - now) / 1000) : 0;

  const lastTick = useRef<number | null>(null);
  useEffect(() => {
    const tick = countingDown ? countdown : secondsLeft <= 5 && secondsLeft > 0 ? secondsLeft : null;
    if (tick !== null && tick !== lastTick.current) play("tick");
    lastTick.current = tick;
  }, [countingDown, countdown, secondsLeft]);

  if (!round) return null;
  const active = players.filter((p) => p.status === "active");
  const ranked = [...active].sort((a, b) => (progress[b.id] ?? 0) - (progress[a.id] ?? 0));

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[auto_minmax(0,1fr)] gap-[2.5rem]">
      <div className="relative h-full">
        <BoardView board={round.board} hidden={countingDown} className="h-full max-h-[calc(100dvh-7rem)]" />
        {countingDown && (
          <div className="absolute inset-0 grid place-items-center">
            <span key={countdown} className="animate-count text-[14rem] font-black text-amber drop-shadow-[0_0.5rem_0_#0b1027]">
              {countdown}
            </span>
          </div>
        )}
        {timeUp && (
          <div className="absolute inset-0 grid place-items-center rounded-[6%] bg-ink-950/75">
            <span className="animate-pop-in text-[5rem] font-black text-amber">Time&apos;s up!</span>
          </div>
        )}
      </div>

      <aside className="flex min-h-0 flex-col gap-[1.5rem]">
        <div>
          <p className="text-[1.6rem] font-bold text-ink-300">
            Round {round.number} of {settings.rounds}
          </p>
          <Timer
            endsAt={round.endsAt}
            durationMs={round.endsAt - round.startsAt}
            now={countingDown ? round.startsAt : now}
            className="mt-[0.5rem] text-[4rem] [&>div:first-child]:h-[1.2rem]"
          />
        </div>
        <ul className="flex min-h-0 flex-col gap-[0.8rem] overflow-hidden pt-[0.6rem]" aria-label="Words found per player">
          {ranked.map((p) => {
            const mine = activeEffects.filter((e) => e.targetId === p.id && e.expiresAt > now);
            const shielded = mine.some((e) => e.effectType === "shield");
            const wanted = mine.some((e) => e.effectType === "bounty");
            return (
              <li key={p.id} className={`flex items-center gap-[1rem] rounded-[1rem] bg-ink-900/80 px-[1.2rem] py-[0.8rem] ring-1 ${wanted ? "ring-[0.2rem] ring-amber" : "ring-white/10"}`}>
                <SabotageAvatar player={p} dimmed={!connected.has(p.id)} shielded={sabotage && shielded} wanted={sabotage && wanted} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-[0.8rem]">
                    <span className="truncate text-[1.8rem] font-black">{p.nickname}</span>
                    {sabotage && wanted && <span className="rounded-full bg-amber px-[0.6rem] py-[0.1rem] text-[1rem] font-black tracking-[0.15em] text-ink-950">👑 BOUNTY</span>}
                    {sabotage && shielded && <span className="sr-only">shielded</span>}
                  </div>
                  {sabotage && (
                    <div className="mt-[0.35rem] flex flex-wrap items-center gap-[0.8rem]">
                      <CardPips count={p.cardCount} />
                      <EffectIcons effects={mine} now={now} />
                    </div>
                  )}
                </div>
                <span key={progress[p.id] ?? 0} className="animate-pop-in text-[2.4rem] font-black tabular-nums text-sky">
                  {progress[p.id] ?? 0}
                </span>
                <span className="text-[1.2rem] text-ink-300">words</span>
              </li>
            );
          })}
        </ul>
        <div className="mt-auto flex flex-col gap-[0.8rem]">
          {sabotage && <EventFeed events={events} players={players} />}
          <p className="text-[1.3rem] text-ink-300">
            Words found by more than one player score <span className="font-black text-flame">zero</span>. Go weird!
          </p>
        </div>
      </aside>
      {sabotage && <LegendaryBanner events={events} players={players} />}
    </div>
  );
}
