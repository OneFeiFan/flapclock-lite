<template>
  <div class="classic" :class="rootClass">
    <div class="cl-left">
      <!-- 站名牌（移植自时刻表版）：搪瓷蓝底、白色内框、四角铆钉；名称长时自动缩小字号 -->
      <div class="cl-plaque"><span class="zh" :style="plaqueStyle">{{ settings.name || '未命名赛事' }}</span><i></i><i></i><i></i><i></i></div>
      <div v-if="settings.club" class="cl-club">{{ settings.club }}</div>
    </div>
    <div class="cl-right">
      <div v-show="!brk" class="cl-level"><span class="w">第</span><flap-tile ref="lv0" v-bind="SZ.lv" @land="land" /><flap-tile ref="lv1" class="ml-6" v-bind="SZ.lv" @land="land" /><span class="w">级</span></div>
      <div v-show="brk" class="cl-bh"><span class="k">休息后</span><span class="v">{{ nextNoText }}</span></div>
      <div class="cl-sub">{{ subText }}</div>
    </div>

    <div class="cl-hero">
      <div class="cl-state" :class="'is-' + tone">{{ word }}</div>
      <div class="cl-clock">
        <span v-show="over" class="cl-sign">+</span>
        <flap-tile ref="d0" v-bind="SZ.clock" @land="land" /><flap-tile ref="d1" class="ml-16" v-bind="SZ.clock" @land="land" />
        <div class="cl-colon"><i></i><i></i></div>
        <flap-tile ref="d2" v-bind="SZ.clock" @land="land" /><flap-tile ref="d3" class="ml-16" v-bind="SZ.clock" @land="land" />
      </div>
      <div class="cl-prog"><i ref="prog"></i></div>
      <div class="cl-blinds">
        <span class="lbl">{{ brk ? '休息后' : '盲注' }}</span>
        <flap-tile ref="sb" v-bind="SZ.field" :pool="NUMS" @land="land" /><span class="slash">/</span><flap-tile ref="bb" v-bind="SZ.field" :pool="NUMS" @land="land" />
        <span class="gap"></span><span class="lbl">前注</span><flap-tile ref="ante" v-bind="SZ.field" :pool="NUMS" @land="land" />
      </div>
    </div>

    <!-- 盲注结构表：当前级保持在中间，换级时平滑滚动；开头和结尾不强行居中，避免出现空白 -->
    <div class="cl-list">
      <div class="cl-list-h"><span class="c-no">级别</span><span class="c-bl">盲注</span><span class="c-an">前注</span><span class="c-mn">时长</span></div>
      <div class="cl-list-view">
        <div class="cl-list-rows" :style="listStyle">
          <div v-for="(row, i) in listRows" :key="row.key" class="cl-row" :class="['is-' + row.kind, { 'is-past': i < listCur, 'is-cur': i === listCur }]">
            <template v-if="row.kind === 'lv'">
              <span class="c-no">{{ row.no }}</span><span class="c-bl">{{ row.blinds }}</span><span class="c-an">{{ row.ante }}</span><span class="c-mn">{{ row.minutes }}′</span>
            </template>
            <template v-else>
              <span class="c-brk">{{ row.kind === 'reg' ? '截止买入 · 休息' : '休息' }}<em v-if="row.note && row.note !== '截止买入'">{{ row.note }}</em></span><span class="c-mn">{{ row.minutes }}′</span>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部一行（整屏宽）：下一级 | 常驻信息栏（屏幕正中） | 距休息；关闭的统计项只隐藏不让位，信息栏始终居中 -->
    <div class="cl-stats">
      <div class="st" :class="{ 'is-off': !mod.next }"><span class="k">{{ stats.nxLbl }}</span><span class="v" :style="nxStyle">{{ stats.nx }}</span><span class="u">{{ stats.nxSub }}</span></div>
      <div class="st st-info" :style="infoStyle"><div v-for="(line, i) in infoLines" :key="i" class="ln">{{ line }}</div></div>
      <div class="st" :class="{ 'is-off': !mod.brk }"><span class="k">{{ stats.brkLbl }}</span><span class="v">{{ stats.brk }}</span></div>
    </div>
    <message-bar v-if="mod.messages" class="cl-bar" :store="messages" :clock="clock" />
  </div>
</template>

<script>
/* 经典主题：居中构图，倒计时是全场主角（1920×1080 设计，由大屏页整体缩放） */
import FlapTile from '@/components/FlapTile.vue';
import MessageBar from '@/components/MessageBar.vue';
import { pad2, fmtNum, levelCount, STATE_WORD, STATE_TONE, timeToBreak, clockDigits, hms, textW } from '@shared/clock.mjs';

