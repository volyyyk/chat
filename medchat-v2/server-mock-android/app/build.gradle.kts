// App-модуль тестового сервера. Минимум зависимостей: Compose для экрана
// управления и NanoHTTPD (один маленький jar) как встроенный HTTP-сервер.
// Никакого Rust-ядра и БД: это эмуляция API для смоук-тестов клиентов.
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "medchat.servermock"
    compileSdk = 34

    defaultConfig {
        applicationId = "medchat.servermock"
        minSdk = 23
        targetSdk = 34
        versionCode = 101
        versionName = "1.1.0"
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
    implementation("org.nanohttpd:nanohttpd:2.3.1")
}
