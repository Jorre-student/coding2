import { ThemedText } from '@/components/themed-text';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Location from 'expo-location';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

type Props = {
  value: string | null;
  onChange: (label: string | null, coords?: { lat: number; lon: number } | undefined) => void;
  visible: boolean;
  onVisibleChange: (v: boolean) => void;
  triggerLabel?: string;
};

// Reuse the same headers and label formatter as filters
const NOMINATIM_HEADERS = {
  'Accept-Language': 'en',
  'User-Agent': 'FolioApp/1.0 (contact: example@example.com)',
  'Referer': 'https://folio-app.local'
};

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

export default function LocationPicker({ value, onChange, visible, onVisibleChange, triggerLabel }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [nearby, setNearby] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

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
  }, []);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!visible) return; // only when modal open
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      performSearch(searchQuery);
    }, 300);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [searchQuery, visible, performSearch]);

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

  const handlePickCurrentLocation = async () => {
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
      onChange(label, { lat: pos.coords.latitude, lon: pos.coords.longitude });
      fetchNearbyLocations(pos.coords.latitude, pos.coords.longitude);
    } catch (e: any) {
      setLocationError(e?.message || 'Location unavailable');
    } finally {
      setLocationLoading(false);
    }
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => onVisibleChange(true)}
        style={styles.inputField}
        accessibilityRole="button"
        accessibilityLabel={value ? 'Location selected' : 'Open location picker'}
      >
        <MaterialIcons name="location-on" size={20} color="#444" style={styles.inputIcon} />
        <ThemedText style={styles.inputPlaceholder}>
          {value ? value : (locationLoading ? 'Fetching...' : (triggerLabel || 'Add a location'))}
        </ThemedText>
      </TouchableOpacity>
      {visible && (
        <Modal visible animationType="slide" transparent onRequestClose={() => onVisibleChange(false)}>
          <View style={styles.locationModalBackdrop}>
            <View style={styles.locationModal}>
              <View style={styles.locationModalHeader}>
                <ThemedText style={styles.locationModalTitle}>Add Location</ThemedText>
                <TouchableOpacity onPress={() => onVisibleChange(false)} accessibilityRole="button" accessibilityLabel="Close location picker">
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
                  <TouchableOpacity style={styles.locationItem} onPress={() => { if (value) { onVisibleChange(false); } else { handlePickCurrentLocation(); } }}>
                    {locationLoading ? <ActivityIndicator size="small" color="#444" /> : (
                      <ThemedText style={styles.locationItemText}>{value || (locationError || 'Tap to fetch current location')}</ThemedText>
                    )}
                  </TouchableOpacity>
                </View>
                {!!nearby.length && (
                  <View style={styles.locationSection}>
                    <ThemedText style={styles.locationSectionTitle}>Nearby</ThemedText>
                    {nearby.map((n, idx) => (
                        <TouchableOpacity key={`nearby-${idx}`} style={styles.locationItem} onPress={() => { onChange(n); onVisibleChange(false); }}>
                          <ThemedText style={styles.locationItemText}>{n}</ThemedText>
                        </TouchableOpacity>
                      ))}
                  </View>
                )}
                {!!searchResults.length && (
                  <View style={styles.locationSection}>
                    <ThemedText style={styles.locationSectionTitle}>Search Results</ThemedText>
                    {searchResults.map((r, idx) => (
                      <TouchableOpacity key={`search-${idx}`} style={styles.locationItem} onPress={() => { onChange(r); onVisibleChange(false); }}>
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
    </>
  );
}

const styles = StyleSheet.create({
  inputField: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: '#e2e2e2' },
  inputIcon: { marginRight: 10 },
  inputPlaceholder: { fontSize: 14, color: '#444', fontWeight: '500' },
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
});
