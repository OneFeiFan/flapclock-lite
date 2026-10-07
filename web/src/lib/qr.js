import qrcode from 'qrcode-generator';
/* 生成二维码 SVG 字符串 */
export function qrSvg(text, size, dark, light) {
  var q = qrcode(0, 'M'); q.addData(text); q.make();
  var n = q.getModuleCount(), quiet = 2, total = n + quiet * 2, path = '';
  for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) path += 'M' + (c + quiet) + ' ' + (r + quiet) + 'h1v1h-1z';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + total + '" width="' + size + '" height="' + size + '" shape-rendering="crispEdges">' +
    '<rect width="100%" height="100%" fill="' + (light || '#fff') + '"/><path d="' + path + '" fill="' + (dark || '#000') + '"/></svg>';
}
