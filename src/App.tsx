import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { Search, X, BookOpen, Keyboard, Delete, Github, CalendarDays, Star, Gamepad2, CornerDownLeft, BarChart3, UserRound, Settings } from 'lucide-react';
import LearnMode, { type LearnModeHandle } from '@/LearnMode';
import type { Session } from '@supabase/supabase-js';
import StatsModal from '@/StatsModal';
import AccountModal from '@/AccountModal';
import { stashInvite } from '@/friends';
import { OskContext } from '@/MobileKeyInput';
import SettingsModal from '@/SettingsModal';
import KeyboardHelp from '@/KeyboardHelp';
import { colorWords, PALETTES, PaletteContext, resolveTheme, TEXT_SCALES, THEME_MODES, useTheme, type Palette, type TextScale, type ThemeMode } from '@/theme';
import { PrefsContext } from '@/prefs';
import OnboardingCard from '@/OnboardingCard';
import { useModalA11y } from '@/useModalA11y';
import { Flag as FlagIcon } from 'lucide-react';
import BridgeGame, { type BridgeGameHandle } from '@/BridgeGame';
import SiteBar, { type BarItem, type Section } from '@/SiteBar';
import { parseQuickSolve } from '@/quickSolve';
import { allDailyStatus } from '@/dailyStatus';
import { fetchDisplayName } from '@/leaderboard';
import { supabase } from '@/supabase';
import { importBaselineOnce } from '@/stats';
import GuessGame, { type GuessGameHandle, type LetterState } from '@/GuessGame';
import HiveGame, { type HiveGameHandle } from '@/HiveGame';
import BoxGame, { type BoxGameHandle } from '@/BoxGame';
import ScrambleGame, { type ScrambleGameHandle } from '@/ScrambleGame';
import GridGame, { type GridGameHandle } from '@/GridGame';
import WeaveGame, { type WeaveGameHandle } from '@/WeaveGame';
import { fetchDailyData } from '@/dailyData';
import { DICTIONARIES, getAcceptPool, getDictionary, getDifficultyPool, getDisplayFilter, getWordRank } from '@/dictionaries';
import { solvePattern, solveDescramble, solveBee, solveBoxed, solveGrid, findGridPath } from '@/solvers';
import ConsentBanner from '@/ConsentBanner';
import { PrivacyPolicy, Terms } from '@/LegalDocs';
import { onDailyReport, requestDaily } from '@/dailyBus';
import { entryGame, entryRoute } from '@/routing/entry';
import { FEED_NAME, GAME_NAME } from '@/games';
import { useAddressBar, useNav } from '@/routing/useRouting';
import { routeOf, type Overlay } from '@/routing/nav';
import ReportMenu from '@/ReportMenu';
import { amOwner } from '@/reports';
import TicketView from '@/TicketView';
import ReportQueueView from '@/ReportQueueView';
import ReportActionView from '@/ReportActionView';

import HomeView from '@/HomeView';
import Tile from '@/Tile';
import WordChip from '@/solvers/WordChip';
import ScrambleSolver from '@/solvers/ScrambleSolver';
import HiveSolver from '@/solvers/HiveSolver';
import GuessSolver from '@/solvers/GuessSolver';
import ResultsPanel, { CAP } from '@/solvers/ResultsPanel';
import GridSolver from '@/solvers/GridSolver';
import WeaveSolver from '@/solvers/WeaveSolver';
import { sortResults } from '@/solvers/resultOrder';
import { centreOf, useBoardTrace } from '@/solvers/useBoardTrace';
import BridgeSolver from '@/solvers/BridgeSolver';
import LadderSolver from '@/solvers/LadderSolver';
import SquaresSolver from '@/solvers/SquaresSolver';
import CryptogramSolver from '@/solvers/CryptogramSolver';
import RouteLink from '@/RouteLink';
import SquaresGame, { type SquaresGameHandle } from '@/SquaresGame';
import CryptogramGame, { type CryptogramGameHandle } from '@/CryptogramGame';
import LadderGame, { type LadderGameHandle } from '@/LadderGame';
import {
  MODE_SLUG,
  modeOf,
  pathOf,
  titleOf,
  type Route,
} from '@/routes';
import {
  difficulty as currentDifficulty,
  setDifficulty,
  difficultyMode,
  onDifficultyChange,
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  type Difficulty,
} from '@/difficulty';
import { ALL_MODES, ALL_START_PAGES, ALL_VIEWS, asDifficulty, lengthChoices, visibleModes, visibleViews, type LengthRange, type StartPage, type View, loadState, saveState, GRID_PRESET_DIMS, WEAVE_DIMS, type GridPreset, type Mode, type NavKeys, type SortPref, type SquareSolverSize, type WeaveSize } from '@/storage';

// longest rack the scramble solver accepts; word lengths come from the
// player's own range now, in storage
const MAX_LEN = 15;

// description sells the solver, which is the wrong pitch for someone who has
// hidden it — playDescription is what they get instead.
// `short` is the nav's label where the full one will not fit a column. Only
// the longest name needs one; everywhere else the nav shows `label`.
// Which solvers answer with a *list of words from the dictionary*, and so want
// the shared results panel underneath them.
//
// This was a denylist — everything except squares and cryptogram — which meant
// a new game got the panel by default and had to opt out. Two never did: the
// ladder solver answers with a route and the bridge solver with the words that
// join two ends, and both were printing several thousand unrelated words below
// their answer, under a heading offering to show all 4,743. Shipped that way
// with the ladder and only noticed when bridge did it too.
//
// An allowlist puts the default the right way round: a game that does not
// search the word list shows nothing, without having to know this exists.
const WORD_LIST_SOLVERS = new Set<Mode>([
  'pattern',
  'descramble',
  'bee',
  'boxed',
  'grid',
  'weave',
]);

// No label here. It lived in this table and in five other files, and disagreed:
// this one said 'Guess' for one game and 'Word Ladder' for another, mixing the
// short name and the full one inside a single column. @/games has both, and the
// call sites below pick by how much room they have.
const MODES: { id: Mode; blurb: string; description: string; playDescription: string }[] = [
  {
    id: 'pattern',
    blurb: 'Wordle, crosswords, hangman — clues about positions',
    description:
      "Lock in the letters you know, list the ones you've seen, and exclude the rest. We'll surface every dictionary word that fits.",
    playDescription:
      // no colour names — they change with the palette
      'Six guesses at a hidden word. Each one tells you which letters are in the right place and which are merely in there somewhere.',
  },
  {
    id: 'descramble',
    blurb: 'Scrabble, Jumble — what can these letters spell?',
    description:
      "Type the letters you're holding — with ? for blank tiles — and we'll show every word they can spell.",
    playDescription:
      'Three minutes, seven letters, as many words as you can find. Longer words score more.',
  },
  {
    id: 'bee',
    blurb: 'Seven letters, 4+ letter words, center letter required — Spelling Bee style',
    description:
      "Enter the hive's seven letters and we'll find every word that uses the center — pangrams first.",
    playDescription:
      'Every word uses the centre letter and at least four letters. Use all seven for a pangram.',
  },
  {
    id: 'grid',
    blurb: 'Boggle style — chain adjacent letters, each cell once',
    description:
      "Enter the grid letters and we'll find every word traceable through adjacent cells.",
    playDescription:
      'Three minutes to trace words through touching letters, each cell used once per word.',
  },
  {
    id: 'boxed',
    blurb: "Twelve letters on four sides, no two in a row from the same side — Letter Boxed style",
    description:
      "Enter the twelve letters, three per side. We'll find every legal word and the two-word solutions that use all twelve.",
    playDescription:
      'Use all twelve letters in a chain of words, never twice in a row from the same side.',
  },
  {
    id: 'squares',
    blurb: 'Fill the grid so every row and column is a word',
    description:
      "Type the letters you're sure of and we'll fill the rest, so every row and every column spells a word.",
    playDescription:
      'Fill the blanks so that every row and every column spells a word.',
  },
  {
    id: 'weave',
    blurb: 'Themed words tile the whole board — Strands style',
    description:
      'Play the themed tiling puzzle, or use Solve to list every traceable word on a Strands-style board.',
    playDescription:
      'Find the themed words that tile the whole board, plus the one that spans it corner to corner.',
  },
  {
    id: 'cryptogram',
    blurb: 'A passage in code — work out which letter is which',
    description:
      'Play the daily cipher. The solver is still being built: it has to offer the readings that fit rather than guess one, which is a different thing from the word solvers.',
    playDescription:
      'Every letter stands for another one, the same way throughout. Work out the passage.',
  },
  {
    id: 'ladder',
    blurb: 'Turn one word into another, a letter at a time',
    description:
      'Play the daily ladder, or use Solve to find the shortest route between any two words of the same length.',
    playDescription:
      'Change one letter at a time, and every rung has to be a word. Get from the first to the last in par.',
  },
  {
    id: 'bridge',
    blurb: 'Find the word that joins both sides',
    description:
      'Play the daily five, or use Solve to find every word that joins any two others.',
    playDescription:
      'Five prompts, and the answer is the word that joins both sides — SNOW · BALL · ROOM. Hints turn over a length or a letter, and you get three, one or none.',
  },
];

/** WordLock's mark, drawn the way the footer's other icons are drawn.
 *
 *  Its own logo is a filled blue tile with the key knocked out in white,
 *  which beside a row of monochrome line icons reads as a sticker rather than
 *  a link. The key is traced instead — the bow, the shaft and its two teeth —
 *  as strokes in currentColor, so it follows the theme and the text colour
 *  like everything next to it.
 *
 *  The logo's surrounding tile is dropped on purpose: at fourteen pixels the
 *  frame crowds the key it contains, and none of the icons beside it are
 *  boxed either. The key alone is the recognisable part. */
function WordLockMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-3.5 h-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="7" cy="12" r="4" />
      <path d="M11 12h10" />
      <path d="M15 12v4" />
      <path d="M18.5 12v3" />
    </svg>
  );
}

function normalizeLetters(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z]/g, '').split('');
}

type ChainEntry = { w: string; m: number; last: string };

type ChainIndex = {
  entries: ChainEntry[];
  byFirst: Map<string, ChainEntry[]>;
  fullMask: number;
};

// boxed solver tiles share the play board's side hues (top, right, bottom, left)
const BOX_SIDE_TONES = [
  {
    empty: 'bg-sky-400/10 border-sky-400 text-sky-100 placeholder-sky-200/40 hover:bg-sky-400/20',
    filled: 'bg-sky-400/20 border-sky-400 text-sky-100 shadow-[0_0_20px_-6px] shadow-sky-400/40',
  },
  {
    empty: 'bg-violet-400/10 border-violet-400 text-violet-100 placeholder-violet-200/40 hover:bg-violet-400/20',
    filled: 'bg-violet-400/20 border-violet-400 text-violet-100 shadow-[0_0_20px_-6px] shadow-violet-400/40',
  },
  {
    empty: 'bg-rose-400/10 border-rose-400 text-rose-100 placeholder-rose-200/40 hover:bg-rose-400/20',
    filled: 'bg-rose-400/20 border-rose-400 text-rose-100 shadow-[0_0_20px_-6px] shadow-rose-400/40',
  },
  {
    empty: 'bg-amber-400/10 border-amber-400 text-amber-100 placeholder-amber-200/40 hover:bg-amber-400/20',
    filled: 'bg-amber-400/20 border-amber-400 text-amber-100 shadow-[0_0_20px_-6px] shadow-amber-400/40',
  },
];

const CHAIN_CAP = 500;
const CHAIN_BUDGET = 2_000_000;

// depth-first search for k-word chains that cover every letter of the box;
// capped by solution count and visited-node budget so the UI stays snappy
function findChains(index: ChainIndex, k: number, cap = CHAIN_CAP, budget = CHAIN_BUDGET) {
  const { entries, byFirst, fullMask } = index;
  const solutions: string[][] = [];
  const chain: string[] = [];
  let nodes = 0;
  let capped = false;

  const dfs = (covered: number, last: string, depth: number) => {
    const candidates = depth === 0 ? entries : byFirst.get(last) ?? [];
    for (const e of candidates) {
      if (solutions.length >= cap || ++nodes > budget) {
        capped = true;
        return;
      }
      const next = covered | e.m;
      if (depth === k - 1) {
        if (next === fullMask) {
          chain.push(e.w);
          solutions.push([...chain]);
          chain.pop();
        }
      } else {
        // chains that finish early belong to a shorter solution length
        if (next === fullMask) continue;
        chain.push(e.w);
        dfs(next, e.last, depth + 1);
        chain.pop();
      }
    }
  };
  dfs(0, '', 0);

  const total = (s: string[]) => s.reduce((n, w) => n + w.length, 0);
  solutions.sort((a, b) => total(a) - total(b) || (a.join(' ') < b.join(' ') ? -1 : 1));
  return { solutions, capped };
}

const initial = loadState();

// Arriving at "/" with a start page set to one particular game is the same
// kind of instruction a link gives, so it travels the same path. 'home' stays
// on the front page; 'last' falls through to whatever was stored.
const startTarget =
  entryRoute().kind === 'home' &&
  initial.startPage !== 'home' &&
  initial.startPage !== 'last'
    ? ({ view: 'play', slug: MODE_SLUG[initial.startPage] } as const)
    : null;

