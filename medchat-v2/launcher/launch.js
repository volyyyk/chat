#!/usr/bin/env node
/**
 * MedChat v2 — Launcher
 * ---------------------------------------------------------------------------
 * Одно-кнопочный запуск нужной стороны проекта:
 *   node launch.js            — интерактивное меню (1/2/3/4)
 *   node launch.js clinic     — администратор клиники (web + сервер)
 *   node launch.js doctor     — врач (web + сервер)
 *   node launch.js patient    — пациент (мобильный клиент Expo + сервер)
 *   node launch.js all        — всё сразу
 *
 * Что делает launcher:
 *   1. Поднимает инфраструктуру из medchat-v2/docker (postgres, redis, minio)
 *      через `docker compose up -d` (только эти три сервиса, НЕ контейнер server).
 *   2. Проверяет, что сервер уже не запущен (health-check на :3000).
 *      Если не запущен — ставит зависимости сервера (при отсутствии),
 *      прогоняет сид тестовых данных (идемпотентно) и запускает сервер.
 *   3. Для clinic/doctor — запускает web-клиент на http://localhost:3002
 *      и открывает браузер; для patient — запускает expo start (QR в терминале).
 *   4. Печатает логины/пароли тестовых аккаунтов выбранной роли.
 *
 * Папка launcher полностью автономна: не меняет код server/web/mobile,
 * все свои временные файлы (логи, PID-файл) держит внутри launcher/.run/.
 * Папку можно удалить в любой момент — см. README.md в этой папке.
 *
 * Требования: Node.js >= 18, Docker Desktop (postgres/redis/minio).
 * Зависимостей npm у самого launcher нет — только встроенные модули Node.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const readline = require('readline');

const LAUNCHER_DIR = __dirname;
const ROOT = path.resolve(LAUNCHER_DIR, '..'); // medchat-v2
const SERVER_DIR = path.join(ROOT, 'server');
const WEB_DIR = path.join(ROOT, 'web');
const MOBILE_DIR = path.join(ROOT, 'mobile');
const DOCKER_COMPOSE = path.join(ROOT, 'docker', 'docker-compose.yml');
const RUN_DIR = path.join(LAUNCHER_DIR, '.run');
const PID_FILE = path.join(RUN_DIR, 'pids.json');
const LOG_DIR = path.join(RUN_DIR, 'logs');

const SERVER_URL = 'http://localhost:3000';
const WEB_PORT = 3002;

const IS_WIN = process.platform === 'win32';

const ACCOUNTS = {
  clinic: {
    title: 'Администратор клиники',
    login: 'admin@medchat.test',
    password: 'Test1234!',
    hints: [
      'Web-клиент: http://localhost:' + WEB_PORT + ' (логин admin@medchat.test / Test1234!)',
      'Видит чаты и баланс своей клиники, статистику платежей.',
    ],
  },
  doctor: {
    title: 'Врач',
    login: 'doctor@medchat.test',
    password: 'Test1234!',
    hints: [
      'Web-клиент: http://localhost:' + WEB_PORT + ' (логин doctor@medchat.test / Test1234!)',
      'Отвечает пациентам бесплатно, подтверждает приёмы, подписывает e-рецепты.',
    ],
  },
  patient: {
    title: 'Пациент',
    login: 'patient1@medchat.test',
    password: 'Test1234!',
    hints: [
      'Мобильный клиент: отсканируйте QR-код из терминала Expo Go (Android/iOS),',
      'телефон и компьютер должны быть в одной Wi-Fi сети.',
      'Аккаунты: patient1@medchat.test (сообщения бесплатные) и',
      'patient2@medchat.test (платные, тестовый баланс), пароль Test1234!.',
    ],
  },
};

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

const c = {
  reset: (s) => '\x1b[0m' + s + '\x1b[0m',
  bold: (s) => '\x1b[1m' + s + '\x1b[0m',
  green: (s) => '\x1b[32m' + s + '\x1b[0m',
  yellow: (s) => '\x1b[33m' + s + '\x1b[0m',
  red: (s) => '\x1b[31m' + s + '\x1b[0m',
  cyan: (s) => '\x1b[36m' + s + '\x1b[0m',
};

const log = (msg) => process.stdout.write(msg + '\n');
const step = (msg) => log(c.cyan('▶ ') + msg);
const ok = (msg) => log(c.green('✓ ') + msg);
const warn = (msg) => log(c.yellow('! ') + msg);
const fail = (msg) => log(c.red('✗ ') + msg);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ensureRunDirs() {
  fs.mkdirSync(RUN_DIR, { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function loadPids() {
  try {
    return JSON.parse(fs.readFileSync(PID_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

function savePids(pids) {
  fs.writeFileSync(PID_FILE, JSON.stringify(pids, null, 2));
}

function recordPid(name, child) {
  const pids = loadPids();
  pids[name] = { pid: child.pid, command: child.spawnargs ? child.spawnargs.join(' ') : String(child.pid) };
  savePids(pids);
}

function spawnLogged(name, command, args, options) {
  const logFile = path.join(LOG_DIR, name + '.log');
  const out = fs.openSync(logFile, 'a');
  const child = spawn(command, args, {
    stdio: ['ignore', out, out],
    shell: IS_WIN, // npm на Windows — это npm.cmd
    ...options,
  });
  child.on('exit', () => {
    try { fs.closeSync(out); } catch (e) { /* already closed */ }
  });
  return child;
}

