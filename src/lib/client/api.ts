import type {
  ApiError,
  Auth,
  CreateRoomResponse,
  HintResponse,
  JoinRequest,
  JoinResponse,
  RoomAction,
  RoomView,
  SubmitResponse,
} from "@/lib/shared/api";
import { serverClock } from "./clock";

export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Errors after which the current session in this room is over. */
export const FATAL_CODES = new Set(["room_not_found", "room_closed", "kicked", "not_in_room", "unauthorized"]);

function findServerNow(data: unknown): number | null {
  const d = data as { room?: { serverNow?: number }; view?: { room?: { serverNow?: number } } };
  return d?.room?.serverNow ?? d?.view?.room?.serverNow ?? null;
}

async function post<T>(path: string, body: unknown = {}): Promise<T> {
  const sentAt = Date.now();
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiClientError("network", "Connection problem. Retrying…", 0);
  }
  const receivedAt = Date.now();
  const data = (await res.json().catch(() => null)) as T | ApiError | null;
  if (!res.ok || !data) {
    const err = (data as ApiError | null)?.error;
    throw new ApiClientError(err?.code ?? "server_error", err?.message ?? "Something went wrong", res.status);
  }
  const serverNow = findServerNow(data);
  if (serverNow !== null) serverClock.sample(serverNow, sentAt, receivedAt);
  return data as T;
}

const room = (code: string, action: string) => `/api/rooms/${encodeURIComponent(code)}/${action}`;

export const api = {
  createRoom: () => post<CreateRoomResponse>("/api/rooms"),
  sync: (code: string, auth: Auth) => post<RoomView>(room(code, "sync"), { auth }),
  join: (code: string, req: JoinRequest) => post<JoinResponse>(room(code, "join"), req),
  act: (code: string, auth: Auth, action: RoomAction) => post<RoomView | { ok: true }>(room(code, "action"), { auth, action }),
  submit: (code: string, auth: Auth, word: string, path: number[] | null) =>
    post<SubmitResponse>(room(code, "submit"), { auth, word, path }),
  hint: (code: string, auth: Auth) => post<HintResponse>(room(code, "hint"), { auth }),
};
