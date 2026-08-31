import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { API_URL } from './src/config';

const pad = (value) => String(value).padStart(2, '0');
const localDate = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const formatMinutes = (minutes = 0) => `${pad(Math.floor(minutes / 60))}h ${pad(Math.round(minutes % 60))}min`;
const formatTime = (value) => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const formatDate = (value) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(`${value}T12:00:00`));

export default function App() {
  const [data, setData] = useState({ records: [], summary: {} });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [leaveDate, setLeaveDate] = useState(localDate());
  const [reason, setReason] = useState('Folga');

  const request = async (path, options = {}) => {
    let response;
    try {
      response = await fetch(`${API_URL}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });
    } catch {
      throw new Error('Não foi possível conectar ao servidor. Confira o IP em mobile/src/config.js e se o Node.js está ligado.');
    }
    const payload = response.status === 204 ? null : await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Não foi possível concluir a ação.');
    return payload;
  };

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setData(await request(`/api/records?month=${localDate().slice(0, 7)}`));
    } catch (error) {
      Alert.alert('Erro de conexão', error.message);
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const act = async (path, body) => {
    try {
      await request(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
      await load();
    } catch (error) { Alert.alert('Ação não concluída', error.message); }
  };
  const remove = (id) => Alert.alert('Excluir registro', 'Deseja apagar este registro?', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Excluir', style: 'destructive', onPress: async () => { try { await request(`/api/records/${id}`, { method: 'DELETE' }); await load(); } catch (error) { Alert.alert('Erro', error.message); } } },
  ]);

  const active = data.summary.openRecord;
  const paused = active?.pauses?.some((pause) => !pause.endAt);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <FlatList
        data={data.records}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#2563eb" />}
        ListHeaderComponent={<>
          <Text style={styles.eyebrow}>CONTROLE DE JORNADA</Text>
          <Text style={styles.title}>Bate Ponto</Text>
          <View style={styles.hero}>
            <Text style={styles.heroLabel}>{formatDate(localDate())}</Text>
            <Text style={styles.heroTitle}>{active ? (paused ? 'Pausa em andamento' : 'Jornada em andamento') : 'Pronto para começar?'}</Text>
            <Text style={styles.heroDetail}>{active ? `Entrada às ${formatTime(active.startAt)}` : 'Registre sua entrada para iniciar a jornada.'}</Text>
            <View style={styles.actions}>
              <Pressable style={styles.primary} onPress={() => act(active ? '/api/clock-out' : '/api/clock-in')}><Text style={styles.primaryText}>{active ? 'Registrar saída' : 'Registrar entrada'}</Text></Pressable>
              <Pressable style={[styles.secondary, !active && styles.disabled]} disabled={!active} onPress={() => act('/api/pause')}><Text style={styles.secondaryText}>{paused ? 'Retomar' : 'Pausar'}</Text></Pressable>
            </View>
          </View>
          <View style={styles.cards}>
            <View style={styles.card}><Text style={styles.cardLabel}>Horas no mês</Text><Text style={styles.cardValue}>{formatMinutes(data.summary.workedMinutes)}</Text></View>
            <View style={styles.card}><Text style={styles.cardLabel}>Folgas no mês</Text><Text style={styles.cardValue}>{data.summary.leaveDays || 0}</Text></View>
          </View>
          <Text style={styles.sectionTitle}>Adicionar folga</Text>
          <View style={styles.leaveBox}>
            <TextInput value={leaveDate} onChangeText={setLeaveDate} placeholder="AAAA-MM-DD" style={styles.input} />
            <TextInput value={reason} onChangeText={setReason} placeholder="Motivo" style={styles.input} />
            <Pressable style={styles.save} onPress={() => act('/api/leaves', { date: leaveDate, reason })}><Text style={styles.saveText}>Salvar folga</Text></Pressable>
          </View>
          <Text style={styles.sectionTitle}>Registros deste mês</Text>
        </>}
        ListEmptyComponent={loading ? <ActivityIndicator size="large" color="#2563eb" /> : <Text style={styles.empty}>Nenhum registro por enquanto.</Text>}
        renderItem={({ item }) => <View style={styles.record}><View style={styles.recordText}><Text style={styles.recordTitle}>{item.type === 'leave' ? `Folga · ${formatDate(item.date)}` : formatDate(item.date)}</Text><Text style={styles.recordDetail}>{item.type === 'leave' ? item.reason : `${formatTime(item.startAt)} → ${item.endAt ? formatTime(item.endAt) : 'em andamento'} · ${item.endAt ? formatMinutes(item.workedMinutes) : '—'}`}</Text></View><Pressable onPress={() => remove(item.id)}><Text style={styles.delete}>Excluir</Text></Pressable></View>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f2f5fa' }, content: { padding: 20, paddingBottom: 48 },
  eyebrow: { color: '#2563eb', fontSize: 12, fontWeight: '800', letterSpacing: 1.1, marginTop: 8 }, title: { color: '#172033', fontSize: 29, fontWeight: '800', marginTop: 4, marginBottom: 22 },
  hero: { backgroundColor: '#2563eb', borderRadius: 22, padding: 24, shadowColor: '#1d4ed8', shadowOpacity: 0.2, shadowOffset: { width: 0, height: 8 }, shadowRadius: 18, elevation: 4 }, heroLabel: { color: '#dbeafe', fontSize: 14 }, heroTitle: { color: '#fff', fontWeight: '800', fontSize: 22, marginTop: 8 }, heroDetail: { color: '#dbeafe', marginTop: 5 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 22 }, primary: { flex: 1, backgroundColor: '#fff', borderRadius: 11, padding: 13, alignItems: 'center' }, primaryText: { color: '#1d4ed8', fontWeight: '800' }, secondary: { flex: 0.65, borderRadius: 11, padding: 13, alignItems: 'center', backgroundColor: '#dbeafe' }, secondaryText: { color: '#1e3a8a', fontWeight: '800' }, disabled: { opacity: 0.5 },
  cards: { flexDirection: 'row', gap: 12, marginTop: 14 }, card: { flex: 1, padding: 16, backgroundColor: '#fff', borderRadius: 15 }, cardLabel: { color: '#667085', fontSize: 12 }, cardValue: { color: '#172033', fontSize: 19, fontWeight: '800', marginTop: 6 },
  sectionTitle: { color: '#172033', fontSize: 17, fontWeight: '800', marginTop: 28, marginBottom: 10 }, leaveBox: { backgroundColor: '#fff', borderRadius: 15, padding: 14, gap: 9 }, input: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#d8dee9', borderRadius: 10, padding: 12, color: '#172033' }, save: { backgroundColor: '#eef2ff', padding: 13, borderRadius: 10, alignItems: 'center' }, saveText: { color: '#3730a3', fontWeight: '800' },
  record: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', padding: 16, borderBottomWidth: 1, borderColor: '#edf0f5' }, recordText: { flex: 1 }, recordTitle: { color: '#172033', fontWeight: '700' }, recordDetail: { color: '#667085', fontSize: 13, marginTop: 4 }, delete: { color: '#b91c1c', fontWeight: '700', paddingLeft: 12 }, empty: { color: '#667085', textAlign: 'center', padding: 25 },
});
