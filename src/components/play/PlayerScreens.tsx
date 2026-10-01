"use client";

import { useState } from "react";
import { MIN_PLAYERS } from "@/lib/game/constants";
import { scoreWord } from "@/lib/game/scoring";
import type { Auth, PlayerView, RoomAction } from "@/lib/shared/api";
import { ApiClientError, api } from "@/lib/client/api";
import { useCalmSetting } from "@/lib/client/calm";
import { useServerNow } from "@/lib/client/hooks";
import { Avatar, Button, Panel } from "../ui";

function useAction(view: PlayerView, auth: Auth, onView: (v: PlayerView) => void) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (action: RoomAction) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.act(view.room.code, auth, action);
      if ("room" in res) onView(res as PlayerView);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };
  return { run, error, busy };
}

/** Shown to the stand-in host (VIP) when the TV screen has dropped. */
function VipControls({ view, auth, onView }: { view: PlayerView; auth: Auth; onView: (v: PlayerView) => void }) {
  const { run, error, busy } = useAction(view, auth, onView);
  if (!view.me.isVip) return null;
  const { phase, settings, players } = view.room;
  const isLastRound = (view.room.round?.number ?? 0) >= settings.rounds;
  return (
    <Panel className="flex flex-col gap-3 ring-2 ring-amber">
      <p className="font-bold text-amber">👑 The host screen disconnected. You&apos;re in charge for now.</p>
      {phase === "LOBBY" && (
        <Button disabled={busy || players.length < MIN_PLAYERS} onClick={() => run({ type: "start" })} className="py-4 text-xl">
          Start game
        </Button>
      )}
      {phase === "REVEAL" && (
        <Button disabled={busy} onClick={() => run({ type: "next" })} className="py-4 text-xl">
          {isLastRound ? "Final results" : "Next round"}
        </Button>
      )}
      {phase === "FINAL" && (
        <Button disabled={busy} onClick={() => run({ type: "playAgain" })} className="py-4 text-xl">
          Play again
        </Button>
      )}
      {error && <p className="text-flame">{error}</p>}
    </Panel>
  );
}

function Me({ view }: { view: PlayerView }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <Avatar emoji={view.me.emoji} color={view.me.color} size="xl" />
      <p className="text-3xl font-black">{view.me.nickname}</p>
    </div>
  );
}

function CalmToggle() {
  const [calm, setCalm] = useCalmSetting();
  return (
    <div className="flex items-center justify-between gap-3 text-sm font-bold text-ink-300">
      <span>
        Reduce chaos effects
        <span className="block text-xs font-normal">Swaps spinning, wobbling and shuffling for a static label.</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-label="Reduce chaos effects"
        aria-checked={calm}
        onClick={() => setCalm(!calm)}
        className={`min-w-[4rem] rounded-full px-3 py-1 font-black outline-none focus-visible:ring-4 focus-visible:ring-sky ${calm ? "bg-sky text-ink-950" : "bg-ink-700 text-white"}`}
      >
        {calm ? "On" : "Off"}
      </button>
    </div>
  );
}

export function PlayerLobby({ view, auth, onView, onLeave }: { view: PlayerView; auth: Auth; onView: (v: PlayerView) => void; onLeave: () => void }) {
  const { settings, players } = view.room;
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-5 py-8">
      <p className="text-center text-sm font-bold uppercase tracking-widest text-ink-300">Room {view.room.code}</p>
      <Me view={view} />
      <Panel className="text-center">
        <p className="text-xl font-bold">You&apos;re in! 🎉</p>
        <p className="mt-1 text-ink-300">
          {players.length < MIN_PLAYERS ? "Waiting for more players…" : "Look at the big screen. The host will start soon."}
        </p>
        <p className="mt-4 text-sm text-ink-300">
          {settings.rounds} rounds · {settings.roundSeconds}s each · {players.length} player{players.length === 1 ? "" : "s"}
        </p>
        <p className="mt-1 text-sm text-ink-300">
          {settings.sabotageEnabled ? `🃏 Sabotage cards on: ${settings.cardMinLength}+ letter words earn cards` : "Sabotage cards off"}
        </p>
      </Panel>
      {settings.sabotageEnabled && (
        <Panel className="!p-4">
          <CalmToggle />
        </Panel>
      )}
      <VipControls view={view} auth={auth} onView={onView} />
      <Button variant="ghost" className="mt-auto" onClick={onLeave}>
        Leave room
      </Button>
    </div>
  );
}

export function PlayerCountdown({ view }: { view: PlayerView }) {
  const now = useServerNow(100);
  const secs = Math.max(1, Math.ceil(((view.room.round?.startsAt ?? now) - now) / 1000));
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <p className="text-xl font-bold text-ink-300">Round {view.room.round?.number} — get ready!</p>
      <p key={secs} className="animate-count text-[30vw] font-black text-amber">
        {secs}
      </p>
    </div>
  );
}

export function PlayerSpectating({ view }: { view: PlayerView }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-5 text-center">
      <Me view={view} />
      <Panel>
        <p className="text-xl font-bold">Round in progress 👀</p>
        <p className="mt-1 text-ink-300">Watch the big screen. You&apos;ll join from the next round.</p>
      </Panel>
    </div>
  );
}

