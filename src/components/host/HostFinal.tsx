"use client";

import { useEffect, useRef } from "react";
import { Avatar } from "../ui";
import type { HostControls } from "./HostApp";
import { SabotageAwardsRow } from "./HostReveal";

const MEDALS = ["🥇", "🥈", "🥉"];

export function HostFinal({ view, act, busy, newRoom }: HostControls) {
  const stats = view.room.final ?? [];
  const byId = new Map(view.room.players.map((p) => [p.id, p]));
  const sabotage = !!view.room.finalAwards && stats.some((s) => s.cardsPlayed > 0 || s.hitsTaken > 0);
  const againRef = useRef<HTMLButtonElement>(null);
  useEffect(() => againRef.current?.focus(), []);

  const btn =
    "rounded-[0.8rem] py-[0.9rem] text-[1.8rem] font-black outline-none focus:ring-[0.3rem] focus:ring-sky focus:ring-offset-[0.25rem] focus:ring-offset-ink-950 disabled:opacity-40";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[1.5rem]">
      <h1 className="text-center text-[3rem] font-black">
        {stats[0] ? (
          <>
            {byId.get(stats[0].playerId)?.emoji} <span style={{ color: byId.get(stats[0].playerId)?.color }}>{byId.get(stats[0].playerId)?.nickname}</span> wins!
          </>
        ) : (
          "Game over"
        )}
      </h1>

      <table className="w-full border-separate border-spacing-y-[0.6rem] text-left">
        <thead className="text-[1.2rem] uppercase tracking-[0.15em] text-ink-300">
          <tr>
            <th className="px-[1rem]">Rank</th>
            <th className="px-[1rem]">Player</th>
            <th className="px-[1rem] text-right">Score</th>
            <th className="px-[1rem] text-right">Words</th>
            <th className="px-[1rem] text-right">Unique</th>
            <th className="px-[1rem]">Longest</th>
            <th className="px-[1rem]">Best word</th>
            {sabotage && (
              <>
                <th className="px-[1rem] text-right">😈 Played</th>
                <th className="px-[1rem] text-right">🎯 Hit</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {stats.map((s, i) => {
            const p = byId.get(s.playerId);
            if (!p) return null;
            return (
              <tr key={s.playerId} className="animate-fade-up bg-ink-900/80 text-[1.6rem]" style={{ animationDelay: `${i * 120}ms` }}>
                <td className="rounded-l-[1rem] px-[1rem] py-[0.7rem] text-[2rem] font-black">{MEDALS[s.rank - 1] ?? `#${s.rank}`}</td>
                <td className="px-[1rem]">
                  <span className="flex items-center gap-[0.8rem] font-black">
                    <Avatar emoji={p.emoji} color={p.color} /> {p.nickname}
                  </span>
                </td>
                <td className="px-[1rem] text-right text-[2.2rem] font-black tabular-nums text-amber">{s.score}</td>
                <td className="px-[1rem] text-right tabular-nums">{s.wordsFound}</td>
                <td className="px-[1rem] text-right tabular-nums text-sky">{s.uniqueWords}</td>
                <td className="px-[1rem] font-bold uppercase">{s.longestWord ?? "—"}</td>
                <td className={`px-[1rem] font-bold uppercase ${sabotage ? "" : "rounded-r-[1rem]"}`}>
                  {s.bestWord ? (
                    <>
                      {s.bestWord.word} <span className="text-amber">+{s.bestWord.points}</span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                {sabotage && (
                  <>
                    <td className="px-[1rem] text-right tabular-nums">{s.cardsPlayed}</td>
                    <td className="rounded-r-[1rem] px-[1rem] text-right tabular-nums">{s.hitsTaken}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {view.room.finalAwards && <SabotageAwardsRow awards={view.room.finalAwards} byId={byId} />}

      <div className="mt-auto flex gap-[1.5rem]">
        <button ref={againRef} type="button" disabled={busy} onClick={() => void act({ type: "playAgain" })} className={`${btn} flex-[2] bg-amber text-ink-950 shadow-[0_0.3rem_0_#b37b00]`}>
          Play again ▶
        </button>
        <button type="button" disabled={busy} onClick={() => void newRoom()} className={`${btn} flex-1 bg-ink-700`}>
          New room
        </button>
      </div>
    </div>
  );
}
