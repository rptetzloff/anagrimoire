import { GAME_NAME } from '@/games';
import KeyDiagram from '@/KeyDiagram';
import type { Mode, NavKeys } from '@/storage';
import PageWithRail from '@/PageWithRail';

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.75rem] h-6 px-1.5 rounded-md bg-white/10 border border-white/20 text-[0.6875rem] font-mono font-semibold text-slate-200 whitespace-nowrap">
      {children}
    </kbd>
  );
}

function Row({ keys, children }: { keys: React.ReactNode[]; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="flex flex-wrap gap-1 shrink-0 w-[8.5rem]">
        {keys.map((k, i) => (
          <Key key={i}>{k}</Key>
        ))}
      </span>
      <span className="text-sm text-slate-400 flex-1">{children}</span>
    </div>
  );
}

// the games that take typed words — Weave is traced, not typed
const TYPING_MODES: Mode[] = ['pattern', 'descramble', 'bee', 'boxed', 'grid'];
const TYPING_GAMES: { id: Mode; label: string }[] = TYPING_MODES.map((id) => ({
  id,
  label: GAME_NAME[id].full,
}));
function listOf(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-accent uppercase tracking-wider mb-1.5">
        {title}
      </h3>
      {children}
    </div>
  );
}

export default function KeysPage({
  navKeys,
  shownModes,
}: {
  navKeys: NavKeys;
  shownModes: Mode[];
}) {
  const typingGames = TYPING_GAMES.filter((g) => shownModes.includes(g.id)).map((g) => g.label);

  return (
    <PageWithRail section="Me" title="Keyboard controls" blurb="Everything here is playable without a mouse.">

        <div className="space-y-5">
          <Section title="Getting around">
            <Row keys={['Tab', '⇧ Tab']}>
              Move between controls. The very first Tab offers “Skip to content”, which
              jumps past the bar at the top to the page.
            </Row>
            <Row keys={['Enter', 'Space']}>Activate the focused button.</Row>
            <Row keys={['Esc']}>Close whichever dialog is open.</Row>
          </Section>

          {/* naming a game that's been hidden sends people looking for it */}
          {typingGames.length > 0 && (
            <Section title="Typing games">
              <p className="text-xs text-slate-500 mb-1">
                {listOf(typingGames)}{' '}
                {typingGames.length === 1 ? 'takes' : typingGames.length === 2 ? 'both take' : 'all take'}{' '}
                typed words.
              </p>
              <Row keys={['A – Z']}>Add a letter to the current word.</Row>
              <Row keys={['Enter']}>Submit it.</Row>
              <Row keys={['⌫']}>
                {shownModes.includes('boxed')
                  ? 'Delete the last letter — in Boxed, once the word is empty this un-commits the previous word so you can rework the chain.'
                  : 'Delete the last letter.'}
              </Row>
            </Section>
          )}

          {/* the only game with a board cursor — pointless reading if it's
              been hidden */}
          {shownModes.includes('weave') && (
          <Section title="Weave board">
            <p className="text-xs text-slate-500 mb-2">
              Tab to the board — it&apos;s a single stop — then steer a cursor. Each cell
              you can reach shows its key in the corner.
            </p>
            <div className="flex items-start gap-3 mb-1">
              <KeyDiagram scheme={navKeys} />
              <span className="text-sm text-slate-400 flex-1">
                Move the cursor, diagonals included. Swap this ring between the number pad
                and <span className="font-mono">Q W E / A D / Z S X</span> in Settings.
              </span>
            </div>
            <Row keys={['↑', '↓', '←', '→']}>Move the cursor straight, in any scheme.</Row>
            <Row keys={['Enter']}>
              Start a word at the cursor, then submit it once it&apos;s three letters or
              more.
            </Row>
            <Row keys={['⌫']}>
              Step back one cell. Moving back onto the previous cell does the same.
            </Row>
            <Row keys={['Esc']}>Clear the word you&apos;re tracing and start over.</Row>
          </Section>
          )}

          <Section title="On-screen keyboard">
            <p className="text-sm text-slate-400">
              The keyboard button in the bottom-right corner opens a tappable keyboard,
              handy on a phone or when a physical one isn&apos;t around. While it&apos;s
              open, the device&apos;s own keyboard stays out of the way.
            </p>
          </Section>
        </div>
    </PageWithRail>
  );
}
