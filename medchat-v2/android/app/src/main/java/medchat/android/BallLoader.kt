package medchat.android

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.random.Random
import kotlinx.coroutines.withFrameNanos

// Физичный шарик-загрузчик (референс: cgw334.mount.jp): желейный шарик
// (verlet, 60 точек) минимум 5 секунд протискивается между двумя
// точечками; если реальная работа (подключение/вход) завершилась раньше,
// делаем вид, что грузим дальше. На 95% шарик плюхается вниз и
// разбивается об надпись «Загрузка завершена»; кнопка 🔃 проигрывает
// анимацию заново, «Перейти дальше» продолжает сценарий. Палец лишь
// немного тянет шарик в сторону.
private const val LOADER_MIN_MS = 5000.0

@Composable
fun BallLoaderOverlay(runId: Int, complete: Boolean, onProceed: () -> Unit) {
    val completeState = rememberUpdatedState(complete)
    var replayKey by remember { mutableStateOf(0) }
    var done by remember { mutableStateOf(false) }
    var pct by remember { mutableStateOf(0) }
    var phase by remember { mutableStateOf("loading") }
    val sim = remember(runId * 1000 + replayKey) { BallSim() }
    var frameTick by remember { mutableStateOf(0) }

    LaunchedEffect(runId, replayKey) {
        done = false
        pct = 0
        phase = "loading"
        while (true) {
            withFrameNanos { now ->
                sim.step(now, completeState.value)
            }
            if (sim.pct != pct) pct = sim.pct
            if (sim.phase != phase) phase = sim.phase
            if (sim.phase == "done" && !done) done = true
            frameTick++
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF6F7FB))) {
        Canvas(
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(runId, replayKey) {
                    detectDragGestures(
                        onDragStart = { offset -> sim.dragStart(offset.x, offset.y) },
                        onDrag = { change, _ ->
                            change.consume()
                            sim.dragMove(change.position.x, change.position.y)
                        },
                        onDragEnd = { sim.dragEnd() },
                        onDragCancel = { sim.dragEnd() })
                }) {
            sim.resize(size.width, size.height)
            frameTick // чтение состояния: перерисовка каждый кадр
            sim.draw(this)
        }
        if (phase == "loading") {
            Text(
                "Подключение… " + pct + "%",
                fontSize = 15.sp,
                color = Color(0xFF6B7280),
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = 20.dp))
        }
        if (phase == "plop" || phase == "burst" || phase == "done") {
            Column(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 48.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "Загрузка завершена ✓",
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF16213A))
                    if (phase == "done") {
                        TextButton(onClick = { replayKey++ }) { Text("🔃") }
                    }
                }
                if (phase == "done") {
                    Button(onClick = onProceed) { Text("Перейти дальше") }
                }
            }
        }
    }
}

// Мягкое тело: 60 точек verlet + пружины соседей + спицы + давление
// площади (контур изгибается вокруг точечек, не глотая их).
class BallSim {
    val n = 60
    var w = 0f
    var h = 0f
    var r = 44f
    var pegR = 22f
    var pegY = 0f
    var pegGap = 0f
    var burstY = 0f
    var phase = "loading"
        private set
    var pct = 0
        private set
    private var progress = 0f
    private var planIdx = 0
    private var fromP = 0f
    private var planT = 0.0
    private var elapsed = 0.0
    private var lastPct = -1
    private var inited = false
    private var lastNs = 0L
    private var burstNs = 0L
    private var blink = 0f
    private var blinkTimer = 2400f
    private var ptrDown = false
    private var ptrX = 0f
    private var ptrY = 0f
    private var lastX = 0f
    private var lastY = 0f
    private var dragX = 0f
    private var dragY = 0f
    private val xs = FloatArray(n)
    private val ys = FloatArray(n)
    private val pxs = FloatArray(n)
    private val pys = FloatArray(n)
    private val pegs = arrayOf(floatArrayOf(0f, 0f, 0f, 0f), floatArrayOf(0f, 0f, 0f, 0f))
    private val dropX = ArrayList<Float>()
    private val dropY = ArrayList<Float>()
    private val dropVX = ArrayList<Float>()
    private val dropVY = ArrayList<Float>()
    private val dropR = ArrayList<Float>()
    private val dropLife = ArrayList<Float>()
    private val plan = listOf(
        900.0 to 0.18f, 500.0 to 0.22f, 1400.0 to 0.47f, 700.0 to 0.52f,
        1600.0 to 0.78f, 900.0 to 0.86f, 600.0 to 0.90f)

