import { getRoomService } from "@/lib/server/service";

/** Deletes inactive rooms. Called by Vercel Cron (see vercel.json) with CRON_SECRET as a bearer token. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: { code: "unauthorized", message: "Unauthorized" } }, { status: 401 });
  }
  const removed = await getRoomService().cleanup();
  return Response.json({ removed });
}
