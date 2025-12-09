import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
// Removed IconSymbol for plus; using plain + fallback
import { getDesignTokens, shadows } from '@/constants/design-tokens';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
// DateTimePicker removed (range handled by react-native-paper-dates)
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
// expo-location used inside LocationPicker component
import LocationPicker from '@/components/ui/location-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Dimensions, Easing, FlatList, Image, Modal, PanResponder, ScrollView, StyleSheet, Switch, TextInput, TouchableOpacity, View } from 'react-native';
import { DatePickerModal } from 'react-native-paper-dates';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// Animated Touchable for FAB (defined after all imports to satisfy lint rule)
const AnimatedFab = Animated.createAnimatedComponent(TouchableOpacity);

interface Album {
  _id: string;
  name: string;
  images?: { _id?: string; imagecode?: string }[]; // adapt when API defined
  participants?: { _id?: string; id?: string; email?: string; username?: string }[];
  users?: (string | { _id?: string; id?: string; email?: string; username?: string })[];
}

export default function AlbumDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  // router removed; inline overlay replaces navigation
  const [album, setAlbum] = useState<Album | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Invite modal state
  const [inviteVisible, setInviteVisible] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccessUsername, setInviteSuccessUsername] = useState<string | null>(null);
  // Inline expand overlay state
  const [expandedImage, setExpandedImage] = useState<{ image: any; layout: { x: number; y: number; width: number; height: number } } | null>(null);
  // Per-expanded-image metadata selections
  const [expandedPeople, setExpandedPeople] = useState<string[]>([]);
  const [expandedTags, setExpandedTags] = useState<string[]>([]);
  // Date & location metadata for expanded image
  const [expandedPickedDate, setExpandedPickedDate] = useState<Date | null>(null);
  const [expandedDateOpen, setExpandedDateOpen] = useState(false);
  const [expandedLocationLabel, setExpandedLocationLabel] = useState<string>('');
  const [expandedLat, setExpandedLat] = useState<number | null>(null);
  const [expandedLon, setExpandedLon] = useState<number | null>(null);
  const [expandedEditingLocation, setExpandedEditingLocation] = useState(false);
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
        exif: true,
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

      // Extract EXIF metadata (date + GPS) before manipulation
      const exifMeta = extractExifMetadata(asset);
      // Derive final picked date (EXIF created timestamp or fallback to now)
      const finalPickedDateISO = exifMeta.pickedDateISO || new Date().toISOString();
      // Use only picture EXIF location (no current-device fallback)
      const finalLat: number | undefined = exifMeta.lat;
      const finalLon: number | undefined = exifMeta.lon;
      // If we have lat/lon from EXIF, resolve a friendly label using the same API used by filters (Nominatim)
      let finalPlaceLabel: string | undefined;
      if (finalLat != null && finalLon != null) {
        try {
          const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(finalLat)}&lon=${encodeURIComponent(finalLon)}&addressdetails=1`;
          const res = await fetch(url, { headers: NOMINATIM_HEADERS });
          const j: any = await res.json();
          const label = formatPlace(j);
          if (label && typeof label === 'string') finalPlaceLabel = label;
        } catch {
          // leave undefined; we'll fall back to 'Unknown'
        }
      }

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

  // Patch metadata (always send picked_date; send location only if present in EXIF)
      try {
        const imageId = response?.image?._id || response?.image?.id || (response?.album?.images?.length ? (response.album.images[response.album.images.length - 1]._id || response.album.images[response.album.images.length - 1].id) : null);
        if (imageId) {
          const patchBody: any = { picked_date: finalPickedDateISO };
          if (finalLat != null && finalLon != null) {
            patchBody.location = { lat: finalLat, lon: finalLon, placeLabel: finalPlaceLabel || 'Unknown' };
          }
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (token) headers['Authorization'] = `Bearer ${token}`;
          await fetch(`https://coding-bh7d.onrender.com/api/images/${imageId}`, { method: 'PATCH', headers, body: JSON.stringify(patchBody) });
          // Auto-update local state once so UI reflects new metadata without a full reload
          setAlbum(prev => {
            if (!prev || !Array.isArray(prev.images)) return prev;
            const imgs = prev.images.map((im: any) => {
              const imId = (im && typeof im === 'object') ? (im._id || im.id) : null;
              if (imId && imId === imageId) {
                const next: any = { ...im };
                if (patchBody.picked_date) next.picked_date = patchBody.picked_date;
                if (patchBody.location) next.location = patchBody.location;
                return next;
              }
              return im;
            });
            return { ...prev, images: imgs };
          });
        }
      } catch (metaErr) {
        console.log('[Album Upload] Metadata patch failed:', metaErr);
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
        // Also hydrate if metadata fields missing (tags, people, picked_date, location)
        const missingMeta = !(img as any).tags || !(img as any).people || typeof (img as any).picked_date === 'undefined' || typeof (img as any).location === 'undefined';
        return isIdOnly || hasIdNoCode || !hasCode || missingMeta;
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
        const hydrated: any[] = [];
        for (const entry of album.images) {
          if (!entry) continue;
          if (typeof entry === 'string') {
            const imgId = entry;
            try {
              const res = await fetch(`https://coding-bh7d.onrender.com/api/images/${imgId}`, { headers });
              let json: any = null; try { json = await res.json(); } catch {}
              if (res.ok && json) {
                hydrated.push({
                  _id: json._id || json.id || imgId,
                  imagecode: json.imagecode || json.base64,
                  tags: Array.isArray(json.tags) ? json.tags : [],
                  people: Array.isArray(json.people) ? json.people : [],
                  picked_date: typeof json.picked_date !== 'undefined' ? json.picked_date : null,
                  // Preserve null vs undefined; undefined means truly missing (will trigger hydration again), null means present but empty
                  location: json.location,
                });
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
                hydrated.push({
                  _id: json._id || json.id || imgId,
                  imagecode: json.imagecode || json.base64,
                  tags: Array.isArray(json.tags) ? json.tags : [],
                  people: Array.isArray(json.people) ? json.people : [],
                  picked_date: typeof json.picked_date !== 'undefined' ? json.picked_date : null,
                  location: json.location,
                });
              } else {
                hydrated.push({ _id: imgId });
              }
            } catch {
              hydrated.push({ _id: imgId });
            }
          } else {
            // Ensure arrays exist
            const obj: any = { ...entry };
            if (!Array.isArray(obj.tags)) obj.tags = [];
            if (!Array.isArray(obj.people)) obj.people = [];
            // Prevent endless hydration loop: normalize undefined meta fields to null sentinel
            if (typeof obj.picked_date === 'undefined') obj.picked_date = null;
            if (typeof obj.location === 'undefined') obj.location = null; // null means intentionally empty
            hydrated.push(obj);
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

  const t = React.useMemo(() => getDesignTokens('light'), []);

  // Autosave tags, people, date & location when they change (debounced)
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
        const body: any = { tags: expandedTags, people: expandedPeople };
        if (expandedPickedDate) body.picked_date = expandedPickedDate.toISOString();
        if (expandedLat != null && expandedLon != null) body.location = { lat: expandedLat, lon: expandedLon, placeLabel: expandedLocationLabel || 'Unknown' };
        const res = await fetch(`https://coding-bh7d.onrender.com/api/images/${imgId}`, { method:'PATCH', headers, body: JSON.stringify(body) });
        // Update local album state for immediate reflect
        if (res.ok) {
          setAlbum(prev => {
            if (!prev) return prev;
            const imgs = (prev.images||[]).map((im:any) => {
              const idMatch = (im._id || im.id) === imgId;
              if (!idMatch) return im;
              return { ...im, tags: body.tags, people: body.people, picked_date: body.picked_date || im.picked_date, location: body.location || im.location };
            });
            return { ...prev, images: imgs };
          });
        }
      } catch (e) {
        console.log('[Autosave meta] failed', e);
      } finally {
        setSavingMeta(false);
      }
    }, 600);
    return () => { if (metaSaveDebounceRef.current) clearTimeout(metaSaveDebounceRef.current); };
  }, [expandedTags, expandedPeople, expandedPickedDate, expandedLat, expandedLon, expandedLocationLabel, expandedImage]);

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
  const [showMissingData, setShowMissingData] = useState(false);

  // --- Matching & sorting helpers ---
  /**
   * Matching and sorting order notes:
   * 1) Exact date inside selected range gets highest weight. Outside range decays over ~14 days.
   * 2) Location label similarity: exact match (case-insensitive) scores 1. Substring/word overlap yields partial scores.
   * 3) People/tags: +1 per matched item, −0.6 per missing selected item, −0.2 per extra item not in filters.
   * 4) Combined score = date*2 + location*2 + people + tags. We sort descending by this score.
   * 5) Media tab respected (videos currently excluded until supported).
   * 6) Missing data switch optionally filters first (still sorted by match within that subset).
   * 7) Display: show matched location label, matched people, matched tags, and matching date as an inline badge on the image.
   */
  function similarity(a: string, b: string): number {
    if (!a || !b) return 0;
    const A = a.toLowerCase();
    const B = b.toLowerCase();
    if (A === B) return 1;
    if (A.includes(B) || B.includes(A)) return 0.7; // substring proximity
    // token overlap
    const ta = A.split(/[^a-z0-9]+/).filter(Boolean);
    const tb = B.split(/[^a-z0-9]+/).filter(Boolean);
    const setB = new Set(tb);
    const overlap = ta.filter(t => setB.has(t)).length;
    const denom = Math.max(ta.length, tb.length) || 1;
    return Math.min(1, overlap / denom);
  }

  function dateProximityScore(targetStart: Date | null, targetEnd: Date | null, picked: any): number {
    if (!targetStart && !targetEnd) return 0; // no date filter
    if (!picked) return -0.5; // penalize missing date
    let d: Date | null = null;
    try { d = new Date(picked); } catch { d = null; }
    if (!d || isNaN(d.getTime())) return -0.5;
    const t = d.getTime();
    const start = targetStart ? targetStart.getTime() : t;
    const end = targetEnd ? targetEnd.getTime() : start;
    // If single day selected, treat exact-day as perfect and non-match as stronger penalty
    const isSingleDay = !!targetStart && !!targetEnd && targetStart.getTime() === targetEnd.getTime();
    if (t >= start && t <= end) return 1; // inside range: perfect
    // distance penalty: days away
    const distMs = (t < start) ? (start - t) : (t - end);
    const distDays = distMs / (24*60*60*1000);
    // decay: closer gets higher score, far goes to 0
    const score = Math.max(0, 1 - Math.min(1, distDays / 14)); // within 2 weeks yields >0
    // When single day is selected, non-exact matches should rank noticeably lower
    return isSingleDay ? Math.max(-0.3, score * 0.4) : (score * 0.7);
  }

  function peopleTagsScore(selected: string[], actual: any): { score: number; matched: string[]; missing: string[]; extras: string[] } {
    const actualArr: string[] = Array.isArray(actual) ? actual : [];
    const setActual = new Set(actualArr);
    const matched = selected.filter(x => setActual.has(x));
    const missing = selected.filter(x => !setActual.has(x));
    const extras = actualArr.filter(x => !selected.includes(x));
    let score = 0;
    score += matched.length; // reward matches
    score -= missing.length * 0.6; // penalize missing
    score -= extras.length * 0.2; // small penalty for extras
    return { score, matched, missing, extras };
  }

  function locationScore(filterLabel: string | null, imgLoc: any): { score: number; matchedLabel?: string } {
    if (!filterLabel || !filterLabel.trim()) return { score: 0 };
    const label = imgLoc?.placeLabel || '';
    if (!label) return { score: -0.4 };
    const sim = similarity(filterLabel, label);
    return { score: (sim >= 0.99 ? 1 : sim), matchedLabel: sim > 0.3 ? label : undefined };
  }

  function computeImageMatch(img: any) {
    // media type: currently images only
    if (activeTab === 'video') return { score: -999, matched: { tags: [], people: [], label: undefined } };
    const dateScore = dateProximityScore(startDate, endDate, img.picked_date);
    const ppl = peopleTagsScore(selectedPeople, img.people);
    const tg = peopleTagsScore(selectedTags, img.tags);
    const loc = locationScore(location, img.location);
    // Combine: weight date & location higher than extras/missing penalties
  let score = (dateScore * 2) + (loc.score * 2) + ppl.score + tg.score;
    // Determine matching date label (only when inside range or close)
    let dateLabel: string | undefined = undefined;
    let isExactDate = false;
    if (img.picked_date) {
      try {
        const d = new Date(img.picked_date);
        // Only show date tag for exact single-day match (user requested: don't highlight if only close-by)
        if (startDate && endDate && startDate.getTime() === endDate.getTime()) {
          const sameDay = d.toDateString() === startDate.toDateString();
          if (sameDay) {
            dateLabel = d.toLocaleDateString();
            isExactDate = true;
          }
        }
      } catch {}
    }
    // Strong bonus for exact-date to ensure it outranks near dates reliably
    if (isExactDate) score += 1.5;
    return { score, matched: { tags: tg.matched, people: ppl.matched, label: loc.matchedLabel, date: dateLabel }, isExactDate };
  }
  // Date range selection state
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [location, setLocation] = useState<string | null>(null);
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  // Location picker state now handled by shared component; keep only selected label and visibility
  const peoplePool = React.useMemo(() => {
    const names: string[] = [];
    const add = (v?: string | null) => { if (v && !names.includes(v)) names.push(v); };
    const fromUser = (u: any) => u?.username || null;
    if (Array.isArray(album?.users)) {
      for (const u of album!.users!) {
        if (typeof u === 'string') continue; // no way to resolve username without lookup
        add(fromUser(u));
      }
    }
    if (Array.isArray(album?.participants)) {
      for (const u of album!.participants!) add(fromUser(u));
    }
    // Fallbacks to keep UI useful if empty
    if (names.length === 0) ['You','Alice','Bob','Charlie'].forEach(add);
    return names;
  }, [album]);
  const tagPool = ['Vacation', 'Family', 'Work', 'Favorites'];
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  // Location & search helper functions
  const NOMINATIM_HEADERS = React.useMemo(() => ({
    'Accept-Language': 'en',
    'User-Agent': 'FolioApp/1.0 (contact: example@example.com)',
    'Referer': 'https://folio-app.local'
  }), []);

  // Nearby helper handled inside LocationPicker component

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
  // Legacy inline location helpers removed; unified via LocationPicker component

  // Debounced search
  // Legacy search handlers removed; unified via LocationPicker component

  // --- EXIF helpers for upload metadata ---
  const parseDMS = (value: any): number | null => {
    if (value == null) return null;
    if (typeof value === 'number') return value;
    if (Array.isArray(value)) {
      // [deg, min, sec]
      const [d, m = 0, s = 0] = value;
      if (typeof d !== 'number') return null;
      return d + m / 60 + s / 3600;
    }
    if (typeof value === 'string') {
      // formats like "51/1,13/1,2151/100" or "51,13,21.51"
      const parts = value.split(/[ ,]+/).map((p) => {
        if (p.includes('/')) { const [n, d] = p.split('/').map(Number); return d ? n / d : Number(p); }
        return Number(p);
      }).filter((n) => !Number.isNaN(n));
      if (parts.length) {
        const [d, m = 0, s = 0] = parts;
        return d + m / 60 + s / 3600;
      }
    }
    return null;
  };

  const extractExifMetadata = (asset: any): { pickedDateISO?: string; lat?: number; lon?: number } => {
    const out: { pickedDateISO?: string; lat?: number; lon?: number } = {};
    const exif = asset?.exif || asset?.EXIF || null;
    if (exif) {
      // Date
      const dt = exif.DateTimeOriginal || exif.DateTime || exif.DateTimeDigitized || exif.dateTimeOriginal || exif.CreationDate || exif.CreateDate;
      if (typeof dt === 'string') {
        // Convert "YYYY:MM:DD HH:mm:ss" to ISO
        const iso = new Date(dt.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')).toISOString();
        out.pickedDateISO = iso;
      }
      // GPS (varies by platform/vendor)
      let lat: number | null = null; let lon: number | null = null;
      // iOS often nests in {GPS}
      const gps = exif['{GPS}'] || exif.GPS || null;
      if (gps && (gps.Latitude != null && gps.Longitude != null)) {
        lat = parseDMS(gps.Latitude);
        lon = parseDMS(gps.Longitude);
        if (gps.LatitudeRef === 'S') lat = lat != null ? -Math.abs(lat) : lat;
        if (gps.LongitudeRef === 'W') lon = lon != null ? -Math.abs(lon) : lon;
      }
      // Android/others flat keys
      if (lat == null && (exif.GPSLatitude != null && exif.GPSLongitude != null)) {
        lat = parseDMS(exif.GPSLatitude);
        lon = parseDMS(exif.GPSLongitude);
        if (exif.GPSLatitudeRef === 'S') lat = lat != null ? -Math.abs(lat) : lat;
        if (exif.GPSLongitudeRef === 'W') lon = lon != null ? -Math.abs(lon) : lon;
      }
      // Some devices expose decimal degrees as lowercase keys or generic names
      if (lat == null && (exif.latitude != null || exif.Latitude != null)) {
        const v = exif.latitude ?? exif.Latitude;
        lat = typeof v === 'string' ? parseFloat(v) : (typeof v === 'number' ? v : parseDMS(v));
      }
      if (lon == null && (exif.longitude != null || exif.Longitude != null || exif.lng != null)) {
        const v = exif.longitude ?? exif.Longitude ?? exif.lng;
        lon = typeof v === 'string' ? parseFloat(v) : (typeof v === 'number' ? v : parseDMS(v));
      }
      // Combined position string e.g. "51.23, 4.41"
      if ((lat == null || lon == null) && typeof exif.GPSPosition === 'string') {
        const parts = exif.GPSPosition.split(/[;,\s]+/).map((p: string) => parseFloat(p)).filter((n: number) => !Number.isNaN(n));
        if (parts.length >= 2) { lat = lat ?? parts[0]; lon = lon ?? parts[1]; }
      }
      // Validate ranges
      if (typeof lat === 'number' && (lat < -90 || lat > 90)) lat = null;
      if (typeof lon === 'number' && (lon < -180 || lon > 180)) lon = null;
      if (lat != null && lon != null) { out.lat = lat; out.lon = lon; }
    }
    return out;
  };

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
  <Stack.Screen 
    options={{ 
      title: album?.name || 'Album', 
      headerShown: !expandedImage,
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, paddingRight: 10 }}>
          <TouchableOpacity
            onPress={() => setInviteVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Invite people"
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <MaterialIcons name="person-add" size={22} color={t.foreground} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push(`/album/${id}/settings`)}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <MaterialIcons name="settings" size={22} color={t.foreground} />
          </TouchableOpacity>
        </View>
      )
    }} 
  />
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
                    if (showMissingData) arr.push({ key: 'missing', label: 'Missing data: On', icon: 'warning' as any });
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
                {/* Missing data toggle (clear on/off switch) */}
                <View style={[styles.sectionRow, { justifyContent: 'space-between', alignItems: 'center' }]}>                  
                  <ThemedText style={styles.sectionLabel}>Show photos with missing data</ThemedText>
                  <Switch
                    value={showMissingData}
                    onValueChange={setShowMissingData}
                    accessibilityLabel="Show photos with missing data"
                  />
                </View>
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
                {/* Location picker trigger (shared component) */}
                <View style={styles.inputFieldSpaced}>
                  <LocationPicker
                    value={location}
                    onChange={(label, coords) => {
                      setLocation(label);
                      // Optional: could store coords for future filter usage
                    }}
                    visible={locationModalVisible}
                    onVisibleChange={setLocationModalVisible}
                    triggerLabel="Add a location"
                  />
                </View>
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
        {/* Shared modal handled by LocationPicker; inline legacy modal removed */}
      {!loading && !error && (
        <FlatList
          data={(album?.images ?? [])
            .map((im:any, idx:number) => ({ im, match: computeImageMatch(im), __idx: idx }))
            .filter(({ im }) => {
              if (!im) return false;
              if (showMissingData) {
                const missingTags = !Array.isArray(im.tags) || !im.tags.length;
                const missingPeople = !Array.isArray(im.people) || !im.people.length;
                const missingDate = typeof im.picked_date === 'undefined' || im.picked_date === null;
                const missingLoc = typeof im.location === 'undefined' || !im.location || im.location.lat == null || im.location.lon == null;
                return missingTags || missingPeople || missingDate || missingLoc;
              }
              return true;
            })
            .sort((a,b) => {
              // Primary: score desc
              const byScore = (b.match.score - a.match.score);
              if (byScore !== 0) return byScore;
              // Secondary: prefer exact date matches
              const aExact = !!a.match.isExactDate;
              const bExact = !!b.match.isExactDate;
              if (aExact !== bExact) return bExact ? 1 : -1;
              // Tertiary: stable by original index to avoid shuffle
              return a.__idx - b.__idx;
            })
          }
          extraData={{
            startDate: startDate?.getTime?.() ?? null,
            endDate: endDate?.getTime?.() ?? null,
            location,
            selectedPeople: selectedPeople.join('|'),
            selectedTags: selectedTags.join('|'),
            showMissingData,
            activeTab,
            albumImagesVersion: (album?.images || []).map((im:any) => `${im?._id||im?.id||''}:${(im?.picked_date||'')}:${(Array.isArray(im?.tags)?im.tags.join(','):'')}:${(Array.isArray(im?.people)?im.people.join(','):'')}`).join(';')
          }}
          keyExtractor={(item, idx) => (item && typeof item === 'object' && (item as any)._id) ? String((item as any)._id) : String(idx)}
          contentContainerStyle={styles.galleryContent}
          renderItem={({ item }) => {
            const isMapped = (item as any)?.im !== undefined && (item as any)?.match !== undefined;
            const entry:any = isMapped ? (item as any).im : item;
            const matchInfo = isMapped ? (item as any).match : null;
            if (entry?.imagecode) {
              let ref: View | null = null;
              const handlePress = () => {
                const finalize = (layout: { x:number;y:number;width:number;height:number }) => {
                  setExpandedImage({ image: entry, layout });
                  setExpandedTags(Array.isArray((entry as any).tags) ? (entry as any).tags : []);
                  setExpandedPeople(Array.isArray((entry as any).people) ? (entry as any).people : []);
                  const pickedRaw = (entry as any).picked_date;
                  setExpandedPickedDate(pickedRaw ? new Date(pickedRaw) : null);
                  const loc = (entry as any).location;
                  if (loc && (loc.lat != null) && (loc.lon != null)) {
                    setExpandedLat(Number(loc.lat));
                    setExpandedLon(Number(loc.lon));
                    setExpandedLocationLabel(String(loc.placeLabel || ''));
                  } else {
                    setExpandedLat(null); setExpandedLon(null); setExpandedLocationLabel('');
                  }
                  expandProgress.setValue(0);
                  overlayPanY.setValue(0);
                  Animated.timing(expandProgress,{ toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
                };
                try {
                  if (ref && (ref as any).measureInWindow) {
                    (ref as any).measureInWindow((x:number,y:number,width:number,height:number) => {
                      finalize({ x,y,width,height });
                    });
                    return;
                  }
                  if (ref && (ref as any).measure) {
                    (ref as any).measure((x:number,y:number,width:number,height:number,pageX:number,pageY:number) => {
                      finalize({ x: pageX ?? x, y: pageY ?? y, width, height });
                    });
                    return;
                  }
                } catch {}
                finalize({ x: styles.expandedImageTarget.left, y: styles.expandedImageTarget.top, width: styles.expandedImageTarget.width, height: styles.expandedImageTarget.height });
              };
              return (
                <View ref={(r) => { ref = r; }} style={{ width: '100%' }}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={handlePress}
                    accessibilityRole='button'
                    accessibilityLabel='Expand image'
                  >
                    <Image source={{ uri: `data:image/jpeg;base64,${entry.imagecode}` }} style={styles.imageThumb} resizeMode='cover' />
                  </TouchableOpacity>
                  {/* Matching badges overlay inside image frame */}
                  {matchInfo && (
                    <View style={{ position: 'absolute', left: 10, right: 10, bottom: 20, flexDirection: 'row', flexWrap: 'wrap' }}>
                      {/* Date: only shown on exact match; smaller compact pill */}
                      {matchInfo.matched.date && (
                        <View style={{ flexDirection:'row', alignItems:'center', paddingHorizontal:10, paddingVertical:6, borderRadius:14, backgroundColor:'rgba(255,255,255,0.92)', marginRight:6, marginBottom:6, borderWidth:1, borderColor:'#d9d9d9' }}>
                          <MaterialIcons name='calendar-today' size={13} color='#7033ff' style={{ marginRight:6 }} />
                          <ThemedText style={{ fontSize:12, fontWeight:'600', color:'#222' }}>{matchInfo.matched.date}</ThemedText>
                        </View>
                      )}
                      {/* Location label */}
                      {matchInfo.matched.label && (
                        <View style={{ flexDirection:'row', alignItems:'center', paddingHorizontal:10, paddingVertical:6, borderRadius:14, backgroundColor:'rgba(255,255,255,0.92)', marginRight:6, marginBottom:6, borderWidth:1, borderColor:'#d9d9d9' }}>
                          <MaterialIcons name='location-on' size={13} color='#7033ff' style={{ marginRight:6 }} />
                          <ThemedText style={{ fontSize:12, fontWeight:'600', color:'#222' }}>{matchInfo.matched.label}</ThemedText>
                        </View>
                      )}
                      {/* People */}
                      {matchInfo.matched.people.map((p:string, i:number) => (
                        <View key={`mp-${i}`} style={{ flexDirection:'row', alignItems:'center', paddingHorizontal:10, paddingVertical:6, borderRadius:14, backgroundColor:'rgba(255,255,255,0.92)', marginRight:6, marginBottom:6, borderWidth:1, borderColor:'#d9d9d9' }}>
                          <MaterialIcons name='person' size={13} color='#7033ff' style={{ marginRight:6 }} />
                          <ThemedText style={{ fontSize:12, fontWeight:'600', color:'#222' }}>{p}</ThemedText>
                        </View>
                      ))}
                      {/* Tags */}
                      {matchInfo.matched.tags.map((t:string, i:number) => (
                        <View key={`mt-${i}`} style={{ flexDirection:'row', alignItems:'center', paddingHorizontal:10, paddingVertical:6, borderRadius:14, backgroundColor:'rgba(255,255,255,0.92)', marginRight:6, marginBottom:6, borderWidth:1, borderColor:'#d9d9d9' }}>
                          <MaterialIcons name='sell' size={13} color='#7033ff' style={{ marginRight:6 }} />
                          <ThemedText style={{ fontSize:12, fontWeight:'600', color:'#222' }}>{t}</ThemedText>
                        </View>
                      ))}
                    </View>
                  )}
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
                  {/* Date editable field */}
                  <TouchableOpacity style={styles.expandedInputRow} onPress={() => setExpandedDateOpen(true)} accessibilityRole='button' accessibilityLabel='Edit date'>                    
                    <MaterialIcons name='calendar-today' size={18} color='#111' style={{ marginRight:8 }} />
                    <ThemedText style={styles.expandedInputText}>{expandedPickedDate ? expandedPickedDate.toLocaleDateString() : 'Add date'}</ThemedText>
                  </TouchableOpacity>
                  <DatePickerModal
                    locale='en'
                    mode='single'
                    visible={expandedDateOpen}
                    onDismiss={() => setExpandedDateOpen(false)}
                    date={expandedPickedDate || undefined}
                    onConfirm={({ date }) => { setExpandedPickedDate(date || null); setExpandedDateOpen(false); }}
                    saveLabel='Save'
                    uppercase={false}
                    animationType='slide'
                  />
                  {/* Location editable field (shared picker) */}
                  <View style={{ marginBottom: 12 }}>
                    <LocationPicker
                      value={expandedLocationLabel || null}
                      onChange={(label, coords) => {
                        setExpandedLocationLabel(label || '');
                        if (coords) { setExpandedLat(coords.lat); setExpandedLon(coords.lon); }
                      }}
                      visible={expandedEditingLocation}
                      onVisibleChange={setExpandedEditingLocation}
                      triggerLabel='Add location'
                    />
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
      {/* Invite people modal */}
      <Modal visible={inviteVisible} transparent animationType="fade" onRequestClose={() => setInviteVisible(false)}>
        <View style={styles.inviteBackdrop}>
          <View style={[styles.inviteCard, shadows.sm]}>            
            <View style={styles.inviteHeaderRow}>
              <ThemedText style={styles.inviteTitle}>Invite friends</ThemedText>
              <TouchableOpacity onPress={() => setInviteVisible(false)} accessibilityLabel="Close invite">
                <MaterialIcons name="close" size={22} color="#111" />
              </TouchableOpacity>
            </View>
            <ThemedText style={styles.inviteSubtitle}>Add people to your album so they can upload photos too!</ThemedText>
            <ThemedText style={styles.inviteLabel}>Email</ThemedText>
            <TextInput
              value={inviteEmail}
              onChangeText={setInviteEmail}
              placeholder="name@example.com"
              placeholderTextColor="#9a9a9a"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.inviteInput}
            />
            {!!inviteError && <ThemedText style={styles.inviteError}>{inviteError}</ThemedText>}
            {!!inviteSuccessUsername && <ThemedText style={styles.inviteSuccess}>Invited {inviteSuccessUsername}</ThemedText>}
            <TouchableOpacity
              onPress={async () => {
                // basic email validation
                const email = (inviteEmail || '').trim();
                setInviteError(null);
                setInviteSuccessUsername(null);
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                  setInviteError('Please enter a valid email');
                  return;
                }
                try {
                  setInviting(true);
                  // extract token
                  let token: string | null = null;
                  try {
                    const raw = await AsyncStorage.getItem('session');
                    if (raw) { const s = JSON.parse(raw); token = s?.token || s?.accessToken || s?.jwt || s?.authorization || s?.user?.token || null; }
                  } catch {}
                  const headers: Record<string,string> = { 'Content-Type': 'application/json' };
                  if (token) headers['Authorization'] = `Bearer ${token}`;

                  // 1) Resolve email -> user id via GET /api/users (same as create-album flow)
                  const resUsers = await fetch('https://coding-bh7d.onrender.com/api/users', { headers });
                  let usersJson: any = null; try { usersJson = await resUsers.json(); } catch {}
                  if (!resUsers.ok || !Array.isArray(usersJson)) {
                    throw new Error('Unable to fetch users to resolve email');
                  }
                  const lower = email.toLowerCase();
                  const matched = usersJson.find((u: any) => String(u?.email || '').toLowerCase() === lower);
                  if (!matched || !(matched._id || matched.id)) {
                    throw new Error('Unknown user email');
                  }
                  const userId: string = String(matched._id || matched.id);
                  const username: string = matched.username || email.split('@')[0];

                  // 2) Attach user via POST /api/albums/:id/users/attach
                  const resAttach = await fetch(`https://coding-bh7d.onrender.com/api/albums/${id}/users/attach`, {
                    method: 'POST', headers, body: JSON.stringify({ userId })
                  });
                  let attachJson: any = null; try { attachJson = await resAttach.json(); } catch {}
                  if (!resAttach.ok) {
                    const msg = (attachJson && (attachJson.error || attachJson.message)) || `Attach failed (${resAttach.status})`;
                    throw new Error(msg);
                  }

                  setInviteSuccessUsername(username);
                  setInviteEmail('');
                  // Update album from server if provided, else patch locally for immediate feedback
                  if (attachJson?.album) {
                    setAlbum((prev) => ({ ...(prev || {} as any), ...(attachJson.album || {}) } as any));
                  } else {
                    setAlbum(prev => prev ? {
                      ...prev,
                      users: (() => {
                        const list = Array.isArray(prev.users) ? [...prev.users] : [];
                        const exists = list.some((u:any) => (typeof u === 'string' ? u === userId : ((u._id||u.id) === userId)));
                        if (!exists) list.push({ _id: userId, email, username });
                        return list;
                      })(),
                      participants: (() => {
                        const list = Array.isArray(prev.participants) ? [...prev.participants] : [];
                        const exists = list.some((p:any) => ((p._id||p.id) === userId));
                        if (!exists) list.push({ _id: userId, email, username });
                        return list;
                      })(),
                    } : prev);
                  }
                } catch (e: any) {
                  setInviteError(e?.message || 'Failed to invite');
                } finally {
                  setInviting(false);
                }
              }}
              disabled={inviting}
              accessibilityLabel="Invite user by email"
              style={[styles.inviteButton, inviting && { opacity: 0.7 }]}
            >
              {inviting ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.inviteButtonText}>Invite</ThemedText>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  // Invite modal styles
  inviteBackdrop: { flex:1, backgroundColor:'rgba(0,0,0,0.25)', alignItems:'center', justifyContent:'center', padding:20 },
  inviteCard: { width:'100%', maxWidth: 520, backgroundColor:'#fff', borderRadius:18, padding:20, shadowColor:'#000', shadowOpacity:0.15, shadowRadius:12, shadowOffset:{ width:0, height:6 } },
  inviteHeaderRow: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:8 },
  inviteTitle: { fontSize:22, fontWeight:'700', color:'#111' },
  inviteSubtitle: { fontSize:16, color:'#666', marginBottom:16 },
  inviteLabel: { fontSize:16, fontWeight:'700', color:'#111', marginBottom:8 },
  inviteInput: { backgroundColor:'#fff', borderRadius:12, borderWidth:1, borderColor:'#e0e0e0', paddingHorizontal:14, paddingVertical:12, fontSize:15, color:'#111', marginBottom:16 },
  inviteButton: { backgroundColor:'#111', borderRadius:14, alignItems:'center', justifyContent:'center', paddingVertical:14 },
  inviteButtonText: { color:'#fff', fontSize:16, fontWeight:'700' },
  inviteError: { color:'#c00', marginBottom:8, fontWeight:'600' },
  inviteSuccess: { color:'#0a7', marginBottom:8, fontWeight:'600' },
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
