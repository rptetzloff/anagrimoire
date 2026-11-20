// A row of cards that scrolls sideways, from Amherst Games (and OpenLarder before it): cards snap into
// place, an arrow at each end while there is further to go that way, a fade
// on the right while more remains, and the arrow keys move it once it has
// focus. A finger scrolls it on a phone, so the arrows are for a mouse.
//
// No scrollbar under the cards: the arrows, a finger, a trackpad or the arrow
// keys move it, and the fade says there is more.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const ARROW =
  'absolute top-1/2 -translate-y-1/2 z-10 hidden [@media(hover:hover)_and_(pointer:fine)]:inline-flex ' +
  'items-center justify-center w-10 h-10 rounded-full border border-white/20 bg-slate-900 text-slate-200 ' +
  'shadow-lg hover:border-white/50';

export default function ScrollRow({ label, children }: { label: string; children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 1);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    measure();
    const el = scroller.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    // the cards inside change width too, when the text size does
    for (const child of Array.from(el.children)) watch.observe(child);
    return () => watch.disconnect();
  }, [measure, children]);

  // Most of a visible page, so the card at the edge stays in view; at once
  // when the device asks for no motion.
  const page = (direction: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: still ? 'auto' : 'smooth' });
  };

  return (
    <div className="relative">
      {canLeft && (
        <button type="button" className={`${ARROW} -left-4`} aria-label={`Scroll ${label} left`} onClick={() => page(-1)}>
          <ChevronLeft className="w-5 h-5" aria-hidden="true" />
        </button>
      )}
      <div
        ref={scroller}
        role="group"
        aria-label={label}
        tabIndex={0}
        onScroll={measure}
        onKeyDown={(e) => {
          // Taken here rather than left to bubble: some boards read the
          // arrow keys, and inside this row they mean this.
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            e.stopPropagation();
            page(e.key === 'ArrowRight' ? 1 : -1);
          }
        }}
        // While more remains to the right it fades out there (.fade-right in
        // index.css: a mask, so it fades into whatever is behind it).
        className={`overflow-x-auto snap-x snap-mandatory scroll-pl-1 p-1 -m-1 rounded-xl
                   [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${canRight ? 'fade-right' : ''}`}
      >
        <ul className="flex gap-3">{children}</ul>
      </div>
      {canRight && (
        <button type="button" className={`${ARROW} -right-4`} aria-label={`Scroll ${label} right`} onClick={() => page(1)}>
          <ChevronRight className="w-5 h-5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** One card's place in a ScrollRow: a fixed width, snapping to the start --
 *  or `width` for a row in a narrow column, where a card is most of it and the
 *  next one peeks in. */
export function RowItem({ children, width = 'w-[17rem] sm:w-80' }: { children: ReactNode; width?: string }) {
  return <li className={`snap-start shrink-0 ${width}`}>{children}</li>;
}
