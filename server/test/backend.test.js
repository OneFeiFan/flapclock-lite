/* 简化版后端测试：设置清洗、走字带、结构校验、进行中修改的锁定规则、盲注方案库 */
import assert from 'assert';
import * as C from '../../shared/clock.mjs';
import * as S from '../../shared/structure.mjs';
import { Tournament, sanitizeSettings, sanitizeInfo } from '../tournament.js';
import { SchemeLibrary, recommendedLevels, RECOMMENDED_NAME } from '../schemes.js';

var realNow = Date.now, T0 = 1780000000000, now = T0;
Date.now = function () { return now; };
var passed = 0;
function test(name, fn) { now = T0; fn(); passed++; console.log('  通过  ' + name); }
function throwsCode(fn, code) { try { fn(); } catch (e) { assert.strictEqual(e.code, code, '错误码应为 ' + code + '，实际 ' + e.code + '：' + e.message); return e; } assert.fail('应当抛出 ' + code); }
function fakeStore() { return { tournaments: new Map(), loadSchemes: function () { return null; }, saveSchemes: function () {}, saveTournament: function () {}, hub: null }; }
var LEVELS = [
  { id: 'a', type: 'level', sb: 100, bb: 200, ante: 0, minutes: 20 },
  { id: 'b', type: 'level', sb: 200, bb: 400, ante: 0, minutes: 20 },
  { id: 'c', type: 'break', minutes: 15, regEnd: true },
  { id: 'd', type: 'level', sb: 300, bb: 600, ante: 600, minutes: 20 },
  { id: 'e', type: 'level', sb: 400, bb: 800, ante: 800, minutes: 20 }
];
function copy(levels) { return levels.map(function (x) { return Object.assign({}, x); }); }
function make(store, scheme) { var t = Tournament.create({ settings: { name: '周五赛' } }, store || fakeStore(), scheme || { id: null, name: '', endMode: 'overtime', levels: LEVELS }); if (store) store.tournaments.set(t.id, t); return t; }
function cmd(t, type) { return t.submit({ opId: 'op' + Math.random(), type: type, baseVersion: t.version }, '测试手机'); }
function runToLevel2(t) { cmd(t, 'start'); now += 25 * 60000; }   // 第 2 级已进行 5 分钟

console.log('简化版后端测试');

test('信息栏最多 3 行、每行 24 字；未知设置项被丢弃；信息栏和走字灯的修改分别记日志', function () {
  assert.strictEqual(sanitizeInfo(' 第一行 \n' + '二'.repeat(30) + '\n三\n四\n'), '第一行\n' + '二'.repeat(24) + '\n三');
  var t = make();
  t.updateSettings({ marquee: { text: '欢迎光临', enabled: true } }, '手机');
  t.updateSettings({ infoText: '奖池 10 万' }, '手机');
  t.updateSettings({ marquee: { enabled: false } }, '手机');
  assert.deepStrictEqual(Object.keys(sanitizeSettings({}, { voice: true, startStack: 1 })).sort(), Object.keys(C.DEFAULT_SETTINGS).sort());
  assert.deepStrictEqual(Object.keys(t.settings.marquee).sort(), ['enabled', 'text']);
  assert.deepStrictEqual(t.recentLog(3).map(function (e) { return e.label; }), ['修改走字灯', '修改信息栏', '关闭走字灯']);
});

