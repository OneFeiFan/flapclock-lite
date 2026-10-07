package com.tablejoker.flapclock.tv;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * 局域网测试版的设置页：填写电脑上 npm run lan 显示的地址（如 192.168.1.5:18630）。
 * 界面全部用代码搭建，遥控器方向键即可操作。
 */
public final class SetupActivity extends Activity {
    private EditText input;
    private TextView error;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(Color.rgb(5, 5, 5));
        int pad = dp(48);
        root.setPadding(pad, pad, pad, pad);

        root.addView(text("连接电脑上的翻牌钟服务", 30, Color.rgb(242, 242, 238)));
        TextView hint = text("在电脑上运行 npm run lan，按终端里显示的“大屏页”地址填写，例如 192.168.1.5:18630", 18, Color.rgb(143, 143, 138));
        hint.setPadding(0, dp(16), 0, dp(24));
        root.addView(hint);

        input = new EditText(this);
        input.setSingleLine(true);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setImeOptions(EditorInfo.IME_ACTION_GO);
        input.setTextSize(TypedValue.COMPLEX_UNIT_SP, 26);
        input.setTextColor(Color.WHITE);
        input.setHintTextColor(Color.GRAY);
        input.setHint("192.168.1.5:18630");
        String saved = ServerAddress.load(this);
        input.setText(saved != null ? ServerAddress.display(saved) : "192.168.");
        input.setSelection(input.getText().length());
        input.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_GO || (event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER)) { connect(); return true; }
            return false;
        });
        root.addView(input, new LinearLayout.LayoutParams(dp(520), LinearLayout.LayoutParams.WRAP_CONTENT));

        error = text("", 18, Color.rgb(255, 197, 58));
        error.setPadding(0, dp(12), 0, dp(12));
        root.addView(error);

        Button go = new Button(this);
        go.setText("连接");
        go.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22);
        go.setOnClickListener(v -> connect());
        root.addView(go, new LinearLayout.LayoutParams(dp(240), LinearLayout.LayoutParams.WRAP_CONTENT));

        setContentView(root);
        input.requestFocus();
    }

    private void connect() {
        String origin = ServerAddress.normalize(input.getText().toString());
        if (origin == null) { error.setText("地址格式不对：请填写电脑的 IP 和端口，例如 192.168.1.5:18630"); return; }
        ServerAddress.save(this, origin);
        startActivity(new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TASK | Intent.FLAG_ACTIVITY_NEW_TASK));
        finish();
    }

    private TextView text(String value, int sp, int color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        view.setTextColor(color);
        view.setGravity(Gravity.CENTER);
        return view;
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
}
