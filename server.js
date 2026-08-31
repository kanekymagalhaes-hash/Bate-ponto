const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, randomBytes, scrypt, timingSafeEqual, createHmac } = require('node:crypto');
const { promisify } = require('node:util');
const scryptAsync = promisify(scrypt);

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = process.env.DATA_FILE || path.join(DATA_DIR, 'registros.json');

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

async function readData() {
  try {
    const data = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
    return { records: data.records || [], users: data.users || [], tokenSecret: data.tokenSecret || randomBytes(32).toString('hex') };
  } catch (error) {
    if (error.code === 'ENOENT') return { records: [], users: [], tokenSecret: randomBytes(32).toString('hex') };
    throw error;
  }
}

async function saveData(data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = (await scryptAsync(password, salt, 64)).toString('hex');
  return `${salt}:${hash}`;
}

async function passwordMatches(password, stored) {
  const [salt, savedHash] = stored.split(':');
  const hash = (await scryptAsync(password, salt, 64)).toString('hex');
  return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(savedHash, 'hex'));
}

function createToken(userId, secret) {
  const signature = createHmac('sha256', secret).update(userId).digest('hex');
  return `${userId}.${signature}`;
}

function getAuthenticatedUser(req, data) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const [userId, signature] = token.split('.');
  if (!userId || !signature) return null;
  const expected = createHmac('sha256', data.tokenSecret).update(userId).digest('hex');
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  return data.users.find((user) => user.id === userId) || null;
}

function dateKey(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getSummary(records, month) {
  const selected = records.filter((record) => record.date.startsWith(month));
  const workedMinutes = selected.reduce((total, record) => total + (record.workedMinutes || 0), 0);
  const leaveDays = selected.filter((record) => record.type === 'leave').length;
  const openRecord = records.find((record) => record.type === 'work' && !record.endAt);
  return { workedMinutes, leaveDays, openRecord };
}

function getWorkedMinutes(record) {
  if (!record.endAt) return 0;
  const start = new Date(record.startAt).getTime();
  const end = new Date(record.endAt).getTime();
  const pauseMinutes = (record.pauses || []).reduce((total, pause) => {
    if (!pause.endAt) return total;
    return total + Math.max(0, (new Date(pause.endAt) - new Date(pause.startAt)) / 60000);
  }, 0);
  return Math.max(0, Math.round((end - start) / 60000 - pauseMinutes));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error('Payload muito grande'));
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('JSON inválido')); }
    });
    req.on('error', reject);
  });
}