test('走字带：公告优先；空闲时循环播放常驻文字；改了循环文字立即换上；每级最后 10 秒不放新内容', function () {
  var sent = [], store = fakeStore();
  store.hub = { broadcastRoom: function (tid, o) { sent.push(o); }, broadcastTournament: function () {} };
  var shown = function () { return sent.filter(function (o) { return o.t === 'msg'; }).map(function (o) { return o.m.type + '：' + o.m.text; }); };
  var t = make(store); cmd(t, 'start');
  t.updateSettings({ marquee: { text: '欢迎光临', enabled: true } }, '手机');
  assert.strictEqual(t.submit({ opId: 'n1', type: 'notice', payload: { text: '3 号桌请裁判到场' } }, '手机').ok, true);
  assert.strictEqual(t.submit({ opId: 'n2', type: 'notice', payload: { text: '  ' } }, '手机').reason, 'empty');
  t.pump(now); assert.deepStrictEqual(shown(), ['notice：3 号桌请裁判到场']);
  now = t.laneFreeAt; t.pump(now); assert.deepStrictEqual(shown().slice(-1), ['loop：欢迎光临']);
  t.updateSettings({ marquee: { text: '新的欢迎词' } }, '手机');
  assert.ok(sent.some(function (o) { return o.t === 'retract'; }), '旧的循环文字应当撤下');
  t.pump(now); assert.deepStrictEqual(shown().slice(-1), ['loop：新的欢迎词']);
  now = T0 + 20 * 60000 - 8000; t.laneFreeAt = 0; var n = shown().length; t.pump(now);
  assert.strictEqual(shown().length, n);                                // 第 1 级最后 10 秒被挡住
  assert.strictEqual(t.recentLog(5).filter(function (e) { return e.type === 'notice'; })[0].label, '公告：3 号桌请裁判到场');
});
test('结构校验：至少一个盲注级别、最多 50 行、截止买入休息最多一个', function () {
  assert.ok(S.structureError([]));
  assert.ok(S.structureError([{ type: 'break', minutes: 10 }]));
  var fifty = []; for (var i = 0; i < 51; i++) fifty.push({ type: 'level', sb: 1, bb: 2, minutes: 10 });
  assert.ok(/50/.test(S.structureError(fifty)));
  assert.strictEqual(S.structureError(fifty.slice(0, 50)), null);
  assert.ok(/只能有一个/.test(S.structureError([{ type: 'level', minutes: 10 }, { type: 'break', regEnd: true }, { type: 'break', regEnd: true }])));
});

test('截止买入休息：计时照常按休息处理，状态显示“截止买入”', function () {
  var t = make(); cmd(t, 'start'); now += 41 * 60000;
  var c = C.advance(t.state, t.structure, now), d = C.describe(t.state, t.structure, c);
  assert.strictEqual(t.structure.levels[c.li].regEnd, true);
  assert.strictEqual(d.kind, 'regEnd'); assert.strictEqual(C.STATE_WORD[d.kind], '截止买入');
  assert.strictEqual(C.timeToBreak(t.structure, { li: 0, rem: 20 * 60000 }, t.state), 40 * 60000);
});

test('进行中修改：后面的级别可以改，当前级保持已进行的时间', function () {
  var t = make(); runToLevel2(t);
  var lv = copy(t.structure.levels); lv[3].sb = 350; lv[3].bb = 700; lv.push({ type: 'level', sb: 600, bb: 1200, minutes: 20 });
  t.setStructure(lv, 'overtime', { issuer: '手机' });
  var c = C.advance(t.state, t.structure, now);
  assert.strictEqual(c.li, 1); assert.strictEqual(c.rem, 15 * 60000);
  assert.strictEqual(t.structure.levels[3].bb, 700); assert.strictEqual(t.structure.levels.length, 6);
});

test('进行中修改：当前级、已结束的级别不能改，也不能在前面插入或删除', function () {
  var t = make(); runToLevel2(t);
  var lv = copy(t.structure.levels); lv[1].minutes = 30;
  assert.ok(/第 2 级正在进行/.test(throwsCode(function () { t.setStructure(lv); }, 'locked').message));
  lv = copy(t.structure.levels); lv[0].bb = 250;
  assert.ok(/第 1 级已经结束/.test(throwsCode(function () { t.setStructure(lv); }, 'locked').message));
  lv = copy(t.structure.levels); lv.splice(0, 0, { type: 'level', sb: 50, bb: 100, minutes: 10 });
  throwsCode(function () { t.setStructure(lv); }, 'locked');
  lv = copy(t.structure.levels); lv.splice(0, 1);
  throwsCode(function () { t.setStructure(lv); }, 'locked');
  cmd(t, 'pause'); lv = copy(t.structure.levels); lv[1].minutes = 30;
  throwsCode(function () { t.setStructure(lv); }, 'locked');           // 暂停中同样锁定
});

