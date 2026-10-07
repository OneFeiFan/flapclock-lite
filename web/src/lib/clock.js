/* 终端时钟模型：保存最新快照，任何时刻按锚点现算（不“数秒”，PRD 5.2） */
import { advance, describe } from '@shared/clock.mjs';

export default function ClockModel(link) { this.link = link; this.snap = null; }
ClockModel.prototype.set = function (snap) {
  if (this.snap && this.snap.tid === snap.tid && snap.version < this.snap.version) return false;
  this.snap = snap; return true;
};
ClockModel.prototype.now = function () { return this.link.serverNow(); };
ClockModel.prototype.read = function () {
  var s = this.snap; if (!s || !s.structure || !s.structure.levels.length) return null;
  var now = this.now(), c = advance(s.state, s.structure, now);
  return { s: s, c: c, d: describe(s.state, s.structure, c, now, s.settings), now: now };
};