    fun reset() {
        inited = false
        phase = "loading"
        pct = 0
        progress = 0f
        planIdx = 0
        fromP = 0f
        planT = 0.0
        elapsed = 0.0
        lastPct = -1
        lastNs = 0L
        dropX.clear(); dropY.clear(); dropVX.clear(); dropVY.clear(); dropR.clear(); dropLife.clear()
        blink = 0f
        blinkTimer = 2400f
        ptrDown = false
    }

    fun dragStart(x: Float, y: Float) {
        ptrDown = true
        ptrX = x; ptrY = y; lastX = x; lastY = y
    }

    fun dragMove(x: Float, y: Float) {
        dragX += x - lastX
        dragY += y - lastY
        lastX = x; lastY = y
        ptrX = x; ptrY = y
    }

    fun dragEnd() {
        ptrDown = false
    }

    fun resize(width: Float, height: Float) {
        if (width <= 0f || height <= 0f) return
        w = width
        h = height
        r = (w * 0.085f).coerceIn(32f, 52f)
        pegR = r * 0.5f
        pegY = h * 0.38f
        pegGap = 2f * (r * 0.55f + pegR)
        burstY = h - 150f
        if (!inited) {
            inited = true
            initBall()
        }
    }

    private fun initBall() {
        for (i in 0 until n) {
            val a = i.toFloat() / n * 2.0 * PI
            xs[i] = w / 2f + cos(a).toFloat() * r
            ys[i] = -r * 2.5f + sin(a).toFloat() * r
            pxs[i] = xs[i]
            pys[i] = ys[i]
        }
    }

    fun center(): Pair<Float, Float> {
        var cx = 0f
        var cy = 0f
        for (i in 0 until n) {
            cx += xs[i]
            cy += ys[i]
        }
        return Pair(cx / n, cy / n)
    }

    fun pegPos(i: Int): Pair<Float, Float> {
        val s = if (i == 0) -1f else 1f
        return Pair(w / 2f + s * pegGap / 2f + pegs[i][0], pegY + pegs[i][1])
    }

    private fun ease(t: Float): Float =
        if (t < 0.5f) 2f * t * t else 1f - (-2f * t + 2f) * (-2f * t + 2f) / 2f

