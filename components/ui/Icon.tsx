import {
  ArrowRightLeft,
  AudioLines,
  BookCheck,
  Calendar,
  ChartLine,
  Check,
  ChevronDown,
  Menu,
  ChartPie,
  ClipboardPen,
  Cog,
  Expand,
  Files,
  Funnel,
  Handshake,
  Inbox,
  ListFilter,
  LogOut,
  Mail,
  Map,
  Pause,
  Percent,
  Play,
  Plus,
  Search,
  Square,
  Star,
  Trash2,
  UserStar,
  Users,
  X,
} from 'lucide-react';

/**
 * Every icon in the Figma file is a Lucide glyph, so the whole set resolves to
 * `lucide-react` with no hand-inlined SVG.
 *
 * Figma draws them on a 16x16 frame with a 1.3333px stroke, which is exactly
 * Lucide's 24-unit viewBox at `strokeWidth={2}` scaled to 16 — so the default
 * stroke width reproduces the design without adjustment. The one exception is
 * the 10x10 `user-star` in the profile block, whose 1px stroke needs an explicit
 * `strokeWidth` (see `NavProfile`).
 */
const ICONS = {
  'arrow-right-left': ArrowRightLeft,
  'audio-lines': AudioLines,
  'book-check': BookCheck,
  calendar: Calendar,
  'chart-line': ChartLine,
  // `check` and `menu` are not in the Figma file; they belong to the Sort /
  // Filter menus and the narrow-viewport navigation button, which the design
  // does not draw.
  check: Check,
  // A row that opens in place gets a chevron that turns. `expand` reads as
  // "this goes somewhere else", which is what it was wrongly saying.
  'chevron-down': ChevronDown,
  menu: Menu,
  'chart-pie': ChartPie,
  'clipboard-pen': ClipboardPen,
  cog: Cog,
  expand: Expand,
  files: Files,
  funnel: Funnel,
  handshake: Handshake,
  inbox: Inbox,
  'list-filter': ListFilter,
  'log-out': LogOut,
  mail: Mail,
  map: Map,
  // `pause` and `plus` belong to the recording transport and the tag picker,
  // neither of which the design draws in an interactive state.
  pause: Pause,
  percent: Percent,
  play: Play,
  plus: Plus,
  search: Search,
  square: Square,
  star: Star,
  trash: Trash2,
  'user-star': UserStar,
  users: Users,
  x: X,
} as const;

export type IconName = keyof typeof ICONS;

interface IconProps {
  readonly name: IconName;
  /** Rendered size in px. Figma uses 16 everywhere except the profile badge. */
  readonly size?: number;
  /** Stroke width in Lucide viewBox units. 2 yields 1.333px at size 16. */
  readonly strokeWidth?: number;
  readonly className?: string;
}

export function Icon({ name, size = 16, strokeWidth = 2, className }: IconProps) {
  const Glyph = ICONS[name];

  return (
    <Glyph
      aria-hidden
      focusable={false}
      width={size}
      height={size}
      strokeWidth={strokeWidth}
      className={className}
    />
  );
}
