import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
// import { getDesignTokens } from '@/constants/design-tokens'; // not needed after PrimaryButton refactor
import { PrimaryButton } from '@/components/ui/primary-button';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

interface AddedUser {
  email: string;
}

export default function CreateAlbumScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [users, setUsers] = useState<AddedUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const addUser = () => {
    setError(null);
    const email = emailInput.trim();
    if (!email) return;
    const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    if (!emailRegex.test(email)) {
      setError('Invalid email format');
      return;
    }
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      setError('Email already added');
      return;
    }
    setUsers(prev => [...prev, { email }]);
    setEmailInput('');
  };

  const removeUser = (email: string) => {
    setUsers(prev => prev.filter(u => u.email !== email));
  };

  const onCreate = async () => {
    setSubmitting(true);
    setError(null);
    try {
      if (!name.trim()) throw new Error('Album name is required');
      // Attempt to read session for token & current user email; build user email list
      let token: string | null = null;
      let currentUserEmail: string | null = null;
      try {
        const raw = await AsyncStorage.getItem('session');
        if (raw) {
          const session = JSON.parse(raw);
          token = session?.token || session?.accessToken || session?.jwt || session?.authorization || session?.user?.token || null;
          currentUserEmail = session?.email || session?.user?.email || null;
          // If only username present and looks like email, capture it
          if (!currentUserEmail) {
            const maybe = session?.username || session?.user?.username;
            if (maybe && /@/.test(maybe)) currentUserEmail = maybe;
          }
        }
      } catch { /* ignore parse errors */ }

      // Collect provided user emails and ensure creator is included
      const providedEmails = users.map(u => u.email);
      if (currentUserEmail && !providedEmails.some(e => e.toLowerCase() === currentUserEmail!.toLowerCase())) {
        providedEmails.unshift(currentUserEmail);
      }
      // Helper: resolve emails to user ObjectIds (assumes GET /api/users returns array of users with _id & email)
      async function resolveEmailsToIds(emails: string[], authToken: string | null): Promise<string[]> {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
        const res = await fetch('https://coding-bh7d.onrender.com/api/users', { headers });
        let json: any = null;
        try { json = await res.json(); } catch { /* ignore */ }
        if (!res.ok || !Array.isArray(json)) {
          throw new Error('Unable to fetch users to resolve emails');
        }
        const lowerToId: Record<string, string> = {};
        for (const u of json) {
          if (u?.email && u?._id) lowerToId[String(u.email).toLowerCase()] = String(u._id);
        }
        const missing: string[] = [];
        const ids: string[] = emails.map(em => {
          const id = lowerToId[em.toLowerCase()];
          if (!id) missing.push(em);
          return id || '';
        }).filter(Boolean);
        if (missing.length) {
          throw new Error('Unknown user emails: ' + missing.join(', '));
        }
        return ids;
      }

      const userIds = await resolveEmailsToIds(providedEmails, token);
      const payload = { name: name.trim(), users: userIds };

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('https://coding-bh7d.onrender.com/api/albums', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      let json: any = null;
      try { json = await res.json(); } catch { /* ignore */ }
      if (!res.ok) {
        const msg = (json && (json.error || json.message)) || `Create failed (${res.status})`;
        throw new Error(msg);
      }

      // Success: navigate back to albums list (tab)
      router.replace('/(tabs)/albums');
    } catch (e: any) {
      setError(e?.message || 'Failed to create album');
    } finally {
      setSubmitting(false);
    }
  };

  // const t = getDesignTokens('light');
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ThemedView style={styles.container}>
        <ThemedText type="title" style={styles.title}>Create Album</ThemedText>
        <TextInput
          style={styles.input}
          placeholder="Album name"
          placeholderTextColor="#9a9a9a"
          value={name}
          onChangeText={setName}
        />
        <View style={styles.addRow}>
          <TextInput
            style={[styles.input, styles.emailInput]}
            placeholder="Add user by email"
            placeholderTextColor="#9a9a9a"
            autoCapitalize="none"
            keyboardType="email-address"
            value={emailInput}
            onChangeText={setEmailInput}
            onSubmitEditing={addUser}
          />
          <TouchableOpacity style={styles.smallButton} onPress={addUser}>
            <ThemedText style={styles.smallButtonText}>Add</ThemedText>
          </TouchableOpacity>
        </View>
        {users.length > 0 && (
          <FlatList
            data={users}
            keyExtractor={(item) => item.email}
            style={styles.list}
            renderItem={({ item }) => (
              <View style={styles.userPill}>
                <ThemedText style={styles.userEmail}>{item.email}</ThemedText>
                <TouchableOpacity onPress={() => removeUser(item.email)} style={styles.removeBtn}>
                  <ThemedText style={styles.removeBtnText}>×</ThemedText>
                </TouchableOpacity>
              </View>
            )}
            horizontal
            showsHorizontalScrollIndicator={false}
          />
        )}
        {error && <ThemedText style={styles.error}>{error}</ThemedText>}
  <PrimaryButton title={submitting ? 'Creating...' : 'Create'} onPress={onCreate} disabled={submitting} loading={submitting} style={{ marginTop: 8 }} />
        <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()}>
          <ThemedText type="link">Cancel</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 80 },
  title: { marginBottom: 24 },
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
  emailInput: { flex: 1, marginRight: 10, marginBottom: 0 },
  addRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  smallButton: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#7033ff' },
  smallButtonText: { color: '#fff', fontWeight: '600' },
  list: { maxHeight: 50, marginBottom: 16 },
  userPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginRight: 8, backgroundColor: '#7033ff' },
  userEmail: { color: '#fff', marginRight: 8 },
  removeBtn: { backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 12, paddingHorizontal: 6, paddingVertical: 2 },
  removeBtnText: { color: '#fff', fontWeight: '600' },
  // createButton & createButtonText replaced by PrimaryButton
  disabled: { opacity: 0.6 },
  cancelButton: { alignItems: 'center', marginTop: 16 },
  error: { color: '#c00', marginBottom: 8 },
});
