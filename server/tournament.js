/*
 * 一场赛事：设置、盲注结构、操作日志与当前状态。
 * 状态由“检查点 + 日志重放”得出（见 shared/clock.mjs 的 replay），所有屏幕和遥控器据此算出同一个时刻。
 * 简化版已删除：人数统计、奖金表、手对手、撤销、选手弹幕与审核、定时自动开赛、语音、两级遥控密钥。
 */
import crypto from 'crypto';
import * as C from '../shared/clock.mjs';
import * as S from '../shared/structure.mjs';

var rid = function (n) { return crypto.randomBytes(n).toString('hex').slice(0, n); };
var MAX_LOG = 3000;
var MAX_QUEUE = 20;

function num(v, lo, hi, dflt) { v = Number(v); if (!isFinite(v)) return dflt; return Math.max(lo, Math.min(hi, Math.round(v))); }
function str(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }
/** 带错误码的业务错误：conflict（版本落后）、locked（进行中不能改）、invalid（不合规）等 */
export function fail(code, message) { var e = new Error(message); e.code = code; return e; }

/** 常驻信息栏：最多 3 行，每行最多 24 字，去掉末尾空行 */
export function sanitizeInfo(v) {
  return String(v == null ? '' : v).replace(/\r/g, '').split('\n')
    .map(function (l) { return l.trim().slice(0, S.INFO_LINE_MAX); }).slice(0, S.INFO_LINES).join('\n').replace(/\n+$/, '');
}

export function sanitizeSettings(input, base) {
  var d = C.DEFAULT_SETTINGS, s = Object.assign({}, d, base || {});
  s.marquee = Object.assign({}, d.marquee, s.marquee);
  s.modules = Object.assign({}, d.modules, s.modules);
  var i = input || {};
  if ('name' in i) s.name = str(i.name, 24) || '未命名赛事';
  if ('club' in i) s.club = str(i.club, 24);
  if ('theme' in i) s.theme = /^[a-z0-9-]{1,24}$/.test(i.theme) ? i.theme : 'classic';
  if ('numberFormat' in i) s.numberFormat = i.numberFormat === 'wan' ? 'wan' : 'comma';
  if ('flash' in i) s.flash = !!i.flash;
  if ('infoText' in i) s.infoText = sanitizeInfo(i.infoText);
  if (i.marquee) {
    if ('text' in i.marquee) s.marquee.text = str(i.marquee.text, S.MARQUEE_MAX);
    if ('enabled' in i.marquee) s.marquee.enabled = !!i.marquee.enabled;
  }
  if (i.modules) Object.keys(d.modules).forEach(function (k) { if (k in i.modules) s.modules[k] = !!i.modules[k]; });
  // 只保留现有的设置项（旧数据里已删除的项不再带着走）
  [[s, d], [s.marquee, d.marquee], [s.modules, d.modules]].forEach(function (pair) {
    Object.keys(pair[0]).forEach(function (k) { if (!(k in pair[1])) delete pair[0][k]; });
  });
  return s;
}

function sanitizePayload(type, p) {
  p = p || {};
  switch (type) {
    case 'add': return { deltaMs: num(p.deltaMs, -C.MAX_REMAIN, C.MAX_REMAIN, 0) };
    case 'setRemaining': return { ms: num(p.ms, 1000, C.MAX_REMAIN, 60000) };
    case 'jump': return { index: num(p.index, 0, 1000, 0), remainingMs: p.remainingMs ? num(p.remainingMs, 1000, C.MAX_REMAIN, 0) : 0 };
    case 'notice': return { text: str(p.text, 40) };
    default: return {};
  }
}

