import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

export default function IndexGate() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('session');
        if (!mounted) return;
        if (!raw) {
          router.replace('/login');
        } else {
          // Basic validation: ensure token or username exists before routing to albums
          try {
            const parsed = JSON.parse(raw);
            if (parsed?.token || parsed?.accessToken || parsed?.user || parsed?.username) {
              router.replace('/albums');
            } else {
              router.replace('/login');
            }
          } catch {
            router.replace('/login');
          }
        }
      } finally {
        if (mounted) setChecking(false);
      }
    })();
    return () => { mounted = false; };
  }, [router]);

  // Render minimal neutral screen while deciding
  if (checking) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#7033ff" />
      </View>
    );
  }
  // Once routed this should never be visible
  return <View style={{ flex: 1, backgroundColor: '#fff' }} />;
}