    fun step(nowNs: Long, complete: Boolean) {
        val dtMs = if (lastNs == 0L) 16.7 else (nowNs - lastNs) / 1e6
        lastNs = nowNs
        val k = (dtMs / 16.7).toFloat()

        if (phase == "burst") {
            stepDrops(k)
            if ((nowNs - burstNs) / 1e6 > 650.0) phase = "done"
            return
        }
        val c = center()
        val startY = -r * 2.5f
        val holdY = pegY + pegR + r * 0.92f
        var pull = 0.045f
        var grav = 0.10f
        val targetY: Float
        if (phase == "plop") {
            targetY = burstY - r * 0.2f
            pull = 0.11f
            grav = 0.55f
        } else {
            targetY = startY + (holdY - startY) * ease(progress)
        }

        if (phase == "loading") {
            planT += dtMs
            elapsed += dtMs
            if (planIdx < plan.size) {
                val st = plan[planIdx]
                val kk = min(1.0, planT / st.first)
                progress = fromP + (st.second - fromP) * kk.toFloat()
                if (kk >= 1.0) {
                    fromP = st.second
                    planIdx++
                    planT = 0.0
                }
            } else if (complete && elapsed >= LOADER_MIN_MS) {
                // реальная работа уже завершена, но 5 секунд держим вид загрузки
                progress = min(0.96f, progress + 0.02f * k)
            }
            val p = (progress * 100f).toInt()
            if (p != lastPct) {
                lastPct = p
                pct = p
            }
            if (progress >= 0.95f) phase = "plop"
        }

        // точечки пружинят, когда шарик давит на них
        for (i in 0 until 2) {
            val pp = pegPos(i)
            val d = hypot(c.first - pp.first, c.second - pp.second)
            var tx = 0f
            var ty = 0f
            if (d < r + pegR && d > 0.001f) {
                val f = min(7f, (r + pegR - d) * 0.35f)
                tx = (c.first - pp.first) / d * f
                ty = (c.second - pp.second) / d * f
            }
            pegs[i][2] += (tx - pegs[i][0]) * 0.3f
            pegs[i][3] += (ty - pegs[i][1]) * 0.3f
            pegs[i][2] *= 0.72f
            pegs[i][3] *= 0.72f
            pegs[i][0] += pegs[i][2]
            pegs[i][1] += pegs[i][3]
        }

        // палец лишь немного тянет шарик в сторону
        var pvx = 0f
        var pvy = 0f
        if (ptrDown) {
            pvx = dragX
            pvy = dragY
            dragX = 0f
            dragY = 0f
        }

        for (j in 0 until n) {
            val ax = (w / 2f - c.first) * 0.010f
            val ay = (targetY - c.second) * pull + grav
            var vx = (xs[j] - pxs[j]) * 0.988f + ax
            var vy = (ys[j] - pys[j]) * 0.988f + ay
            if (ptrDown) {
                val dx = xs[j] - ptrX
                val dy = ys[j] - ptrY
                val dd = hypot(dx, dy)
                if (dd < 110f) {
                    val f = 1f - dd / 110f
                    val inv = if (dd > 0.001f) 1f / dd else 0f
                    vx += pvx * 0.14f * f + dx * inv * 0.9f * f
                    vy += pvy * 0.14f * f + dy * inv * 0.9f * f
                }
            }
            pxs[j] = xs[j]
            pys[j] = ys[j]
            xs[j] += vx
            ys[j] += vy
        }

        val restL = 2f * r * sin(PI.toFloat() / n)
        val targetArea = PI.toFloat() * r * r
        for (it in 0 until 3) {
            for (i in 0 until n) {
                val b = (i + 1) % n
                val ddx = xs[b] - xs[i]
                val ddy = ys[b] - ys[i]
                val dd = max(hypot(ddx, ddy), 0.001f)
                val diff = (dd - restL) / dd * 0.5f
                xs[i] += ddx * diff; ys[i] += ddy * diff
                xs[b] -= ddx * diff; ys[b] -= ddy * diff
            }
            val cc = center()
            for (i in 0 until n) {
                val sx = xs[i] - cc.first
                val sy = ys[i] - cc.second
                val sd = max(hypot(sx, sy), 0.001f)
                val sk = (sd - r) / sd * 0.06f
                xs[i] -= sx * sk
                ys[i] -= sy * sk
            }
            var area = 0f
            for (i in 0 until n) {
                val b = (i + 1) % n
                area += xs[i] * ys[b] - xs[b] * ys[i]
            }
            area = abs(area) / 2f
            val scale = sqrt(targetArea / max(area, 1f))
            val kk = 1f + (scale - 1f) * 0.22f
            val c2 = center()
            for (i in 0 until n) {
                xs[i] = c2.first + (xs[i] - c2.first) * kk
                ys[i] = c2.second + (ys[i] - c2.second) * kk
            }
            val pg0 = pegPos(0)
            val pg1 = pegPos(1)
            for (i in 0 until n) {
                collidePeg(i, pg0.first, pg0.second)
                collidePeg(i, pg1.first, pg1.second)
                if (ys[i] < -r * 6f) ys[i] = -r * 6f
                if (xs[i] < 10f) { xs[i] = 10f; pxs[i] = xs[i] }
                if (xs[i] > w - 10f) { xs[i] = w - 10f; pxs[i] = xs[i] }
            }
        }

        if (phase == "plop") {
            val cf = center()
            if (cf.second >= burstY - r * 0.35f) burst()
        }

        blink -= dtMs.toFloat()
        if (blink < -blinkTimer) {
            blink = 130f
            blinkTimer = 2400f + Random.nextFloat() * 2600f
        }
    }

    private fun abs(v: Float): Float = if (v < 0f) -v else v

    private fun collidePeg(i: Int, cx: Float, cy: Float) {
        val dx = xs[i] - cx
        val dy = ys[i] - cy
        val d = hypot(dx, dy)
        if (d < pegR) {
            val inv = if (d > 0.001f) 1f / d else 0f
            xs[i] = cx + dx * inv * pegR
            ys[i] = cy + dy * inv * pegR
            pxs[i] = xs[i] - (xs[i] - pxs[i]) * 0.5f
            pys[i] = ys[i] - (ys[i] - pys[i]) * 0.5f
        }
    }

