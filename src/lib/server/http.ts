import "server-only";
import { GameError } from "@/lib/game/state-machine";
import type { ApiError, Auth } from "@/lib/shared/api";
import { normalizeRoomCode } from "./ids";

type Ctx = { params: Promise<object> };

/** Wraps a route handler: JSON in/out, GameError -> 4xx, anything else -> 500. */
export function route<T>(fn: (input: { body: Record<string, unknown>; code: string; req: Request }) => Promise<T>) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    try {
      const params = (await ctx.params) as { code?: string } | undefined;
      const code = normalizeRoomCode(params?.code ?? "");
      const body = req.method === "POST" ? await readBody(req) : {};
      const result = await fn({ body, code, req });
      return Response.json(result ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
    } catch (err) {
      if (err instanceof GameError) {
        return Response.json({ error: { code: err.code, message: err.message } } satisfies ApiError, { status: err.status });
      }
      console.error("[tumbleword]", err);
      return Response.json({ error: { code: "server_error", message: "Something went wrong" } } satisfies ApiError, { status: 500 });
    }
  };
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function str(value: unknown, name: string, max = 200): string {
  if (typeof value !== "string" || value.length > max) throw new GameError("bad_request", `Invalid ${name}`);
  return value;
}

export function optStr(value: unknown, name: string, max = 200): string | undefined {
  return value === undefined || value === null ? undefined : str(value, name, max);
}

export function parseAuth(value: unknown): Auth {
  const v = (value ?? {}) as Record<string, unknown>;
  if (v.role === "host") return { role: "host", token: str(v.token, "token") };
  if (v.role === "player") return { role: "player", playerId: str(v.playerId, "playerId"), token: str(v.token, "token") };
  throw new GameError("bad_request", "Missing credentials", 401);
}

export function parsePath(value: unknown): number[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length > 16 || !value.every((n) => Number.isInteger(n))) {
    throw new GameError("bad_request", "Invalid path");
  }
  return value as number[];
}
