"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Auth, HostView, RoomAction, RoomView } from "@/lib/shared/api";
import { ApiClientError, api } from "@/lib/client/api";
import { useHydrated, useSpatialNavigation } from "@/lib/client/hooks";
import { loadHostSession, saveHostSession, type HostSession } from "@/lib/client/session";
import { play } from "@/lib/client/sound";
import { useRoom } from "@/lib/client/useRoom";
import { Banner, Logo, MuteToggle } from "../ui";
import { HostFinal } from "./HostFinal";
import { HostLobby } from "./HostLobby";
import { HostReveal } from "./HostReveal";
import { HostRound } from "./HostRound";

export interface HostControls {
  view: HostView;
  /** Player ids considered connected (realtime presence when available, else heartbeats). */
  connected: Set<string>;
  act: (action: RoomAction) => Promise<void>;
  /** True while a phase-changing action (start, next, play again) is in flight. */
  busy: boolean;
  error: string | null;
  joinUrl: string;
  newRoom: () => Promise<void>;
}

export function HostApp() {
  const hydrated = useHydrated();
  useEffect(() => {
    document.documentElement.classList.add("tv");
    return () => document.documentElement.classList.remove("tv");
  }, []);
  useSpatialNavigation();
  if (!hydrated) return <div className="flex-1" />;
  return <HostAppInner />;
}

function HostAppInner() {
  const [session, setSession] = useState<HostSession | null>(loadHostSession);
  const [createError, setCreateError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const creating = useRef(false);

  const auth = useMemo<Auth | null>(() => (session ? { role: "host", token: session.hostToken } : null), [session]);
  const conn = useRoom<HostView>(session?.code ?? null, auth);

  const createRoom = useCallback(async () => {
    if (creating.current) return;
    creating.current = true;
    try {
      const res = await api.createRoom();
      const s = { code: res.code, hostToken: res.hostToken };
      saveHostSession(s);
      setCreateError(null);
      setSession(s);
    } catch (err) {
      setCreateError(err instanceof ApiClientError ? err.message : "Could not create a room");
    } finally {
      creating.current = false;
    }
  }, []);

  // The code of the room this screen has actually shown, so a room vanishing mid-game is never silently replaced.
  const [liveCode, setLiveCode] = useState<string | null>(null);
  if (conn.view && session && liveCode !== session.code) setLiveCode(session.code);
  const roomLost = !!conn.error && !!session && liveCode === session.code;

  // No room yet, or a stale saved one from an earlier visit: make a new one.
  useEffect(() => {
    // State is only set after the network round-trip resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!session || (conn.error && !roomLost)) void createRoom();
  }, [session, conn.error, roomLost, createRoom]);

  const act = useCallback(
    async (action: RoomAction) => {
      if (!session || !auth) return;
      // Settings and kicks don't lock the UI: disabling the focused button would drop TV-remote focus.
      const blocking = action.type === "start" || action.type === "next" || action.type === "playAgain";
      if (blocking) setBusy(true);
      setActionError(null);
      try {
        const res = await api.act(session.code, auth, action);
        if ("room" in res) conn.applyView(res as RoomView);
      } catch (err) {
        setActionError(err instanceof ApiClientError ? err.message : "Something went wrong");
      } finally {
        if (blocking) setBusy(false);
      }
    },
    [session, auth, conn],
  );

  const newRoom = useCallback(async () => {
    if (session && auth) await api.act(session.code, auth, { type: "close" }).catch(() => undefined);
    saveHostSession(null);
    setSession(null);
  }, [session, auth]);

  const phase = conn.view?.room.phase;
  const prevPhase = useRef(phase);
  useEffect(() => {
    if (phase === prevPhase.current) return;
    if (phase === "ROUND") play("start");
    if (phase === "REVEAL") play("end");
    if (phase === "FINAL") play("fanfare");
    prevPhase.current = phase;
  }, [phase]);

  if (roomLost) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-8">
        <Logo className="text-6xl" />
        <p className="text-3xl text-ink-300">{conn.error?.message ?? "This room has ended"}</p>
        <button type="button" onClick={() => void newRoom()} className="rounded-2xl bg-amber px-8 py-4 text-3xl font-black text-ink-950 focus:ring-8 focus:ring-sky">
          New room
        </button>
      </main>
    );
  }

  const view = conn.view;
  if (!view || !session) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-8">
        <Logo className="text-6xl" />
        <p className="text-3xl text-ink-300">{createError ?? "Setting up a room…"}</p>
        {createError && (
          <button type="button" onClick={() => void createRoom()} className="rounded-2xl bg-amber px-8 py-4 text-3xl font-black text-ink-950 focus:ring-8 focus:ring-sky">
            Try again
          </button>
        )}
      </main>
    );
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
  const controls: HostControls = {
    view,
    connected: new Set(view.room.players.filter((p) => conn.online?.has(p.id) ?? p.connected).map((p) => p.id)),
    act,
    busy,
    error: actionError,
    joinUrl: `${base.replace(/\/$/, "")}/play?code=${view.room.code}`,
    newRoom,
  };

  return (
    <main className="flex h-dvh flex-col overflow-hidden px-[2rem] py-[1.5rem] text-[1rem]">
      {conn.offline && <Banner>Connection lost. Reconnecting…</Banner>}
      <header className="mb-[1rem] flex items-center justify-between gap-4">
        <Logo className="text-[1.6rem]" />
        <div className="flex items-center gap-[1.5rem] text-[1.5rem] font-bold text-ink-300">
          {view.room.phase !== "LOBBY" && (
            <span>
              Join: <span className="font-black tracking-[0.2em] text-white">{view.room.code}</span>
            </span>
          )}
          <MuteToggle className="!w-[3rem] !text-[1.5rem]" />
        </div>
      </header>
      {view.room.phase === "LOBBY" && <HostLobby {...controls} />}
      {(view.room.phase === "COUNTDOWN" || view.room.phase === "ROUND") && <HostRound {...controls} />}
      {view.room.phase === "REVEAL" && <HostReveal key={view.room.lastResult?.round} {...controls} />}
      {view.room.phase === "FINAL" && <HostFinal {...controls} />}
    </main>
  );
}
