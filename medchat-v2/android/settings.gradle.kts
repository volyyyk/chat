// Настройки Gradle (этап 4 ч.3 ROADMAP_NATIVE): единый app-модуль.
// Репозитории google/mavenCentral покрывают AGP/Kotlin/Compose/JNA;
// Gradle-обвязки плагинов ищутся в google + mavenCentral + portal.
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "MedchatAndroid"
include(":app")