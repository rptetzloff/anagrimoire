// Shuffling, for the generator. src/shuffle.ts is the browser's copy -- the
// two sides keep their own modules (see src/squares.ts) and agree on the rule.
//
// Every shuffle here used to be arr.sort(() => rng() - 0.5). That is not a
// shuffle: a comparator that answers at random gives an order biased toward
// the one it started from. Measured on a seven-letter word, it left the word
// exactly as it was 2.36% of the time, where a fair shuffle would 0.079% --
// so about one daily Scramble rack in 42, per difficulty, was dealt as its
// own answer. The dev feed for 2026-11-20 dealt "prosper" as p-r-o-s-p-e-r.

/** A fair (Fisher-Yates) shuffle of a copy of `arr`. */
export function shuffled(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Shuffled until `refuse` is false for the result -- for letters dealt to
 *  be unscrambled, until they no longer spell a word, since a rack that reads
 *  as a word hands over the answer, and not only the word it was cut from
 *  (parsley dealt as "players" gives the bonus away just the same). Gives up
 *  after `tries` and returns the last deal, for letters with no other order. */
export function shuffledUntil(arr, refuse, rng, tries = 50) {
  let deal = shuffled(arr, rng);
  for (let t = 1; t < tries && refuse(deal); t++) deal = shuffled(arr, rng);
  return deal;
}
