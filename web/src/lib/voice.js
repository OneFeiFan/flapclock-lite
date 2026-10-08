/*
 * 播放升盲语音包（/voice/*.mp3）。电视 APK 外壳允许网页直接出声；普通浏览器需要先点一下屏幕（大屏页的“进入全屏”就是这一下）。
 * 同一时间只播一句，新的一句会打断上一句；播放失败（比如浏览器还没被点过）时安静地忽略，不影响计时。
 */
var cache = {};
var current = null;

function clip(name) {
  if (!cache[name]) { var a = new Audio('/voice/' + name + '.mp3'); a.preload = 'auto'; cache[name] = a; }
  return cache[name];
}

export function preload(names) { names.forEach(clip); }

export function play(name) {
  var a = clip(name);
  try {
    if (current && current !== a) current.pause();
    a.currentTime = 0;
    var p = a.play();
    if (p && p.catch) p.catch(function () {});
    current = a;
  } catch (e) { /* 老内核上偶尔会抛错，忽略 */ }
}
