/*
 * 实时通道 /ws：
 *  - 大屏（role: display）：按设备编号连接，不需要登录；未绑定时拿到 6 位配对码，绑定后进入对应赛事的房间。
 *  - 管理（role: admin）：手机连接（暂时不需要登录，name 为手机名称），收到在线屏幕列表；watch 某场赛事后收到它的实时快照，并可下发命令。
 * 消息：
 *   客户端 → ping {c0} / hello {role, deviceId | name, tid?} / watch {tid} / cmd {tid, cmd}
 *   服务端 → pong {c0, s} / hello / snap / msg / msgs / retract / ack / presence / display / paired / unpaired / identify / replaced / schemes / tournaments / gone / error
 */
import { WebSocketServer } from 'ws';
import crypto from 'crypto';

function send(ws, obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }

export class Hub {
  constructor(opts) {
    this.store = opts.store; this.store.hub = this;
    this.rooms = new Map();          // tid -> Set<ws>（大屏和正在查看该赛事的手机）
    this.admins = new Set();
    this.displaySockets = new Map(); // deviceId -> ws
    this.codes = new Map();          // 配对码 -> deviceId
    this.wss = new WebSocketServer({ server: opts.server, path: '/ws', maxPayload: 64 * 1024 });
    this.wss.on('connection', (ws) => this.onConnection(ws));
    // WebSocketServer 会转发 HTTP 服务的错误（如端口被占用）；交给 index.js 统一处理，这里不再抛出
    this.wss.on('error', () => {});
    this.timers = [
      setInterval(() => this.keepAlive(), 15000),
      setInterval(() => { var now = Date.now(); this.store.tournaments.forEach((t) => t.pump(now)); }, 100),   // 走字带排期
      setInterval(() => this.store.tournaments.forEach((t) => { if (this.rooms.has(t.id)) this.broadcastRoom(t.id, t.snapshot()); }), 10000)   // 定期全量快照当作心跳
    ];
  }
  close() { this.timers.forEach(clearInterval); this.wss.close(); }

