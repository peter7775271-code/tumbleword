# Tumbleword

A party word game for 2 to 8 players. One shared screen (TV or laptop) shows the board; everyone plays on their phone. Find words by connecting adjacent letters. The twist: any word found by two or more players is cancelled for everyone, so the strange words win.

- Host screen: `/host` (room code, QR, lobby, live board, timer, animated reveal, final leaderboard)
- Controller: `/play` (join by code or QR, swipe or tap letters, instant feedback, haptics)

Built with Next.js (App Router, TypeScript), Tailwind CSS 4, Supabase Realtime (Broadcast + Presence) and Supabase Postgres, deployed on Vercel.

## Quick start (no Supabase needed)

```bash
npm install
npm run dev
```

Open http://localhost:3000/host on the big screen and http://localhost:3000/play on phones. Without Supabase env vars the server uses an in-memory store and clients poll every 1.5 s instead of using realtime. This is for local development only (state is lost on restart and does not work across serverless instances).

To play from real phones on your LAN, run `npm run dev -- -H 0.0.0.0`, open the host screen via your machine's LAN IP (for example `http://192.168.1.20:3000/host`) so the QR code points somewhere phones can reach, or set `NEXT_PUBLIC_SITE_URL`.

No friends handy? Add bot players that join and submit random tile paths:

```bash
node scripts/bot.mjs ABCD Robo http://localhost:3000
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm test` | Vitest unit + integration tests |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |

## Environment variables

