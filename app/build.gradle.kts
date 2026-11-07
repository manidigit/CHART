import java.io.File
import java.time.Duration
import java.util.Base64

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.secrets)
}

val canonicalKeystoreBase64 = "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"
val rootKeystoreFile = rootProject.file("debug.keystore")
val base64KeystoreFile = rootProject.file("debug.keystore.base64")

fun ensureKeystoreExists(target: File) {
    if (!target.exists() || target.length() < 1000L) {
        try {
            val base64Data = if (base64KeystoreFile.exists() && base64KeystoreFile.length() > 1000L) {
                base64KeystoreFile.readText().replace("\r", "").replace("\n", "").replace(" ", "")
            } else {
                canonicalKeystoreBase64
            }
            val decodedBytes = Base64.getDecoder().decode(base64Data)
            target.parentFile?.mkdirs()
            target.writeBytes(decodedBytes)
        } catch (e: Exception) {
            logger.warn("Could not materialize keystore to ${target.path}: ${e.message}")
        }
    }
}

ensureKeystoreExists(rootKeystoreFile)

android {
    namespace = "es.manico.chartintelligence"
    compileSdk = 36

    defaultConfig {
        applicationId = "es.manico.chartintelligence"
        minSdk = 26
        targetSdk = 36
        val ciRunNumber = System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull()
        versionCode = if (ciRunNumber != null && ciRunNumber > 0) 100 + ciRunNumber else 27
        versionName = if (ciRunNumber != null && ciRunNumber > 0) "1.27.$ciRunNumber" else "1.27.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "API_BASE_URL", "\"https://chart.manico.es/api/v1/\"")
        buildConfigField("String", "TWELVE_DATA_API_KEY", "\"\"")
    }

    signingConfigs {
        create("release") {
            storeFile = rootProject.file("debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
        getByName("debug") {
            storeFile = rootProject.file("debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    testOptions {
        unitTests {
            isIncludeAndroidResources = true
        }
    }
}

tasks.withType<Test> {
    failFast = true
    timeout.set(Duration.ofMinutes(2))
    testLogging {
        events("passed", "failed", "skipped")
    }
}

secrets {
    propertiesFileName = ".env"
    defaultPropertiesFileName = ".env.example"
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.androidx.material.icons.extended)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.okhttp)

    testImplementation(libs.junit)
    testImplementation(libs.androidx.junit)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.ui.test.junit4)
    debugImplementation(libs.androidx.ui.tooling)
    debugImplementation(libs.androidx.ui.test.manifest)
}
