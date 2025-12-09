import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

type AlbumUser = { _id?: string; id?: string; email?: string; username?: string } | string;

export default function AlbumSettingsScreen() {
	const router = useRouter();
	const { id } = useLocalSearchParams<{ id: string }>();

	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [album, setAlbum] = useState<any | null>(null);
	const [name, setName] = useState('');

	const fetchWithToken = async (input: RequestInfo | URL, init: RequestInit = {}) => {
		let token: string | null = null;
		try {
			const raw = await AsyncStorage.getItem('session');
			if (raw) { const s = JSON.parse(raw); token = s?.token || s?.accessToken || s?.jwt || s?.authorization || s?.user?.token || null; }
		} catch {}
		const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.headers as any || {}) };
		if (token) headers['Authorization'] = `Bearer ${token}`;
		return fetch(input, { ...init, headers });
	};

		const loadAlbum = useCallback(async () => {
		setLoading(true); setError(null);
		try {
			// Try populate=users first
			let res = await fetchWithToken(`https://coding-bh7d.onrender.com/api/albums/${id}?populate=users`);
			let json: any = null; try { json = await res.json(); } catch {}
			if (!res.ok) {
				if (res.status === 404) {
					// Fallback to plain GET
					res = await fetchWithToken(`https://coding-bh7d.onrender.com/api/albums/${id}`);
					try { json = await res.json(); } catch {}
					if (!res.ok) throw new Error(`Load failed (${res.status})`);
				} else {
					throw new Error((json && (json.error || json.message)) || `Load failed (${res.status})`);
				}
			}
			setAlbum(json);
			setName(String(json?.name || ''));
		} catch (e: any) {
			setError(e?.message || 'Failed to load album');
		} finally {
			setLoading(false);
		}
			}, [id]);

		useEffect(() => { loadAlbum(); }, [loadAlbum]);

	const userDisplay = (u: AlbumUser) => {
		if (typeof u === 'string') return { id: u, label: u };
		const id = String(u._id || u.id || '');
		const label = u.username || u.email || id;
		return { id, label };
	};

	const users: { id: string; label: string }[] = useMemo(() => {
		const arr: { id: string; label: string }[] = [];
		const list: AlbumUser[] = Array.isArray(album?.users) ? album.users : (Array.isArray(album?.participants) ? album.participants : []);
		for (const u of list) {
			const d = userDisplay(u);
			if (d.id) arr.push(d);
		}
		return arr;
	}, [album]);

	const onSaveName = async () => {
		if (!name.trim()) return;
		setSaving(true);
		try {
			const res = await fetchWithToken(`https://coding-bh7d.onrender.com/api/albums/${id}`, {
				method: 'PATCH',
				body: JSON.stringify({ name: name.trim() })
			});
			let json: any = null; try { json = await res.json(); } catch {}
			if (!res.ok) throw new Error((json && (json.error || json.message)) || `Save failed (${res.status})`);
			setAlbum((prev: any) => ({ ...(prev || {}), ...(json || {}) }));
		} catch (e: any) {
			Alert.alert('Error', e?.message || 'Failed to save name');
		} finally {
			setSaving(false);
		}
	};

	const onRemoveUser = async (removeId: string) => {
		try {
			// Build next user ids list
			const current: AlbumUser[] = Array.isArray(album?.users) ? album.users : [];
			const ids = current.map((u: AlbumUser) => typeof u === 'string' ? u : String(u._id || u.id || '')).filter(Boolean);
			const next = ids.filter((x: string) => x !== removeId);
			const res = await fetchWithToken(`https://coding-bh7d.onrender.com/api/albums/${id}`, {
				method: 'PATCH',
				body: JSON.stringify({ users: next })
			});
			let json: any = null; try { json = await res.json(); } catch {}
			if (!res.ok) throw new Error((json && (json.error || json.message)) || `Remove failed (${res.status})`);
			setAlbum((prev: any) => ({ ...(prev || {}), ...(json || {}) }));
		} catch (e: any) {
			Alert.alert('Error', e?.message || 'Failed to remove user');
		}
	};

	const onDeleteAlbum = async () => {
		Alert.alert('Delete album?', 'This cannot be undone.', [
			{ text: 'Cancel', style: 'cancel' },
			{ text: 'Delete', style: 'destructive', onPress: async () => {
				setDeleting(true);
				try {
					const res = await fetchWithToken(`https://coding-bh7d.onrender.com/api/albums/${id}`, { method: 'DELETE' });
					if (!res.ok) throw new Error(`Delete failed (${res.status})`);
					router.replace('/(tabs)/albums');
				} catch (e: any) {
					Alert.alert('Error', e?.message || 'Failed to delete album');
				} finally {
					setDeleting(false);
				}
			} }
		]);
	};

	return (
		<ThemedView style={styles.container}>
			<Stack.Screen options={{ title: 'Album settings' }} />
			{loading ? (
				<View style={styles.center}><ActivityIndicator /></View>
			) : error ? (
				<ThemedText style={styles.error}>{error}</ThemedText>
			) : (
				<>
					<ThemedText style={styles.label}>Album name</ThemedText>
					<View style={styles.row}>
						<TextInput
							style={styles.input}
							value={name}
							onChangeText={setName}
							placeholder="Album name"
							placeholderTextColor="#9a9a9a"
						/>
						<TouchableOpacity style={[styles.actionBtn, saving && { opacity: 0.7 }]} onPress={onSaveName} disabled={saving}>
							{saving ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.actionBtnText}>Save</ThemedText>}
						</TouchableOpacity>
					</View>

					<ThemedText style={[styles.label, { marginTop: 16 }]}>People in album</ThemedText>
					{users.length === 0 ? (
						<ThemedText style={styles.empty}>No people yet.</ThemedText>
					) : (
						<FlatList
							data={users}
							keyExtractor={(u) => u.id}
							renderItem={({ item }) => (
								<View style={styles.userRow}>
									<View style={styles.userLeft}>
										<MaterialIcons name="person" size={18} color="#222" style={{ marginRight: 8 }} />
										<ThemedText style={styles.userText}>{item.label}</ThemedText>
									</View>
									<TouchableOpacity onPress={() => onRemoveUser(item.id)} accessibilityLabel="Remove user" style={styles.removeBtn}>
										<MaterialIcons name="remove-circle-outline" size={20} color="#c00" />
									</TouchableOpacity>
								</View>
							)}
							ItemSeparatorComponent={() => <View style={styles.sep} />}
						/>
					)}

					<TouchableOpacity style={[styles.deleteBtn, deleting && { opacity: 0.7 }]} onPress={onDeleteAlbum} disabled={deleting}>
						{deleting ? <ActivityIndicator color="#fff" /> : (
							<View style={{ flexDirection: 'row', alignItems: 'center' }}>
								<MaterialIcons name="delete" size={18} color="#fff" style={{ marginRight: 8 }} />
								<ThemedText style={styles.deleteBtnText}>Delete album</ThemedText>
							</View>
						)}
					</TouchableOpacity>
				</>
			)}
		</ThemedView>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
	center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
	error: { color: '#c00' },
	label: { fontSize: 14, fontWeight: '700', marginBottom: 8, color: '#111' },
	row: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
	input: { flex: 1, borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, backgroundColor: '#fff' },
	actionBtn: { marginLeft: 10, backgroundColor: '#111', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10 },
	actionBtnText: { color: '#fff', fontWeight: '700' },
	empty: { color: '#666', fontStyle: 'italic', marginBottom: 8 },
	userRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
	userLeft: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
	userText: { color: '#111' },
	removeBtn: { padding: 8 },
	sep: { height: 1, backgroundColor: '#eee' },
	deleteBtn: { marginTop: 24, backgroundColor: '#c00', paddingVertical: 14, alignItems: 'center', borderRadius: 12 },
	deleteBtnText: { color: '#fff', fontWeight: '700' },
});

