"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Auth, PlayerView } from "@/lib/shared/api";
import { ApiClientError, api } from "@/lib/client/api";
import { useHydrated } from "@/lib/client/hooks";
import { loadPlayerSession, savePlayerSession, type PlayerSession } from "@/lib/client/session";
import { play } from "@/lib/client/sound";
import { useRoom } from "@/lib/client/useRoom";
import { Banner, MuteToggle } from "../ui";
import { JoinForm } from "./JoinForm";
import { PlayerRound } from "./PlayerRound";
import { PlayerCountdown, PlayerFinal, PlayerLobby, PlayerReveal, PlayerSpectating } from "./PlayerScreens";

export function PlayerApp({ initialCode }: { initialCode: string }) {
  const hydrated = useHydrated();
  if (!hydrated) return <div className="flex-1" />;
  return <PlayerAppInner initialCode={initialCode} />;
}

function PlayerAppInner({ initialCode }: { initialCode: string }) {
  const [stored] = useState(loadPlayerSession);
  // A saved session for another room shouldn't hijack a fresh QR scan.
  const resumable = stored && (!initialCode || stored.code === initialCode) ? stored : null;
  const [session, setSession] = useState<PlayerSession | null>(resumable);
  const [message, setMessage] = useState<string | null>(null);

  const auth = useMemo<Auth | null>(
    () => (session ? { role: "player", playerId: session.playerId, token: session.token } : null),
    [session],
  );
  const conn = useRoom<PlayerView>(session?.code ?? null, auth);

  const onJoined = useCallback((s: PlayerSession) => {
    savePlayerSession(s);
    setMessage(null);
    setSession(s);
  }, []);

  // Session no longer valid: try to reclaim the seat by nickname once, otherwise show the join form.
  const reclaimTried = useRef(false);
  useEffect(() => {
    const err = conn.error;
    if (!err || !session) return;
    const reclaimable = err.code === "not_in_room" || err.code === "unauthorized";
    if (reclaimable && !reclaimTried.current) {
      reclaimTried.current = true;
      api
        .join(session.code, { nickname: session.nickname, emoji: session.emoji })
        .then((res) => onJoined({ ...session, playerId: res.playerId, token: res.token }))
        .catch((e) => {
          setMessage(e instanceof ApiClientError ? e.message : err.message);
          setSession(null);
        });
      return;
    }
    savePlayerSession({ ...session, token: "" });
    setMessage(err.message);
    setSession(null);
  }, [conn.error, session, onJoined]);

  const phase = conn.view?.room.phase;
  const prevPhase = useRef(phase);
  useEffect(() => {
    if (phase === prevPhase.current) return;
    if (phase === "ROUND") play("start");
    if (phase === "REVEAL") play("end");
    prevPhase.current = phase;
  }, [phase]);

  const leave = async () => {
    if (session && auth) await api.act(session.code, auth, { type: "leave" }).catch(() => undefined);
    savePlayerSession(session ? { ...session, token: "" } : null);
    setSession(null);
  };

  if (!session || !auth) {
    return (
      <JoinForm
        initialCode={initialCode || stored?.code || ""}
        initialNickname={stored?.nickname}
        initialEmoji={stored?.emoji}
        message={message}
        onJoined={onJoined}
      />
    );
  }

  const view = conn.view;
  return (
    <main className="flex flex-1 flex-col">
      {conn.offline && <Banner>Reconnecting…</Banner>}
      <div className="flex items-center justify-between px-4 pt-3">
        {view ? (
          <span className="flex items-center gap-2 font-bold" style={{ color: view.me.color }}>
            {view.me.emoji} {view.me.nickname}
            <span className="text-ink-300">· {view.me.score} pts</span>
          </span>
        ) : (
          <span />
        )}
        <MuteToggle />
      </div>
      {!view ? (
        <div className="flex flex-1 items-center justify-center text-xl text-ink-300">Connecting…</div>
      ) : view.me.status === "spectating" && view.room.phase !== "LOBBY" && view.room.phase !== "FINAL" ? (
        <PlayerSpectating view={view} />
      ) : view.room.phase === "LOBBY" ? (
        <PlayerLobby view={view} auth={auth} onView={conn.applyView} onLeave={leave} />
      ) : view.room.phase === "COUNTDOWN" ? (
        <PlayerCountdown view={view} />
      ) : view.room.phase === "ROUND" ? (
        <PlayerRound key={view.room.round!.number} view={view} auth={auth} onView={conn.applyView} refresh={conn.refresh} />
      ) : view.room.phase === "REVEAL" ? (
        <PlayerReveal view={view} auth={auth} onView={conn.applyView} />
      ) : (
        <PlayerFinal view={view} auth={auth} onView={conn.applyView} />
      )}
    </main>
  );
}
