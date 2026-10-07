/* 升级闪屏：级别变化的那一刻闪一下（简化版已删除语音播报与提示音） */
export default function Alerts(opts) { this.onFlash = opts.onFlash; this.reset(); }
Alerts.prototype.reset = function () { this.lastLi = null; this.tid = null; };
Alerts.prototype.update = function (r, o) {
  var s = r.s, c = r.c;
  if (this.tid !== s.tid) { this.reset(); this.tid = s.tid; }
  if (this.lastLi !== null && c.li !== this.lastLi && o.flash) this.onFlash();
  this.lastLi = c.li;
};
