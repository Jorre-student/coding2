import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
// Removed IconSymbol for plus; using plain + fallback
import { getDesignTokens, shadows } from '@/constants/design-tokens';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
// DateTimePicker removed (range handled by react-native-paper-dates)
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Dimensions, Easing, FlatList, Image, Modal, PanResponder, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { DatePickerModal } from 'react-native-paper-dates';
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
  // router removed; inline overlay replaces navigation
  const [album, setAlbum] = useState<Album | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Inline expand overlay state
  const [expandedImage, setExpandedImage] = useState<{ image: any; layout: { x: number; y: number; width: number; height: number } } | null>(null);
  // Per-expanded-image metadata selections
  const [expandedPeople, setExpandedPeople] = useState<string[]>([]);
  const [expandedTags, setExpandedTags] = useState<string[]>([]);
  const [savingMeta, setSavingMeta] = useState(false);
  const metaSaveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expandProgress = useRef(new Animated.Value(0)).current;
  const window = Dimensions.get('window');
  const overlayPanY = useRef(new Animated.Value(0)).current;
  // Swipe-down (image region only) - keeps info panel scrollable by not capturing touches below the image.
  const overlayPanResponder = React.useMemo(() => {
    return PanResponder.create({
      onStartShouldSetPanResponder: (evt) => {
        if (!expandedImage) return false;
        const y = evt.nativeEvent.pageY;
        const top = styles.expandedImageTarget.top;
        const bottom = top + styles.expandedImageTarget.height;
        return y >= top && y <= bottom; // start only on image area
      },
      onMoveShouldSetPanResponder: (_e, g) => {
        if (!expandedImage) return false;
        return g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx); // vertical dominance
      },
      onPanResponderMove: (_e, g) => {
        if (!expandedImage) return;
        if (g.dy > 0) overlayPanY.setValue(g.dy);
      },
      onPanResponderRelease: (_e, g) => {
        if (!expandedImage) return;
        if (g.dy > 120 || g.vy > 0.9) {
          Animated.timing(overlayPanY, { toValue: window.height, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => {
            Animated.timing(expandProgress, { toValue: 0, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: false }).start(() => {
              setExpandedImage(null);
              overlayPanY.setValue(0);
            });
          });
        } else {
          Animated.timing(overlayPanY, { toValue: 0, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
        }
      }
    });
  }, [expandedImage, overlayPanY, expandProgress, window.height]);
  // Attach feature removed
  const [hydrating, setHydrating] = useState(false);
  const [hydrateError, setHydrateError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  // Dynamic target height for info panel (screen height minus image target and bottom inset + spacing)
  const infoTargetHeight = window.height - (styles.expandedImageTarget.top + styles.expandedImageTarget.height + insets.bottom + 12);
  
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

  // Autosave tags & people when they change (debounced)
  useEffect(() => {
    if (!expandedImage?.image?._id) return;
    if (metaSaveDebounceRef.current) clearTimeout(metaSaveDebounceRef.current);
    metaSaveDebounceRef.current = setTimeout(async () => {
      try {
        setSavingMeta(true);
        let token: string | null = null;
        try { const raw = await AsyncStorage.getItem('session'); if (raw) { const s = JSON.parse(raw); token = s?.token || s?.accessToken || s?.jwt || s?.authorization || s?.user?.token || null; } } catch {}
        const headers: Record<string,string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const imgId = expandedImage.image._id;
        await fetch(`https://coding-bh7d.onrender.com/api/images/${imgId}`, { method:'PATCH', headers, body: JSON.stringify({ tags: expandedTags, people: expandedPeople }) });
      } catch (e) {
        console.log('[Autosave meta] failed', e);
      } finally {
        setSavingMeta(false);
      }
    }, 600);
    return () => { if (metaSaveDebounceRef.current) clearTimeout(metaSaveDebounceRef.current); };
  }, [expandedTags, expandedPeople, expandedImage]);

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
  // legacy filterBadges removed; using segmented media filters instead
  const collapsedHeight = 128; // increased for easier access (larger touch target & partial badge visibility)
  const windowHeight = Dimensions.get('window').height;
  const expandedHeight = Math.min(windowHeight * 0.75, 680); // dynamic height so all content (including tags) is visible
  const sheetHeight = useRef(new Animated.Value(collapsedHeight)).current;
  const isExpandedRef = useRef(false);
  const startHeightRef = useRef(collapsedHeight);
  const [expanded, setExpanded] = useState(false); // react state to trigger UI changes
  const [activeTab, setActiveTab] = useState<'all'|'picture'|'video'>('all');
  // Date range selection state
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [location, setLocation] = useState<string | null>(null);
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [nearby, setNearby] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const peoplePool = ['You', 'Alice', 'Bob', 'Charlie'];
  const tagPool = ['Vacation', 'Family', 'Work', 'Favorites'];
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  // Location & search helper functions
  const NOMINATIM_HEADERS = React.useMemo(() => ({
    'Accept-Language': 'en',
    'User-Agent': 'FolioApp/1.0 (contact: example@example.com)',
    'Referer': 'https://folio-app.local'
  }), []);

  const fetchNearbyLocations = async (lat: number, lon: number) => {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=6&addressdetails=1&q=${encodeURIComponent(lat.toFixed(3)+','+lon.toFixed(3))}`;
      const res = await fetch(url, { headers: NOMINATIM_HEADERS });
      const json: any[] = await res.json();
      const names = json.map(j => formatPlace(j)).filter(Boolean);
      const unique = names.filter((v,i,a) => a.indexOf(v) === i);
      setNearby(unique.slice(0,6));
    } catch {
      setNearby([]);
    }
  };

  // Helper to produce a concise place label from Nominatim result or reverse geocode address object
  const formatPlace = (entry: any): string => {
    const addr = entry?.address || entry; // reverseGeocodeAsync gives plain object
    if (!addr) return entry?.display_name || '';
    const name = addr.name || addr.amenity || addr.building || addr.neighbourhood || addr.suburb || addr.road;
    const locality = addr.city || addr.town || addr.village || addr.hamlet;
    const country = addr.country_code ? addr.country_code.toUpperCase() : (addr.country || '').split(/\s+/)[0];
    let parts = [name, locality, country].filter(Boolean);
    if (!parts.length) parts = [entry?.display_name || ''];
    let label = parts.join(', ');
    if (label.length > 40) label = label.slice(0, 37) + '…';
    return label;
  };
  const handlePickLocation = async () => {
    setLocationError(null);
    setLocationLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') throw new Error('Permission denied');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      let label = `${pos.coords.latitude.toFixed(3)}, ${pos.coords.longitude.toFixed(3)}`;
      try {
        const geo = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        if (geo && geo[0]) {
          label = formatPlace({ address: geo[0] });
        }
      } catch {}
      setLocation(label);
      fetchNearbyLocations(pos.coords.latitude, pos.coords.longitude);
    } catch (e: any) {
      setLocationError(e?.message || 'Location unavailable');
    } finally {
      setLocationLoading(false);
    }
  };

  // Debounced search
  const performSearch = React.useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=8&addressdetails=1&q=${encodeURIComponent(q.trim())}`;
      const res = await fetch(url, { headers: NOMINATIM_HEADERS });
      const json: any[] = await res.json();
      const names = json.map(j => formatPlace(j)).filter(Boolean);
      const unique = names.filter((v,i,a) => a.indexOf(v) === i);
      setSearchResults(unique);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [NOMINATIM_HEADERS]);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!locationModalVisible) return; // only when modal open
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      performSearch(searchQuery);
    }, 300);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [searchQuery, locationModalVisible, performSearch]);

  // Progress value for smooth crossfade between collapsed badges and expanded editor
  const transitionProgress = useRef(new Animated.Value(0)).current; // 0 collapsed, 1 expanded

  const animateProgress = (target: number) => {
    Animated.timing(transitionProgress, { toValue: target, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
  };

  const toggleSheet = (toExpanded?: boolean) => {
    const target = (typeof toExpanded === 'boolean') ? (toExpanded ? expandedHeight : collapsedHeight) : (isExpandedRef.current ? collapsedHeight : expandedHeight);
    isExpandedRef.current = target === expandedHeight;
    setExpanded(isExpandedRef.current);
    Animated.timing(sheetHeight, { toValue: target, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
    animateProgress(isExpandedRef.current ? 1 : 0);
  };

  // PanResponder for swipe up/down
  // PanResponder adjusted: only engage when vertical gesture clearly dominates, so horizontal filter badge scrolling works
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, g) => {
        // Make it easier to engage vertical drag: lower thresholds.
        const verticalDominant = Math.abs(g.dy) > Math.abs(g.dx) * 1.1;
        return verticalDominant && Math.abs(g.dy) > 4;
      },
      onPanResponderGrant: () => {
        sheetHeight.stopAnimation((val: number) => { startHeightRef.current = val; });
      },
      onPanResponderMove: (_evt, g) => {
        let next = startHeightRef.current - g.dy; // negative dy (drag up) increases height
        next = Math.max(collapsedHeight, Math.min(expandedHeight, next));
        sheetHeight.setValue(next);
        const progress = (next - collapsedHeight) / (expandedHeight - collapsedHeight);
        transitionProgress.setValue(progress);
      },
      onPanResponderRelease: (_evt, g) => {
        sheetHeight.stopAnimation((val: number) => {
          const ratio = (val - collapsedHeight) / (expandedHeight - collapsedHeight);
          // Easier expansion/collapse: lower ratio threshold + velocity assist
          const expandByDistance = ratio > 0.2; // previously midpoint (~0.5)
          const expandByFlick = g.vy < -0.5; // quick upward flick
          const collapseByFlick = g.vy > 0.6; // quick downward flick
          if (collapseByFlick) {
            toggleSheet(false);
          } else if (expandByFlick || expandByDistance) {
            toggleSheet(true);
          } else {
            toggleSheet(false);
          }
        });
      },
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  return (
    <ThemedView style={[styles.container, { backgroundColor: t.background }]}>      
  <Stack.Screen options={{ title: album?.name || 'Album', headerShown: !expandedImage }} />
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
              <ThemedText style={styles.filtersTitle}>{expanded ? 'Edit filters' : 'Active filters'}</ThemedText>
              <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={22} color={t.foreground} />
            </TouchableOpacity>
          </View>
          <View style={styles.sheetContent}>
            {/* Collapsed badges horizontal list (only visible when collapsed) */}
            <Animated.View
              pointerEvents={expanded ? 'none' : 'auto'}
              style={{
                opacity: transitionProgress.interpolate({ inputRange: [0, 0.25], outputRange: [1, 0] }),
                transform: [{ translateY: transitionProgress.interpolate({ inputRange: [0,1], outputRange: [0,-12] }) }]
              }}
            >
              {!expanded && (
                <FlatList
                  horizontal
                  data={( () => {
                    const arr: { key: string; label: string; icon: keyof typeof MaterialIcons.glyphMap }[] = [];
                    arr.push({ key: 'media', label: activeTab === 'all' ? 'All' : activeTab.charAt(0).toUpperCase() + activeTab.slice(1), icon: activeTab === 'video' ? 'videocam' : activeTab === 'picture' ? 'photo' : 'insert-drive-file' });
                    if (startDate && endDate) {
                      const same = startDate.getTime() === endDate.getTime();
                      arr.push({ key: 'date', label: same ? startDate.toLocaleDateString() : `${startDate.toLocaleDateString()} – ${endDate.toLocaleDateString()}`, icon: 'calendar-today' });
                    }
                    else if (startDate) arr.push({ key: 'date', label: `${startDate.toLocaleDateString()} → …`, icon: 'calendar-today' });
                    if (location) arr.push({ key: 'loc', label: location, icon: 'location-on' });
                    selectedPeople.forEach((p, i) => arr.push({ key: `p-${i}`, label: p, icon: 'person' }));
                    selectedTags.forEach((t, i) => arr.push({ key: `t-${i}`, label: t, icon: 'sell' }));
                    return arr;
                  })()}
                  keyExtractor={(item) => item.key}
                  renderItem={({ item }) => (
                    <View style={styles.filterBadgeCollapsed}>
                      <MaterialIcons name={item.icon} size={16} color="#555" style={{ marginRight: 6 }} />
                      <ThemedText style={styles.filterBadgeCollapsedText}>{item.label}</ThemedText>
                    </View>
                  )}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.collapsedBadgeRow}
                />
              )}
            </Animated.View>
            <Animated.View
              pointerEvents={expanded ? 'auto' : 'none'}
              style={{
                opacity: transitionProgress.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.3, 1] })
              }}
            >
            {/* Segmented tabs */}
            <View style={styles.segmentedContainer}>
              {['all','video','picture'].map(tab => {
                const active = activeTab === tab;
                return (
                  <TouchableOpacity
                    key={tab}
                    onPress={() => setActiveTab(tab as any)}
                    style={[styles.segmentButton, active && styles.segmentButtonActive]}
                    accessibilityRole="button"
                    accessibilityLabel={`${tab} media filter`}
                  >
                    <ThemedText style={[styles.segmentButtonText, active && styles.segmentButtonTextActive]}>{tab === 'all' ? 'All' : tab.charAt(0).toUpperCase() + tab.slice(1)}</ThemedText>
                  </TouchableOpacity>
                );
              })}
            </View>
            {expanded && (
              <>
                {/* Date range selector modal trigger (single or multi-day) */}
                <TouchableOpacity
                  onPress={() => setDateRangeOpen(true)}
                  style={[styles.inputField, styles.inputFieldSpaced]}
                  accessibilityRole="button"
                  accessibilityLabel="Pick a date range"
                >
                  <MaterialIcons name="calendar-today" size={18} color="#444" style={styles.inputIcon} />
                  <ThemedText style={styles.inputPlaceholder}>
                    {startDate && endDate
                      ? (startDate.getTime() === endDate.getTime()
                        ? startDate.toLocaleDateString() // single day
                        : `${startDate.toLocaleDateString()} – ${endDate.toLocaleDateString()}`)
                      : 'Pick date range'}
                  </ThemedText>
                  {(startDate || endDate) && (
                    <TouchableOpacity
                      onPress={() => { setStartDate(null); setEndDate(null); }}
                      accessibilityLabel="Clear date range"
                      style={styles.clearIconButton}
                    >
                      <MaterialIcons name="close" size={18} color="#666" />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
                <DatePickerModal
                  locale="en"
                  mode="range"
                  visible={dateRangeOpen}
                  onDismiss={() => setDateRangeOpen(false)}
                  startDate={startDate || undefined}
                  endDate={endDate || undefined}
                  onConfirm={({ startDate: s, endDate: e }) => {
                    // Allow single-day selection (user selects same date twice or only one date then confirm)
                    if (s && e && s.getTime() === e.getTime()) {
                      setStartDate(s);
                      setEndDate(e); // same
                    } else {
                      setStartDate(s || null);
                      setEndDate(e || (s ? s : null));
                    }
                    setDateRangeOpen(false);
                  }}
                  saveLabel="Apply"
                  uppercase={false}
                  animationType="slide"
                />
                {/* Location picker trigger */}
                <TouchableOpacity
                  onPress={() => { setLocationModalVisible(true); handlePickLocation(); }}
                  style={[styles.inputField, styles.inputFieldSpaced]}
                  accessibilityRole="button"
                  accessibilityLabel={location ? 'Location selected' : 'Open location picker'}
                >
                  <MaterialIcons name="location-on" size={20} color="#444" style={styles.inputIcon} />
                  <ThemedText style={styles.inputPlaceholder}>
                    {location ? location : (locationLoading ? 'Fetching...' : 'Add a location')}
                  </ThemedText>
                </TouchableOpacity>
                {/* People */}
                <ThemedText style={styles.sectionHeading}>People</ThemedText>
                <View style={styles.chipRow}>
                  <TouchableOpacity style={styles.addChip} accessibilityRole="button" accessibilityLabel="Add person">
                    <MaterialIcons name="add" size={20} color="#444" />
                  </TouchableOpacity>
                  {peoplePool.map((p, idx) => {
                    const active = selectedPeople.includes(p);
                    return (
                      <TouchableOpacity
                        key={`person-${idx}`}
                        onPress={() => setSelectedPeople(prev => active ? prev.filter(x => x!==p) : [...prev,p])}
                        style={[styles.personChip, active && styles.personChipActive]}
                      >
                        <MaterialIcons name="person" size={18} color={active ? '#7033ff' : '#222'} style={styles.personAvatar} />
                        <ThemedText style={[styles.personChipText, active && styles.personChipTextActive]}>{p}</ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {/* Tags */}
                <ThemedText style={styles.sectionHeading}>Tags</ThemedText>
                <View style={styles.chipRow}>
                  <TouchableOpacity style={styles.addChip} accessibilityRole="button" accessibilityLabel="Add tag">
                    <MaterialIcons name="add" size={20} color="#444" />
                  </TouchableOpacity>
                  {tagPool.map((tag, idx) => {
                    const active = selectedTags.includes(tag);
                    return (
                      <TouchableOpacity
                        key={`tag-${idx}`}
                        onPress={() => setSelectedTags(prev => active ? prev.filter(x => x!==tag) : [...prev, tag])}
                        style={[styles.tagChip, active && styles.tagChipActive]}
                      >
                        <ThemedText style={[styles.tagChipText, active && styles.tagChipTextActive]}>{tag}</ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
            </Animated.View>
          </View>
        </Animated.View>
      )}
        {locationModalVisible && (
          <Modal visible animationType="slide" transparent onRequestClose={() => setLocationModalVisible(false)}>
            <View style={styles.locationModalBackdrop}>
              <View style={styles.locationModal}>
                <View style={styles.locationModalHeader}>
                  <ThemedText style={styles.locationModalTitle}>Add Location</ThemedText>
                  <TouchableOpacity onPress={() => setLocationModalVisible(false)} accessibilityRole="button" accessibilityLabel="Close location picker">
                    <MaterialIcons name="close" size={24} color="#222" />
                  </TouchableOpacity>
                </View>
                <View style={styles.searchRow}>
                  <MaterialIcons name="search" size={20} color="#555" style={{ marginRight: 6 }} />
                  <TextInput
                    placeholder="Zoek locaties"
                    placeholderTextColor="#777"
                    style={styles.searchInput}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCorrect={false}
                    autoCapitalize="none"
                    returnKeyType="search"
                  />
                  {searchLoading && <ActivityIndicator size="small" color="#555" />}
                </View>
                <ScrollView style={styles.locationScroll} keyboardShouldPersistTaps="handled">
                  <View style={styles.locationSection}>
                    <ThemedText style={styles.locationSectionTitle}>Your Location</ThemedText>
                    <TouchableOpacity style={styles.locationItem} onPress={() => { if (location) { setLocationModalVisible(false); } else { handlePickLocation(); } }}>
                      {locationLoading ? <ActivityIndicator size="small" color="#444" /> : (
                        <ThemedText style={styles.locationItemText}>{location || (locationError || 'Tap to fetch current location')}</ThemedText>
                      )}
                    </TouchableOpacity>
                  </View>
                  {!!nearby.length && (
                    <View style={styles.locationSection}>
                      <ThemedText style={styles.locationSectionTitle}>Nearby</ThemedText>
                      {nearby.map((n, idx) => (
                          <TouchableOpacity key={`nearby-${idx}`} style={styles.locationItem} onPress={() => { setLocation(n); setLocationModalVisible(false); }}>
                            <ThemedText style={styles.locationItemText}>{n}</ThemedText>
                          </TouchableOpacity>
                        ))}
                    </View>
                  )}
                  {!!searchResults.length && (
                    <View style={styles.locationSection}>
                      <ThemedText style={styles.locationSectionTitle}>Search Results</ThemedText>
                      {searchResults.map((r, idx) => (
                        <TouchableOpacity key={`search-${idx}`} style={styles.locationItem} onPress={() => { setLocation(r); setLocationModalVisible(false); }}>
                          <ThemedText style={styles.locationItemText}>{r}</ThemedText>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  {!searchResults.length && searchQuery.trim().length > 0 && (
                    <View style={styles.locationSection}><ThemedText style={styles.locationEmpty}>Geen resultaten</ThemedText></View>
                  )}
                  <View style={[styles.locationSection, { paddingBottom: 28 }]}> 
                    <ThemedText style={styles.locationAttribution}>Data © OpenStreetMap-bijdragers (Nominatim)</ThemedText>
                  </View>
                </ScrollView>
              </View>
            </View>
          </Modal>
        )}
      {!loading && !error && (
        <FlatList
          data={album?.images ?? []}
          keyExtractor={(item, idx) => (item && typeof item === 'object' && (item as any)._id) ? String((item as any)._id) : String(idx)}
          contentContainerStyle={styles.galleryContent}
          renderItem={({ item }) => {
            if (item?.imagecode) {
              let ref: View | null = null;
              const handlePress = () => {
                if (!ref) return;
                (ref as any).measure?.((x: number,y: number,width: number,height: number,pageX: number,pageY: number) => {
                  setExpandedImage({ image: item, layout: { x: pageX, y: pageY, width, height } });
                  setExpandedTags(Array.isArray((item as any).tags) ? (item as any).tags : []);
                  setExpandedPeople(Array.isArray((item as any).people) ? (item as any).people : []);
                  expandProgress.setValue(0);
                  overlayPanY.setValue(0); // reset drag offset when opening
                  Animated.timing(expandProgress,{ toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
                });
              };
              return (
                <View ref={(r) => { ref = r; }} style={{ width: '100%' }}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={handlePress}
                    accessibilityRole='button'
                    accessibilityLabel='Expand image'
                  >
                    <Image source={{ uri: `data:image/jpeg;base64,${item.imagecode}` }} style={styles.imageThumb} resizeMode='cover' />
                  </TouchableOpacity>
                </View>
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
      {/* Inline expansion overlay (header -> image -> info card) */}
      {expandedImage && (
        <Animated.View {...overlayPanResponder.panHandlers} style={[StyleSheet.absoluteFill,{ zIndex:500, transform:[{ translateY: overlayPanY }] }]}>          
          {/* White background fade */}
          <Animated.View style={[StyleSheet.absoluteFill,{ backgroundColor: expandProgress.interpolate({ inputRange:[0,1], outputRange:['rgba(255,255,255,0)','rgba(255,255,255,1)'] }) }]} />
          <Animated.View style={{ flex:1 }}>
            {/* Header aligned with album navbar (safe area + 12) */}
            <Animated.View style={[styles.expandedHeader,{ opacity: expandProgress }]}>              
              <View style={styles.expandedHeaderLeft}>                
                <MaterialIcons name='person' size={20} color='#111' style={{ marginRight:8 }} />
                <ThemedText style={styles.expandedHeaderText}>Uploader</ThemedText>
                {/* Delete button next to uploader */}
                {!!expandedImage?.image?._id && (
                  <TouchableOpacity
                    style={styles.expandedDeleteButton}
                    accessibilityRole='button'
                    accessibilityLabel='Delete image'
                    onPress={async () => {
                      try {
                        let token: string | null = null;
                        try { const raw = await AsyncStorage.getItem('session'); if (raw) { const s = JSON.parse(raw); token = s?.token || s?.accessToken || s?.jwt || s?.authorization || s?.user?.token || null; } } catch {}
                        const headers: Record<string,string> = { 'Content-Type': 'application/json' };
                        if (token) headers['Authorization'] = `Bearer ${token}`;
                        const imgId = expandedImage?.image?._id;
                        if (!imgId) return;
                        const resDel = await fetch(`https://coding-bh7d.onrender.com/api/images/${imgId}`, { method: 'DELETE', headers });
                        if (!resDel.ok) {
                          console.log('[Delete image] API responded', resDel.status);
                        }
                        // Remove locally
                        setAlbum(prev => prev ? { ...prev, images: (prev.images||[]).filter((im:any) => (im?._id||im?.id) !== imgId) } : prev);
                        // Refetch album to ensure backend reference removed (if backend doesn't cascade)
                        try {
                          const refreshed = await fetchAlbumById(String(id), token);
                          if (refreshed?.images) setAlbum(refreshed);
                        } catch (refErr) { console.log('[Delete image] album refetch failed', refErr); }
                      } catch (e) {
                        console.log('[Delete image] failed', e);
                      } finally {
                        // collapse overlay regardless
                        Animated.timing(expandProgress,{ toValue:0, duration:160, easing:Easing.out(Easing.quad), useNativeDriver:false }).start(()=> setExpandedImage(null));
                      }
                    }}
                  >
                    <MaterialIcons name='delete' size={22} color='#c00' />
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity onPress={() => {
                Animated.timing(expandProgress,{ toValue:0, duration:160, easing:Easing.out(Easing.quad), useNativeDriver:false }).start(()=> setExpandedImage(null));
              }} accessibilityLabel='Close image'>
                <MaterialIcons name='close' size={24} color='#111' />
              </TouchableOpacity>
            </Animated.View>
            {/* Image with padding */}
            <Animated.View
              style={{
                position:'absolute',
                top: expandProgress.interpolate({ inputRange:[0,1], outputRange:[expandedImage.layout.y, styles.expandedImageTarget.top] }),
                left: expandProgress.interpolate({ inputRange:[0,1], outputRange:[expandedImage.layout.x, styles.expandedImageTarget.left] }),
                width: expandProgress.interpolate({ inputRange:[0,1], outputRange:[expandedImage.layout.width, styles.expandedImageTarget.width] }),
                height: expandProgress.interpolate({ inputRange:[0,1], outputRange:[expandedImage.layout.height, styles.expandedImageTarget.height] }),
              }}
            >
              <Image source={{ uri: `data:image/jpeg;base64,${expandedImage.image.imagecode}` }} style={styles.expandedImage} resizeMode='cover' />
            </Animated.View>
            {/* Info section (no rounded corners) with dynamic height & scroll */}
            <Animated.View style={{
              position:'absolute',
              left:0,
              right:0,
              top: expandProgress.interpolate({ inputRange:[0,1], outputRange:[window.height, styles.expandedImageTarget.top + styles.expandedImageTarget.height + 12] }),
              height: expandProgress.interpolate({ inputRange:[0,1], outputRange:[0, infoTargetHeight] }),
              opacity: expandProgress.interpolate({ inputRange:[0,0.5,1], outputRange:[0,0,1] })
            }}>
              <View style={[styles.expandedInfoFlat,{ flex:1 }]}>                
                <ScrollView style={{ flex:1 }} contentContainerStyle={{ paddingBottom: 32 + insets.bottom }} showsVerticalScrollIndicator={false}>
                <TouchableOpacity style={styles.expandedDownloadButton} accessibilityRole='button' onPress={() => {/* TODO implement download (save to device) */}}>
                  <MaterialIcons name='download' size={20} color='#fff' style={{ marginRight:8 }} />
                  <ThemedText style={styles.expandedDownloadText}>Download</ThemedText>
                </TouchableOpacity>
                <View style={styles.expandedInfoBlock}>                  
                  <ThemedText style={styles.expandedInfoTitle}>Information</ThemedText>
                  <View style={styles.expandedInputRow}>                    
                    <MaterialIcons name='calendar-today' size={18} color='#111' style={{ marginRight:8 }} />
                    <ThemedText style={styles.expandedInputText}>Date</ThemedText>
                  </View>
                  <View style={styles.expandedInputRow}>                    
                    <MaterialIcons name='location-on' size={20} color='#111' style={{ marginRight:8 }} />
                    <ThemedText style={styles.expandedInputText}>Location</ThemedText>
                  </View>
                  {/* People selection */}
                  <ThemedText style={styles.expandedMetaHeading}>People</ThemedText>
                  <View style={styles.expandedChipRow}>
                    {peoplePool.map((p) => {
                      const active = expandedPeople.includes(p);
                      return (
                        <TouchableOpacity
                          key={`exp-person-${p}`}
                          onPress={() => setExpandedPeople(prev => active ? prev.filter(x => x!==p) : [...prev, p])}
                          style={[styles.expandedPersonChip, active && styles.expandedPersonChipActive]}
                        >
                          <MaterialIcons name='person' size={16} color={active ? '#7033ff' : '#222'} style={{ marginRight:6 }} />
                          <ThemedText style={[styles.expandedPersonChipText, active && styles.expandedPersonChipTextActive]}>{p}</ThemedText>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {/* Tags selection */}
                  <ThemedText style={styles.expandedMetaHeading}>Tags</ThemedText>
                  <View style={styles.expandedChipRow}>
                    {tagPool.map(tag => {
                      const active = expandedTags.includes(tag);
                      return (
                        <TouchableOpacity
                          key={`exp-tag-${tag}`}
                          onPress={() => setExpandedTags(prev => active ? prev.filter(x => x!==tag) : [...prev, tag])}
                          style={[styles.expandedTagChip, active && styles.expandedTagChipActive]}
                        >
                          <ThemedText style={[styles.expandedTagChipText, active && styles.expandedTagChipTextActive]}>{tag}</ThemedText>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {/* Autosave indicator (optional) */}
                  {!!expandedImage?.image?._id && savingMeta && (
                    <ThemedText style={styles.expandedSavingIndicator}>Saving...</ThemedText>
                  )}
                </View>
                </ScrollView>
              </View>
            </Animated.View>
          </Animated.View>
        </Animated.View>
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
    flexDirection: 'column',
    gap: 14,
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
  // Collapsed summary badge row & badges
  collapsedBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
    gap: 8,
  },
  filterBadgeCollapsed: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e0e0e0',
    maxWidth: '100%',
    marginRight: 8,
  },
  filterBadgeCollapsedText: { fontSize: 12, fontWeight: '500', color: '#222', flexShrink: 1 },
  galleryContent: { paddingBottom: 40 },
  // New filter UI styles
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  sectionBlock: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    opacity: 0.7,
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectorBadge: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d9d9d9',
  },
  selectorBadgeActive: {
    backgroundColor: '#7033ff',
    borderColor: '#7033ff',
  },
  selectorBadgeText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#222',
  },
  selectorBadgeTextActive: {
    color: '#fff',
  },
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
  // New redesigned filter styles
  filtersHeading: { fontSize: 16, fontWeight: '600', marginBottom: 4, letterSpacing: -0.3 },
  segmentedContainer: { flexDirection: 'row', backgroundColor: '#f5f5f5', padding: 6, borderRadius: 24, gap: 4, alignSelf: 'flex-start' },
  segmentButton: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20 },
  segmentButtonActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  segmentButtonText: { fontSize: 14, fontWeight: '500', textTransform: 'capitalize', color: '#222' },
  segmentButtonTextActive: { color: '#000', fontWeight: '600' },
  inputField: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: '#e2e2e2' },
  inputFieldSpaced: { marginTop: 12 },
  inputIcon: { marginRight: 10 },
  inputPlaceholder: { fontSize: 14, color: '#444', fontWeight: '500' },
  textInputInner: { flex: 1, fontSize: 14, color: '#111', padding: 0 },
  sectionHeading: { fontSize: 13, fontWeight: '600', marginTop: 4, marginBottom: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  addChip: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fafafa', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e0e0e0' },
  personChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22, borderWidth: 1, borderColor: '#e0e0e0' },
  personChipActive: { borderColor: '#7033ff' },
  personAvatar: { marginRight: 6 },
  personChipText: { fontSize: 14, fontWeight: '500', color: '#222' },
  personChipTextActive: { color: '#7033ff', fontWeight: '600' },
  tagChip: { backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22, borderWidth: 1, borderColor: '#e0e0e0' },
  tagChipActive: { borderColor: '#7033ff' },
  tagChipText: { fontSize: 14, fontWeight: '500', color: '#222' },
  tagChipTextActive: { color: '#7033ff', fontWeight: '600' },
  clearIconButton: { marginLeft: 'auto', paddingLeft: 8 },
  // Location modal styles
  locationModalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'flex-end' },
  locationModal: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, maxHeight: '80%', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: -4 } },
  locationModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 8 },
  locationModalTitle: { fontSize: 16, fontWeight: '600' },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f3f3', marginHorizontal: 20, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 14, color: '#111', padding: 0 },
  locationScroll: { paddingHorizontal: 8 },
  locationSection: { marginBottom: 18, paddingHorizontal: 12 },
  locationSectionTitle: { fontSize: 13, fontWeight: '600', marginBottom: 6, color: '#444' },
  locationItem: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e5e5', marginBottom: 8 },
  locationItemText: { fontSize: 13, color: '#222' },
  locationEmpty: { fontSize: 12, color: '#777', fontStyle: 'italic' },
  locationAttribution: { fontSize: 11, color: '#555', textAlign: 'center', opacity: 0.8 },
  // Inline overlay styles
  inlineInfoPanel: { backgroundColor:'#fff', padding:16, borderTopLeftRadius:20, borderTopRightRadius:20, minHeight: 260, shadowColor:'#000', shadowOpacity:0.15, shadowRadius:10, shadowOffset:{ width:0, height:-4 } },
  inlineHeaderRow: { flexDirection:'row', alignItems:'center', justifyContent:'space-between' },
  inlineUploaderBadge: { flexDirection:'row', alignItems:'center', backgroundColor:'#f3f3f3', paddingHorizontal:14, paddingVertical:10, borderRadius:28 },
  inlineUploaderText: { fontSize:14, fontWeight:'600', color:'#222' },
  inlineCloseButton: { padding:8, backgroundColor:'#f3f3f3', borderRadius:22 },
  inlineDownloadButton: { flexDirection:'row', alignItems:'center', backgroundColor:'#111', paddingHorizontal:16, paddingVertical:12, borderRadius:10, alignSelf:'flex-start' },
  inlineDownloadText: { color:'#fff', fontWeight:'600' },
  // Expanded overlay styles (new layout)
  expandedHeader: { position:'absolute', top:0, left:0, right:0, height:58, flexDirection:'row', alignItems:'center', paddingHorizontal:20, justifyContent:'space-between' },
  expandedHeaderLeft: { flexDirection:'row', alignItems:'center' },
  expandedHeaderText: { fontSize:16, fontWeight:'600', color:'#111' },
  expandedDeleteButton: { padding:6, marginLeft:12 },
  expandedInfoCard: { backgroundColor:'#fff', padding:20, borderTopLeftRadius:20, borderTopRightRadius:20, minHeight:280, borderWidth:1, borderColor:'#e5e5e5' },
  expandedDownloadButton: { flexDirection:'row', alignItems:'center', justifyContent:'center', backgroundColor:'#111', paddingHorizontal:16, paddingVertical:14, borderRadius:12, width:'100%', marginBottom:16 },
  expandedDownloadText: { color:'#fff', fontSize:14, fontWeight:'600' },
  expandedInfoBlock: { },
  expandedInfoTitle: { fontSize:16, fontWeight:'600', marginBottom:16 },
  expandedInputRow: { flexDirection:'row', alignItems:'center', backgroundColor:'#f9f9f9', borderRadius:10, paddingHorizontal:14, paddingVertical:12, marginBottom:12, borderWidth:1, borderColor:'#e2e2e2' },
  expandedInputText: { fontSize:14, fontWeight:'500', color:'#111' },
  // New targets for image animation and flat info style (no rounded corners under image)
  expandedImageTarget: { top:58, left:0, width:Dimensions.get('window').width, height:380 },
  expandedImage: { width:'100%', height:'100%', paddingHorizontal:0 },
  // Info section padding aligned with global screen padding (horizontal 20, top 16 like container)
  expandedInfoFlat: { backgroundColor:'#fff', paddingHorizontal:20, paddingTop:16, paddingBottom:32 },
  expandedInfoScroll: { maxHeight: Dimensions.get('window').height - (58 + 380 + 32), marginBottom:8 },
  expandedInfoScrollContent: { paddingBottom: 32 },
  // Meta selection styles inside expanded overlay
  expandedMetaHeading: { fontSize:13, fontWeight:'600', marginTop:4, marginBottom:6 },
  expandedChipRow: { flexDirection:'row', flexWrap:'wrap', gap:8, marginBottom:12 },
  expandedPersonChip: { flexDirection:'row', alignItems:'center', backgroundColor:'#f5f5f5', paddingHorizontal:14, paddingVertical:10, borderRadius:20, borderWidth:1, borderColor:'#e0e0e0' },
  expandedPersonChipActive: { borderColor:'#7033ff', backgroundColor:'#fff' },
  expandedPersonChipText: { fontSize:13, fontWeight:'500', color:'#222' },
  expandedPersonChipTextActive: { color:'#7033ff', fontWeight:'600' },
  expandedTagChip: { backgroundColor:'#f5f5f5', paddingHorizontal:14, paddingVertical:10, borderRadius:20, borderWidth:1, borderColor:'#e0e0e0' },
  expandedTagChipActive: { borderColor:'#7033ff', backgroundColor:'#fff' },
  expandedTagChipText: { fontSize:13, fontWeight:'500', color:'#222' },
  expandedTagChipTextActive: { color:'#7033ff', fontWeight:'600' },
  expandedSaveMetaButton: { marginTop:4, backgroundColor:'#111', paddingVertical:12, borderRadius:10, alignItems:'center' },
  expandedSaveMetaText: { color:'#fff', fontSize:14, fontWeight:'600' },
  expandedSavingIndicator: { fontSize:12, fontWeight:'500', color:'#555', marginTop:4 },
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

// (removed stray handlePickLocation placeholder)
