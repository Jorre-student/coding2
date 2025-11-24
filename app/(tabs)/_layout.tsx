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
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingRight: 4 }}>
              <TouchableOpacity
                accessibilityLabel="Account"
                accessibilityRole="button"
                onPress={() => router.push('/account' as any)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ marginRight: 14, padding: 8, borderRadius: 24 }}
              >
                <MaterialIcons name="person" size={26} color={t.foreground} />
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityLabel="Settings"
                accessibilityRole="button"
                onPress={() => router.push('/settings')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ padding: 8, borderRadius: 24 }}
              >
                <MaterialIcons name="settings" size={26} color={t.foreground} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />
    </Stack>
  );
}