async function handleApi(req, res, url) {
  const data = await readData();
  const now = new Date().toISOString();

  if (req.method === 'POST' && url.pathname === '/api/auth/register') {
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (name.length < 2) return sendJson(res, 400, { error: 'Informe seu nome.' });
    if (!/^\S+@\S+\.\S+$/.test(email)) return sendJson(res, 400, { error: 'Informe um e-mail válido.' });
    if (password.length < 6) return sendJson(res, 400, { error: 'A senha precisa ter ao menos 6 caracteres.' });
    if (data.users.some((user) => user.email === email)) return sendJson(res, 409, { error: 'Este e-mail já possui cadastro.' });
    const user = { id: randomUUID(), name, email, passwordHash: await hashPassword(password), createdAt: now };
    data.users.push(user);
    await saveData(data);
    return sendJson(res, 201, { user: publicUser(user), token: createToken(user.id, data.tokenSecret) });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    const body = await readBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const user = data.users.find((item) => item.email === email);
    if (!user || !(await passwordMatches(String(body.password || ''), user.passwordHash))) return sendJson(res, 401, { error: 'E-mail ou senha incorretos.' });
    return sendJson(res, 200, { user: publicUser(user), token: createToken(user.id, data.tokenSecret) });
  }

  const user = getAuthenticatedUser(req, data);
  if (!user) return sendJson(res, 401, { error: 'Faça login para continuar.' });
  const userRecords = data.records.filter((record) => record.userId === user.id);

  if (req.method === 'GET' && url.pathname === '/api/records') {
    const month = url.searchParams.get('month') || dateKey(now).slice(0, 7);
    const records = userRecords.filter((record) => record.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date));
    return sendJson(res, 200, { records, summary: getSummary(userRecords, month), user: publicUser(user) });
  }

  if (req.method === 'POST' && url.pathname === '/api/clock-in') {
    if (userRecords.some((record) => record.type === 'work' && !record.endAt)) {
      return sendJson(res, 409, { error: 'Já existe uma jornada em andamento.' });
    }
    const record = { id: randomUUID(), userId: user.id, type: 'work', date: dateKey(now), startAt: now, endAt: null, pauses: [], workedMinutes: 0 };
    data.records.push(record);
    await saveData(data);
    return sendJson(res, 201, { record });
  }

  if (req.method === 'POST' && url.pathname === '/api/clock-out') {
    const record = userRecords.find((item) => item.type === 'work' && !item.endAt);
    if (!record) return sendJson(res, 409, { error: 'Não há jornada em andamento.' });
    const openPause = record.pauses.find((pause) => !pause.endAt);
    if (openPause) openPause.endAt = now;
    record.endAt = now;
    record.workedMinutes = getWorkedMinutes(record);
    await saveData(data);
    return sendJson(res, 200, { record });
  }

  if (req.method === 'POST' && url.pathname === '/api/pause') {
    const record = userRecords.find((item) => item.type === 'work' && !item.endAt);
    if (!record) return sendJson(res, 409, { error: 'Inicie uma jornada antes de registrar uma pausa.' });
    const openPause = record.pauses.find((pause) => !pause.endAt);
    if (openPause) openPause.endAt = now;
    else record.pauses.push({ startAt: now, endAt: null });
    await saveData(data);
    return sendJson(res, 200, { record, paused: !openPause });
  }

  if (req.method === 'POST' && url.pathname === '/api/leaves') {
    const body = await readBody(req);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date || '')) return sendJson(res, 400, { error: 'Informe uma data válida.' });
    if (userRecords.some((record) => record.date === body.date)) return sendJson(res, 409, { error: 'Já existe um registro para esta data.' });
    const record = { id: randomUUID(), userId: user.id, type: 'leave', date: body.date, reason: String(body.reason || 'Folga') };
    data.records.push(record);
    await saveData(data);
    return sendJson(res, 201, { record });
  }

  if (req.method === 'PUT' && url.pathname.startsWith('/api/records/')) {
    const id = url.pathname.split('/').pop();
    const record = data.records.find((item) => item.id === id && item.userId === user.id);
    if (!record) return sendJson(res, 404, { error: 'Registro não encontrado.' });
    const body = await readBody(req);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date || '')) return sendJson(res, 400, { error: 'Informe uma data válida.' });
    record.date = body.date;
    if (record.type === 'leave') {
      record.reason = String(body.reason || 'Folga').trim() || 'Folga';
    } else {
      if (!/^\d{2}:\d{2}$/.test(body.startTime || '') || !/^\d{2}:\d{2}$/.test(body.endTime || '')) return sendJson(res, 400, { error: 'Informe horários válidos.' });
      const start = new Date(`${body.date}T${body.startTime}:00`);
      const end = new Date(`${body.date}T${body.endTime}:00`);
      if (Number.isNaN(start.getTime()) || end <= start) return sendJson(res, 400, { error: 'A saída precisa ser posterior à entrada.' });
      record.startAt = start.toISOString();
      record.endAt = end.toISOString();
      record.workedMinutes = getWorkedMinutes(record);
    }
    await saveData(data);
    return sendJson(res, 200, { record });
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/api/records/')) {
    const id = url.pathname.split('/').pop();
    const index = data.records.findIndex((record) => record.id === id && record.userId === user.id);
    if (index === -1) return sendJson(res, 404, { error: 'Registro não encontrado.' });
    data.records.splice(index, 1);
    await saveData(data);
    return sendJson(res, 204, null);
  }

  sendJson(res, 404, { error: 'Rota não encontrada.' });
}

async function serveStatic(res, pathname) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const safePath = path.normalize(path.join(PUBLIC_DIR, requested));
  if (!safePath.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: 'Acesso negado.' });
  try {
    const file = await fs.readFile(safePath);
    res.writeHead(200, { 'Content-Type': contentTypes[path.extname(safePath)] || 'application/octet-stream' });
    res.end(file);
  } catch (error) {
    sendJson(res, error.code === 'ENOENT' ? 404 : 500, { error: 'Arquivo não encontrado.' });
  }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else await serveStatic(res, decodeURIComponent(url.pathname));
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: error.message || 'Erro interno.' });
  }
}).listen(PORT, () => console.log(`Bate Ponto rodando em http://localhost:${PORT}`));
