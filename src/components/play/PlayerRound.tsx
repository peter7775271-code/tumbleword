"use client";

import { useState } from "react";
import { wordFromPath } from "@/lib/game/board";
import { MIN_WORD_LENGTH } from "@/lib/game/constants";
import { scoreWord } from "@/lib/game/scoring";
import type { Auth, Hint, PlayerView, SubmitOutcome } from "@/lib/shared/api";
import { ApiClientError, api } from "@/lib/client/api";
import { vibrate } from "@/lib/client/haptics";
import { useServerNow } from "@/lib/client/hooks";
import { play } from "@/lib/client/sound";
import { Timer } from "../Timer";
import { Button } from "../ui";
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

export function PlayerRound({ view, auth }: { view: PlayerView; auth: Auth }) {
  const round = view.room.round!;
  const now = useServerNow(200);
  const [path, setPath] = useState<number[]>([]);
  const [accepted, setAccepted] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [hint, setHint] = useState<{ round: number; hint: Hint } | null>(null);
  const [hintsLeft, setHintsLeft] = useState<number | null>(null);

  // Server list (survives reloads) merged with words accepted since the last sync.
  const words = [...new Set([...view.myWords, ...accepted])];
  const timeUp = now >= round.endsAt;
  const word = wordFromPath(round.board, path);
  const activeHint = hint?.round === round.number ? hint.hint : null;

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
      if (res.outcome === "accepted") {
        setAccepted((a) => [...a, res.word]);
        say(true, `+${res.points}  ${res.word.toUpperCase()}`);
      } else {
        say(false, MESSAGES[res.outcome]);
      }
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

  const left = hintsLeft ?? view.hintsLeft;

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 px-4 pb-4 pt-3">
      <div className="flex items-center gap-3 text-xl">
        <Timer endsAt={round.endsAt} durationMs={round.endsAt - round.startsAt} now={now} className="flex-1" />
        <span className="rounded-full bg-ink-800 px-3 py-1 text-base font-bold" aria-label={`${words.length} words found`}>
          {words.length} 📝
        </span>
      </div>

      <div className="flex h-16 items-center justify-center" aria-live="polite">
        {path.length > 0 ? (
          <span className="text-4xl font-black tracking-widest">{word.toUpperCase()}</span>
        ) : feedback ? (
          <span
            key={feedback.id}
            className={`animate-pop-in rounded-full px-4 py-2 text-xl font-black ${
              feedback.good ? "bg-sky text-ink-950" : "animate-shake bg-flame text-ink-950"
            }`}
          >
            {feedback.good ? "✓ " : "✕ "}
            {feedback.text}
          </span>
        ) : (
          <span className="text-lg text-ink-300">{timeUp ? "Time's up!" : "Drag across letters to make words"}</span>
        )}
      </div>

      <SwipeBoard
        board={round.board}
        path={path}
        onPathChange={setPath}
        onDragEnd={submit}
        disabled={timeUp}
        hintTile={activeHint?.start ?? null}
      />

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

      <ul className="flex flex-wrap content-start gap-2 overflow-y-auto" aria-label="Your words">
        {[...words].reverse().map((w) => (
          <li key={w} className="rounded-lg bg-ink-800 px-2 py-1 text-sm font-bold uppercase">
            {w} <span className="text-amber">{scoreWord(w)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
