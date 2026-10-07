package com.tablejoker.flapclock.tv;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** 开机自启：门店的电视盒子经常直接断电重启，开机后自动打开大屏 */
public final class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (intent == null || !Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        Intent start = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            context.startActivity(start);
        } catch (RuntimeException ignored) {
            // 部分系统（安卓 10 以上的手机系统等）不允许开机时从后台打开界面，此时需要手动打开
        }
    }
}
