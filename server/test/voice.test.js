/* 升盲语音播报规则测试（shared/voice.mjs）与语音设置 */
import assert from 'assert';
import { voiceClip, voicePreload } from '../../shared/voice.mjs';
import { sanitizeSettings, Tournament } from '../tournament.js';
import * as C from '../../shared/clock.mjs';

var passed = 0;
function test(name, fn) { fn(); passed++; console.log('  通过  ' + name); }
var ALL = { events: true, levelOneMin: true, breakOneMin: true, levelFiveMin: true };
var DEF = C.DEFAULT_SETTINGS.voice;
var LV = function (no) { return { type: 'level', no: no }; };
function f(o) { return Object.assign({ tid: 't1', at: 1000, status: 'running', li: 0, rem: 600000, entry: LV(1) }, o); }

console.log('语音播报测试');

test('第一次看到状态（屏幕刚打开或刚重连）不播报', function () {
  assert.strictEqual(voiceClip(null, f({}), ALL), null);
});
test('开赛：未开始变为进行中，念“比赛开始”', function () {
  assert.strictEqual(voiceClip(f({ status: 'pristine' }), f({ at: 1016 }), ALL), 'start');
});
test('升级、休息、截止买入休息：按新的一项念对应的句子', function () {
  assert.strictEqual(voiceClip(f({ li: 5, rem: 10 }), f({ at: 1016, li: 6, entry: LV(7) }), ALL), 'level-07');
  assert.strictEqual(voiceClip(f({ li: 3, rem: 10 }), f({ at: 1016, li: 4, entry: { type: 'break' } }), ALL), 'break');
  assert.strictEqual(voiceClip(f({ li: 3, rem: 10 }), f({ at: 1016, li: 4, entry: { type: 'break', regEnd: true } }), ALL), 'regend');
  assert.strictEqual(voiceClip(f({ li: 50 }), f({ at: 1016, li: 51, entry: LV(51) }), ALL), null, '超过第五十级没有对应的语音');
});
test('剩余时间自然走过一分钟：级别和休息分别念对应的提醒', function () {
  assert.strictEqual(voiceClip(f({ rem: 60010 }), f({ at: 1016, rem: 59994 }), ALL), 'level-1min');
  var brk = { type: 'break' };
  assert.strictEqual(voiceClip(f({ rem: 60010, entry: brk }), f({ at: 1016, rem: 59994, entry: brk }), ALL), 'break-1min');
  assert.strictEqual(voiceClip(f({ rem: 300010 }), f({ at: 1016, rem: 299994 }), ALL), 'level-5min');
  assert.strictEqual(voiceClip(f({ rem: 300010 }), f({ at: 1016, rem: 299994 }), DEF), null, '剩五分钟默认不念');
});
test('手动把剩余时间从 10 分钟设成 30 秒：不是自然走到这一刻，不念“还剩一分钟”', function () {
  assert.strictEqual(voiceClip(f({ rem: 600000 }), f({ at: 1016, rem: 30000 }), ALL), null);
});
test('暂停中不播报；从暂停恢复时不补念', function () {
  assert.strictEqual(voiceClip(f({ status: 'paused', li: 1 }), f({ at: 1016, status: 'paused', li: 2, entry: LV(3) }), ALL), null);
  assert.strictEqual(voiceClip(f({ status: 'paused', rem: 60010 }), f({ at: 1016, rem: 59994 }), ALL), null);
});
test('比赛结束（手动或到点自动结束）念一次“比赛结束”，之后不再重复', function () {
  assert.strictEqual(voiceClip(f({ rem: 10 }), f({ at: 1016, status: 'finished', rem: 0 }), ALL), 'end');
  assert.strictEqual(voiceClip(f({ status: 'finished' }), f({ at: 1032, status: 'finished' }), ALL), null);
});
test('两帧相隔太久（盒子休眠后醒来）或换了比赛：不播报', function () {
  assert.strictEqual(voiceClip(f({ li: 1 }), f({ at: 9000, li: 2, entry: LV(3) }), ALL), null);
  assert.strictEqual(voiceClip(f({ li: 1 }), f({ at: 1016, tid: 't2', li: 2, entry: LV(3) }), ALL), null);
});
test('关闭“开赛、升级、休息、结束”后，这些事件都不念，提醒仍按各自的开关', function () {
  var o = { events: false, levelOneMin: true, breakOneMin: true, levelFiveMin: false };
  assert.strictEqual(voiceClip(f({ status: 'pristine' }), f({ at: 1016 }), o), null);
  assert.strictEqual(voiceClip(f({ li: 1 }), f({ at: 1016, li: 2, entry: LV(3) }), o), null);
  assert.strictEqual(voiceClip(f({ rem: 60010 }), f({ at: 1016, rem: 59994 }), o), 'level-1min');
});
test('预加载：固定句子加上当前及之后两个级别', function () {
  var L = [LV(1), { type: 'break' }, LV(2), LV(3)];
  assert.deepStrictEqual(voicePreload(L, 0).slice(7), ['level-01', 'level-02']);
});
test('语音设置：默认按需求开启，只保留已知的四项；修改记日志“修改语音播报”', function () {
  assert.deepStrictEqual(sanitizeSettings({}).voice, { events: true, levelOneMin: true, breakOneMin: true, levelFiveMin: false });
  assert.deepStrictEqual(sanitizeSettings({ voice: { levelFiveMin: 1, bogus: true } }).voice, { events: true, levelOneMin: true, breakOneMin: true, levelFiveMin: true });
  var store = { saveTournament: function () {}, hub: null };
  var t = Tournament.create({ settings: { name: '测试' } }, store, { id: 's', name: 's', endMode: 'overtime', levels: [{ type: 'level', sb: 1, bb: 2, minutes: 10 }] });
  t.updateSettings({ voice: { levelOneMin: false } }, '手机');
  assert.strictEqual(t.recentLog(1)[0].label, '修改语音播报');
});

console.log('全部 ' + passed + ' 项通过');
