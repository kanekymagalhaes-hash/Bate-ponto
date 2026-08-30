const $ = (selector) => document.querySelector(selector);
let currentData = { records: [], summary: {} };

const formatTime = (iso) => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const formatDate = (date) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(new Date(`${date}T12:00:00`));
const formatMinutes = (minutes = 0) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}h ${String(Math.round(minutes % 60)).padStart(2, '0')}min`;
function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
const monthValue = () => localDateValue().slice(0, 7);

async function api(path, options) {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!response.ok) throw new Error((await response.json()).error || 'Não foi possível concluir a ação.');
  return response.status === 204 ? null : response.json();
}

function render() {
  const { records, summary } = currentData;
  const active = summary.openRecord;
  const paused = active?.pauses?.some((pause) => !pause.endAt);
  $('#worked-hours').textContent = formatMinutes(summary.workedMinutes);
  $('#leave-days').textContent = summary.leaveDays || 0;
  $('#main-action').textContent = active ? 'Registrar saída' : 'Registrar entrada';
  $('#pause-action').disabled = !active;
  $('#pause-action').textContent = paused ? 'Retomar' : 'Pausar';
  $('#status').textContent = active ? (paused ? 'Pausa em andamento' : 'Jornada em andamento') : 'Nenhuma jornada iniciada';
  $('#status-detail').textContent = active ? `Entrada às ${formatTime(active.startAt)}` : 'Registre sua entrada para começar.';
  const root = $('#records'); root.innerHTML = '';
  if (!records.length) root.innerHTML = '<p class="record-detail">Nenhum registro neste mês.</p>';
  for (const record of records) {
    const node = $('#record-template').content.cloneNode(true);
    node.querySelector('.record-title').textContent = record.type === 'leave' ? `Folga — ${formatDate(record.date)}` : formatDate(record.date);
    node.querySelector('.record-detail').textContent = record.type === 'leave' ? record.reason : `${formatTime(record.startAt)} → ${record.endAt ? formatTime(record.endAt) : 'em andamento'} · ${record.endAt ? formatMinutes(record.workedMinutes) : '—'}`;
    node.querySelector('.delete').onclick = () => removeRecord(record.id);
    root.append(node);
  }
}

async function load() { currentData = await api(`/api/records?month=${$('#month').value}`); render(); }
async function action(fn) { try { await fn(); await load(); } catch (error) { alert(error.message); } }
async function removeRecord(id) { if (confirm('Excluir este registro?')) await action(() => api(`/api/records/${id}`, { method: 'DELETE' })); }

$('#main-action').onclick = () => action(() => api(currentData.summary.openRecord ? '/api/clock-out' : '/api/clock-in', { method: 'POST' }));
$('#pause-action').onclick = () => action(() => api('/api/pause', { method: 'POST' }));
$('#month').onchange = load;
$('#leave-form').onsubmit = (event) => { event.preventDefault(); action(async () => { await api('/api/leaves', { method: 'POST', body: JSON.stringify({ date: $('#leave-date').value, reason: $('#leave-reason').value }) }); event.target.reset(); }); };

function tick() { $('#clock').textContent = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date()); }
$('#month').value = monthValue(); $('#leave-date').value = localDateValue(); $('#today').textContent = formatDate($('#leave-date').value); tick(); setInterval(tick, 1000); load();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
