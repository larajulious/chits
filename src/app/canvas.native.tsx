import { Stack } from 'expo-router';
import Workspace from '@/features/whiteboard/workspace.native';

export default function CanvasScreen() {
  return (
    <>
      {/* Keep iOS swipe-back from taking over drawing and panning gestures. */}
      <Stack.Screen options={{ gestureEnabled: false }} />
      <Workspace />
    </>
  );
}
