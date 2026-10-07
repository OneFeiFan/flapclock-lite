package com.tablejoker.flapclock.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

/**
 * 全屏显示大屏页（/tv/）。正式版加载打包时指定的 HTTPS 地址；
 * 局域网测试版加载在设置页里填写的电脑地址，按菜单键（或 2 秒内连按 3 次返回键）重新设置。
 */
public final class MainActivity extends Activity {
    private static final int BLACK = Color.rgb(5, 5, 5);
    private WebView webView;
    private String origin;
    private OriginPolicy origins;
    private TrustedPageState trustedPageState;
    private final long[] backPresses = new long[3];

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        origin = BuildConfig.LAN ? ServerAddress.load(this) : BuildConfig.TV_ORIGIN;
        if (origin == null) { openSetup(); return; }
        origins = new OriginPolicy(origin, BuildConfig.LAN);
        trustedPageState = new TrustedPageState(origins);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        enterImmersive();
        configureWebView();
        setContentView(webView);
        webView.setFocusableInTouchMode(true);
        webView.requestFocus();
        if (savedInstanceState == null) webView.loadUrl(origin); else webView.restoreState(savedInstanceState);
    }

    @SuppressLint("SetJavaScriptEnabled") private void configureWebView() {
        webView = new WebView(this);
        webView.setBackgroundColor(BLACK);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true); settings.setDatabaseEnabled(false);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false); settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(false); settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        webView.addJavascriptInterface(new TvJavascriptBridge(trustedPageState, this), "TvDeviceBridge");
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) { return !origins.isTrusted(url); }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return !origins.isTrusted(request.getUrl().toString()); }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) { trustedPageState.updateFromPageCallback(url); }
            @Override public void onPageFinished(WebView view, String url) { trustedPageState.updateFromPageCallback(url); }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, android.net.http.SslError error) { handler.cancel(); }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (!request.isForMainFrame()) return;
                trustedPageState.invalidate();
                view.loadDataWithBaseURL(null, offlinePage(), "text/html", "UTF-8", null);
                view.postDelayed(() -> view.loadUrl(origin), 5000);
            }
        });
        if (WebViewFeature.isFeatureSupported(WebViewFeature.START_SAFE_BROWSING)) WebViewCompat.startSafeBrowsing(this, ignored -> { });
    }

    /** 断网提示页：翻牌钟的黑底白字；局域网测试版额外显示当前服务器地址和修改方法 */
    private String offlinePage() {
        String extra = BuildConfig.LAN
                ? "<div style='margin-top:28px;font-size:22px;color:#8F8F8A'>服务器：" + ServerAddress.display(origin)
                  + "<br>按遥控器菜单键（或 2 秒内连按 3 次返回键）修改地址</div>"
                : "";
        return "<body style='margin:0;background:#050505;color:#F2F2EE;font-family:sans-serif;text-align:center;padding-top:18%'>"
                + "<div style='font-size:40px;font-weight:900;letter-spacing:.12em'>网络连接失败</div>"
                + "<div style='margin-top:18px;font-size:24px;color:#8F8F8A'>正在等待恢复，5 秒后自动重试…</div>" + extra + "</body>";
    }

    private void openSetup() {
        startActivity(new Intent(this, SetupActivity.class));
        finish();
    }

    @Override public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (BuildConfig.LAN && keyCode == KeyEvent.KEYCODE_MENU) { openSetup(); return true; }
        return super.onKeyDown(keyCode, event);
    }

    @Override public void onBackPressed() {
        if (BuildConfig.LAN) {
            System.arraycopy(backPresses, 1, backPresses, 0, 2);
            backPresses[2] = SystemClock.elapsedRealtime();
            if (backPresses[0] > 0 && backPresses[2] - backPresses[0] < 2000) { openSetup(); return; }
        }
        if (webView != null && webView.canGoBack()) webView.goBack();
    }

    @Override protected void onResume() { super.onResume(); if (webView == null) return; enterImmersive(); webView.onResume(); }
    @Override protected void onPause() { if (webView != null) webView.onPause(); super.onPause(); }
    @Override protected void onSaveInstanceState(Bundle state) { if (webView != null) webView.saveState(state); super.onSaveInstanceState(state); }
    @Override protected void onDestroy() {
        if (webView != null) { trustedPageState.invalidate(); webView.removeJavascriptInterface("TvDeviceBridge"); webView.destroy(); }
        super.onDestroy();
    }
    private void enterImmersive() { getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE); }
}
