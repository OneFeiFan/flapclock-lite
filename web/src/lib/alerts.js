/* 级别变化与语音播报：级别变化的那一刻闪一下；开了语音的屏幕按 shared/voice.mjs 的规则播报对应的句子 */
import { voiceClip } from '@shared/voice.mjs';

var now = function () { return window.performance && performance.now ? performance.now() : Date.now(); };

export default function Alerts(opts) { this.onFlash = opts.onFlash; this.onVoice = opts.onVoice; this.reset(); }
Alerts.prototype.reset = function () { this.lastLi = null; this.tid = null; this.prevFrame = null; };
Alerts.prototype.update = function (r, o) {
  var s = r.s, c = r.c, d = r.d;
  if (this.tid !== s.tid) { this.reset(); this.tid = s.tid; }
  if (this.lastLi !== null && c.li !== this.lastLi && o.flash) this.onFlash();
  this.lastLi = c.li;
  var frame = { tid: s.tid, at: now(), status: d && d.kind === 'finished' ? 'finished' : s.state.status, li: c.li, rem: c.rem, entry: s.structure.levels[c.li] || null };
  var name = o.voice ? voiceClip(this.prevFrame, frame, o.voice) : null;
  this.prevFrame = frame;
  if (name && this.onVoice) this.onVoice(name);
};