var NUMS = ['400', '1,500', '5,000', '800', '12,000', '3,000'];
var ROW_H = 60, VISIBLE = 9;             // 结构表：每行 60px，可见 9 行（底部整宽信息行占用了原来的位置）
var INFO_W = 780, INFO_H = 108;          // 信息栏可用宽高（px），字号按最长一行自动适配
var PLAQUE_TEXT_W = 900;                 // 站名牌内文字最大宽度（px）

export default {
  name: 'ClassicBoard',
  components: { FlapTile: FlapTile, MessageBar: MessageBar },
  props: { clock: Object, messages: Object, settings: { type: Object, default: function () { return {}; } }, onLand: Function },
  data: function () {
    return { word: '', tone: 'white', brk: false, over: false, dim: false, nextNoText: '', subText: '',
      stats: { nxLbl: '下一级', nx: '', nxSub: '', brkLbl: '距休息', brk: '' }, listRows: [], listCur: -1 };
  },
  computed: {
    mod: function () { return Object.assign({ next: true, brk: true, messages: true }, this.settings.modules || {}); },
    rootClass: function () { return ['tone-' + this.tone, { 'is-dim': this.dim, 'is-over': this.over }]; },
    /** 当前级居中：偏移 = 当前行位置 − 半个可视区，限制在列表范围内 */
    listStyle: function () {
      var n = this.listRows.length, cur = Math.max(0, this.listCur);
      var max = Math.max(0, (n - VISIBLE) * ROW_H);
      var y = Math.max(0, Math.min(max, cur * ROW_H - (VISIBLE - 1) / 2 * ROW_H));
      var t = 'translate3d(0,' + (-y) + 'px,0)';
      return { WebkitTransform: t, transform: t };
    },
    /** 站名牌字号：默认 54px，名称太长时缩小，保证牌子不碰到右上角的级别 */
    plaqueStyle: function () {
      var w = textW(this.settings.name || '未命名赛事', 1) * 1.1, fs = 54;
      if (w > 0) fs = Math.max(30, Math.min(54, Math.floor(PLAQUE_TEXT_W / w)));
      return { fontSize: fs + 'px' };
    },
    /** “下一级”的数字较长（如 10,000 / 20,000）时缩小，保证放进 480px 的格子 */
    nxStyle: function () {
      var w = textW(this.stats.nx || '', 1) * 0.62, fs = 40;
      if (w > 0) fs = Math.max(26, Math.min(40, Math.floor(270 / w)));
      return { fontSize: fs + 'px' };
    },
    infoLines: function () { return String(this.settings.infoText || '').split('\n').filter(function (l, i, a) { return l || i < a.length - 1; }).slice(0, 3); },
    /** 字号：放得下最长的一行，且所有行放得进格子高度；1 行最大 40px，3 行最大 28px */
    infoStyle: function () {
      var lines = this.infoLines, n = lines.length || 1, fs = n === 1 ? 44 : n === 2 ? 40 : 32;
      var widest = lines.reduce(function (w, l) { return Math.max(w, textW(l, 1)); }, 0);
      if (widest > 0) fs = Math.min(fs, Math.floor(INFO_W / widest));
      fs = Math.max(18, Math.min(fs, Math.floor(INFO_H / (n * 1.18))));
      return { fontSize: fs + 'px', lineHeight: Math.round(fs * 1.18) + 'px' };
    }
  },
  created: function () {
    this.NUMS = NUMS;
    this.SZ = {
      lv: { w: 64, h: 92, fs: 92, r: 3, hg: 3, pin: 6 },
      clock: { w: 236, h: 372, fs: 412, r: 4, hg: 6, pin: 13 },
      field: { w: 236, h: 108, fs: 92, r: 3, hg: 4, pin: 7 }
    };
    this.lastLi = null; this.lastTid = null; this.prog = -1;
  },
  mounted: function () { var self = this; (function loop() { self.frame(); self.raf = requestAnimationFrame(loop); })(); },
  beforeDestroy: function () { cancelAnimationFrame(this.raf); },
  methods: {
    up: function (k, v) { if (this[k] !== v) this[k] = v; },
    upS: function (k, v) { if (this.stats[k] !== v) this.stats[k] = v; },
    land: function (heavy) { if (this.onLand) this.onLand(heavy); },
    frame: function () {
      var r = this.clock && this.clock.read(); if (!r) return;
      var s = r.s, c = r.c, d = r.d, set = this.settings, L = s.structure.levels, R = this.$refs;
      var first = this.lastLi === null, changed = !first && (c.li !== this.lastLi || s.tid !== this.lastTid);
      var cd = clockDigits(d.secs), dig = cd.digits.split('');
      var lv = (d.e && d.e.no ? pad2(d.e.no) : '--').split('');
      var bl = d.blinds, fmt = function (n) { return fmtNum(n, set.numberFormat); };
      var sb = bl ? fmt(bl.sb) : '—', bb = bl ? fmt(bl.bb) : '—', an = bl && bl.ante ? fmt(bl.ante) : '—';
      var fields = [[R.lv0, lv[0]], [R.lv1, lv[1]], [R.sb, sb], [R.bb, bb], [R.ante, an]];
      var clock = [R.d0, R.d1, R.d2, R.d3];
      if (changed) {
        /* 升盲：全场唯一的大动作，所有字段连环翻转 */
        var k = 0;
        fields.forEach(function (p) { if (p[0]) p[0].set(p[1], { animate: true, spins: 3 + (k % 3), stepMs: 96, delay: 60 + (k++) * 42 }); });
        clock.forEach(function (f, i) { f.set(dig[i], { animate: true, spins: 2 + i, stepMs: 90, delay: i * 50 }); });
      } else {
        fields.forEach(function (p) { if (p[0] && p[0].target !== p[1]) p[0].set(p[1], { animate: !first }); });
        /* 每秒走时：变化的数字依次翻动，多位同时变化时从右往左形成波纹 */
        var order = 0;
        for (var i = 3; i >= 0; i--) {
          var f = clock[i]; if (!f || (f.target === dig[i] && (f.busy || f.cur === dig[i]))) continue;
          f.set(dig[i], first ? {} : { animate: true, delay: (order++) * 55 });
        }
      }
      this.up('word', STATE_WORD[d.kind]);
      this.up('tone', STATE_TONE[d.kind]); this.up('brk', d.brk); this.up('over', d.over); this.up('dim', d.dim);
      this.up('nextNoText', d.brk && bl ? '第 ' + bl.no + ' 级' : '');
      this.up('subText', '共 ' + levelCount(L) + ' 级');
      /* 本级进度：一根细线，颜色跟随状态 */
      var p = 100;
      if (d.e && (s.state.status === 'running' || s.state.status === 'paused')) p = d.over ? 100 : Math.max(0, Math.min(100, c.rem / (d.e.minutes * 60000) * 100));
      p = Math.round(p * 5) / 5;
      if (p !== this.prog && R.prog) { this.prog = p; R.prog.style.width = p + '%'; }
      /* 数据栏 */
      var nx = L[c.li + 1];
      if (d.brk) { this.upS('nxLbl', '休息后'); this.upS('nx', bl ? fmt(bl.sb) + ' / ' + fmt(bl.bb) : '—'); this.upS('nxSub', bl ? '第 ' + bl.no + ' 级' : ''); }
      else if (!nx) { this.upS('nxLbl', '下一级'); this.upS('nx', '—'); this.upS('nxSub', '已是最后一级'); }
      else if (nx.type === 'break') { this.upS('nxLbl', '下一个'); this.upS('nx', '休息 ' + nx.minutes + ' 分钟'); this.upS('nxSub', nx.note || ''); }
      else { this.upS('nxLbl', '下一级'); this.upS('nx', fmt(nx.sb) + ' / ' + fmt(nx.bb)); this.upS('nxSub', nx.ante ? '前注 ' + fmt(nx.ante) : ''); }
      var tb = timeToBreak(s.structure, c, s.state);
      this.upS('brkLbl', d.brk ? '距下次休息' : '距休息'); this.upS('brk', tb === null ? '—' : hms(Math.ceil(tb / 1000)));
      /* 结构表：结构或数字格式变了才重建行；当前级变了才滚动 */
      var listKey = s.tid + ':' + s.structure.version + ':' + set.numberFormat;
      if (listKey !== this.listKey) {
        this.listKey = listKey;
        this.listRows = L.map(function (e) {
          if (e.type === 'break') return { key: e.id, kind: e.regEnd ? 'reg' : 'brk', minutes: e.minutes, note: e.note || '' };
          return { key: e.id, kind: 'lv', no: e.no, blinds: fmt(e.sb) + ' / ' + fmt(e.bb), ante: e.ante ? fmt(e.ante) : '—', minutes: e.minutes };
        });
      }
      this.up('listCur', c.li);
      this.lastLi = c.li; this.lastTid = s.tid;
    }
  }
};
</script>

