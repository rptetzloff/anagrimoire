// Works out when each page last actually changed, and writes it down.
//
// This used to run inside the Vite build, which was the wrong place: Render
// clones without usable history, so `git log` there returned nothing and the
// sitemap shipped with no dates at all. Verified rather than assumed — the dev
// site deployed the build-time version and served 33 URLs with zero <lastmod>.
//
// So the dates are computed here, where history is guaranteed (the workflow
// checks out with fetch-depth: 0), committed as data, and merely read by the
// build. git leaves the build path entirely rather than being tried and
// silently fallen back from.
//
// Run by .github/workflows/route-lastmod.yml, or by hand: npm run lastmod

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const OUT = 'data/route-lastmod.json';

// Kept in step with SITEMAP_PATHS in vite.config.ts by hand. Drift is not
// silent: the build warns about any page it can't find a date for.
const GAME_SLUGS = ['guess', 'scramble', 'hive', 'grid', 'boxed', 'weave', 'squares'];

const GAME_FILES = {
  guess: 'src/GuessGame.tsx',
  scramble: 'src/ScrambleGame.tsx',
  hive: 'src/HiveGame.tsx',
  grid: 'src/GridGame.tsx',
  boxed: 'src/BoxGame.tsx',
  weave: 'src/WeaveGame.tsx',
  squares: 'src/SquaresGame.tsx',
};

/** Which source files decide what a given page says. */
function sourcesFor(path) {
  if (path === '/') return ['src/HomeView.tsx'];
  // the About panel lives in App.tsx rather than a file of its own, so its date
  // is an upper bound: App.tsx moves for reasons About didn't
  if (path === '/about') return ['src/App.tsx'];
  if (path.startsWith('/legal/')) return ['src/LegalDocs.tsx'];
  const [, view, slug] = path.split('/');
  const game = GAME_FILES[slug];
  if (!game) return [];
  if (view === 'solve') return [game, 'src/solvers.ts'];
  if (view === 'learn') return [game, 'src/LearnMode.tsx'];
  return [game];
}

// The dailies are deliberately absent: they change every morning whatever the
// code did, so a commit date understates them and a build date is right for one
// day and wrong for the other six. lastmod is optional per URL.
const DATED_PATHS = [
  '/',
  ...GAME_SLUGS.flatMap((g) => [`/play/${g}`, `/solve/${g}`, `/learn/${g}`]),
  '/about',
  '/legal/notices',
  '/legal/privacy',
  '/legal/terms',
];

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

// Failing loudly is right here in a way it wasn't in the build: this script
// exists precisely to be run somewhere history is complete, so a shallow clone
// means the job is misconfigured, not that we should shrug and emit nothing.
let usableHistory = false;
try {
  usableHistory = git(['rev-parse', '--is-shallow-repository']) === 'false';
} catch {
  usableHistory = false; // no git, or not a repository
}
if (!usableHistory) {
  console.error('no usable git history — check out with fetch-depth: 0 before running this');
  process.exit(1);
}

const dates = {};
for (const path of DATED_PATHS) {
  const files = sourcesFor(path);
  if (!files.length) continue;
  const date = git(['log', '-1', '--format=%cI', '--', ...files]);
  if (date) dates[path] = date;
}

const missing = DATED_PATHS.filter((p) => !dates[p]);
if (missing.length) {
  console.error(`no commit found for: ${missing.join(', ')}`);
  process.exit(1);
}

// sorted, so the diff shows what changed rather than how the object was built
const sorted = Object.fromEntries(Object.keys(dates).sort().map((k) => [k, dates[k]]));
const next = JSON.stringify(sorted, null, 2) + '\n';
let prev = '';
try {
  prev = readFileSync(OUT, 'utf8');
} catch {
  prev = '';
}
if (prev === next) {
  console.log(`${OUT} already current (${Object.keys(sorted).length} pages)`);
} else {
  writeFileSync(OUT, next);
  console.log(`wrote ${OUT} (${Object.keys(sorted).length} pages)`);
}
