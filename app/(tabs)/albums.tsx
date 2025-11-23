import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getDesignTokens, shadows, typography } from '@/constants/design-tokens';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

interface Album {
  _id: string;
  name: string;
  users?: string[]; // array of user ObjectIds
  images?: any[]; // may be array of ids or image objects
  firstImageCode?: string; // hydrated base64 for first image
}

// Placeholder album card (empty image box)
function AlbumCard({ album }: { album: Album }) {
  // Prefer hydrated firstImageCode, fallback to first entry's imagecode if present
  const fallbackFirst = (() => {
    if (album.images && album.images.length) {
      const first = album.images[0];
      if (typeof first === 'object' && first?.imagecode) return first.imagecode;
    }
    return undefined;
  })();
  const code = album.firstImageCode || fallbackFirst;
  const t = getDesignTokens('light');
  return (
    <View style={[styles.card, { backgroundColor: t.card }, shadows.sm]}>
      {code ? (
        <Image source={{ uri: `data:image/jpeg;base64,${code}` }} style={styles.cardImage} resizeMode="cover" />
      ) : (
        <View style={styles.cardImagePlaceholder} />
      )}
      <ThemedText style={[styles.cardTitle, { color: t.cardForeground, fontFamily: typography.fontSans }]}>{album.name || 'Untitled Album'}</ThemedText>
    </View>
  );
}

