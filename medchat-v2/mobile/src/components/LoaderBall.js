/**
 * Физичный шарик-загрузчик (референс: cgw334.mount.jp) для Expo/RN:
 * желейный шарик (verlet, 60 точек) минимум 5 секунд протискивается
 * между двумя точечками; если реальная работа завершилась раньше, делаем
 * вид, что грузим дальше. На 95% шарик плюхается вниз и разбивается об
 * надпись «Загрузка завершена»; кнопка 🔃 проигрывает анимацию заново.
 *
 * Props: runId (перезапуск), complete (работа завершена),
 * failed (ошибка: шарик на секунду краснеет, дрожит и злится, затем onError),
 * onProceed.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, PanResponder } from 'react-native';
import Svg, { Path, Circle, Ellipse, G, Defs, RadialGradient, Stop } from 'react-native-svg';

const MIN_MS = 5000;

function createSim(w, h) {
  const sim = {
    n: 60, w: w, h: h, r: 44, pegR: 22, pegY: 0, pegGap: 0, burstY: 0,
    phase: 'loading', progress: 0, pct: 0, shownPct: -1,
    planIdx: 0, fromP: 0, planT: 0, elapsed: 0, lastPct: -1, inited: false,
    burstAt: 0, blink: 0, blinkTimer: 2400,
    failed: false, errorAt: 0, errorMs: 0, errorFired: false,
    xs: [], ys: [], pxs: [], pys: [], homeA: [],
    pegs: [{ ox: 0, oy: 0, vx: 0, vy: 0 }, { ox: 0, oy: 0, vx: 0, vy: 0 }],
    drops: [],
    ptrDown: false, ptrX: 0, ptrY: 0, lastX: 0, lastY: 0, dragX: 0, dragY: 0,
    plan: [[900, 0.18], [500, 0.22], [1400, 0.47], [700, 0.52], [1600, 0.78], [900, 0.86], [600, 0.90]],
  };
  sim.resize = function (nw, nh) {
    if (!nw || !nh) return;
    sim.w = nw; sim.h = nh;
    sim.r = Math.max(32, Math.min(52, nw * 0.085));
    sim.pegR = sim.r * 0.5;
    sim.pegY = nh * 0.38;
    sim.pegGap = 2 * (sim.r * 0.55 + sim.pegR);
    sim.burstY = nh - 150;
    if (!sim.inited) { sim.inited = true; sim.initBall(); }
  };
  sim.initBall = function () {
    sim.xs = []; sim.ys = []; sim.pxs = []; sim.pys = []; sim.homeA = [];
    for (let i = 0; i < sim.n; i++) {
      const a = (i / sim.n) * Math.PI * 2;
      sim.homeA.push(a);
      const x = sim.w / 2 + Math.cos(a) * sim.r;
      const y = -sim.r * 2.5 + Math.sin(a) * sim.r;
      sim.xs.push(x); sim.ys.push(y); sim.pxs.push(x); sim.pys.push(y);
    }
  };
  sim.reset = function () {
    sim.inited = false; sim.phase = 'loading'; sim.progress = 0; sim.pct = 0;
    sim.planIdx = 0; sim.fromP = 0; sim.planT = 0; sim.elapsed = 0; sim.lastPct = -1;
    sim.failed = false; sim.errorAt = 0; sim.errorMs = 0; sim.errorFired = false;
    sim.drops = []; sim.blink = 0; sim.blinkTimer = 2400; sim.ptrDown = false;
  };
  sim.center = function () {
    let cx = 0; let cy = 0;
    for (let i = 0; i < sim.n; i++) { cx += sim.xs[i]; cy += sim.ys[i]; }
    return { x: cx / sim.n, y: cy / sim.n };
  };
  sim.pegPos = function (i) {
    const s = i === 0 ? -1 : 1;
    return { x: sim.w / 2 + (s * sim.pegGap) / 2 + sim.pegs[i].ox, y: sim.pegY + sim.pegs[i].oy };
  };
  sim.ease = function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
  sim.collidePeg = function (i, cx, cy) {
    const dx = sim.xs[i] - cx; const dy = sim.ys[i] - cy;
    const d = Math.hypot(dx, dy);
    if (d < sim.pegR) {
      const inv = d > 0.001 ? 1 / d : 0;
      sim.xs[i] = cx + dx * inv * sim.pegR;
      sim.ys[i] = cy + dy * inv * sim.pegR;
      sim.pxs[i] = sim.xs[i] - (sim.xs[i] - sim.pxs[i]) * 0.5;
      sim.pys[i] = sim.ys[i] - (sim.ys[i] - sim.pys[i]) * 0.5;
    }
  };
  sim.dragStart = function (x, y) { sim.ptrDown = true; sim.ptrX = x; sim.ptrY = y; sim.lastX = x; sim.lastY = y; };
  sim.dragMove = function (x, y) {
    sim.dragX += x - sim.lastX; sim.dragY += y - sim.lastY;
    sim.lastX = x; sim.lastY = y; sim.ptrX = x; sim.ptrY = y;
  };
  sim.dragEnd = function () { sim.ptrDown = false; };
  // Ограничения формы: пружины соседей + спицы + давление площади.
  sim.relax = function () {
    const L = 2 * sim.r * Math.sin(Math.PI / sim.n);
    const targetArea = Math.PI * sim.r * sim.r;
    for (let it = 0; it < 3; it++) {
      for (let i = 0; i < sim.n; i++) {
        const b = (i + 1) % sim.n;
        const ddx = sim.xs[b] - sim.xs[i]; const ddy = sim.ys[b] - sim.ys[i];
        const dd = Math.hypot(ddx, ddy) || 0.001;
        const diff = ((dd - L) / dd) * 0.5;
        sim.xs[i] += ddx * diff; sim.ys[i] += ddy * diff;
        sim.xs[b] -= ddx * diff; sim.ys[b] -= ddy * diff;
      }
      const cc = sim.center();
      for (let i = 0; i < sim.n; i++) {
        const sx = sim.xs[i] - cc.x; const sy = sim.ys[i] - cc.y;
        const sd = Math.hypot(sx, sy) || 0.001;
        const sk = ((sd - sim.r) / sd) * 0.06;
        sim.xs[i] -= sx * sk; sim.ys[i] -= sy * sk;
      }
      let area = 0;
      for (let i = 0; i < sim.n; i++) {
        const b = (i + 1) % sim.n;
        area += sim.xs[i] * sim.ys[b] - sim.xs[b] * sim.ys[i];
      }
      area = Math.abs(area) / 2;
      const scale = Math.sqrt(targetArea / Math.max(area, 1));
      const kk = 1 + (scale - 1) * 0.22;
      const c2 = sim.center();
      for (let i = 0; i < sim.n; i++) {
        sim.xs[i] = c2.x + (sim.xs[i] - c2.x) * kk;
        sim.ys[i] = c2.y + (sim.ys[i] - c2.y) * kk;
      }
      const pg0 = sim.pegPos(0); const pg1 = sim.pegPos(1);
      for (let i = 0; i < sim.n; i++) {
        sim.collidePeg(i, pg0.x, pg0.y);
        sim.collidePeg(i, pg1.x, pg1.y);
        if (sim.ys[i] < -sim.r * 6) sim.ys[i] = -sim.r * 6;
        if (sim.xs[i] < 10) { sim.xs[i] = 10; sim.pxs[i] = sim.xs[i]; }
        if (sim.xs[i] > sim.w - 10) { sim.xs[i] = sim.w - 10; sim.pxs[i] = sim.xs[i]; }
      }
    }
  };
  // Плавный возврат формы: каждая точка тянется к своему месту на круге,
  // поэтому даже после сильной тряски шарик возвращается в состояние шарика.
  sim.homeSpring = function () {
    const ch = sim.center();
    for (let i = 0; i < sim.n; i++) {
      const hx = ch.x + Math.cos(sim.homeA[i]) * sim.r;
      const hy = ch.y + Math.sin(sim.homeA[i]) * sim.r;
      sim.xs[i] += (hx - sim.xs[i]) * 0.02;
      sim.ys[i] += (hy - sim.ys[i]) * 0.02;
    }
  };
  sim.burst = function () {
    sim.phase = 'burst';
    sim.burstAt = Date.now();
    const c = sim.center();
    for (let i = 0; i < sim.n; i++) {
      sim.drops.push({
        x: sim.xs[i], y: sim.ys[i],
        vx: (sim.xs[i] - sim.pxs[i]) * 2.2 + (sim.xs[i] - c.x) * 0.16 + (Math.random() - 0.5) * 2.4,
        vy: (sim.ys[i] - sim.pys[i]) * 2.2 - Math.random() * 3.2,
        rr: 1.6 + Math.random() * 2.6,
        life: 1,
      });
    }
  };
  sim.step = function (dtMs, complete) {
    const k = dtMs / 16.7;
    if (sim.phase === 'burst') {
      const alive = [];
      for (const d of sim.drops) {
        d.vy += 0.34 * k; d.x += d.vx * k; d.y += d.vy * k; d.life -= 0.014 * k;
        if (d.life > 0) alive.push(d);
      }
      sim.drops = alive;
      if (Date.now() - sim.burstAt > 650) sim.phase = 'done';
      return;
    }
    if (sim.failed && (sim.phase === 'loading' || sim.phase === 'plop')) {
      sim.phase = 'error';
      sim.errorAt = Date.now();
      sim.errorMs = 0;
    }
    if (sim.phase === 'error') {
      // тремор: всё тело дрожит, но форма тянется обратно к шару
      for (let i = 0; i < sim.n; i++) {
        sim.xs[i] += (Math.random() - 0.5) * 2.6;
        sim.ys[i] += (Math.random() - 0.5) * 2.6;
      }
      sim.relax();
      sim.homeSpring();
      sim.errorMs += dtMs;
      return;
    }
    const c = sim.center();
    const startY = -sim.r * 2.5;
    const holdY = sim.pegY + sim.pegR + sim.r * 0.92;
    let pull = 0.045; let grav = 0.10; let targetY;
    if (sim.phase === 'plop') { targetY = sim.burstY - sim.r * 0.2; pull = 0.11; grav = 0.55; }
    else targetY = startY + (holdY - startY) * sim.ease(sim.progress);

    if (sim.phase === 'loading') {
      sim.planT += dtMs; sim.elapsed += dtMs;
      const st = sim.plan[sim.planIdx];
      if (st) {
        const kk = Math.min(1, sim.planT / st[0]);
        sim.progress = sim.fromP + (st[1] - sim.fromP) * kk;
        if (kk >= 1) { sim.fromP = st[1]; sim.planIdx++; sim.planT = 0; }
      } else if (complete && sim.elapsed >= MIN_MS) {
        // реальная работа уже завершена, но 5 секунд держим вид загрузки
        sim.progress = Math.min(0.96, sim.progress + 0.02 * k);
      }
      const p = Math.round(sim.progress * 100);
      if (p !== sim.lastPct) { sim.lastPct = p; sim.pct = p; }
      if (sim.progress >= 0.95) sim.phase = 'plop';
    }

    // точечки пружинят, когда шарик давит на них
    for (let i = 0; i < 2; i++) {
      const g = sim.pegs[i]; const pp = sim.pegPos(i);
      const d0 = Math.hypot(c.x - pp.x, c.y - pp.y);
      let tx = 0; let ty = 0;
      if (d0 < sim.r + sim.pegR && d0 > 0.001) {
        const f = Math.min(7, (sim.r + sim.pegR - d0) * 0.35);
        tx = ((c.x - pp.x) / d0) * f; ty = ((c.y - pp.y) / d0) * f;
      }
      g.vx += (tx - g.ox) * 0.3; g.vy += (ty - g.oy) * 0.3;
      g.vx *= 0.72; g.vy *= 0.72;
      g.ox += g.vx; g.oy += g.vy;
    }

    // палец лишь немного тянет шарик в сторону
    let pvx = 0; let pvy = 0;
    if (sim.ptrDown) { pvx = sim.dragX; pvy = sim.dragY; sim.dragX = 0; sim.dragY = 0; }

    for (let j = 0; j < sim.n; j++) {
      const ax = (sim.w / 2 - c.x) * 0.010;
      const ay = (targetY - c.y) * pull + grav;
      let vx = (sim.xs[j] - sim.pxs[j]) * 0.988 + ax;
      let vy = (sim.ys[j] - sim.pys[j]) * 0.988 + ay;
      if (sim.ptrDown) {
        const dx = sim.xs[j] - sim.ptrX; const dy = sim.ys[j] - sim.ptrY;
        const dd = Math.hypot(dx, dy);
        if (dd < 110) {
          const f = 1 - dd / 110; const inv = dd > 0.001 ? 1 / dd : 0;
          vx += pvx * 0.14 * f + dx * inv * 0.9 * f;
          vy += pvy * 0.14 * f + dy * inv * 0.9 * f;
        }
      }
      sim.pxs[j] = sim.xs[j]; sim.pys[j] = sim.ys[j];
      sim.xs[j] += vx; sim.ys[j] += vy;
    }

    sim.relax();
    sim.homeSpring();

    if (sim.phase === 'plop') {
      const cf = sim.center();
      if (cf.y >= sim.burstY - sim.r * 0.35) sim.burst();
    }

    sim.blink -= dtMs;
    if (sim.blink < -sim.blinkTimer) { sim.blink = 130; sim.blinkTimer = 2400 + Math.random() * 2600; }
  };
  sim.pathString = function () {
    const n = sim.n;
    let dstr = 'M ' + (sim.xs[n - 1] + sim.xs[0]) / 2 + ' ' + (sim.ys[n - 1] + sim.ys[0]) / 2;
    for (let i = 0; i < n; i++) {
      const b = (i + 1) % n; const nb = (b + 1) % n;
      dstr += ' Q ' + sim.xs[b] + ' ' + sim.ys[b] + ' ' + (sim.xs[b] + sim.xs[nb]) / 2 + ' ' + (sim.ys[b] + sim.ys[nb]) / 2;
    }
    return dstr + ' Z';
  };
  return sim;
}

export default function LoaderBall({ runId, complete, failed, onError, onProceed }) {
  const completeRef = useRef(complete);
  const failedRef = useRef(failed);
  const proceedRef = useRef(onProceed);
  const errorRef = useRef(onError);
  const simRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [pct, setPct] = useState(0);
  const [phase, setPhase] = useState('loading');
  const [replayKey, setReplayKey] = useState(0);
  const [, forceRender] = useState(0);

  useEffect(() => { completeRef.current = complete; }, [complete]);
  useEffect(() => { failedRef.current = failed; }, [failed]);
  useEffect(() => { proceedRef.current = onProceed; }, [onProceed]);
  useEffect(() => { errorRef.current = onError; }, [onError]);

  useEffect(() => {
    if (!size.w || !size.h) return undefined;
    const sim = createSim(size.w, size.h);
    simRef.current = sim;
    setPct(0); setPhase('loading');
    let raf = 0;
    let last = Date.now();
    let shownPhase = 'loading';
    let errorFired = false;
    const loop = () => {
      const now = Date.now();
      const dt = Math.min(34, now - last || 16.7);
      last = now;
      sim.failed = failedRef.current;
      sim.step(dt, completeRef.current);
      if (sim.pct !== sim.shownPct) { sim.shownPct = sim.pct; setPct(sim.pct); }
      if (sim.phase !== shownPhase) { shownPhase = sim.phase; setPhase(sim.phase); }
      if (sim.phase === 'error' && !errorFired && sim.errorMs >= 1000) {
        errorFired = true;
        if (errorRef.current) errorRef.current();
      }
      forceRender((v) => v + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [runId, replayKey, size.w, size.h]);

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => { if (simRef.current) simRef.current.dragStart(e.nativeEvent.locationX, e.nativeEvent.locationY); },
    onPanResponderMove: (e) => { if (simRef.current) simRef.current.dragMove(e.nativeEvent.locationX, e.nativeEvent.locationY); },
    onPanResponderRelease: () => { if (simRef.current) simRef.current.dragEnd(); },
    onPanResponderTerminate: () => { if (simRef.current) simRef.current.dragEnd(); },
  })).current;

  const sim = simRef.current;
  const d = sim && sim.phase !== 'burst' && sim.phase !== 'done' ? sim.pathString() : '';

  return (
    <View
      style={styles.wrap}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      <View style={StyleSheet.absoluteFill} {...pan.panHandlers}>
        {sim && (
          <Svg width={size.w} height={size.h}>
            <Defs>
              <RadialGradient id="ballGrad" cx="40%" cy="35%" rx="70%" ry="70%">
                <Stop offset="0" stopColor={phase === 'error' ? '#f6b0b0' : '#b9f0d8'} />
                <Stop offset="0.55" stopColor={phase === 'error' ? '#e26d6d' : '#6fd6ab'} />
                <Stop offset="1" stopColor={phase === 'error' ? '#b03a2e' : '#3cae87'} />
              </RadialGradient>
            </Defs>
            {sim.drops.map((dr, i) => (
              <Circle
                key={'d' + i}
                cx={dr.x}
                cy={dr.y}
                r={dr.rr * Math.max(0.2, dr.life)}
                fill={'rgba(78,190,146,' + (0.85 * dr.life).toFixed(3) + ')'}
              />
            ))}
            {d !== '' && (
              <Path
                d={d}
                fill="url(#ballGrad)"
                stroke={phase === 'error' ? 'rgba(140,32,32,.45)' : 'rgba(38,120,92,.35)'}
                strokeWidth={1.5}
              />
            )}
            {d !== '' && (() => {
              const c = sim.center();
              const eyeOpen = sim.blink > 0 ? 0.12 : 1;
              const pg = sim.pegPos(0);
              const dist = Math.hypot(c.x - pg.x, c.y - sim.pegY);
              const squeeze = dist < sim.r * 1.3 ? 0.55 : 1;
              return (
                <G>
                  <Ellipse cx={c.x - sim.r * 0.34} cy={c.y - sim.r * 0.42} rx={sim.r * 0.34} ry={sim.r * 0.2} fill="rgba(255,255,255,.55)" />
                  <Ellipse cx={c.x - sim.r * 0.34} cy={c.y - sim.r * 0.08} rx={3.4} ry={4.6 * eyeOpen * squeeze} fill="#1f2430" />
                  <Ellipse cx={c.x + sim.r * 0.34} cy={c.y - sim.r * 0.08} rx={3.4} ry={4.6 * eyeOpen * squeeze} fill="#1f2430" />
                  <Path
                    d={'M ' + (c.x - 4.5) + ' ' + (c.y + sim.r * 0.22) + ' A 4.5 4.5 0 0 0 ' + (c.x + 4.5) + ' ' + (c.y + sim.r * 0.22)}
                    stroke="#1f2430"
                    strokeWidth={1.6}
                    fill="none"
                    strokeLinecap="round"
                  />
                  {phase === 'error' && (
                    <G>
                      {/* злость: сердитые брови и недовольный рот */}
                      <Path
                        d={'M ' + (c.x - sim.r * 0.34 - 7) + ' ' + (c.y - sim.r * 0.08 - 10) +
                          ' L ' + (c.x - sim.r * 0.34 + 5) + ' ' + (c.y - sim.r * 0.08 - 3) +
                          ' M ' + (c.x + sim.r * 0.34 + 7) + ' ' + (c.y - sim.r * 0.08 - 10) +
                          ' L ' + (c.x + sim.r * 0.34 - 5) + ' ' + (c.y - sim.r * 0.08 - 3)}
                        stroke="#1f2430"
                        strokeWidth={2.4}
                        fill="none"
                        strokeLinecap="round"
                      />
                      <Path
                        d={'M ' + (c.x - 5.5) + ' ' + (c.y + sim.r * 0.42) + ' A 5.5 5.5 0 0 1 ' + (c.x + 5.5) + ' ' + (c.y + sim.r * 0.42)}
                        stroke="#1f2430"
                        strokeWidth={1.6}
                        fill="none"
                        strokeLinecap="round"
                      />
                    </G>
                  )}
                </G>
              );
            })()}
            {[0, 1].map((i) => {
              const pp = sim.pegPos(i);
              return (
                <G key={'p' + i}>
                  <Circle cx={pp.x} cy={pp.y} r={sim.pegR} fill="#2f3542" />
                  <Circle cx={pp.x - sim.pegR * 0.3} cy={pp.y - sim.pegR * 0.3} r={sim.pegR * 0.28} fill="rgba(255,255,255,.35)" />
                </G>
              );
            })}
          </Svg>
        )}
      </View>
      {phase === 'loading' && (
        <Text style={styles.status}>Подключение… {pct}%</Text>
      )}
      {phase === 'error' && (
        <Text style={[styles.status, { color: '#b03a2e', fontWeight: '700' }]}>Ошибка</Text>
      )}
      {(phase === 'plop' || phase === 'burst' || phase === 'done') && (
        <View style={styles.doneWrap} pointerEvents={phase === 'done' ? 'auto' : 'none'}>
          <View style={styles.doneRow}>
            <Text style={styles.doneText}>Загрузка завершена ✓</Text>
            {phase === 'done' && (
              <TouchableOpacity
                style={styles.replay}
                onPress={() => { setPct(0); setPhase('loading'); setReplayKey((k) => k + 1); }}
              >
                <Text style={{ fontSize: 18 }}>🔃</Text>
              </TouchableOpacity>
            )}
          </View>
          {phase === 'done' && (
            <TouchableOpacity style={styles.next} onPress={() => proceedRef.current && proceedRef.current()}>
              <Text style={styles.nextText}>Перейти дальше</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#f6f7fb',
  },
  status: {
    position: 'absolute',
    top: 18,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: '#6b7280',
    fontSize: 15,
  },
  doneWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 48,
    alignItems: 'center',
  },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  doneText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#16213a',
  },
  replay: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d7dbe4',
  },
  next: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 10,
    backgroundColor: '#3b82f6',
  },
  nextText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

