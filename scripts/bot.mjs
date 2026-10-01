#!/usr/bin/env node
// Dev helper: a bot player for testing without a room full of phones.
// Usage: node scripts/bot.mjs <ROOM_CODE> [nickname] [baseUrl]
// It joins, keeps a heartbeat, and during rounds submits random tile paths (the server rejects non-words).

const [code, nickname = `Bot${Math.floor(Math.random() * 100)}`, base = "http://localhost:3000"] = process.argv.slice(2);
if (!code) {
  console.error("Usage: node scripts/bot.mjs <ROOM_CODE> [nickname] [baseUrl]");
  process.exit(1);
}

const post = async (path, body) => {
  const res = await fetch(`${base}/api/rooms/${code}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path}: ${data.error?.message ?? res.status}`);
  return data;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SIZE = 4;
const neighbours = (i) => {
  const out = [];
  for (let j = 0; j < SIZE * SIZE; j++) {
    const dr = Math.abs(Math.floor(i / SIZE) - Math.floor(j / SIZE));
    const dc = Math.abs((i % SIZE) - (j % SIZE));
    if (j !== i && dr <= 1 && dc <= 1) out.push(j);
  }
  return out;
};

function randomPath() {
  const length = 3 + Math.floor(Math.random() * 3);
  const path = [Math.floor(Math.random() * SIZE * SIZE)];
  while (path.length < length) {
    const options = neighbours(path.at(-1)).filter((n) => !path.includes(n));
    if (options.length === 0) break;
    path.push(options[Math.floor(Math.random() * options.length)]);
  }
  return path;
}

const joined = await post("join", { nickname });
const auth = { role: "player", playerId: joined.playerId, token: joined.token };
console.log(`${nickname} joined ${code}`);

let found = 0;
for (;;) {
  let view;
  try {
    view = await post("sync", { auth });
  } catch (err) {
    console.log(`${nickname} stopping: ${err.message}`);
    break;
  }
  const { phase, round } = view.room;
  if (phase === "ROUND" && round && Date.now() < round.endsAt) {
    for (let i = 0; i < 25; i++) {
      const path = randomPath();
      const word = path.map((t) => round.board.tiles[t]).join("");
      const res = await post("submit", { auth, word, path });
      if (res.outcome === "accepted") {
        found++;
        console.log(`${nickname}: ${word} (+${res.points})`);
        break;
      }
    }
    await sleep(1500 + Math.random() * 2000);
  } else {
    if (phase === "FINAL") console.log(`${nickname} final score: ${view.me.score} (${found} words)`);
    await sleep(2000);
  }
}
