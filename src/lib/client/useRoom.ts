"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ROUND_SETTLE_MS } from "@/lib/game/constants";
import type { Auth, RoomView } from "@/lib/shared/api";
import { roomTopic, type PresenceMeta, type RealtimeEvent } from "@/lib/shared/realtime";
import { ApiClientError, FATAL_CODES, api } from "./api";
import { serverClock } from "./clock";
import { getBrowserSupabase } from "./supabase";

const POLL_WITH_REALTIME_MS = 5_000;
const POLL_WITHOUT_REALTIME_MS = 1_500;

export interface RoomConnection<V extends RoomView> {
  view: V | null;
  /** Fatal error (room gone, kicked...). Transient network errors are retried silently. */
  error: ApiClientError | null;
  /** True while requests are failing (shown as a "reconnecting" banner). */
  offline: boolean;
  realtime: boolean;
  /** Player ids currently present on the realtime channel, or null without realtime. */
  online: Set<string> | null;
  refresh: () => Promise<void>;
  /** Accepts a view returned by another API call (newer versions win). */
  applyView: (view: RoomView) => void;
}

/**
 * Keeps a room view in sync: realtime broadcast for instant updates, presence for
 * connection dots, periodic polling as heartbeat + fallback, and refreshes at deadlines.
 */
export function useRoom<V extends RoomView>(code: string | null, auth: Auth | null): RoomConnection<V> {
  const authKey = auth ? JSON.stringify(auth) : null;
  // State is tagged with the room+identity it belongs to, so switching rooms resets it implicitly.
  const key = code && authKey ? `${code}|${authKey}` : null;
  const [viewState, setViewState] = useState<{ key: string; view: V } | null>(null);
  const [errorState, setErrorState] = useState<{ key: string; error: ApiClientError } | null>(null);
  const [offline, setOffline] = useState(false);
  const [realtime, setRealtime] = useState(false);
  const [online, setOnline] = useState<Set<string> | null>(null);
  const versionRef = useRef({ key: null as string | null, version: 0 });
  const authRef = useRef(auth);

  useEffect(() => {
    authRef.current = auth;
  });

  const view = viewState && viewState.key === key ? viewState.view : null;
  const error = errorState && errorState.key === key ? errorState.error : null;

  const setView = useCallback(
    (update: (v: V | null) => V | null) => {
      if (!key) return;
      setViewState((s) => {
        const next = update(s && s.key === key ? s.view : null);
        return next ? { key, view: next } : null;
      });
    },
    [key],
  );

  const setError = useCallback((err: ApiClientError) => key && setErrorState({ key, error: err }), [key]);

  const applyView = useCallback(
    (next: RoomView) => {
      if (versionRef.current.key !== key) versionRef.current = { key, version: 0 };
      if (next.room.version < versionRef.current.version) return;
      versionRef.current.version = next.room.version;
      setView(() => next as V);
    },
    [key, setView],
  );

  const refresh = useCallback(async () => {
    const a = authRef.current;
    if (!code || !a) return;
    try {
      applyView(await api.sync(code, a));
      setOffline(false);
    } catch (e) {
      const err = e instanceof ApiClientError ? e : new ApiClientError("unknown", String(e), 0);
      if (FATAL_CODES.has(err.code)) setError(err);
      else setOffline(true);
    }
  }, [code, applyView, setError]);

  useEffect(() => {
    // State is only set after the network round-trip resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (key) void refresh();
  }, [key, refresh]);

  // Realtime: broadcast + presence.
  useEffect(() => {
    const supabase = getBrowserSupabase();
    const a = authRef.current;
    if (!supabase || !code || !a) return;
    const meta: PresenceMeta = a.role === "host" ? { role: "host" } : { role: "player", playerId: a.playerId };
    const channel = supabase.channel(roomTopic(code), {
      config: { broadcast: { self: false }, presence: { key: a.role === "host" ? "host" : a.playerId } },
    });
    channel
      .on("broadcast", { event: "sync" }, ({ payload }) => {
        if ((payload as RealtimeEvent & { type: "sync" }).version > versionRef.current.version) void refresh();
      })
      .on("broadcast", { event: "progress" }, ({ payload }) => {
        const p = payload as RealtimeEvent & { type: "progress" };
        setView((v) => (v ? { ...v, room: { ...v.room, progress: { ...v.room.progress, [p.playerId]: p.count } } } : v));
      })
      .on("broadcast", { event: "closed" }, () => setError(new ApiClientError("room_closed", "The host closed this room", 410)))
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresenceMeta>();
        const ids = Object.values(state)
          .flat()
          .map((m) => m.playerId)
          .filter((id): id is string => !!id);
        setOnline(new Set(ids));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRealtime(true);
          void channel.track(meta);
          void refresh();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setRealtime(false);
          setOnline(null);
        }
      });
    return () => {
      void supabase.removeChannel(channel);
      setRealtime(false);
      setOnline(null);
    };
  }, [code, authKey, refresh, setView, setError]);

  // Polling doubles as the heartbeat that keeps this client "connected" server-side.
  useEffect(() => {
    if (!code || !authKey || error) return;
    const id = setInterval(() => void refresh(), realtime ? POLL_WITH_REALTIME_MS : POLL_WITHOUT_REALTIME_MS);
    const wake = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }, [code, authKey, error, realtime, refresh]);

  // Refresh right after phase deadlines so transitions feel instant.
  const startsAt = view?.room.round?.startsAt;
  const endsAt = view?.room.round?.endsAt;
  const phase = view?.room.phase;
  useEffect(() => {
    let deadline: number | null = null;
    if (phase === "COUNTDOWN" && startsAt) deadline = startsAt + 50;
    else if (phase === "ROUND" && endsAt) deadline = endsAt + ROUND_SETTLE_MS + 100;
    if (deadline === null) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const delay = Math.max(0, serverClock.toLocal(deadline) - Date.now());
    timers.push(setTimeout(() => void refresh(), delay));
    timers.push(setTimeout(() => void refresh(), delay + 1_500));
    return () => timers.forEach(clearTimeout);
  }, [phase, startsAt, endsAt, refresh]);

  return { view, error, offline, realtime, online, refresh, applyView };
}
