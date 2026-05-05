import {
  Pen, PencilLine, Pencil, PenOff, SquarePen, LucideIcon,
  NotebookPen, PencilOff, PenLine, PencilRuler, BookCheck,
  BookPlus, Search, BookOpenCheck, Eye, Ruler, Bookmark,
  NotebookText, BookmarkCheck, ALargeSmall, Brush,
  Save, SearchCheck, Send, CircleX, SpellCheck, SpellCheck2,
  UserRoundCheck, Languages, Globe, BookType, MessageCircleMore,
  ChevronsUp, MessageSquareQuote, MessageCirclePlus, Sigma,
  X, Infinity, Expand, Shrink, CaseSensitive, Replace, RotateCcw,
  Diff, Circle, CircleCheck, Lightbulb, CircleHelp
} from 'lucide-preact';
import { h } from 'preact';

interface IconProps {
  name: string;
  color?: string;
  size?: string | number;
}

// Helper to render lucide-preact icons as valid JSX elements
// lucide-preact icons return ComponentChildren which is not compatible with react-jsx mode
function IconElement({ icon: IconComponent, color, size }: { icon: LucideIcon; color?: string; size?: string | number }) {
  return h(IconComponent, { color, size });
}

export const Icon = ({ name, color, size }: IconProps) => {
  const LucideIcon = name in iconsMap ? iconsMap[name] : Pen;

  return <IconElement icon={LucideIcon} color={color} size={size} />;
};


export const iconsMap: { [key: string]: LucideIcon } = {
  'pen': Pen,
  'pen-off': PenOff,
  'pen-line': PenLine,
  'square-pen': SquarePen,
  'pencil': Pencil,
  'pencil-off': PencilOff,
  'pencil-line': PencilLine,
  'pencil-ruler': PencilRuler,
  'notebook-pen': NotebookPen,
  'notebook-text': NotebookText,
  'book-plus': BookPlus,
  'book-check': BookCheck,
  'book-open-check': BookOpenCheck,
  'ruler': Ruler,
  'bookmark': Bookmark,
  'bookmark-check': BookmarkCheck,
  'eye': Eye,
  'search': Search,
  'a-large-small': ALargeSmall,
  'brush': Brush,
  'save': Save,
  'search-check': SearchCheck,
  'send': Send,
  'circle-x': CircleX,
  'spell-check': SpellCheck,
  'spell-check-2': SpellCheck2,
  'user-round-check': UserRoundCheck,
  'languages': Languages,
  'globe': Globe,
  'book-type': BookType,
  'message-circle-more': MessageCircleMore,
  'chevrons-up': ChevronsUp,
  'message-square-quote': MessageSquareQuote,
  'message-circle-plus': MessageCirclePlus,
  'sigma': Sigma,
  'x': X,
  'infinity': Infinity,
  'expand': Expand,
  'shrink': Shrink,
  'case-sensitive': CaseSensitive,
  'replace': Replace,
  'rotate-ccw': RotateCcw,
  'diff': Diff,
  'circle': Circle,
  'circle-check': CircleCheck,
  'lightbulb': Lightbulb,
  'circle-help': CircleHelp
}

export const icons = Object.keys(iconsMap).sort();

// Helper function to render any lucide icon as a valid JSX element
export function renderIcon(IconComponent: LucideIcon, props?: { color?: string; size?: string | number }) {
  return h(IconComponent, props);
}
