import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { getUsername } from '../database/database';
import XpGainToast from '../components/XpGainToast';

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!getUsername()) {
        router.replace('/username-setup');
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#6750A4' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="add-book" options={{ title: '책 추가' }} />
        <Stack.Screen name="book/[id]" options={{ title: '책 상세' }} />
        <Stack.Screen name="ended-challenges" options={{ title: '종료된 챌린지 목록' }} />
        <Stack.Screen name="username-setup" options={{ headerShown: false }} />
      </Stack>
      <XpGainToast />
    </View>
  );
}
