package com.tablejoker.flapclock.tv;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.Test;

/** JVM 上的兼容性护栏：安卓 6（API 23）与 Android TV 外壳的约定，防止改动时破坏 */
public class AndroidCompatibilityTest {
    private static final String SRC = "app/src/main/java/com/tablejoker/flapclock/tv/";

    @Test
    public void buildConfigOriginIsAnHttpsTvOriginAndIsTrusted() {
        assertTrue("正式版地址必须是 HTTPS 且以 /tv/ 结尾", BuildConfig.TV_ORIGIN.startsWith("https://") && BuildConfig.TV_ORIGIN.endsWith("/tv/"));
        OriginPolicy policy = new OriginPolicy(BuildConfig.TV_ORIGIN);
        String host = BuildConfig.TV_ORIGIN.substring(0, BuildConfig.TV_ORIGIN.length() - 4);
        assertTrue(policy.isTrusted(host + "/tv/index.html"));
        assertFalse(policy.isTrusted(host.replace("https://", "http://") + "/tv/index.html"));
        assertFalse(policy.isTrusted("https://evil.example/tv/index.html"));
    }

    @Test
    public void originPolicyUsesApi23SafeStringOperationsForEmptyPaths() throws IOException {
        String originPolicy = readProjectFile(SRC + "OriginPolicy.java");
        assertFalse("String.isBlank requires API 33 and cannot run on Android 6", originPolicy.contains(".isBlank()"));
        assertTrue(new OriginPolicy(BuildConfig.TV_ORIGIN).isTrusted(BuildConfig.TV_ORIGIN.substring(0, BuildConfig.TV_ORIGIN.length() - 1)));
    }

    @Test
    public void androidBuildKeepsTheApi23CompatibilityFloor() throws IOException {
        Matcher minSdk = Pattern.compile("minSdk\\s*=\\s*(\\d+)").matcher(readProjectFile("app/build.gradle.kts"));
        assertTrue("defaultConfig must declare minSdk", minSdk.find());
        assertEquals("Android 6.0 is API 23", 23, Integer.parseInt(minSdk.group(1)));
    }

    @Test
    public void manifestDeclaresTvSafeLaunchAndNetworkDefaults() throws IOException {
        String manifest = readProjectFile("app/src/main/AndroidManifest.xml");
        assertTrue(manifest.contains("android.permission.INTERNET"));
        assertTrue(manifest.contains("android.permission.ACCESS_NETWORK_STATE"));
        assertTrue(manifest.contains("android:screenOrientation=\"landscape\""));
        assertTrue(manifest.contains("android.intent.category.LEANBACK_LAUNCHER"));
        assertTrue(manifest.contains("android:allowBackup=\"false\""));
        assertTrue("明文开关由版本决定", manifest.contains("android:usesCleartextTraffic=\"${cleartext}\""));
        assertTrue("开机自启", manifest.contains("android.intent.action.BOOT_COMPLETED"));
        assertFalse("不再需要安装应用的权限", manifest.contains("REQUEST_INSTALL_PACKAGES"));
        String build = readProjectFile("app/build.gradle.kts");
        int prod = build.indexOf("create(\"prod\")"), lan = build.indexOf("create(\"lan\")");
        assertTrue(prod > 0 && lan > prod);
        assertTrue("正式版禁止明文 http", build.substring(prod, lan).contains("manifestPlaceholders[\"cleartext\"] = \"false\""));
        assertTrue("正式版的网络安全配置禁止明文", readProjectFile("app/src/main/res/xml/network_security_config.xml").contains("cleartextTrafficPermitted=\"false\""));
    }

    @Test
    public void mainActivityKeepsDisplayOnAndFocusesWebViewForRemoteInput() throws IOException {
        String activity = readProjectFile(SRC + "MainActivity.java");
        assertTrue(activity.contains("WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON"));
        assertTrue("WebView must be focusable before Android TV remote events arrive", activity.contains("webView.setFocusableInTouchMode(true);"));
        assertTrue("WebView must explicitly own focus for DPAD and Enter delivery", activity.contains("webView.requestFocus();"));
    }

    @Test
    public void safeBrowsingChecksTheFeatureThatStartSafeBrowsingActuallyRequires() throws IOException {
        String activity = readProjectFile(SRC + "MainActivity.java");
        assertTrue(activity.contains("WebViewFeature.START_SAFE_BROWSING"));
        assertFalse(activity.contains("WebViewFeature.SAFE_BROWSING_ENABLE"));
    }

    @Test
    public void api23AndModernNavigationCallbacksEnforceTheSameOriginPolicy() throws IOException {
        String activity = readProjectFile(SRC + "MainActivity.java");
        assertTrue(activity.contains("shouldOverrideUrlLoading(WebView view, String url)"));
        assertTrue(activity.contains("shouldOverrideUrlLoading(WebView view, WebResourceRequest request)"));
    }

    @Test
    public void javascriptBridgeNeverReadsWebViewStateFromItsBackgroundThread() throws IOException {
        String bridge = readProjectFile(SRC + "TvJavascriptBridge.java");
        assertFalse(bridge.contains("WebView"));
        assertFalse(bridge.contains("getUrl()"));
        assertTrue(bridge.contains("TrustedPageState"));
        assertFalse("简化版不再做设备密钥签名", bridge.contains("signChallenge") || bridge.contains("getPublicKey"));
    }

    private String readProjectFile(String relativePath) throws IOException {
        Path fromAndroidRoot = Paths.get(relativePath);
        Path fromAppModule = Paths.get("..", relativePath);
        Path file = Files.isRegularFile(fromAndroidRoot) ? fromAndroidRoot : fromAppModule;
        return new String(Files.readAllBytes(file), StandardCharsets.UTF_8);
    }
}
