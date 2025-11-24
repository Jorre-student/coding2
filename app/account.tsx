import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';

interface Album { _id?: string; name?: string; }
interface SessionShape { user?: { name?: string; email?: string; username?: string; firstName?: string; lastName?: string }; token?: string; accessToken?: string; jwt?: string; name?: string; email?: string; username?: string; firstName?: string; lastName?: string; }
interface UserApiShape { name?: string; email?: string; username?: string; firstName?: string; lastName?: string; id?: string; _id?: string; }

// Attempt to normalize any user-shaped object coming from varying backend responses.
function normalizeUser(raw: any): UserApiShape | null {
  if (!raw || typeof raw !== 'object') return null;
  // If response wraps user in a property
  const candidate = raw.user || raw.data?.user || raw.profile || raw.account || raw;
  if (!candidate || typeof candidate !== 'object') return null;
  const out: UserApiShape = {};
  const fields = ['name','email','username','firstName','lastName','id','_id'];
  for (const f of fields) {
    if (candidate[f] != null) (out as any)[f] = candidate[f];
  }
  // Compose name if not provided
  if (!out.name && (out.firstName || out.lastName)) {
    out.name = [out.firstName, out.lastName].filter(Boolean).join(' ').trim();
  }
  // If we still have nothing meaningful, return null
  const meaningful = out.name || out.username || out.email;
  return meaningful ? out : null;
}

export default function AccountScreen() {
  const [session, setSession] = useState<SessionShape | null>(null);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loadingAlbums, setLoadingAlbums] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const router = useRouter();
  const [userData, setUserData] = useState<UserApiShape | null>(null);
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('session');
        if (raw) setSession(JSON.parse(raw));
      } catch {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setLoadingAlbums(true);
      try {
        let token = session?.token || session?.accessToken || session?.jwt || null;
        const headers: Record<string,string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch('https://coding-bh7d.onrender.com/api/albums', { headers });
        let json: any = [];
        try { json = await res.json(); } catch {}
        if (Array.isArray(json)) {
          // If userData available and albums have owner or participants, filter
          if (userData) {
            const uid = userData._id || userData.id || userData.email;
            const filtered = json.filter((a: any) => {
              if (!a) return false;
              if (a.owner && (a.owner === uid || a.owner?._id === uid)) return true;
              if (Array.isArray(a.participants) && a.participants.some((p: any) => p === uid || p?._id === uid)) return true;
              return true; // fallback include if no metadata
            });
            setAlbums(filtered);
          } else {
            setAlbums(json);
          }
        }
      } catch {}
      setLoadingAlbums(false);
    })();
  }, [session, userData]);

  // Fetch live user info from backend when session loaded
  useEffect(() => {
    (async () => {
      if (!session) return;
      let token = session?.token || session?.accessToken || session?.jwt || null;
      if (!token) return;
      setUserLoading(true);
      setUserError(null);
      const headers: Record<string,string> = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
      // Try a sequence of possible endpoints
      const candidates = [
        'https://coding-bh7d.onrender.com/api/users/me',
        'https://coding-bh7d.onrender.com/api/me',
        'https://coding-bh7d.onrender.com/api/profile'
      ];
      let fetched: UserApiShape | null = null;
      for (const url of candidates) {
        try {
          const res = await fetch(url, { headers });
          let j: any = null; try { j = await res.json(); } catch {}
          if (res.ok && j) {
            fetched = normalizeUser(j) || fetched;
            if (fetched) break;
          }
        } catch {
          // continue silently
        }
      }
      if (fetched) {
        setUserData(fetched);
      } else {
        // Fallback: derive from session itself
        const derived = normalizeUser(session);
        if (derived) setUserData(derived); else setUserError('Could not load profile');
      }
      setUserLoading(false);
    })();
  }, [session]);

  // Additional fallbacks from session root if structure differs
  const sessionUser: any = session?.user || session;
  const name = userData?.name
    || userData?.username
    || [userData?.firstName, userData?.lastName].filter(Boolean).join(' ')
    || sessionUser?.name
    || sessionUser?.username
    || [sessionUser?.firstName, sessionUser?.lastName].filter(Boolean).join(' ')
    || 'Guest';
  const email = userData?.email
    || sessionUser?.email
    || 'guest@example.com';

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await AsyncStorage.removeItem('session');
      // Potential other keys (future): tokens, preferences
    } catch {}
    setSession(null);
    setLoggingOut(false);
    router.replace('/login' as any);
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Account' }} />
      <View style={styles.headerBlock}>
        <ThemedText style={styles.greeting}>Hey {name}</ThemedText>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Log out"
          onPress={handleLogout}
          style={[styles.logoutButton, loggingOut && { opacity: 0.6 }]}
          disabled={loggingOut}
        >
          <MaterialIcons name="logout" size={18} color="#fff" style={{ marginRight: 6 }} />
          <ThemedText style={styles.logoutText}>{loggingOut ? 'Logging out...' : 'Log out'}</ThemedText>
        </TouchableOpacity>
  <ThemedText style={styles.sectionTitle}>Information {userLoading && '(loading...)'}</ThemedText>
  {userError && <ThemedText style={styles.userError}>{userError}</ThemedText>}
        <View style={styles.infoRow}><ThemedText style={styles.infoLabel}>Name</ThemedText><ThemedText style={styles.infoValue}>{name}</ThemedText></View>
        <View style={styles.infoRow}><ThemedText style={styles.infoLabel}>Email</ThemedText><ThemedText style={styles.infoValue}>{email}</ThemedText></View>
      </View>
      <ThemedText style={styles.sectionTitle}>Included Albums</ThemedText>
      {loadingAlbums && <ActivityIndicator style={{ marginTop: 12 }} />}
      {!loadingAlbums && (
        <FlatList
          data={albums}
          keyExtractor={(item, idx) => item._id ? String(item._id) : String(idx)}
          renderItem={({ item }) => {
            const hasId = !!item._id;
            return (
              <TouchableOpacity
                style={[styles.albumRow, !hasId && { opacity: 0.5 }]}
                accessibilityRole={hasId ? 'button' : undefined}
                accessibilityLabel={hasId ? `Open album ${item.name || 'Untitled'}` : 'Album missing id'}
                disabled={!hasId}
                onPress={() => { if (hasId) router.push(`/album/${item._id}` as any); }}
              >
                <ThemedText style={styles.albumName}>{item.name || 'Untitled'}</ThemedText>
                {hasId && <MaterialIcons name="chevron-right" size={20} color="#666" />}
              </TouchableOpacity>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.albumSeparator} />}
          ListEmptyComponent={<ThemedText style={styles.empty}>No albums found.</ThemedText>}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  headerBlock: { marginBottom: 24 },
  greeting: { fontSize: 28, fontWeight: '600', marginBottom: 12 },
  logoutButton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#7033ff', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  logoutText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginTop: 8, marginBottom: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  infoLabel: { width: 70, fontSize: 14, fontWeight: '500', opacity: 0.7 },
  infoValue: { fontSize: 14, fontWeight: '500' },
  albumRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#e2e2e2', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  albumName: { fontSize: 14 },
  albumSeparator: { height: StyleSheet.hairlineWidth, backgroundColor: '#e2e2e2' },
  empty: { marginTop: 12, opacity: 0.6, fontStyle: 'italic' },
  userError: { color: '#d9534f', fontSize: 12 }
});
