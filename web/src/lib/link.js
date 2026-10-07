/* 与服务器的实时连接：自动重连 + 对时（PRD 5.4）
 * 对时完全基于单调时钟 performance.now()：base = 服务器时间 + 往返时延/2 − 收到时刻，
 * 之后 serverNow() = performance.now() + base，设备系统时间对不对都不影响。 */
export default function Link(opts) {
  this.opts = opts; this.ws = null; this.status = 'connecting'; this.base = null; this.rtt = null;
  this.samples = []; this.retry = 1000; this.closed = false;
  var self = this;
  this.onVis = function () { if (!document.hidden) { self.samples = []; self.burst(5); } };
  document.addEventListener('visibilitychange', this.onVis);
  this.connect();
}
Link.prototype.url = function () { return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'; };
Link.prototype.connect = function () {
  if (this.closed) return;
  var self = this, ws;
  try { ws = new WebSocket(this.url()); } catch (e) { this.schedule(); return; }
  this.ws = ws; this.setStatus('connecting');
  ws.onopen = function () {
    self.retry = 1000; self.setStatus('online');
    self.send(self.opts.hello());
    self.burst(5);
    clearInterval(self.syncTimer);
    self.syncTimer = setInterval(function () { self.burst(3); }, 30000);
    if (self.opts.onOpen) self.opts.onOpen();
  };
  ws.onmessage = function (ev) {
    var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.t === 'pong') { self.sample(m); return; }
    if (m.t === 'hello' && self.base === null && m.serverMs) self.base = m.serverMs - performance.now();
    if (m.t === 'snap' && self.base === null && m.serverMs) self.base = m.serverMs - performance.now();
    if (self.opts.onMessage) self.opts.onMessage(m);
  };
  ws.onclose = function () { clearInterval(self.syncTimer); if (!self.closed) { self.setStatus('offline'); self.schedule(); } };
  ws.onerror = function () { /* 由 onclose 统一处理 */ };
};
Link.prototype.schedule = function () {
  if (this.closed) return;
  var self = this; clearTimeout(this.rt);
  this.rt = setTimeout(function () { self.connect(); }, this.retry);
  this.retry = Math.min(this.retry * 2, 30000);
};
Link.prototype.setStatus = function (s) { this.status = s; if (this.opts.onStatus) this.opts.onStatus(s); };
Link.prototype.send = function (obj) { if (this.ws && this.ws.readyState === 1) { this.ws.send(JSON.stringify(obj)); return true; } return false; };
Link.prototype.burst = function (n) {
  var self = this, i = 0;
  (function one() { if (i++ >= n) return; self.send({ t: 'ping', c0: performance.now() }); setTimeout(one, 250); })();
};
Link.prototype.sample = function (m) {
  var t1 = performance.now(), rtt = t1 - m.c0;
  if (!(rtt >= 0) || rtt > 10000) return;
  this.samples.push({ rtt: rtt, base: m.s + rtt / 2 - t1 });
  if (this.samples.length > 8) this.samples.shift();
  var best = this.samples[0];
  for (var i = 1; i < this.samples.length; i++) if (this.samples[i].rtt < best.rtt) best = this.samples[i];
  this.base = best.base; this.rtt = best.rtt;
};
Link.prototype.serverNow = function () { return performance.now() + (this.base === null ? Date.now() - performance.now() : this.base); };
Link.prototype.close = function () {
  this.closed = true; clearTimeout(this.rt); clearInterval(this.syncTimer);
  document.removeEventListener('visibilitychange', this.onVis);
  if (this.ws) { try { this.ws.close(); } catch (e) { /* 忽略 */ } }
};
