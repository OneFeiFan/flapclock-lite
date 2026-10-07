package com.tablejoker.flapclock.tv;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** 局域网测试版：服务器地址规范化，以及 http 地址白名单（仍只认设定的那一台服务器） */
public class LanTest {
    @Test public void normalizesTypicalInputs() {
        assertEquals("http://192.168.1.5:18630/tv/", ServerAddress.normalize("192.168.1.5:18630"));
        assertEquals("http://192.168.1.5:18630/tv/", ServerAddress.normalize(" 192.168.1.5 "));       // 省略端口时用默认端口 18630
        assertEquals("http://192.168.1.5:9000/tv/", ServerAddress.normalize("http://192.168.1.5:9000/tv/"));
        assertEquals("http://192.168.1.5:18630/tv/", ServerAddress.normalize("192.168.1.5：18630"));
        assertEquals("http://mypc.local:18630/tv/", ServerAddress.normalize("mypc.local:18630/"));
        assertEquals("192.168.1.5:18630", ServerAddress.display("http://192.168.1.5:18630/tv/"));
    }

    @Test public void rejectsInvalidInputs() {
        assertNull(ServerAddress.normalize(""));
        assertNull(ServerAddress.normalize("192.168..5"));
        assertNull(ServerAddress.normalize("192.168.1.5:99999"));
        assertNull(ServerAddress.normalize("http://192.168.1.5:18630/other/"));
        assertNull(ServerAddress.normalize("javascript:alert(1)"));
    }

    @Test public void httpOriginIsTrustedOnlyForTheConfiguredServerInLanMode() {
        OriginPolicy lan = new OriginPolicy("http://192.168.1.5:18630/tv/", true);
        assertTrue(lan.isTrusted("http://192.168.1.5:18630/tv/#/display"));
        assertFalse(lan.isTrusted("http://192.168.1.6:18630/tv/"));
        assertFalse(lan.isTrusted("http://192.168.1.5:9090/tv/"));
        assertFalse(lan.isTrusted("http://192.168.1.5:18630/"));
        assertFalse(lan.isTrusted("https://192.168.1.5:18630/tv/"));
        OriginPolicy prod = new OriginPolicy("http://192.168.1.5:18630/tv/", false);
        assertFalse("正式版不接受 http", prod.isTrusted("http://192.168.1.5:18630/tv/"));
    }
}
