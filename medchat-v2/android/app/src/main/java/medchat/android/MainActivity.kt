package medchat.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent

// Точка входа: SecureStore.configure ДО любого обращения сервисов
// (мастер-ключ Android Keystore), UI — Compose (MedchatApp).
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        SecureStore.configure(applicationContext)
        setContent {
            MedchatApp()
        }
    }
}