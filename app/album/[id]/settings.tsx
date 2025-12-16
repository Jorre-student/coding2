import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

// type AlbumUser = { _id?: string; id?: string; email?: string; username?: string } | string;

export default function AlbumSettingsScreen() {
	const router = useRouter();
	const { id } = useLocalSearchParams<{ id: string }>();

	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [album, setAlbum] = useState<any | null>(null);
	const [name, setName] = useState('');
		const [newPerson, setNewPerson] = useState('');
		const [addingPerson, setAddingPerson] = useState(false);
		const [newTag, setNewTag] = useState('');
		const [addingTag, setAddingTag] = useState(false);
			const [newUserEmail, setNewUserEmail] = useState('');
			const [addingUser, setAddingUser] = useState(false);

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

		// Helper kept for future UI when showing populated users
		// const userDisplay = (u: AlbumUser) => {
		//   if (typeof u === 'string') return { id: u, label: u };
		//   const id = String(u._id || u.id || '');
		//   const label = u.username || u.email || id;
		//   return { id, label };
		// };

		// Derived users list retained for future use (not directly rendered now)
		// const users: { id: string; label: string }[] = useMemo(() => {
		//   const arr: { id: string; label: string }[] = [];
		//   const list: AlbumUser[] = Array.isArray(album?.users) ? album.users : (Array.isArray(album?.participants) ? album.participants : []);
		//   for (const u of list) {
		//     const d = userDisplay(u);
		//     if (d.id) arr.push(d);
		//   }
		//   return arr;
		// }, [album]);

			// Derive linked users with username + email (for display) and non-user people
			const linkedUsers: { id: string; username: string; email?: string }[] = useMemo(() => {
				const out: { id: string; username: string; email?: string }[] = [];
				const list: any[] = Array.isArray(album?.users) ? album!.users! : [];
				for (const u of list) {
					if (typeof u === 'string') {
						// If server returns id string, show id as username until populated
						out.push({ id: u, username: u });
					} else {
						const id = String(u?._id || u?.id || '');
						const username = String(u?.username || id || '');
						const email = (u?.email ? String(u.email) : undefined);
						out.push({ id, username, email });
					}
				}
				return out.sort((a,b)=> a.username.localeCompare(b.username));
			}, [album]);

			const nonUserPeople: string[] = useMemo(() => {
				const peopleArr: string[] = Array.isArray(album?.people) ? (album!.people as any[]).filter((p) => typeof p === 'string').map((p) => String(p)) : [];
				const usernames = new Set(linkedUsers.map(u => u.username.toLowerCase()));
				// Filter out names that are already users (case-insensitive)
				return peopleArr.filter(p => !usernames.has(p.toLowerCase())).sort((a,b)=>a.localeCompare(b));
			}, [album, linkedUsers]);

		const onAddPeople = async () => {
			const name = (newPerson || '').trim();
			if (!name) return;
			setAddingPerson(true);
			try {
				const res = await fetchWithToken(`https://coding-bh7d.onrender.com/api/albums/${id}/people/add`, {
					method: 'POST',
					body: JSON.stringify({ people: [name] })
				});
				let json: any = null; try { json = await res.json(); } catch {}
				if (!res.ok) throw new Error((json && (json.error || json.message)) || `Add failed (${res.status})`);
				setNewPerson('');
				await loadAlbum();
			} catch (e: any) {
				Alert.alert('Error', e?.message || 'Failed to add person');
			} finally {
				setAddingPerson(false);
			}
		};

		const onRemovePerson = async (name: string) => {
			try {
				const res = await fetchWithToken(`https://coding-bh7d.onrender.com/api/albums/${id}/people/remove`, {
					method: 'POST',
					body: JSON.stringify({ people: [name] })
				});
				let json: any = null; try { json = await res.json(); } catch {}
				if (!res.ok) throw new Error((json && (json.error || json.message)) || `Remove failed (${res.status})`);
				await loadAlbum();
			} catch (e: any) {
				Alert.alert('Error', e?.message || 'Failed to remove person');
			}
		};

		// Tags management
		const tagsList: string[] = useMemo(() => {
			const arr: string[] = Array.isArray(album?.tags) ? album.tags.filter((t: any) => typeof t === 'string').map((t: string) => t) : [];
			return arr.sort((a,b)=>a.localeCompare(b));
		}, [album]);

		const onAddTag = async () => {
			const tag = (newTag || '').trim();
			if (!tag) return;
			setAddingTag(true);
			try {
				const res = await fetchWithToken(`https://coding-bh7d.onrender.com/api/albums/${id}/tags/add`, {
					method: 'POST',
					body: JSON.stringify({ tags: [tag] })
				});
				let json: any = null; try { json = await res.json(); } catch {}
				if (!res.ok) throw new Error((json && (json.error || json.message)) || `Add failed (${res.status})`);
				setNewTag('');
				await loadAlbum();
			} catch (e: any) {
				Alert.alert('Error', e?.message || 'Failed to add tag');
			} finally {
				setAddingTag(false);
			}
		};

		const onRemoveTag = async (tag: string) => {
			try {
				const res = await fetchWithToken(`https://coding-bh7d.onrender.com/api/albums/${id}/tags/remove`, {
					method: 'POST',
					body: JSON.stringify({ tags: [tag] })
				});
				let json: any = null; try { json = await res.json(); } catch {}
				if (!res.ok) throw new Error((json && (json.error || json.message)) || `Remove failed (${res.status})`);
				await loadAlbum();
			} catch (e: any) {
				Alert.alert('Error', e?.message || 'Failed to remove tag');
			}
		};

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

			// User removal is accessible from album users section above; retained handler for potential reuse
				// const onRemoveUser = async (removeId: string) => {
				//   try {
				//     const res = await fetchWithToken(`https://coding-bh7d.onrender.com/api/albums/${id}/users/${removeId}`, {
				//       method: 'DELETE'
				//     });
				//     let json: any = null; try { json = await res.json(); } catch {}
				//     if (!res.ok) throw new Error((json && (json.error || json.message)) || `Remove failed (${res.status})`);
				//     await loadAlbum();
				//   } catch (e: any) {
				//     Alert.alert('Error', e?.message || 'Failed to remove user');
				//   }
				// };

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

		// Add linked user by email -> resolve id -> attach
		const onAddLinkedUser = async () => {
			const email = (newUserEmail || '').trim();
			if (!email) return;
			if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { Alert.alert('Invalid email', 'Enter a valid email address'); return; }
			setAddingUser(true);
			try {
				// get token and headers
				let token: string | null = null;
				try { const raw = await AsyncStorage.getItem('session'); if (raw) { const s = JSON.parse(raw); token = s?.token || s?.accessToken || s?.jwt || s?.authorization || s?.user?.token || null; } } catch {}
				const headers: Record<string, string> = { 'Content-Type': 'application/json' };
				if (token) headers['Authorization'] = `Bearer ${token}`;
				// resolve user id
				const resUsers = await fetch('https://coding-bh7d.onrender.com/api/users', { headers });
				let usersJson: any = null; try { usersJson = await resUsers.json(); } catch {}
				if (!resUsers.ok || !Array.isArray(usersJson)) throw new Error('Unable to fetch users');
				const lower = email.toLowerCase();
				const matched = usersJson.find((u: any) => String(u?.email || '').toLowerCase() === lower);
				if (!matched || !(matched._id || matched.id)) throw new Error('User not found');
				const userId: string = String(matched._id || matched.id);
				// attach
				const resAttach = await fetch(`https://coding-bh7d.onrender.com/api/albums/${id}/users/attach`, { method: 'POST', headers, body: JSON.stringify({ userId }) });
				let attachJson: any = null; try { attachJson = await resAttach.json(); } catch {}
				if (!resAttach.ok) throw new Error((attachJson && (attachJson.error || attachJson.message)) || `Attach failed (${resAttach.status})`);
				setNewUserEmail('');
				await loadAlbum();
			} catch (e: any) {
				Alert.alert('Error', e?.message || 'Failed to add user');
			} finally {
				setAddingUser(false);
			}
		};

		return (
			<KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
				<ThemedView style={styles.container}>
				<Stack.Screen options={{ title: 'Album settings' }} />
				{loading ? (
					<View style={styles.center}><ActivityIndicator /></View>
				) : error ? (
					<ThemedText style={styles.error}>{error}</ThemedText>
				) : (
							<FlatList
						data={[{ key: 'content' }]}
						keyExtractor={(item) => item.key}
								contentContainerStyle={{ paddingBottom: 28 }}
						renderItem={() => (
							<View>
										<ThemedText style={styles.heading}>Album</ThemedText>
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

										<ThemedText style={[styles.heading, { marginTop: 16 }]}>Members</ThemedText>
										{/* Add linked user by email */}
										<View style={styles.row}>
											<TextInput
												style={styles.input}
												value={newUserEmail}
												onChangeText={setNewUserEmail}
												placeholder="Add member by email"
												placeholderTextColor="#9a9a9a"
												keyboardType="email-address"
												autoCapitalize="none"
											/>
											<TouchableOpacity style={[styles.actionBtn, addingUser && { opacity: 0.7 }]} onPress={onAddLinkedUser} disabled={addingUser}>
												{addingUser ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.actionBtnText}>Add</ThemedText>}
											</TouchableOpacity>
										</View>
								{linkedUsers.length === 0 ? (
									<ThemedText style={styles.empty}>No linked users yet.</ThemedText>
								) : (
									<FlatList
										data={linkedUsers}
										keyExtractor={(u) => u.id}
										renderItem={({ item }) => (
											<View style={styles.userRow}>
												<View style={styles.userLeft}>
													<MaterialIcons name="person" size={18} color="#222" style={{ marginRight: 8 }} />
													<ThemedText style={styles.userText}>{item.username}</ThemedText>
													{!!item.email && <ThemedText style={styles.mutedEmail}>  {item.email}</ThemedText>}
												</View>
												{!!item.id && (
													<TouchableOpacity onPress={async () => {
														try {
															const res = await fetchWithToken(`https://coding-bh7d.onrender.com/api/albums/${id}/users/${item.id}`, { method: 'DELETE' });
															let json: any = null; try { json = await res.json(); } catch {}
															if (!res.ok) throw new Error((json && (json.error || json.message)) || `Remove failed (${res.status})`);
															await loadAlbum();
														} catch (e: any) {
															Alert.alert('Error', e?.message || 'Failed to remove user');
														}
													}} accessibilityLabel="Remove linked user" style={styles.removeBtn}>
														<MaterialIcons name="remove-circle-outline" size={20} color="#c00" />
													</TouchableOpacity>
												)}
											</View>
										)}
										ItemSeparatorComponent={() => <View style={styles.sep} />}
									/>
								)}

												<ThemedText style={[styles.heading, { marginTop: 16 }]}>Other people</ThemedText>
								<View style={styles.row}>
									<TextInput
										style={styles.input}
										value={newPerson}
										onChangeText={setNewPerson}
										placeholder="Add a person by name"
										placeholderTextColor="#9a9a9a"
									/>
									<TouchableOpacity style={[styles.actionBtn, addingPerson && { opacity: 0.7 }]} onPress={onAddPeople} disabled={addingPerson}>
										{addingPerson ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.actionBtnText}>Add</ThemedText>}
									</TouchableOpacity>
								</View>
								{nonUserPeople.length === 0 ? (
									<ThemedText style={styles.empty}>No other people yet.</ThemedText>
								) : (
									<FlatList
										data={nonUserPeople}
										keyExtractor={(name) => name}
										renderItem={({ item }) => (
											<View style={styles.userRow}>
												<View style={styles.userLeft}>
													<MaterialIcons name="person" size={18} color="#222" style={{ marginRight: 8 }} />
													<ThemedText style={styles.userText}>{item}</ThemedText>
												</View>
												<TouchableOpacity onPress={() => onRemovePerson(item)} accessibilityLabel="Remove person" style={styles.removeBtn}>
													<MaterialIcons name="remove-circle-outline" size={20} color="#c00" />
												</TouchableOpacity>
											</View>
										)}
										ItemSeparatorComponent={() => <View style={styles.sep} />}
									/>
								)}

												<ThemedText style={[styles.heading, { marginTop: 16 }]}>Tags</ThemedText>
								<View style={styles.row}>
									<TextInput
										style={styles.input}
										value={newTag}
										onChangeText={setNewTag}
										placeholder="Add a tag"
										placeholderTextColor="#9a9a9a"
									/>
									<TouchableOpacity style={[styles.actionBtn, addingTag && { opacity: 0.7 }]} onPress={onAddTag} disabled={addingTag}>
										{addingTag ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.actionBtnText}>Add</ThemedText>}
									</TouchableOpacity>
								</View>
								{tagsList.length === 0 ? (
									<ThemedText style={styles.empty}>No tags yet.</ThemedText>
								) : (
									<FlatList
										data={tagsList}
										keyExtractor={(tag) => tag}
										renderItem={({ item }) => (
											<View style={styles.userRow}>
												<View style={styles.userLeft}>
													<MaterialIcons name="sell" size={18} color="#222" style={{ marginRight: 8 }} />
													<ThemedText style={styles.userText}>{item}</ThemedText>
												</View>
												<TouchableOpacity onPress={() => onRemoveTag(item)} accessibilityLabel="Remove tag" style={styles.removeBtn}>
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
											<MaterialIcons name="delete" size={16} color="#fff" style={{ marginRight: 6 }} />
											<ThemedText style={styles.deleteBtnText}>Delete album</ThemedText>
										</View>
									)}
								</TouchableOpacity>
							</View>
						)}
					/>
				)}
				</ThemedView>
			</KeyboardAvoidingView>
		);
}

const styles = StyleSheet.create({
	container: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
	center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
	error: { color: '#c00' },
		heading: { fontSize: 16, fontWeight: '700', marginBottom: 8, color: '#111' },
	label: { fontSize: 14, fontWeight: '700', marginBottom: 8, color: '#111' },
		row: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
		input: { flex: 1, height: 44, borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10, paddingHorizontal: 12, fontSize: 15, backgroundColor: '#fff' },
		actionBtn: { marginLeft: 10, height: 44, minWidth: 72, backgroundColor: '#111', paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
	actionBtnText: { color: '#fff', fontWeight: '700' },
	empty: { color: '#666', fontStyle: 'italic', marginBottom: 8 },
	userRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
	userLeft: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
	userText: { color: '#111' },
	removeBtn: { padding: 8 },
	sep: { height: 1, backgroundColor: '#eee' },
		deleteBtn: { marginTop: 24, backgroundColor: '#c00', paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center', borderRadius: 10, alignSelf: 'flex-start' },
		deleteBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
		mutedEmail: { color: '#888', marginLeft: 6 },
});

