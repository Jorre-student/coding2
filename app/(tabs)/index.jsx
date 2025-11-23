// import { getDesignTokens } from "@/constants/design-tokens"; // not currently needed
import { PrimaryButton } from '@/components/ui/primary-button';
import { Image } from "expo-image";
import { StyleSheet } from "react-native";

import ParallaxScrollView from "@/components/parallax-scroll-view";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import {
  InstrumentSerif_400Regular,
  useFonts,
} from "@expo-google-fonts/instrument-serif";
import { Link } from "expo-router";
import useSWR from "swr";

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function HomeScreen() {
  const [fontsLoaded] = useFonts({
    InstrumentSerif_400Regular,
  });
  // Access tokens if needed later (currently primary button handles its own colors)
  // const t = getDesignTokens('light');

  // Basic SWR usage
  const { data, error, isLoading } = useSWR(
    "https://coding-bh7d.onrender.com/api/messages",
    fetcher
  );

  if (!fontsLoaded) {
    return null; // or a loading indicator
  }

  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: "#A1CEDC", dark: "#1D3D47" }}
      headerImage={
        <Image
          source={require("@/assets/images/partial-react-logo.png")}
          style={styles.reactLogo}
        />
      }
    >
      <ThemedView style={styles.titleContainer}>
        <ThemedText style={{ color: "#5fb6fdff" }} type="subtitle">
          App
        </ThemedText>
        <Link href="/login" asChild>
          <PrimaryButton title="Log in" />
        </Link>
      </ThemedView>
      <ThemedView>
        <Image
          source={require("@/assets/images/successful-entrepreneurs.jpg")}
          style={styles.heroImage}
        ></Image>
      </ThemedView>
      <ThemedView style={styles.stepContainer}>
        <ThemedText style={{ marginBottom: 8 }} type="title">
          SWR Data Fetching
        </ThemedText>
        {/* Removed old misplaced link; login button now under Mango title */}
        {isLoading && <ThemedText>Loading...</ThemedText>}
        {error && <ThemedText>Error loading data</ThemedText>}
        {Array.isArray(data) &&
          data.length > 0 &&
          data.map((message, idx) => {
            // Guard against missing fields in the API response
            const senderName = message?.sender?.username ?? "Unknown sender";
            const text = message?.text ?? "(no text)";
            const dateStr = message?.createdAt
              ? new Date(message.createdAt).toLocaleString()
              : "Unknown date";

            if (!message?.sender) {
              console.warn("Message missing sender:", message);
            }

            return (
              <ThemedView
                key={message?._id ?? idx}
                style={{
                  marginBottom: 10,
                  backgroundColor: "#ffffff1a",
                  padding: 10,
                  borderRadius: 5,
                }}
              >
                <ThemedText>{text}</ThemedText>
                <ThemedText style={{ fontSize: 14, fontStyle: "italic" }}>
                  Sender: {senderName}
                </ThemedText>
                <ThemedText style={{ fontSize: 14, color: "#888" }}>
                  Date: {dateStr}
                </ThemedText>
              </ThemedView>
            );
          })}
      </ThemedView>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  // Login button replaced by PrimaryButton component
  stepContainer: {
    gap: 8,
    marginBottom: 8,
  },
  reactLogo: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: "absolute",
  },
  heroImage: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 8,
    resizeMode: "cover",
  },
});
