import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
// import { getDesignTokens } from '@/constants/design-tokens'; // unused after PrimaryButton introduction
import { PrimaryButton } from '@/components/ui/primary-button';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, TouchableOpacity } from 'react-native';

export default function RegisterScreen() {
  const router = useRouter();
  // API expects `username`, not `name`
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const onRegister = async () => {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      if (!username || !email || !password) {
        throw new Error('Please fill in username, email and password');
      }
      const res = await fetch('https://coding-bh7d.onrender.com/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
      });

      const maybeJson = await (async () => {
        try {
          return await res.json();
        } catch {
          return null;
        }
      })();

      if (!res.ok) {
        const msg = (maybeJson && (maybeJson.error || maybeJson.message)) || `Register failed (${res.status})`;
        throw new Error(msg);
      }

      setSuccess('Registered successfully');
      // Optional: navigate to login after short delay
      setTimeout(() => router.replace('/login'), 600);
    } catch (e: any) {
      setError(e?.message ?? 'Register failed');
    } finally {
      setSubmitting(false);
    }
  };

  // const t = getDesignTokens('light'); // tokens used inside PrimaryButton
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ThemedView style={styles.container}>
        <ThemedText type="title" style={styles.title}>Register</ThemedText>

        <TextInput
          style={styles.input}
          placeholder="Username"
          placeholderTextColor="#888"
          autoCapitalize="none"
          value={username}
          onChangeText={setUsername}
        />
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
        {success && <ThemedText style={styles.success}>{success}</ThemedText>}

  <PrimaryButton title={submitting ? 'Registering...' : 'Register'} onPress={onRegister} disabled={submitting} loading={submitting} style={{ marginTop: 8 }} />

        <TouchableOpacity style={[styles.linkButton]} onPress={() => router.replace('/login')}>
          <ThemedText type="link">Back to login</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 96 },
  title: { marginBottom: 24 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 14,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  // Primary button styles migrated to component
  linkButton: { alignItems: 'center', marginTop: 14 },
  error: { color: '#c00', marginTop: 6 },
  success: { color: '#0a0', marginTop: 6 },
});
