/*
 * 启动信息：本机局域网地址；局域网测试模式（--lan）下再在终端画出遥控页和大屏页的二维码，
 * 手机用相机扫码即可打开。二维码用 ANSI 背景色绘制（黑白块），深色和浅色背景的终端都能扫。
 */
import os from 'os';
import qrcode from 'qrcode-generator';

export function lanAddresses() {
  var out = [], ifs = os.networkInterfaces();
  Object.keys(ifs).forEach(function (name) {
    (ifs[name] || []).forEach(function (a) {
      if ((a.family === 'IPv4' || a.family === 4) && !a.internal) out.push(a.address);
    });
  });
  return out;
}

function terminalQr(text) {
  var qr = qrcode(0, 'M'); qr.addData(text); qr.make();
  var n = qr.getModuleCount(), q = 2, lines = [];
  var dark = function (r, c) { return r >= 0 && c >= 0 && r < n && c < n && qr.isDark(r, c); };
  for (var r = -q; r < n + q; r += 2) {
    var line = '';
    for (var c = -q; c < n + q; c++) {
      var top = dark(r, c), bottom = dark(r + 1, c);
      // 上半格用前景色、下半格用背景色画 “▀”：30 黑 / 37 白，40 黑 / 47 白
      line += '\x1b[' + (top ? 30 : 37) + ';' + (bottom ? 40 : 47) + 'm\u2580';
    }
    lines.push(line + '\x1b[0m');
  }
  return lines.join('\n');
}

export function printBanner(port, lanMode) {
  var ips = lanAddresses(), base = ips.length ? 'http://' + ips[0] + ':' + port : 'http://localhost:' + port;
  var rows = ['', '翻牌钟简化版已启动', ''];
  rows.push('  遥控页（手机）： ' + base + '/');
  rows.push('  大屏页（电视）： ' + base + '/tv/');
  if (ips.length > 1) rows.push('  本机其他地址：   ' + ips.slice(1).map(function (ip) { return 'http://' + ip + ':' + port; }).join('  '));
  console.log(rows.join('\n'));
  if (lanMode && ips.length) {
    console.log('\n用手机相机扫这个码打开遥控页：\n' + terminalQr(base + '/'));
    console.log('\n电视盒子浏览器（或局域网测试版 APK）打开：' + base + '/tv/\n');
  }
  if (!ips.length) console.log('\n没有找到局域网地址：请确认电脑已连接 Wi-Fi 或网线。');
}