export default function AlbumsScreen() {
  const [username, setUsername] = useState<string>('Your');
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [hydrating, setHydrating] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('session');
        if (raw) {
          const data = JSON.parse(raw);
          const name = data?.username || data?.user?.username || data?.user?.name || (data?.email && String(data.email).split('@')[0]);
          if (name) setUsername(name);
          const idCandidate = data?._id || data?.id || data?.user?._id || data?.user?.id || null;
          if (idCandidate) setUserId(String(idCandidate));
        }
      } catch { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    // Fetch albums after we know userId (or attempt anyway to filter by email fallback later if needed)
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Attempt to read token for auth header
        let token: string | null = null;
        try {
          const raw = await AsyncStorage.getItem('session');
          if (raw) {
            const s = JSON.parse(raw);
            token = s?.token || s?.accessToken || s?.jwt || s?.authorization || s?.user?.token || null;
          }
        } catch { /* ignore */ }
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        async function fetchAll(): Promise<Album[]> {
          const res = await fetch('https://coding-bh7d.onrender.com/api/albums', { headers });
          let json: any = null;
          try { json = await res.json(); } catch { /* ignore */ }
          if (!res.ok) throw new Error((json && (json.error || json.message)) || `Fetch failed (${res.status})`);
          if (!Array.isArray(json)) throw new Error('Unexpected albums response');
          return json as Album[];
        }

        let allAlbums: Album[] = [];
        try {
          allAlbums = await fetchAll();
        } catch (e) {
          throw e;
        }

        // Filter albums where current user is a member (if userId known and album.users is array)
        const relevant = userId
          ? allAlbums.filter(a => Array.isArray(a.users) && a.users.some(u => String(u) === userId))
          : allAlbums; // fallback show all if userId unknown

        setAlbums(relevant);
      } catch (e: any) {
        setError(e?.message || 'Failed to load albums');
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  // Hydrate first image base64 for each album if needed
  useEffect(() => {
    (async () => {
      if (!albums.length) return;
      // Determine which albums need hydration (no firstImageCode and first image lacks imagecode or is just id)
      const targets = albums.filter(a => {
        if (!a.images || !a.images.length) return false;
        if (a.firstImageCode) return false;
        const first = a.images[0];
        if (typeof first === 'string') return true; // need fetch
        if (first && typeof first === 'object' && !first.imagecode) return true; // object missing code
        return false;
      });
      if (!targets.length) return;
      setHydrating(true);
      try {
        let token: string | null = null;
        try {
          const raw = await AsyncStorage.getItem('session');
          if (raw) {
            const s = JSON.parse(raw);
            token = s?.token || s?.accessToken || s?.jwt || s?.authorization || s?.user?.token || null;
          }
        } catch {}
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        for (const album of targets) {
          const first = album.images![0];
          let imageId: string | null = null;
          if (typeof first === 'string') imageId = first;
          else if (first && typeof first === 'object') imageId = first._id || first.id || null;
          if (!imageId) continue;
          try {
            const res = await fetch(`https://coding-bh7d.onrender.com/api/images/${imageId}`, { headers });
            let json: any = null; try { json = await res.json(); } catch {}
            if (res.ok && json) {
              const code = json.imagecode || json.base64 || null;
              if (code) {
                setAlbums(prev => prev.map(a => a._id === album._id ? { ...a, firstImageCode: code } : a));
              }
            }
          } catch { /* ignore one-off */ }
        }
      } finally {
        setHydrating(false);
      }
    })();
  }, [albums]);

  const t = getDesignTokens('light');

  const handleLogout = async () => {
    try { await AsyncStorage.removeItem('session'); } catch {}
    setProfileOpen(false);
    router.replace('/login');
  };
  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <ThemedView style={[styles.container, { backgroundColor: t.background }]}>
        {/* Top navigation bar */}
        <View style={styles.topBar}>
          <ThemedText style={[styles.appName, { color: t.foreground, fontFamily: typography.fontSansSemiBold }]}>Folio</ThemedText>
          <View style={styles.topBarActions}>
            <TouchableOpacity accessibilityLabel="Profile" accessibilityRole="button" onPress={() => setProfileOpen(p => !p)} style={styles.iconButton}>
              <MaterialIcons name="person" size={26} color={t.foreground} />
            </TouchableOpacity>
            <TouchableOpacity accessibilityLabel="Settings" accessibilityRole="button" onPress={() => router.push('/settings')} style={styles.iconButton}>
              <MaterialIcons name="settings" size={26} color={t.foreground} />
            </TouchableOpacity>
          </View>
        </View>
        {profileOpen && (
          <View style={[styles.profileMenu, { backgroundColor: t.card }, shadows.sm]}>
            <ThemedText style={[styles.profileName, { color: t.foreground }]}>{username}</ThemedText>
            <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn} accessibilityLabel="Log out" accessibilityRole="button">
              <ThemedText style={[styles.logoutText, { color: t.primary }]}>Log out</ThemedText>
            </TouchableOpacity>
          </View>
        )}
        <ThemedText type="title" style={[styles.title, { color: t.foreground, fontFamily: typography.fontSans }]}>{username} Albums</ThemedText>
        <Link href="/create-album" asChild>
          <TouchableOpacity style={[styles.createButton, { backgroundColor: t.primary }] }>
            <ThemedText style={[styles.createButtonText, { color: t.primaryForeground, fontFamily: typography.fontSans }]}>Create Album</ThemedText>
          </TouchableOpacity>
        </Link>

        {loading && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={t.primary} />
          </View>
        )}
        {error && <ThemedText style={styles.errorText}>{error}</ThemedText>}
        {!loading && !error && (
          <View style={styles.albumsGrid}>
            {albums.length === 0 && (
              <ThemedText style={styles.emptyText}>No albums yet.</ThemedText>
            )}
            {albums.map(album => (
              <Link key={album._id} href={`/album/${album._id}`} asChild>
                <TouchableOpacity>
                  <AlbumCard album={album} />
                </TouchableOpacity>
              </Link>
            ))}
          </View>
        )}
  {hydrating && <ActivityIndicator style={{ marginTop: 12 }} color={t.primary} />}
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 48,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    marginBottom: 12,
  },
  appName: {
    fontSize: 26,
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconButton: {
    padding: 6,
    borderRadius: 30,
  },
  profileMenu: {
    position: 'absolute',
    top: 60,
    right: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    minWidth: 160,
  },
  profileName: {
    fontSize: 16,
    marginBottom: 10,
    fontFamily: typography.fontSansMedium,
  },
  logoutBtn: {
    paddingVertical: 10,
    borderRadius: 8,
  },
  logoutText: {
    fontSize: 16,
    fontFamily: typography.fontSansSemiBold,
  },
  title: {
    marginBottom: 24,
  },
  createButton: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 28,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
   albumsGrid: {
     flexDirection: 'column',
     // Single column: remove wrapping so items stack vertically
   },
   card: {
     width: '100%',
     borderRadius: 12,
     overflow: 'hidden',
     marginBottom: 20,
   },
  cardImage: {
    width: '100%',
    height: 180,
  },
  cardImagePlaceholder: {
    width: '100%',
    height: 180,
    backgroundColor: '#eee',
  },
  cardTitle: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontWeight: '600',
    fontSize: 16,
  },
   loadingWrap: {
     paddingVertical: 32,
     alignItems: 'center',
     justifyContent: 'center',
   },
  errorText: {
    color: '#c00',
    marginBottom: 12,
  },
  emptyText: {
    opacity: 0.7,
    marginBottom: 8,
  },
});
