import SwiftUI

// Физичный шарик-загрузчик (референс: cgw334.mount.jp): желейный шарик
// (verlet, 60 точек) минимум 5 секунд протискивается между двумя
// точечками; если реальная работа завершилась раньше, делаем вид, что
// грузим дальше. На 95% шарик плюхается вниз и разбивается об надпись
// «Загрузка завершена»; кнопка 🔃 проигрывает анимацию заново.

private let loaderMinMs: Double = 5000

final class BallSim {
    let n = 60
    var w: CGFloat = 0, h: CGFloat = 0
    var r: CGFloat = 44, pegR: CGFloat = 22, pegY: CGFloat = 0, pegGap: CGFloat = 0, burstY: CGFloat = 0
    var phase = "loading"
    var pct = 0
    var xs: [CGFloat], ys: [CGFloat], pxs: [CGFloat], pys: [CGFloat]
    var pegs: [[CGFloat]] = [[0, 0, 0, 0], [0, 0, 0, 0]] // ox, oy, vx, vy
    var dropX: [CGFloat] = [], dropY: [CGFloat] = []
    var dropVX: [CGFloat] = [], dropVY: [CGFloat] = []
    var dropR: [CGFloat] = [], dropLife: [CGFloat] = []
    private var progress: CGFloat = 0
    private var planIdx = 0
    private var fromP: CGFloat = 0
    private var planT: Double = 0
    private var elapsed: Double = 0
    private var lastPct = -1
    private var inited = false
    private var lastNow: Double = 0
    private var burstAt: Double = 0
    private var blink: Double = 0
    private var blinkTimer: Double = 2400
    private var ptrDown = false
    private var ptrX: CGFloat = 0, ptrY: CGFloat = 0
    private var dragX: CGFloat = 0, dragY: CGFloat = 0
    private var lastX: CGFloat = 0, lastY: CGFloat = 0
    private let plan: [(Double, CGFloat)] = [(900, 0.18), (500, 0.22), (1400, 0.47), (700, 0.52), (1600, 0.78), (900, 0.86), (600, 0.90)]

    init() {
        xs = [CGFloat](repeating: 0, count: n)
        ys = [CGFloat](repeating: 0, count: n)
        pxs = [CGFloat](repeating: 0, count: n)
        pys = [CGFloat](repeating: 0, count: n)
    }

    func reset() {
        inited = false
        phase = "loading"
        pct = 0
        progress = 0
        planIdx = 0
        fromP = 0
        planT = 0
        elapsed = 0
        lastPct = -1
        dropX.removeAll(); dropY.removeAll(); dropVX.removeAll(); dropVY.removeAll(); dropR.removeAll(); dropLife.removeAll()
        blink = 0
        blinkTimer = 2400
        ptrDown = false
    }

    func dragMove(x: CGFloat, y: CGFloat) {
        if !ptrDown {
            ptrDown = true
            lastX = x; lastY = y
        }
        dragX += x - lastX
        dragY += y - lastY
        lastX = x; lastY = y
        ptrX = x; ptrY = y
    }

    func dragEnd() {
        ptrDown = false
    }

    func resize(w nw: CGFloat, h nh: CGFloat) {
        guard nw > 0, nh > 0 else { return }
        w = nw
        h = nh
        r = min(52, max(32, nw * 0.085))
        pegR = r * 0.5
        pegY = h * 0.38
        pegGap = 2 * (r * 0.55 + pegR)
        burstY = h - 150
        if !inited {
            inited = true
            initBall()
        }
    }

    private func initBall() {
        for i in 0..<n {
            let a = CGFloat(i) / CGFloat(n) * 2 * CGFloat.pi
            xs[i] = w / 2 + cos(a) * r
            ys[i] = -r * 2.5 + sin(a) * r
            pxs[i] = xs[i]
            pys[i] = ys[i]
        }
    }

    func center() -> (CGFloat, CGFloat) {
        var cx: CGFloat = 0, cy: CGFloat = 0
        for i in 0..<n { cx += xs[i]; cy += ys[i] }
        return (cx / CGFloat(n), cy / CGFloat(n))
    }

    func pegPos(_ i: Int) -> (CGFloat, CGFloat) {
        let s: CGFloat = i == 0 ? -1 : 1
        return (w / 2 + s * pegGap / 2 + pegs[i][0], pegY + pegs[i][1])
    }

    private func ease(_ t: CGFloat) -> CGFloat {
        return t < 0.5 ? 2 * t * t : 1 - pow(-2 * t + 2, 2) / 2
    }

