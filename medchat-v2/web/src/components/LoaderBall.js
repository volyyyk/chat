/**
 * Физичный шарик-загрузчик для экрана входа (референс: cgw334.mount.jp).
 * Желейный шарик (verlet, 60 точек) протискивается между двумя точечками;
 * анимация длится минимум LOADER_MIN_MS мс: если реальная работа (вход,
 * проверка сервера) завершилась раньше, делаем вид, что загрузка ещё идёт.
 * На 95% шарик плюхается вниз и разбивается об надпись «Загрузка завершена»;
 * кнопка 🔃 проигрывает анимацию заново, «Перейти дальше» продолжает вход.
 *
 * Props:
 *   runId     - увеличьте, чтобы запустить/перезапустить анимацию;
 *   complete  - true, когда реальная работа завершена;
 *   failed    - true при ошибке: шарик на секунду краснеет, дрожит
 *               и злится, затем вызывается onError;
 *   onProceed - нажатие «Перейти дальше».
 */
import React, { useEffect, useRef, useState } from 'react';

export const LOADER_MIN_MS = 5000;

export default function LoaderBall({ runId, complete, failed, onError, onProceed }) {
  const canvasRef = useRef(null);
  const completeRef = useRef(complete);
  const failedRef = useRef(failed);
  const proceedRef = useRef(onProceed);
  const errorRef = useRef(onError);
  const [pct, setPct] = useState(0);
  const [phase, setPhase] = useState('loading');
  const [replayKey, setReplayKey] = useState(0);

  useEffect(() => { completeRef.current = complete; }, [complete]);
  useEffect(() => { failedRef.current = failed; }, [failed]);
  useEffect(() => { proceedRef.current = onProceed; }, [onProceed]);
  useEffect(() => { errorRef.current = onError; }, [onError]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let W = 0; let H = 0;
    let r = 44; let pegR = 22; let pegY = 0; let pegGap = 0; let burstY = 0;
    const N = 60;
    const plan = [[900, 0.18], [500, 0.22], [1400, 0.47], [700, 0.52], [1600, 0.78], [900, 0.86], [600, 0.90]];
    const pegs = [{ ox: 0, oy: 0, vx: 0, vy: 0 }, { ox: 0, oy: 0, vx: 0, vy: 0 }];
    const ptr = { x: 0, y: 0, px: 0, py: 0, down: false };
    let pts = [];
    let drops = [];
    let homeA = [];
    let phaseLocal = 'loading';
    let progress = 0; let planIdx = 0; let fromP = 0; let planT = 0; let elapsed = 0; let lastPct = -1;
    let burstAt = 0;
    let errorAt = 0; let errorFired = false;
    let blink = 0; let blinkTimer = 2400;
    let shownPhase = 'loading';
    let last = 0;

    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      r = Math.max(32, Math.min(52, W * 0.085));
      pegR = r * 0.5;
      pegY = H * 0.38;
      pegGap = 2 * (r * 0.55 + pegR);
      burstY = H - 150;
    }

    function initBall() {
      pts = [];
      homeA = [];
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        homeA.push(a);
        const x = W / 2 + Math.cos(a) * r;
        const y = -r * 2.5 + Math.sin(a) * r;
        pts.push({ x: x, y: y, px: x, py: y });
      }
    }

    function center() {
      let cx = 0; let cy = 0;
      for (const p of pts) { cx += p.x; cy += p.y; }
      return { x: cx / N, y: cy / N };
    }

    function pegPos(i) {
      const s = i === 0 ? -1 : 1;
      return { x: W / 2 + (s * pegGap) / 2 + pegs[i].ox, y: pegY + pegs[i].oy };
    }

    function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

    function collidePeg(p, cx, cy, pr) {
      const dx = p.x - cx; const dy = p.y - cy;
      const d = Math.hypot(dx, dy);
      if (d < pr) {
        const inv = d > 0.001 ? 1 / d : 0;
        p.x = cx + dx * inv * pr; p.y = cy + dy * inv * pr;
        p.px = p.x - (p.x - p.px) * 0.5;
        p.py = p.y - (p.y - p.py) * 0.5;
      }
    }

    function burst() {
      phaseLocal = 'burst';
      burstAt = performance.now();
      const c = center();
      for (const p of pts) {
        drops.push({
          x: p.x, y: p.y,
          vx: (p.x - p.px) * 2.2 + (p.x - c.x) * 0.16 + (Math.random() - 0.5) * 2.4,
          vy: (p.y - p.py) * 2.2 - Math.random() * 3.2,
          rr: 1.6 + Math.random() * 2.6,
          life: 1,
        });
      }
    }

    // Ограничения формы: пружины соседей + спицы + давление площади.
    function relax() {
      const L = 2 * r * Math.sin(Math.PI / N);
      const targetArea = Math.PI * r * r;
      for (let it = 0; it < 3; it++) {
        for (let i = 0; i < N; i++) {
          const a = pts[i]; const b = pts[(i + 1) % N];
          const ddx = b.x - a.x; const ddy = b.y - a.y;
          const dd = Math.hypot(ddx, ddy) || 0.001;
          const diff = ((dd - L) / dd) * 0.5;
          a.x += ddx * diff; a.y += ddy * diff;
          b.x -= ddx * diff; b.y -= ddy * diff;
        }
        const cc = center();
        for (let i = 0; i < N; i++) {
          const q = pts[i];
          const sx = q.x - cc.x; const sy = q.y - cc.y;
          const sd = Math.hypot(sx, sy) || 0.001;
          const sk = ((sd - r) / sd) * 0.06;
          q.x -= sx * sk; q.y -= sy * sk;
        }
        let area = 0;
        for (let i = 0; i < N; i++) {
          const a = pts[i]; const b = pts[(i + 1) % N];
          area += a.x * b.y - b.x * a.y;
        }
        area = Math.abs(area) / 2;
        const scale = Math.sqrt(targetArea / Math.max(area, 1));
        const kk = 1 + (scale - 1) * 0.22;
        const c2 = center();
        for (let i = 0; i < N; i++) {
          const q = pts[i];
          q.x = c2.x + (q.x - c2.x) * kk;
          q.y = c2.y + (q.y - c2.y) * kk;
        }
        const pg0 = pegPos(0); const pg1 = pegPos(1);
        for (let i = 0; i < N; i++) {
          const q = pts[i];
          collidePeg(q, pg0.x, pg0.y, pegR);
          collidePeg(q, pg1.x, pg1.y, pegR);
          if (q.y < -r * 6) q.y = -r * 6;
          if (q.x < 10) { q.x = 10; q.px = q.x; }
          if (q.x > W - 10) { q.x = W - 10; q.px = q.x; }
        }
      }
    }

    // Плавный возврат формы: каждая точка тянется к своему месту на круге,
    // поэтому даже после сильной тряски шарик возвращается в состояние шарика.
    function homeSpring() {
      const ch = center();
      for (let i = 0; i < N; i++) {
        const hx = ch.x + Math.cos(homeA[i]) * r;
        const hy = ch.y + Math.sin(homeA[i]) * r;
        pts[i].x += (hx - pts[i].x) * 0.02;
        pts[i].y += (hy - pts[i].y) * 0.02;
      }
    }

    function step(k) {
      if (phaseLocal === 'burst') {
        for (const d of drops) { d.vy += 0.34 * k; d.x += d.vx * k; d.y += d.vy * k; d.life -= 0.014 * k; }
        drops = drops.filter((d) => d.life > 0);
        if (performance.now() - burstAt > 650) phaseLocal = 'done';
        return;
      }
      if (failedRef.current && (phaseLocal === 'loading' || phaseLocal === 'plop')) {
        phaseLocal = 'error';
        errorAt = performance.now();
      }
      if (phaseLocal === 'error') {
        // тремор: всё тело дрожит, но форма тянется обратно к шару
        for (const qe of pts) { qe.x += (Math.random() - 0.5) * 2.6; qe.y += (Math.random() - 0.5) * 2.6; }
        relax();
        homeSpring();
        if (!errorFired && performance.now() - errorAt >= 1000) {
          errorFired = true;
          if (errorRef.current) errorRef.current();
        }
        return;
      }
      const c = center();
      const startY = -r * 2.5;
      const holdY = pegY + pegR + r * 0.92;
      let pull = 0.045; let grav = 0.10; let targetY;
      if (phaseLocal === 'plop') { targetY = burstY - r * 0.2; pull = 0.11; grav = 0.55; }
      else targetY = startY + (holdY - startY) * ease(progress);

      if (phaseLocal === 'loading') {
        planT += 16.7 * k; elapsed += 16.7 * k;
        const st = plan[planIdx];
        if (st) {
          const kk = Math.min(1, planT / st[0]);
          progress = fromP + (st[1] - fromP) * kk;
          if (kk >= 1) { fromP = st[1]; planIdx++; planT = 0; }
        } else if (completeRef.current && elapsed >= LOADER_MIN_MS) {
          // реальная работа уже завершена, но 5 секунд держим вид загрузки
          progress = Math.min(0.96, progress + 0.02 * k);
        }
        const p = Math.round(progress * 100);
        if (p !== lastPct) { lastPct = p; setPct(p); }
        if (progress >= 0.95) phaseLocal = 'plop';
      }

      // точечки пружинят, когда шарик давит на них
      for (let i = 0; i < 2; i++) {
        const g = pegs[i]; const pp = pegPos(i);
        const d = Math.hypot(c.x - pp.x, c.y - pp.y);
        let tx = 0; let ty = 0;
        if (d < r + pegR && d > 0.001) {
          const f = Math.min(7, (r + pegR - d) * 0.35);
          tx = ((c.x - pp.x) / d) * f; ty = ((c.y - pp.y) / d) * f;
        }
        g.vx += (tx - g.ox) * 0.3; g.vy += (ty - g.oy) * 0.3;
        g.vx *= 0.72; g.vy *= 0.72;
        g.ox += g.vx; g.oy += g.vy;
      }

      // палец лишь немного тянет шарик в сторону
      let pvx = 0; let pvy = 0;
      if (ptr.down) { pvx = ptr.x - ptr.px; pvy = ptr.y - ptr.py; ptr.px = ptr.x; ptr.py = ptr.y; }

      for (let j = 0; j < N; j++) {
        const p = pts[j];
        const ax = (W / 2 - c.x) * 0.010;
        const ay = (targetY - c.y) * pull + grav;
        let vx = (p.x - p.px) * 0.988 + ax;
        let vy = (p.y - p.py) * 0.988 + ay;
        if (ptr.down) {
          const dx = p.x - ptr.x; const dy = p.y - ptr.y;
          const dd = Math.hypot(dx, dy);
          if (dd < 110) {
            const f = 1 - dd / 110; const inv = dd > 0.001 ? 1 / dd : 0;
            vx += pvx * 0.14 * f + dx * inv * 0.9 * f;
            vy += pvy * 0.14 * f + dy * inv * 0.9 * f;
          }
        }
        p.px = p.x; p.py = p.y;
        p.x += vx; p.y += vy;
      }

      relax();
      homeSpring();

      if (phaseLocal === 'plop') {
        const cf = center();
        if (cf.y >= burstY - r * 0.35) burst();
      }
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < 2; i++) {
        const pp = pegPos(i);
        ctx.beginPath(); ctx.arc(pp.x, pp.y, pegR, 0, Math.PI * 2);
        ctx.fillStyle = '#2f3542'; ctx.fill();
        ctx.beginPath(); ctx.arc(pp.x - pegR * 0.3, pp.y - pegR * 0.3, pegR * 0.28, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fill();
      }
      for (const d of drops) {
        ctx.beginPath(); ctx.arc(d.x, d.y, d.rr * Math.max(0.2, d.life), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(78,190,146,' + (0.85 * d.life).toFixed(3) + ')'; ctx.fill();
      }
      if (phaseLocal === 'burst' || phaseLocal === 'done') return;
      const c = center();
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const p0 = pts[(i - 1 + N) % N]; const p1 = pts[i];
        const p2 = pts[(i + 1) % N]; const p3 = pts[(i + 2) % N];
        if (i === 0) ctx.moveTo(p1.x, p1.y);
        ctx.bezierCurveTo(
          p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6,
          p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6,
          p2.x, p2.y);
      }
      ctx.closePath();
      const isErr = phaseLocal === 'error';
      const grad = ctx.createRadialGradient(c.x - r * 0.35, c.y - r * 0.45, r * 0.2, c.x, c.y, r * 1.4);
      if (isErr) { grad.addColorStop(0, '#f6b0b0'); grad.addColorStop(0.55, '#e26d6d'); grad.addColorStop(1, '#b03a2e'); }
      else { grad.addColorStop(0, '#b9f0d8'); grad.addColorStop(0.55, '#6fd6ab'); grad.addColorStop(1, '#3cae87'); }
      ctx.fillStyle = grad; ctx.fill();
      ctx.strokeStyle = isErr ? 'rgba(140,32,32,.45)' : 'rgba(38,120,92,.35)';
      ctx.lineWidth = 1.5; ctx.stroke();
      ctx.save(); ctx.clip();
      ctx.beginPath();
      ctx.ellipse(c.x - r * 0.34, c.y - r * 0.42, r * 0.34, r * 0.2, -0.6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill();
      ctx.restore();
      // глазки жмурятся у точечек и моргают
      const ex = r * 0.34; const ey = c.y - r * 0.08;
      const d0 = Math.hypot(c.x - pegPos(0).x, c.y - pegY);
      const squeeze = d0 < r * 1.3 ? 0.55 : 1;
      blink -= 16;
      if (blink < -blinkTimer) { blink = 130; blinkTimer = 2400 + Math.random() * 2600; }
      const open = blink > 0 ? 0.12 : 1;
      ctx.fillStyle = '#1f2430';
      for (let s = -1; s <= 1; s += 2) {
        ctx.beginPath();
        ctx.ellipse(c.x + s * ex, ey, 3.4, 4.6 * open * squeeze, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(c.x, c.y + r * 0.22, 4.5, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.strokeStyle = '#1f2430'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.stroke();
      if (isErr) {
        // злость: сердитые брови и недовольный рот
        ctx.beginPath();
        ctx.moveTo(c.x - ex - 7, ey - 10); ctx.lineTo(c.x - ex + 5, ey - 3);
        ctx.moveTo(c.x + ex + 7, ey - 10); ctx.lineTo(c.x + ex - 5, ey - 3);
        ctx.lineWidth = 2.4; ctx.stroke();
        ctx.beginPath();
        ctx.arc(c.x, c.y + r * 0.42, 5.5, 1.15 * Math.PI, 1.85 * Math.PI);
        ctx.stroke();
      }
    }

    function loop(now) {
      const dt = Math.min(34, now - last || 16.7); last = now;
      step(dt / 16.7);
      draw();
      if (phaseLocal !== shownPhase) { shownPhase = phaseLocal; setPhase(phaseLocal); }
      raf = requestAnimationFrame(loop);
    }

    function onDown(e) { ptr.down = true; ptr.x = ptr.px = e.clientX; ptr.y = ptr.py = e.clientY; }
    function onMove(e) { if (ptr.down) { ptr.px = ptr.x; ptr.py = ptr.y; ptr.x = e.clientX; ptr.y = e.clientY; } }
    function onUp() { ptr.down = false; }

    resize(); initBall();
    last = performance.now();
    raf = requestAnimationFrame(loop);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('resize', resize);
    };
  }, [runId, replayKey]);

  const overlayStyle = { position: 'fixed', inset: 0, zIndex: 60, background: '#f6f7fb' };
  const canvasStyle = { position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none', cursor: 'grab' };
  const statusStyle = { position: 'absolute', top: 18, left: 0, right: 0, textAlign: 'center', color: '#6b7280', fontSize: 15 };
  const doneWrapStyle = { position: 'absolute', left: 0, right: 0, bottom: 56, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 };
  const doneRowStyle = { display: 'flex', alignItems: 'center', gap: 10, fontSize: 24, fontWeight: 700, color: '#16213a' };
  const replayStyle = { padding: '6px 12px', fontSize: 16, borderRadius: 999, background: 'transparent', border: '1px solid #d7dbe4', cursor: 'pointer' };
  const nextStyle = { padding: '12px 40px', fontSize: 16 };

  return (
    <div style={overlayStyle}>
      <canvas ref={canvasRef} style={canvasStyle} />
      {phase === 'loading' && (
        <div style={statusStyle}>Подключение… <b>{pct}%</b></div>
      )}
      {phase === 'error' && (
        <div style={{ ...statusStyle, color: '#b03a2e', fontWeight: 700 }}>Ошибка</div>
      )}
      {(phase === 'plop' || phase === 'burst' || phase === 'done') && (
        <div style={doneWrapStyle}>
          <div style={doneRowStyle}>
            <span>Загрузка завершена ✓</span>
            {phase === 'done' && (
              <button
                style={replayStyle}
                title="Проиграть заново"
                onClick={() => { setPct(0); setPhase('loading'); setReplayKey((k) => k + 1); }}
              >
                🔃
              </button>
            )}
          </div>
          {phase === 'done' && (
            <button style={nextStyle} onClick={() => proceedRef.current && proceedRef.current()}>
              Перейти дальше
            </button>
          )}
        </div>
      )}
    </div>
  );
}