export class Tournament {
  constructor(data, store) {
    this.store = store;
    this.id = data.id; this.createdAt = data.createdAt;
    this.settings = sanitizeSettings(data.settings);
    var st = data.structure || {};
    this.structure = { version: st.version || 1, endMode: st.endMode === 'stop' ? 'stop' : 'overtime', levels: C.normalizeLevels(st.levels),
      schemeId: st.schemeId || null, schemeName: st.schemeName || '' };
    this.log = data.log || [];
    this.seq = data.seq || 0;
    this.version = data.version || 1;
    this.checkpoint = data.checkpoint;
    this.seen = new Set(this.log.slice(-500).map(function (e) { return e.opId; }));
    this.state = C.replay(this.checkpoint, this.log, this.structure);
    this.queue = data.queue || [];      // 排队待播的一次性公告
    this.active = [];                   // 正在走字的内容（公告或循环文字）
    this.laneFreeAt = 0; this.quietUntil = 0; this.lastLi = undefined;
  }

  /** 新建赛事：结构复制自方案（保留每行的 id，以后方案更新时能对上） */
  static create(input, store, scheme) {
    input = input || {};
    var now = Date.now();
    var levels = C.normalizeLevels(scheme ? scheme.levels : input.levels);
    var err = S.structureError(levels);
    if (err) throw fail('invalid', err);
    var structure = { version: 1, endMode: scheme ? scheme.endMode : 'overtime', levels: levels,
      schemeId: scheme ? scheme.id : null, schemeName: scheme ? scheme.name : '' };
    return new Tournament({
      id: rid(10), createdAt: now, settings: sanitizeSettings(input.settings), structure: structure,
      log: [], seq: 0, version: 1, checkpoint: { seq: 0, state: C.initialState(structure, now) }
    }, store);
  }

  toJSON() {
    return { id: this.id, createdAt: this.createdAt, settings: this.settings, structure: this.structure,
      log: this.log.slice(-MAX_LOG), seq: this.seq, version: this.version, checkpoint: this.checkpoint, queue: this.queue };
  }
  current(now) { var c = C.advance(this.state, this.structure, now || Date.now()); return { li: c.li, rem: c.rem, entry: this.structure.levels[c.li] || null }; }
  summary() {
    var cur = this.current(), e = cur.entry;
    return { id: this.id, name: this.settings.name, club: this.settings.club, createdAt: this.createdAt, status: this.state.status,
      level: e ? S.rowLabel(e) : '', schemeId: this.structure.schemeId, schemeName: this.structure.schemeName };
  }
  adminView() {
    return { id: this.id, createdAt: this.createdAt, settings: this.settings, structure: this.structure,
      version: this.version, state: this.state, locked: S.lockedCount(this.state.status, this.current().li), serverMs: Date.now() };
  }
  snapshot() {
    return { t: 'snap', tid: this.id, version: this.version, state: this.state, structure: this.structure, settings: this.settings,
      recent: this.recentLog(8), serverMs: Date.now() };
  }
  recentLog(n) {
    return this.log.slice(-n).map(function (e) { return { seq: e.seq, type: e.type, payload: e.payload, at: e.at, issuer: e.issuer, label: C.cmdLabel(e) }; });
  }

  changed() {
    this.version++;
    this.store.saveTournament(this);
    if (this.store.hub) this.store.hub.broadcastTournament(this);
  }
  lastAt() { return this.log.length ? this.log[this.log.length - 1].at : 0; }
  /** 记一条不影响计时的日志（修改结构、修改设置） */
  logMeta(type, payload, issuer) {
    this.seq++;
    var e = { seq: this.seq, opId: rid(12), type: type, payload: payload, at: Date.now(), issuer: issuer || '遥控' };
    this.log.push(e); this.seen.add(e.opId);
    if (this.log.length > MAX_LOG + 500) this.log.splice(0, 500);
    return e;
  }

