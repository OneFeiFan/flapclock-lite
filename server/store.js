/* 持久化：每个赛事一个 JSON 文件，写入先落临时文件再改名，避免断电写坏 */
import fs from 'fs';
import path from 'path';
import { Tournament } from './tournament.js';

export class Store {
  constructor(dir) {
    this.dir = dir; this.tdir = path.join(dir, 'tournaments');
    fs.mkdirSync(this.tdir, { recursive: true });
    this.tournaments = new Map(); this.displays = new Map(); this.timers = {}; this.dirty = new Set(); this.hub = null;
    this.load();
  }
  load() {
    fs.readdirSync(this.tdir).forEach((f) => {
      if (!f.endsWith('.json')) return;
      try { var data = JSON.parse(fs.readFileSync(path.join(this.tdir, f), 'utf8')); this.tournaments.set(data.id, new Tournament(data, this)); }
      catch (e) { console.error('读取赛事失败', f, e.message); }
    });
    var dp = path.join(this.dir, 'displays.json');
    if (fs.existsSync(dp)) { try { JSON.parse(fs.readFileSync(dp, 'utf8')).forEach((d) => this.displays.set(d.id, d)); } catch (e) { console.error('读取屏幕列表失败', e.message); } }
  }
  writeFile(file, data) { var tmp = file + '.tmp'; fs.writeFileSync(tmp, data); fs.renameSync(tmp, file); }
  saveTournament(t) {
    this.dirty.add(t.id);
    clearTimeout(this.timers[t.id]);
    this.timers[t.id] = setTimeout(() => this.flushTournament(t.id), 400);
  }
  flushTournament(id) {
    var t = this.tournaments.get(id); this.dirty.delete(id);
    if (t) this.writeFile(path.join(this.tdir, id + '.json'), JSON.stringify(t.toJSON()));
  }
  removeTournament(id) { this.tournaments.delete(id); clearTimeout(this.timers[id]); this.dirty.delete(id); try { fs.unlinkSync(path.join(this.tdir, id + '.json')); } catch (e) { /* 已不存在 */ } }
  saveDisplays() {
    clearTimeout(this.timers.__displays);
    this.timers.__displays = setTimeout(() => this.flushDisplays(), 400);
  }
  flushDisplays() {
    var list = Array.from(this.displays.values()).map((d) => ({ id: d.id, name: d.name, label: d.label || '', tid: d.tid, createdAt: d.createdAt }));
    this.writeFile(path.join(this.dir, 'displays.json'), JSON.stringify(list));
  }
  /* 盲注方案库：保存在 data/schemes.json，没有该文件时返回 null（由方案库预置默认方案） */
  loadSchemes() {
    var p = path.join(this.dir, 'schemes.json');
    if (!fs.existsSync(p)) return null;
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { console.error('读取盲注方案失败', e.message); return null; }
  }
  saveSchemes(list) { this.writeFile(path.join(this.dir, 'schemes.json'), JSON.stringify(list)); }
  flushAll() { Array.from(this.dirty).forEach((id) => this.flushTournament(id)); this.flushDisplays(); }
}
