/* 引擎与服务端核心逻辑测试：node test/engine.test.js */
import assert from 'assert';
import * as C from '../../shared/clock.mjs';
import { Tournament } from '../tournament.js';

var realNow = Date.now, T0 = 1780000000000, now = T0;
Date.now = function () { return now; };
var passed = 0;
function test(name, fn) { now = T0; fn(); passed++; console.log('  通过  ' + name); }
function fakeStore() { var sent = []; return { sent: sent, saveTournament: function () {}, hub: { broadcastTournament: function () {}, broadcastRoom: function (tid, o) { sent.push(o); } } }; }
function make(levels) {
  var t = Tournament.create({ levels: levels || [
    { type: 'level', sb: 100, bb: 200, ante: 200, minutes: 20 },
    { type: 'level', sb: 200, bb: 400, ante: 400, minutes: 20 },
    { type: 'break', minutes: 15, note: '清小码' },
    { type: 'level', sb: 300, bb: 600, ante: 600, minutes: 20 }
  ] }, fakeStore());
  return t;
}
function cmd(t, type, payload, extra) { return t.submit(Object.assign({ opId: 'op' + Math.random(), type: type, payload: payload, baseVersion: t.version }, extra || {}), '测试'); }
function cur(t) { return C.advance(t.state, t.structure, now); }

console.log('翻牌钟引擎测试');
test('开始后按时间自动升级，并跨过休息', function () {
  var t = make(); cmd(t, 'start');
  now += 20 * 60000 + 5000; assert.strictEqual(cur(t).li, 1);
  now += 20 * 60000; assert.strictEqual(cur(t).li, 2);                 // 进入休息
  assert.ok(C.describe(t.state, t.structure, cur(t), now, t.settings).brk);
});
test('最后一级走完即比赛结束：剩余停在 0、状态为“比赛结束”，不再有超时正计时', function () {
  var t = make(); cmd(t, 'start');
  var L = t.structure.levels, total = L.reduce(function (n, e) { return n + C.entryMs(e); }, 0);
  assert.strictEqual(C.endsAt(t.state, t.structure), T0 + total);
  now = T0 + total - 1000; var c = cur(t);
  assert.strictEqual(c.li, L.length - 1); assert.strictEqual(c.ended, false);
  now = T0 + total + 5 * 60000; c = cur(t);
  assert.strictEqual(c.rem, 0); assert.strictEqual(c.ended, true);
  var d = C.describe(t.state, t.structure, c);
  assert.strictEqual(d.kind, 'finished'); assert.strictEqual(C.STATE_WORD[d.kind], '比赛结束'); assert.strictEqual(d.secs, 0);
});
test('暂停不需要单独记账，恢复后继续从暂停时刻的剩余时间走', function () {
  var t = make(); cmd(t, 'start'); now += 5 * 60000; cmd(t, 'pause');
  now += 7 * 60000; assert.strictEqual(cur(t).rem, 15 * 60000);
  cmd(t, 'resume'); now += 60000; assert.strictEqual(cur(t).rem, 14 * 60000);
});
test('相对命令版本落后时拒绝，避免两人同时按连跳两级', function () {
  var t = make(); cmd(t, 'start'); var v = t.version;
  assert.ok(t.submit({ opId: 'a', type: 'next', baseVersion: v }, '测试').ok);
  var r = t.submit({ opId: 'b', type: 'next', baseVersion: v });
  assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, 'conflict'); assert.strictEqual(cur(t).li, 1);
});
test('同一个 opId 重试只执行一次', function () {
  var t = make(); cmd(t, 'start'); var v = t.version;
  t.submit({ opId: 'x', type: 'add', payload: { deltaMs: 60000 }, baseVersion: v });
  var r = t.submit({ opId: 'x', type: 'add', payload: { deltaMs: 60000 }, baseVersion: v });
  assert.ok(r.duplicate); assert.strictEqual(cur(t).rem, 21 * 60000);
});
test('断网补发的暂停：60 秒内送达且无人改动，按按下时刻生效', function () {
  var t = make(); cmd(t, 'start'); now += 5 * 60000; var pressed = now; now += 20000;
  cmd(t, 'pause', {}, { pressedAt: pressed }); assert.strictEqual(cur(t).rem, 15 * 60000);
});
test('进行中修改结构（简化版规则）：当前级和前面的行锁定，后面的级别可以改，当前级保持已进行的时间', function () {
  var t = make(); cmd(t, 'start'); now += 5 * 60000;
  var copy = function () { return t.structure.levels.map(function (x) { return Object.assign({}, x); }); };
  var lv = copy(); lv[0].minutes = 30;
  assert.throws(function () { t.setStructure(lv, 'overtime'); }, function (e) { return e.code === 'locked'; });
  lv = copy(); lv.unshift({ type: 'level', sb: 50, bb: 100, ante: 0, minutes: 10 });
  assert.throws(function () { t.setStructure(lv, 'overtime'); }, function (e) { return e.code === 'locked'; });
  lv = copy(); lv[3].bb = 700;
  t.setStructure(lv, 'overtime');
  var c = cur(t); assert.strictEqual(c.li, 0); assert.strictEqual(c.rem, 15 * 60000); assert.strictEqual(t.structure.levels[3].bb, 700);
});
test('中文数字读法', function () {
  assert.deepStrictEqual([200, 250, 1200, 1500, 12000, 20000, 24000, 60000, 10, 24].map(C.zhNum),
    ['两百', '两百五十', '一千二', '一千五', '一万二', '两万', '两万四', '六万', '十', '二十四']);
});
Date.now = realNow;
console.log('全部 ' + passed + ' 项通过');