// A link names both a game and a tab. It only overrides the game it names —
// every other game keeps whatever the visitor last had open.
const entry = entryGame() ?? startTarget;
const linkMode = entry ? modeOf(entry.slug) : null;
const linkView = entry?.view === 'play' ? true : entry?.view === 'solve' ? false : null;
function initialPlay(mode: Mode, stored: boolean): boolean {
  return linkMode === mode && linkView !== null ? linkView : stored;
}

// Panels and legal documents are addresses too, so arriving at one opens it.

// An invite link stashes its code before anything else happens: accepting may
// need a sign-in first, and OAuth leaves the page entirely — the stash is what
// survives the round trip. The account panel picks it up from there.
if (entryRoute().kind === 'friend') stashInvite((entryRoute() as { code: string }).code);

function App() {
  const [mode, setMode] = useState<Mode>(linkMode ?? initial.mode);
  const [dictionaries, setDictionaries] = useState(initial.dictionaries);
  const [length, setLength] = useState(initial.pattern.length);
  const [known, setKnown] = useState<string[]>(initial.pattern.known);
  const [containsStr, setContainsStr] = useState(initial.pattern.contains);
  const [excludedStr, setExcludedStr] = useState(initial.pattern.excluded);
  const [rackStr, setRackStr] = useState(initial.descramble.rack);
  const [useAll, setUseAll] = useState(initial.descramble.useAll);
  const [minLength, setMinLength] = useState(initial.descramble.minLength);
  const [beeCenter, setBeeCenter] = useState(initial.bee.center);
  const [beeOuters, setBeeOuters] = useState<string[]>(initial.bee.outers);
  const [boxedLetters, setBoxedLetters] = useState<string[]>(initial.boxed.letters);
  const [solutionWords, setSolutionWords] = useState(initial.boxed.solutionWords);
  const [squaresLetters, setSquaresLetters] = useState<string[]>(initial.squares.letters);
  const [squaresSize, setSquaresSize] = useState<SquareSolverSize>(initial.squares.size);
  const [gridLetters, setGridLetters] = useState<string[]>(initial.grid.letters);
  const [gridPreset, setGridPreset] = useState<GridPreset>(initial.grid.preset);
  const [gridPlay, setGridPlay] = useState(initialPlay('grid', initial.gridPlay));
  const [weaveLetters, setWeaveLetters] = useState<string[]>(initial.weave.letters);
  const [weaveSize, setWeaveSize] = useState<WeaveSize>(initial.weave.size);
  const [weavePlay, setWeavePlay] = useState(initialPlay('weave', initial.weavePlay));
  const [squaresPlay, setSquaresPlay] = useState(initialPlay('squares', initial.squaresPlay));
  const [cryptogramPlay, setCryptogramPlay] = useState(
    initialPlay('cryptogram', initial.cryptogramPlay)
  );
  const [ladderPlay, setLadderPlay] = useState(initialPlay('ladder', initial.ladderPlay));
  const [bridgePlay, setBridgePlay] = useState(initialPlay('bridge', initial.bridgePlay));
  const [bridgeX, setBridgeX] = useState(initial.bridge.x);
  const [bridgeY, setBridgeY] = useState(initial.bridge.y);
  const [ladderFrom, setLadderFrom] = useState(initial.ladder.from);
  const [ladderTo, setLadderTo] = useState(initial.ladder.to);
  const weaveDims = WEAVE_DIMS[weaveSize];

  function changeWeaveSize(size: WeaveSize) {
    setWeaveSize(size);
    setStrandsClue(null);
    const dims = WEAVE_DIMS[size];
    setWeaveLetters((prev) => {
      const next = Array(dims.rows * dims.cols).fill('');
      for (let i = 0; i < Math.min(prev.length, next.length); i++) next[i] = prev[i];
      return next;
    });
  }

  const gridDims = GRID_PRESET_DIMS[gridPreset];

  const [strandsClue, setStrandsClue] = useState<string | null>(null);

  // The solvers load "today's board" out of the same feed the games play, and
  // that feed is { date, byDifficulty: { easy, hard, extreme } }. These five
  // read the old flat shape — `d.cells`, `d.center` — got undefined, and
  // reported it as a failed fetch. So the board a game had just rendered was
  // one the solver beside it said it could not reach, which is why this looked
  // like a network fault and was not one.
  //
  // Nothing to do with the move to Postgres, though that is where it got
  // noticed: the generator has written only this shape for as long as the
  // tiers have existed, so the published files never carried the flat keys
  // either. The fallback below is for a payload that predates tiers; it is not
  // what was being served.
  function tierOf(d: Record<string, unknown>): Record<string, unknown> {
    const tiers = d.byDifficulty as Record<string, Record<string, unknown>> | undefined;
    return tiers?.[currentDifficulty()] ?? tiers?.easy ?? d;
  }

  async function fillTodaysStrands() {
    setTodayStatus('loading');
    try {
      const r = await fetch(
        'https://raw.githubusercontent.com/rptetzloff/anagrimoire/puzzle-data/data/strands.json',
        { cache: 'no-store' }
      );
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      const board = d.board as string[];
      if (!Array.isArray(board) || board.length !== 8 || !board.every((row) => /^[a-z]{6}$/.test(row))) {
        throw new Error('bad payload');
      }
      setWeaveSize('6x8');
      setWeaveLetters(board.join('').split(''));
      setStrandsClue(typeof d.clue === 'string' ? d.clue : null);
      setTodayStatus('idle');
    } catch {
      setTodayStatus('error');
    }
  }

  async function fillTodaysWeave() {
    setTodayStatus('loading');
    try {
      const d = await fetchDailyData('weave');
      const b = tierOf(d);
      const board = b.board as string[];
      // hard and extreme are wider boards, so the size comes off the payload
      const size = !Array.isArray(board)
        ? undefined
        : (Object.keys(WEAVE_DIMS) as WeaveSize[]).find((k) => {
            const { rows, cols } = WEAVE_DIMS[k];
            return board.length === rows && board.every((row) => new RegExp(`^[a-z]{${cols}}$`).test(row));
          });
      if (!size) throw new Error('bad payload');
      setWeaveSize(size);
      setWeaveLetters(board.join('').split(''));
      setStrandsClue(typeof b.clue === 'string' ? b.clue : null);
      setTodayStatus('idle');
    } catch {
      setTodayStatus('error');
    }
  }

  // Hover a result to draw it back on the board. One hook instance per board:
  // grid and weave used to share a single ref between two JSX blocks, which
  // worked only because exactly one is ever mounted.
  const gridT = useBoardTrace<number[]>((path, board) => {
    const wrap = board.getBoundingClientRect();
    return [path.map((i) => centreOf(board.querySelector(`[data-tile-index="${i}"]`)!, wrap))];
  });

  useEffect(() => {
    gridT.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridLetters, gridPreset, weaveLetters, weaveSize, mode]);

  const traceHandlersFor = (word: string, letters: string[], cols: number) =>
    gridT.handlersFor(findGridPath(letters, cols, word) ?? []);

  const gridTraceHandlers = (word: string) => traceHandlersFor(word, gridLetters, gridDims.cols);
  const weaveTraceHandlers = (word: string) => traceHandlersFor(word, weaveLetters, weaveDims.cols);

  // boxed solver: hover a word (or a solution chain) to draw its criss-cross
  // chords on the box — each word in a chain gets its own color
  const BOX_TRACE_COLORS = [
    'rgb(var(--chord-1) / 0.9)',
    'rgb(var(--chord-2) / 0.9)',
    'rgb(var(--chord-3) / 0.9)',
    'rgb(var(--chord-4) / 0.9)',
    'rgb(var(--chord-5) / 0.9)',
  ];
  // text classes matching BOX_TRACE_COLORS, so chain chips double as a legend
  const BOX_TRACE_TEXT = [
    'text-sky-300',
    'text-rose-300',
    'text-violet-300',
    'text-emerald-300',
    'text-amber-300',
  ];
  // Chords rather than a path: each word in a chain gets its own polyline, and
  // its own colour from BOX_TRACE_COLORS above, so the chips double as a legend.
  const boxedT = useBoardTrace<string[]>((chain, board) => {
    const wrap = board.getBoundingClientRect();
    return chain.map((word) => {
      const pts = [];
      for (const ch of word) {
        const idx = boxedLetters.findIndex((l) => l === ch);
        if (idx === -1) continue;
        const el = board.querySelector(`input[data-tile-group="boxed"][data-tile-index="${idx}"]`);
        if (el) pts.push(centreOf(el, wrap));
      }
      return pts;
    });
  });

  const boxedTraceHandlers = (chain: string[]) => boxedT.handlersFor(chain);

  function changeGridPreset(preset: GridPreset) {
    setGridPreset(preset);
    const dims = GRID_PRESET_DIMS[preset];
    setGridLetters((prev) => {
      const next = Array(dims.rows * dims.cols).fill('');
      for (let i = 0; i < Math.min(prev.length, next.length); i++) next[i] = prev[i];
      return next;
    });
  }
  const [todayStatus, setTodayStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [commonSet, setCommonSet] = useState<Set<string> | null>(null);

  // common-word set used to rank recommended Letter Boxed solutions
  useEffect(() => {
    if (mode === 'boxed' && !commonSet) {
      getDictionary('common').then((ws) => setCommonSet(new Set(ws)));
    }
  }, [mode, commonSet]);
  const [showAll, setShowAll] = useState(false);
  const [sorts, setSorts] = useState(initial.sort);
  const [kbOpen, setKbOpen] = useState(initial.keyboard);
  // "/" is a page now, not a synonym for wherever you left off
  // Where the app is. The nine booleans, the ladder, the three refs and both
  // effects live in src/routing/useRouting.ts now — this is the seam: page and
  // overlay identity there, which game and which view here.
  const routing = useNav(entryRoute(), initial.startPage === 'home');
  const { nav, open: openOverlay, close: closeOverlay, overlayLink, pageLink } = routing;

  function overlay<K extends Overlay['kind']>(kind: K): Extract<Overlay, { kind: K }> | undefined {
    return nav.overlays.find((o): o is Extract<Overlay, { kind: K }> => o.kind === kind);
  }

  const atHome = nav.page.kind === 'home';
  const reportPage: Route | null =
    nav.page.kind === 'ticket' || nav.page.kind === 'reportAction' || nav.page.kind === 'reportQueue'
      ? nav.page
      : null;

  // `some`, not `top` — the consent banner opens Legal over an open Settings,
  // and both modals stay mounted. The address is the top; what renders is
  // whatever is anywhere on the stack.
  const legalOpen = !!overlay('legal');
  const legalTab = overlay('legal')?.doc ?? nav.last.legal;
  const statsOpen = !!overlay('stats');
  const statsTab = overlay('stats')?.tab ?? nav.last.stats;
  const settingsOpen = !!overlay('settings');
  const settingsTab = overlay('settings')?.tab ?? nav.last.settings;
  const accountOpen = !!overlay('account');
  const accountTab = overlay('account')?.tab ?? nav.last.account;
  const aboutOpen = overlay('panel')?.panel === 'about';
  const keysOpen = overlay('panel')?.panel === 'keys';

  const setAtHome = (v: boolean) =>
    routing.dispatch({ type: 'page', page: v ? { kind: 'home' } : { kind: 'game' } });

  const [startPage, setStartPage] = useState(initial.startPage);
  // Whether to draw the queue link at all. False for everyone signed out and
  // for every ordinary account, and the server says so — this only decides a
  // link, and the RPCs behind it check again regardless.
  const [owner, setOwner] = useState(false);
  const [learnMode, setLearnMode] = useState(entryGame()?.view === 'learn');
  const [theme, setTheme] = useState<ThemeMode>(initial.theme);
  const [palette, setPalette] = useState<Palette>(initial.palette);
  const [navKeys, setNavKeys] = useState<NavKeys>(initial.navKeys);
  const [textScale, setTextScale] = useState<TextScale>(initial.textScale);
  const [hiddenModes, setHiddenModes] = useState<Mode[]>(initial.hiddenModes);
  const [hiddenViews, setHiddenViews] = useState<View[]>(initial.hiddenViews);
  const [lengthRange, setLengthRange] = useState<LengthRange>(initial.lengthRange);
  const [practiceAllowed, setPracticeAllowed] = useState(initial.practiceAllowed);
  const [highlightMatches, setHighlightMatches] = useState(initial.highlightMatches);
  const [helpAllowed, setHelpAllowed] = useState(initial.helpAllowed);
  const [solverDictionary, setSolverDictionary] = useState(initial.solverDictionary);
  const [wordFilter, setWordFilter] = useState(initial.wordFilter);
  // the display-filter predicate, shared by Grid's missed-words list; the
  // solver filters its own list where it loads
  const [showWord, setShowWord] = useState<(w: string) => boolean>(() => () => true);
  useEffect(() => {
    let alive = true;
    getDisplayFilter(wordFilter).then((f) => alive && setShowWord(() => f));
    return () => {
      alive = false;
    };
  }, [wordFilter]);
  const [onboarded, setOnboarded] = useState(initial.onboarded);
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    if (!session) {
      setOwner(false);
      return;
    }
    let alive = true;
    amOwner().then((yes) => alive && setOwner(yes));
    return () => {
      alive = false;
    };
  }, [session]);

  // The avatar's letter: the leaderboard name's, else the address's. Read
  // again when the account panel closes, which is where the name is changed.
  const [displayName, setDisplayName] = useState<string | null>(null);
  const accountShowing = !!nav.overlays.find((o) => o.kind === 'account');
  useEffect(() => {
    if (!session || accountShowing) return;
    let alive = true;
    fetchDisplayName().then((n) => alive && setDisplayName(n));
    return () => {
      alive = false;
    };
  }, [session, accountShowing]);

  useTheme(theme, palette, textScale);

  // track the auth session when Supabase is configured
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // on sign-in, snapshot this browser's pre-account stats once as the baseline
  useEffect(() => {
    if (session) void importBaselineOnce();
  }, [session]);

  // appearance settings follow the account: pull on sign-in (and whenever the
  // tab comes back to the foreground, so a change made on another device
  // lands here), then push edits
  // State, not a ref: the push effect is gated on this, and a ref changing
  // doesn't re-run an effect. As a ref, the first pull flipped it silently and
  // nothing was ever written back unless the player happened to change a
  // setting afterwards — so a value that was already true locally at load,
  // like onboarded, never reached the account at all.
  const [settingsPulled, setSettingsPulled] = useState(false);
  const pushPending = useRef(false);

  const pullSettings = useCallback(async () => {
    // don't clobber an edit that hasn't been written yet
    if (!supabase || !session || pushPending.current) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('settings')
      .eq('id', session.user.id)
      .maybeSingle();
    if (error) {
      console.warn('Anagrimoire settings pull failed:', error.message);
      return;
    }
    const s = data?.settings as
      | {
          theme?: ThemeMode;
          palette?: Palette;
          navKeys?: NavKeys;
          textScale?: TextScale;
          hiddenModes?: Mode[];
          hiddenViews?: View[];
          lengthRange?: LengthRange;
          practiceAllowed?: boolean;
          highlightMatches?: boolean;
          helpAllowed?: boolean;
          solverDictionary?: string;
          wordFilter?: string;
          startPage?: StartPage;
          onboarded?: boolean;
        }
      | null;
    if (s?.theme && THEME_MODES.includes(s.theme)) setTheme(s.theme);
    if (s?.palette && PALETTES.includes(s.palette)) setPalette(s.palette);
    if (s?.navKeys === 'numpad' || s?.navKeys === 'wasd') setNavKeys(s.navKeys);
    if (s?.textScale && TEXT_SCALES.includes(s.textScale)) setTextScale(s.textScale);
    if (Array.isArray(s?.hiddenModes)) setHiddenModes(s.hiddenModes.filter((m) => ALL_MODES.includes(m)));
    if (Array.isArray(s?.hiddenViews)) setHiddenViews(s.hiddenViews.filter((v) => ALL_VIEWS.includes(v)));
    if (s?.lengthRange) setLengthRange(s.lengthRange);
    if (typeof s?.practiceAllowed === 'boolean') setPracticeAllowed(s.practiceAllowed);
    if (typeof s?.highlightMatches === 'boolean') setHighlightMatches(s.highlightMatches);
    if (typeof s?.helpAllowed === 'boolean') setHelpAllowed(s.helpAllowed);
    if (s?.solverDictionary)
      setSolverDictionary(asDifficulty(s.solverDictionary) ?? 'per-game');
    if (s?.wordFilter === 'none' || s?.wordFilter === 'strong' || s?.wordFilter === 'all')
      setWordFilter(s.wordFilter);
    if (s?.startPage && ALL_START_PAGES.includes(s.startPage)) setStartPage(s.startPage);
    if (s?.onboarded) setOnboarded(true);
    setSettingsPulled(true);
  }, [session]);

  useEffect(() => {
    if (!session) {
      setSettingsPulled(false);
      return;
    }
    void pullSettings();
  }, [session, pullSettings]);

  useEffect(() => {
    if (!supabase || !session) return;
    const onWake = () => {
      if (document.visibilityState === 'visible') void pullSettings();
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    return () => {
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, [session, pullSettings]);

  useEffect(() => {
    if (!supabase || !session || !settingsPulled) return;
    pushPending.current = true;
    const id = window.setTimeout(async () => {
      const settings = { theme, palette, navKeys, textScale, hiddenModes, hiddenViews, lengthRange, practiceAllowed, highlightMatches, helpAllowed, solverDictionary, wordFilter, startPage, onboarded };
      // update first — it needs only the update policy, which every install
      // has. `select` reveals whether a row actually matched.
      const { data, error } = await supabase!
        .from('profiles')
        .update({ settings })
        .eq('id', session.user.id)
        .select('id');
      if (error) {
        console.warn('Anagrimoire settings sync failed:', error.message);
      } else if (!data?.length) {
        // no profile row yet (the signup trigger never fired) — create one
        const { error: insertError } = await supabase!
          .from('profiles')
          .insert({ id: session.user.id, settings });
        if (insertError) {
          console.warn(
            'Anagrimoire settings sync failed: no profile row, and creating one was refused —',
            insertError.message
          );
        }
      }
      pushPending.current = false;
    }, 500);
    return () => {
      window.clearTimeout(id);
      pushPending.current = false;
    };
  }, [session, settingsPulled, theme, palette, navKeys, textScale, hiddenModes, hiddenViews, lengthRange, practiceAllowed, highlightMatches, helpAllowed, solverDictionary, wordFilter, startPage, onboarded]);

  // surface auth errors that come back in the redirect URL (expired or
  // already-used magic links land here with no other visible sign)
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const desc = params.get('error_description') || params.get('error');
    if (desc) {
      setAuthNotice(desc);
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  const [patternPlay, setPatternPlay] = useState(initialPlay('pattern', initial.patternPlay));
  const [beePlay, setBeePlay] = useState(initialPlay('bee', initial.beePlay));
  const [boxedPlay, setBoxedPlay] = useState(initialPlay('boxed', initial.boxedPlay));
  const [descramblePlay, setDescramblePlay] = useState(initialPlay('descramble', initial.descramblePlay));
  const [letterStates, setLetterStates] = useState<Record<string, LetterState>>({});
  const [commonWordsArr, setCommonWordsArr] = useState<string[] | null>(null);
  const [fullWordsArr, setFullWordsArr] = useState<string[] | null>(null);
  const [standardWordsArr, setStandardWordsArr] = useState<string[] | null>(null);

  const gameRef = useRef<GuessGameHandle>(null);
  const hiveRef = useRef<HiveGameHandle>(null);
  const boxRef = useRef<BoxGameHandle>(null);
  const scrambleRef = useRef<ScrambleGameHandle>(null);
  const gridRef = useRef<GridGameHandle>(null);
  const learnRef = useRef<LearnModeHandle>(null);
  const weaveRef = useRef<WeaveGameHandle>(null);
  const squaresRef = useRef<SquaresGameHandle>(null);
  const cryptogramRef = useRef<CryptogramGameHandle>(null);
  const ladderRef = useRef<LadderGameHandle>(null);
  const bridgeRef = useRef<BridgeGameHandle>(null);

  // The switch and the games both read the same stored value; this only
  // mirrors it so the pressed state re-renders.
  const [level, setLevel] = useState(currentDifficulty);
  useEffect(() => onDifficultyChange(() => setLevel(currentDifficulty())), []);

  // Practice puzzles are built in the browser, so the words a difficulty means
  // have to be here too — the same bands the daily generator draws from.
  const [practiceWordsArr, setPracticeWordsArr] = useState<string[] | null>(null);
  // What this difficulty accepts, one band wider than it sets from.
  const [acceptWordsArr, setAcceptWordsArr] = useState<string[] | null>(null);
  const [wordRank, setWordRank] = useState<Map<string, number> | null>(null);
  useEffect(() => {
    let alive = true;
    setPracticeWordsArr(null);
    getDifficultyPool(level).then((ws) => alive && setPracticeWordsArr(ws));
    getAcceptPool(level).then((ws) => alive && setAcceptWordsArr(ws));
    return () => {
      alive = false;
    };
  }, [level]);

  const patternPlayActive = mode === 'pattern' && patternPlay && !learnMode;
  const beePlayActive = mode === 'bee' && beePlay && !learnMode;
  const boxedPlayActive = mode === 'boxed' && boxedPlay && !learnMode;
  const descramblePlayActive = mode === 'descramble' && descramblePlay && !learnMode;
  const gridPlayActive = mode === 'grid' && gridPlay && !learnMode;
  const weavePlayActive = mode === 'weave' && weavePlay && !learnMode;
  const squaresPlayActive = mode === 'squares' && squaresPlay && !learnMode;
  const cryptogramPlayActive = mode === 'cryptogram' && cryptogramPlay && !learnMode;
  const ladderPlayActive = mode === 'ladder' && ladderPlay && !learnMode;
  const bridgePlayActive = mode === 'bridge' && bridgePlay && !learnMode;
  const playActive =
    patternPlayActive || beePlayActive || boxedPlayActive || descramblePlayActive || gridPlayActive || weavePlayActive || squaresPlayActive || cryptogramPlayActive || ladderPlayActive || bridgePlayActive;



  // the guess game validates against the full dictionary and picks practice
  // words from the common one; hive, box, scramble, grid play — and the
  // Learn demos — use standard
  useEffect(() => {
    // the cryptogram solver wants the common list too — not to search with,
    // but to decide what a candidate list offers first. Without it the
    // readings come back alphabetically and "the" sits behind "dye" and "ecu".
    const cryptoSolve = mode === 'cryptogram' && !cryptogramPlay && !learnMode;
    // the ladder solver searches the common list, so it needs it loaded even
    // though nothing is being played
    const ladderSolve = mode === 'ladder' && !ladderPlay && !learnMode;
    // the bridge solver checks membership in the standard list, so it needs
    // that loaded even though nothing is being played
    const bridgeSolve = mode === 'bridge' && !bridgePlay && !learnMode;
    if (!playActive && !learnMode && !cryptoSolve && !ladderSolve && !bridgeSolve) return;
    // how ordinary each word is, so the solver's candidate lists lead with the
    // readings a person would actually consider
    if (cryptoSolve && !wordRank) getWordRank().then(setWordRank);
    if (!commonWordsArr) getDictionary('common').then(setCommonWordsArr);
    if (patternPlayActive && !fullWordsArr) getDictionary('full').then(setFullWordsArr);
    if (
      (learnMode || beePlayActive || boxedPlayActive || descramblePlayActive || gridPlayActive || weavePlayActive || squaresPlayActive || bridgeSolve) &&
      !standardWordsArr
    ) {
      getDictionary('standard').then(setStandardWordsArr);
    }
  }, [playActive, learnMode, mode, cryptogramPlay, ladderPlay, bridgePlay, patternPlayActive, beePlayActive, boxedPlayActive, descramblePlayActive, gridPlayActive, weavePlayActive, squaresPlayActive, commonWordsArr, fullWordsArr, standardWordsArr, wordRank]);

  const aboutRef = useRef<HTMLDivElement>(null);
  const legalRef = useRef<HTMLDivElement>(null);
  const closeAbout = closeOverlay;
  const closeLegal = closeOverlay;
  useModalA11y(aboutRef, closeAbout, aboutOpen);
  useModalA11y(legalRef, closeLegal, legalOpen);

  // the input the on-screen keyboard types into
  const lastFocused = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      if (e.target instanceof HTMLInputElement) lastFocused.current = e.target;
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);

  // 'per-game' keeps each solver's own pick; anything else is the whole site's
  const dictionaryId = solverDictionary === 'per-game' ? dictionaries[mode] : solverDictionary;
  const setDictionaryId = (id: Difficulty) =>
    setDictionaries((prev) => ({ ...prev, [mode]: id }));

  const sort = sorts[mode];
  const setSort = (s: Partial<SortPref>) =>
    setSorts((prev) => ({ ...prev, [mode]: { ...prev[mode], ...s } }));

  // A shared link names a game and a tab deliberately, so it outranks hiding
  // for this visit: dropping someone on the wrong page because of a setting
  // they made months ago is worse than showing them one game they'd switched
  // off. It doesn't unhide anything — the setting is untouched.
  const shownModes = useMemo(() => {
    const vis = visibleModes(hiddenModes);
    return ALL_MODES.filter((m) => vis.includes(m) || m === linkMode);
  }, [hiddenModes]);

  const shownViews = useMemo(() => {
    const vis = visibleViews(hiddenViews);
    return ALL_VIEWS.filter((v) => vis.includes(v) || v === entryGame()?.view);
  }, [hiddenViews]);

  const playFlags: Record<Mode, [boolean, (v: boolean) => void]> = {
    pattern: [patternPlay, setPatternPlay],
    descramble: [descramblePlay, setDescramblePlay],
    bee: [beePlay, setBeePlay],
    boxed: [boxedPlay, setBoxedPlay],
    grid: [gridPlay, setGridPlay],
    weave: [weavePlay, setWeavePlay],
    squares: [squaresPlay, setSquaresPlay],
    cryptogram: [cryptogramPlay, setCryptogramPlay],
    ladder: [ladderPlay, setLadderPlay],
    bridge: [bridgePlay, setBridgePlay],
  };

  const prefs = useMemo(
    () => ({ practiceAllowed, highlightMatches }),
    [practiceAllowed, highlightMatches]
  );

  const currentView: View = learnMode ? 'learn' : playFlags[mode][0] ? 'play' : 'solve';

  function goToView(view: View) {
    if (view === 'learn') {
      setLearnMode(true);
      return;
    }
    setLearnMode(false);
    playFlags[mode][1](view === 'play');
  }

  // Which board each game has open. The games own this — they persist it and
  // they draw the toggle — so they report it up rather than being told. The
  // handle is only for the other direction, when an address asks for the board
  // the player isn't currently on.
  const [dailyByMode, setDailyByMode] = useState<Record<Mode, boolean>>(() => {
    const seed = Object.fromEntries(ALL_MODES.map((m) => [m, true])) as Record<Mode, boolean>;
    const g = entryGame();
    if (g?.view === 'play') seed[modeOf(g.slug)] = g.daily;
    return seed;
  });

  // Three boards a day, and you may play all of them — so the switch belongs
  // beside the board rather than buried in settings.
  //
  // On practice as much as on the daily. Practice is the same board generated
  // on the fly and not recorded, so it needs the same control — and since the
  // size pickers are gone, this is the only way to choose a shape there.
  //
  // Grid is here too now: it varies by board size, 4x4 then 5x5. Not shown
  // when someone has asked to be left with one puzzle.
  const showDifficultySwitch = playActive && difficultyMode() === 'all';

  // The date rides along so the report link can name the board a player is
  // actually looking at. Empty for practice, which is nobody's problem but the
  // dealer's — it was never published and there is nothing on the server to
  // look up.
  const [dateByMode, setDateByMode] = useState<Partial<Record<Mode, string>>>({});

  useEffect(
    () =>
      onDailyReport((m, daily, date) => {
        setDailyByMode((prev) => (prev[m] === daily ? prev : { ...prev, [m]: daily }));
        setDateByMode((prev) => (prev[m] === date ? prev : { ...prev, [m]: date }));
      }),
    []
  );

  // Where the app is, written as an address. `routeOf` is "whatever is on top,
  // or the page" — the ladder this replaced had a rung per kind and /reports
  // was never given one, so the page rendered and the address reverted to the
  // game underneath.
  //
  // `daily` only means something under /play: pathOf drops it for solve and
  // learn, so emitting it there produced a Route that could not round-trip
  // through its own address.
  const currentRoute: Route = useMemo(
    () =>
      routeOf(nav, {
        slug: MODE_SLUG[mode],
        view: currentView,
        daily: currentView === 'play' && dailyByMode[mode],
      }),
    [nav, mode, currentView, dailyByMode]
  );

  // Back and Forward reach both halves: the nav reducer, and the game state
  // that only App holds.
  useAddressBar(
    currentRoute,
    useCallback(
      (r: Route) => {
        if (r.kind === 'friend') stashInvite(r.code);
        routing.dispatch({ type: 'apply', route: r });
        if (r.kind === 'game') {
          const m = modeOf(r.slug);
          setMode(m);
          if (r.view === 'learn') {
            setLearnMode(true);
          } else {
            setLearnMode(false);
            playFlags[m][1](r.view === 'play');
            if (r.view === 'play') requestDaily(m, r.daily);
          }
        }
      },
      // playFlags is rebuilt every render; the ref inside useAddressBar is what
      // keeps the listener current, so this closure is allowed to be fresh
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [routing.dispatch, playFlags]
    )
  );

  const shownLengths = useMemo(() => lengthChoices(lengthRange), [lengthRange]);

  // hiding the game or tab you're standing on shouldn't leave you nowhere
  useEffect(() => {
    if (!shownModes.includes(mode)) setMode(shownModes[0]);
  }, [shownModes, mode]);

  // narrowing the range around the length you're on moves you to the nearest
  // one still offered, rather than leaving nothing selected
  useEffect(() => {
    if (length < lengthRange.min) setLength(lengthRange.min);
    else if (length > lengthRange.max) setLength(lengthRange.max);
  }, [lengthRange, length]);

  useEffect(() => {
    if (!shownViews.includes(currentView)) goToView(shownViews[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownViews, currentView, mode]);

  // persist tool, per-tool dictionary, and last inputs
  useEffect(() => {
    saveState({
      mode,
      dictionaries,
      sort: sorts,
      keyboard: kbOpen,
      theme,
      palette,
      textScale,
      navKeys,
      hiddenModes,
      hiddenViews,
      lengthRange,
      practiceAllowed,
      highlightMatches,
      helpAllowed,
      solverDictionary,
      wordFilter,
      startPage,
      onboarded,
      patternPlay,
      beePlay,
      boxedPlay,
      descramblePlay,
      gridPlay,
      pattern: { length, known, contains: containsStr, excluded: excludedStr },
      descramble: { rack: rackStr, useAll, minLength },
      bee: { center: beeCenter, outers: beeOuters },
      boxed: { letters: boxedLetters, solutionWords },
      grid: { letters: gridLetters, preset: gridPreset },
      squares: { letters: squaresLetters, size: squaresSize },
      weave: { letters: weaveLetters, size: weaveSize },
      weavePlay,
      squaresPlay,
      cryptogram: { cipher: '' },
      cryptogramPlay,
      ladder: { from: ladderFrom, to: ladderTo },
      bridge: { x: bridgeX, y: bridgeY },
      bridgePlay,
      ladderPlay,
    });
  }, [mode, dictionaries, sorts, kbOpen, theme, palette, textScale, navKeys, hiddenModes, hiddenViews, lengthRange, practiceAllowed, highlightMatches, helpAllowed, solverDictionary, wordFilter, startPage, onboarded, patternPlay, beePlay, boxedPlay, descramblePlay, gridPlay, length, known, containsStr, excludedStr, rackStr, useAll, minLength, beeCenter, beeOuters, boxedLetters, solutionWords, gridLetters, gridPreset, weaveLetters, weaveSize, weavePlay, squaresPlay, squaresLetters, squaresSize, cryptogramPlay, ladderPlay, ladderFrom, ladderTo, bridgePlay, bridgeX, bridgeY]);

  // keep known array sized to length
  useEffect(() => {
    setKnown((prev) => {
      const next = Array(length).fill('');
      for (let i = 0; i < Math.min(prev.length, length); i++) next[i] = prev[i] ?? '';
      return next;
    });
  }, [length]);

  const contains = useMemo(() => normalizeLetters(containsStr), [containsStr]);
  const excluded = useMemo(() => normalizeLetters(excludedStr), [excludedStr]);

  const [words, setWords] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    // The accept pool, not the raw tier: the solver's Hard is what Hard
    // accepts in a game, so a word the solver finds is a word that scores.
    // The display filter then hides what this player asked not to be shown —
    // display only, so two players on one board still play the same rules.
    Promise.all([getAcceptPool(dictionaryId), getDisplayFilter(wordFilter)]).then(
      ([w, show]) => {
        if (alive) setWords(wordFilter === 'none' ? w : w.filter(show));
      }
    );
    return () => {
      alive = false;
    };
  }, [dictionaryId, wordFilter]);

  const rackLetters = useMemo(
    () => rackStr.toLowerCase().replace(/[^a-z]/g, '').split('').filter(Boolean),
    [rackStr]
  );
  const wildcards = useMemo(() => (rackStr.match(/\?/g) ?? []).length, [rackStr]);

  const beeAllowed = useMemo(
    () => new Set([beeCenter, ...beeOuters].filter(Boolean)),
    [beeCenter, beeOuters]
  );

  const boxedSides = useMemo(
    () => [0, 3, 6, 9].map((s) => boxedLetters.slice(s, s + 3).filter(Boolean)),
    [boxedLetters]
  );

  const results = useMemo(() => {
    if (mode === 'descramble') {
      return solveDescramble(words, { letters: rackLetters, wildcards, useAll, minLength });
    }
    if (mode === 'bee') {
      return solveBee(words, { center: beeCenter, outers: beeOuters });
    }
    if (mode === 'boxed') {
      return solveBoxed(words, { sides: boxedSides });
    }
    if (mode === 'grid') {
      return solveGrid(words, { cells: gridLetters, cols: gridDims.cols });
    }
    if (mode === 'weave') {
      return weavePlay ? [] : solveGrid(words, { cells: weaveLetters, cols: weaveDims.cols });
    }
    return solvePattern(words, { length, known, contains, excluded });
  }, [mode, words, length, known, contains, excluded, rackLetters, wildcards, useAll, minLength, beeCenter, beeOuters, boxedSides, gridLetters, gridDims, weavePlay, weaveLetters, weaveDims]);

  // shared index for Letter Boxed chain searches; null until all 12 letters are in
  const boxedIndex = useMemo<ChainIndex | null>(() => {
    if (mode !== 'boxed') return null;
    const letters = [...new Set(boxedLetters.filter(Boolean))];
    if (letters.length !== 12) return null;
    const idx = new Map(letters.map((c, i) => [c, i]));
    const popcount = (m: number) => {
      let n = 0;
      while (m) {
        m &= m - 1;
        n++;
      }
      return n;
    };
    const entries: ChainEntry[] = results.map((w) => {
      let m = 0;
      for (let i = 0; i < w.length; i++) m |= 1 << (idx.get(w[i]) ?? 0);
      return { w, m, last: w[w.length - 1] };
    });
    // trying letter-rich words first surfaces good solutions before the budget runs out
    entries.sort((a, b) => popcount(b.m) - popcount(a.m));
    const byFirst = new Map<string, ChainEntry[]>();
    for (const e of entries) {
      const g = byFirst.get(e.w[0]) ?? [];
      g.push(e);
      byFirst.set(e.w[0], g);
    }
    return { entries, byFirst, fullMask: (1 << 12) - 1 };
  }, [mode, results, boxedLetters]);

  const boxedChains = useMemo(
    () => (boxedIndex ? findChains(boxedIndex, solutionWords) : { solutions: [], capped: false }),
    [boxedIndex, solutionWords]
  );

  // recommended: fewest words, preferring everyday vocabulary, then fewest letters
  const boxedRecommended = useMemo(() => {
    if (!boxedIndex) return null;
    for (let k = 1; k <= 5; k++) {
      const { solutions } =
        k === solutionWords ? boxedChains : findChains(boxedIndex, k, 200, 1_000_000);
      if (solutions.length) {
        const score = (s: string[]) => {
          const allCommon = commonSet ? s.every((w) => commonSet.has(w)) : true;
          return (allCommon ? 0 : 1000) + s.reduce((n, w) => n + w.length, 0);
        };
        let best = solutions[0];
        for (const s of solutions) if (score(s) < score(best)) best = s;
        return { words: best, allCommon: commonSet ? best.every((w) => commonSet.has(w)) : false };
      }
    }
    return null;
  }, [boxedIndex, boxedChains, solutionWords, commonSet]);

  async function fillTodaysBee() {
    setTodayStatus('loading');
    try {
      const r = await fetch(
        'https://raw.githubusercontent.com/rptetzloff/anagrimoire/puzzle-data/data/spellingbee.json',
        { cache: 'no-store' }
      );
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      const center = String(d.center).toLowerCase();
      const outers = (d.outers as string[]).map((c) => String(c).toLowerCase());
      if (!/^[a-z]$/.test(center) || outers.length !== 6 || !outers.every((c) => /^[a-z]$/.test(c))) {
        throw new Error('bad payload');
      }
      setBeeCenter(center);
      setBeeOuters(outers);
      setTodayStatus('idle');
    } catch {
      setTodayStatus('error');
    }
  }

  async function fillTodaysPuzzle() {
    setTodayStatus('loading');
    try {
      const r = await fetch(
        'https://raw.githubusercontent.com/rptetzloff/anagrimoire/puzzle-data/data/letterboxed.json',
        { cache: 'no-store' }
      );
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      const letters = (d.sides as string[])
        .flatMap((s) => s.toLowerCase().replace(/[^a-z]/g, '').split(''))
        .slice(0, 12);
      if (letters.length !== 12) throw new Error('bad payload');
      setBoxedLetters(letters);
      setTodayStatus('idle');
    } catch {
      setTodayStatus('error');
    }
  }

  // our own generated dailies, loadable into every solver
  async function fillDailyHive() {
    setTodayStatus('loading');
    try {
      const d = await fetchDailyData('bee');
      const b = tierOf(d);
      const center = String(b.center).toLowerCase();
      const outers = (b.outers as string[]).map((c) => String(c).toLowerCase());
      if (!/^[a-z]$/.test(center) || outers.length !== 6 || !outers.every((c) => /^[a-z]$/.test(c))) {
        throw new Error('bad payload');
      }
      setBeeCenter(center);
      setBeeOuters(outers);
      setTodayStatus('idle');
    } catch {
      setTodayStatus('error');
    }
  }

  async function fillDailyBox() {
    setTodayStatus('loading');
    try {
      const d = await fetchDailyData('boxed');
      const letters = (tierOf(d).sides as string[])
        .flatMap((s) => String(s).toLowerCase().replace(/[^a-z]/g, '').split(''))
        .slice(0, 12);
      if (letters.length !== 12) throw new Error('bad payload');
      setBoxedLetters(letters);
      setTodayStatus('idle');
    } catch {
      setTodayStatus('error');
    }
  }

  async function fillDailyGrid() {
    setTodayStatus('loading');
    try {
      const d = await fetchDailyData('grid');
      const cells = (tierOf(d).cells as string[]).map((c) => String(c).toLowerCase());
      // the tiers are different board sizes, so the preset follows the cells
      const preset = (Object.keys(GRID_PRESET_DIMS) as GridPreset[]).find(
        (k) => GRID_PRESET_DIMS[k].rows * GRID_PRESET_DIMS[k].cols === cells.length
      );
      if (!preset || !cells.every((c) => /^[a-z]$/.test(c))) {
        throw new Error('bad payload');
      }
      setGridPreset(preset);
      setGridLetters(cells);
      setTodayStatus('idle');
    } catch {
      setTodayStatus('error');
    }
  }

  async function fillDailyRack() {
    setTodayStatus('loading');
    try {
      const d = await fetchDailyData('descramble');
      const letters = (tierOf(d).letters as string[]).map((c) => String(c).toLowerCase());
      if (letters.length !== 7 || !letters.every((c) => /^[a-z]$/.test(c))) {
        throw new Error('bad payload');
      }
      setRackStr(letters.join(''));
      setUseAll(false);
      setTodayStatus('idle');
    } catch {
      setTodayStatus('error');
    }
  }

  const sorted = useMemo(() => sortResults(results, sort), [results, sort]);

  const visible = showAll ? sorted : sorted.slice(0, CAP);

  const pangrams =
    mode === 'bee' && beeAllowed.size === 7
      ? visible.filter((w) => new Set(w).size === 7)
      : [];
  const pangramSet = new Set(pangrams);
  const groupSource = mode === 'bee' ? visible.filter((w) => !pangramSet.has(w)) : visible;

  const containsSet = new Set(contains);

  function highlight(word: string) {
    return word.split('').map((ch, i) => {
      const isKnown = known[i] === ch;
      const isContains = !isKnown && containsSet.has(ch);
      return (
        <span
          key={i}
          className={
            isKnown
              ? 'text-emerald-300 font-semibold'
              : isContains
                ? 'text-amber-300 font-semibold'
                : 'text-slate-300'
          }
        >
          {ch}
        </span>
      );
    });
  }

  function pickDefaultTarget(): HTMLInputElement | null {
    if (mode === 'descramble') {
      return document.querySelector<HTMLInputElement>('input[aria-label="Letters to descramble"]');
    }
    const group =
      mode === 'bee'
        ? 'bee'
        : mode === 'boxed'
          ? 'boxed'
          : mode === 'grid'
            ? 'grid'
            : mode === 'weave'
              ? 'weave'
              : 'known';
    const tiles = [...document.querySelectorAll<HTMLInputElement>(`input[data-tile-group="${group}"]`)];
    return tiles.find((t) => !t.value) ?? tiles[0] ?? null;
  }

  // Where an on-screen key goes. Learn first if it is open; then the mounted
  // play board, if there is one; then — and this is the part that is easy to
  // miss — straight into whatever input the solver surfaces have focused,
  // which is what the rest of this function does.
  //
  // The board step was an if-chain naming eight of the ten games, so pressing
  // a key on Ladder or Bridge did nothing at all: both expose `pressKey`, App
  // already held both refs, and neither was ever called. A Record<Mode, …> is
  // the difference between the eleventh game failing to compile and failing
  // silently, which is exactly how these two got missed.
  const KEY_TARGETS: Record<Mode, { current: { pressKey: (k: string) => void } | null }> = {
    pattern: gameRef,
    bee: hiveRef,
    boxed: boxRef,
    descramble: scrambleRef,
    grid: gridRef,
    weave: weaveRef,
    squares: squaresRef,
    cryptogram: cryptogramRef,
    ladder: ladderRef,
    bridge: bridgeRef,
  };

  function pressKey(k: string) {
    if (learnMode) {
      learnRef.current?.pressKey(k);
      return;
    }
    // `playFlags[mode][0]` is the same test the ten `*PlayActive` flags make;
    // `!learnMode` is already settled by the return above.
    const board = playFlags[mode][0] ? KEY_TARGETS[mode].current : null;
    if (board) {
      board.pressKey(k);
      return;
    }

    // No board: a solver is on screen, and its inputs are ordinary DOM. Drive
    // the one last focused, or the one this game starts at.
    const remembered =
      lastFocused.current && document.contains(lastFocused.current) ? lastFocused.current : null;
    const target = remembered ?? pickDefaultTarget();
    if (!target) return;
    target.focus();

    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    const isTile = target.hasAttribute('data-tile-group');

    if (k === 'backspace') {
      if (isTile) {
        if (target.value) {
          setValue.call(target, '');
          target.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          const g = target.getAttribute('data-tile-group');
          const i = Number(target.getAttribute('data-tile-index'));
          const prev = document.querySelector<HTMLInputElement>(
            `input[data-tile-group="${g}"][data-tile-index="${i - 1}"]`
          );
          if (prev) {
            prev.focus();
            prev.select();
          }
        }
      } else {
        // chip inputs keep their inner input empty; their own Backspace
        // handler removes the last pill
        target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
      }
      return;
    }

    setValue.call(target, isTile ? k : target.value + k);
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // What the panel says when the answer is empty. Two different sentences hide
  // in here and always did: "you have not finished typing" and "those letters
  // spell nothing" mean opposite things to somebody stuck, so each solver gets
  // to distinguish them. It reads as a ladder of ternaries because it is one —
  // it moves to each solver as they come out, and the pattern solver's line is
  // the fallback because it is the only one with no incomplete-board state.
  const emptyNote =
    mode === 'descramble'
      ? rackLetters.length + wildcards === 0
        ? 'Type your letters above to see what they can spell.'
        : 'Nothing spells from those letters. Try adding a wildcard (?) or lowering the minimum length.'
      : mode === 'bee'
        ? beeCenter === ''
          ? 'Enter the center letter and the six outer letters to find words.'
          : 'No words found from those letters. Double-check the puzzle.'
        : mode === 'boxed'
          ? boxedLetters.filter(Boolean).length < 12
            ? 'Enter the twelve letters, three per side, to find words.'
            : 'No words fit this box. Double-check the puzzle.'
          : mode === 'grid'
            ? gridLetters.filter(Boolean).length < gridLetters.length
              ? `Fill in all ${gridLetters.length} grid letters to find words.`
              : 'No words can be traced on this grid.'
            : mode === 'weave'
              ? weaveLetters.filter(Boolean).length < weaveLetters.length
                ? `Fill in all ${weaveLetters.length} board letters to find words.`
                : 'No words can be traced on this board.'
              : 'No words fit those clues. Try loosening a constraint.';

  // Whatever a game wants shown above the plain list. No shape in common — a
  // pangram is a word, a Boxed solution is an ordered chain of them in five
  // colours — which is why the panel takes these as children rather than
  // trying to describe both in one prop.
  const featured = (
    <>
              {boxedRecommended && (
                <div className="mb-6">
                  <p className="mb-2.5 text-xs font-medium text-accent uppercase tracking-wider inline-flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5" />
                    Recommended
                    <span className="text-accent normal-case tracking-normal">
                      · {boxedRecommended.words.length}{' '}
                      {boxedRecommended.words.length === 1 ? 'word' : 'words'}
                      {boxedRecommended.allCommon ? ', everyday vocabulary' : ''}
                    </span>
                  </p>
                  <div className="grid grid-cols-1 gap-2.5">
                    <WordChip
                      word={boxedRecommended.words.join(' ')}
                      hoverProps={boxedTraceHandlers(boxedRecommended.words)}
                      className="bg-amber-400/10 border border-amber-400/30 text-amber-200 font-semibold hover:bg-amber-400/20"
                    >
                      {boxedRecommended.words.map((w, i) => (
                        <span key={i}>
                          {i > 0 && <span className="text-slate-500"> → </span>}
                          <span className={BOX_TRACE_TEXT[i % BOX_TRACE_TEXT.length]}>{w}</span>
                        </span>
                      ))}
                    </WordChip>
                  </div>
                </div>
              )}
              {mode === 'boxed' && boxedIndex && (
                <div className="mb-6">
                  <p className="mb-2.5 text-xs font-medium text-success uppercase tracking-wider">
                    {solutionWords}-word solutions{' '}
                    <span className="text-success">
                      · {boxedChains.capped ? `${boxedChains.solutions.length}+` : boxedChains.solutions.length}
                    </span>
                  </p>
                  {boxedChains.solutions.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No {solutionWords}-word solutions found — try allowing more words.
                    </p>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {boxedChains.solutions.slice(0, 24).map((s) => (
                          <WordChip
                            key={s.join(' ')}
                            word={s.join(' ')}
                            hoverProps={boxedTraceHandlers(s)}
                            className="bg-emerald-400/10 border border-emerald-400/30 text-emerald-200 font-semibold hover:bg-emerald-400/20"
                          >
                            {s.map((w, i) => (
                              <span key={i}>
                                {i > 0 && <span className="text-slate-500"> → </span>}
                                <span className={BOX_TRACE_TEXT[i % BOX_TRACE_TEXT.length]}>{w}</span>
                              </span>
                            ))}
                          </WordChip>
                        ))}
                      </div>
                      {boxedChains.solutions.length > 24 && (
                        <p className="mt-2 text-xs text-slate-500">
                          Showing the 24 shortest of{' '}
                          {boxedChains.capped
                            ? `${boxedChains.solutions.length}+ (search capped)`
                            : boxedChains.solutions.length}{' '}
                          solutions.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
              {pangrams.length > 0 && (
                <div className="mb-6">
                  <p className="mb-2.5 text-xs font-medium text-accent uppercase tracking-wider">
                    Pangrams <span className="text-accent">· {pangrams.length}</span>
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                    {pangrams.map((w) => (
                      <WordChip
                        key={w}
                        word={w}
                        className="bg-amber-400/10 border border-amber-400/30 text-amber-200 font-semibold hover:bg-amber-400/20"
                      />
                    ))}
                  </div>
                </div>
              )}
    </>
  );

  function resetAll() {
    setKnown(Array(length).fill(''));
    setContainsStr('');
    setExcludedStr('');
    setRackStr('');
    setBeeCenter('');
    setBeeOuters(Array(6).fill(''));
    setBoxedLetters(Array(12).fill(''));
    setGridLetters(Array(gridDims.rows * gridDims.cols).fill(''));
    setWeaveLetters(Array(weaveDims.rows * weaveDims.cols).fill(''));
    setStrandsClue(null);
  }

  // A game, opened from anywhere: its daily, as the layout spec has it. The
  // home cards and the bar's Games menu both come here.
  function openGame(m: Mode) {
    setAtHome(false);
    setMode(m);
    // not goToView: that reads `mode`, which is still the game we're leaving
    // until this render commits, so it would flip the wrong game's tab
    setLearnMode(false);
    playFlags[m][1](true);
    requestDaily(m, true);
  }

  function openSolver(m: Mode) {
    setAtHome(false);
    setMode(m);
    setLearnMode(false);
    playFlags[m][1](false);
  }

  // ---- what the bar holds ----
  // Games is the play side and Solvers the solve side, so hiding a view in
  // settings takes its menu away with it rather than leaving one whose links
  // all bounce to another tab.
  const shownRows = MODES.filter((m) => shownModes.includes(m.id));
  const barGames: BarItem[] = !shownViews.includes('play') ? [] : shownRows.map((m) => ({
    key: m.id,
    label: GAME_NAME[m.id].full,
    tile: MODE_SLUG[m.id],
    // read when the list opens, not on every keystroke the page takes
    status: () => allDailyStatus([m.id])[m.id] ?? 'none',
    go: { to: pathOf({ kind: 'game', view: 'play', slug: MODE_SLUG[m.id], daily: true }), onGo: () => openGame(m.id) },
  }));
  const barSolvers: BarItem[] = !shownViews.includes('solve') ? [] : shownRows.map((m) => ({
    key: m.id,
    label: GAME_NAME[m.id].full,
    tile: MODE_SLUG[m.id],
    note: m.blurb,
    go: { to: pathOf({ kind: 'game', view: 'solve', slug: MODE_SLUG[m.id], daily: false }), onGo: () => openSolver(m.id) },
  }));
  const barMe: BarItem[] = [
    { key: 'stats', label: 'Stats', icon: <BarChart3 className="w-4 h-4" />, go: overlayLink({ kind: 'stats', tab: nav.last.stats }) },
    { key: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" />, go: overlayLink({ kind: 'settings', tab: nav.last.settings }) },
    { key: 'keys', label: 'Keys', icon: <Keyboard className="w-4 h-4" />, go: overlayLink({ kind: 'panel', panel: 'keys' }) },
    ...(supabase && session ? [{ key: 'account', label: 'Account and friends', icon: <UserRound className="w-4 h-4" />,
                                 go: overlayLink({ kind: 'account', tab: nav.last.account }) }] : []),
    // The server says who is an owner, and the RPCs behind the queue check
    // again; this only decides whether to draw a link.
    ...(owner ? [{ key: 'reports', label: 'Open reports', icon: <FlagIcon className="w-4 h-4" />, go: pageLink({ kind: 'reportQueue' }) }] : []),
  ];
  const quickCan = {
    pattern: shownViews.includes('solve') && shownModes.includes('pattern'),
    anagram: shownViews.includes('solve') && shownModes.includes('descramble'),
  };
  // A problem comes back as a sentence for the box to show; null means it went.
  const quickSolve = (text: string): string | null => {
    const q = parseQuickSolve(text, lengthRange, quickCan);
    if (q.kind === 'problem') return q.why;
    if (q.kind === 'pattern') {
      setLength(q.known.length);
      setKnown(q.known);
      setContainsStr('');
      setExcludedStr('');
      openSolver('pattern');
    } else {
      setRackStr(q.letters);
      openSolver('descramble');
    }
    return null;
  };
  const barSection: Section =
    atHome ? 'today'
    : reportPage ? null
    : statsOpen && statsTab === 'boards' ? 'boards'
    : currentView === 'solve' ? 'solvers'
    : 'games';
  const barTitle = atHome ? 'Today' : reportPage ? titleOf(reportPage).replace(/ · .*$/, '') : GAME_NAME[mode].full;
  const you = session ? { initial: (displayName ?? session.user.email ?? '?').trim().charAt(0).toUpperCase() || '?' } : null;

  return (
    <PaletteContext.Provider value={palette}>
    <PrefsContext.Provider value={prefs}>
    <OskContext.Provider value={kbOpen}>
    <div className="min-h-screen bg-slate-950 text-white relative overflow-x-clip">

      {/* keyboard users can jump the bar and land on the page */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:px-4 focus:py-2.5 focus:rounded-lg focus:bg-amber-400 focus:text-ink focus:text-sm focus:font-semibold focus:shadow-lg"
      >
        Skip to content
      </a>

      <SiteBar
        home={pageLink({ kind: 'home' })}
        boards={overlayLink({ kind: 'stats', tab: 'boards' })}
        current={barSection}
        title={barTitle}
        titleSwitchesGame={!atHome && !reportPage}
        games={barGames}
        solvers={barSolvers}
        me={barMe}
        quickSolve={quickCan.pattern || quickCan.anagram ? quickSolve : null}
        signIn={supabase && !session ? { to: '/sign-in', onGo: () => openOverlay({ kind: 'account', tab: 'personal' }) } : null}
        you={you}
        covered={nav.overlays.length > 0}
      />

      <main
        id="main"
        tabIndex={-1}
        className={`relative mx-auto outline-none ${
          // Home has a rail beside it, so it takes the bar's width and edges;
          // a game is still one column at a reading measure
          atHome && !reportPage ? 'max-w-6xl px-4 lg:px-6 py-6 sm:py-8' : 'max-w-3xl px-5 py-8 sm:py-12'
        } ${kbOpen ? 'pb-80 md:pb-64' : ''}`}
      >
        {/* A game page starts with the game's own name; Home's heading is
            its strip saying where you are with today (HomeView), and the bar
            carries the site's name everywhere. A report page has neither --
            the strapline used to describe the game loaded behind it, which
            nobody asked about. */}
        {!atHome && !reportPage && (
          <header className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">{GAME_NAME[mode].full}</h1>
            <p className="mt-2 text-slate-400 max-w-md mx-auto text-sm sm:text-base">
              {shownViews.includes('solve')
                ? MODES.find((m) => m.id === mode)?.description
                : MODES.find((m) => m.id === mode)?.playDescription}
            </p>
          </header>
        )}

        {/* A report page is the whole page. Gating the games and the home
            view left every other section standing — the Solve/Play/Learn
            switch, the difficulty tabs, the dictionary and length pickers —
            so a reader arriving from an email got a report wearing the
            chrome of a word game. One conditional rather than a dozen,
            because a dozen is a list somebody will add the thirteenth to.
            The bar and the footer stay: they are the way back out. */}
        {reportPage ? (
          <>
          {reportPage?.kind === 'ticket' && <TicketView ticket={reportPage.ticket} />}
          {reportPage?.kind === 'reportQueue' && <ReportQueueView />}
          {reportPage?.kind === 'reportAction' && (
            <ReportActionView
              id={reportPage.id}
              token={reportPage.token}
              action={reportPage.action}
            />
          )}

          </>
        ) : (
          <>
          {atHome && (
            <HomeView
              modes={shownModes}
              onOpen={openGame}
              boards={overlayLink({ kind: 'stats', tab: 'boards' })}
              solvers={barSolvers.map((b) => ({ key: b.key, label: GAME_NAME[b.key as Mode].short, go: b.go }))}
            />
          )}

          {!atHome && (
          <>
          {/* Only where there's a Learn tab to point at, and only until it's
              been answered either way. `currentView` keeps it off the Learn tab
              itself, where it would be telling someone about the page they're
              already reading. */}
          {!onboarded &&
            // signed in, the account gets the deciding vote — wait for it rather
            // than flashing "new here?" at someone who answered on another device
            (!session || settingsPulled) &&
            shownViews.includes('learn') &&
            currentView !== 'learn' && (
            <OnboardingCard
              game={GAME_NAME[mode].full}
              onLearn={() => {
                goToView('learn');
                setOnboarded(true);
              }}
              onDismiss={() => setOnboarded(true)}
            />
          )}

          {/* solve / play / learn toggle — gone entirely when only one is left,
              since a switch with one position is just clutter. Hiding Solve and
              Learn is how the site becomes a game site rather than a tool with
              games attached. */}
          <section className={`mb-7 text-center ${shownViews.length > 1 ? '' : 'hidden'}`}>
            {/* wraps rather than overflowing: at 320px with the largest text
                this row is wider than the viewport, and the page clips its
                horizontal overflow, so Learn was cut off with no way to reach
                it */}
            <div className="inline-flex flex-wrap justify-center max-w-full rounded-xl bg-white/5 border border-white/10 p-1 gap-1">
                {(
                  [
                    { view: 'solve', label: 'Solve', Icon: Search },
                    { view: 'play', label: 'Play', Icon: Gamepad2 },
                    { view: 'learn', label: 'Learn', Icon: BookOpen },
                  ] as const
                )
                  .filter(({ view }) => shownViews.includes(view))
                  .map(({ view, label, Icon }) => {
                  const active = currentView === view;
                  return (
                    <RouteLink
                      key={label}
                      to={pathOf({
                        kind: 'game',
                        view,
                        slug: MODE_SLUG[mode],
                        daily: dailyByMode[mode],
                      })}
                      onGo={() => goToView(view)}
                      className={`inline-flex items-center gap-1.5 px-4 sm:px-5 h-10 rounded-lg text-sm font-semibold transition-all duration-150
                        ${active
                          ? 'bg-accent text-slate-950 shadow-lg shadow-accent/30'
                          : 'text-slate-300 hover:bg-white/10'}`}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </RouteLink>
                  );
                })}
            </div>
          </section>

          {showDifficultySwitch && (
            <section className="mb-7 text-center">
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2.5">
                Difficulty
              </label>
              <div className="inline-flex flex-wrap justify-center max-w-full rounded-xl bg-white/5 border border-white/10 p-1 gap-1">
                {DIFFICULTIES.map((id) => (
                  <button
                    key={id}
                    onClick={() => setDifficulty(id)}
                    aria-pressed={level === id}
                    className={`px-3.5 h-9 rounded-lg text-sm font-semibold transition-colors
                      ${level === id
                        ? 'bg-accent text-slate-950 shadow-lg shadow-accent/30'
                        : 'text-slate-300 hover:bg-white/10'}`}
                  >
                    {DIFFICULTY_LABEL[id]}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* The same rung as Difficulty above, and the reason the two sit
              together: Difficulty is what a *play* board is built from, Word
              list is what a *solve* answer is drawn from. One question, asked
              once, in the wording the current view understands — which is why
              they are mutually exclusive rather than stacked.

              It used to render down among the game blocks, which put it above
              the board for five games and below the first control for the other
              five, purely by where each game happened to sit in this file.
              Nobody chose that. Hidden when one dictionary has been set for the
              whole site, since there'd be nothing left for it to pick. */}
          {!playActive && solverDictionary === 'per-game' && (
          <section className="mb-7 text-center">
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2.5">
              Word list
            </label>
            <div className="inline-flex flex-wrap justify-center max-w-full rounded-xl bg-white/5 border border-white/10 p-1 gap-1">
              {DICTIONARIES.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setDictionaryId(d.id)}
                  title={d.blurb}
                  className={`inline-flex items-center gap-1.5 px-4 h-9 rounded-lg text-sm font-semibold transition-all duration-150
                    ${dictionaryId === d.id
                      ? 'bg-accent text-slate-950 shadow-lg shadow-accent/30'
                      : 'text-slate-300 hover:bg-white/10'}`}
                >
                  {d.id === 'easy' && <BookOpen className="w-3.5 h-3.5" />}
                  {d.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {DICTIONARIES.find((d) => d.id === dictionaryId)?.blurb}
            </p>
          </section>
          )}

          {learnMode && (
            <div className="mb-8">
              <LearnMode
                ref={learnRef}
                mode={mode}
                standardWords={standardWordsArr}
                palette={palette}
                theme={resolveTheme(theme)}
              />
            </div>
          )}

          {/* The report pages replace the board rather than sitting above it.
              Gating only the home page left /report/<ticket> rendering a ticket
              *and* a playable puzzle underneath it — which is what a reader on a
              report page least expects to find. */}
          {!learnMode && (
          <>
          {squaresPlayActive && (
          <div className="mb-8">
            <SquaresGame ref={squaresRef} standardWords={acceptWordsArr ?? standardWordsArr} />
          </div>
          )}

          {cryptogramPlayActive && (
          <div className="mb-8">
            <CryptogramGame ref={cryptogramRef} />
          </div>
          )}

          {mode === 'bridge' && bridgePlay && (
          <div className="mb-8">
            <BridgeGame ref={bridgeRef} />
          </div>
          )}

          {mode === 'bridge' && !bridgePlay && (
            <BridgeSolver x={bridgeX} y={bridgeY} onX={setBridgeX} onY={setBridgeY} words={standardWordsArr} />
          )}

          {mode === 'ladder' && ladderPlay && (
          <div className="mb-8">
            <LadderGame ref={ladderRef} />
          </div>
          )}

          {/* The ladder solver answers exactly, which no other solver here can
              claim: breadth-first search returns the shortest route or proves
              there is none, so there is nothing to rank and nothing to guess. */}
          {mode === 'ladder' && !ladderPlay && (
            <LadderSolver
              from={ladderFrom}
              to={ladderTo}
              onFrom={setLadderFrom}
              onTo={setLadderTo}
              words={commonWordsArr}
            />
          )}

          {mode === 'cryptogram' && !cryptogramPlay && (
            <CryptogramSolver words={acceptWordsArr ?? standardWordsArr} wordRank={wordRank} />
          )}

          {weavePlayActive && (
          <div className="mb-8">
            <WeaveGame ref={weaveRef} standardWords={acceptWordsArr ?? standardWordsArr} navKeys={navKeys} />
          </div>
          )}

          {mode === 'squares' && !squaresPlay && (
            <SquaresSolver
              size={squaresSize}
              letters={squaresLetters}
              onSize={setSquaresSize}
              onLetters={setSquaresLetters}
              words={words}
              osk={kbOpen}
            />
          )}

          {mode === 'weave' && !weavePlay && (
            <WeaveSolver
              size={weaveSize}
              onSize={changeWeaveSize}
              letters={weaveLetters}
              cols={weaveDims.cols}
              onLetters={setWeaveLetters}
              osk={kbOpen}
              trace={gridT}
              onFillStrands={fillTodaysStrands}
              onFillWeave={fillTodaysWeave}
              todayStatus={todayStatus}
              strandsClue={strandsClue}
            />
          )}

          {mode === 'pattern' && (
          <>
          {/* length selector — gone when the range allows only one, the same way
              the view switch goes when one tab is left */}
          <section className={`mb-7 text-center ${shownLengths.length > 1 ? '' : 'hidden'}`}>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2.5">
              Word length
            </label>
            <div className="flex flex-wrap gap-2 justify-center">
              {shownLengths.map((n) => (
                <button
                  key={n}
                  onClick={() => setLength(n)}
                  className={`w-11 h-11 rounded-xl text-sm font-semibold transition-all duration-150
                    ${length === n
                      ? 'bg-accent text-slate-950 shadow-lg shadow-accent/30 scale-105'
                      : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:border-white/20'}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </section>

          {patternPlay ? (
          <div className="mb-8">
            <GuessGame
              ref={gameRef}
              length={length}
              commonWords={commonWordsArr}
              practiceWords={practiceWordsArr}
              fullWords={acceptWordsArr ?? fullWordsArr}
              onLetterStates={setLetterStates}
              onReveal={!shownViews.includes('solve') || !helpAllowed ? undefined : ({ length: len, known: k, contains, excluded }) => {
                setLength(len);
                setKnown(k);
                setContainsStr(contains);
                setExcludedStr(excluded);
                setPatternPlay(false);
              }}
            />
          </div>
          ) : (
            <GuessSolver
              known={known}
              onKnown={setKnown}
              length={length}
              contains={containsStr}
              onContains={setContainsStr}
              excluded={excludedStr}
              onExcluded={setExcludedStr}
              osk={kbOpen}
            />
          )}
          </>
          )}

          {descramblePlayActive && (
          <div className="mb-8">
            <ScrambleGame
              ref={scrambleRef}
              standardWords={acceptWordsArr ?? standardWordsArr}
              commonWords={commonWordsArr}
              practiceWords={practiceWordsArr}
              onLetterStates={setLetterStates}
              onReveal={!shownViews.includes('solve') || !helpAllowed ? undefined : (letters) => {
                setRackStr(letters);
                setUseAll(false);
                setMinLength(3);
                setDescramblePlay(false);
              }}
            />
          </div>
          )}

          {mode === 'descramble' && !descramblePlay && (
            <ScrambleSolver
              rack={rackStr}
              onRack={setRackStr}
              maxLen={MAX_LEN}
              useAll={useAll}
              onUseAll={setUseAll}
              minLength={minLength}
              onMinLength={setMinLength}
              osk={kbOpen}
              onFillToday={fillDailyRack}
              todayStatus={todayStatus}
            />
          )}

          {beePlayActive && (
          <div className="mb-8">
            <HiveGame
              ref={hiveRef}
              standardWords={acceptWordsArr ?? standardWordsArr}
              commonWords={commonWordsArr}
              practiceWords={practiceWordsArr}
              onLetterStates={setLetterStates}
              onReveal={!shownViews.includes('solve') || !helpAllowed ? undefined : (center, outers) => {
                setBeeCenter(center);
                setBeeOuters(outers);
                setBeePlay(false);
              }}
            />
          </div>
          )}

          {mode === 'bee' && !beePlay && (
            <HiveSolver
              center={beeCenter}
              outers={beeOuters}
              onCenter={setBeeCenter}
              onOuters={setBeeOuters}
              osk={kbOpen}
              onFillDaily={fillDailyHive}
              onFillNyt={fillTodaysBee}
              todayStatus={todayStatus}
              centreColour={colorWords(palette, resolveTheme(theme)).key}
            />
          )}

          {gridPlayActive && (
          <div className="mb-8">
            <GridGame
              ref={gridRef}
              standardWords={acceptWordsArr ?? standardWordsArr}
              displayWord={showWord}
              onLetterStates={setLetterStates}
              onReveal={!shownViews.includes('solve') || !helpAllowed ? undefined : (cells) => {
                setGridPreset(cells.length === 9 ? '3x3' : cells.length === 25 ? '5x5' : '4x4');
                setGridLetters(cells);
                setGridPlay(false);
              }}
            />
          </div>
          )}

          {mode === 'grid' && !gridPlay && (
            <GridSolver
              preset={gridPreset}
              onPreset={changeGridPreset}
              letters={gridLetters}
              cols={gridDims.cols}
              onLetters={setGridLetters}
              osk={kbOpen}
              trace={gridT}
              onFillToday={fillDailyGrid}
              todayStatus={todayStatus}
            />
          )}

          {boxedPlayActive && (
          <div className="mb-8">
            <BoxGame
              ref={boxRef}
              standardWords={acceptWordsArr ?? standardWordsArr}
              commonWords={commonWordsArr}
              practiceWords={practiceWordsArr}
              onLetterStates={setLetterStates}
              onReveal={!shownViews.includes('solve') || !helpAllowed ? undefined : (sides) => {
                setBoxedLetters(sides.flatMap((s) => s.split('')).slice(0, 12));
                setBoxedPlay(false);
              }}
            />
          </div>
          )}

          {mode === 'boxed' && !boxedPlay && (() => {
            const boxTile = (i: number) => (
              <Tile
                key={i}
                index={i}
                group="boxed"
                osk={kbOpen}
                value={boxedLetters[i]}
                state={boxedLetters[i] ? 'known' : 'empty'}
                size="sm"
                tone={BOX_SIDE_TONES[Math.floor(i / 3)]}
                onChange={(c) =>
                  setBoxedLetters((prev) => prev.map((x, k) => (k === i ? c : x)))
                }
              />
            );
            return (
              <div className="mb-8 text-center">
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                  Sides of the box
                </label>
                <div ref={boxedT.boardRef} className="relative w-full max-w-[18rem] aspect-square mx-auto">
                  <div className="absolute inset-14 rounded-xl border-2 border-white/15 bg-white/[0.02]" />
                  {/* top */}
                  <div className="absolute top-0 left-14 right-14 flex justify-around">
                    {[0, 1, 2].map(boxTile)}
                  </div>
                  {/* right */}
                  <div className="absolute right-0 top-14 bottom-14 flex flex-col justify-around items-end">
                    {[3, 4, 5].map(boxTile)}
                  </div>
                  {/* bottom */}
                  <div className="absolute bottom-0 left-14 right-14 flex justify-around">
                    {[6, 7, 8].map(boxTile)}
                  </div>
                  {/* left */}
                  <div className="absolute left-0 top-14 bottom-14 flex flex-col justify-around items-start">
                    {[9, 10, 11].map(boxTile)}
                  </div>
                  {boxedT.points.some((pts) => pts.length > 1) && (
                    <svg className="absolute inset-0 w-full h-full pointer-events-none">
                      {boxedT.points.map((pts, wi) =>
                        pts.length > 1 ? (
                          <g key={wi}>
                            <polyline
                              points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
                              fill="none"
                              stroke={BOX_TRACE_COLORS[wi % BOX_TRACE_COLORS.length]}
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <circle
                              cx={pts[0].x}
                              cy={pts[0].y}
                              r="5"
                              fill={BOX_TRACE_COLORS[wi % BOX_TRACE_COLORS.length]}
                            />
                          </g>
                        ) : null
                      )}
                    </svg>
                  )}
                </div>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={fillDailyBox}
                    disabled={todayStatus === 'loading'}
                    className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
                  >
                    <CalendarDays className="w-4 h-4" />
                    {todayStatus === 'loading' ? 'Fetching…' : "Today's daily box"}
                  </button>
                  <button
                    onClick={fillTodaysPuzzle}
                    disabled={todayStatus === 'loading'}
                    className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
                  >
                    <CalendarDays className="w-4 h-4" />
                    {todayStatus === 'loading' ? 'Fetching…' : "Today's NYT box"}
                  </button>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                    Solution words
                    <span className="inline-flex rounded-lg bg-white/5 border border-white/10 p-0.5 gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          onClick={() => setSolutionWords(n)}
                          className={`w-8 h-8 rounded-md text-sm font-semibold transition-colors
                            ${solutionWords === n
                              ? 'bg-white/15 text-white'
                              : 'text-slate-400 hover:text-white'}`}
                        >
                          {n}
                        </button>
                      ))}
                    </span>
                  </label>
                </div>
                {todayStatus === 'error' && (
                  <p className="mt-2 text-xs text-danger">
                    Couldn&apos;t fetch today&apos;s puzzle — try again in a minute.
                  </p>
                )}
                <p className="mt-3 text-xs text-slate-500">
                  Words are 3+ letters and may reuse letters, but consecutive letters can&apos;t
                  come from the same side. Both today&apos;s puzzles become available about
                  15 minutes after the NYT publishes it (3:00&nbsp;a.m. Eastern).
                </p>
              </div>
            );
          })()}

          {!playActive && WORD_LIST_SOLVERS.has(mode) && (
            <ResultsPanel
              results={results}
              words={groupSource}
              sort={sort}
              onSort={setSort}
              onClear={resetAll}
              showAll={showAll}
              onShowAll={setShowAll}
              emptyNote={emptyNote}
              grouped={mode !== 'pattern' && sort.key === 'length'}
              sortable={mode !== 'pattern'}
              renderWord={mode === 'pattern' ? highlight : undefined}
              hoverPropsFor={
                mode === 'grid'
                  ? gridTraceHandlers
                  : mode === 'weave'
                    ? weaveTraceHandlers
                    : mode === 'boxed'
                      ? (w) => boxedTraceHandlers([w])
                      : undefined
              }
            >
              {featured}
            </ResultsPanel>
          )}
          </>
          )}
          </>
          )}

          </>
        )}

        {/* pb keeps the last row clear of the phone's tab bar and the floating
            keyboard button above it */}
        <footer className="mt-14 pb-40 md:pb-4 text-center text-xs text-slate-500">
          {/* only where a word list is what is being searched — the ladder
              and bridge solvers answer from a rule, so naming a dictionary
              size under them describes work they do not do */}
          {!playActive && !learnMode && WORD_LIST_SOLVERS.has(mode) && (
            <p>
              Searching {words.length.toLocaleString()} English words (the{' '}
              {DICTIONARIES.find((d) => d.id === dictionaryId)?.label.toLowerCase()} word
              list).
            </p>
          )}
          {/* The slim footer (the layout spec): the documents and the way to
              report a problem. Stats, settings, keys and the account moved to
              the bar's own menu; Home is the logo and Today. */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2.5">
            <RouteLink
              {...overlayLink({ kind: 'panel', panel: 'about' })}
              className="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors"
            >
              About &amp; FAQ
            </RouteLink>
            <RouteLink
              {...overlayLink({ kind: 'legal', doc: 'privacy' })}
              className="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors"
            >
              Privacy
            </RouteLink>
            <RouteLink
              {...overlayLink({ kind: 'legal', doc: 'terms' })}
              className="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors"
            >
              Terms
            </RouteLink>
            <ReportMenu
              context={{
                game: FEED_NAME[mode],
                gameLabel: GAME_NAME[mode].full,
                date: dateByMode[mode],
                level,
              }}
            />
            <a
              href="https://github.com/rptetzloff/anagrimoire"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors"
            >
              <Github className="w-3.5 h-3.5" />
              GitHub
            </a>
            {/* The other site, by name rather than by domain — it sits among
                nav links, and "wordlock.net" would read as an address dropped
                into a row of destinations. Its own mark, served from here
                rather than hotlinked: the footer of a site that promises
                nothing leaves your device shouldn't quietly fetch an image
                from somewhere else. */}
            <a
              href="https://wordlock.net"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors"
            >
              <WordLockMark />
              WordLock
            </a>
          </div>
        </footer>
      </main>

      {authNotice && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[70] max-w-md w-[calc(100%-2rem)] rounded-xl bg-rose-950/95 border border-rose-500/40 px-4 py-3 shadow-2xl flex items-start gap-3">
          <p className="text-sm text-rose-200 flex-1">
            Sign-in didn&apos;t complete: {authNotice}. Request a fresh link, or use the
            emailed code instead.
          </p>
          <button
            onClick={() => setAuthNotice(null)}
            aria-label="Dismiss"
            className="text-rose-300 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {statsOpen && (
        <StatsModal
          signedIn={!!session}
          view={statsTab}
          onView={(tab) => openOverlay({ kind: 'stats', tab })}
          onClose={closeOverlay}
        />
      )}

      {accountOpen && (
        <AccountModal
          session={session}
          tab={accountTab}
          onTab={(tab) => openOverlay({ kind: 'account', tab })}
          onClose={closeOverlay}
        />
      )}

      <ConsentBanner
        onReadPolicy={() => {
          // over whatever is already open, rather than instead of it: the
          // banner sits above the modals, so this is reachable with Settings
          // open and closing it must put Settings back
          openOverlay({ kind: 'legal', doc: 'privacy' });
        }}
      />

      {keysOpen && (
        <KeyboardHelp
          navKeys={navKeys}
          shownModes={shownModes}
          onClose={closeOverlay}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          tab={settingsTab}
          onTab={(tab) => openOverlay({ kind: 'settings', tab })}
          startPage={startPage}
          onStartPage={setStartPage}
          theme={theme}
          palette={palette}
          navKeys={navKeys}
          textScale={textScale}
          hiddenModes={hiddenModes}
          hiddenViews={hiddenViews}
          lengthRange={lengthRange}
          practiceAllowed={practiceAllowed}
          highlightMatches={highlightMatches}
          helpAllowed={helpAllowed}
          solverDictionary={solverDictionary}
          signedIn={!!session}
          onTheme={setTheme}
          onPalette={setPalette}
          onNavKeys={setNavKeys}
          onTextScale={setTextScale}
          onToggleMode={(m) =>
            setHiddenModes((prev) =>
              prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]
            )
          }
          onLengthRange={setLengthRange}
          onPracticeAllowed={setPracticeAllowed}
          onHighlightMatches={setHighlightMatches}
          onHelpAllowed={setHelpAllowed}
          onSolverDictionary={setSolverDictionary}
          wordFilter={wordFilter}
          onWordFilter={setWordFilter}
          onToggleView={(v) =>
            setHiddenViews((prev) =>
              prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
            )
          }
          onClose={closeOverlay}
        />
      )}

      {/* about & FAQ modal */}
      {aboutOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={closeOverlay}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="About and FAQ"
            ref={aboutRef}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl bg-slate-900 border border-white/10 text-left shadow-2xl"
          >
            {/* outside the scroll, so it can't slide away mid-read */}
            <button
              onClick={closeOverlay}
              aria-label="Close"
              className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-lg bg-slate-900/95 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="overflow-y-auto p-6 sm:p-8">
            <h2 className="text-xl font-bold mb-5">About Anagrimoire</h2>

            <div className="space-y-5 text-sm text-slate-300">
              <p>
                Anagrimoire is a free companion for word games: solvers for seven kinds of
                puzzles, our own daily and practice versions of each to play, and
                interactive guides to learn them.
              </p>
              <p className="text-slate-400">
                The name is a portmanteau of <em>anagram</em> and <em>grimoire</em> — a
                grimoire being an old book of spells. A spellbook for words, more or less.
              </p>

              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  FAQ
                </h3>
                <div className="space-y-3 text-slate-400">
                  <div>
                    <p className="text-slate-300 font-medium">How do you say it?</p>
                    <p>
                      <span className="whitespace-nowrap">/ ˈæn ə grimˈwɑr /</span> —{' '}
                      <em>AN-uh-grim-WAHR</em>. <em>Anagram</em> up front, then{' '}
                      <em>grimoire</em> the French way, rhyming with <em>memoir</em>.
                      Stress on the first syllable and the last.
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-300 font-medium">
                      Are the daily puzzles the same as the NYT&apos;s?
                    </p>
                    <p>
                      No — every daily here is our own, generated fresh each morning, so
                      playing never spoils (or copies) anyone else&apos;s puzzle. The solvers
                      can load today&apos;s NYT Spelling Bee, Letter Boxed, and Strands where
                      noted.
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-300 font-medium">
                      What do Easy, Hard and Extreme change?
                    </p>
                    <p>
                      They&apos;re three separate puzzles each day, not one puzzle with a
                      setting — each difficulty keeps its own progress, statistics,
                      streaks and leaderboards, and you can play all three. What changes
                      depends on the game: Guess, Scramble, Hive and Boxed draw their
                      answers from progressively less common words; Squares and Weave
                      grow their boards; Grid keeps its dice and widens what scores.
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-300 font-medium">Which words count?</p>
                    <p>
                      Each difficulty is scored against its own word list — Easy is
                      everyday English, Hard adds the less common words, Extreme takes
                      nearly everything. What a puzzle <em>accepts</em> is deliberately
                      one size more generous than the list its <em>answers</em> come
                      from, so the answer is always something you might recognise while
                      your long shots get the benefit of the doubt. The solvers use the
                      same three lists under the same names, so a word the solver finds
                      at Hard is a word Hard accepts.
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-300 font-medium">
                      Why was my word rejected?
                    </p>
                    <p>
                      The lists are built from open dictionaries (SCOWL and friends —
                      see Legal for credits), lowercase letters only: no proper nouns,
                      no hyphens or apostrophes, no accents. Nothing is checked against
                      any publisher&apos;s list, so our Hive and the NYT&apos;s bee will
                      disagree at the margins. If a real word is missing, open an issue
                      — the lists do get amended.
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-300 font-medium">
                      Do you filter offensive words?
                    </p>
                    <p>
                      From what we publish, yes: no puzzle will hand you a slur as its
                      answer. From what you type, no — refusing to publish a word and
                      refusing to accept one you played are different things, and only
                      the first is ours to decide.
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-300 font-medium">Do I need an account?</p>
                    <p>
                      No. Everything works without one. Signing in carries your
                      statistics <em>and</em> today&apos;s unfinished puzzles between
                      devices — start on a phone, finish on a laptop, and a daily you
                      have already played won&apos;t come back as a fresh board
                      somewhere else. Without an account each browser keeps its own
                      separate progress, which can look like syncing until you compare
                      two of them. The site-wide daily numbers (&quot;across all
                      registered players&quot;) accumulate only from signed-in accounts.
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-300 font-medium">Where does my data live?</p>
                    <p>
                      In your browser. Solving never leaves your device; if you sign in,
                      your completed games sync to your account.
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-300 font-medium">When do new dailies arrive?</p>
                    <p>About 15 minutes after 3:00&nbsp;a.m. Eastern, every day.</p>
                  </div>
                  <div>
                    <p className="text-slate-300 font-medium">
                      How do I report something?
                    </p>
                    <p>
                      <ReportMenu
                        context={{
                          game: FEED_NAME[mode],
                          gameLabel: GAME_NAME[mode].full,
                          date: dateByMode[mode],
                          level,
                        }}
                        label="Report a problem"
                        showIcon={false}
                        className="font-medium text-amber-300 hover:text-amber-200 underline underline-offset-2"
                      />{' '}
                      at the bottom of any page. It covers a puzzle with something offensive on
                      it, a display name, a privacy concern, a broken page, and anything
                      else. You don&apos;t need an account, and for a puzzle or a player
                      there is nothing to copy out — we look the board or the name up
                      ourselves, so all you need to say is what&apos;s wrong with it.
                    </p>
                    <p className="mt-2">
                      You get a reference back. Keep it and{' '}
                      <a
                        href="/report"
                        className="text-amber-300 hover:text-amber-200 underline underline-offset-2"
                      >
                        look it up any time
                      </a>{' '}
                      to see whether it&apos;s still open and what was decided. Leave an
                      email address as well and we&apos;ll write to you when it&apos;s
                      dealt with.
                    </p>
                    <p className="mt-2">
                      That address is used for those two emails and nothing else. It
                      isn&apos;t attached to the report anyone reads — not on the page
                      where reports get handled, and not in the daily summary, which says
                      only that somebody asked to be told — and it&apos;s deleted once the
                      outcome has gone out. Nothing else about a reporter is stored at
                      all: even the limits on how many reports we take are counted per
                      reported thing rather than per person, so there is nothing to count
                      you by.
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-300 font-medium">
                      I&apos;ve found a security problem.
                    </p>
                    <p>
                      Please don&apos;t open a public issue for it.{' '}
                      <a
                        href="https://github.com/rptetzloff/anagrimoire/security/advisories/new"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-amber-300 hover:text-amber-200 underline underline-offset-2"
                      >
                        Open a private security advisory
                      </a>{' '}
                      — it stays private while it&apos;s being fixed and carries a
                      disclosure process with it. If you&apos;d rather not use GitHub,
                      the report form above has a security option and needs no account.
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-300 font-medium">
                      Found a bug, or have an idea?
                    </p>
                    <p>
                      <a
                        href="https://github.com/rptetzloff/anagrimoire/issues"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-amber-300 hover:text-amber-200 underline underline-offset-2"
                      >
                        Open an issue on GitHub
                      </a>{' '}
                      — reports and suggestions are both welcome. The report form works
                      too if you&apos;d rather not have an account.
                    </p>
                  </div>
                </div>
              </div>

              <p>
                The code is free and open-source, released under the{' '}
                <a
                  href="https://github.com/rptetzloff/anagrimoire/blob/main/LICENSE"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-300 hover:text-amber-200 underline underline-offset-2"
                >
                  MIT License
                </a>{' '}
                and lives on{' '}
                <a
                  href="https://github.com/rptetzloff/anagrimoire"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-300 hover:text-amber-200 underline underline-offset-2"
                >
                  GitHub
                </a>
                .
              </p>

              <p>
                Also by me:{' '}
                <a
                  href="https://wordlock.net"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-300 hover:text-amber-200 underline underline-offset-2"
                >
                  wordlock.net
                </a>
                , a password generator.
              </p>

              <p className="text-slate-500 text-xs">
                Vibe-coded with{' '}
                <a
                  href="https://claude.com/claude-code"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-slate-300 underline underline-offset-2"
                >
                  Claude
                </a>
                .
              </p>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* legal, privacy & licenses modal */}
      {legalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={closeOverlay}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Legal and licenses"
            ref={legalRef}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-slate-900 border border-white/10 text-left shadow-2xl"
          >
            {/* outside the scroll — the privacy policy is the longest thing on
                the site, and losing the close button partway down it is grim */}
            <button
              onClick={closeOverlay}
              aria-label="Close"
              className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-lg bg-slate-900/95 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="overflow-y-auto p-6 sm:p-8">
            <h2 className="text-xl font-bold mb-4">Legal</h2>

            <div className="inline-flex flex-wrap rounded-xl bg-white/5 border border-white/10 p-1 gap-1 mb-5">
              {(
                [
                  ['notices', 'Notices'],
                  ['privacy', 'Privacy'],
                  ['terms', 'Terms'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => openOverlay({ kind: 'legal', doc: id })}
                  aria-current={legalTab === id ? 'page' : undefined}
                  className={`px-4 h-9 rounded-lg text-sm font-semibold transition-colors
                    ${legalTab === id
                      ? 'bg-accent text-slate-950'
                      : 'text-slate-300 hover:bg-white/10'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {legalTab === 'privacy' && <PrivacyPolicy />}
            {legalTab === 'terms' && <Terms />}

            <div className={`space-y-5 text-sm text-slate-300 ${legalTab === 'notices' ? '' : 'hidden'}`}>
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Disclaimer
                </h3>
                <p className="text-slate-400">
                  Anagrimoire is an independent project. It is not affiliated with,
                  endorsed by, or sponsored by The New York Times Company (Wordle, Spelling
                  Bee, Letter Boxed, Strands), Hasbro or Mattel (Scrabble, Boggle), Tribune Content Agency (Jumble), or any
                  other puzzle publisher. All game names and trademarks are the property of
                  their respective owners and are used here only to describe the kinds of
                  puzzles this tool can help with.
                </p>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Word lists
                </h3>
                <ul className="space-y-1.5 text-slate-400 list-disc list-inside">
                  <li>
                    All three word lists — Easy, Hard and Extreme — are built from{' '}
                    <a
                      href="https://github.com/jacksonrayhamilton/wordlist-english"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-300/90 hover:text-amber-200 underline underline-offset-2"
                    >
                      wordlist-english
                    </a>{' '}
                    (MIT) and, for the largest tier, from{' '}
                    <a
                      href="http://wordlist.aspell.net/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-300/90 hover:text-amber-200 underline underline-offset-2"
                    >
                      SCOWL
                    </a>{' '}
                    itself © Kevin Atkinson — each difficulty cuts deeper into
                    SCOWL&apos;s frequency sizes (55, 70, 80), and every word a game
                    asks or accepts comes from these.
                  </li>
                  <li>
                    Words we won&apos;t use as puzzle answers are drawn from the{' '}
                    <a
                      href="https://github.com/en-wl/wordlist"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-300/90 hover:text-amber-200 underline underline-offset-2"
                    >
                      English Speller Database
                    </a>{' '}
                    © 2000–2026 Kevin Atkinson, which marks offensive and vulgar
                    words, and from the{' '}
                    <a
                      href="https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-300/90 hover:text-amber-200 underline underline-offset-2"
                    >
                      LDNOOBW list
                    </a>{' '}
                    (CC BY 4.0). They filter what we publish, never what
                    you&apos;re allowed to type — though the word lists
                    themselves contain no slurs, at any tier.
                  </li>
                  <li>
                    Word categories in our shared data files come from{' '}
                    <a
                      href="https://wordnet.princeton.edu/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-300/90 hover:text-amber-200 underline underline-offset-2"
                    >
                      WordNet
                    </a>
                    &reg; © Princeton University, used under the{' '}
                    <a
                      href="https://wordnet.princeton.edu/license-and-commercial-use"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-300/90 hover:text-amber-200 underline underline-offset-2"
                    >
                      WordNet License
                    </a>
                    . They label words (animal, food, plant&hellip;) and never
                    decide what a puzzle asks or accepts.
                  </li>
                </ul>
                <p className="mt-2 text-xs text-slate-500">
                  No word list is guaranteed to match any game&apos;s official dictionary.
                </p>
              </div>

              {/* Both fonts are bundled with the site rather than fetched, so the
                  site is what redistributes them, and the OFL asks that they
                  travel with their notice. Inter went uncredited until
                  Fraunces arrived and the gap was looked for. */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Typefaces
                </h3>
                <p className="text-slate-400">
                  Text is set in Inter (© 2016 The Inter Project Authors) and the name
                  in Fraunces (© 2020 The Fraunces Project Authors), both served from this
                  site under the{' '}
                  <a
                    href="https://openfontlicense.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-300 hover:text-amber-200 underline underline-offset-2"
                  >
                    SIL Open Font License 1.1
                  </a>
                  .
                </p>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  License
                </h3>
                <p className="text-slate-400">
                  The site&apos;s code is released under the{' '}
                  <a
                    href="https://github.com/rptetzloff/anagrimoire/blob/main/LICENSE"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-300 hover:text-amber-200 underline underline-offset-2"
                  >
                    MIT License
                  </a>
                  .
                </p>
              </div>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* on-screen keyboard */}
      {kbOpen ? (
        <div className="fixed bottom-16 md:bottom-0 inset-x-0 z-50 bg-slate-900/95 backdrop-blur border-t border-white/10 px-2 pt-3 pb-4">
          <button
            onClick={() => setKbOpen(false)}
            aria-label="Hide keyboard"
            className="absolute -top-11 right-3 w-9 h-9 flex items-center justify-center rounded-full bg-slate-800 border border-white/15 text-slate-400 hover:text-white hover:bg-slate-700 hover:border-white/30 shadow-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="w-full max-w-md mx-auto flex flex-col gap-1.5">
            {[
              'qwertyuiop'.split(''),
              'asdfghjkl'.split(''),
              [
                ...(playActive || learnMode ? ['enter'] : []),
                ...(mode === 'descramble' ? ['?'] : []),
                ...'zxcvbnm'.split(''),
                'backspace',
              ],
            ].map((row, r) => (
              <div key={r} className={`flex w-full gap-1 sm:gap-1.5 ${r === 1 ? 'px-[4.5%]' : ''}`}>
                {row.map((k) => {
                  const state = playActive && /^[a-z]$/.test(k) ? letterStates[k] : undefined;
                  const tone =
                    state === 'correct'
                      ? 'bg-emerald-500/80 hover:bg-emerald-500 text-white'
                      : state === 'present'
                        ? 'bg-amber-400/80 hover:bg-amber-400 text-ink'
                        : state === 'absent'
                          ? 'bg-white/[0.04] hover:bg-white/10 text-slate-600'
                          : 'bg-white/10 hover:bg-white/20 active:bg-white/30 text-white';
                  return (
                    <button
                      key={k}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pressKey(k)}
                      aria-label={k === 'backspace' ? 'Backspace' : k === 'enter' ? 'Enter' : `Key ${k}`}
                      className={`h-11 min-w-0 rounded-md text-sm font-semibold uppercase transition-colors flex items-center justify-center ${tone}
                        ${k === 'backspace' || k === 'enter' ? 'flex-[1.5]' : 'flex-1'}`}
                    >
                      {k === 'backspace' ? (
                        <Delete className="w-4 h-4" />
                      ) : k === 'enter' ? (
                        <CornerDownLeft className="w-4 h-4" />
                      ) : (
                        k
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setKbOpen(true)}
          aria-label="Show keyboard"
          title="Show on-screen keyboard"
          className="fixed bottom-20 md:bottom-4 right-4 z-50 w-12 h-12 flex items-center justify-center rounded-full bg-slate-800 border border-white/15 text-slate-300 hover:text-white hover:bg-slate-700 hover:border-white/30 shadow-lg transition-colors"
        >
          <Keyboard className="w-5 h-5" />
        </button>
      )}
    </div>
    </OskContext.Provider>
    </PrefsContext.Provider>
    </PaletteContext.Provider>
  );
}

export default App;
