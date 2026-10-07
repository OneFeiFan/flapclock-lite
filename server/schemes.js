/*
 * 盲注方案库：最多 5 套，每套最多 50 行（含休息）。首次启动时是空的。
 * 比赛使用方案时复制一份结构并记住来源；修改方案时同步到正在使用它的比赛：
 * 先逐场校验（进行中的比赛，当前及之前的级别不能动），全部通过才保存，避免“改了一半”。
 */
import crypto from 'crypto';
import * as C from '../shared/clock.mjs';
import * as S from '../shared/structure.mjs';
import { generateStructure, TEMPLATES } from './templates.js';
import { fail } from './tournament.js';

var rid = function (n) { return crypto.randomBytes(n).toString('hex').slice(0, n); };
function str(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }

/**
 * 推荐方案（不保存，用户选择后才加入方案库）：18 级、每级 20 分钟、每 4 级休息 15 分钟。
 * 首次启动时方案库是空的，由用户选择“使用推荐方案”或自己创建。
 */
export var RECOMMENDED_NAME = '推荐方案';   // 级数由列表和下拉框另行显示
export function recommendedLevels() {
  return C.normalizeLevels(generateStructure(TEMPLATES.regular.params));
}

function view(s, usage) {
  var plays = 0, minutes = 0, regEnd = false;
  s.levels.forEach(function (e) { minutes += e.minutes; if (e.type === 'break') { if (e.regEnd) regEnd = true; } else plays++; });
  return { id: s.id, name: s.name, endMode: s.endMode, levels: s.levels, version: s.version, updatedAt: s.updatedAt,
    rows: s.levels.length, plays: plays, minutes: minutes, regEnd: regEnd, usedBy: usage || [] };
}

export class SchemeLibrary {
  constructor(store) {
    this.store = store;
    var saved = store.loadSchemes();
    this.items = Array.isArray(saved) ? saved.map(function (s) { return Object.assign({}, s, { levels: C.normalizeLevels(s.levels) }); }) : [];
  }
  save() { this.store.saveSchemes(this.items); }
  find(id) { return this.items.find(function (s) { return s.id === id; }) || null; }
  get(id) { var s = this.find(id); if (!s) throw fail('notfound', '方案不存在'); return s; }
  /** 正在使用某套方案的比赛 */
  users(id) { return Array.from(this.store.tournaments.values()).filter(function (t) { return t.structure.schemeId === id; }); }
  list() {
    var self = this;
    return this.items.map(function (s) {
      return view(s, self.users(s.id).map(function (t) { return { id: t.id, name: t.settings.name, status: t.state.status, locked: S.lockedCount(t.state.status, t.current().li) }; }));
    });
  }
  view(id) { return this.list().find(function (s) { return s.id === id; }); }

  normalize(input, base) {
    var name = 'name' in input ? str(input.name, 16) : base.name;
    if (!name) throw fail('invalid', '请给方案起个名字');
    var levels = 'levels' in input ? C.normalizeLevels(input.levels) : base.levels;
    var err = S.structureError(levels);
    if (err) throw fail('invalid', err);
    return { name: name, levels: levels, endMode: 'endMode' in input ? (input.endMode === 'stop' ? 'stop' : 'overtime') : base.endMode };
  }

  create(input) {
    if (this.items.length >= S.MAX_SCHEMES) throw fail('limit', '最多保存 ' + S.MAX_SCHEMES + ' 套方案，请先删除一套');
    var n = this.normalize(input || {}, { name: '', levels: [], endMode: 'overtime' });
    var s = { id: 's' + rid(9), name: n.name, endMode: n.endMode, levels: n.levels, version: 1, updatedAt: Date.now() };
    this.items.push(s); this.save();
    return this.view(s.id);
  }

  /** 修改方案并同步到使用它的比赛；baseVersion 用来发现“两个人同时在编辑” */
  update(id, input, issuer) {
    var s = this.get(id);
    input = input || {};
    if (input.baseVersion != null && input.baseVersion !== s.version) throw fail('conflict', '这套方案刚被别人修改过，请重新打开再编辑');
    var n = this.normalize(input, s);
    var users = this.users(id);
    var structureChanged = JSON.stringify(n.levels) !== JSON.stringify(s.levels) || n.endMode !== s.endMode;
    if (structureChanged) users.forEach(function (t) { t.checkStructure(n.levels); });   // 先全部校验，任何一场不通过就整体拒绝
    s.name = n.name; s.levels = n.levels; s.endMode = n.endMode; s.version++; s.updatedAt = Date.now();
    this.save();
    users.forEach(function (t) {
      if (structureChanged) t.setStructure(n.levels, n.endMode, { schemeName: s.name, issuer: issuer });
      else if (t.structure.schemeName !== s.name) { t.structure = Object.assign({}, t.structure, { schemeName: s.name }); t.changed(); }
    });
    return this.view(id);
  }

  duplicate(id) {
    var s = this.get(id);
    var copy = s.levels.map(function (e) { var x = Object.assign({}, e); delete x.id; return x; });   // 副本用新的行 id
    return this.create({ name: (s.name + ' 副本').slice(0, 16), levels: copy, endMode: s.endMode });
  }

  remove(id) {
    this.get(id);
    this.users(id).forEach(function (t) { t.detachScheme(); });
    this.items = this.items.filter(function (s) { return s.id !== id; });
    this.save();
  }

  /** 把方案用到一场比赛上（进行中的比赛同样受锁定规则约束） */
  apply(t, id, issuer) {
    var s = this.get(id);
    t.setStructure(s.levels, s.endMode, { schemeId: s.id, schemeName: s.name, issuer: issuer, apply: true });
  }
}
