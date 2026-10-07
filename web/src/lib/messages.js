/* 终端消息列表：服务器下发带进场时刻的消息，各屏按同一时刻计算位置 */
export default function MessageStore() { this.items = []; }
MessageStore.prototype.add = function (m) {
  for (var i = 0; i < this.items.length; i++) if (this.items[i].id === m.id) return;
  this.items.push({ id: m.id, type: m.type, from: m.from || '', text: m.text, startAt: m.startAt, estW: m.estW, gone: false });
};
MessageStore.prototype.retract = function (id) {
  var self = this;
  this.items.forEach(function (x) { if (x.id === id) x.gone = true; });
  setTimeout(function () { self.remove(id); }, 600);
};
MessageStore.prototype.remove = function (id) {
  for (var i = this.items.length - 1; i >= 0; i--) if (this.items[i].id === id) this.items.splice(i, 1);
};
MessageStore.prototype.clear = function () { this.items.splice(0, this.items.length); };
MessageStore.prototype.prune = function (now, width, speed) {
  for (var i = this.items.length - 1; i >= 0; i--) {
    var m = this.items[i];
    if (now > m.startAt + (width + m.estW + 400) / speed * 1000) this.items.splice(i, 1);
  }
};
