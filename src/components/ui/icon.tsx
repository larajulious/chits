import type { ComponentProps, ComponentType } from 'react';
import { View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
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
import GalleryVerticalEnd from 'lucide-react-native/icons/gallery-vertical-end';
import CircleAlert from 'lucide-react-native/icons/circle-alert';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import ArrowDown from 'lucide-react-native/icons/arrow-down';
import ArrowRight from 'lucide-react-native/icons/arrow-right';
import Undo2 from 'lucide-react-native/icons/undo-2';
import ArrowUp from 'lucide-react-native/icons/arrow-up';
import Calendar from 'lucide-react-native/icons/calendar';
import MessageCircle from 'lucide-react-native/icons/message-circle';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import CircleX from 'lucide-react-native/icons/circle-x';
import Compass from 'lucide-react-native/icons/compass';
import Shrink from 'lucide-react-native/icons/shrink';
import Copy from 'lucide-react-native/icons/copy';
import SquarePen from 'lucide-react-native/icons/square-pen';
import Expand from 'lucide-react-native/icons/expand';
import Eye from 'lucide-react-native/icons/eye';
import LayoutGrid from 'lucide-react-native/icons/layout-grid';
import CircleQuestionMark from 'lucide-react-native/icons/circle-question-mark';
import Images from 'lucide-react-native/icons/images';
import Info from 'lucide-react-native/icons/info';
import Layers from 'lucide-react-native/icons/layers';
import List from 'lucide-react-native/icons/list';
import Magnet from 'lucide-react-native/icons/magnet';
import ExternalLink from 'lucide-react-native/icons/external-link';
import Pause from 'lucide-react-native/icons/pause';
import Pencil from 'lucide-react-native/icons/pencil';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import Minus from 'lucide-react-native/icons/minus';
import Settings from 'lucide-react-native/icons/settings';
import Share from 'lucide-react-native/icons/share';
import ArrowLeftRight from 'lucide-react-native/icons/arrow-left-right';
import Trash from 'lucide-react-native/icons/trash';
import Video from 'lucide-react-native/icons/video';
import Volume1 from 'lucide-react-native/icons/volume-1';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';

import { useTheme } from '@/components/theme-provider';

export type IconName = ComponentProps<typeof Ionicons>['name'];
type DrawnIcon = ComponentType<{ size?: number; color?: string; fill?: string; strokeWidth?: number; strokeLinecap?: 'round'; strokeLinejoin?: 'round' }>;

// Ionicons glyph → the stroke-drawn equivalent Sticky uses. `filled` mirrors
// Ionicons' solid glyphs. Anything not listed keeps its Ionicons glyph.
const DRAWN: Partial<Record<IconName, { icon: DrawnIcon; filled?: boolean }>> = {
  'add': { icon: Plus }, 'add-outline': { icon: Plus },
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
  'albums-outline': { icon: GalleryVerticalEnd },
  'alert-circle-outline': { icon: CircleAlert },
  'arrow-back': { icon: ArrowLeft },
  'arrow-back-outline': { icon: ArrowLeft },
  'arrow-down': { icon: ArrowDown },
  'arrow-down-outline': { icon: ArrowDown },
  'arrow-forward-outline': { icon: ArrowRight },
  'arrow-undo-outline': { icon: Undo2 },
  'arrow-up': { icon: ArrowUp },
  'arrow-up-outline': { icon: ArrowUp },
  'calendar-outline': { icon: Calendar },
  'chatbox-outline': { icon: MessageSquare },
  'chatbubble-outline': { icon: MessageCircle },
  'checkmark-circle-outline': { icon: CircleCheck },
  'close-circle': { icon: CircleX },
  'close-circle-outline': { icon: CircleX },
  'compass-outline': { icon: Compass },
  'contract-outline': { icon: Shrink },
  'copy': { icon: Copy },
  'copy-outline': { icon: Copy },
  'create-outline': { icon: SquarePen },
  'expand-outline': { icon: Expand },
  'eye-outline': { icon: Eye },
  'grid': { icon: LayoutGrid },
  'help-circle-outline': { icon: CircleQuestionMark },
  'images': { icon: Images },
  'images-outline': { icon: Images },
  'information-circle-outline': { icon: Info },
  'layers-outline': { icon: Layers },
  'list-outline': { icon: List },
  'magnet-outline': { icon: Magnet },
  'mic-outline': { icon: Mic },
  'open-outline': { icon: ExternalLink },
  'pause': { icon: Pause, filled: true },
  'pencil-outline': { icon: Pencil },
  'refresh': { icon: RefreshCw },
  'remove': { icon: Minus },
  'settings-outline': { icon: Settings },
  'share-outline': { icon: Share },
  'swap-horizontal-outline': { icon: ArrowLeftRight },
  'trash-outline': { icon: Trash },
  'videocam-outline': { icon: Video },
  'volume-medium-outline': { icon: Volume1 },
  'warning-outline': { icon: TriangleAlert },
};

/**
 * An icon in the active style: the Ionicons glyph under Classic (unchanged),
 * a stroke-drawn one at the style's stroke width with round caps and joins
 * under Sticky. Decorative unless given an accessibilityLabel.
 */
export function Icon({ name, size, color, style, accessibilityLabel }: { name: IconName; size: number; color: string; style?: StyleProp<TextStyle>; accessibilityLabel?: string }) {
  const { styleTokens } = useTheme();
  const drawn = styleTokens.iconStroke > 0 ? DRAWN[name] : undefined;
  const accessible = Boolean(accessibilityLabel);
  if (!drawn) return <Ionicons accessible={accessible} accessibilityLabel={accessibilityLabel} name={name} size={size} color={color} style={style} />;
  const Drawn = drawn.icon;
  return <View accessible={accessible} accessibilityLabel={accessibilityLabel} accessibilityRole={accessible ? 'image' : undefined} style={style as StyleProp<ViewStyle>}>
    <Drawn size={size} color={color} fill={drawn.filled ? color : 'none'} strokeWidth={styleTokens.iconStroke} strokeLinecap="round" strokeLinejoin="round" />
  </View>;
}
