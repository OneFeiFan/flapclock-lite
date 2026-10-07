package com.tablejoker.flapclock.tv;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.webkit.JavascriptInterface;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.UUID;

/**
 * 提供给大屏页的原生接口（window.TvDeviceBridge），只对受信任地址的页面开放：
 *  - getInstallationId()：本机安装号，卸载重装前不变，大屏页用它作为屏幕编号（清浏览器缓存也不会变成“新屏幕”）；
 *  - getDeviceMetadata()：应用版本与设备型号。
 */
public final class TvJavascriptBridge {
    private final TrustedPageState trustedPageState;
    private final Context context;

    public TvJavascriptBridge(TrustedPageState trustedPageState, Context context) {
        this.trustedPageState = trustedPageState;
        this.context = context.getApplicationContext();
    }

    @JavascriptInterface public String getInstallationId() {
        requireTrusted();
        SharedPreferences preferences = context.getSharedPreferences("device_identity", Context.MODE_PRIVATE);
        String value = preferences.getString("installation_id", null);
        if (value == null) {
            value = UUID.randomUUID().toString();
            preferences.edit().putString("installation_id", value).apply();
        }
        return value;
    }

    @JavascriptInterface public String getDeviceMetadata() {
        requireTrusted();
        try {
            return new JSONObject().put("appVersion", BuildConfig.VERSION_NAME)
                    .put("deviceModel", Build.MANUFACTURER + " " + Build.MODEL).toString();
        } catch (JSONException exception) {
            throw new IllegalStateException("无法生成设备信息", exception);
        }
    }

    private void requireTrusted() { trustedPageState.requireTrusted(); }
}
