import java.net.URI
import java.util.Properties

plugins { id("com.android.application") }

val releaseSigningFile = rootProject.file("keystore.properties")
val releaseSigning = Properties().apply {
    if (releaseSigningFile.isFile) releaseSigningFile.inputStream().use(::load)
}

/*
 * 正式版加载的大屏地址：./gradlew assembleProdRelease -PtvOrigin=https://你的域名/tv/
 * 必须是 HTTPS、路径正好是 /tv/（服务端把大屏页放在这个路径下）。没有指定时使用占位地址并给出警告。
 */
val placeholderOrigin = "https://flapclock.example.com/tv/"
val tvOrigin = providers.gradleProperty("tvOrigin").orNull ?: placeholderOrigin
val parsedTvOrigin = try {
    URI(tvOrigin)
} catch (exception: Exception) {
    throw GradleException("tvOrigin must be an absolute HTTPS origin ending in /tv/", exception)
}
if (!parsedTvOrigin.scheme.equals("https", ignoreCase = true)
        || parsedTvOrigin.host.isNullOrEmpty()
        || parsedTvOrigin.rawPath != "/tv/"
        || parsedTvOrigin.userInfo != null
        || parsedTvOrigin.port > 65535
        || parsedTvOrigin.query != null
        || parsedTvOrigin.fragment != null) {
    throw GradleException("tvOrigin must use HTTPS, include a host, and be exactly an origin ending in /tv/")
}
if (tvOrigin == placeholderOrigin) logger.warn("tvOrigin 未指定，正式版将加载占位地址 $placeholderOrigin（局域网测试版不受影响）")

android {
    namespace = "com.tablejoker.flapclock.tv"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.tablejoker.flapclock.tv"
        minSdk = 23
        targetSdk = 35
        versionCode = 2
        versionName = "1.0.1"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "TV_ORIGIN", "\"$tvOrigin\"")
    }

    /*
     * prod：正式版，只允许 HTTPS，加载 tvOrigin；
     * lan：局域网测试版，可与正式版同时安装，允许 http，服务器地址在电视上填写（电脑上运行 npm run lan）。
     */
    flavorDimensions += "env"
    productFlavors {
        create("prod") {
            dimension = "env"
            buildConfigField("boolean", "LAN", "false")
            manifestPlaceholders["cleartext"] = "false"
        }
        create("lan") {
            dimension = "env"
            applicationIdSuffix = ".lan"
            versionNameSuffix = "-lan"
            buildConfigField("boolean", "LAN", "true")
            manifestPlaceholders["cleartext"] = "true"
        }
    }

    buildFeatures { buildConfig = true }
    signingConfigs {
        if (releaseSigningFile.isFile) {
            create("release") {
                storeFile = rootProject.file(requireNotNull(releaseSigning.getProperty("storeFile")))
                storePassword = requireNotNull(releaseSigning.getProperty("storePassword"))
                keyAlias = requireNotNull(releaseSigning.getProperty("keyAlias"))
                keyPassword = requireNotNull(releaseSigning.getProperty("keyPassword"))
            }
        }
    }
    buildTypes {
        debug { isMinifyEnabled = false }
        release {
            isMinifyEnabled = true
            signingConfig = signingConfigs.findByName("release")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    testOptions { unitTests.isReturnDefaultValues = true }
    lint { abortOnError = true; checkReleaseBuilds = true }
}

dependencies {
    implementation("androidx.core:core:1.15.0")
    implementation("androidx.webkit:webkit:1.13.0")
    testImplementation("junit:junit:4.13.2")
}