    func step(now: Double, complete: Bool) {
        var dt = lastNow == 0 ? 16.7 : (now - lastNow) * 1000
        lastNow = now
        dt = min(34, max(1, dt))
        let k = CGFloat(dt / 16.7)

        if phase == "burst" {
            stepDrops(k)
            if now - burstAt > 0.65 { phase = "done" }
            return
        }
        let c = center()
        let startY = -r * 2.5
        let holdY = pegY + pegR + r * 0.92
        var pull: CGFloat = 0.045
        var grav: CGFloat = 0.10
        var targetY: CGFloat
        if phase == "plop" {
            targetY = burstY - r * 0.2
            pull = 0.11
            grav = 0.55
        } else {
            targetY = startY + (holdY - startY) * ease(progress)
        }

        if phase == "loading" {
            planT += dt
            elapsed += dt
            if planIdx < plan.count {
                let st = plan[planIdx]
                let kk = min(1.0, planT / st.0)
                progress = fromP + (st.1 - fromP) * CGFloat(kk)
                if kk >= 1 {
                    fromP = st.1
                    planIdx += 1
                    planT = 0
                }
            } else if complete && elapsed >= loaderMinMs {
                // реальная работа уже завершена, но 5 секунд держим вид загрузки
                progress = min(0.96, progress + 0.02 * k)
            }
            let p = Int((progress * 100).rounded())
            if p != lastPct { lastPct = p; pct = p }
            if progress >= 0.95 { phase = "plop" }
        }

        // точечки пружинят, когда шарик давит на них
        for i in 0..<2 {
            let pp = pegPos(i)
            let d = hypot(c.0 - pp.0, c.1 - pp.1)
            var tx: CGFloat = 0, ty: CGFloat = 0
            if d < r + pegR && d > 0.001 {
                let f = min(7, (r + pegR - d) * 0.35)
                tx = (c.0 - pp.0) / d * f
                ty = (c.1 - pp.1) / d * f
            }
            pegs[i][2] += (tx - pegs[i][0]) * 0.3
            pegs[i][3] += (ty - pegs[i][1]) * 0.3
            pegs[i][2] *= 0.72
            pegs[i][3] *= 0.72
            pegs[i][0] += pegs[i][2]
            pegs[i][1] += pegs[i][3]
        }

        // палец лишь немного тянет шарик в сторону
        var pvx: CGFloat = 0, pvy: CGFloat = 0
        if ptrDown {
            pvx = dragX
            pvy = dragY
            dragX = 0
            dragY = 0
        }

        for j in 0..<n {
            let ax = (w / 2 - c.0) * 0.010
            let ay = (targetY - c.1) * pull + grav
            var vx = (xs[j] - pxs[j]) * 0.988 + ax
            var vy = (ys[j] - pys[j]) * 0.988 + ay
            if ptrDown {
                let dx = xs[j] - ptrX, dy = ys[j] - ptrY
                let dd = hypot(dx, dy)
                if dd < 110 {
                    let f = 1 - dd / 110
                    let inv = dd > 0.001 ? 1 / dd : 0
                    vx += pvx * 0.14 * f + dx * inv * 0.9 * f
                    vy += pvy * 0.14 * f + dy * inv * 0.9 * f
                }
            }
            pxs[j] = xs[j]
            pys[j] = ys[j]
            xs[j] += vx
            ys[j] += vy
        }

        let restL = 2 * r * sin(CGFloat.pi / CGFloat(n))
        let targetArea = CGFloat.pi * r * r
        for _ in 0..<3 {
            for i in 0..<n {
                let b = (i + 1) % n
                let ddx = xs[b] - xs[i], ddy = ys[b] - ys[i]
                let dd = max(hypot(ddx, ddy), 0.001)
                let diff = (dd - restL) / dd * 0.5
                xs[i] += ddx * diff; ys[i] += ddy * diff
                xs[b] -= ddx * diff; ys[b] -= ddy * diff
            }
            let cc = center()
            for i in 0..<n {
                let sx = xs[i] - cc.0, sy = ys[i] - cc.1
                let sd = max(hypot(sx, sy), 0.001)
                let sk = (sd - r) / sd * 0.06
                xs[i] -= sx * sk
                ys[i] -= sy * sk
            }
            var area: CGFloat = 0
            for i in 0..<n {
                let b = (i + 1) % n
                area += xs[i] * ys[b] - xs[b] * ys[i]
            }
            area = abs(area) / 2
            let scale = sqrt(targetArea / max(area, 1))
            let kk = 1 + (scale - 1) * 0.22
            let c2 = center()
            for i in 0..<n {
                xs[i] = c2.0 + (xs[i] - c2.0) * kk
                ys[i] = c2.1 + (ys[i] - c2.1) * kk
            }
            let pg0 = pegPos(0), pg1 = pegPos(1)
            for i in 0..<n {
                collidePeg(i, pg0.0, pg0.1)
                collidePeg(i, pg1.0, pg1.1)
                if ys[i] < -r * 6 { ys[i] = -r * 6 }
                if xs[i] < 10 { xs[i] = 10; pxs[i] = xs[i] }
                if xs[i] > w - 10 { xs[i] = w - 10; pxs[i] = xs[i] }
            }
        }

        if phase == "plop" {
            let cf = center()
            if cf.1 >= burstY - r * 0.35 { burst() }
        }

        blink -= dt
        if blink < -blinkTimer {
            blink = 130
            blinkTimer = 2400 + Double.random(in: 0...2600)
        }
    }

