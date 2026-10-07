/*
 * 容器健康检查：node deploy/healthcheck.mjs
 *
 * 为什么不只用 /api/time：
 *   - /api/time 恒返回 200（不读盘、不看前端产物），服务端活着但镜像里少带 web/dist 时它照样是绿的；
 *   - / 在前端产物缺失时会返回一段纯文本“前端尚未构建”，状态码同样是 200。
 * 两者都会让编排以为服务健康，而电视打开是白屏。所以这里额外确认 /tv/ 真的返回了大屏页面。
 *
 * 退出码：0 = 健康，1 = 不健康（编排会据此重启容器）。
 */

var port = process.env.PORT || 18630;
var base = 'http://127.0.0.1:' + port;
var TIMEOUT_MS = 4000;

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function get(path) {
  var ac = new AbortController();
  var timer = setTimeout(function () { ac.abort(); }, TIMEOUT_MS);
  try {
    return await fetch(base + path, { signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

try {
  var time = await get('/api/time');
  if (!time.ok) fail('/api/time 返回 ' + time.status + '，服务端没有正常响应');
  var timeBody = await time.text();
  if (!/[0-9]/.test(timeBody)) fail('/api/time 响应内容异常：' + timeBody.slice(0, 80));

  var tv = await get('/tv/');
  if (!tv.ok) fail('/tv/ 返回 ' + tv.status + '（多半是镜像里没有 web/dist）');
  var html = await tv.text();
  if (html.indexOf('/assets/') < 0) {
    fail('/tv/ 没有返回大屏页面（前端产物缺失或静态目录不对）：' + html.slice(0, 80));
  }
  process.exit(0);
} catch (e) {
  fail('健康检查失败：' + ((e && e.message) ? e.message : e));
}