test('进行中修改：编辑期间比赛升到了被修改的那一级，保存被拒绝', function () {
  var t = make(); runToLevel2(t);
  var lv = copy(t.structure.levels); lv[3].sb = 350;                    // 打开编辑时第 3 级还没开始
  now += 15 * 60000 + 15 * 60000 + 1000;                               // 编辑期间走完第 2 级和休息，进入第 3 级
  assert.ok(/第 3 级正在进行/.test(throwsCode(function () { t.setStructure(lv); }, 'locked').message));
});

test('两个人同时编辑：后保存的结构版本落后，被拒绝', function () {
  var t = make(); var v = t.structure.version;
  var lv = copy(t.structure.levels); lv[4].minutes = 30;
  t.setStructure(lv, 'overtime', { baseVersion: v });
  throwsCode(function () { t.setStructure(copy(t.structure.levels), 'overtime', { baseVersion: v }); }, 'conflict');
});

test('未开始的比赛可以随意修改结构', function () {
  var t = make(); var lv = copy(t.structure.levels); lv.splice(0, 2);
  t.setStructure(lv); assert.strictEqual(t.structure.levels[0].type, 'break');
});

test('方案库：首次启动是空的；推荐方案为 18 级、每 4 级休息；最多 5 套；副本用新的行 id', function () {
  var lib = new SchemeLibrary(fakeStore());
  assert.strictEqual(lib.list().length, 0);
  var rec = recommendedLevels(), plays = rec.filter(function (e) { return e.type === 'level'; });
  assert.strictEqual(plays.length, 18); assert.strictEqual(rec.length - plays.length, 4);
  assert.ok(plays.every(function (e) { return e.minutes === 20; }));
  assert.strictEqual(S.structureError(rec), null);
  var first = lib.create({ name: RECOMMENDED_NAME, levels: rec });
  var dup = lib.duplicate(first.id);
  assert.notStrictEqual(dup.levels[0].id, first.levels[0].id);
  lib.create({ name: '自定义 1', levels: LEVELS }); lib.create({ name: '自定义 2', levels: LEVELS }); lib.create({ name: '自定义 3', levels: LEVELS });
  throwsCode(function () { lib.create({ name: '第六套', levels: LEVELS }); }, 'limit');
  throwsCode(function () { lib.update(lib.items[0].id, { name: '' }); }, 'invalid');
});
test('修改方案：同步到正在使用它的比赛；有一场不满足锁定规则就整体拒绝', function () {
  var store = fakeStore(), lib = new SchemeLibrary(store);
  var scheme = lib.create({ name: '周五方案', levels: LEVELS }), raw = lib.find(scheme.id);
  var running = make(store, raw), fresh = make(store, raw);
  runToLevel2(running);
  var lv = copy(raw.levels); lv[3].sb = 350;
  lib.update(scheme.id, { levels: lv, baseVersion: raw.version }, '手机');
  assert.strictEqual(running.structure.levels[3].sb, 350); assert.strictEqual(fresh.structure.levels[3].sb, 350);
  assert.strictEqual(C.advance(running.state, running.structure, now).rem, 15 * 60000);
  var bad = copy(raw.levels); bad[1].minutes = 30; bad[4].minutes = 30;
  throwsCode(function () { lib.update(scheme.id, { levels: bad }); }, 'locked');
  assert.strictEqual(fresh.structure.levels[4].minutes, 20);           // 整体拒绝：没被锁的那场也没改
  assert.strictEqual(lib.find(scheme.id).levels[1].minutes, 20);
  throwsCode(function () { lib.update(scheme.id, { levels: lv, baseVersion: 1 }); }, 'conflict');
});

test('删除方案：比赛保留自己的结构，只是不再跟随方案更新', function () {
  var store = fakeStore(), lib = new SchemeLibrary(store);
  var s0 = lib.create({ name: '周五方案', levels: LEVELS });
  var t = make(store, lib.find(s0.id)); lib.remove(s0.id);
  assert.strictEqual(t.structure.schemeId, null); assert.ok(t.structure.levels.length > 0);
});

Date.now = realNow;
console.log('全部 ' + passed + ' 项通过');