    private func collidePeg(_ i: Int, _ cx: CGFloat, _ cy: CGFloat) {
        let dx = xs[i] - cx, dy = ys[i] - cy
        let d = hypot(dx, dy)
        if d < pegR {
            let inv = d > 0.001 ? 1 / d : 0
            xs[i] = cx + dx * inv * pegR
            ys[i] = cy + dy * inv * pegR
            pxs[i] = xs[i] - (xs[i] - pxs[i]) * 0.5
            pys[i] = ys[i] - (ys[i] - pys[i]) * 0.5
        }
    }

    private func burst() {
        phase = "burst"
        burstAt = Date().timeIntervalSinceReferenceDate
        let c = center()
        for i in 0..<n {
            dropX.append(xs[i])
            dropY.append(ys[i])
            dropVX.append((xs[i] - pxs[i]) * 2.2 + (xs[i] - c.0) * 0.16 + CGFloat.random(in: -1.2...1.2))
            dropVY.append((ys[i] - pys[i]) * 2.2 - CGFloat.random(in: 0...3.2))
            dropR.append(1.6 + CGFloat.random(in: 0...2.6))
            dropLife.append(1)
        }
    }

    private func stepDrops(_ k: CGFloat) {
        var alive: [Int] = []
        for i in 0..<dropX.count {
            dropVY[i] += 0.34 * k
            dropX[i] += dropVX[i] * k
            dropY[i] += dropVY[i] * k
            dropLife[i] -= 0.014 * k
            if dropLife[i] > 0 { alive.append(i) }
        }
        guard alive.count != dropX.count else { return }
        dropX = alive.map { dropX[$0] }
        dropY = alive.map { dropY[$0] }
        dropVX = alive.map { dropVX[$0] }
        dropVY = alive.map { dropVY[$0] }
        dropR = alive.map { dropR[$0] }
        dropLife = alive.map { dropLife[$0] }
    }

