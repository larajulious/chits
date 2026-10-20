import { tr } from '@/localization/runtime';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnUI, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

type Size = { width: number; height: number };

function boundOffset(offset: number, imageSize: number, viewportSize: number, scale: number) {
  'worklet';
  const limit = Math.max(0, (imageSize * scale - viewportSize) / 2);
  return Math.max(-limit, Math.min(limit, offset));
}

function PhotoGestures({ uri, viewport, imageSize }: { uri: string | null; viewport: Size; imageSize: Size }) {
  const [decodedSize, setDecodedSize] = useState(imageSize);
  const fit = Math.min(viewport.width / decodedSize.width, viewport.height / decodedSize.height);
  const imageWidth = decodedSize.width * fit;
  const imageHeight = decodedSize.height * fit;
  const scale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);

  const zoom = (nextScale: number, pointX: number, pointY: number) => {
    'worklet';
    const next = Math.max(1, Math.min(5, nextScale));
    const ratio = next / scale.get();
    x.set(boundOffset(pointX - (pointX - x.get()) * ratio, imageWidth, viewport.width, next));
    y.set(boundOffset(pointY - (pointY - y.get()) * ratio, imageHeight, viewport.height, next));
    scale.set(next);
  };
  const pinch = Gesture.Pinch()
    .onStart((event) => {
      startScale.set(scale.get());
      startX.set(x.get());
      startY.set(y.get());
      focalX.set(event.focalX - viewport.width / 2);
      focalY.set(event.focalY - viewport.height / 2);
    })
    .onUpdate((event) => {
      const next = Math.max(1, Math.min(5, startScale.get() * event.scale));
      const ratio = next / startScale.get();
      x.set(boundOffset(event.focalX - viewport.width / 2 - (focalX.get() - startX.get()) * ratio, imageWidth, viewport.width, next));
      y.set(boundOffset(event.focalY - viewport.height / 2 - (focalY.get() - startY.get()) * ratio, imageHeight, viewport.height, next));
      scale.set(next);
    });
  const pan = Gesture.Pan().maxPointers(1).minDistance(3)
    .onStart(() => { panX.set(x.get()); panY.set(y.get()); })
    .onUpdate((event) => {
      x.set(boundOffset(panX.get() + event.translationX, imageWidth, viewport.width, scale.get()));
      y.set(boundOffset(panY.get() + event.translationY, imageHeight, viewport.height, scale.get()));
    });
  const doubleTap = Gesture.Tap().numberOfTaps(2).onEnd((event, success) => {
    if (success) zoom(scale.get() > 1 ? 1 : 2.5, event.x - viewport.width / 2, event.y - viewport.height / 2);
  });
  const transform = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }, { scale: scale.get() }],
  }));

  return <GestureDetector gesture={Gesture.Exclusive(Gesture.Simultaneous(pinch, pan), doubleTap)}>
    <Animated.View
      style={StyleSheet.absoluteFill}
      accessible accessibilityRole="adjustable" accessibilityLabel={tr('id.photo')}
      accessibilityActions={[
        { name: 'increment', label: tr('customheadersettings.zoomIn') },
        { name: 'decrement', label: tr('customheadersettings.zoomOut') },
      ]}
      onAccessibilityAction={(event) => {
        const direction = event.nativeEvent.actionName === 'increment' ? 1 : -1;
        runOnUI(() => { 'worklet'; zoom(scale.get() + direction * 0.5, 0, 0); })();
      }}
    >
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, transform]}>
        <Image source={uri} contentFit="contain" autoplay={false} allowDownscaling={false}
          onLoad={({ source }) => {
            if (source.width > 0 && source.height > 0) setDecodedSize({ width: source.width, height: source.height });
          }} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </Animated.View>
  </GestureDetector>;
}

export function ZoomablePhoto({ uri, width, height }: { uri: string | null; width?: number | null; height?: number | null }) {
  const [viewport, setViewport] = useState<Size>({ width: 0, height: 0 });
  return <View style={styles.viewport} onLayout={({ nativeEvent: { layout } }) => {
    setViewport((previous) => previous.width === layout.width && previous.height === layout.height ? previous : { width: layout.width, height: layout.height });
  }}>
    {viewport.width > 0 && viewport.height > 0 ? <PhotoGestures
      key={`${uri}:${viewport.width}:${viewport.height}`} uri={uri} viewport={viewport}
      imageSize={{ width: width && width > 0 ? width : viewport.width, height: height && height > 0 ? height : viewport.height }}
    /> : null}
  </View>;
}

const styles = StyleSheet.create({ viewport: { ...StyleSheet.absoluteFill, overflow: 'hidden' } });