<style lang="scss">
.classic { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; overflow: hidden; background: $black; color: $white; font-family: $hei; font-weight: 900; }
.classic .ml-6 { margin-left: 6px; }
.classic .ml-16 { margin-left: 16px; }
.cl-left { position: absolute; left: 72px; top: 44px; max-width: 1080px; }
.cl-name { font-size: 58px; line-height: 1.1; letter-spacing: .06em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cl-club { margin-top: 14px; font-size: 24px; color: $print; letter-spacing: .08em; }
.cl-right { position: absolute; right: 72px; top: 40px; text-align: right; }
.cl-level { height: 92px; white-space: nowrap; }
.cl-level .w { display: inline-block; vertical-align: middle; font-size: 46px; margin: 0 14px; }
.cl-level .w:last-child { margin-right: 0; }
.cl-bh { height: 92px; line-height: 92px; white-space: nowrap; }
.cl-bh .k { font-size: 26px; color: $print; margin-right: 14px; }
.cl-bh .v { font-size: 46px; }
.cl-sub { margin-top: 14px; font-size: 22px; color: $print; }

/* 主计时区放在左侧 1280px 内居中，右侧留给盲注结构表；顶部 166px，让盲注翻片与底部统计行之间留出 10px */
.cl-hero { position: absolute; left: 72px; width: 1280px; top: 166px; text-align: center; }
.cl-state { height: 50px; line-height: 50px; font-size: 46px; letter-spacing: .12em; transition: color .3s; }
.cl-state.is-go { color: $go; } .cl-state.is-warn { color: $warn; } .cl-state.is-stop { color: $stop; } .cl-state.is-white { color: $white; }
.cl-clock { margin-top: 20px; display: -webkit-flex; display: flex; -webkit-justify-content: center; justify-content: center; -webkit-align-items: center; align-items: center; transition: opacity .4s; }
.cl-sign { font-family: $num; font-weight: 800; font-size: 200px; color: $stop; margin-right: 24px; }
.cl-colon { width: 26px; margin: 0 28px; }
.cl-colon i { display: block; width: 26px; height: 26px; background: $white; transition: background .4s; }
.cl-colon i + i { margin-top: 84px; }
.classic.is-dim .cl-clock { opacity: .45; }
.classic.tone-warn .cl-clock .flap b { color: $warn; }
.classic.tone-warn .cl-colon i { background: $warn; }
.classic.is-over .cl-clock .flap b { color: $stop; }
.classic.is-over .cl-colon i { background: $stop; }
.cl-prog { position: relative; width: 1058px; height: 6px; margin: 26px auto 0; background: #1C1C1C; }
.cl-prog i { position: absolute; left: 0; top: 0; bottom: 0; width: 100%; background: $white; transition: background .3s; }
.classic.tone-go .cl-prog i { background: $go; } .classic.tone-warn .cl-prog i { background: $warn; } .classic.tone-stop .cl-prog i { background: $stop; }
.cl-blinds { margin-top: 36px; display: -webkit-flex; display: flex; -webkit-justify-content: center; justify-content: center; -webkit-align-items: center; align-items: center; white-space: nowrap; }
.cl-blinds .lbl { font-size: 30px; color: $print; margin-right: 18px; }
.cl-blinds .slash { font-family: $num; font-weight: 800; font-size: 72px; color: $print; margin: 0 16px; }
.cl-blinds .gap { width: 40px; }

.cl-stats { position: absolute; left: 72px; right: 72px; top: 794px; height: 116px; display: -webkit-flex; display: flex; -webkit-align-items: center; align-items: center;
  border-top: 2px solid $rule; border-bottom: 2px solid $rule; }
.cl-stats .st { -webkit-flex: 1; flex: 1; height: 100%; display: -webkit-flex; display: flex; -webkit-align-items: center; align-items: center; -webkit-justify-content: center; justify-content: center;
  border-left: 2px solid $rule; white-space: nowrap; }
.cl-stats .st:first-child { -webkit-justify-content: flex-start; justify-content: flex-start; border-left: 0; }
.cl-stats .st:last-child { -webkit-justify-content: flex-end; justify-content: flex-end; }
.cl-stats .k { font-size: 24px; color: $print; margin-right: 12px; }
.cl-stats .v { font-family: $num; font-weight: 800; font-size: 44px; margin-right: 10px; }
.cl-stats .u { font-size: 22px; color: $print; }
.cl-bar { position: absolute; left: 72px; top: 922px; border-top: 2px solid $rule; }

/* ── 常驻信息栏 ── */
.cl-stats .st-info { -webkit-flex: 1.9; flex: 1.9; -webkit-flex-direction: column; flex-direction: column; -webkit-justify-content: center; justify-content: center;
  -webkit-align-items: flex-start; align-items: flex-start; padding-left: 28px; overflow: hidden; }
.cl-stats .st-info:last-child { -webkit-justify-content: center; justify-content: center; }
.cl-stats .st-info .ln { white-space: nowrap; overflow: hidden; color: $white; font-weight: 900; letter-spacing: .04em; }

/* ── 盲注结构表 ── */
.cl-list { position: absolute; right: 72px; top: 190px; width: 448px; height: 580px; }
.cl-list-h { height: 40px; line-height: 40px; display: -webkit-flex; display: flex; font-size: 20px; color: $print; letter-spacing: .1em; border-bottom: 2px solid $rule; }
.cl-list-view { position: relative; height: 540px; overflow: hidden; }
.cl-list-rows { -webkit-transition: -webkit-transform .6s cubic-bezier(.4, 0, .2, 1); transition: transform .6s cubic-bezier(.4, 0, .2, 1); }
.cl-row { height: 60px; display: -webkit-flex; display: flex; -webkit-align-items: center; align-items: center; border-bottom: 1px solid #161616;
  font-family: $num; font-weight: 800; font-size: 30px; color: $white; }
.cl-list .c-no { width: 64px; text-align: center; }
.cl-list .c-bl { -webkit-flex: 1; flex: 1; text-align: center; }
.cl-list .c-an { width: 104px; text-align: center; }
.cl-list .c-mn { width: 72px; text-align: right; padding-right: 10px; }
.cl-row .c-brk { -webkit-flex: 1; flex: 1; padding-left: 20px; font-family: $hei; font-weight: 900; font-size: 24px; letter-spacing: .1em; color: $warn; }
.cl-row .c-brk em { font-style: normal; font-size: 18px; color: $print; margin-left: 12px; letter-spacing: 0; }
.cl-row.is-reg .c-brk { color: $stop; }
.cl-row.is-past { color: #4A4A48; }
.cl-row.is-past .c-brk { color: #4A4A48; }
/* 当前级：反白，像翻牌钟的当前行 */
.cl-row.is-cur { background: $white; color: #050505; border-bottom-color: $white; }
.cl-row.is-cur .c-brk { color: #050505; }
.cl-row.is-cur .c-brk em { color: #3A3A38; }

/* ── 站名牌（移植自时刻表版） ── */
.cl-left { display: -webkit-flex; display: flex; -webkit-align-items: center; align-items: center; max-width: 1400px; }
.cl-plaque { position: relative; -webkit-flex: none; flex: none; min-width: 500px; height: 112px; padding: 0 44px; border-radius: 10px; background: #1C4E9D;
  display: -webkit-flex; display: flex; -webkit-align-items: center; align-items: center; -webkit-justify-content: center; justify-content: center;
  box-shadow: inset 0 0 0 7px #1C4E9D, inset 0 0 0 9px rgba(255, 255, 255, .6), 0 3px 0 #0E2A57; }
.cl-plaque .zh { font-family: $hei; font-weight: 900; font-size: 54px; line-height: 1; letter-spacing: .1em; margin-right: -.1em; color: #fff; white-space: nowrap; }
.cl-plaque i { position: absolute; width: 8px; height: 8px; border-radius: 50%; background: rgba(255, 255, 255, .75); }
.cl-plaque i:nth-of-type(1) { left: 15px; top: 15px; }
.cl-plaque i:nth-of-type(2) { right: 15px; top: 15px; }
.cl-plaque i:nth-of-type(3) { left: 15px; bottom: 15px; }
.cl-plaque i:nth-of-type(4) { right: 15px; bottom: 15px; }
.cl-left .cl-club { margin: 0 0 0 28px; font-size: 26px; color: $print; letter-spacing: .08em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 420px; }

/* ── 底部整宽一行：两侧统计固定宽度，信息栏居中 ── */
.cl-stats .st:not(.st-info) { -webkit-flex: none; flex: none; width: 480px; overflow: hidden; white-space: nowrap; }
.cl-stats .st.is-off { visibility: hidden; }
.cl-stats .st-info { border-left: 2px solid $rule; border-right: 2px solid $rule; -webkit-align-items: center; align-items: center; padding: 0 20px; }
.cl-stats .st-info .ln { text-align: center; }
.cl-stats .st:last-child { border-left: 0; }
</style>
