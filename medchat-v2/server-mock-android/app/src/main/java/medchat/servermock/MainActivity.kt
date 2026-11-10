package medchat.servermock

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.net.Inet4Address
import java.net.NetworkInterface

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                ServerScreen()
            }
        }
    }

    companion object {
        // Сервер живёт в процессе и переживает пересоздание Activity;
        // храним ссылку в companion, чтобы UI не терял состояние.
        @Volatile
        var liveServer: MockServer? = null
    }
}

fun copyText(context: Context, text: String, label: String) {
    val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    cm.setPrimaryClip(ClipData.newPlainText(label, text))
    Toast.makeText(context, "Скопировано: " + text, Toast.LENGTH_SHORT).show()
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ServerScreen() {
    var port by remember { mutableStateOf("8080") }
    var server by remember { mutableStateOf(MainActivity.liveServer) }
    var starting by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val log = remember { mutableStateListOf<String>() }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val ips = remember { localIpv4s() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("MedChat: тестовый сервер", style = MaterialTheme.typography.headlineSmall)
        Text(
            "Лёгкая эмуляция MedChat API для проверки клиентов с телефона. " +
                "Вход принимает любые email и пароль, чаты и сообщения фиктивные, " +
                "E2E-шифрование и платежи не эмулируются.",
            style = MaterialTheme.typography.bodySmall
        )

        OutlinedTextField(
            value = port,
            onValueChange = { port = it.filter { c -> c.isDigit() }.take(5) },
            label = { Text("Порт") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )

        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Button(
                onClick = {
                    error = null
                    starting = true
                    scope.launch(Dispatchers.IO) {
                        try {
                            val p = port.toIntOrNull() ?: 8080
                            val s = MockServer(p) { line ->
                                log.add(0, line)
                                while (log.size > 200) log.removeAt(log.size - 1)
                            }
                            s.start(5000, false)
                            MainActivity.liveServer = s
                            server = s
                            // Foreground-сервис держит процесс, когда приложение
                            // уходит в фон: без него система выгружает сервер и
                            // клиент получает «failed to connect ... after 15000ms».
                            ServerFGService.start(context, p)
                        } catch (e: Exception) {
                            error = e.message ?: "Не удалось запустить сервер"
                        }
                        starting = false
                    }
                },
                enabled = server == null && !starting
            ) { Text(if (starting) "Запуск..." else "Запустить") }
            if (starting) {
                CircularProgressIndicator(modifier = Modifier.size(24.dp))
            }
            OutlinedButton(
                onClick = {
                    server?.stop()
                    MainActivity.liveServer = null
                    server = null
                    ServerFGService.stop(context)
                },
                enabled = server != null
            ) { Text("Остановить") }
        }

        if (server != null) {
            val active = server!!
            Text(
                "Сервер работает. Нажмите на адрес (или зажмите), чтобы скопировать его вместе с портом:",
                style = MaterialTheme.typography.titleSmall
            )
            val loopback = "http://127.0.0.1:" + active.port
            AddressRow(loopback, "этот телефон (localhost)")
            ips.forEach { (name, addr) ->
                AddressRow("http://" + addr + ":" + active.port, name)
            }
            Text(
                "На этом же устройстве: http://127.0.0.1:" + active.port + ". " +
                    "Телефон клиента должен быть подключён к той же сети (точка доступа). " +
                    "Если адресов несколько, берите адрес вида 192.168.x.x: адреса " +
                    "10.x/100.x обычно принадлежат мобильной сети оператора и с другого " +
                    "телефона недоступны. VPN на телефоне может мешать даже адресу 127.0.0.1.",
                style = MaterialTheme.typography.bodySmall
            )
        }

        error?.let {
            Text("Ошибка: " + it, color = MaterialTheme.colorScheme.error)
        }

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                "Журнал запросов:",
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier.weight(1f)
            )
            TextButton(
                onClick = { copyText(context, log.joinToString("\n"), "Журнал сервера") },
                enabled = log.isNotEmpty()
            ) { Text("Скопировать") }
        }
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
        ) {
            if (log.isEmpty()) {
                Text("(пусто)", style = MaterialTheme.typography.bodySmall)
            }
            log.forEach { line ->
                Text(line, style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace)
            }
        }
    }
}

// Строка адреса: нажатие (в том числе длинное) копирует «http://ip:порт».
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun AddressRow(url: String, label: String) {
    val context = LocalContext.current
    Text(
        url + "  (" + label + ")",
        fontFamily = FontFamily.Monospace,
        modifier = Modifier
            .fillMaxWidth()
            .combinedClickable(
                onClick = { copyText(context, url, "Адрес сервера") },
                onLongClick = { copyText(context, url, "Адрес сервера") }
            )
    )
}

private fun localIpv4s(): List<Pair<String, String>> {
    return try {
        val result = mutableListOf<Pair<String, String>>()
        val en = NetworkInterface.getNetworkInterfaces()
        while (en.hasMoreElements()) {
            val n = en.nextElement()
            val addrs = n.inetAddresses
            while (addrs.hasMoreElements()) {
                val a = addrs.nextElement()
                if (!a.isLoopbackAddress && a is Inet4Address) {
                    result.add(n.name to a.hostAddress)
                }
            }
        }
        result
    } catch (_: Exception) {
        emptyList()
    }
}