| Name | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client | Publishable (anon) key, used only for Realtime channels |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Secret (service role) key for the `rooms`/`submissions` tables and server broadcasts |
| `NEXT_PUBLIC_SITE_URL` | client, optional | Base URL encoded in the join QR code (defaults to the host page's origin) |
| `CRON_SECRET` | server, recommended | Protects `/api/cron/cleanup`; Vercel Cron sends it automatically |

Put them in `.env.local` for local development.

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Run the migration in `supabase/migrations/0001_rooms.sql` (SQL editor, or `supabase db push` with the CLI). It creates `rooms` and `submissions` with RLS enabled and no policies, so only the service-role key can touch them.
3. Realtime: Broadcast and Presence need no tables. In Project Settings, Realtime, make sure public channels are allowed (the "private channels only" option must be off), because clients join `room:<CODE>` with the publishable key.
4. Copy the project URL, publishable key and secret key into the env vars above.

## Deploying to Vercel

1. Push the repo and import it in Vercel (framework preset: Next.js), or run `vercel` from the project root.
2. Add the env vars for Production (and Preview if you want working previews).
3. Deploy. `vercel.json` registers a daily cron that deletes rooms inactive for 30 minutes; rooms are also cleaned opportunistically whenever a new room is created.
4. `next.config.ts` includes `data/enable1.txt` in the API functions' file trace so the dictionary ships with them.

## How it works

### Folder structure

```
data/enable1.txt                 ENABLE word list (public domain), server-only
scripts/bot.mjs                  Dev bot player
supabase/migrations/             Postgres schema
src/app/
  page.tsx                       Landing (host or join)
  host/page.tsx                  Big-screen app
  play/page.tsx                  Phone controller
  api/rooms/route.ts             POST create room
  api/rooms/[code]/sync          POST heartbeat + current view (also drives timed transitions)
  api/rooms/[code]/join          POST join / rejoin
  api/rooms/[code]/action        POST start, next, playAgain, settings, kick, leave, close
  api/rooms/[code]/submit        POST a word (+ tile path)
  api/rooms/[code]/hint          POST request a hint
  api/cron/cleanup               GET delete inactive rooms
src/lib/game/                    Pure, isomorphic game logic (fully unit tested)
  types.ts                       Room, Player, Round, Board, Submission, results
  board.ts, rng.ts               Dice, rolling, adjacency, path validation
  trie.ts, solver.ts             Compact trie, DFS solver with prefix pruning, findPath
  generator.ts                   Re-roll until the board has >= minWords words
  scoring.ts, stats.ts           Length scoring, duplicate cancellation, longest bonus, final stats
  state-machine.ts               Room transitions, presence, permissions
src/lib/server/                  Server-only: dictionary cache, stores, room service, views, broadcast
src/lib/shared/                  API and realtime contracts shared by client and server
src/lib/client/                  API client, clock sync, useRoom hook, sound, haptics, TV navigation
src/components/                  Host and player UIs
```

### State machine

```
LOBBY --start--> COUNTDOWN (3s) --startsAt--> ROUND --endsAt + settle--> REVEAL
  ^                  ^                                                     |
  |                  +----------------- next (rounds left) ----------------+
  +------- play again ------- FINAL <------- next (last round) ------------+
```

Serverless functions have no timers, so time-based transitions happen lazily: every API call first applies any transition whose deadline has passed (`tick`), and every client calls `sync` right after each deadline. Rooms are written with optimistic concurrency (a `version` column, compare-and-swap with retries), so simultaneous requests can't corrupt state or double-score a round.

### Authority, secrecy and realtime

- The server owns all state. The dictionary and the board's solution never reach clients; words are validated server-side only.
- Submissions go only to the server (stored in their own table, so they don't contend with room writes). Other players only ever see counts until the reveal.
- After a mutation the server sends a Realtime broadcast containing just a version number (`sync`) or a word count (`progress`). Clients then fetch their own authoritative view. A spoofed broadcast can at most cause an extra fetch.
- Presence on the same channel gives instant connected/away dots; periodic `sync` calls double as heartbeats and as the fallback when realtime is unavailable.

### Timing and clock skew

The server stores `startsAt`/`endsAt` and returns `serverNow` with every response. Clients estimate their offset NTP-style (lowest round-trip of recent samples) and render countdowns in server time. Submissions after `endsAt` (plus a 300 ms in-flight grace) are rejected, and scoring waits a further settle window so in-flight words land first.

### Connection handling

- Players: `playerId` + secret token in `localStorage`; reloading rejoins the same seat. If storage is lost, joining with the same nickname reclaims a seat whose owner is disconnected.
- Host: the host token is in `localStorage`, so reloading the TV reattaches to the room. If the host screen goes silent for 20 s, the earliest-joined connected player becomes VIP and gets start/next/play-again controls on their phone until the host returns.
- Late joiners spectate until the next round starts. Kicked players can't rejoin with the same id.
- Inactive rooms are deleted after 30 minutes.

## Assumptions and decisions

- Name and visuals are original ("Tumbleword", navy and cream tiles, synthesized sounds). No third-party brand assets.
- Dictionary: ENABLE (public domain) rather than the TWL06 file in this folder, because TWL06 is not openly licensed. Words with a `q` not followed by `u` are dropped since Q only exists as the Qu tile; "Qu" counts as two letters for length and scoring.
- Longest-word bonus goes to the longest unique (non-cancelled) word; if several players tie on length, each gets +3.
- Dragging across tiles submits on release; tapping tiles builds a word that you send with Submit. Tapping the last tile again removes it; tapping an earlier tile truncates back to it.
- Hints are on by default, one per round, free: they highlight a starting tile and reveal the length of a 5 to 7 letter word you haven't found. The host can turn them off.
- Minimum 2 players to start, maximum 8 seats including spectators.
- Supabase Postgres is used for persistence because Vercel functions are stateless; only room state and submissions are stored, no history across games.
- The reveal runs automatically (about 20 s regardless of word count) and the host advances rounds manually; there is no auto-advance.
- Remote-friendly host screen: every control is a native button, arrow keys move focus spatially (`useSpatialNavigation`), and Enter/OK activates. Kicking needs a second press to confirm.
- No rate limiting on submissions beyond authentication; a determined player could probe the dictionary on their own board.
