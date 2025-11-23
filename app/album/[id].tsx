import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
// Removed IconSymbol for plus; using plain + fallback
import { getDesignTokens, shadows } from '@/constants/design-tokens';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, FlatList, Image, PanResponder, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// Animated Touchable for FAB (defined after all imports to satisfy lint rule)
const AnimatedFab = Animated.createAnimatedComponent(TouchableOpacity);

interface Album {
  _id: string;
  name: string;
  images?: { _id?: string; imagecode?: string }[]; // adapt when API defined
}

export default function AlbumDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [album, setAlbum] = useState<Album | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Attach feature removed
  const [hydrating, setHydrating] = useState(false);
  const [hydrateError, setHydrateError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  
  const handleAddImage = async () => {
    if (!id) return;
    setUploadError(null);
    try {
      await requestLibraryPermission();
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        base64: false,
        quality: 1,
        allowsEditing: false,
      });
      if ((result as any).canceled) return;
      const asset = (result as any).assets?.[0];
      if (!asset?.uri) throw new Error('Could not read image data');
      setUploading(true);

      // Extract token
      let token: string | null = null;
      try {
        const raw = await AsyncStorage.getItem('session');
        if (raw) {
          const s = JSON.parse(raw);
          token = s?.token || s?.accessToken || s?.jwt || s?.authorization || s?.user?.token || null;
        }
      } catch { /* ignore */ }

      // Center-crop to square then resize to exactly 64x64
      const origW = asset.width || 0;
      const origH = asset.height || 0;
      let actions: ImageManipulator.Action[] = [];
      if (origW && origH) {
        const size = Math.min(origW, origH);
        const originX = Math.max(0, (origW - size) / 2);
        const originY = Math.max(0, (origH - size) / 2);
        actions.push({ crop: { originX, originY, width: size, height: size } });
      }
      actions.push({ resize: { width: 64, height: 64 } });

      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri,
        actions,
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      if (!manipulated.base64) throw new Error('Failed to obtain base64');

      let response: any = null;
      try {
        response = await createAndLinkImage(String(id), manipulated.base64, token);
        console.log('[Album Upload] createAndLinkImage response:', response);
      } catch (e: any) {
        setUploadError(e?.message || 'Upload failed');
      }

      // Response shape: { image, album } OR { album } OR error
      if (response?.album) {
        setAlbum(prev => prev ? { ...prev, images: response.album.images || prev.images } : response.album);
      } else if (response?.image) {
        setAlbum(prev => prev ? { ...prev, images: [...(prev.images||[]), response.image] } : prev);
      } else {
        // Fallback: local optimistic update
        const optimistic = { imagecode: manipulated.base64 };
        setAlbum(prev => prev ? { ...prev, images: [...(prev.images||[]), optimistic] } : prev);
      }

      // Optional: Refetch album for consistency only if album not returned fully
      if (!response?.album) {
        try {
          const refreshed = await fetchAlbumById(String(id), token);
          if (refreshed?.images) {
            setAlbum(prev => prev ? { ...prev, images: refreshed.images } : refreshed);
          }
        } catch (refetchErr) {
          console.log('[Album Upload] Refetch failed:', refetchErr);
        }
      }
      setUploading(false);
    } catch (e: any) {
      setUploadError(e?.message || 'Failed to add image');
      setUploading(false);
    }
  };

  // Attach handler removed

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
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
        const res = await fetch(`https://coding-bh7d.onrender.com/api/albums/${id}`, { headers });
        let json: any = null;
        try { json = await res.json(); } catch { /* ignore */ }
        if (!res.ok) throw new Error((json && (json.error || json.message)) || `Fetch failed (${res.status})`);
        if (mounted) setAlbum(json);
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Failed to load album');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id]);

  // Hydrate image objects if album.images are only IDs or objects without imagecode
  useEffect(() => {
    (async () => {
      if (!album?.images || !album.images.length) return;
      // Detect if hydration needed
      const needsHydration = album.images.some(img => {
        if (!img) return false;
        const hasCode = !!img.imagecode;
        const isIdOnly = typeof (img as any) === 'string';
        const hasIdNoCode = (img._id && !img.imagecode);
        return isIdOnly || hasIdNoCode || !hasCode;
      });
      if (!needsHydration) return;
      setHydrating(true);
      setHydrateError(null);
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
        const hydrated: { _id?: string; imagecode?: string }[] = [];
        for (const entry of album.images) {
          if (!entry) continue;
          if (typeof entry === 'string') {
            const imgId = entry;
            try {
              const res = await fetch(`https://coding-bh7d.onrender.com/api/images/${imgId}`, { headers });
              let json: any = null; try { json = await res.json(); } catch {}
              if (res.ok && json) {
                hydrated.push({ _id: json._id || json.id || imgId, imagecode: json.imagecode || json.base64 });
              } else {
                hydrated.push({ _id: imgId });
              }
            } catch {
              hydrated.push({ _id: imgId });
            }
          } else if (entry._id && !entry.imagecode) {
            const imgId = entry._id;
            try {
              const res = await fetch(`https://coding-bh7d.onrender.com/api/images/${imgId}`, { headers });
              let json: any = null; try { json = await res.json(); } catch {}
              if (res.ok && json) {
                hydrated.push({ _id: json._id || json.id || imgId, imagecode: json.imagecode || json.base64 });
              } else {
                hydrated.push({ _id: imgId });
              }
            } catch {
              hydrated.push({ _id: imgId });
            }
          } else {
            hydrated.push(entry);
          }
        }
        setAlbum(prev => prev ? { ...prev, images: hydrated } : prev);
      } catch (e: any) {
        setHydrateError(e?.message || 'Hydration failed');
      } finally {
        setHydrating(false);
      }
    })();
  }, [album?.images]);

  const t = getDesignTokens('light');
  console.log('[AlbumDetailScreen] primary token:', t.primary);

  // Animated placeholder component for loading state
  const LoadingImagePlaceholder = ({ active }: { active: boolean }) => {
    const fade = useRef(new Animated.Value(0)).current;
    useEffect(() => {
      if (!active) return;
      let isMounted = true;
      const loop = () => {
        Animated.sequence([
          Animated.timing(fade, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
          Animated.timing(fade, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        ]).start(({ finished }) => { if (finished && isMounted) loop(); });
      };
      loop();
      return () => { isMounted = false; };
    }, [active, fade]);
    const backgroundColor = fade.interpolate({
      inputRange: [0, 1],
      outputRange: ['#ffffff', '#eaeaea']
    });
    return <Animated.View style={[styles.imagePlaceholder, { backgroundColor }]} />;
  };
  // Bottom sheet (filters) logic
  const filterBadges = [ 'All', 'Recent', 'Favorites', 'Mine', 'Shared' ];
  const collapsedHeight = 128; // increased for easier access (larger touch target & partial badge visibility)
  const expandedHeight = 260; // full content height
  const sheetHeight = useRef(new Animated.Value(collapsedHeight)).current;
  const isExpandedRef = useRef(false);
  const startHeightRef = useRef(collapsedHeight);

  const toggleSheet = (toExpanded?: boolean) => {
    const target = (typeof toExpanded === 'boolean') ? (toExpanded ? expandedHeight : collapsedHeight) : (isExpandedRef.current ? collapsedHeight : expandedHeight);
    isExpandedRef.current = target === expandedHeight;
    Animated.timing(sheetHeight, { toValue: target, duration: 240, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
  };

  // PanResponder for swipe up/down
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
      onPanResponderGrant: () => {
        sheetHeight.stopAnimation((val: number) => {
          startHeightRef.current = val;
        });
      },
      onPanResponderMove: (_, g) => {
        let next = startHeightRef.current - g.dy; // dy negative when dragging up -> increase height
        next = Math.max(collapsedHeight, Math.min(expandedHeight, next));
        sheetHeight.setValue(next);
      },
      onPanResponderRelease: () => {
        sheetHeight.stopAnimation((val: number) => {
          const midpoint = (collapsedHeight + expandedHeight) / 2;
          toggleSheet(val > midpoint);
        });
      },
    })
  ).current;

  return (
    <ThemedView style={[styles.container, { backgroundColor: t.background }]}>      
      <Stack.Screen options={{ title: album?.name || 'Album' }} />
      {/* Attach feature removed */}
      {loading && (
        <View style={styles.centerWrap}><ActivityIndicator color={t.primary} /></View>
      )}
      {error && !loading && (
        <ThemedText style={styles.error}>{error}</ThemedText>
      )}
      {/* Bottom sheet filters (sticky at screen bottom) */}
      {!loading && !error && (
        <Animated.View style={[styles.bottomSheet, { height: sheetHeight }]} {...panResponder.panHandlers}>          
          <View style={styles.bottomSheetGrab}>
            <View style={styles.grabIndicator} />
            <TouchableOpacity onPress={() => toggleSheet()} accessibilityRole="button" accessibilityLabel="Toggle filters" style={styles.filtersHeaderInline}>
              <ThemedText style={styles.filtersTitle}>Filters</ThemedText>
              <MaterialIcons name={isExpandedRef.current ? 'expand-less' : 'expand-more'} size={22} color={t.foreground} />
            </TouchableOpacity>
          </View>
          <View style={styles.sheetContent}>
            {filterBadges.map(b => (
              <View key={b} style={styles.filterBadge}>                  
                <ThemedText style={styles.filterBadgeText}>{b}</ThemedText>
              </View>
            ))}
          </View>
        </Animated.View>
      )}
      {!loading && !error && (
        <FlatList
          data={album?.images ?? []}
          keyExtractor={(item, idx) => (item && typeof item === 'object' && (item as any)._id) ? String((item as any)._id) : String(idx)}
          contentContainerStyle={styles.galleryContent}
            renderItem={({ item }) => {
              if (item?.imagecode) {
                return (
                  <Image
                    source={{ uri: `data:image/jpeg;base64,${item.imagecode}` }}
                    style={styles.imageThumb}
                    resizeMode="cover"
                  />
                );
              }
              return <LoadingImagePlaceholder active={hydrating || loading} />;
            }}
          ListEmptyComponent={<ThemedText style={styles.emptyText}>No images yet.</ThemedText>}
        />
      )}
      {/* Removed purple hydrateBanner; skeleton placeholders indicate loading */}
      {hydrateError && !hydrating && <View style={styles.hydrateErrorBanner}><ThemedText style={styles.hydrateErrorText}>{hydrateError}</ThemedText></View>}
      {uploading && (
        <View style={[styles.uploadBanner, { backgroundColor: t.primary }]}>          
          <ActivityIndicator color="#fff" />
          <ThemedText style={styles.uploadText}>Uploading image...</ThemedText>
        </View>
      )}
      {uploadError && !uploading && (
        <View style={[styles.uploadErrorBanner, { backgroundColor: t.destructive }]}>          
          <ThemedText style={styles.uploadErrorText}>{uploadError}</ThemedText>
        </View>
      )}
      {/* Floating create image button */}
      {/* Animated FAB positioned above sheet */}
      <AnimatedFab
        style={[
          styles.fab,
          shadows.sm,
          {
            backgroundColor: t.primary || '#7033ff',
            bottom: Animated.add(sheetHeight, new Animated.Value(8 + insets.bottom)),
          },
        ]}
        onPress={handleAddImage}
        accessibilityRole="button"
        accessibilityLabel="Add image"
      >
        <MaterialIcons name="add" size={34} color="#fff" />
      </AnimatedFab>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  titleTop: { marginBottom: 16 }, // retained style (title removed)
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { color: '#c00', marginBottom: 12 },
  bottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
    zIndex: 100,
  },
  bottomSheetGrab: {
    alignItems: 'center',
    marginBottom: 8,
  },
  grabIndicator: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#d0d0d0',
    marginBottom: 6,
  },
  filtersHeaderInline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingBottom: 4,
  },
  filtersTitle: { fontSize: 14, fontWeight: '600', letterSpacing: -0.3 },
  sheetContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterBadge: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e0e0e0',
  },
  filterBadgeText: { fontSize: 12, fontWeight: '500' },
  galleryContent: { paddingBottom: 40 },
  imagePlaceholder: { height: 160, backgroundColor: '#eee', borderRadius: 12, marginBottom: 16 },
  emptyText: { opacity: 0.6, textAlign: 'center', marginTop: 40 },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  imageThumb: {
    height: 160,
    borderRadius: 12,
    marginBottom: 16,
    width: '100%',
    backgroundColor: '#ddd'
  },
  uploadBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  uploadText: { color: '#fff', marginLeft: 12, fontWeight: '600' },
  uploadErrorBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  uploadErrorText: { color: '#fff', fontWeight: '600' },
  // Attach styles removed
  // hydrateBanner & hydrateText removed in favor of animated placeholders
  hydrateErrorBanner: { position: 'absolute', bottom: 100, left: 20, right: 20, backgroundColor: '#c00', padding: 12, borderRadius: 8 },
  hydrateErrorText: { color: '#fff', fontWeight: '600' },
});

