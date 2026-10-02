import type { ComponentProps, ComponentType } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import Archive from 'lucide-react-native/icons/archive';
import Bell from 'lucide-react-native/icons/bell';
import Book from 'lucide-react-native/icons/book';
import Briefcase from 'lucide-react-native/icons/briefcase';
import Check from 'lucide-react-native/icons/check';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Download from 'lucide-react-native/icons/download';
import Ellipsis from 'lucide-react-native/icons/ellipsis';
import EyeOff from 'lucide-react-native/icons/eye-off';
import File from 'lucide-react-native/icons/file';
import FileText from 'lucide-react-native/icons/file-text';
import Folder from 'lucide-react-native/icons/folder';
import Heart from 'lucide-react-native/icons/heart';
import House from 'lucide-react-native/icons/house';
import Image from 'lucide-react-native/icons/image';
import Inbox from 'lucide-react-native/icons/inbox';
import Lightbulb from 'lucide-react-native/icons/lightbulb';
import MessageSquare from 'lucide-react-native/icons/message-square';
import Mic from 'lucide-react-native/icons/mic';
import Paperclip from 'lucide-react-native/icons/paperclip';
import PawPrint from 'lucide-react-native/icons/paw-print';
import Pin from 'lucide-react-native/icons/pin';
import Play from 'lucide-react-native/icons/play';
import Plus from 'lucide-react-native/icons/plus';
import Search from 'lucide-react-native/icons/search';
import Sheet from 'lucide-react-native/icons/sheet';
import Square from 'lucide-react-native/icons/square';
import SquareCheckBig from 'lucide-react-native/icons/square-check-big';
import Star from 'lucide-react-native/icons/star';
import StickyNote from 'lucide-react-native/icons/sticky-note';
import User from 'lucide-react-native/icons/user';
import X from 'lucide-react-native/icons/x';

import { useTheme } from '@/components/theme-provider';

export type IconName = ComponentProps<typeof Ionicons>['name'];
type DrawnIcon = ComponentType<{ size?: number; color?: string; fill?: string; strokeWidth?: number; strokeLinecap?: 'round'; strokeLinejoin?: 'round' }>;

// Ionicons glyph → the stroke-drawn equivalent Sticky uses. `filled` mirrors
// Ionicons' solid glyphs. Anything not listed keeps its Ionicons glyph.
const DRAWN: Partial<Record<IconName, { icon: DrawnIcon; filled?: boolean }>> = {
  'add': { icon: Plus },
  'archive-outline': { icon: Archive },
  'attach': { icon: Paperclip }, 'attach-outline': { icon: Paperclip },
  'book-outline': { icon: Book },
  'briefcase-outline': { icon: Briefcase },
  'bulb-outline': { icon: Lightbulb },
  'chatbox': { icon: MessageSquare, filled: true },
  'checkbox': { icon: SquareCheckBig }, 'checkbox-outline': { icon: SquareCheckBig },
  'checkmark': { icon: Check },
  'chevron-back': { icon: ChevronLeft }, 'chevron-forward': { icon: ChevronRight },
  'close': { icon: X }, 'close-outline': { icon: X },
  'document-outline': { icon: File }, 'document-text-outline': { icon: FileText },
  'download-outline': { icon: Download },
  'ellipsis-horizontal': { icon: Ellipsis },
  'eye-off-outline': { icon: EyeOff },
  'file-tray-outline': { icon: Inbox },
  'folder-outline': { icon: Folder },
  'grid-outline': { icon: Sheet },
  'heart-outline': { icon: Heart },
  'home-outline': { icon: House },
  'image-outline': { icon: Image },
  'mic': { icon: Mic },
  'notifications-outline': { icon: Bell },
  'paw-outline': { icon: PawPrint },
  'person-outline': { icon: User },
  'pin': { icon: Pin, filled: true }, 'pin-outline': { icon: Pin },
  'play': { icon: Play, filled: true },
  'reader-outline': { icon: StickyNote },
  'search-outline': { icon: Search },
  'square-outline': { icon: Square },
  'star-outline': { icon: Star },
};

/**
 * An icon in the active style: the Ionicons glyph under Classic (unchanged),
 * a stroke-drawn one at the style's stroke width with round caps and joins
 * under Sticky. Decorative by default, like every icon beside a label here.
 */
export function Icon({ name, size, color, accessible = false }: { name: IconName; size: number; color: string; accessible?: boolean }) {
  const { styleTokens } = useTheme();
  const drawn = styleTokens.iconStroke > 0 ? DRAWN[name] : undefined;
  if (!drawn) return <Ionicons accessible={accessible} name={name} size={size} color={color} />;
  const Drawn = drawn.icon;
  return <Drawn size={size} color={color} fill={drawn.filled ? color : 'none'} strokeWidth={styleTokens.iconStroke} strokeLinecap="round" strokeLinejoin="round" />;
}
