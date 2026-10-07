<template>
  <div class="se-mask" @click.self="tryClose">
    <div class="se rm">
      <header class="se-top">
        <input v-model="name" class="se-name" type="text" maxlength="16" placeholder="方案名称">
        <button class="se-x" aria-label="关闭" @click="tryClose">✕</button>
      </header>
      <div v-if="locked" class="se-lock">正在用于「{{ lockedBy }}」：前 {{ locked }} 行已经开始或结束，不能修改，也不能在它们前面插入；其余修改保存后立即生效。</div>

      <div class="se-head"><span class="c-no">级别</span><span class="c-n">小盲</span><span class="c-n">大盲</span><span class="c-n">前注</span><span class="c-mn">时长(分)</span><span class="c-x"></span></div>
      <div ref="body" class="se-body">
        <div v-for="(r, i) in rows" :key="r.key" class="se-row"
          :class="{ 'is-lock': i < locked, 'is-brk': r.type === 'break', 'is-reg': r.regEnd, 'is-sel': i === selected }">
          <template v-if="r.type === 'level'">
            <button class="c-no" @click="select(i)">{{ levelNo(i) }}</button>
            <input class="c-n" type="text" inputmode="numeric" :value="r.sb" :disabled="i < locked" @input="setNum(r, 'sb', $event)">
            <input class="c-n" type="text" inputmode="numeric" :value="r.bb" :disabled="i < locked" @input="setNum(r, 'bb', $event)">
            <input class="c-n" type="text" inputmode="numeric" placeholder="–" :value="r.ante || ''" :disabled="i < locked" @input="setNum(r, 'ante', $event)">
          </template>
          <button v-else class="c-brk" @click="select(i)"><span class="cup">☕</span>{{ r.regEnd ? '截止买入休息' : '休息' }}</button>
          <input class="c-mn" type="text" inputmode="numeric" :value="r.minutes" :disabled="i < locked" @input="setNum(r, 'minutes', $event)">
          <button class="c-x" :disabled="i < locked || !canDelete(i)" aria-label="删除这一行" @click="remove(i)">✕</button>
        </div>
      </div>

      <div class="se-add">
        <button :disabled="full" @click="addLevel">＋ 添加级别</button>
        <button :disabled="full" @click="addBreak(false)">＋ 添加休息</button>
        <button :disabled="full || hasRegEnd" @click="addBreak(true)">＋ 截止买入休息</button>
      </div>
      <div class="se-tip">{{ selected >= 0 ? '新增的行会插在选中的第 ' + (selected + 1) + ' 行下面（再点一次取消选中）' : '点一下级别号选中一行，新增的行会插在它下面；不选则加在最后' }}</div>

      <footer class="se-foot">
        <div class="se-meta">{{ rows.length }} / {{ MAX_ROWS }} 行 · {{ plays }} 级 · 约 {{ hoursText }}</div>
        <div v-if="problem || error" class="se-err">
          {{ problem || error }}
          <button v-if="conflict" class="rm-mini" @click="reload">重新加载</button>
        </div>
        <div class="se-btns">
          <button v-if="scheme && canSaveAs" class="rm-btn" :disabled="saving || !!problem" @click="saveAs">另存为新方案</button>
          <button class="rm-btn is-primary" :disabled="saving || !!problem || !dirty" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
        </div>
      </footer>

      <div v-if="asking" class="se-ask">
        <div class="box">
          <p>有修改还没有保存，确定关闭吗？</p>
          <div class="rm-acts"><button class="rm-btn" @click="asking = false">继续编辑</button><button class="rm-btn is-danger" @click="$emit('close')">放弃修改</button></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
/*
 * 盲注结构悬浮编辑页（参考 ThePokerTimer 的 Edit blind structure）。
 *  - 每行：级别 | 小盲 | 大盲 | 前注 | 时长（分钟）| 删除；休息行只有时长；
 *  - 添加级别会按前两级的涨幅推算并取整到常用面额，时长沿用上一级；选中一行后新增的行插在它下面；
 *  - 方案正被进行中的比赛使用时，前面已开始的行锁定（置灰），每 5 秒刷新一次锁定范围，保存以服务端校验为准。
 */
import api from '@/lib/api';
import { MAX_ROWS, MAX_SCHEMES, structureError } from '@shared/structure.mjs';