    // Отрисовка (вызывается из Canvas каждый кадр TimelineView).
    func draw(ctx: inout GraphicsContext) {
        for i in 0..<2 {
            let pp = pegPos(i)
            ctx.fill(Path(ellipseIn: CGRect(x: pp.0 - pegR, y: pp.1 - pegR, width: pegR * 2, height: pegR * 2)), with: .color(Color(red: 0.184, green: 0.208, blue: 0.259)))
            ctx.fill(Path(ellipseIn: CGRect(x: pp.0 - pegR * 0.58, y: pp.1 - pegR * 0.58, width: pegR * 0.56, height: pegR * 0.56)), with: .color(.white.opacity(0.35)))
        }
        for i in 0..<dropX.count {
            let life = max(0.05, dropLife[i])
            ctx.fill(Path(ellipseIn: CGRect(x: dropX[i] - dropR[i] * life, y: dropY[i] - dropR[i] * life, width: dropR[i] * 2 * life, height: dropR[i] * 2 * life)), with: .color(Color(red: 0.306, green: 0.745, blue: 0.573).opacity(0.85 * dropLife[i])))
        }
        if phase == "burst" || phase == "done" { return }
        let c = center()
        var path = Path()
        path.move(to: CGPoint(x: (xs[n - 1] + xs[0]) / 2, y: (ys[n - 1] + ys[0]) / 2))
        for i in 0..<n {
            let b = (i + 1) % n
            let nb = (b + 1) % n
            path.addQuadCurve(to: CGPoint(x: (xs[b] + xs[nb]) / 2, y: (ys[b] + ys[nb]) / 2), control: CGPoint(x: xs[b], y: ys[b]))
        }
        path.closeSubpath()
        let grad = Gradient(colors: [
            Color(red: 0.725, green: 0.941, blue: 0.847),
            Color(red: 0.435, green: 0.839, blue: 0.671),
            Color(red: 0.235, green: 0.682, blue: 0.529),
        ])
        ctx.fill(path, with: .radialGradient(grad, center: CGPoint(x: c.0 - r * 0.35, y: c.1 - r * 0.45), startRadius: r * 0.2, endRadius: r * 1.4))
        ctx.stroke(path, with: .color(Color(red: 0.149, green: 0.471, blue: 0.361).opacity(0.35)), lineWidth: 1.5)
        // блик
        ctx.fill(Path(ellipseIn: CGRect(x: c.0 - r * 0.66, y: c.1 - r * 0.62, width: r * 0.62, height: r * 0.34)), with: .color(.white.opacity(0.5)))
        // глазки жмурятся у точечек и моргают
        let ex = r * 0.34
        let ey = c.1 - r * 0.08
        let pg = pegPos(0)
        let d0 = hypot(c.0 - pg.0, c.1 - pegY)
        let squeeze: CGFloat = d0 < r * 1.3 ? 0.55 : 1
        let open: CGFloat = blink > 0 ? 0.12 : 1
        let eyeColor = Color(red: 0.122, green: 0.141, blue: 0.188)
        for s in [-1.0, 1.0] {
            let ew: CGFloat = 6.8
            let eh: CGFloat = 9.2 * open * squeeze
            ctx.fill(Path(ellipseIn: CGRect(x: c.0 + CGFloat(s) * ex - ew / 2, y: ey - eh / 2, width: ew, height: eh)), with: .color(eyeColor))
        }
        var mouth = Path()
        mouth.addArc(center: CGPoint(x: c.0, y: c.1 + r * 0.22), radius: 4.5, startAngle: .degrees(27), endAngle: .degrees(153), clockwise: false)
        ctx.stroke(mouth, with: .color(eyeColor), style: StrokeStyle(lineWidth: 1.6, lineCap: .round))
    }
}

struct LoaderBallView: View {
    var runId: Int
    var complete: Bool
    var onProceed: () -> Void

    @State private var sim = BallSim()

    var body: some View {
        ZStack {
            Color(red: 0.965, green: 0.969, blue: 0.984).ignoresSafeArea()
            TimelineView(.animation) { timeline in
                ZStack {
                    Canvas { ctx, size in
                        sim.resize(w: size.width, h: size.height)
                        sim.step(now: timeline.date.timeIntervalSinceReferenceDate, complete: complete)
                        sim.draw(ctx: &ctx)
                    }
                    .gesture(DragGesture(minimumDistance: 0)
                        .onChanged { g in sim.dragMove(x: g.location.x, y: g.location.y) }
                        .onEnded { _ in sim.dragEnd() })
                    // Оверлей читает sim напрямую: TimelineView перестраивает
                    // эту ветку каждый кадр, поэтому текст живой без @State.
                    VStack(spacing: 12) {
                        if sim.phase == "loading" {
                            Text("Подключение… \(sim.pct)%")
                                .font(.system(size: 15))
                                .foregroundColor(Color(red: 0.42, green: 0.45, blue: 0.5))
                        }
                        Spacer()
                        if sim.phase == "plop" || sim.phase == "burst" || sim.phase == "done" {
                            HStack(spacing: 10) {
                                Text("Загрузка завершена ✓")
                                    .font(.system(size: 24, weight: .bold))
                                    .foregroundColor(Color(red: 0.086, green: 0.129, blue: 0.227))
                                if sim.phase == "done" {
                                    Button(action: { sim.reset() }) {
                                        Text("🔃").font(.system(size: 18))
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            if sim.phase == "done" {
                                Button(action: onProceed) {
                                    Text("Перейти дальше")
                                        .font(.system(size: 16, weight: .semibold))
                                        .padding(.horizontal, 40)
                                        .padding(.vertical, 12)
                                        .background(Color(red: 0.231, green: 0.510, blue: 0.965))
                                        .foregroundColor(.white)
                                        .cornerRadius(10)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    .padding(.top, 18)
                    .padding(.bottom, 56)
                }
            }
        }
        .onChange(of: runId) { _ in sim.reset() }
    }
}
