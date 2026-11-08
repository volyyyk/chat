/**
 * MedChat end-to-end smoke test.
 *
 * Starts the server on a free test port, then walks through the real flows
 * of every side: clinic admin, doctor, patient 1 (free messages),
 * patient 2 (paid messages), including Socket.IO real-time delivery,
 * concurrency and access-control checks.
 *
 * Usage:
 *   cd medchat-v2/server
 *   npm run seed:test
 *   npm run test:smoke
 *
 * Requires the test data seed (npm run seed:test).
 */

const { spawn } = require('child_process');
const path = require('path');
const { io } = require('socket.io-client');

const PORT = process.env.SMOKE_PORT || 3990;
const BASE = 'http://127.0.0.1:' + PORT;
const PASSWORD = 'Test1234!';

const serverRoot = path.resolve(__dirname, '..');

let serverProcess = null;
// Server stderr captured from spawn; printed on any failure for diagnostics.
let serverStderrTail = '';
let serverStdoutTail = '';
let failures = 0;
let checks = 0;

function log(ok, name, extra) {
  checks++;
  if (ok) {
    console.log('  \u2713 ' + name);
  } else {
    failures++;
    console.error('  \u2717 ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra) : ''));
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function request(method, urlPath, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  // Hard per-request timeout: if the server never answers (e.g. a middleware
  // swallows the request), fail fast with a clear message instead of waiting
  // for undici's ~300s headers timeout and an opaque "fetch failed".
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  let res;
  try {
    res = await fetch(BASE + urlPath, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const aborted = e && (e.name === 'AbortError' || /abort/i.test(String(e && e.cause && e.cause.name || e && e.message || '')));
    if (aborted) {
      throw new Error('REQUEST TIMEOUT (30s): ' + method + ' ' + urlPath + ' — server accepted the request but never responded (middleware hang?)');
    }
    const serverAlive = serverProcess && !serverProcess.killed && serverProcess.exitCode === null;
    throw new Error('Request failed: ' + method + ' ' + urlPath + ' — ' + (e && e.message) + ' (server process alive: ' + !!serverAlive + ')');
  }
  clearTimeout(timer);
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    // non-JSON response
  }
  return { status: res.status, json };
}

async function waitForServer(attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(BASE + '/health');
      if (res.ok) return true;
    } catch (e) {
      // not up yet
    }
    await sleep(500);
  }
  return false;
}

function startServer() {
  const env = {
    ...process.env,
    PORT: String(PORT),
    // NODE_ENV is intentionally inherited: the spawned server must connect
    // to the same database the seed script used (see config/database.js).
    NODE_ENV: process.env.NODE_ENV,
    JWT_SECRET: process.env.JWT_SECRET || 'smoke-test-secret',
    JWT_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '30d',
    RATE_LIMIT_MAX_REQUESTS: '100000',
    RATE_LIMIT_WINDOW_MS: '60000',
    RATE_LIMIT_AUTH_MAX: '100000',
    LOG_LEVEL: process.env.LOG_LEVEL || 'error',
    LOG_TO_FILE: 'false',
  };
  delete env.LOG_DIR;

  serverProcess = spawn('node', [path.join(serverRoot, 'src', 'index.js')], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderrTail = '';
  serverProcess.stdout.on('data', (d) => { serverStdoutTail = (serverStdoutTail + d.toString()).slice(-4000); if (process.env.SMOKE_VERBOSE) process.stdout.write(d); });
  serverProcess.stderr.on('data', (d) => { stderrTail += d.toString(); if (stderrTail.length > 4000) stderrTail = stderrTail.slice(-4000); serverStderrTail = stderrTail; });
  serverProcess.on('exit', (code) => {
    if (code && code !== 0 && !serverProcess.__stopped) {
      console.error('Server exited unexpectedly with code ' + code + ':\n' + stderrTail);
    }
  });
  return stderrTail;
}

async function login(email) {
  const r = await request('POST', '/api/auth/login', { body: { email, password: PASSWORD } });
  if (r.status !== 200 || !r.json || !r.json.accessToken) {
    throw new Error('Login failed for ' + email + ': ' + r.status + ' ' + JSON.stringify(r.json));
  }
  return r.json;
}

function connectSocket(accessToken) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, {
      auth: { token: accessToken },
      transports: ['websocket'],
      reconnection: false,
      timeout: 8000,
    });
    const timer = setTimeout(() => reject(new Error('socket connect timeout')), 8000);
    socket.on('connect', () => { clearTimeout(timer); resolve(socket); });
    socket.on('connect_error', (err) => { clearTimeout(timer); reject(err); });
  });
}

