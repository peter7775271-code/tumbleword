"use client";

import { useEffect, useState } from "react";
import { wordFromPath } from "@/lib/game/board";
import { CARD_RULES, TIER_STYLE, getCard, type CardDefinition } from "@/lib/game/cards";
import { MIN_WORD_LENGTH } from "@/lib/game/constants";
import { scoreWord } from "@/lib/game/scoring";
import type { Auth, Hint, PlayerView, SubmitOutcome } from "@/lib/shared/api";
import { ApiClientError, api } from "@/lib/client/api";
import { useCalmEffects } from "@/lib/client/calm";
import { serverClock } from "@/lib/client/clock";
import { vibrate } from "@/lib/client/haptics";
import { useServerNow } from "@/lib/client/hooks";
import { play } from "@/lib/client/sound";
import { Timer } from "../Timer";
import { Button } from "../ui";
import { CardTray } from "./CardTray";
import { composeEffects } from "./effects";
import { EffectChips, alertFor, type SabotageAlert } from "./SabotageStatus";
import { SwipeBoard } from "./SwipeBoard";

const MESSAGES: Record<Exclude<SubmitOutcome, "accepted">, string> = {
  duplicate: "You already found that",
  too_short: `Too short (${MIN_WORD_LENGTH}+ letters)`,
  not_a_word: "Not in the word list",
  not_on_board: "Can't trace that on the board",
  round_over: "Time's up!",
  not_started: "Wait for it…",
  not_playing: "You're watching this round",
};

interface Feedback {
  good: boolean;
  text: string;
  id: number;
}

type Pop = { id: number; card: CardDefinition };

