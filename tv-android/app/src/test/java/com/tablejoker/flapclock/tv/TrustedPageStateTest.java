package com.tablejoker.flapclock.tv;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.Test;

public class TrustedPageStateTest {
    @Test
    public void bridgeTrustFollowsOnlyExactTrustedPageCallbacks() {
        TrustedPageState state = new TrustedPageState(new OriginPolicy("https://timer.example.com/tv/"));

        assertThrows(SecurityException.class, state::requireTrusted);
        state.updateFromPageCallback("https://timer.example.com/tv/index.html");
        state.requireTrusted();
        state.updateFromPageCallback("https://timer.example.com.evil.test/tv/index.html");
        assertThrows(SecurityException.class, state::requireTrusted);
    }

    @Test
    public void javascriptThreadObservesUiThreadTrustUpdates() throws Exception {
        TrustedPageState state = new TrustedPageState(new OriginPolicy("https://timer.example.com/tv/"));
        CountDownLatch updated = new CountDownLatch(1);
        Thread uiThread = new Thread(() -> {
            state.updateFromPageCallback("https://timer.example.com/tv/index.html");
            updated.countDown();
        });
        uiThread.start();

        assertTrue(updated.await(2, TimeUnit.SECONDS));
        assertTrue(state.isTrusted());
        state.invalidate();
        assertFalse(state.isTrusted());
    }
}
