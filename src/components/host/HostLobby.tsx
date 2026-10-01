"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_PLAYERS, MIN_PLAYERS, SETTING_LIMITS } from "@/lib/game/constants";
import type { Settings } from "@/lib/game/types";
import { Avatar } from "../ui";
import type { HostControls } from "./HostApp";
import { QrCode } from "./QrCode";

const tvButton =
  "rounded-[0.8rem] font-black outline-none transition focus:ring-[0.3rem] focus:ring-sky focus:ring-offset-[0.25rem] focus:ring-offset-ink-950 disabled:opacity-40";

function Stepper({
  label,
  value,
  display,
  onChange,
  limits,
  disabled = false,
}: {
  label: string;
  value: number;
  display: string;
  onChange: (v: number) => void;
  limits: { min: number; max: number; step: number };
  disabled?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-[1rem] ${disabled ? "opacity-50" : ""}`}>
      <span className="text-[1.3rem] font-bold text-ink-300">{label}</span>
      <div className="flex items-center gap-[0.6rem]">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          disabled={disabled || value <= limits.min}
          onClick={() => onChange(value - limits.step)}
          className={`${tvButton} h-[2.6rem] w-[2.6rem] bg-ink-700 text-[1.5rem]`}
        >
          −
        </button>
        <span className="min-w-[4.5rem] text-center text-[1.6rem] font-black tabular-nums" aria-live="polite">
          {display}
        </span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          disabled={disabled || value >= limits.max}
          onClick={() => onChange(value + limits.step)}
          className={`${tvButton} h-[2.6rem] w-[2.6rem] bg-ink-700 text-[1.5rem]`}
        >
          +
        </button>
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-[1rem]">
      <span className="text-[1.3rem] font-bold text-ink-300">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
        className={`${tvButton} min-w-[6rem] px-[1rem] py-[0.4rem] text-[1.4rem] ${value ? "bg-sky text-ink-950" : "bg-ink-700"}`}
      >
        {value ? "On" : "Off"}
      </button>
    </div>
  );
}

function KickButton({ name, onKick }: { name: string; onKick: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      aria-label={armed ? `Confirm removing ${name}` : `Remove ${name}`}
      onClick={() => (armed ? onKick() : setArmed(true))}
      className={`${tvButton} px-[0.7rem] py-[0.3rem] text-[1rem] ${armed ? "bg-flame text-ink-950" : "bg-ink-800 text-ink-300"}`}
    >
      {armed ? "Remove?" : "✕"}
    </button>
  );
}

export function HostLobby({ view, connected, act, busy, error, joinUrl }: HostControls) {
  const { players, settings, code } = view.room;
  const canStart = players.length >= MIN_PLAYERS;
  const startRef = useRef<HTMLButtonElement>(null);
  const setSetting = (patch: Partial<Settings>) => void act({ type: "settings", settings: patch });

  useEffect(() => {
    if (!document.activeElement || document.activeElement === document.body) startRef.current?.focus();
  }, [canStart]);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] gap-[2rem]">
      <section className="flex flex-col items-center justify-center gap-[1.2rem] rounded-[1.5rem] bg-ink-900/80 p-[2rem] ring-1 ring-white/10">
        <p className="text-[1.6rem] font-bold text-ink-300">Join on your phone</p>
        <QrCode value={joinUrl} className="w-[16rem]" />
        <p className="text-[1.3rem] text-ink-300">{joinUrl.replace(/^https?:\/\//, "").replace(/\?.*$/, "")}</p>
        <p className="text-[1.3rem] font-bold uppercase tracking-[0.3em] text-ink-300">Room code</p>
        <p className="text-[6.5rem] leading-none font-black tracking-[0.15em] text-amber">{code}</p>
      </section>

      <section className="flex min-h-0 flex-col gap-[1.2rem]">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[2rem] font-black">Players</h2>
          <span className="text-[1.4rem] text-ink-300">
            {players.length} / {MAX_PLAYERS}
          </span>
        </div>
        <ul className="grid grid-cols-2 gap-[0.8rem]">
          {Array.from({ length: MAX_PLAYERS }, (_, i) => {
            const p = players[i];
            if (!p) {
              return (
                <li key={`empty-${i}`} className="flex h-[4.6rem] items-center rounded-[1rem] border-[0.15rem] border-dashed border-ink-700 px-[1rem] text-[1.2rem] text-ink-500">
                  Waiting for player…
                </li>
              );
            }
            const online = connected.has(p.id);
            return (
              <li key={p.id} className="flex h-[4.6rem] animate-pop-in items-center gap-[0.8rem] rounded-[1rem] bg-ink-800 px-[1rem]">
                <span className="text-[2.2rem]">
                  <Avatar emoji={p.emoji} color={p.color} dimmed={!online} size="md" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[1.5rem] font-black">{p.nickname}</span>
                  <span className={`text-[1rem] font-bold ${online ? "text-mint" : "text-ink-300"}`}>{online ? "● connected" : "○ away"}</span>
                </span>
                <KickButton name={p.nickname} onKick={() => void act({ type: "kick", playerId: p.id })} />
              </li>
            );
          })}
        </ul>

        <div className="mt-auto grid grid-cols-2 gap-x-[2rem] gap-y-[0.8rem] rounded-[1.2rem] bg-ink-900/80 p-[1.2rem] ring-1 ring-white/10">
          <Stepper label="Rounds" value={settings.rounds} display={String(settings.rounds)} limits={SETTING_LIMITS.rounds} onChange={(rounds) => setSetting({ rounds })} />
          <Stepper label="Round length" value={settings.roundSeconds} display={`${settings.roundSeconds}s`} limits={SETTING_LIMITS.roundSeconds} onChange={(roundSeconds) => setSetting({ roundSeconds })} />
          <Stepper label="Min words / board" value={settings.minWords} display={String(settings.minWords)} limits={SETTING_LIMITS.minWords} onChange={(minWords) => setSetting({ minWords })} />
          <Toggle label="Hints" value={settings.hints} onChange={(hints) => setSetting({ hints })} />
          <Toggle label="🃏 Sabotage cards" value={settings.sabotageEnabled} onChange={(sabotageEnabled) => setSetting({ sabotageEnabled })} />
          <Stepper
            label="New card every"
            value={settings.cardIntervalSeconds}
            display={`${settings.cardIntervalSeconds}s`}
            limits={SETTING_LIMITS.cardIntervalSeconds}
            disabled={!settings.sabotageEnabled}
            onChange={(cardIntervalSeconds) => setSetting({ cardIntervalSeconds })}
          />
        </div>

        <div className="flex items-center gap-[1.5rem]">
          <button
            ref={startRef}
            type="button"
            disabled={!canStart || busy}
            onClick={() => void act({ type: "start" })}
            className={`${tvButton} flex-1 bg-amber py-[1rem] text-[2.2rem] text-ink-950 shadow-[0_0.3rem_0_#b37b00]`}
          >
            {busy ? "Shuffling…" : canStart ? "Start game ▶" : `Need ${MIN_PLAYERS - players.length} more player${MIN_PLAYERS - players.length === 1 ? "" : "s"}`}
          </button>
        </div>
        {error && <p className="text-[1.3rem] font-bold text-flame">{error}</p>}
      </section>
    </div>
  );
}
