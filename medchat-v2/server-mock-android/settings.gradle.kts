// Отдельный Gradle-проект: лёгкий тестовый сервер MedChat внутри APK.
// Версии тулчейна те же, что у основного android-клиента (Kotlin 2.0.21,
// AGP 8.5.2, Gradle 8.9 в CI). Это НЕ боевой сервер: только эмуляция API
// для проверки клиентов с телефона, см. README.md.
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
rootProject.name = "MedchatServerMock"
include(":app")
