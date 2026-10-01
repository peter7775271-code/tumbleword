"use client";

import { useState, type FormEvent } from "react";
import { MAX_NICKNAME_LENGTH, PLAYER_EMOJIS } from "@/lib/game/constants";
import { ApiClientError, api } from "@/lib/client/api";
import type { PlayerSession } from "@/lib/client/session";
import { Button, Logo } from "../ui";

interface Props {
  initialCode: string;
  initialNickname?: string;
  initialEmoji?: string;
  message?: string | null;
  onJoined: (session: PlayerSession) => void;
}

export function JoinForm({ initialCode, initialNickname = "", initialEmoji, message, onJoined }: Props) {
  const [code, setCode] = useState(initialCode);
  const [nickname, setNickname] = useState(initialNickname);
  const [emoji, setEmoji] = useState<string>(() => initialEmoji ?? PLAYER_EMOJIS[Math.floor(Math.random() * PLAYER_EMOJIS.length)]);
  const [error, setError] = useState<string | null>(message ?? null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.join(code, { nickname, emoji });
      const me = res.view.me;
      onJoined({ code, playerId: res.playerId, token: res.token, nickname: me.nickname, emoji: me.emoji });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not join");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-5 py-8">
      <Logo className="mx-auto text-[7vw] sm:text-3xl" />
      <label className="flex flex-col gap-2">
        <span className="text-sm font-bold uppercase tracking-widest text-ink-300">Room code</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4))}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="ABCD"
          required
          minLength={4}
          className="rounded-2xl bg-ink-800 px-4 py-4 text-center text-4xl font-black tracking-[0.4em] uppercase text-white outline-none ring-2 ring-ink-700 placeholder:text-ink-500 focus:ring-sky"
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-bold uppercase tracking-widest text-ink-300">Your name</span>
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value.slice(0, MAX_NICKNAME_LENGTH))}
          autoComplete="nickname"
          placeholder="Nickname"
          required
          maxLength={MAX_NICKNAME_LENGTH}
          className="rounded-2xl bg-ink-800 px-4 py-4 text-2xl font-bold text-white outline-none ring-2 ring-ink-700 placeholder:text-ink-500 focus:ring-sky"
        />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-bold uppercase tracking-widest text-ink-300">Pick an avatar</legend>
        <div className="grid grid-cols-8 gap-2" role="radiogroup">
          {PLAYER_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              role="radio"
              aria-checked={emoji === e}
              aria-label={`Avatar ${e}`}
              onClick={() => setEmoji(e)}
              className={`grid aspect-square place-items-center rounded-xl text-2xl transition ${
                emoji === e ? "scale-110 bg-amber ring-4 ring-white" : "bg-ink-800"
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="rounded-xl bg-flame/20 px-4 py-3 font-bold text-flame">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy || code.length !== 4 || !nickname.trim()} className="mt-auto py-5 text-2xl">
        {busy ? "Joining…" : "Join game"}
      </Button>
    </form>
  );
}
