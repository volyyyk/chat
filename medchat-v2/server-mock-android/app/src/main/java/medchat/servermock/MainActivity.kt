package medchat.servermock

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
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
}

@Composable
private fun ServerScreen() {
    var port by remember { mutableStateOf("8080") }
    var server by remember { mutableStateOf<MockServer?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val log = remember { mutableStateListOf<String>() }
    val scope = rememberCoroutineScope()
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

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                onClick = {
                    error = null
                    scope.launch(Dispatchers.IO) {
                        try {
                            val p = port.toIntOrNull() ?: 8080
                            val s = MockServer(p) { line ->
                                log.add(0, line)
                                while (log.size > 200) log.removeAt(log.size - 1)
                            }
                            s.start(5000, false)
                            server = s
                        } catch (e: Exception) {
                            error = e.message ?: "Не удалось запустить сервер"
                        }
                    }
                },
                enabled = server == null
            ) { Text("Запустить") }
            OutlinedButton(
                onClick = {
                    server?.stop()
                    server = null
                },
                enabled = server != null
            ) { Text("Остановить") }
        }

        if (server != null) {
            val active = server!!
            Text("Сервер работает. Адреса для клиентов:", style = MaterialTheme.typography.titleSmall)
            if (ips.isEmpty()) {
                Text("http://127.0.0.1:${active.port} (сетевой адрес не найден)", fontFamily = FontFamily.Monospace)
            }
            ips.forEach { (name, addr) ->
                Text("http://$addr:${active.port}  ($name)", fontFamily = FontFamily.Monospace)
            }
            Text(
                "На этом же устройстве: http://127.0.0.1:${active.port}. " +
                    "Телефон клиента должен быть подключён к той же сети (точка доступа). " +
                    "Если адресов несколько, берите адрес вида 192.168.x.x: адреса " +
                    "10.x/100.x обычно принадлежат мобильной сети оператора и с другого " +
                    "телефона недоступны.",
                style = MaterialTheme.typography.bodySmall
            )
        }

        error?.let {
            Text("Ошибка: $it", color = MaterialTheme.colorScheme.error)
        }

        Text("Журнал запросов:", style = MaterialTheme.typography.titleSmall)
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
