package com.tablejoker.flapclock.tv;

import android.content.Context;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 局域网测试版的服务器地址：用户在电视上输入“192.168.1.5:18630”这类地址，
 * 规范化为“http://192.168.1.5:18630/tv/”保存；没写端口时用 18630（npm run lan 的默认端口）。
 */
public final class ServerAddress {
    private static final String PREFS = "server";
    private static final String KEY = "origin";
    private static final Pattern ADDRESS = Pattern.compile("^(?:https?://)?([A-Za-z0-9.-]+)(?::(\\d{1,5}))?/?(?:tv/?)?$");

    private ServerAddress() { }

    /** 规范化用户输入；不合法时返回 null */
    public static String normalize(String input) {
        if (input == null) return null;
        String text = input.trim().replace('：', ':').replace('。', '.');
        Matcher m = ADDRESS.matcher(text);
        if (!m.matches()) return null;
        String host = m.group(1);
        if (host.length() == 0 || host.startsWith(".") || host.endsWith(".") || host.contains("..")) return null;
        int port = m.group(2) == null ? 18630 : Integer.parseInt(m.group(2));
        if (port < 1 || port > 65535) return null;
        return "http://" + host + ":" + port + "/tv/";
    }

    public static String load(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null);
    }

    public static void save(Context context, String origin) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, origin).apply();
    }

    /** 设置页里显示给用户看的形式：去掉 http:// 和 /tv/ */
    public static String display(String origin) {
        if (origin == null) return "";
        return origin.replaceFirst("^https?://", "").replaceFirst("/tv/$", "");
    }
}
