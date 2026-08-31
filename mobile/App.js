import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
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
const timeValue = (value) => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
const monthLabel = (month) => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T12:00:00`));
const shiftMonth = (month, amount) => { const date = new Date(`${month}-01T12:00:00`); date.setMonth(date.getMonth() + amount); return localDate(date).slice(0, 7); };
const calendarDays = (month) => { const first = new Date(`${month}-01T12:00:00`); const offset = (first.getDay() + 6) % 7; const total = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate(); return [...Array(offset).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)]; };

export default function App() {
  const [data, setData] = useState({ records: [], summary: {} });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [leaveDate, setLeaveDate] = useState(localDate());
  const [reason, setReason] = useState('Folga');
  const [showWelcome, setShowWelcome] = useState(true);
  const [token, setToken] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [selectedMonth, setSelectedMonth] = useState(localDate().slice(0, 7));
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ date: '', reason: '', startTime: '', endTime: '' });

  const request = async (path, options = {}) => {
    let response;
    try {
      response = await fetch(`${API_URL}${path}`, {
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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
      setData(await request(`/api/records?month=${selectedMonth}`));
    } catch (error) {
      Alert.alert('Erro de conexão', error.message);
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [token, selectedMonth]);

  useEffect(() => {
    AsyncStorage.getItem('bate-ponto-token').then((savedToken) => {
      if (savedToken) setToken(savedToken);
      setAuthLoading(false);
    });
  }, []);
  useEffect(() => { if (token) load(); }, [token, load]);
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
  const beginEdit = (record) => {
    setEditing(record);
    setEditForm({ date: record.date, reason: record.reason || '', startTime: record.startAt ? timeValue(record.startAt) : '', endTime: record.endAt ? timeValue(record.endAt) : '' });
  };
  const saveEdit = async () => {
    try {
      await request(`/api/records/${editing.id}`, { method: 'PUT', body: JSON.stringify(editing.type === 'leave' ? { date: editForm.date, reason: editForm.reason } : editForm) });
      setEditing(null); await load();
    } catch (error) { Alert.alert('Não foi possível salvar', error.message); }
  };

  const active = data.summary.openRecord;
  const paused = active?.pauses?.some((pause) => !pause.endAt);
  const statusColor = active ? (paused ? '#f59e0b' : '#22c55e') : '#94a3b8';

  const submitAuth = async () => {
    try {
      if (authMode === 'register' && authForm.name.trim().length < 2) return Alert.alert('Cadastro', 'Informe seu nome.');
      const response = await request(`/api/auth/${authMode === 'login' ? 'login' : 'register'}`, { method: 'POST', body: JSON.stringify(authForm) });
      await AsyncStorage.setItem('bate-ponto-token', response.token);
      setToken(response.token);
      setShowWelcome(true);
    } catch (error) { Alert.alert('Não foi possível continuar', error.message); }
  };

  if (authLoading) return <SafeAreaView style={styles.loading}><ActivityIndicator size="large" color="#2563eb" /></SafeAreaView>;

  if (!token) {
    const registering = authMode === 'register';
    return <SafeAreaView style={styles.authSafe}><StatusBar style="dark" /><View style={styles.auth}><View style={styles.authLogo}><Text style={styles.authLogoText}>BP</Text></View><Text style={styles.authTitle}>{registering ? 'Crie sua conta' : 'Bem-vindo de volta'}</Text><Text style={styles.authSubtitle}>{registering ? 'Organize sua jornada a partir de hoje.' : 'Entre para acompanhar suas horas.'}</Text>{registering && <TextInput value={authForm.name} onChangeText={(name) => setAuthForm({ ...authForm, name })} placeholder="Seu nome" style={styles.authInput} autoCapitalize="words" />}<TextInput value={authForm.email} onChangeText={(email) => setAuthForm({ ...authForm, email })} placeholder="E-mail" style={styles.authInput} autoCapitalize="none" keyboardType="email-address" /><TextInput value={authForm.password} onChangeText={(password) => setAuthForm({ ...authForm, password })} placeholder="Senha (mínimo 6 caracteres)" style={styles.authInput} secureTextEntry /><Pressable style={styles.authButton} onPress={submitAuth}><Text style={styles.authButtonText}>{registering ? 'Criar conta' : 'Entrar'}</Text></Pressable><Pressable onPress={() => setAuthMode(registering ? 'login' : 'register')}><Text style={styles.authSwitch}>{registering ? 'Já tem uma conta? Entrar' : 'Ainda não tem conta? Criar cadastro'}</Text></Pressable></View></SafeAreaView>;
  }

  if (showWelcome) {
    return (
      <SafeAreaView style={styles.welcomeSafe}>
        <StatusBar style="light" />
        <View style={styles.welcome}>
          <View style={styles.welcomeTop}>
            <View style={styles.welcomeLogo}><Text style={styles.welcomeLogoText}>BP</Text></View>
            <Text style={styles.welcomeBrand}>Bate Ponto</Text>
          </View>
          <View style={styles.welcomeBody}>
            <Text style={styles.welcomeEyebrow}>SEU TEMPO, DO SEU JEITO</Text>
            <Text style={styles.welcomeTitle}>Sua jornada{`\n`}mais simples.</Text>
            <Text style={styles.welcomeText}>Registre horários, pausas e folgas em poucos toques. Tenha suas horas sempre organizadas.</Text>
            <View style={styles.features}>
              <View style={styles.feature}><Text style={styles.featureIcon}>◷</Text><Text style={styles.featureText}>Controle de horas</Text></View>
              <View style={styles.feature}><Text style={styles.featureIcon}>✓</Text><Text style={styles.featureText}>Tudo organizado</Text></View>
            </View>
          </View>
          <View>
            <Pressable style={styles.welcomeButton} onPress={() => setShowWelcome(false)}><Text style={styles.welcomeButtonText}>Começar agora  →</Text></Pressable>
            <Text style={styles.welcomeFootnote}>Seu controle de ponto pessoal</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <FlatList
        data={data.records}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#2563eb" />}
        ListHeaderComponent={<>
          <View style={styles.header}><View><Text style={styles.eyebrow}>CONTROLE DE JORNADA</Text><Text style={styles.title}>Olá! 👋</Text></View><View style={styles.logo}><Text style={styles.logoText}>BP</Text></View></View>
          <View style={styles.hero}>
            <View style={styles.heroTop}><View><Text style={styles.heroLabel}>{formatDate(localDate())}</Text><Text style={styles.heroTitle}>{active ? (paused ? 'Pausa em andamento' : 'Jornada em andamento') : 'Pronto para começar?'}</Text></View><View style={[styles.statusDot, { backgroundColor: statusColor }]} /></View>
            <Text style={styles.heroDetail}>{active ? `Entrada às ${formatTime(active.startAt)}` : 'Registre sua entrada para iniciar a jornada.'}</Text>
            <View style={styles.actions}>
              <Pressable style={styles.primary} onPress={() => act(active ? '/api/clock-out' : '/api/clock-in')}><Text style={styles.primaryText}>{active ? 'Registrar saída' : 'Registrar entrada'}</Text></Pressable>
              <Pressable style={[styles.secondary, !active && styles.disabled]} disabled={!active} onPress={() => act('/api/pause')}><Text style={styles.secondaryText}>{paused ? 'Retomar' : 'Pausar'}</Text></Pressable>
            </View>
          </View>
          <View style={styles.cards}>
            <View style={styles.card}><View style={[styles.cardIcon, styles.blueIcon]}><Text>◷</Text></View><Text style={styles.cardLabel}>Horas no mês</Text><Text style={styles.cardValue}>{formatMinutes(data.summary.workedMinutes)}</Text></View>
            <View style={styles.card}><View style={[styles.cardIcon, styles.orangeIcon]}><Text>☀</Text></View><Text style={styles.cardLabel}>Folgas no mês</Text><Text style={styles.cardValue}>{data.summary.leaveDays || 0}</Text></View>
          </View>
          <Text style={styles.sectionTitle}>Calendário</Text>
          <View style={styles.calendar}><View style={styles.monthNav}><Pressable onPress={() => setSelectedMonth(shiftMonth(selectedMonth, -1))}><Text style={styles.monthArrow}>‹</Text></Pressable><Text style={styles.monthTitle}>{monthLabel(selectedMonth)}</Text><Pressable onPress={() => setSelectedMonth(shiftMonth(selectedMonth, 1))}><Text style={styles.monthArrow}>›</Text></Pressable></View><View style={styles.weekdays}>{['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((day, index) => <Text key={`${day}-${index}`} style={styles.weekday}>{day}</Text>)}</View><View style={styles.dayGrid}>{calendarDays(selectedMonth).map((day, index) => { const date = day ? `${selectedMonth}-${pad(day)}` : null; const record = date && data.records.find((item) => item.date === date); return <View key={date || `blank-${index}`} style={styles.dayCell}>{day && <View style={[styles.dayNumber, record && (record.type === 'leave' ? styles.dayLeave : styles.dayWork), date === localDate() && styles.dayToday]}><Text style={[styles.dayText, record && styles.dayTextMarked]}>{day}</Text></View>}</View>; })}</View><View style={styles.legend}><Text style={styles.legendWork}>● Jornada</Text><Text style={styles.legendLeave}>● Folga</Text></View></View>
          <Text style={styles.sectionTitle}>Adicionar folga</Text>
          <View style={styles.leaveBox}>
            <TextInput value={leaveDate} onChangeText={setLeaveDate} placeholder="AAAA-MM-DD" style={styles.input} />
            <TextInput value={reason} onChangeText={setReason} placeholder="Motivo" style={styles.input} />
            <Pressable style={styles.save} onPress={() => act('/api/leaves', { date: leaveDate, reason })}><Text style={styles.saveText}>Salvar folga</Text></Pressable>
          </View>
          <Text style={styles.sectionTitle}>Registros deste mês</Text>
        </>}
        ListEmptyComponent={loading ? <ActivityIndicator size="large" color="#2563eb" /> : <Text style={styles.empty}>Nenhum registro por enquanto.</Text>}
        renderItem={({ item }) => <View style={styles.record}><View style={[styles.recordMarker, item.type === 'leave' ? styles.leaveMarker : styles.workMarker]}><Text>{item.type === 'leave' ? '☀' : '◷'}</Text></View><View style={styles.recordText}><Text style={styles.recordTitle}>{item.type === 'leave' ? `Folga · ${formatDate(item.date)}` : formatDate(item.date)}</Text><Text style={styles.recordDetail}>{item.type === 'leave' ? item.reason : `${formatTime(item.startAt)} → ${item.endAt ? formatTime(item.endAt) : 'em andamento'} · ${item.endAt ? formatMinutes(item.workedMinutes) : '—'}`}</Text></View><View><Pressable onPress={() => beginEdit(item)}><Text style={styles.edit}>Editar</Text></Pressable><Pressable onPress={() => remove(item.id)}><Text style={styles.delete}>Excluir</Text></Pressable></View></View>}
      />
      <Modal visible={Boolean(editing)} transparent animationType="slide" onRequestClose={() => setEditing(null)}><View style={styles.modalOverlay}><View style={styles.modal}><Text style={styles.modalTitle}>Editar registro</Text><TextInput value={editForm.date} onChangeText={(date) => setEditForm({ ...editForm, date })} placeholder="AAAA-MM-DD" style={styles.input} />{editing?.type === 'leave' ? <TextInput value={editForm.reason} onChangeText={(reason) => setEditForm({ ...editForm, reason })} placeholder="Motivo da folga" style={styles.input} /> : <><TextInput value={editForm.startTime} onChangeText={(startTime) => setEditForm({ ...editForm, startTime })} placeholder="Entrada (HH:MM)" style={styles.input} keyboardType="numbers-and-punctuation" /><TextInput value={editForm.endTime} onChangeText={(endTime) => setEditForm({ ...editForm, endTime })} placeholder="Saída (HH:MM)" style={styles.input} keyboardType="numbers-and-punctuation" /></>}<View style={styles.modalActions}><Pressable onPress={() => setEditing(null)} style={styles.cancel}><Text style={styles.cancelText}>Cancelar</Text></Pressable><Pressable onPress={saveEdit} style={styles.save}><Text style={styles.saveText}>Salvar</Text></Pressable></View></View></View></Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f7fb' }, loading: { flex: 1, backgroundColor: '#f4f7fb', alignItems: 'center', justifyContent: 'center' }, content: { padding: 20, paddingBottom: 48 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  authSafe: { flex: 1, backgroundColor: '#f4f7fb' }, auth: { flex: 1, padding: 28, justifyContent: 'center' }, authLogo: { width: 54, height: 54, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2563eb', marginBottom: 28 }, authLogoText: { color: '#fff', fontWeight: '900', fontSize: 18 }, authTitle: { color: '#172033', fontWeight: '800', fontSize: 29 }, authSubtitle: { color: '#667085', fontSize: 15, marginTop: 8, marginBottom: 30 }, authInput: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d8dee9', borderRadius: 12, padding: 14, color: '#172033', marginBottom: 11 }, authButton: { backgroundColor: '#2563eb', borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 7 }, authButtonText: { color: '#fff', fontWeight: '800', fontSize: 15 }, authSwitch: { color: '#2563eb', fontWeight: '700', textAlign: 'center', marginTop: 23 },
  welcomeSafe: { flex: 1, backgroundColor: '#172033' }, welcome: { flex: 1, padding: 27, paddingBottom: 34, justifyContent: 'space-between' }, welcomeTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }, welcomeLogo: { backgroundColor: '#fff', borderRadius: 13, width: 43, height: 43, alignItems: 'center', justifyContent: 'center' }, welcomeLogoText: { color: '#2563eb', fontWeight: '900', fontSize: 15 }, welcomeBrand: { color: '#fff', fontWeight: '700', fontSize: 17 }, welcomeBody: { marginTop: -18 }, welcomeEyebrow: { color: '#60a5fa', fontWeight: '800', letterSpacing: 1.2, fontSize: 11, marginBottom: 15 }, welcomeTitle: { color: '#fff', fontWeight: '800', fontSize: 38, lineHeight: 47, letterSpacing: -1.2 }, welcomeText: { color: '#b7c3d8', fontSize: 15, lineHeight: 24, marginTop: 17, maxWidth: 330 }, features: { gap: 10, marginTop: 30 }, feature: { flexDirection: 'row', alignItems: 'center', gap: 11 }, featureIcon: { color: '#93c5fd', fontWeight: '800', backgroundColor: '#243147', borderRadius: 9, paddingVertical: 4, width: 28, textAlign: 'center' }, featureText: { color: '#e2e8f0', fontWeight: '600', fontSize: 13 }, welcomeButton: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 15, paddingVertical: 17 }, welcomeButtonText: { color: '#1d4ed8', fontWeight: '800', fontSize: 15 }, welcomeFootnote: { color: '#71819b', textAlign: 'center', fontSize: 12, marginTop: 15 },
  eyebrow: { color: '#2563eb', fontSize: 11, fontWeight: '800', letterSpacing: 1.3, marginTop: 8 }, title: { color: '#172033', fontSize: 29, fontWeight: '800', marginTop: 4, marginBottom: 22 }, logo: { width: 43, height: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#172033', marginBottom: 17 }, logoText: { color: '#fff', fontWeight: '900', fontSize: 14 },
  hero: { backgroundColor: '#2563eb', borderRadius: 24, padding: 24, shadowColor: '#1d4ed8', shadowOpacity: 0.24, shadowOffset: { width: 0, height: 9 }, shadowRadius: 18, elevation: 5 }, heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, statusDot: { width: 11, height: 11, borderRadius: 6, marginTop: 5, shadowColor: '#fff', shadowOpacity: 0.9, shadowRadius: 5 }, heroLabel: { color: '#dbeafe', fontSize: 14, textTransform: 'capitalize' }, heroTitle: { color: '#fff', fontWeight: '800', fontSize: 22, marginTop: 8 }, heroDetail: { color: '#dbeafe', marginTop: 5 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 22 }, primary: { flex: 1, backgroundColor: '#fff', borderRadius: 11, padding: 13, alignItems: 'center' }, primaryText: { color: '#1d4ed8', fontWeight: '800' }, secondary: { flex: 0.65, borderRadius: 11, padding: 13, alignItems: 'center', backgroundColor: '#dbeafe' }, secondaryText: { color: '#1e3a8a', fontWeight: '800' }, disabled: { opacity: 0.5 },
  cards: { flexDirection: 'row', gap: 12, marginTop: 14 }, card: { flex: 1, padding: 16, backgroundColor: '#fff', borderRadius: 18, shadowColor: '#172033', shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 }, cardIcon: { width: 27, height: 27, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }, blueIcon: { backgroundColor: '#dbeafe' }, orangeIcon: { backgroundColor: '#fef3c7' }, cardLabel: { color: '#667085', fontSize: 12 }, cardValue: { color: '#172033', fontSize: 19, fontWeight: '800', marginTop: 6 },
  calendar: { backgroundColor: '#fff', borderRadius: 18, padding: 15 }, monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }, monthTitle: { color: '#172033', fontSize: 15, fontWeight: '800', textTransform: 'capitalize' }, monthArrow: { color: '#2563eb', fontSize: 27, fontWeight: '500', paddingHorizontal: 7 }, weekdays: { flexDirection: 'row' }, weekday: { width: '14.285%', color: '#98a2b3', textAlign: 'center', fontWeight: '700', fontSize: 11, marginBottom: 7 }, dayGrid: { flexDirection: 'row', flexWrap: 'wrap' }, dayCell: { width: '14.285%', alignItems: 'center', height: 37, justifyContent: 'center' }, dayNumber: { width: 29, height: 29, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, dayWork: { backgroundColor: '#dbeafe' }, dayLeave: { backgroundColor: '#fef3c7' }, dayToday: { borderWidth: 1, borderColor: '#2563eb' }, dayText: { color: '#475467', fontSize: 12 }, dayTextMarked: { color: '#172033', fontWeight: '800' }, legend: { flexDirection: 'row', gap: 14, borderTopWidth: 1, borderColor: '#edf0f5', paddingTop: 11, marginTop: 5 }, legendWork: { color: '#2563eb', fontSize: 11, fontWeight: '700' }, legendLeave: { color: '#b7791f', fontSize: 11, fontWeight: '700' },
  sectionTitle: { color: '#172033', fontSize: 17, fontWeight: '800', marginTop: 28, marginBottom: 10 }, leaveBox: { backgroundColor: '#fff', borderRadius: 18, padding: 14, gap: 9, shadowColor: '#172033', shadowOpacity: 0.03, shadowRadius: 8, elevation: 1 }, input: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#d8dee9', borderRadius: 11, padding: 12, color: '#172033' }, save: { backgroundColor: '#eef2ff', padding: 13, borderRadius: 11, alignItems: 'center' }, saveText: { color: '#3730a3', fontWeight: '800' },
  record: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 15, borderBottomWidth: 1, borderColor: '#edf0f5' }, recordMarker: { width: 35, height: 35, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 }, workMarker: { backgroundColor: '#dbeafe' }, leaveMarker: { backgroundColor: '#fef3c7' }, recordText: { flex: 1 }, recordTitle: { color: '#172033', fontWeight: '700' }, recordDetail: { color: '#667085', fontSize: 13, marginTop: 4 }, edit: { color: '#2563eb', fontWeight: '700', textAlign: 'right', marginBottom: 7 }, delete: { color: '#b91c1c', fontWeight: '700', paddingLeft: 12 }, empty: { color: '#667085', textAlign: 'center', padding: 25 }, modalOverlay: { flex: 1, backgroundColor: '#17203399', justifyContent: 'flex-end' }, modal: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, gap: 10 }, modalTitle: { color: '#172033', fontSize: 20, fontWeight: '800', marginBottom: 5 }, modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 }, cancel: { flex: 1, alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 11, padding: 13 }, cancelText: { color: '#475467', fontWeight: '700' },
});