    private fun burst() {
        phase = "burst"
        burstNs = lastNs
        val c = center()
        for (i in 0 until n) {
            dropX.add(xs[i])
            dropY.add(ys[i])
            dropVX.add((xs[i] - pxs[i]) * 2.2f + (xs[i] - c.first) * 0.16f + (Random.nextFloat() - 0.5f) * 2.4f)
            dropVY.add((ys[i] - pys[i]) * 2.2f - Random.nextFloat() * 3.2f)
            dropR.add(1.6f + Random.nextFloat() * 2.6f)
            dropLife.add(1f)
        }
    }

    private fun stepDrops(k: Float) {
        val alive = ArrayList<Int>()
        for (i in dropX.indices) {
            dropVY[i] += 0.34f * k
            dropX[i] += dropVX[i] * k
            dropY[i] += dropVY[i] * k
            dropLife[i] -= 0.014f * k
            if (dropLife[i] > 0f) alive.add(i)
        }
        if (alive.size == dropX.size) return
        val nx = ArrayList<Float>(); val ny = ArrayList<Float>()
        val nvx = ArrayList<Float>(); val nvy = ArrayList<Float>()
        val nr = ArrayList<Float>(); val nl = ArrayList<Float>()
        for (i in alive) {
            nx.add(dropX[i]); ny.add(dropY[i])
            nvx.add(dropVX[i]); nvy.add(dropVY[i])
            nr.add(dropR[i]); nl.add(dropLife[i])
        }
        dropX.clear(); dropY.clear(); dropVX.clear(); dropVY.clear(); dropR.clear(); dropLife.clear()
        dropX.addAll(nx); dropY.addAll(ny)
        dropVX.addAll(nvx); dropVY.addAll(nvy)
        dropR.addAll(nr); dropLife.addAll(nl)
    }

    fun draw(s: DrawScope) {
        for (i in 0 until 2) {
            val pp = pegPos(i)
            s.drawCircle(Color(0xFF2F3542), pegR, Offset(pp.first, pp.second))
            s.drawCircle(
                Color(0x59FFFFFF),
                pegR * 0.28f,
                Offset(pp.first - pegR * 0.3f, pp.second - pegR * 0.3f))
        }
        for (i in dropX.indices) {
            val life = max(0.05f, dropLife[i])
            s.drawCircle(
                Color(0xFF4EBE92).copy(alpha = 0.85f * dropLife[i]),
                dropR[i] * life,
                Offset(dropX[i], dropY[i]))
        }
        if (phase == "burst" || phase == "done") return
        val c = center()
        val path = Path()
        path.moveTo((xs[n - 1] + xs[0]) / 2f, (ys[n - 1] + ys[0]) / 2f)
        for (i in 0 until n) {
            val b = (i + 1) % n
            val nb = (b + 1) % n
            path.quadraticBezierTo(xs[b], ys[b], (xs[b] + xs[nb]) / 2f, (ys[b] + ys[nb]) / 2f)
        }
        path.close()
        val brush = Brush.radialGradient(
            colors = listOf(Color(0xFFB9F0D8), Color(0xFF6FD6AB), Color(0xFF3CAE87)),
            center = Offset(c.first - r * 0.35f, c.second - r * 0.45f),
            radius = r * 1.4f)
        s.drawPath(path, brush)
        s.drawPath(path, Color(0x5926785C), style = Stroke(width = 1.5f))
        s.drawOval(
            Color(0x8CFFFFFF),
            topLeft = Offset(c.first - r * 0.66f, c.second - r * 0.62f),
            size = Size(r * 0.62f, r * 0.34f))
        // глазки жмурятся у точечек и моргают
        val ex = r * 0.34f
        val ey = c.second - r * 0.08f
        val pg = pegPos(0)
        val d0 = hypot(c.first - pg.first, c.second - pegY)
        val squeeze = if (d0 < r * 1.3f) 0.55f else 1f
        val open = if (blink > 0f) 0.12f else 1f
        val eyeColor = Color(0xFF1F2430)
        for (s2 in intArrayOf(-1, 1)) {
            val ew = 6.8f
            val eh = 9.2f * open * squeeze
            s.drawOval(
                eyeColor,
                topLeft = Offset(c.first + s2 * ex - ew / 2f, ey - eh / 2f),
                size = Size(ew, eh))
        }
        s.drawArc(
            eyeColor,
            startAngle = 27f,
            sweepAngle = 126f,
            useCenter = false,
            topLeft = Offset(c.first - 4.5f, c.second + r * 0.22f - 4.5f),
            size = Size(9f, 9f),
            style = Stroke(width = 1.6f, cap = StrokeCap.Round))
    }
}
