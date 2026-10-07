/* 翻牌钟 · 共享计时引擎（PRD 第 5 章）
 * 纯函数，不做任何 I/O，服务端和各终端共用同一份逻辑，保证所有地方算出同一个时间。
 * 为兼容老电视浏览器，写法保持 ES5 风格（构建时再由 Babel 统一转译）。 */

export var MIN = 60000;
export var MAX_REMAIN = 99 * MIN + 59000;
/* 消息栏几何参数：服务端排期与终端绘制必须一致 */
export var LANE = { width: 1776, speed: 180, lead: 500, gap: 240 };

export var DEFAULT_SETTINGS = {
  name: '新赛事', club: '', theme: 'classic', numberFormat: 'comma', flash: true,
  infoText: '',                                                   // 常驻信息栏，最多 3 行
  marquee: { text: '', enabled: false },                          // 走字灯的常驻循环文字（一次性公告用 notice 命令）
  modules: { next: true, brk: true }
};

export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
export function entryMs(e) { return Math.round((+e.minutes || 0) * MIN); }
export function pad2(n) { return (n < 10 ? '0' : '') + n; }
export function mmss(sec) { sec = Math.max(0, Math.min(sec, 99 * 60 + 59)); return pad2(Math.floor(sec / 60)) + ':' + pad2(sec % 60); }
/* 时长：不足 1 小时显示 分:秒，否则显示 时:分:秒（例如距休息 1:59:56） */
export function hms(sec) { sec = Math.max(0, Math.floor(sec)); if (sec < 3600) return mmss(sec); return Math.floor(sec / 3600) + ':' + pad2(Math.floor(sec % 3600 / 60)) + ':' + pad2(sec % 60); }

var idSeq = 0;
export function newId() {
  idSeq = (idSeq + 1) % 46656;
  return 'L' + Date.now().toString(36) + idSeq.toString(36) + Math.floor(Math.random() * 1296).toString(36);
}

/* 规范化盲注结构：补齐 id、限制取值范围、给级别编号（休息不编号） */
export function normalizeLevels(levels) {
  var n = 0, out = [];
  (levels || []).forEach(function (src) {
    var e = { id: src.id || newId(), type: src.type === 'break' ? 'break' : 'level',
      minutes: clamp(Math.round(+src.minutes || 20), 1, 120), note: String(src.note || '').slice(0, 24) };
    if (e.type === 'break') e.regEnd = !!src.regEnd;   // 截止买入休息
    if (e.type === 'level') {
      e.sb = clamp(Math.round(+src.sb || 0), 0, 1e9);
      e.bb = clamp(Math.round(+src.bb || 0), 0, 1e9);
      e.ante = clamp(Math.round(+src.ante || 0), 0, 1e9);
      e.no = ++n;
    } else e.no = null;
    out.push(e);
  });
  return out;
}
export function levelCount(levels) { var n = 0; for (var i = 0; i < levels.length; i++) if (levels[i].type === 'level') n++; return n; }

export function initialState(structure, at) {
  var first = structure.levels[0];
  return { status: 'pristine', levelIndex: 0, remainingAtAnchorMs: first ? entryMs(first) : 0, anchorServerMs: at };
}

/* 锚点推算：给定服务器时刻，算出当前级别下标与本级剩余毫秒（PRD 5.3） */
export function advance(state, structure, at) {
  var L = structure.levels, last = L.length - 1;
  if (state.status !== 'running' || last < 0) return { li: state.levelIndex, rem: state.remainingAtAnchorMs };
  var li = state.levelIndex, rem = state.remainingAtAnchorMs - (at - state.anchorServerMs);
  while (rem <= 0 && li < last) { li++; rem += entryMs(L[li]); }
  if (rem < 0 && li === last && structure.endMode === 'stop') rem = 0;
  return { li: li, rem: rem };
}

/* 命令权限：director 仅总监；referee 裁判与总监都可 */
/** 遥控命令（登录后的手机都可以执行） */
export var COMMANDS = { start: 1, resume: 1, pause: 1, next: 1, prev: 1, jump: 1, add: 1, setRemaining: 1, end: 1, reset: 1, notice: 1 };
/* “在当前基础上改变”的命令：版本落后时拒绝，避免两人同时按导致连跳（PRD 5.7） */
export var RELATIVE = { next: 1, prev: 1, jump: 1, add: 1, setRemaining: 1 };
/* 允许按“按下时刻”补记的命令（断网补发，PRD 5.8） */
export var RETRO = { pause: 1 };

