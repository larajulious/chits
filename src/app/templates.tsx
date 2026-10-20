import { Screen, EmptyState } from '@/components/ui/primitives';
import { useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
export default function TemplatesWebScreen() {
  'use no memo';
  useLocale();
  return <Screen><EmptyState title={tr('templates.title')} description={tr('id.openChitsOnADeviceToViewLocally2')} /></Screen>;
}
