import { Stack } from "expo-router";

// Simplified layout: remove bottom tab bar and non-album routes (home/explore/camera).
// Camera code retained in its file but not registered for navigation yet.
export default function AlbumsOnlyLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="albums" />
    </Stack>
  );
}