async function requestLibraryPermission() {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Permission to access gallery was denied');
  }
}

// Create and link image with fallback strategy if new endpoint not available
async function createAndLinkImage(albumId: string, base64: string, token: string | null) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  // 1. Try new unified endpoint
  try {
    const res = await fetch(`https://coding-bh7d.onrender.com/api/albums/${albumId}/images`, {
      method: 'POST', headers, body: JSON.stringify({ imagecode: base64 })
    });
    let json: any = null; try { json = await res.json(); } catch {}
    if (res.ok) {
      console.log('[createAndLinkImage] primary endpoint success');
      return json; // { image, album }
    }
    if (res.status !== 404) {
      throw new Error((json && (json.error || json.message)) || `Upload failed (${res.status})`);
    }
    console.log('[createAndLinkImage] primary endpoint 404, falling back');
  } catch (e: any) {
    if (e?.message && !/404/.test(e.message)) {
      console.log('[createAndLinkImage] primary endpoint error (non-404):', e.message);
      throw e;
    }
  }

  // 2. Fallback path: create image first
  let createdImage: any = null;
  try {
    const resImg = await fetch(`https://coding-bh7d.onrender.com/api/images`, {
      method: 'POST', headers, body: JSON.stringify({ imagecode: base64 })
    });
    let imgJson: any = null; try { imgJson = await resImg.json(); } catch {}
    if (!resImg.ok) throw new Error((imgJson && (imgJson.error || imgJson.message)) || `Image create failed (${resImg.status})`);
    createdImage = imgJson;
    console.log('[createAndLinkImage] created image via /api/images', createdImage?._id);
  } catch (e: any) {
    console.log('[createAndLinkImage] fallback create image failed:', e.message);
    throw e; // Cannot proceed without image
  }
  const imageId = createdImage?._id || createdImage?.id;
  if (!imageId) {
    throw new Error('Created image missing id');
  }

  // 3. Try attach endpoint
  try {
    const resAttach = await fetch(`https://coding-bh7d.onrender.com/api/albums/${albumId}/images/attach`, {
      method: 'POST', headers, body: JSON.stringify({ imageId })
    });
    let attachJson: any = null; try { attachJson = await resAttach.json(); } catch {}
    if (resAttach.ok) {
      console.log('[createAndLinkImage] attached image via attach endpoint');
      return { image: createdImage, album: attachJson?.album || attachJson };
    }
    if (resAttach.status !== 404) {
      throw new Error((attachJson && (attachJson.error || attachJson.message)) || `Attach failed (${resAttach.status})`);
    }
    console.log('[createAndLinkImage] attach endpoint 404, trying PATCH album');
  } catch (e: any) {
    if (!/404/.test(e?.message || '')) {
      console.log('[createAndLinkImage] attach endpoint error (non-404):', e.message);
      throw e;
    }
  }

  // 4. Final fallback: PATCH album with merged images array
  try {
    // Fetch current album images
    const albumCurrent = await fetchAlbumById(albumId, token);
    const existingIds = (albumCurrent?.images || []).map((i: any) => i?._id || i?.id).filter(Boolean);
    if (!existingIds.includes(imageId)) existingIds.push(imageId);
    const resPatch = await fetch(`https://coding-bh7d.onrender.com/api/albums/${albumId}`, {
      method: 'PATCH', headers, body: JSON.stringify({ images: existingIds })
    });
    let patchJson: any = null; try { patchJson = await resPatch.json(); } catch {}
    if (!resPatch.ok) throw new Error((patchJson && (patchJson.error || patchJson.message)) || `Album patch failed (${resPatch.status})`);
    console.log('[createAndLinkImage] patched album with new image id');
    return { image: createdImage, album: patchJson };
  } catch (e: any) {
    console.log('[createAndLinkImage] final patch fallback failed:', e.message);
    throw new Error('All upload strategies failed: ' + e.message);
  }
}

// attachExistingImage removed


async function fetchAlbumById(albumId: string, token?: string | null) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`https://coding-bh7d.onrender.com/api/albums/${albumId}`, { headers });
  let json: any = null; try { json = await res.json(); } catch {}
  if (!res.ok) throw new Error('Album refetch failed (' + res.status + ')');
  return json;
}


// Hook into component scope via closure replacement: we'll patch handleAddImage after component definition
// Instead, define it above return using function expression referencing state setters.
