import { getDesignTokens } from "@/constants/design-tokens";
import { DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Provider as PaperProvider } from 'react-native-paper';
import "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
// Google Fonts (Expo) - use the packaged font variants instead of local TTFs
import { IBMPlexMono_400Regular } from '@expo-google-fonts/ibm-plex-mono';
import { Lora_400Regular } from '@expo-google-fonts/lora';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';


export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const t = getDesignTokens('light');
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    Lora_400Regular,
    IBMPlexMono_400Regular,
  });
  if (!fontsLoaded) {
    // Could render a splash/loading screen here later
    return null;
  }
  return (
    <PaperProvider>
    <ThemeProvider value={DefaultTheme}>
      <SafeAreaView style={{ flex: 1, backgroundColor: t.background }} edges={["top"]}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ title: "settings" }} />
          <Stack.Screen
            name="modal"
            options={{ presentation: "modal", title: "Modal" }}
          />
        </Stack>
        <StatusBar style="dark" />
      </SafeAreaView>
    </ThemeProvider>
    </PaperProvider>
  );
}
