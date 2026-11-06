import { AppText } from '@/components/ui/app-text';
import { router } from 'expo-router';
import { View } from 'react-native';
export default function CanvasWeb() { return <View><AppText onPress={() => router.back()}>Canvas is available in the iOS and Android app. Back</AppText></View>; }