  /** 执行一条遥控命令：opId 去重、相对命令版本检查、断网补发的暂停按按下时刻生效 */
  submit(cmd, issuer) {
    cmd = cmd || {};
    var type = cmd.type;
    if (!C.COMMANDS[type]) return { ok: false, reason: 'unknown' };
    if (cmd.opId && this.seen.has(cmd.opId)) return { ok: true, duplicate: true, version: this.version };
    if (C.RELATIVE[type] && cmd.baseVersion !== this.version) return { ok: false, reason: 'conflict', version: this.version };
    var now = Date.now(), at = now;
    if (C.RETRO[type] && cmd.pressedAt && now - cmd.pressedAt < 60000 && cmd.pressedAt <= now && cmd.baseVersion === this.version)
      at = Math.max(cmd.pressedAt, this.lastAt());
    var e = { seq: this.seq + 1, opId: str(cmd.opId, 64) || rid(12), type: type, payload: sanitizePayload(type, cmd.payload), at: at, issuer: issuer || '遥控' };
    if (type === 'notice') {
      if (!e.payload.text) return { ok: false, reason: 'empty' };
      this.enqueue({ type: 'notice', text: e.payload.text, from: e.issuer });
    }
    this.seq = e.seq;
    this.log.push(e); this.seen.add(e.opId);
    if (this.log.length > MAX_LOG + 500) this.log.splice(0, 500);
    this.state = C.replay(this.checkpoint, this.log, this.structure);
    this.changed();
    return { ok: true, version: this.version, entry: e };
  }

  /**
   * 检查一套新结构能否用在这场比赛上：合规、（可选）结构版本没有落后、进行中时前面的行没被改动。
   * 通过返回规范化后的结构；不通过抛出带错误码的业务错误。不修改任何状态。
   */
  checkStructure(levels, baseVersion) {
    var next = C.normalizeLevels(levels);
    var err = S.structureError(next);
    if (err) throw fail('invalid', err);
    if (baseVersion != null && baseVersion !== this.structure.version)
      throw fail('conflict', '盲注结构刚被别人修改过，请重新打开再编辑');
    var cur = this.current();
    var violation = S.lockViolation(this.structure.levels, next, S.lockedCount(this.state.status, cur.li));
    if (violation) throw fail('locked', '「' + this.settings.name + '」' + violation);
    return next;
  }

  /** 修改盲注结构：先校验；按级别 id 找回当前级，保住已进行的时间 */
  setStructure(levels, endMode, opts) {
    opts = opts || {};
    var next = this.checkStructure(levels, opts.baseVersion);
    var now = Date.now(), cur = C.advance(this.state, this.structure, now);
    var curEntry = this.structure.levels[cur.li];
    var li = 0, rem;
    if (this.state.status === 'pristine') { li = 0; rem = C.entryMs(next[0]); }
    else {
      li = curEntry ? next.findIndex(function (x) { return x.id === curEntry.id; }) : -1;
      if (li < 0) { li = Math.min(cur.li, next.length - 1); rem = C.entryMs(next[li]); }
      else if (cur.rem < 0) rem = cur.rem;                   // 超时正计时中，保持不变
      else {
        var elapsed = C.entryMs(curEntry) - cur.rem;
        rem = C.clamp(C.entryMs(next[li]) - elapsed, 1000, C.MAX_REMAIN);
      }
    }
    this.structure = { version: this.structure.version + 1, endMode: endMode === 'stop' ? 'stop' : 'overtime', levels: next,
      schemeId: 'schemeId' in opts ? opts.schemeId : this.structure.schemeId,
      schemeName: 'schemeName' in opts ? opts.schemeName : this.structure.schemeName };
    var e = this.logMeta('structure', { version: this.structure.version, scheme: this.structure.schemeName || '', apply: !!opts.apply }, opts.issuer);
    this.checkpoint = { seq: e.seq, state: Object.assign({}, this.state, { levelIndex: li, remainingAtAnchorMs: rem, anchorServerMs: now }) };
    this.state = this.checkpoint.state;
    this.changed();
  }