function httpGet(url, timeoutMs) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve({ ok: res.statusCode < 500, status: res.statusCode });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0 }); });
    req.on('error', () => resolve({ ok: false, status: 0 }));
  });
}

async function waitFor(url, label, attempts, intervalMs) {
  for (let i = 0; i < attempts; i++) {
    const res = await httpGet(url, 1500);
    if (res.ok) return true;
    process.stdout.write('.');
    await sleep(intervalMs);
  }
  process.stdout.write('\n');
  return false;
}

function commandExists(cmd, args) {
  return new Promise((resolve) => {
    try {
      const p = spawn(cmd, args, { shell: IS_WIN, stdio: 'ignore' });
      p.on('error', () => resolve(false));
      p.on('exit', (code) => resolve(code === 0));
    } catch (e) {
      resolve(false);
    }
  });
}

function openBrowser(urlToOpen) {
  const p = IS_WIN ? spawn('cmd', ['/c', 'start', '', urlToOpen], { detached: true, stdio: 'ignore' })
    : process.platform === 'darwin' ? spawn('open', [urlToOpen], { detached: true, stdio: 'ignore' })
    : spawn('xdg-open', [urlToOpen], { detached: true, stdio: 'ignore' });
  p.on('error', () => warn('Не удалось открыть браузер автоматически — откройте ' + urlToOpen + ' вручную.'));
  p.unref();
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve((answer || '').trim());
    });
  });
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

async function ensureInfrastructure() {
  step('Проверяю Docker...');
  const hasCompose = await commandExists('docker', ['compose', 'version']);
  if (!hasCompose) {
    warn('docker compose недоступен. Запущу без него — считаю, что PostgreSQL/Redis/MinIO уже стоят локально.');
    warn('Подними их вручную или через: docker compose -f docker/docker-compose.yml up -d postgres redis minio');
    return;
  }
  step('Поднимаю postgres / redis / minio (контейнер server НЕ трогаю)...');
  const up = spawnLogged('docker-up', 'docker', ['compose', '-f', DOCKER_COMPOSE, 'up', '-d', 'postgres', 'redis', 'minio'], {});
  const code = await new Promise((resolve) => up.on('exit', resolve));
  if (code === 0) {
    ok('Инфраструктура поднята (или уже была поднята).');
  } else {
    warn('docker compose up вернул код ' + code + ' — посмотри ' + path.join(LOG_DIR, 'docker-up.log'));
    warn('Продолжаю: возможно, база уже доступна локально.');
  }
}

