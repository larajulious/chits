import type { ComponentProps } from 'react';
import type Ionicons from '@expo/vector-icons/Ionicons';

export type BoardIconName = ComponentProps<typeof Ionicons>['name'];

// Single source of truth for both Create Board and Edit Board — keeping one list
// means the two flows can never quietly drift apart on which icons/accents exist.
export const BOARD_ICONS: { name: BoardIconName; label: string }[] = [
  { name: 'folder-outline', label: 'Folder' },
  { name: 'briefcase-outline', label: 'Briefcase' },
  { name: 'bulb-outline', label: 'Lightbulb' },
  { name: 'heart-outline', label: 'Heart' },
  { name: 'home-outline', label: 'Home' },
  { name: 'book-outline', label: 'Book' },
  { name: 'paw-outline', label: 'Paw' },
  { name: 'person-outline', label: 'Person' },
  { name: 'star-outline', label: 'Star' },
  { name: 'checkbox-outline', label: 'Checklist' },
];

export const BOARD_ACCENTS: { value: string | null; label: string; color: string | null }[] = [
  { value: null, label: 'Neutral', color: null },
  { value: '#3D6E5C', label: 'Green', color: '#3D6E5C' },
  { value: '#4E639B', label: 'Blue', color: '#4E639B' },
  { value: '#9A5E33', label: 'Orange', color: '#9A5E33' },
  { value: '#765A97', label: 'Purple', color: '#765A97' },
  { value: '#A45E6E', label: 'Rose', color: '#A45E6E' },
];

export function resolveBoardIcon(icon: string | null): BoardIconName {
  return BOARD_ICONS.some((choice) => choice.name === icon) ? (icon as BoardIconName) : 'folder-outline';
}
