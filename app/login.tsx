import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
// import { getDesignTokens } from '@/constants/design-tokens'; // unused after PrimaryButton refactor
import { PrimaryButton } from '@/components/ui/primary-button';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, TouchableOpacity } from 'react-native';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onLogin = async () => {
    setSubmitting(true);
    setError(null);
    try {
      if (!email || !password) {
        throw new Error('Email and password are required');
      }
      // Use only the remote deployed backend for login
      const loginUrl = 'https://coding-bh7d.onrender.com/api/users/login';
      const res = await fetch(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      let json: any = null;
      try { json = await res.json(); } catch { /* ignore parse error */ }
      if (!res.ok) {
        const msg = (json && (json.error || json.message)) || `Login failed (${res.status})`;
        throw new Error(msg);
      }
      await AsyncStorage.setItem('session', JSON.stringify(json));
      router.replace('/');
    } catch (e: any) {
      const msg = e?.message || (typeof e === 'string' ? e : 'Login failed');
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // const t = getDesignTokens('light'); // tokens accessed inside PrimaryButton
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ThemedView style={styles.container}>
        <ThemedText type="title" style={styles.title}>Log in</ThemedText>
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#888"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#888"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        {error && <ThemedText style={styles.error}>{error}</ThemedText>}
  <PrimaryButton title={submitting ? 'Logging in...' : 'Login'} onPress={onLogin} disabled={submitting} loading={submitting} style={{ marginTop: 8 }} />
  <Link href="/register" asChild>
          <TouchableOpacity style={styles.secondaryButton}>
            <ThemedText type="link">No account? Register here</ThemedText>
          </TouchableOpacity>
        </Link>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 96,
  },
  title: {
    marginBottom: 32,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  // Button styles migrated to PrimaryButton
  secondaryButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  error: {
    color: '#c00',
    marginBottom: 8,
  },
});
