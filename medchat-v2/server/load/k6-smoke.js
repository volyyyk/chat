/**
 * k6 load smoke (этап 6 ROADMAP_NATIVE.md, DoD «нагрузочный тест без
 * деградации p95»). Гоняется джобой CI k6-load против настоящего
 * сервера (Postgres + Redis + seed), поднятого на том же раннере.
 *
 * Профиль фиксированный (ramping 2 → 10 VUs, ~60 с) и одинаковый от
 * коммита к коммиту: деградация p95 видна по логу ci-logs/ci-k6.log
 * между прогонами. «x10 текущей нагрузки» калибруется оператором на
 * реальном стенде — CI гейтит стабильность профиля, а не абсолют.
 *
 * Точки:
 * - /health — лёгкий путь, исключён из rate limit (базовая пропускная);
 * - /api/auth/login — тяжёлый путь: bcrypt cost 12 + выдача JWT. В CI-
 *   стенде RATE_LIMIT_AUTH_MAX/RATE_LIMIT_WINDOW_MS повышены (env джобы),
 *   прод-дефолты middleware/rateLimiter.js не тронуты.
 *
 * Запуск локально: k6 run load/k6-smoke.js (сервер на :3000, seed-test).
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const EMAIL = __ENV.LOGIN_EMAIL || 'patient1@medchat.test';
const PASSWORD = __ENV.LOGIN_PASSWORD || 'Test1234!';

export const options = {
  scenarios: {
    load: {
      executor: 'ramping-vus',
      startVUs: 2,
      stages: [
        { duration: '15s', target: 10 },
        { duration: '30s', target: 10 },
        { duration: '10s', target: 0 },
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    // ошибки < 1%: 429/5xx в тесте — фейл прогона
    http_req_failed: ['rate<0.01'],
    // login-путь с bcrypt cost 12 честно тяжёлый: абсолют фиксирован и
    // сравнивается по логу от прогона к прогону
    http_req_duration: ['p(95)<2500'],
  },
};

export default function () {
  const health = http.get(BASE_URL + '/health');
  check(health, {
    'health 200': (r) => r.status === 200,
    'health status ok': (r) => r.json('status') === 'ok',
  });

  const login = http.post(
    BASE_URL + '/api/auth/login',
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(login, {
    'login 200': (r) => r.status === 200,
    'login возвращает accessToken': (r) => !!r.json('accessToken'),
  });

  sleep(0.5);
}
