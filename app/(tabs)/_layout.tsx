import { getDesignTokens, typography } from "@/constants/design-tokens";
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useRouter } from "expo-router";
import { TouchableOpacity, View } from 'react-native';

// Simplified layout: remove bottom tab bar and non-album routes (home/explore/camera).
// Camera code retained in its file but not registered for navigation yet.
export default function AlbumsOnlyLayout() {
  // Provide tokens for header styling
  const t = getDesignTokens('light');
  const router = useRouter();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerShadowVisible: true,
        headerStyle: { backgroundColor: t.background },
        headerTitleStyle: { fontFamily: typography.fontSansSemiBold, fontSize: 20 },
        headerTintColor: t.foreground,
      }}
    >
      <Stack.Screen
        name="albums"
        options={{
          title: 'Folio',
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity accessibilityLabel="Profile" accessibilityRole="button" onPress={() => router.push('/settings')} style={{ paddingHorizontal: 4, paddingVertical: 4 }}>
                <MaterialIcons name="person" size={24} color={t.foreground} />
              </TouchableOpacity>
              <TouchableOpacity accessibilityLabel="Settings" accessibilityRole="button" onPress={() => router.push('/settings')} style={{ paddingHorizontal: 4, paddingVertical: 4 }}>
                <MaterialIcons name="settings" size={24} color={t.foreground} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />
    </Stack>
  );
}