  onConnection(ws) {
    ws.meta = { role: null }; ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (raw) => { var m; try { m = JSON.parse(raw); } catch (e) { return; } this.onMessage(ws, m); });
    ws.on('close', () => this.onClose(ws));
    ws.on('error', () => {});
  }
  keepAlive() { this.wss.clients.forEach((ws) => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; try { ws.ping(); } catch (e) { /* 已断开 */ } }); }

  onMessage(ws, m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'ping') return send(ws, { t: 'pong', c0: m.c0, s: Date.now() });
    if (m.t === 'hello') return this.hello(ws, m);
    if (ws.meta.role !== 'admin') return;
    if (m.t === 'cmd') return this.command(ws, m);
    if (m.t === 'watch') return this.watch(ws, m.tid);
  }

  join(ws, tid) {
    this.leave(ws);
    if (!this.rooms.has(tid)) this.rooms.set(tid, new Set());
    this.rooms.get(tid).add(ws); ws.meta.room = tid;
  }
  leave(ws) { var r = ws.meta.room && this.rooms.get(ws.meta.room); if (r) { r.delete(ws); if (!r.size) this.rooms.delete(ws.meta.room); } ws.meta.room = null; }
  onClose(ws) {
    this.leave(ws); this.admins.delete(ws);
    if (ws.meta.role === 'display' && this.displaySockets.get(ws.meta.deviceId) === ws) {
      this.displaySockets.delete(ws.meta.deviceId);
      if (ws.meta.code) this.codes.delete(ws.meta.code);
      this.presence();
    }
  }

  hello(ws, m) {
    if (m.role === 'display') return this.helloDisplay(ws, m);
    if (m.role === 'admin') {
      var name = String(m.name || '').trim().slice(0, 16) || '手机';
      ws.meta = { role: 'admin', name: name };
      this.admins.add(ws);
      send(ws, { t: 'hello', serverMs: Date.now(), name: name });
      send(ws, { t: 'presence', displays: this.displayList() });
      if (m.tid) this.watch(ws, m.tid);
      return;
    }
    send(ws, { t: 'error', reason: 'forbidden' });
  }

  helloDisplay(ws, m) {
    var id = String(m.deviceId || '').slice(0, 64) || crypto.randomBytes(8).toString('hex');
    var old = this.displaySockets.get(id);
    if (old && old !== ws) { send(old, { t: 'replaced' }); try { old.close(4001, 'replaced'); } catch (e) { /* 已断开 */ } }
    var d = this.store.displays.get(id);
    if (!d) { d = { id: id, name: '', tid: null, createdAt: Date.now() }; this.store.displays.set(id, d); }
    var label = String(m.label || '').slice(0, 24);
    if (label && d.label !== label) d.label = label;
    this.store.saveDisplays();
    ws.meta = { role: 'display', deviceId: id };
    this.displaySockets.set(id, ws);
    var t = d.tid && this.store.tournaments.get(d.tid);
    if (t) {
      this.join(ws, t.id);
      send(ws, { t: 'hello', serverMs: Date.now(), paired: true });
      send(ws, { t: 'display', name: d.name });
      send(ws, t.snapshot()); send(ws, { t: 'msgs', list: t.activeMessages(Date.now()) });
    } else {
      var code = this.issueCode(id); ws.meta.code = code;
      send(ws, { t: 'hello', serverMs: Date.now(), paired: false, code: code });
    }
    this.presence();
  }
  issueCode(id) {
    for (var [c, dev] of this.codes) if (dev === id) return c;
    var code;
    do { code = String(crypto.randomInt(100000, 1000000)); } while (this.codes.has(code));
    this.codes.set(code, id);
    return code;
  }

  command(ws, m) {
    var t = this.store.tournaments.get(String(m.tid || ''));
    if (!t) return send(ws, { t: 'ack', opId: m.cmd && m.cmd.opId, ok: false, reason: 'notfound' });
    var res = t.submit(m.cmd, ws.meta.name);
    send(ws, { t: 'ack', opId: m.cmd && m.cmd.opId, ok: res.ok, reason: res.reason || null, version: t.version, type: m.cmd && m.cmd.type });
  }
  watch(ws, tid) {
    var t = tid && this.store.tournaments.get(String(tid));
    if (!t) { this.leave(ws); return send(ws, { t: 'gone', tid: tid || null }); }
    this.join(ws, t.id);
    send(ws, t.snapshot());
  }

  broadcastRoom(tid, obj) {
    var data = JSON.stringify(obj), r = this.rooms.get(tid);
    if (r) r.forEach((ws) => { if (ws.readyState === 1) ws.send(data); });
  }
  broadcastTournament(t) { this.broadcastRoom(t.id, t.snapshot()); }
  /** 通知所有已登录的手机刷新列表：{t:'schemes'} 方案库变化、{t:'tournaments'} 赛事列表变化 */
  notifyAdmins(obj) { var data = JSON.stringify(obj); this.admins.forEach((ws) => { if (ws.readyState === 1) ws.send(data); }); }

  displayList() {
    var codes = {}; this.codes.forEach((dev, c) => { codes[dev] = c; });
    return Array.from(this.store.displays.values()).map((d) => ({ id: d.id, name: d.name, label: d.label || '', tid: d.tid,
      online: this.displaySockets.has(d.id), code: codes[d.id] || null, createdAt: d.createdAt }))
      .filter((d) => d.tid || d.online)
      .sort((a, b) => b.createdAt - a.createdAt);
  }
  presence() { this.notifyAdmins({ t: 'presence', displays: this.displayList() }); }

  pair(code, tid, name) {
    var dev = this.codes.get(String(code || '').trim());
    if (!dev) throw new Error('配对码不存在或已过期，请看电视上最新的配对码');
    var t = this.store.tournaments.get(tid); if (!t) throw new Error('赛事不存在');
    var d = this.store.displays.get(dev);
    d.tid = t.id; d.name = String(name || '').trim().slice(0, 16) || d.name || ('屏幕 ' + String(code).slice(-3));
    this.codes.delete(String(code)); this.store.saveDisplays();
    var ws = this.displaySockets.get(dev);
    if (ws) { ws.meta.code = null; this.join(ws, t.id); send(ws, { t: 'paired', tid: t.id }); send(ws, { t: 'display', name: d.name }); send(ws, t.snapshot()); send(ws, { t: 'msgs', list: t.activeMessages(Date.now()) }); }
    this.presence();
    return d;
  }
  updateDisplay(id, patch) {
    var d = this.store.displays.get(id); if (!d) throw new Error('屏幕不存在');
    if ('name' in patch) d.name = String(patch.name || '').trim().slice(0, 16);
    if ('tid' in patch && patch.tid !== d.tid) {
      var t = this.store.tournaments.get(patch.tid); if (!t) throw new Error('赛事不存在');
      d.tid = t.id; var ws0 = this.displaySockets.get(d.id); if (ws0) { this.join(ws0, t.id); send(ws0, t.snapshot()); send(ws0, { t: 'msgs', list: t.activeMessages(Date.now()) }); }
    }
    this.store.saveDisplays();
    var ws = this.displaySockets.get(d.id); if (ws) send(ws, { t: 'display', name: d.name });
    this.presence();
    return d;
  }
  identify(id) {
    var d = this.store.displays.get(id); if (!d) throw new Error('屏幕不存在');
    var ws = this.displaySockets.get(id); if (!ws) throw new Error('这块屏幕不在线');
    send(ws, { t: 'identify', name: d.name || '未命名屏幕' });
  }
  unpair(id) {
    var d = this.store.displays.get(id); if (!d) throw new Error('屏幕不存在');
    d.tid = null; this.store.saveDisplays();
    var ws = this.displaySockets.get(id);
    if (ws) { this.leave(ws); var code = this.issueCode(id); ws.meta.code = code; send(ws, { t: 'unpaired', code: code }); }
    else this.store.displays.delete(id);
    this.presence();
  }
  forgetTournament(tid) {
    this.store.displays.forEach((d) => { if (d.tid === tid) this.unpair(d.id); });
    var r = this.rooms.get(tid); if (r) r.forEach((ws) => { if (ws.meta.role === 'admin') { send(ws, { t: 'gone', tid: tid }); this.leave(ws); } });
  }
}
