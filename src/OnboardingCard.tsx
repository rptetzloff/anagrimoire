import { BookOpen, X } from 'lucide-react';

// A pointer, not a tour. The Learn tab already teaches every game with a board
// you can play, so the only thing missing was anyone knowing it's there. One
// card, on a first visit, naming the game actually on screen — and it doesn't
// come back once it's been dismissed or followed.
export default function OnboardingCard({
  game,
  onLearn,
  onDismiss,
}: {
  game: string;
  onLearn: () => void;
  onDismiss: () => void;
}) {
  return (
    <section
      aria-label="Getting started"
      className="relative mb-7 rounded-2xl bg-emerald-400/10 border border-emerald-400/30 px-4 py-4 sm:px-5 text-left"
    >
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="absolute top-2.5 right-2.5 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-3 pr-8">
        <p className="text-sm text-slate-300 flex-1 min-w-[14rem]">
          <strong className="font-semibold text-white">New here?</strong> Learn walks
          through {game} on a board you can play as you read — no rules to wade
          through first.
        </p>
        <button
          onClick={onLearn}
          className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-accent text-slate-950 hover:brightness-110 transition-colors shrink-0"
        >
          <BookOpen className="w-4 h-4" />
          Show me
        </button>
      </div>
    </section>
  );
}
