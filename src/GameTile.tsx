// A game's tile: its icon on its own colour. Decorative -- the game's name is
// always written beside it -- so it is hidden from screen readers.
import { GAME_ICONS, tileColours } from '@/gameTiles';
import type { Slug } from '@/games';

const SIZE = {
  sm: 'w-7 h-7 rounded-md',
  md: 'w-9 h-9 rounded-lg',
  lg: 'w-12 h-12 rounded-xl',
} as const;
const ICON = { sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-6 h-6' } as const;

export default function GameTile({ slug, size = 'md' }: { slug: Slug; size?: keyof typeof SIZE }) {
  const Icon = GAME_ICONS[slug];
  return (
    <span aria-hidden="true" data-tile={slug}
          className={`inline-flex items-center justify-center shrink-0 ${SIZE[size]}`}
          style={tileColours(slug)}>
      <Icon className={ICON[size]} />
    </span>
  );
}
