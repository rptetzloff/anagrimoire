// Publishes the generated puzzle files to Postgres, one row per file, so the
// dailies have a second home the client can read through an RPC that never
// serves tomorrow. Runs in the daily workflow right after fetch-puzzles.mjs,
// against the same directory that script wrote.
//
// Auth is the service-role key, held only as a CI secret — it bypasses RLS,
// which is the only way in, because the table grants nothing to web roles.
import { readFileSync } from 'node:fs';
import { FEED_NAMES, POOL_FEEDS } from './games.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kopsojnfqlzgyisexmrd.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATA_DIR = process.env.PUZZLES_DATA_DIR || 'data';

if (!KEY) {
  // throwing (rather than process.exit) lets in-flight handles settle, which
  // spares Windows node a libuv assertion on the way out
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
}

// read from src/games.ts rather than kept in step with it — the copies of this
// list that scripts kept by hand were all short, and a publish that silently
// skips a game leaves that game with no daily at all
const GAMES = FEED_NAMES;

const rows = [];

function add(file, env, game) {
  const payload = JSON.parse(readFileSync(`${DATA_DIR}/${file}`, 'utf8'));
  if (!payload.date) throw new Error(`${file} has no date — refusing to publish`);
  rows.push({ puzzle_date: payload.date, env, game, payload });
}

for (const game of GAMES) {
  add(`daily-${game}.json`, 'prod', game);
  add(`dev-daily-${game}.json`, 'dev', game);
}
// the practice pools are shared by both sites
for (const pool of POOL_FEEDS) add(`${pool}-pool.json`, 'shared', `${pool}-pool`);

const res = await fetch(`${SUPABASE_URL}/rest/v1/daily_puzzles`, {
  method: 'POST',
  headers: {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    // the second scheduled run and any manual re-run overwrite rather than fail
    Prefer: 'resolution=merge-duplicates',
  },
  body: JSON.stringify(rows),
});

if (!res.ok) {
  throw new Error(`Publish failed: ${res.status} ${await res.text()}`);
}

console.log(
  `Published ${rows.length} rows for ${rows[0].puzzle_date}: ` +
    `${GAMES.length} games x prod+dev, ${POOL_FEEDS.length} shared pools`
);