var NICE = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
/** 取整到常用面额：1、1.2、1.5、2、2.5、3、4、5、6、8 × 10 的若干次方 */
function niceRound(v) {
  if (!(v > 0)) return 0;
  var e = Math.pow(10, Math.floor(Math.log(v) / Math.LN10)), best = NICE[0] * e;
  NICE.forEach(function (s) { if (Math.abs(s * e - v) < Math.abs(best - v)) best = s * e; });
  return Math.round(best);
}
var keySeq = 0;
function rowOf(e) {
  return { key: 'r' + (++keySeq), id: e.id || null, type: e.type === 'break' ? 'break' : 'level', sb: e.sb || 0, bb: e.bb || 0, ante: e.ante || 0,
    minutes: e.minutes || 20, regEnd: !!e.regEnd, note: e.note || '' };
}
function plain(rows) {
  return rows.map(function (r) {
    var o = { type: r.type, minutes: r.minutes, note: r.note };
    if (r.id) o.id = r.id;
    if (r.type === 'break') o.regEnd = r.regEnd; else { o.sb = r.sb; o.bb = r.bb; o.ante = r.ante; }
    return o;
  });
}

export default {
  name: 'SchemeEditor',
  props: { scheme: { type: Object, default: null }, count: { type: Number, default: 0 } },
  data: function () {
    var s = this.scheme;
    var rows = s ? s.levels.map(rowOf) : [rowOf({ type: 'level', sb: 100, bb: 200, ante: 0, minutes: 20 })];
    return { MAX_ROWS: MAX_ROWS, name: s ? s.name : '新方案', endMode: s ? s.endMode : 'overtime', rows: rows, baseVersion: s ? s.version : null,
      usedBy: s ? s.usedBy || [] : [], selected: -1, saving: false, error: '', conflict: false, asking: false, initial: '' };
  },
  computed: {
    running: function () { return this.usedBy.filter(function (u) { return u.locked > 0; }); },
    locked: function () { return this.running.reduce(function (n, u) { return Math.max(n, u.locked); }, 0); },
    lockedBy: function () { return this.running.map(function (u) { return u.name; }).join('」「'); },
    plays: function () { return this.rows.filter(function (r) { return r.type === 'level'; }).length; },
    hasRegEnd: function () { return this.rows.some(function (r) { return r.regEnd; }); },
    full: function () { return this.rows.length >= MAX_ROWS; },
    canSaveAs: function () { return this.count < MAX_SCHEMES; },
    hoursText: function () {
      var m = this.rows.reduce(function (t, r) { return t + (+r.minutes || 0); }, 0), h = Math.floor(m / 60);
      return (h ? h + ' 小时 ' : '') + (m % 60) + ' 分';
    },
    snapshot: function () { return JSON.stringify([this.name, this.endMode, plain(this.rows)]); },
    dirty: function () { return !this.scheme || this.snapshot !== this.initial; },
    /** 前端先查一遍（与服务端同一套规则），有问题时不让保存 */
    problem: function () {
      if (!this.name.trim()) return '请给方案起个名字';
      var err = structureError(plain(this.rows));
      if (err) return err;
      for (var i = 0; i < this.rows.length; i++) {
        var r = this.rows[i];
        if (!(r.minutes >= 1 && r.minutes <= 120)) return '第 ' + (i + 1) + ' 行：时长要在 1～120 分钟之间';
        if (r.type === 'level' && !(r.bb > 0)) return '第 ' + (i + 1) + ' 行：请填写大盲';
        if (r.type === 'level' && r.sb > r.bb) return '第 ' + (i + 1) + ' 行：小盲不能大于大盲';
      }
      return '';
    }
  },
  created: function () { this.initial = this.snapshot; },
  mounted: function () {
    var self = this;
    if (this.scheme) this.poll = setInterval(function () { self.refreshLock(); }, 5000);
  },
  beforeDestroy: function () { clearInterval(this.poll); },
  methods: {
    levelNo: function (i) { var n = 0; for (var k = 0; k <= i; k++) if (this.rows[k].type === 'level') n++; return n; },
    select: function (i) { this.selected = this.selected === i ? -1 : i; },
    setNum: function (r, k, ev) {
      var v = String(ev.target.value).replace(/[^0-9]/g, '');
      r[k] = v === '' ? 0 : Math.min(1e9, parseInt(v, 10));
      if (ev.target.value !== String(v)) ev.target.value = v;
    },
    canDelete: function (i) { return this.rows[i].type === 'break' || this.plays > 1; },
    /** 插入位置：选中行的下面，否则末尾；不能插在锁定的行前面 */
    insertAt: function () { var at = this.selected >= 0 ? this.selected + 1 : this.rows.length; return Math.max(at, this.locked); },
    insert: function (row) {
      var at = this.insertAt(); this.rows.splice(at, 0, row);
      if (this.selected >= 0) this.selected = at;
      var self = this;
      this.$nextTick(function () { var el = self.$refs.body && self.$refs.body.children[at]; if (el && el.scrollIntoView) el.scrollIntoView(false); });
    },
    addLevel: function () {
      var at = this.insertAt(), prev = [];
      for (var i = at - 1; i >= 0 && prev.length < 2; i--) if (this.rows[i].type === 'level') prev.push(this.rows[i]);
      var b = prev[0], a = prev[1], bb, ante, minutes = b ? b.minutes : 20;
      if (!b) bb = 200;
      else {
        var ratio = a && a.bb > 0 ? b.bb / a.bb : 1.5;
        if (!(ratio >= 1.1 && ratio <= 2.5)) ratio = 1.5;
        bb = niceRound(b.bb * ratio); if (bb <= b.bb) bb = niceRound(b.bb * 1.5);
      }
      ante = b && b.ante ? (b.ante === b.bb ? bb : niceRound(b.ante * bb / b.bb)) : 0;
      this.insert(rowOf({ type: 'level', sb: niceRound(bb / 2), bb: bb, ante: ante, minutes: minutes }));
    },
    addBreak: function (regEnd) { this.insert(rowOf({ type: 'break', minutes: regEnd ? 15 : 10, regEnd: regEnd, note: regEnd ? '截止买入' : '' })); },
    remove: function (i) {
      this.rows.splice(i, 1);
      if (this.selected === i) this.selected = -1; else if (this.selected > i) this.selected--;
    },
    refreshLock: function () {
      var self = this;
      api.get('/api/schemes').then(function (list) {
        var s = list.find(function (x) { return x.id === self.scheme.id; });
        if (s) self.usedBy = s.usedBy || [];
      }).catch(function () {});
    },
    fail: function (e) {
      this.error = e.message; this.conflict = e.code === 'conflict';
      if (e.code === 'locked' && this.scheme) this.refreshLock();
    },
    body: function () { return { name: this.name.trim(), endMode: this.endMode, levels: plain(this.rows) }; },
    save: function () {
      var self = this; this.saving = true; this.error = ''; this.conflict = false;
      var req = this.scheme
        ? api.put('/api/schemes/' + this.scheme.id, Object.assign(this.body(), { baseVersion: this.baseVersion }))
        : api.post('/api/schemes', this.body());
      req.then(function (s) { self.$emit('saved', s, self.scheme ? '方案已保存' : '方案已创建'); })
        .catch(function (e) { self.fail(e); })
        .then(function () { self.saving = false; });
    },
    saveAs: function () {
      var self = this, b = this.body(); this.saving = true; this.error = '';
      b.name = (b.name + ' 副本').slice(0, 16);
      b.levels = b.levels.map(function (x) { var o = Object.assign({}, x); delete o.id; return o; });
      api.post('/api/schemes', b).then(function (s) { self.$emit('saved', s, '已另存为「' + s.name + '」'); })
        .catch(function (e) { self.fail(e); })
        .then(function () { self.saving = false; });
    },
    reload: function () {
      var self = this;
      api.get('/api/schemes').then(function (list) {
        var s = list.find(function (x) { return x.id === self.scheme.id; });
        if (!s) { self.error = '这套方案已被删除'; return; }
        self.name = s.name; self.endMode = s.endMode; self.rows = s.levels.map(rowOf); self.baseVersion = s.version; self.usedBy = s.usedBy || [];
        self.initial = self.snapshot; self.error = ''; self.conflict = false; self.selected = -1;
      });
    },
    tryClose: function () { if (this.dirty && this.scheme) this.asking = true; else this.$emit('close'); }
  }
};
</script>

