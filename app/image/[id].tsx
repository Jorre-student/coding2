import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Image, KeyboardAvoidingView, PanResponder, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { DatePickerModal } from 'react-native-paper-dates';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ImageShape { _id?: string; id?: string; imagecode?: string; base64?: string; owner?: any; user?: any; uploadedBy?: any; tags?: string[]; }

const TAG_POOL = ['Food','Group','Boat','Sun','Family','Work','People'];
const PEOPLE_POOL = ['Jorre','John','Alice','Bob'];

export default function ImageFullscreenScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [imageData, setImageData] = useState<ImageShape | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [savingTags, setSavingTags] = useState(false);
  // Use number for timeout id to satisfy web/native TypeScript overlap
  const saveDebounceRef = useRef<number | null>(null);
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [date, setDate] = useState<Date | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const [location, setLocation] = useState<string>('');

  // Fetch image metadata
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!id) return;
      setLoading(true); setError(null);
      try {
        let token: string | null = null;
        try { const raw = await AsyncStorage.getItem('session'); if (raw) { const s = JSON.parse(raw); token = s?.token || s?.accessToken || s?.jwt || s?.authorization || s?.user?.token || null; } } catch {}
        const headers: Record<string,string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`https://coding-bh7d.onrender.com/api/images/${id}`, { headers });
        let json: any = null; try { json = await res.json(); } catch {}
        if (!res.ok) throw new Error((json && (json.error || json.message)) || `Fetch failed (${res.status})`);
        if (mounted) {
          setImageData(json);
          setTags(Array.isArray(json?.tags) ? json.tags : []);
        }
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Failed to load image');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id]);

  // Debounced tag save
  useEffect(() => {
    if (!imageData) return;
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = setTimeout(async () => {
      try {
        setSavingTags(true);
        let token: string | null = null;
        try { const raw = await AsyncStorage.getItem('session'); if (raw) { const s = JSON.parse(raw); token = s?.token || s?.accessToken || s?.jwt || s?.authorization || s?.user?.token || null; } } catch {}
        const headers: Record<string,string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        await fetch(`https://coding-bh7d.onrender.com/api/images/${id}`, { method: 'PATCH', headers, body: JSON.stringify({ tags }) });
      } catch {
        // swallow for now, could surface error state
      } finally {
        setSavingTags(false);
      }
    }, 600); // debounce
    return () => { if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current); };
  }, [tags, imageData, id]);

  // Extract uploader name
  const uploaderObj = imageData?.owner || imageData?.user || imageData?.uploadedBy || null;
  const uploaderName = (uploaderObj && (uploaderObj.name || uploaderObj.username)) || uploaderObj || 'Unknown';

  // Gesture dismiss
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = translateY.interpolate({ inputRange: [0, 250], outputRange: [1, 0.6], extrapolate: 'clamp' });
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > Math.abs(g.dx) && g.dy > 6,
      onPanResponderMove: (_e, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 160 || g.vy > 0.9) {
          Animated.timing(translateY, { toValue: 800, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => {
            router.back();
          });
        } else {
          Animated.timing(translateY, { toValue: 0, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
        }
      }
    })
  ).current;

  const handleToggleTag = (tag: string) => {
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const bigImageURI = imageData?.imagecode || imageData?.base64;
  const composedURI = bigImageURI ? `data:image/jpeg;base64,${bigImageURI}` : undefined;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ThemedView style={styles.screenRoot}>
      <Stack.Screen options={{ headerShown: false }} />
      <Animated.View style={[styles.dragContainer, { transform: [{ translateY }], opacity }]} {...panResponder.panHandlers}>
        <ScrollView contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          <View style={{ height: insets.top + 4 }} />
          {/* Header */}
          <View style={styles.topHeader}>            
            <ThemedText style={styles.uploadedByLabel}>Uploaded by</ThemedText>
            <View style={styles.uploaderInline}>              
              <View style={styles.avatarCircle}><MaterialIcons name="person" size={20} color="#111" /></View>
              <ThemedText style={styles.uploaderName}>{uploaderName}</ThemedText>
            </View>
            <TouchableOpacity style={styles.deleteBtn} accessibilityRole="button" accessibilityLabel="Delete image" onPress={async () => {
              try {
                let token: string | null = null;
                try { const raw = await AsyncStorage.getItem('session'); if (raw) { const s = JSON.parse(raw); token = s?.token || s?.accessToken || s?.jwt || s?.authorization || s?.user?.token || null; } } catch {}
                const headers: Record<string,string> = { 'Content-Type': 'application/json' };
                if (token) headers['Authorization'] = `Bearer ${token}`;
                if (!id) return;
                const resDel = await fetch(`https://coding-bh7d.onrender.com/api/images/${id}`, { method:'DELETE', headers });
                if (!resDel.ok) {
                  console.log('[Fullscreen delete] status', resDel.status);
                }
              } catch (e) {
                console.log('[Fullscreen delete] failed', e);
              } finally {
                router.back();
              }
            }}>
              <MaterialIcons name="delete" size={22} color="#c00" />
            </TouchableOpacity>
          </View>
          {/* Image */}
          <View style={styles.imageOuter}>            
            {loading && <ActivityIndicator style={{ marginTop: 120 }} />}
            {error && !loading && <ThemedText style={styles.error}>{error}</ThemedText>}
            {!loading && !error && composedURI && (
              <Image source={{ uri: composedURI }} style={styles.heroImage} resizeMode="cover" />
            )}
          </View>
          {/* Download */}
          <TouchableOpacity style={styles.downloadButton} onPress={() => {/* TODO implement download */}} accessibilityRole="button" accessibilityLabel="Download image">
            <MaterialIcons name="download" size={22} color="#fff" style={{ marginRight: 8 }} />
            <ThemedText style={styles.downloadText}>Download</ThemedText>
          </TouchableOpacity>
          {/* Info Card */}
          <View style={styles.infoCard}>
            <ThemedText style={styles.infoTitle}>Information:</ThemedText>
            {/* Date */}
            <TouchableOpacity onPress={() => setDateOpen(true)} style={styles.inputField} accessibilityRole="button" accessibilityLabel="Select date">
              <MaterialIcons name="calendar-today" size={20} color="#111" style={styles.inputIcon} />
              <ThemedText style={styles.inputText}>{date ? date.toLocaleDateString() : 'Select date'}</ThemedText>
            </TouchableOpacity>
            <DatePickerModal
              locale="en"
              mode="single"
              visible={dateOpen}
              date={date || undefined}
              onDismiss={() => setDateOpen(false)}
              onConfirm={({ date: d }) => { setDate(d || null); setDateOpen(false); }}
              saveLabel="Save"
              animationType="slide"
              uppercase={false}
            />
            {/* Location */}
            <View style={[styles.inputField, { marginTop: 16 }]}>              
              <MaterialIcons name="location-on" size={22} color="#111" style={styles.inputIcon} />
              <TextInput
                value={location}
                onChangeText={setLocation}
                placeholder="Add location"
                placeholderTextColor="#666"
                style={styles.textInput}
              />
            </View>
            {/* People */}
            <View style={styles.sectionBlock}>
              <ThemedText style={styles.sectionLabel}>People</ThemedText>
              <View style={styles.chipRow}>                
                <TouchableOpacity style={styles.plusChip} onPress={() => { /* future add person */ }}>
                  <MaterialIcons name="add" size={20} color="#111" />
                </TouchableOpacity>
                {PEOPLE_POOL.map(p => {
                  const active = selectedPeople.includes(p);
                  return (
                    <TouchableOpacity
                      key={p}
                      onPress={() => setSelectedPeople(prev => active ? prev.filter(x => x!==p) : [...prev, p])}
                      style={[styles.personChip, active && styles.personChipActive]}
                      accessibilityRole="button"
                      accessibilityLabel={active ? `Remove person ${p}` : `Add person ${p}`}
                    >
                      <View style={styles.avatarMini}><MaterialIcons name="person" size={16} color={active ? '#1e63ff' : '#111'} /></View>
                      <ThemedText style={[styles.personChipText, active && styles.personChipTextActive]}>{p}</ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            {/* Tags */}
            <View style={styles.sectionBlock}>
              <ThemedText style={styles.sectionLabel}>Tags</ThemedText>
              <View style={styles.chipRow}>
                {TAG_POOL.map(tag => {
                  const active = tags.includes(tag);
                  return (
                    <TouchableOpacity
                      key={tag}
                      onPress={() => handleToggleTag(tag)}
                      style={[styles.tagChipNew, active && styles.tagChipNewActive]}
                      accessibilityRole="button"
                      accessibilityLabel={active ? `Remove tag ${tag}` : `Add tag ${tag}`}
                    >
                      <ThemedText style={[styles.tagChipNewText, active && styles.tagChipNewTextActive]}>{tag}</ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {savingTags && <ThemedText style={styles.savingIndicator}>Saving tags...</ThemedText>}
            </View>
          </View>
        </ScrollView>
        {/* Close affordance (invisible area) */}
        <TouchableOpacity style={styles.closeDragZone} activeOpacity={1} onPress={() => router.back()} />
      </Animated.View>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screenRoot: { flex: 1, backgroundColor: '#fff' },
  dragContainer: { flex: 1 },
  topHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 },
  uploadedByLabel: { fontSize: 14, fontWeight: '500', color: '#555', marginRight: 10 },
  uploaderInline: { flexDirection: 'row', alignItems: 'center', marginRight: 'auto' },
  avatarCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f1f1f1', alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  uploaderName: { fontSize: 16, fontWeight: '600', color: '#111' },
  deleteBtn: { padding: 8 },
  imageOuter: { paddingHorizontal: 20, marginBottom: 16 },
  heroImage: { width: '100%', height: 380, borderRadius: 0, backgroundColor: '#ddd' },
  downloadButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#111', marginHorizontal: 20, paddingVertical: 14, borderRadius: 8, marginBottom: 24 },
  downloadText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  infoCard: { marginHorizontal: 20, backgroundColor: '#fff', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#e5e5e5', marginBottom: 24 },
  infoTitle: { fontSize: 16, fontWeight: '600', marginBottom: 18 },
  inputField: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#ddd', paddingHorizontal: 14, paddingVertical: 12 },
  inputIcon: { marginRight: 10 },
  inputText: { fontSize: 14, fontWeight: '500', color: '#111' },
  textInput: { flex: 1, fontSize: 14, color: '#111', padding: 0 },
  sectionBlock: { marginTop: 24 },
  sectionLabel: { fontSize: 14, fontWeight: '600', marginBottom: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  plusChip: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#ddd', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fafafa' },
  personChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 22, borderWidth: 2, borderColor: 'transparent', backgroundColor: '#f6f6f6' },
  personChipActive: { borderColor: '#1e63ff', backgroundColor: '#fff' },
  avatarMini: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#e9e9e9', alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  personChipText: { fontSize: 14, fontWeight: '500', color: '#111' },
  personChipTextActive: { color: '#1e63ff', fontWeight: '600' },
  tagChipNew: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 22, borderWidth: 2, borderColor: 'transparent', backgroundColor: '#f6f6f6' },
  tagChipNewActive: { borderColor: '#1e63ff', backgroundColor: '#fff' },
  tagChipNewText: { fontSize: 14, fontWeight: '500', color: '#111' },
  tagChipNewTextActive: { color: '#1e63ff', fontWeight: '600' },
  savingIndicator: { marginTop: 10, fontSize: 12, fontWeight: '500', color: '#555' },
  closeDragZone: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 10 },
  error: { color: '#c00', fontWeight: '600', marginTop: 12 }
});
