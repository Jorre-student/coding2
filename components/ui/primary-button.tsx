import { ThemedText } from '@/components/themed-text';
import { getDesignTokens, shadows, typography } from '@/constants/design-tokens';
import React from 'react';
import { StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';

interface PrimaryButtonProps {
  title: string;
  onPress?: () => void;
  disabled?: boolean;
  style?: ViewStyle | ViewStyle[];
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function PrimaryButton({ title, onPress, disabled, style, loading, leftIcon, rightIcon }: PrimaryButtonProps) {
  const t = getDesignTokens('light');
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        styles.base,
        { backgroundColor: t.primary },
        (disabled || loading) && styles.disabled,
        style,
        shadows.sm,
      ]}
    >
      {leftIcon}
      <ThemedText style={[styles.text, { color: t.primaryForeground, fontFamily: typography.fontSansSemiBold }]}>
        {loading ? 'Please wait...' : title}
      </ThemedText>
      {rightIcon}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  disabled: { opacity: 0.55 },
  text: { fontSize: 16 },
});

export default PrimaryButton;