<style lang="scss">
@import '@/styles/remote.scss';
.se-mask { position: fixed; left: 0; top: 0; right: 0; bottom: 0; z-index: 70; background: rgba(0, 0, 0, .72);
  display: -webkit-flex; display: flex; -webkit-align-items: center; align-items: center; -webkit-justify-content: center; justify-content: center; }
/* 借用遥控页公共样式（rm）里的表单样式，但不要它的整屏最小高度和底部留白 */
.se.rm { min-height: 0; padding-bottom: 10px; }
.se { position: relative; width: 100%; height: 100%; max-width: 760px; min-height: 0; padding: 0 0 10px;
  display: -webkit-flex; display: flex; -webkit-flex-direction: column; flex-direction: column; }
.se-top { -webkit-flex: none; flex: none; display: -webkit-flex; display: flex; -webkit-align-items: center; align-items: center; padding: 10px 12px; border-bottom: 1px solid $rule; }
.se .se-name { -webkit-flex: 1; flex: 1; min-width: 0; font-size: 18px; font-weight: 900; background: transparent; border-color: transparent; padding-left: 4px; }
.se-x { width: 40px; height: 40px; margin-left: 8px; border: 0; background: transparent; color: $print; font-size: 22px; cursor: pointer; }
.se-lock { -webkit-flex: none; flex: none; margin: 8px 12px 0; padding: 8px 10px; border-left: 3px solid $warn; background: #1A1608; color: $warn; font-size: 12px; line-height: 1.6; }
.se-head, .se-row { display: -webkit-flex; display: flex; -webkit-align-items: center; align-items: center; padding: 0 8px; }
.se-head { -webkit-flex: none; flex: none; height: 34px; font-size: 12px; color: $print; border-bottom: 1px solid $rule; }
.se-body { -webkit-flex: 1; flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; }
.se-row { min-height: 50px; border-bottom: 1px solid #1A1A1A; }
.se .c-no { width: 36px; -webkit-flex: none; flex: none; text-align: center; }
.se .c-n, .se .c-mn { -webkit-flex: 1; flex: 1; min-width: 0; margin: 0 3px; }
.se .c-mn { -webkit-flex: .8; flex: .8; }
.se .c-x { width: 34px; -webkit-flex: none; flex: none; }
.se-head .c-n, .se-head .c-mn { text-align: center; }
.se-row input.c-n, .se-row input.c-mn { height: 36px; padding: 0 4px; text-align: center; font-family: $num; font-weight: 800; font-size: 18px; }
.se-row input:disabled { color: #5A5A58; background: transparent; border-color: #1A1A1A; }
.se-row button.c-no { height: 36px; border: 0; background: transparent; color: $white; font-family: $num; font-weight: 800; font-size: 18px; cursor: pointer; padding: 0; }
.se-row .c-brk { -webkit-flex: 3.2; flex: 3.2; min-width: 0; height: 36px; margin-left: 36px; border: 0; background: transparent; color: $warn; text-align: center; font-size: 15px; font-weight: 900; letter-spacing: .08em; cursor: pointer; }
.se-row .c-brk .cup { margin-right: 8px; }
.se-row.is-reg .c-brk { color: $stop; }
.se-row .c-x { height: 34px; border: 1px solid #3A1A18; border-radius: 4px; background: transparent; color: $stop; font-size: 15px; cursor: pointer; }
.se-row .c-x:disabled { opacity: .2; }
.se-row.is-lock { opacity: .55; }
.se-row.is-sel { background: #1C1C1C; box-shadow: inset 3px 0 0 $white; }
.se-add { -webkit-flex: none; flex: none; display: -webkit-flex; display: flex; padding: 10px 8px 0; }
.se-add button { -webkit-flex: 1; flex: 1; height: 40px; margin: 0 3px; border: 1px solid $rule; border-radius: 4px; background: transparent; color: $stop; font-size: 13px; font-weight: 700; cursor: pointer; }
.se-add button:first-child { color: $white; }
.se-add button:nth-child(2) { color: $warn; }
.se-add button:disabled { opacity: .3; }
.se-tip { -webkit-flex: none; flex: none; padding: 6px 12px 0; font-size: 12px; color: #6A6A68; }
.se-foot { -webkit-flex: none; flex: none; padding: 10px 12px 0; border-top: 1px solid $rule; margin-top: 10px; }
.se-meta { font-size: 12px; color: $print; }
.se-err { margin-top: 6px; color: $warn; font-size: 13px; line-height: 1.5; }
.se-btns { margin-top: 10px; display: -webkit-flex; display: flex; -webkit-justify-content: flex-end; justify-content: flex-end; }
.se-btns .rm-btn + .rm-btn { margin-left: 10px; }
.se-ask { position: absolute; left: 0; top: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, .7); display: -webkit-flex; display: flex; -webkit-align-items: center; align-items: center; -webkit-justify-content: center; justify-content: center; }
.se-ask .box { width: 86%; max-width: 360px; padding: 18px; background: #111; border: 1px solid $rule; border-radius: 8px; }
.se-ask p { margin: 0; font-size: 15px; }
@media (min-width: 800px) { .se { height: auto; max-height: 90vh; border: 1px solid $rule; border-radius: 8px; } }
</style>
