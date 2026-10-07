package com.tablejoker.flapclock.tv;
import org.junit.Test;
import static org.junit.Assert.*;
public class OriginPolicyTest {
 @Test public void acceptsOnlyTrustedHttpsOriginAndPath(){OriginPolicy p=new OriginPolicy("https://timer.example.com/tv/");assertTrue(p.isTrusted("https://timer.example.com/tv/index.html"));assertFalse(p.isTrusted("http://timer.example.com/tv/"));assertFalse(p.isTrusted("https://evil.example/tv/"));assertFalse(p.isTrusted("https://timer.example.com/other"));}
 @Test public void rejectsHostPrefixAttack(){OriginPolicy p=new OriginPolicy("https://timer.example.com/tv/");assertFalse(p.isTrusted("https://timer.example.com.evil.test/tv/"));}
}
