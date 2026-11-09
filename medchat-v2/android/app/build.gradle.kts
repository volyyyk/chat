// App-модуль Android-клиента (этап 4 ч.3). minSdk 23: SecureStore
// (KeyGenParameterSpec AES-GCM в AndroidKeyStore) требует API 23+,
// хотя .so ядра собирается с api 21. Compose — BOM + плагин Kotlin 2.0.
// JNA aar обязателен для UniFFI-обвязки; сама обвязка (uniffi/
// medchat_core) и .so (jniLibs) в репозитории НЕ лежат: их кладёт сборка
// из артефактов CI (джоба android-build; локально — INTEGRATION_BINDINGS
// §3.1-3.2), поэтому git-статус дерева остаётся чистым.
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "medchat.android"
    compileSdk = 34

    defaultConfig {
        applicationId = "medchat.android"
        minSdk = 23
        targetSdk = 34
        versionCode = 201
        versionName = "2.0.1"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-compose:1.9.2")
    implementation(platform("androidx.compose:compose-bom:2024.09.03"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("net.java.dev.jna:jna:5.14.0@aar")
}