async function ensureServer() {
  step('Проверяю сервер на ' + SERVER_URL + ' ...');
  const running = await httpGet(SERVER_URL + '/health', 1500);
  if (running.ok) {
    ok('Сервер уже запущен — не трогаю.');
    return;
  }
  process.stdout.write('  нет ответа\n');

  if (!fs.existsSync(path.join(SERVER_DIR, 'node_modules'))) {
    step('Ставлю зависимости сервера (первый запуск, ~1-2 минуты)...');
    const install = spawnLogged('server-install', 'npm', ['install', '--no-audit', '--no-fund'], { cwd: SERVER_DIR });
    const code = await new Promise((resolve) => install.on('exit', resolve));
    if (code !== 0) {
      fail('npm install сервера не прошёл. Лог: ' + path.join(LOG_DIR, 'server-install.log'));
      process.exit(1);
    }
    ok('Зависимости сервера установлены.');
  }

  step('Прогоняю сид тестовых данных (идемпотентно)...');
  const seed = spawnLogged('seed', 'npm', ['run', 'seed:test'], { cwd: SERVER_DIR, env: { ...process.env, NODE_ENV: 'development' } });
  const seedCode = await new Promise((resolve) => seed.on('exit', resolve));
  if (seedCode === 0) {
    ok('Тестовые данные на месте.');
  } else {
    warn('seed:test вернул ' + seedCode + ' (возможно, уже созданы). Лог: ' + path.join(LOG_DIR, 'seed.log'));
  }

  step('Запускаю сервер на :3000 ...');
  const server = spawnLogged('server', 'npm', ['start'], { cwd: SERVER_DIR, env: { ...process.env, NODE_ENV: 'development' } });
  recordPid('server', server);
  server.on('exit', (code) => warn('Сервер завершился с кодом ' + code + ' (лог: ' + path.join(LOG_DIR, 'server.log') + ')'));

  const up = await waitFor(SERVER_URL + '/health', 'health', 60, 1000);
  if (up) {
    ok('Сервер запущен: ' + SERVER_URL);
  } else {
    fail('Сервер не поднялся за 60 секунд. Лог: ' + path.join(LOG_DIR, 'server.log'));
    process.exit(1);
  }
}

async function startWebClient() {
  step('Запускаю web-клиент на :' + WEB_PORT + ' ...');
  const res = await httpGet('http://localhost:' + WEB_PORT, 1200);
  if (res.status !== 0) {
    ok('На порту ' + WEB_PORT + ' уже что-то отвечает — не запускаю второй.');
    return;
  }
  if (!fs.existsSync(path.join(WEB_DIR, 'node_modules'))) {
    step('Ставлю зависимости web-клиента (первый запуск, ~1-2 минуты)...');
    const install = spawnLogged('web-install', 'npm', ['install', '--no-audit', '--no-fund'], { cwd: WEB_DIR });
    const code = await new Promise((resolve) => install.on('exit', resolve));
    if (code !== 0) {
      fail('npm install web-клиента не прошёл. Лог: ' + path.join(LOG_DIR, 'web-install.log'));
      return;
    }
  }
  const web = spawnLogged('web', 'npm', ['start'], {
    cwd: WEB_DIR,
    env: {
      ...process.env,
      PORT: String(WEB_PORT),
      BROWSER: 'none', // браузер откроет launcher, когда сервер готов
      REACT_APP_API_URL: SERVER_URL,
      REACT_APP_WS_URL: SERVER_URL,
    },
  });
  recordPid('web', web);
  web.on('exit', (code) => warn('Web-клиент завершился с кодом ' + code + ' (лог: ' + path.join(LOG_DIR, 'web.log') + ')'));

  const up = await waitFor('http://localhost:' + WEB_PORT, 'web', 90, 1000);
  if (up) {
    ok('Web-клиент готов: http://localhost:' + WEB_PORT);
    openBrowser('http://localhost:' + WEB_PORT);
  } else {
    warn('Web-клиент не поднялся за 90 секунд. Лог: ' + path.join(LOG_DIR, 'web.log'));
  }
}

async function startMobileClient() {
  step('Запускаю мобильный клиент (Expo)...');
  if (!fs.existsSync(path.join(MOBILE_DIR, 'node_modules'))) {
    step('Ставлю зависимости мобильного клиента (первый запуск, может занять несколько минут)...');
    const install = spawnLogged('mobile-install', 'npm', ['install', '--no-audit', '--no-fund'], { cwd: MOBILE_DIR });
    const code = await new Promise((resolve) => install.on('exit', resolve));
    if (code !== 0) {
      fail('npm install мобильного клиента не прошёл. Лог: ' + path.join(LOG_DIR, 'mobile-install.log'));
      return;
    }
    ok('Зависимости мобильного клиента установлены.');
  }
  const mobile = spawnLogged('mobile', 'npx', ['expo', 'start'], {
    cwd: MOBILE_DIR,
    env: {
      ...process.env,
      REACT_NATIVE_PACKAGER_HOSTNAME: process.env.REACT_NATIVE_PACKAGER_HOSTNAME || '', // пусто = авто-LAN IP
    },
  });
  recordPid('mobile', mobile);
  mobile.on('exit', (code) => warn('Expo завершился с кодом ' + code + ' (лог: ' + path.join(LOG_DIR, 'mobile.log') + ')'));
  ok('Expo стартует. QR-код появится в терминале выше через несколько секунд.');
  log('  Открой Expo Go на телефоне (телефон и компьютер в одной Wi-Fi сети) и отсканируй QR.');
  log('  В Expo Go нажми "w", чтобы открыть веб-версию на компьютере.');
}