function WordChip({ word, cancelled }: { word: string; cancelled?: boolean }) {
  return (
    <li
      className={`rounded-lg px-2 py-1 text-sm font-bold uppercase ${cancelled ? "bg-ink-800 text-ink-300" : "bg-sky/20 text-sky"}`}
    >
      {cancelled ? <span className="line-through decoration-flame decoration-2">✕ {word}</span> : <>✓ {word} {scoreWord(word)}</>}
    </li>
  );
}

export function PlayerReveal({ view, auth, onView }: { view: PlayerView; auth: Auth; onView: (v: PlayerView) => void }) {
  const result = view.room.lastResult;
  const mine = result?.players[view.me.id];
  const sab = result?.sabotage;
  const cards = sab?.players[view.me.id];
  const name = (id: string) => view.room.players.find((p) => p.id === id)?.nickname ?? "Someone";
  const robbedBy = (sab?.heists ?? []).filter((h) => h.targetId === view.me.id && h.points > 0);
  const robbed = (sab?.heists ?? []).filter((h) => h.sourceId === view.me.id);
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-5 py-6">
      <p className="text-center text-sm font-bold uppercase tracking-widest text-ink-300">
        Round {result?.round} of {view.room.settings.rounds}
      </p>
      {robbedBy.map((h) => (
        <Panel key={`robbed-${h.sourceId}`} className="animate-pop-in bg-flame/20 text-center ring-2 ring-flame">
          <p className="text-5xl" aria-hidden>
            💰😱
          </p>
          <p className="mt-1 text-2xl font-black">You got robbed!</p>
          <p className="text-ink-300">
            {name(h.sourceId)} stole <span className="font-black text-flame">{h.points}</span> of your points.
          </p>
        </Panel>
      ))}
      {mine ? (
        <Panel className="text-center">
          <p className="text-6xl font-black text-amber">
            {mine.total >= 0 ? "+" : ""}
            {mine.total}
          </p>
          <p className="mt-1 text-ink-300">
            {mine.uniqueWords.length} unique · {mine.cancelledWords.length} cancelled
            {mine.bonus > 0 && <span className="font-bold text-amber"> · longest word +{mine.bonus}!</span>}
          </p>
          {cards && (cards.cashIn > 0 || cards.bounty > 0 || cards.heist !== 0) && (
            <p className="mt-1 text-sm font-bold text-ink-300">
              Cards:{cards.cashIn > 0 && ` 🃏 cash-in +${cards.cashIn}`}
              {cards.bounty > 0 && ` · 👑 bounty +${cards.bounty}`}
              {robbed.map((h) => ` · 💰 robbed ${name(h.targetId)} +${h.points}`)}
              {robbedBy.map((h) => ` · 💰 stolen −${h.points}`)}
            </p>
          )}
          <p className="mt-2 text-lg font-bold">Total: {view.me.score}</p>
        </Panel>
      ) : (
        <Panel className="text-center text-ink-300">You watched this round.</Panel>
      )}
      <VipControls view={view} auth={auth} onView={onView} />
      {mine && mine.words.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold text-ink-300">Your words</h2>
          <ul className="flex flex-wrap gap-2">
            {mine.uniqueWords.map((w) => <WordChip key={w} word={w} />)}
            {mine.cancelledWords.map((w) => <WordChip key={w} word={w} cancelled />)}
          </ul>
          {mine.cancelledWords.length > 0 && (
            <p className="mt-2 text-sm text-ink-300">Crossed-out words were also found by someone else, so nobody scores them.</p>
          )}
        </section>
      )}
      {view.myMissed.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold text-ink-300">Words you missed</h2>
          <ul className="flex flex-wrap gap-2">
            {view.myMissed.map((w) => (
              <li key={w} className="rounded-lg bg-ink-800 px-2 py-1 text-sm font-bold uppercase text-ink-300">
                {w}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function PlayerFinal({ view, auth, onView }: { view: PlayerView; auth: Auth; onView: (v: PlayerView) => void }) {
  const stats = view.room.final?.find((s) => s.playerId === view.me.id);
  const medal = ["🥇", "🥈", "🥉"][(stats?.rank ?? 99) - 1] ?? "🎈";
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-5 py-8 text-center">
      <p className="text-7xl">{medal}</p>
      <p className="text-3xl font-black">{stats ? `#${stats.rank} of ${view.room.final!.length}` : "Game over"}</p>
      {stats && (
        <Panel className="grid grid-cols-2 gap-4 text-left">
          <Stat label="Score" value={stats.score} />
          <Stat label="Words found" value={stats.wordsFound} />
          <Stat label="Unique words" value={stats.uniqueWords} />
          <Stat label="Longest" value={stats.longestWord?.toUpperCase() ?? "—"} />
          <Stat label="Best word" value={stats.bestWord ? `${stats.bestWord.word.toUpperCase()} (${stats.bestWord.points})` : "—"} />
          {view.room.settings.sabotageEnabled && (
            <>
              <Stat label="Cards played" value={stats.cardsPlayed} />
              <Stat label="Times sabotaged" value={stats.hitsTaken} />
            </>
          )}
        </Panel>
      )}
      <VipControls view={view} auth={auth} onView={onView} />
      <p className="text-ink-300">The host can start another game from the big screen.</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-widest text-ink-300">{label}</p>
      <p className="break-words text-xl font-black">{value}</p>
    </div>
  );
}