export function applyCmd(s, structure, e) {
  var L = structure.levels, last = L.length - 1, cur = advance(s, structure, e.at), p = e.payload || {};
  var n = Object.assign({}, s, { levelIndex: cur.li, remainingAtAnchorMs: cur.rem, anchorServerMs: e.at });
  switch (e.type) {
    case 'start': case 'resume':
      if (s.status !== 'finished') n.status = 'running'; break;
    case 'pause':
      if (s.status === 'running') n.status = 'paused'; break;
    case 'next':
      if (cur.li < last) { n.levelIndex = cur.li + 1; n.remainingAtAnchorMs = entryMs(L[n.levelIndex]); } break;
    case 'prev':
      n.levelIndex = Math.max(0, cur.li - 1); n.remainingAtAnchorMs = entryMs(L[n.levelIndex]); break;
    case 'jump': {
      var i = clamp(p.index | 0, 0, Math.max(0, last));
      n.levelIndex = i; n.remainingAtAnchorMs = p.remainingMs > 0 ? clamp(p.remainingMs, 1000, MAX_REMAIN) : entryMs(L[i]); break;
    }
    case 'add':
      n.remainingAtAnchorMs = clamp(Math.max(cur.rem, 0) + (p.deltaMs | 0), 1000, MAX_REMAIN); break;
    case 'setRemaining':
      n.remainingAtAnchorMs = clamp(p.ms | 0, 1000, MAX_REMAIN); break;
    case 'end':
      n.status = 'finished'; break;
    case 'reset':
      n = initialState(structure, e.at); break;
  }
  return n;
}

/* 事件溯源：从检查点重放日志得到当前状态；撤销 = 该操作“从未发生”（PRD 5.7） */
/** 只记录、不影响计时的日志类型（修改结构、修改设置） */
export var META = { structure: 1, settings: 1, notice: 1 };

export function replay(checkpoint, log, structure) {
  var s = checkpoint.state;
  for (var i = 0; i < log.length; i++) {
    var e = log[i];
    if (e.seq <= checkpoint.seq || META[e.type]) continue;
    s = applyCmd(s, structure, e);
  }
  return s;
}

export function nextLevelAfter(levels, li) { for (var i = li + 1; i < levels.length; i++) if (levels[i].type === 'level') return levels[i]; return null; }

export var STATE_WORD = { run: '进行中', last: '最后一分钟', pause: '暂停', break: '休息中', regEnd: '截止买入', over: '超时',
  stopped: '结构已结束', idle: '未开始', finished: '比赛结束' };
export var STATE_TONE = { run: 'go', last: 'warn', pause: 'stop', break: 'warn', regEnd: 'warn', over: 'stop',
  stopped: 'stop', idle: 'white', finished: 'white' };

/* 把时钟状态翻译成“屏幕上该显示什么” */
export function describe(s, structure, c) {
  var L = structure.levels, e = L[c.li] || null, brk = !!e && e.type === 'break', lastIdx = L.length - 1;
  var over = s.status === 'running' && c.li === lastIdx && c.rem < 0;
  var stopped = s.status === 'running' && c.li === lastIdx && c.rem === 0 && structure.endMode === 'stop';
  var secs = over ? Math.floor(-c.rem / 1000) : Math.max(0, Math.ceil(c.rem / 1000));
  var kind;
  if (s.status === 'finished') kind = 'finished';
  else if (over) kind = 'over';
  else if (stopped) kind = 'stopped';
  else if (s.status === 'paused') kind = 'pause';
  else if (s.status === 'pristine') kind = 'idle';
  else if (brk) kind = e.regEnd ? 'regEnd' : 'break';
  else if (secs <= 60) kind = 'last';
  else kind = 'run';
  return { e: e, brk: brk, over: over, secs: secs, kind: kind, blinds: brk ? nextLevelAfter(L, c.li) : e,
    dim: s.status === 'paused' || s.status === 'finished' };
}

