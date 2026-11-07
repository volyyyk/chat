#!/usr/bin/env node
/**
 * MedChat v2 Launcher — остановка всего, что launcher запустил.
 *
 *   node stop.js            — остановить сервер / web / expo (если запускал launcher)
 *   node stop.js --docker   — то же + остановить контейнеры postgres/redis/minio
 *
 * Процессы, запущенные ВРУЧНУЮ (не через launcher), этот скрипт не трогает.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const LAUNCHER_DIR = __dirname;
const ROOT = path.resolve(LAUNCHER_DIR, '..');
const PID_FILE = path.join(LAUNCHER_DIR, '.run', 'pids.json');
const DOCKER_COMPOSE = path.join(ROOT, 'docker', 'docker-compose.yml');
const IS_WIN = process.platform === 'win32';

const log = (m) => process.stdout.write(m + '\n');
const ok = (m) => log('✓ ' + m);
const warn = (m) => log('! ' + m);

function main() {
  let stopped = 0;
  let pids = {};
  try {
    pids = JSON.parse(fs.readFileSync(PID_FILE, 'utf8'));
  } catch (e) {
    warn('PID-файл не найден — нечего останавливать (launcher ничего не запускал или уже остановлен).');
  }

  for (const [name, info] of Object.entries(pids)) {
    try {
      if (IS_WIN) {
        spawn('taskkill', ['/PID', String(info.pid), '/T', '/F'], { stdio: 'ignore', shell: true });
      } else {
        process.kill(info.pid, 'SIGTERM');
      }
      ok('Остановлен ' + name + ' (pid ' + info.pid + ')');
      stopped++;
    } catch (e) {
      warn(name + ' (pid ' + info.pid + ') уже не работает.');
    }
  }

  try { fs.unlinkSync(PID_FILE); } catch (e) { /* нет файла */ }
  log(stopped > 0 ? 'Готово.' : 'Ничего не потребовалось останавливать.');

  if (process.argv.includes('--docker')) {
    log('Останавливаю docker-контейнеры (postgres, redis, minio)...');
    const down = spawn('docker', ['compose', '-f', DOCKER_COMPOSE, 'stop', 'postgres', 'redis', 'minio'], { stdio: 'inherit', shell: IS_WIN });
    down.on('exit', (code) => log(code === 0 ? '✓ Контейнеры остановлены (данные сохранены в томах).' : '! docker compose stop вернул ' + code));
  } else {
    log('Подсказка: контейнеры инфраструктуры остались работать. Полная остановка: node stop.js --docker');
  }
}

main();
