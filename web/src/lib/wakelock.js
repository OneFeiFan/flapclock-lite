/* 保持屏幕常亮（PRD 7.6）：支持 Wake Lock 的浏览器直接申请；老电视盒子请在系统设置里关闭休眠 */
var lock = null;
export function requestWakeLock() {
  if (!navigator.wakeLock || lock) return;
  navigator.wakeLock.request('screen').then(function (l) { lock = l; l.addEventListener('release', function () { lock = null; }); }).catch(function () { lock = null; });
}
document.addEventListener('visibilitychange', function () { if (!document.hidden && lock === null && requestWakeLock.wanted) requestWakeLock(); });
export function keepAwake() { requestWakeLock.wanted = true; requestWakeLock(); }
