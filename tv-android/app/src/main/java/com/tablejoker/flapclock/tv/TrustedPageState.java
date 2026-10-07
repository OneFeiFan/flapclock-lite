package com.tablejoker.flapclock.tv;

import java.util.concurrent.atomic.AtomicBoolean;

/** Thread-safe trust snapshot written by UI-thread WebView callbacks and read by the JS bridge thread. */
public final class TrustedPageState {
    private final OriginPolicy originPolicy;
    private final AtomicBoolean trusted = new AtomicBoolean(false);

    public TrustedPageState(OriginPolicy originPolicy) {
        this.originPolicy = originPolicy;
    }

    public void updateFromPageCallback(String url) {
        trusted.set(originPolicy.isTrusted(url));
    }

    public void invalidate() {
        trusted.set(false);
    }

    public boolean isTrusted() {
        return trusted.get();
    }

    public void requireTrusted() {
        if (!trusted.get()) {
            throw new SecurityException("Javascript bridge is unavailable for this origin");
        }
    }
}
