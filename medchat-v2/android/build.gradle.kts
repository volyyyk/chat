// Корень Gradle-проекта (этап 4 ч.3). Версии зафиксированы: Kotlin
// 2.0.21 — тот же, что kotlinc в джобе android-smoke; Compose-компилятор
// — плагином Kotlin (org.jetbrains.kotlin.plugin.compose, Kotlin 2.0+);
// AGP 8.5.2 собирается Gradle 8.9 (джоба CI android-build).
plugins {
    id("com.android.application") version "8.5.2" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.21" apply false
}