function printCredentials(roles) {
  log('');
  log(c.bold('════════════════ ТЕСТОВЫЕ АККАУНТЫ ════════════════'));
  for (const role of roles) {
    const acc = ACCOUNTS[role];
    log('');
    log(c.bold(acc.title) + ': ' + c.green(acc.login) + ' / ' + c.green(acc.password));
    for (const hint of acc.hints) log('  ' + hint);
  }
  log('');
  log(c.bold('════════════════════════════════════════════════════'));
  log('  Остановить всё:   node ' + path.relative(process.cwd(), path.join(LAUNCHER_DIR, 'stop.js')) + '   (или Ctrl+C в этом окне)');
  log('  Документация:     medchat-v2/docs/GETTING_STARTED.md');
  log('');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  log('');
  log(c.bold('╔══════════════════════════════════════════════════╗'));
  log(c.bold('║         MedChat v2 — Launcher                     ║'));
  log(c.bold('║   Запуск сторон: клиника / врач / пациент         ║'));
  log(c.bold('╚══════════════════════════════════════════════════╝'));
  log('');

  let role = (process.argv[2] || '').toLowerCase();
  const valid = ['clinic', 'doctor', 'patient', 'all'];
  if (!valid.includes(role)) {
    log('Какую сторону запускаем?');
    log('  1. Клиника  (администратор, web-клиент)');
    log('  2. Врач     (web-клиент)');
    log('  3. Пациент  (мобильный клиент Expo)');
    log('  4. Всё сразу');
    log('');
    const answer = await ask('Выбери (1-4) и нажми Enter: ');
    role = { '1': 'clinic', '2': 'doctor', '3': 'patient', '4': 'all' }[answer] || '';
    if (!valid.includes(role)) {
      fail('Не понял выбор. Запусти ещё раз или укажи роль: node launch.js clinic|doctor|patient|all');
      process.exit(1);
    }
  }

  ensureRunDirs();
  log('');

  await ensureInfrastructure();
  await ensureServer();

  const roles = role === 'all' ? ['clinic', 'doctor', 'patient'] : [role];
  if (roles.includes('clinic') || roles.includes('doctor')) {
    await startWebClient();
  }
  if (roles.includes('patient')) {
    await startMobileClient();
  }

  printCredentials(roles);

  log('Launcher свою работу сделал — процессы работают в фоне, логи в ' + path.join('.run', 'logs') + '.');
  log('Нажми Ctrl+C, чтобы остановить запущенное (или запусти node stop.js).');

  // Держим процесс живым, пока живы дочерние процессы; по Ctrl+C гасим их.
  const onExit = async () => {
    log('');
    step('Останавливаю запущенные процессы...');
    const pids = loadPids();
    for (const [name, info] of Object.entries(pids)) {
      try {
        if (IS_WIN) {
          spawn('taskkill', ['/PID', String(info.pid), '/T', '/F'], { stdio: 'ignore', shell: true });
        } else {
          process.kill(info.pid, 'SIGTERM');
        }
      } catch (e) { /* уже мёртв */ }
    }
    try { fs.unlinkSync(PID_FILE); } catch (e) { /* нет файла */ }
    log('Инфраструктуру docker не трогаю (она безопасна). Полная остановка: docker compose -f docker/docker-compose.yml stop');
    process.exit(0);
  };
  process.on('SIGINT', onExit);
  process.on('SIGTERM', onExit);

  // Не даём Node завершиться, пока живы дети
  setInterval(() => {}, 60000);
}

main().catch((err) => {
  fail('Launcher упал: ' + (err && err.stack ? err.stack : err));
  process.exit(1);
});