function socketOnce(socket, event, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for "' + event + '"')), timeoutMs);
    socket.once(event, (data) => { clearTimeout(timer); resolve(data); });
  });
}

function joinChat(socket, chatRef) {
  return new Promise((resolve) => {
    socket.emit('joinChat', chatRef, (ack) => resolve(ack || {}));
  });
}

async function main() {
  console.log('MedChat smoke test');
  console.log('Base URL: ' + BASE);

  const stderrTail = startServer();

  const up = await waitForServer();
  if (!up) {
    console.error('Server did not start in time. Server stderr:\n' + stderrTail);
    await stopServer();
    process.exit(1);
  }
  log(true, 'server started, /health responds');

  // ------------------------------------------------------------------
  console.log('\n[1] Аутентификация всех сторон');

  const admin = await login('admin@medchat.test');
  const doctor = await login('doctor@medchat.test');
  const patient1 = await login('patient1@medchat.test');
  const patient2 = await login('patient2@medchat.test');
  log(true, 'логин: admin, doctor, patient1, patient2');

  const badLogin = await request('POST', '/api/auth/login', {
    body: { email: 'patient1@medchat.test', password: 'Wrong1234!' },
  });
  log(badLogin.status === 401, 'неверный пароль отклоняется (401)', badLogin.status);

  const noToken = await request('GET', '/api/chats');
  log(noToken.status === 401, 'запрос без токена отклоняется (401)', noToken.status);

  // ------------------------------------------------------------------
  console.log('\n[2] Чаты и контроль доступа');

  const doctorChats = await request('GET', '/api/chats', { token: doctor.accessToken });
  const chatList = (doctorChats.json && doctorChats.json.data) || [];
  log(doctorChats.status === 200 && chatList.length >= 2, 'врач видит оба чата', chatList.length);

  const chat1 = chatList.find((c) => c.chatId === 'test-chat-0001');
  const chat2 = chatList.find((c) => c.chatId === 'test-chat-0002');
  log(Boolean(chat1 && chat2), 'чаты test-chat-0001/0002 доступны по chatId');

  const adminChats = await request('GET', '/api/chats', { token: admin.accessToken });
  const adminChatList = (adminChats.json && adminChats.json.data) || [];
  log(adminChats.status === 200 && adminChatList.length >= 2, 'администратор клиники видит чаты своей клиники', adminChatList.length);

  const p1SeesChat1 = await request('GET', '/api/chats/' + chat1.id, { token: patient1.accessToken });
  log(p1SeesChat1.status === 200, 'пациент 1 видит свой чат');

  const p1Blocked = await request('GET', '/api/chats/' + chat2.id, { token: patient1.accessToken });
  log(p1Blocked.status === 403, 'пациент 1 НЕ видит чужой чат (403)', p1Blocked.status);

  const p2Blocked = await request('GET', '/api/chats/' + chat1.id, { token: patient2.accessToken });
  log(p2Blocked.status === 403, 'пациент 2 НЕ видит чужой чат (403)', p2Blocked.status);

  // ------------------------------------------------------------------
  console.log('\n[3] Бесплатные/платные сообщения (check-free)');

  const cf1 = await request('POST', '/api/payments/check-free', {
    token: patient1.accessToken,
    body: { chatId: chat1.id },
  });
  const isFree1 = cf1.json && cf1.json.data && cf1.json.data.isFree;
  log(cf1.status === 200 && isFree1 === true, 'пациент 1: сообщение бесплатно (прием был 5 дней назад)', cf1.json);

  const cf2 = await request('POST', '/api/payments/check-free', {
    token: patient2.accessToken,
    body: { chatId: chat2.id },
  });
  const isFree2 = cf2.json && cf2.json.data && cf2.json.data.isFree;
  log(cf2.status === 200 && isFree2 === false, 'пациент 2: сообщение платно (прием был 40 дней назад)', cf2.json);

  const doctorFree = await request('POST', '/api/payments/check-free', {
    token: doctor.accessToken,
    body: { chatId: chat2.id },
  });
  log(
    doctorFree.status === 200 && doctorFree.json && doctorFree.json.data && doctorFree.json.data.isFree === true,
    'врач всегда пишет бесплатно'
  );

  // ------------------------------------------------------------------
  console.log('\n[4] Отправка бесплатного сообщения (последовательная связь)');

  const freeMsg = await request('POST', '/api/chats/' + chat1.id + '/messages', {
    token: patient1.accessToken,
    body: { content: 'Смоук-тест: бесплатное сообщение', type: 'text', clientType: 'mobile', clientVersion: 'smoke' },
  });
  log(freeMsg.status === 201 && freeMsg.json && freeMsg.json.isFree === true, 'сообщение отправлено и помечено как бесплатное', freeMsg.status);

  const doctorReply = await request('POST', '/api/chats/' + chat1.id + '/messages', {
    token: doctor.accessToken,
    body: { content: 'Смоук-тест: ответ врача', type: 'text', clientType: 'mobile', clientVersion: 'smoke' },
  });
  log(doctorReply.status === 201 && doctorReply.json && doctorReply.json.isFree === true, 'ответ врача отправлен', doctorReply.status);

  const p1History = await request('GET', '/api/chats/' + chat1.id + '/messages?limit=50', { token: patient1.accessToken });
  const p1Msgs = (p1History.json && (p1History.json.data || p1History.json.messages)) || [];
  log(p1History.status === 200 && p1Msgs.length >= 4, 'история сообщений читается обеими сторонами', p1Msgs.length);

  // ------------------------------------------------------------------
  console.log('\n[5] Платный поток: process -> отправка с paymentTransactionId');

  const pay = await request('POST', '/api/payments/process', {
    token: patient2.accessToken,
    body: { type: 'message', chatId: chat2.id, amount: 50, description: 'Смоук-тест: оплата сообщения' },
  });
  const payTx = pay.json && pay.json.data;
  log(pay.status === 200 && pay.json && pay.json.success === true && payTx && payTx.id, 'платеж обработан (тестовый баланс)', pay.json);
  log(
    payTx && Number(payTx.amount) === 50 && payTx.type === 'message_payment' && payTx.status === 'completed',
    'транзакция: message_payment/completed/50'
  );
  const revenueSplit = pay.json && pay.json.revenueSplit;
  log(
    revenueSplit && Number(revenueSplit.doctor) === 40 && Number(revenueSplit.clinic) === 10,
    'сплит дохода 80/20: врач 40, клиника 10',
    revenueSplit
  );

  const paidMsg = await request('POST', '/api/chats/' + chat2.id + '/messages', {
    token: patient2.accessToken,
    body: {
      content: 'Смоук-тест: платное сообщение',
      type: 'text',
      paymentTransactionId: payTx.id,
      clientType: 'mobile',
      clientVersion: 'smoke',
    },
  });
  log(
    paidMsg.status === 201 && paidMsg.json && paidMsg.json.isPaid === true && paidMsg.json.paymentTransactionId === payTx.id,
    'платное сообщение отправлено с paymentTransactionId',
    paidMsg.status
  );

  const reuse = await request('POST', '/api/chats/' + chat2.id + '/messages', {
    token: patient2.accessToken,
    body: {
      content: 'Смоук-тест: попытка повторного использования',
      type: 'text',
      paymentTransactionId: payTx.id,
    },
  });
  log(reuse.status === 409, 'повторное использование транзакции отклонено (409)', reuse.status);

  const bal2 = await request('GET', '/api/transactions/balance', { token: patient2.accessToken });
  log(bal2.status === 200, 'баланс пациента 2 доступен', bal2.json);

  const docBal = await request('GET', '/api/payments/doctor/balance', { token: doctor.accessToken });
  const docAvailable = docBal.json && (docBal.json.data ? Number(docBal.json.data.available) : Number(docBal.json.available));
  log(docBal.status === 200 && docAvailable >= 40, 'баланс врача получил доход (>= 40)', docBal.json);

  const clinicBal = await request('GET', '/api/payments/clinic/balance', { token: admin.accessToken });
  log(clinicBal.status === 200, 'баланс клиники доступен администратору', clinicBal.json);

  // ------------------------------------------------------------------
  console.log('\n[6] Одновременная связь: 40 параллельных сообщений');

  const concurrent = await Promise.all(
    Array.from({ length: 40 }, (_, i) =>
      request('POST', '/api/chats/' + chat1.id + '/messages', {
        token: patient1.accessToken,
        body: { content: 'Смоук-тест: параллельное сообщение #' + i, type: 'text' },
      }).then((r) => r.status)
    )
  );
  const okCount = concurrent.filter((s) => s === 201).length;
  log(okCount === 40, '40/40 параллельных сообщений доставлено', okCount + '/40');

  // ------------------------------------------------------------------
  console.log('\n[7] Socket.IO: комнаты, права, real-time доставка');

  const docSocket = await connectSocket(doctor.accessToken);
  const p1Socket = await connectSocket(patient1.accessToken);
  log(true, 'оба сокета подключены с JWT');

  const joinOk = await joinChat(p1Socket, chat1.id);
  log(joinOk.ok === true, 'пациент 1 вошел в свой чат', joinOk);

  const joinDenied = await joinChat(p1Socket, chat2.id);
  log(joinDenied.error === 'forbidden', 'пациент 1 НЕ может войти в чужой чат (forbidden)', joinDenied);

  await joinChat(docSocket, chat1.id);

  const typingPromise = socketOnce(docSocket, 'userTyping');
  p1Socket.emit('typing', { chatId: chat1.id, isTyping: true });
  const typing = await typingPromise;
  log(typing && typing.isTyping === true, 'индикатор печати доставлен врачу в реальном времени');

  const newMsgPromise = socketOnce(docSocket, 'newMessage', 10000);
  const rtSend = await request('POST', '/api/chats/' + chat1.id + '/messages', {
    token: patient1.accessToken,
    body: { content: 'Смоук-тест: real-time сообщение', type: 'text' },
  });
  const rt = await newMsgPromise;
  log(rtSend.status === 201 && rt && rt.content === 'Смоук-тест: real-time сообщение', 'новое сообщение доставлено врачу через Socket.IO');

  p1Socket.disconnect();
  docSocket.disconnect();
  log(true, 'сокеты отключены');

  // ------------------------------------------------------------------
  console.log('\n[8] Приёмы (Appointments)');

  const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const createAppt = await request('POST', '/api/appointments', {
    token: patient1.accessToken,
    body: {
      doctorId: doctor.user.doctorProfile.id,
      startTime: futureStart,
      duration: 30,
      type: 'online',
      reason: 'Смоук-тест: консультация',
      reminderMinutes: 0,
    },
  });
  const appt = createAppt.json && (createAppt.json.data || createAppt.json);
  log(createAppt.status === 201 && appt && appt.id, 'пациент 1 записался на приём', createAppt.status);

  const myAppts = await request('GET', '/api/appointments/my?limit=50', { token: patient1.accessToken });
  const myApptList = (myAppts.json && (myAppts.json.data || myAppts.json)) || [];
  log(myAppts.status === 200 && myApptList.length >= 2, 'у пациента 1 есть приёмы (прошлый + новый)', myApptList.length);

  const confirmAppt = await request('POST', '/api/appointments/' + appt.id + '/confirm', {
    token: doctor.accessToken,
    body: { notes: 'Смоук-тест: подтверждено' },
  });
  log(confirmAppt.status === 200, 'врач подтвердил приём', confirmAppt.status);

  const doctorAppts = await request('GET', '/api/appointments?limit=50', { token: doctor.accessToken });
  const doctorApptList = (doctorAppts.json && (doctorAppts.json.data || doctorAppts.json)) || [];
  log(doctorAppts.status === 200 && doctorApptList.length >= 2, 'врач видит приёмы пациентов', doctorApptList.length);

  const foreignAppt = await request('GET', '/api/appointments/' + appt.id, { token: patient2.accessToken });
  log(foreignAppt.status === 403 || foreignAppt.status === 404, 'пациент 2 не видит чужой приём', foreignAppt.status);

  // ------------------------------------------------------------------
  console.log('\n[9] Электронные рецепты (E-Prescriptions)');

  const patient1ProfileId = patient1.user && patient1.user.patientProfile && patient1.user.patientProfile.id;
  const createEp = await request('POST', '/api/eprescriptions', {
    token: doctor.accessToken,
    body: {
      patientId: patient1ProfileId,
      diagnosis: 'Смоук-тест: ОРВИ',
      medications: [{ name: 'Парацетамол', dosage: '', frequency: '', duration: '' }],
      recommendations: 'Пить больше воды',
    },
  });
  const ep = createEp.json && (createEp.json.data || createEp.json);
  log(createEp.status === 201 && ep && ep.id, 'врач создал рецепт', createEp.status);
  log(
    ep && Array.isArray(ep.medications) && ep.medications.length === 1 && ep.medications[0].name === 'Парацетамол',
    'medications сохранились как массив'
  );

  const signEp = await request('POST', '/api/eprescriptions/' + ep.id + '/sign', {
    token: doctor.accessToken,
    body: { signature: 'smoke-test-signature' },
  });
  log(signEp.status === 200, 'врач подписал рецепт (route /:id/sign)', signEp.status);

  const signAgain = await request('POST', '/api/eprescriptions/' + ep.id + '/sign', {
    token: doctor.accessToken,
    body: {},
  });
  log(signAgain.status === 200, 'повторная подписка идемпотентна', signAgain.status);

  const p1Ep = await request('GET', '/api/eprescriptions?limit=50', { token: patient1.accessToken });
  const p1EpList = (p1Ep.json && (p1Ep.json.data || p1Ep.json)) || [];
  log(p1Ep.status === 200 && p1EpList.length >= 1, 'пациент 1 видит свой рецепт', p1EpList.length);

  const p2Ep = await request('GET', '/api/eprescriptions/' + ep.id, { token: patient2.accessToken });
  log(p2Ep.status === 403 || p2Ep.status === 404, 'пациент 2 не видит чужой рецепт', p2Ep.status);

  const epStats = await request('GET', '/api/eprescriptions/statistics', { token: doctor.accessToken });
  log(epStats.status === 200, 'GET /api/eprescriptions/statistics не перехватывается как /:id', epStats.status);

  // ------------------------------------------------------------------
  console.log('\n[10] Облачные бэкапы');

  const createBackup = await request('POST', '/api/backups', {
    token: patient1.accessToken,
    body: {
      name: 'Смоук-тест бэкап',
      description: 'Бэкап из smoke-теста',
      password: PASSWORD,
      confirmPassword: PASSWORD,
      dataTypes: ['chats', 'settings'],
      format: 'json',
    },
  });
  const backup = createBackup.json && (createBackup.json.data || createBackup.json);
  log(createBackup.status === 201 && backup && backup.id, 'бэкап создан', createBackup.status);

  const listBackups = await request('GET', '/api/backups', { token: patient1.accessToken });
  const backupList = (listBackups.json && (listBackups.json.data || listBackups.json)) || [];
  log(
    listBackups.status === 200 && backupList.length >= 1,
    'список бэкапов доступен',
    backupList.length
  );

  const verifyBackup = await request('POST', '/api/backups/verify-password', {
    token: patient1.accessToken,
    body: { backupId: backup.id, password: PASSWORD },
  });
  log(verifyBackup.status === 200, 'verify-password отвечает', verifyBackup.status);

  // ------------------------------------------------------------------
  console.log('\n[11] Порядок роутов и статистика');

  const unread = await request('GET', '/api/messages/unread-count', { token: doctor.accessToken });
  log(unread.status === 200, 'GET /api/messages/unread-count отвечает 200 (не 404)', unread.status);

  const txStats = await request('GET', '/api/payments/statistics', { token: admin.accessToken });
  log(txStats.status === 200, 'GET /api/payments/statistics отвечает 200', txStats.status);

  const txList = await request('GET', '/api/transactions?limit=20', { token: patient2.accessToken });
  log(txList.status === 200, 'GET /api/transactions не 404', txList.status);

  const docTx = await request('GET', '/api/payments/doctor/transactions?limit=20', { token: doctor.accessToken });
  log(docTx.status === 200, 'врач видит свои транзакции', docTx.status);

  // ------------------------------------------------------------------
  console.log('\n[12] E2E: реестр публичных ключей и зашифрованные конверты');

  const p1UserId = patient1.user && patient1.user.id;
  const docUserId = doctor.user && doctor.user.id;
  const runStamp = String(Date.now());
  const p1KeyId = 'smoke-p1-' + runStamp;
  const docKeyId = 'smoke-doc-' + runStamp;
  const P1_PUB_A = Buffer.alloc(32, 1).toString('base64');
  const P1_PUB_B = Buffer.alloc(32, 2).toString('base64');
  const DOC_PUB = Buffer.alloc(32, 3).toString('base64');

  const regP1 = await request('POST', '/api/keys', {
    token: patient1.accessToken,
    body: { keyId: p1KeyId, publicKey: P1_PUB_A, deviceName: 'smoke-test' },
  });
  log(
    regP1.status === 201 && regP1.json && regP1.json.data && regP1.json.data.keyId === p1KeyId,
    'пациент 1 зарегистрировал публичный ключ (201)',
    regP1.status
  );

  const rotateP1 = await request('POST', '/api/keys', {
    token: patient1.accessToken,
    body: { keyId: p1KeyId, publicKey: P1_PUB_B, deviceName: 'smoke-test' },
  });
  log(
    rotateP1.status === 200 && rotateP1.json && rotateP1.json.data && rotateP1.json.data.rotated === true,
    'повторная регистрация = ротация ключа (200, rotated)',
    rotateP1.status
  );

  const badPub = await request('POST', '/api/keys', {
    token: patient1.accessToken,
    body: { keyId: 'smoke-bad-' + runStamp, publicKey: 'AQID' },
  });
  log(badPub.status === 400, 'невалидный publicKey отклоняется (400)', badPub.status);

  const regDoc = await request('POST', '/api/keys', {
    token: doctor.accessToken,
    body: { keyId: docKeyId, publicKey: DOC_PUB, deviceName: 'smoke-test' },
  });
  log(regDoc.status === 201, 'врач зарегистрировал публичный ключ', regDoc.status);

  const myKeys = await request('GET', '/api/keys', { token: patient1.accessToken });
  const myKeysList = (myKeys.json && myKeys.json.data) || [];
  log(
    myKeys.status === 200 && myKeysList.some((k) => k.keyId === p1KeyId && k.publicKey === P1_PUB_B),
    'GET /api/keys возвращает ключи с ротированным значением',
    myKeys.status
  );

  const chatKeys = await request('GET', '/api/chats/' + chat1.id + '/keys', { token: patient1.accessToken });
  const chatKeysList = (chatKeys.json && chatKeys.json.data) || [];
  const chatKeyUserIds = chatKeysList.map((k) => String(k.userId));
  log(
    chatKeys.status === 200 &&
      chatKeysList.length >= 2 &&
      chatKeyUserIds.includes(String(p1UserId)) &&
      chatKeyUserIds.includes(String(docUserId)),
    'ключи чата отдают активные ключи обоих участников',
    chatKeysList.length
  );

  const foreignKeys = await request('GET', '/api/chats/' + chat1.id + '/keys', { token: patient2.accessToken });
  log(foreignKeys.status === 403, 'чужой пользователь не может собрать ключи чата (403)', foreignKeys.status);

  // Зашифрованный конверт: сервер видит ТОЛЬКО шифротекст
  const envelope = {
    v: 1,
    alg: 'x25519-box',
    epk: 'A'.repeat(43),
    nonce: 'B'.repeat(32),
    boxes: {},
  };
  envelope.boxes[p1UserId] = 'C'.repeat(88);
  envelope.boxes[docUserId] = 'C'.repeat(88);

  const e2eMsg = await request('POST', '/api/chats/' + chat1.id + '/messages', {
    token: patient1.accessToken,
    body: { envelope, content: '', type: 'text' },
  });
  log(
    e2eMsg.status === 201 &&
      e2eMsg.json &&
      e2eMsg.json.isEncrypted === true &&
      e2eMsg.json.content === '' &&
      e2eMsg.json.metadata &&
      e2eMsg.json.metadata.e2e &&
      e2eMsg.json.metadata.e2e.alg === 'x25519-box',
    'E2E-сообщение принято: content пуст, конверт в metadata.e2e',
    e2eMsg.status
  );

  const leakAttempt = await request('POST', '/api/chats/' + chat1.id + '/messages', {
    token: patient1.accessToken,
    body: { envelope, content: 'plaintext рядом с конвертом' },
  });
  log(leakAttempt.status === 400, 'plaintext рядом с конвертом отклоняется (400)', leakAttempt.status);

  const noSenderBox = {
    v: 1,
    alg: 'x25519-box',
    epk: 'A'.repeat(43),
    nonce: 'B'.repeat(32),
    boxes: {},
  };
  noSenderBox.boxes[docUserId] = 'C'.repeat(88);
  const noSelfBox = await request('POST', '/api/chats/' + chat1.id + '/messages', {
    token: patient1.accessToken,
    body: { envelope: noSenderBox, content: '' },
  });
  log(noSelfBox.status === 400, 'конверт без бокса отправителя отклоняется (400)', noSelfBox.status);

  const docHistory = await request('GET', '/api/chats/' + chat1.id + '/messages?limit=50', { token: doctor.accessToken });
  const docMsgs = (docHistory.json && (docHistory.json.data || docHistory.json.messages)) || [];
  const e2eInHistory = docMsgs.find((m) => m.metadata && m.metadata.e2e);
  log(
    docHistory.status === 200 &&
      Boolean(e2eInHistory) &&
      e2eInHistory.isEncrypted === true &&
      e2eInHistory.content === '' &&
      typeof e2eInHistory.metadata.e2e.boxes[String(docUserId)] === 'string',
    'врач читает E2E-сообщение: только шифротекст, без plaintext',
    Boolean(e2eInHistory)
  );

  const delKey = await request('DELETE', '/api/keys/' + p1KeyId, { token: patient1.accessToken });
  log(delKey.status === 200, 'деактивация ключа устройства (DELETE /api/keys/:keyId)', delKey.status);

  const chatKeysAfter = await request('GET', '/api/chats/' + chat1.id + '/keys', { token: patient1.accessToken });
  const afterList = (chatKeysAfter.json && chatKeysAfter.json.data) || [];
  log(
    chatKeysAfter.status === 200 &&
      afterList.some((k) => k.keyId === docKeyId) &&
      !afterList.some((k) => k.keyId === p1KeyId),
    'после деактивации в реестре чата остались только активные ключи',
    afterList.length
  );

  // ------------------------------------------------------------------
  console.log('\n==============================================');
  console.log('Проверок: ' + checks + ', ошибок: ' + failures);
  console.log('==============================================');

  await stopServer();

  if (failures > 0) {
    console.error('SMOKE TEST FAILED');
    // Diagnostics: show WHY the server answered 5xx. Winston error logs go
    // to stdout; without these tails a failed check is undiagnosable in CI.
    if (serverStderrTail) {
      console.error('---- server stderr (tail) ----');
      console.error(serverStderrTail);
    }
    if (serverStdoutTail) {
      console.error('--- SERVER STDOUT TAIL (winston error logs go here) ---');
      console.error(serverStdoutTail);
    }
    process.exitCode = 1;
  } else {
    console.log('SMOKE TEST PASSED');
  }
}

function stopServer() {
  return new Promise((resolve) => {
    if (!serverProcess) return resolve();
    serverProcess.__stopped = true;
    const done = () => resolve();
    serverProcess.once('exit', done);
    try {
      serverProcess.kill('SIGTERM');
    } catch (e) {
      done();
    }
    setTimeout(() => {
      try {
        serverProcess.kill('SIGKILL');
      } catch (e) {
        // already dead
      }
      resolve();
    }, 5000);
  });
}

main().catch(async (err) => {
  console.error('Smoke test crashed:', err && err.stack ? err.stack : err);
  if (serverStderrTail) {
    console.error('---- server stderr (tail) ----');
    console.error(serverStderrTail);
  }
  if (serverStdoutTail) {
    console.error('--- SERVER STDOUT TAIL (winston writes error logs to stdout!) ---');
    console.error(serverStdoutTail);
  }
  await stopServer();
  process.exit(1);
});
