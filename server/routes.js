/*
 * REST 接口。暂时不需要登录：任何能访问这个地址的设备都能操作（局域网内使用）。
 * 操作人名称取自请求头 X-Client（手机本地生成、可修改，按 encodeURIComponent 编码），没有时记为“手机”。
 * 错误统一返回 { error: 给用户看的原因, code }，code 为 conflict / locked / invalid / limit / notfound。
 */
import { Tournament } from './tournament.js';
import { generateStructure, listTemplates } from './templates.js';
import { RECOMMENDED_NAME, recommendedLevels } from './schemes.js';

var STATUS = { conflict: 409, locked: 409, notfound: 404, limit: 400, invalid: 400 };

export function registerRoutes(app, ctx) {
  var store = ctx.store, hub = ctx.hub, schemes = ctx.schemes;
  /** 操作人：手机名称（日志里显示） */
  var client = function (req, res, next) {
    var raw = req.get('x-client') || '';
    try { raw = decodeURIComponent(raw); } catch (e) { /* 不是编码过的就原样用 */ }
    req.who = String(raw).trim().slice(0, 16) || '手机';
    next();
  };
  var wrap = function (fn) {
    return function (req, res) {
      try { fn(req, res); }
      catch (e) { res.status(STATUS[e.code] || 400).json({ error: e.message || '请求有误', code: e.code || 'invalid' }); }
    };
  };
  var find = function (id) { var t = store.tournaments.get(id); if (!t) { var e = new Error('赛事不存在'); e.code = 'notfound'; throw e; } return t; };
  var listChanged = function () { hub.notifyAdmins({ t: 'tournaments' }); };
  var schemesChanged = function () { hub.notifyAdmins({ t: 'schemes' }); };
  var screensOf = function (tid) { return hub.displayList().filter(function (d) { return d.tid === tid; }).length; };

  app.get('/api/time', function (req, res) { res.json({ serverMs: Date.now() }); });

  /* ── 盲注方案库 ── */
  app.get('/api/schemes', client, function (req, res) { res.json(schemes.list()); });
  /** 推荐方案（只返回内容，不保存）：手机上选择“使用推荐方案”后再 POST /api/schemes 保存 */
  app.get('/api/schemes/recommended', client, function (req, res) { res.json({ name: RECOMMENDED_NAME, endMode: 'overtime', levels: recommendedLevels() }); });
  app.post('/api/schemes', client, wrap(function (req, res) { var s = schemes.create(req.body); schemesChanged(); res.json(s); }));
  app.put('/api/schemes/:id', client, wrap(function (req, res) { var s = schemes.update(req.params.id, req.body, req.who); schemesChanged(); res.json(s); }));
  app.post('/api/schemes/:id/duplicate', client, wrap(function (req, res) { var s = schemes.duplicate(req.params.id); schemesChanged(); res.json(s); }));
  app.delete('/api/schemes/:id', client, wrap(function (req, res) { schemes.remove(req.params.id); schemesChanged(); listChanged(); res.json({ ok: true }); }));
  app.get('/api/templates', client, function (req, res) { res.json(listTemplates()); });
  app.post('/api/structures/generate', client, wrap(function (req, res) { res.json({ levels: generateStructure(req.body) }); }));

  /* ── 赛事 ── */
  app.get('/api/tournaments', client, function (req, res) {
    res.json(Array.from(store.tournaments.values()).map(function (t) { return Object.assign(t.summary(), { screens: screensOf(t.id) }); })
      .sort(function (a, b) { return b.createdAt - a.createdAt; }));
  });
  app.post('/api/tournaments', client, wrap(function (req, res) {
    var body = req.body || {};
    var scheme = body.schemeId ? schemes.get(body.schemeId) : schemes.items[0];
    if (!scheme) { var e = new Error('请先创建一套盲注方案'); e.code = 'invalid'; throw e; }
    var t = Tournament.create({ settings: { name: body.name, club: body.club } }, store, scheme);
    store.tournaments.set(t.id, t); store.saveTournament(t); listChanged();
    res.json(t.adminView());
  }));
  app.get('/api/tournaments/:id', client, wrap(function (req, res) { res.json(find(req.params.id).adminView()); }));
  app.delete('/api/tournaments/:id', client, wrap(function (req, res) { var t = find(req.params.id); hub.forgetTournament(t.id); store.removeTournament(t.id); listChanged(); res.json({ ok: true }); }));
  app.put('/api/tournaments/:id/settings', client, wrap(function (req, res) { var t = find(req.params.id); t.updateSettings(req.body, req.who); listChanged(); res.json(t.adminView()); }));
  app.put('/api/tournaments/:id/structure', client, wrap(function (req, res) {
    var t = find(req.params.id), b = req.body || {};
    t.setStructure(b.levels, b.endMode, { baseVersion: b.baseVersion, issuer: req.who }); res.json(t.adminView());
  }));
  app.post('/api/tournaments/:id/scheme', client, wrap(function (req, res) {
    var t = find(req.params.id); schemes.apply(t, req.body && req.body.schemeId, req.who); schemesChanged(); listChanged(); res.json(t.adminView());
  }));
  app.post('/api/tournaments/:id/commands', client, wrap(function (req, res) { res.json(find(req.params.id).submit(req.body && req.body.cmd, req.who)); }));
  app.get('/api/tournaments/:id/log', client, wrap(function (req, res) { res.json(find(req.params.id).recentLog(300).reverse()); }));

  /* ── 屏幕 ── */
  app.get('/api/displays', client, function (req, res) { res.json(hub.displayList()); });
  app.post('/api/displays/pair', client, wrap(function (req, res) { var d = hub.pair(req.body.code, req.body.tid, req.body.name); listChanged(); res.json(d); }));
  app.put('/api/displays/:id', client, wrap(function (req, res) { var d = hub.updateDisplay(req.params.id, req.body || {}); listChanged(); res.json(d); }));
  app.post('/api/displays/:id/identify', client, wrap(function (req, res) { hub.identify(req.params.id); res.json({ ok: true }); }));
  app.delete('/api/displays/:id', client, wrap(function (req, res) { hub.unpair(req.params.id); listChanged(); res.json({ ok: true }); }));
}
