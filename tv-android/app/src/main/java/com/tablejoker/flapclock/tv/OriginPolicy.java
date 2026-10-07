package com.tablejoker.flapclock.tv;

import java.net.URI;

/**
 * 只允许加载受信任地址（同协议、同主机、同端口、路径在 /tv/ 下）的页面。
 * 正式版只接受 HTTPS；局域网测试版（allowHttp）也接受 http，但同样只认设定的那一台服务器。
 */
public final class OriginPolicy {
    private final URI trusted;
    private final boolean allowHttp;

    public OriginPolicy(String trustedUrl) { this(trustedUrl, false); }

    public OriginPolicy(String trustedUrl, boolean allowHttp) {
        this.trusted = URI.create(trustedUrl);
        this.allowHttp = allowHttp;
    }

    public boolean isTrusted(String candidate) {
        try {
            URI value = URI.create(candidate);
            String scheme = value.getScheme();
            boolean schemeOk = "https".equalsIgnoreCase(scheme) || (allowHttp && "http".equalsIgnoreCase(scheme));
            return schemeOk
                    && scheme.equalsIgnoreCase(trusted.getScheme())
                    && trusted.getHost().equalsIgnoreCase(value.getHost())
                    && effectivePort(trusted) == effectivePort(value)
                    && normalizedPath(value).startsWith(normalizedPath(trusted));
        } catch (RuntimeException exception) { return false; }
    }

    private int effectivePort(URI value) {
        if (value.getPort() >= 0) return value.getPort();
        return "http".equalsIgnoreCase(value.getScheme()) ? 80 : 443;
    }
    private String normalizedPath(URI value) { String path = value.getPath(); return path == null || path.length() == 0 ? "/" : path.endsWith("/") ? path : path + "/"; }
}