/* 时钟数字：不足 100 分钟显示 分:秒，否则显示 时:分 */
export function clockDigits(secs) {
  if (secs >= 6000) { var h = Math.min(99, Math.floor(secs / 3600)), m = Math.floor(secs % 3600 / 60); return { digits: pad2(h) + pad2(m), hours: true }; }
  return { digits: pad2(Math.floor(secs / 60)) + pad2(secs % 60), hours: false };
}

/* 距下一次休息开始的毫秒数；若当前正在休息，则算到再下一次 */
export function timeToBreak(structure, c, state) {
  var L = structure.levels, acc = Math.max(0, c.rem);
  if (state && state.status === 'pristine') acc = L[c.li] ? entryMs(L[c.li]) : 0;
  for (var j = c.li + 1; j < L.length; j++) { if (L[j].type === 'break') return acc; acc += entryMs(L[j]); }
  return null;
}



/* 数字格式：千分位（58,600）或“万”（5.86万），PRD 7.5 */
export function fmtNum(n, mode) {
  if (n === null || n === undefined || n === '') return '';
  n = +n;
  if (mode === 'wan' && n >= 10000) { var w = Math.round(n / 100) / 100; return String(w) + '万'; }
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/* 中文数字读法：1200 读“一千二”，12000 读“一万二”，250 读“两百五十” */
export function zhNum(n) {
  var D = '零一二三四五六七八九';
  n = Math.round(+n || 0);
  if (n === 0) return '零';
  var sig = String(n).replace(/0+$/, ''), k = String(n).length - 1;
  if (sig.length === 2 && (k === 3 || k === 4)) return (sig[0] === '2' ? '两' : D[+sig[0]]) + (k === 3 ? '千' : '万') + D[+sig[1]];
  function four(x) {
    var u = ['千', '百', '十', ''], d = [Math.floor(x / 1000), Math.floor(x / 100) % 10, Math.floor(x / 10) % 10, x % 10], s = '', zero = false, started = false;
    for (var i = 0; i < 4; i++) {
      var v = d[i];
      if (v === 0) { if (started) zero = true; continue; }
      if (zero) { s += '零'; zero = false; }
      var ch = D[v];
      if (v === 2 && i < 2) ch = '两';
      if (v === 1 && i === 2 && !started) ch = '';
      s += ch + u[i]; started = true;
    }
    return s;
  }
  var w = Math.floor(n / 10000), r = n % 10000, out = '';
  if (w) { out += (w === 2 ? '两' : four(w)) + '万'; if (r && r < 1000) out += '零'; }
  if (r) out += four(r);
  return out === '两百五' ? '两百五十' : out;
}

export var CMD_LABEL = { start: '开始比赛', resume: '继续', pause: '暂停', next: '下一级', prev: '上一级', jump: '跳转级别',
  add: '调整时间', setRemaining: '设定剩余时间', end: '结束比赛', reset: '重置时钟', notice: '公告', structure: '修改盲注结构', settings: '修改设置' };
export function cmdLabel(e) {
  if (!e) return '';
  var p = e.payload || {};
  switch (e.type) {
    case 'add': return (p.deltaMs > 0 ? '加 ' : '减 ') + Math.round(Math.abs(p.deltaMs) / 6000) / 10 + ' 分钟';
    case 'jump': return '跳到第 ' + ((p.index | 0) + 1) + ' 项';
    case 'setRemaining': return '设定剩余 ' + mmss(Math.round((p.ms | 0) / 1000));
    case 'notice': return '公告：' + String(p.text || '').slice(0, 12);
    case 'structure': return p.scheme ? (p.apply ? '使用方案：' : '方案已更新：') + p.scheme : '修改盲注结构';
    case 'settings': return p.what || '修改设置';
    default: return CMD_LABEL[e.type] || e.type;
  }
}

/* 消息宽度估算（设计像素），服务端用它排期，保证前后两条消息之间留出间距 */
export function textW(str, size) {
  var w = 0;
  for (var i = 0; i < str.length; i++) w += /[\u2e80-\u9fff\u3000-\u303f\uff00-\uffef]/.test(str.charAt(i)) ? size : size * 0.56;
  return w;
}

/** 走字带上一段内容的估计宽度（像素）：公告前面带“公告”标签，循环文字没有 */
export function laneWidth(m) {
  return Math.round((m.type === 'notice' ? 114 : 0) + textW(m.text || '', 46) * 1.03 + 12);
}
