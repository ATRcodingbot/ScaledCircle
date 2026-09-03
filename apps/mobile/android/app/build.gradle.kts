import java.io.FileInputStream
import java.util.Properties
import org.gradle.api.GradleException

plugins {
    id("com.android.application")
    id("com.google.gms.google-services")
    id("dev.flutter.flutter-gradle-plugin")
}

val releaseKeyPropertiesFile = rootProject.file("key.properties")
val releaseKeyProperties = Properties()
if (releaseKeyPropertiesFile.exists()) {
    FileInputStream(releaseKeyPropertiesFile).use(releaseKeyProperties::load)
}

val releaseTaskRequested = gradle.startParameter.taskNames.any {
    it.contains("release", ignoreCase = true)
}
if (releaseTaskRequested && !releaseKeyPropertiesFile.exists()) {
    throw GradleException(
        "Release signing requires android/key.properties. " +
            "Debug signing is never permitted for a release artifact.",
    )
}

fun requiredSigningProperty(name: String): String =
    releaseKeyProperties.getProperty(name)?.takeIf { it.isNotBlank() }
        ?: throw GradleException("Missing release signing property: $name")

android {
    namespace = "com.scaledcircle.app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "com.scaledcircle.app"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (releaseKeyPropertiesFile.exists()) {
            create("release") {
                keyAlias = requiredSigningProperty("keyAlias")
                keyPassword = requiredSigningProperty("keyPassword")
                storeFile = file(requiredSigningProperty("storeFile"))
                storePassword = requiredSigningProperty("storePassword")
            }
        }
    }

    buildTypes {
        release {
            if (releaseKeyPropertiesFile.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

dependencies {
    implementation(platform("com.google.firebase:firebase-bom:34.2.0"))
    implementation("com.google.android.gms:play-services-location:21.3.0")
}
