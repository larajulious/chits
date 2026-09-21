import type { PropsWithChildren } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
export function GlassSurface({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) { return <View style={style}>{children}</View>; }