export function PlayerRound({ view, auth, onView, refresh }: { view: PlayerView; auth: Auth; onView: (v: PlayerView) => void; refresh: () => Promise<void> }) {
  const round = view.room.round!;
  const now = useServerNow(200);
  const calm = useCalmEffects();
  const [path, setPath] = useState<number[]>([]);
  const [accepted, setAccepted] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [hint, setHint] = useState<{ round: number; hint: Hint } | null>(null);
  const [hintsLeft, setHintsLeft] = useState<number | null>(null);

  // Server list (survives reloads) merged with words accepted since the last sync.
  const words = [...new Set([...view.myWords, ...accepted])];
  const deadline = view.sabotage.deadline ?? round.endsAt;
  const timeUp = now >= deadline;
  const word = wordFromPath(round.board, path);
  const activeHint = hint?.round === round.number ? hint.hint : null;
  const myEffects = view.room.activeEffects.filter((e) => e.targetId === view.me.id && e.expiresAt > now);
  const previewStyle = composeEffects(myEffects, now, calm, round.board.size).previewStyle;

  // "Clock stolen" flash whenever my deadline moves earlier.
  const stolen = view.sabotage.clockStolenMs;
  const [lastStolen, setLastStolen] = useState(stolen);
  const [clockFlash, setClockFlash] = useState<{ total: number; delta: number } | null>(null);
  if (stolen !== lastStolen) {
    setLastStolen(stolen);
    if (stolen > lastStolen) setClockFlash({ total: stolen, delta: stolen - lastStolen });
  }

  // Alerts for sabotage involving me. Events already in the feed when this screen mounted are not replayed.
  const [seen, setSeen] = useState(() => new Set(view.room.events.map((e) => e.id)));
  const [alert, setAlert] = useState<SabotageAlert | null>(null);
  const fresh = view.room.events.filter((e) => !seen.has(e.id));
  if (fresh.length > 0) {
    setSeen(new Set([...seen, ...fresh.map((e) => e.id)]));
    const latest = fresh.map((e) => alertFor(e, view.me.id, view.room.players)).filter((a) => !!a).at(-1);
    if (latest) setAlert(latest);
  }

  // "+ card" pop whenever a new card lands in my hand.
  const hand = view.sabotage.hand;
  const [lastHand, setLastHand] = useState(hand);
  const [pop, setPop] = useState<Pop | null>(null);
  if (hand !== lastHand) {
    setLastHand(hand);
    const card = hand.length > lastHand.length ? getCard(hand.at(-1)!) : undefined;
    if (card) setPop((prev) => ({ id: (prev?.id ?? 0) + 1, card }));
  }
  useEffect(() => {
    if (!pop) return;
    vibrate("card");
    play("card");
  }, [pop]);

  // Deals happen on the server whenever anyone syncs; ask for mine as soon as it's due.
  const nextCardAt = hand.length < CARD_RULES.maxHandSize ? view.sabotage.nextCardAt : null;
  useEffect(() => {
    if (nextCardAt === null) return;
    const id = window.setTimeout(() => void refresh(), Math.max(0, serverClock.toLocal(nextCardAt) - Date.now()) + 150);
    return () => window.clearTimeout(id);
  }, [nextCardAt, refresh]);

  useEffect(() => {
    if (!alert) return;
    vibrate(alert.tone === "good" ? "success" : "hit");
    play(alert.tone === "good" ? "shield" : "hit");
  }, [alert]);
  useEffect(() => {
    if (clockFlash) vibrate("hit");
  }, [clockFlash]);

  const say = (good: boolean, text: string) => {
    setFeedback({ good, text, id: Date.now() });
    vibrate(good ? "success" : "error");
    play(good ? "good" : "bad");
  };

  const submit = async (p: number[]) => {
    const w = wordFromPath(round.board, p);
    setPath([]);
    if (p.length === 0) return;
    if (w.length < MIN_WORD_LENGTH) return say(false, MESSAGES.too_short);
    if (words.includes(w)) return say(false, MESSAGES.duplicate);
    try {
      const res = await api.submit(view.room.code, auth, w, p);
      if (res.outcome !== "accepted") return say(false, MESSAGES[res.outcome]);
      setAccepted((a) => [...a, res.word]);
      say(true, `+${res.points}  ${res.word.toUpperCase()}${res.bounty ? "  👑+1" : ""}`);
    } catch (err) {
      say(false, err instanceof ApiClientError ? err.message : "Couldn't send, try again");
    }
  };

  const askHint = async () => {
    try {
      const res = await api.hint(view.room.code, auth);
      setHintsLeft(res.hintsLeft);
      if (res.hint) {
        setHint({ round: round.number, hint: res.hint });
        say(true, `Try a ${res.hint.length}-letter word from the glowing tile`);
      } else say(false, "You found everything!");
    } catch (err) {
      say(false, err instanceof ApiClientError ? err.message : "No hint available");
    }
  };

  const playCard = async (card: CardDefinition, targetId: string | null): Promise<boolean> => {
    vibrate("play");
    play("zap");
    try {
      const res = await api.act(view.room.code, auth, { type: "playCard", cardId: card.id, targetId });
      if ("room" in res) onView(res as PlayerView);
      const target = targetId ? view.room.players.find((p) => p.id === targetId)?.nickname : null;
      setFeedback({ good: true, text: `${card.emoji} ${card.name}${target ? ` → ${target}` : ""}`, id: Date.now() });
      return true;
    } catch (err) {
      say(false, err instanceof ApiClientError ? err.message : "Card could not be played");
      return false;
    }
  };

  const left = hintsLeft ?? view.hintsLeft;
  const sabotage = view.room.settings.sabotageEnabled;

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 px-4 pt-3">
      <div className="relative flex items-center gap-3 text-xl">
        <Timer endsAt={deadline} durationMs={round.endsAt - round.startsAt} now={now} className="flex-1" />
        <span className="rounded-full bg-ink-800 px-3 py-1 text-base font-bold" aria-label={`${words.length} words found`}>
          {words.length} 📝
        </span>
        {clockFlash && (
          <span
            key={clockFlash.total}
            role="status"
            className="pointer-events-none absolute left-1/3 top-full z-30 animate-flash rounded-full bg-flame px-3 py-1 text-base font-black text-ink-950 shadow-lg"
          >
            ⏰ Clock stolen −{clockFlash.delta / 1000}s
          </span>
        )}
      </div>

      <div className="flex h-16 items-center justify-center" aria-live="polite">
        {path.length > 0 ? (
          <span className="text-4xl font-black tracking-widest" style={previewStyle}>
            {word.toUpperCase()}
          </span>
        ) : feedback ? (
          <span
            key={feedback.id}
            className={`animate-pop-in rounded-full px-4 py-2 text-xl font-black ${feedback.good ? "bg-sky text-ink-950" : "animate-shake bg-flame text-ink-950"}`}
          >
            {feedback.good ? "✓ " : "✕ "}
            {feedback.text}
          </span>
        ) : (
          <span className="text-lg text-ink-300">{timeUp ? "Time's up!" : "Drag across letters to make words"}</span>
        )}
      </div>

      {sabotage && <EffectChips effects={myEffects} now={now} immuneUntil={view.sabotage.immuneUntil} clockStolenMs={stolen} />}

      <div className="relative">
        <SwipeBoard
          board={round.board}
          path={path}
          onPathChange={setPath}
          onDragEnd={submit}
          disabled={timeUp}
          hintTile={activeHint?.start ?? null}
          effects={myEffects}
          now={now}
          calm={calm}
        />
        {alert && (
          <div
            key={alert.id}
            role="status"
            className={`pointer-events-none absolute inset-x-2 top-2 z-10 animate-card-pop rounded-2xl px-3 py-2 text-center text-base font-black shadow-xl ${
              alert.tone === "good" ? "bg-mint text-ink-950" : "bg-flame text-ink-950"
            }`}
          >
            <span aria-hidden>{alert.emoji}</span> {alert.text}
          </div>
        )}
        {pop && <CardPop key={pop.id} pop={pop} />}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Button variant="secondary" className="py-4 text-xl" onClick={() => setPath([])} disabled={path.length === 0}>
          Clear
        </Button>
        <Button
          variant="secondary"
          className="py-4 text-xl"
          onClick={askHint}
          disabled={timeUp || left <= 0 || !view.room.settings.hints}
          aria-label={`Hint, ${left} left`}
        >
          💡 {left}
        </Button>
        <Button className="py-4 text-xl" onClick={() => submit(path)} disabled={path.length === 0 || timeUp}>
          Submit
        </Button>
      </div>

      <ul className="flex flex-wrap content-start gap-2 pb-4" aria-label="Your words">
        {[...words].reverse().map((w) => (
          <li key={w} className="rounded-lg bg-ink-800 px-2 py-1 text-sm font-bold uppercase">
            {w} <span className="text-amber">{scoreWord(w)}</span>
          </li>
        ))}
      </ul>

      {sabotage && <CardTray view={view} now={now} onPlay={playCard} />}
    </div>
  );
}

/** "+ card" moment: tier color, icon and text together. */
function CardPop({ pop }: { pop: Pop }) {
  const tier = TIER_STYLE[pop.card.tier];
  return (
    <div
      role="status"
      className="pointer-events-none absolute inset-x-6 bottom-3 z-10 flex animate-card-pop items-center gap-3 rounded-2xl border-4 bg-ink-900 px-3 py-2 shadow-xl"
      style={{ borderColor: tier.color }}
    >
      <span className="text-4xl" aria-hidden>
        {pop.card.emoji}
      </span>
      <span className="flex flex-col">
        <span className="text-xs font-black uppercase tracking-widest" style={{ color: tier.color }}>
          + Card · {tier.symbol} {tier.label}
        </span>
        <span className="text-lg font-black">{pop.card.name}</span>
      </span>
    </div>
  );
}