  /** 方案被删除后，比赛保留自己的结构副本，只是不再跟随方案更新 */
  detachScheme() {
    this.structure = Object.assign({}, this.structure, { schemeId: null });
    this.changed();
  }

  /** 修改设置；信息栏、走字灯、其他设置分别记日志。循环文字变化时撤下正在走的旧文字，新内容马上开始 */
  updateSettings(patch, issuer) {
    var before = this.settings, after = sanitizeSettings(patch, before);
    var mq = function (s) { return s.marquee.text + '|' + s.marquee.enabled; };
    if (mq(after) !== mq(before)) this.retractLoops();
    var what = [];
    if (after.infoText !== before.infoText) what.push('修改信息栏');
    if (mq(after) !== mq(before)) what.push(after.marquee.enabled ? '修改走字灯' : '关闭走字灯');
    var other = ['name', 'club', 'theme', 'numberFormat', 'flash'].some(function (k) { return after[k] !== before[k]; }) ||
      JSON.stringify(after.modules) !== JSON.stringify(before.modules);
    if (other) what.push('修改赛事设置');
    this.settings = after;
    if (what.length) this.logMeta('settings', { what: what.join('、') }, issuer);
    this.changed();
  }

  /* ── 走字带：一次性公告排队依次播放；空闲时循环播放常驻文字 ──
   * 每段内容由服务端定好开始时刻（startAt），各屏按同步后的时钟计算位置，所以多块屏同步滚动。 */
  enqueue(m) {
    m.id = 'm' + rid(10); m.estW = C.laneWidth(m); m.createdAt = Date.now();
    this.queue.push(m);
    if (this.queue.length > MAX_QUEUE) this.queue.shift();
    this.store.saveTournament(this);
    return m;
  }
  activeMessages(now) {
    var L = C.LANE;
    return this.active.filter(function (m) { return now < m.startAt + (L.width + m.estW + 400) / L.speed * 1000; });
  }
  /** 撤下正在走的循环文字（内容改了或关掉了）；正在播的公告不受影响 */
  retractLoops() {
    var hub = this.store.hub, id = this.id, keep = [];
    this.active.forEach(function (m) { if (m.type === 'loop') { if (hub) hub.broadcastRoom(id, { t: 'retract', id: m.id }); } else keep.push(m); });
    if (keep.length !== this.active.length) {
      this.active = keep;
      var L = C.LANE;
      this.laneFreeAt = keep.reduce(function (t, m) { return Math.max(t, m.startAt + (m.estW + L.gap) / L.speed * 1000); }, 0);
    }
  }
  /** 每 100ms 调用：升级后留 3 秒安静，每级最后 10 秒不放新内容；先放排队的公告，没有公告时放循环文字 */
  pump(now) {
    var c = C.advance(this.state, this.structure, now), e = this.structure.levels[c.li];
    if (this.lastLi !== undefined && c.li !== this.lastLi) this.quietUntil = now + 3000;
    this.lastLi = c.li;
    var L = C.LANE;
    if (this.active.length && Math.random() < 0.05) this.active = this.activeMessages(now);
    if (now < this.laneFreeAt || now < this.quietUntil) return;
    if (this.state.status === 'running' && e && e.type === 'level' && c.rem > 0 && c.rem <= 10000) return;
    var m, mq = this.settings.marquee;
    if (this.queue.length) { m = this.queue.shift(); this.store.saveTournament(this); }
    else if (mq.enabled && mq.text) { m = { id: 'l' + rid(10), type: 'loop', text: mq.text }; m.estW = C.laneWidth(m); }
    else return;
    m.startAt = now + L.lead;
    this.laneFreeAt = m.startAt + (m.estW + L.gap) / L.speed * 1000;
    this.active.push(m);
    if (this.store.hub) this.store.hub.broadcastRoom(this.id, { t: 'msg', m: { id: m.id, type: m.type, from: m.from || '', text: m.text, startAt: m.startAt, estW: m.estW } });
  }
}
