import { typography } from '@/constants/design-tokens';
import { StyleSheet, Text, type TextProps } from "react-native";

import { useThemeColor } from "@/hooks/use-theme-color";

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: "default" | "title" | "defaultSemiBold" | "subtitle" | "link";
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = "default",
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, "text");

  return (
    <Text
      style={[
        { color },
        type === "default" ? styles.default : undefined,
        type === "title" ? styles.title : undefined,
        type === "defaultSemiBold" ? styles.defaultSemiBold : undefined,
        type === "subtitle" ? styles.subtitle : undefined,
        type === "link" ? styles.link : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: typography.fontSansRegular,
    letterSpacing: typography.trackingNormal * 16,
  },
  defaultSemiBold: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: typography.fontSansSemiBold,
    letterSpacing: typography.trackingNormal * 16,
  },
  title: {
    fontSize: 32,
    lineHeight: 34,
    fontFamily: typography.fontSansSemiBold,
    letterSpacing: typography.trackingNormal * 32,
  },
  subtitle: {
    fontSize: 20,
    fontFamily: typography.fontSansMedium,
    letterSpacing: typography.trackingNormal * 20,
  },
  link: {
    lineHeight: 30,
    fontSize: 16,
    color: '#7033ff', // updated to primary token color
    fontFamily: typography.fontSansSemiBold,
    letterSpacing: typography.trackingNormal * 16,
  },
});
