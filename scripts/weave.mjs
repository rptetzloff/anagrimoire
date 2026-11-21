// Weave (Strands-style) puzzle generator: picks a theme, selects member
// words whose lengths exactly tile the board alongside the spangram, and
// packs every word as a self-avoiding adjacency path covering all cells.
// Fully deterministic for a given rng.
import { shuffled } from './shuffle.mjs';

function neighborsOf(rows, cols) {
  const out = [];
  for (let i = 0; i < rows * cols; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const adj = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr;
        const cc = c + dc;
        if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) adj.push(rr * cols + cc);
      }
    }
    out.push(adj);
  }
  return out;
}


// random subset of words whose lengths sum to target (each word 4-10 letters)
function pickSubset(words, target, rng) {
  const pool = shuffled(words, rng);
  // DP over achievable sums, then reconstruct greedily in pool order
  const reachable = [new Set([0])];
  for (let i = 0; i < pool.length; i++) {
    const prev = reachable[i];
    const next = new Set(prev);
    for (const s of prev) {
      if (s + pool[i].length <= target) next.add(s + pool[i].length);
    }
    reachable.push(next);
  }
  if (!reachable[pool.length].has(target)) return null;
  const chosen = [];
  let remaining = target;
  for (let i = pool.length - 1; i >= 0; i--) {
    // prefer taking the word when possible, randomly skipping for variety
    const canTake = remaining - pool[i].length >= 0 && reachable[i].has(remaining - pool[i].length);
    const canSkip = reachable[i].has(remaining);
    if (canTake && (!canSkip || rng() < 0.6)) {
      chosen.push(pool[i]);
      remaining -= pool[i].length;
    }
  }
  return remaining === 0 ? chosen : null;
}

// random self-avoiding path of `len` cells over empty cells, starting at `start`
function randomPath(start, len, occupied, NB, rng, mustTouch = null) {
  const path = [start];
  const used = new Set([start]);
  const step = () => {
    if (path.length === len) {
      if (mustTouch && !path.some(mustTouch)) return false;
      return true;
    }
    const options = shuffled(NB[path[path.length - 1]], rng).filter(
      (n) => !occupied[n] && !used.has(n)
    );
    for (const n of options) {
      path.push(n);
      used.add(n);
      if (step()) return true;
      path.pop();
      used.delete(n);
    }
    return false;
  };
  return step() ? path : null;
}

// every empty region must be tileable by some subset of the remaining lengths
function regionsOk(occupied, NB, lengths) {
  const seen = new Array(occupied.length).fill(false);
  const sizes = [];
  for (let i = 0; i < occupied.length; i++) {
    if (occupied[i] || seen[i]) continue;
    let size = 0;
    const stack = [i];
    seen[i] = true;
    while (stack.length) {
      const p = stack.pop();
      size++;
      for (const n of NB[p]) {
        if (!occupied[n] && !seen[n]) {
          seen[n] = true;
          stack.push(n);
        }
      }
    }
    sizes.push(size);
  }
  // each region individually must be a reachable sum of remaining lengths
  for (const size of sizes) {
    const reach = new Set([0]);
    for (const len of lengths) {
      for (const s of [...reach]) if (s + len <= size) reach.add(s + len);
    }
    if (!reach.has(size)) return false;
  }
  return true;
}

export function generateWeave(rng, cols, rows, themes, budget = { nodes: 0 }) {
  const cells = rows * cols;
  const NB = neighborsOf(rows, cols);
  const touchesLeft = (i) => i % cols === 0;
  const touchesRight = (i) => i % cols === cols - 1;

  for (const theme of shuffled(themes, rng)) {
    const spangram = theme.spangram;
    if (!/^[a-z]{6,16}$/.test(spangram) || spangram.length < cols) continue;
    const members = [...new Set(theme.words)].filter(
      (w) => /^[a-z]{4,10}$/.test(w) && w !== spangram
    );

    for (let attempt = 0; attempt < 40; attempt++) {
      const subset = pickSubset(members, cells - spangram.length, rng);
      if (!subset) continue;

      const occupied = new Array(cells).fill('');
      // spangram: start on the left edge, must touch the right edge
      const starts = shuffled(
        [...Array(rows).keys()].map((r) => r * cols),
        rng
      );
      let spanPath = null;
      for (const s of starts) {
        spanPath = randomPath(s, spangram.length, occupied, NB, rng, touchesRight);
        if (spanPath) break;
      }
      if (!spanPath) continue;
      for (let k = 0; k < spanPath.length; k++) occupied[spanPath[k]] = spangram[k];

      // pack the remaining words; each new word's path must cover the first
      // empty cell with its first or last letter
      const placed = [];
      let nodes = 0;
      const NODE_BUDGET = 250000;
      const fill = (remaining) => {
        if (nodes++ > NODE_BUDGET) return false;
        if (!remaining.length) return true;
        if (!regionsOk(occupied, NB, remaining.map((w) => w.length))) return false;
        const firstEmpty = occupied.findIndex((c) => c === '');
        for (let wi = 0; wi < remaining.length; wi++) {
          const word = remaining[wi];
          const rest = remaining.filter((_, j) => j !== wi);
          for (const spelling of word === [...word].reverse().join('') ? [word] : [word, [...word].reverse().join('')]) {
            for (let tries = 0; tries < 60; tries++) {
              if (nodes++ > NODE_BUDGET) return false;
              const path = randomPath(firstEmpty, word.length, occupied, NB, rng);
              if (!path) break;
              for (let k = 0; k < path.length; k++) occupied[path[k]] = spelling[k];
              placed.push({ w: word, path: spelling === word ? path : [...path].reverse() });
              if (fill(rest)) return true;
              placed.pop();
              for (const p of path) occupied[p] = '';
            }
          }
        }
        return false;
      };

      if (fill(shuffled(subset, rng))) {
        budget.nodes = nodes;
        const board = [];
        for (let r = 0; r < rows; r++) board.push(occupied.slice(r * cols, (r + 1) * cols).join(''));
        return {
          clue: theme.clue,
          board,
          spangram: { w: spangram, path: spanPath },
          words: placed,
        };
      }
      for (const p of spanPath) occupied[p] = '';
    }
  }
  return null;
}
