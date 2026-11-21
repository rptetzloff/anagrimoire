// Shuffling, for the browser. scripts/shuffle.mjs is the generator's copy --
// the two sides keep their own modules (see squares.ts) and agree on the rule.
//
// Every shuffle here used to be arr.sort(() => Math.random() - 0.5). That is
// not a shuffle: a comparator that answers at random gives an order biased
// toward the one it started from. On a seven-letter word it left the word as
// it was 2.36% of the time (a fair shuffle: 0.079%), so a practice rack could
// be dealt as its own answer, and the Shuffle button could leave the letters
// where they were and look broken.

/** A fair (Fisher-Yates) shuffle of a copy of `arr`. */
export function shuffled<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Shuffled until `refuse` is false for the result: letters dealt so they do
 *  not spell a word, or a Shuffle that visibly moves something. Gives up after
 *  `tries` and returns the last deal -- for letters with no other order, such
 *  as a rack of one letter repeated, which would otherwise never return. */
export function shuffledUntil<T>(
  arr: readonly T[],
  refuse: (deal: T[]) => boolean,
  rng: () => number = Math.random,
  tries = 50,
): T[] {
  let deal = shuffled(arr, rng);
  for (let t = 1; t < tries && refuse(deal); t++) deal = shuffled(arr, rng);
  return deal;
}
