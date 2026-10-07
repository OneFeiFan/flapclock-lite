<template>
  <div class="rm ctl">
    <header class="rm-top">
      <router-link to="/" class="back">‹ 比赛</router-link>
      <div class="ttl">{{ settings.name || '比赛' }}</div>
      <span class="net"><i class="rm-dot" :class="{ 'is-on': status === 'online' }"></i>{{ status === 'online' ? '已同步' : '连接中' }}</span>
    </header>

    <div v-if="fatal" class="rm-wrap"><div class="rm-card rm-empty">{{ fatal }}　<router-link to="/">返回首页</router-link></div></div>

    <div v-else class="rm-wrap is-wide ctl-grid">
      <!-- 左列（宽屏时固定在左侧）：当前倒计时 + 播放器 -->
      <div class="ctl-main">
        <section class="rm-card ctl-clock">
          <div class="c-row1"><span class="c-level">{{ view.level }}</span><span class="c-word" :class="'is-' + view.tone">{{ view.word }}</span></div>
          <div class="c-time" :class="{ 'is-dim': view.dim, 'is-over': view.over }">{{ view.time }}</div>
          <div class="c-blinds">{{ view.blinds }}<em v-if="view.ante">前注 {{ view.ante }}</em></div>
          <div class="c-next">{{ view.next }}</div>
          <player-control :status="view.status" :level-ms="view.levelMs" :remain-ms="view.remainMs"
            :can-prev="view.canPrev" :can-next="view.canNext" :disabled="!ready" @cmd="send" />
          <button class="rm-btn is-wide" :disabled="!ready" @click="sheet = 'more'">更多操作（跳转级别、结束、重置、删除）</button>
        </section>
      </div>

      <!-- 右侧：常驻信息栏、公告走字灯、盲注方案、操作日志（手机上信息栏、走字灯、日志可折叠） -->
      <div class="ctl-side">
        <fold-card title="常驻信息栏" :summary="infoSummary" storage-key="info">
          <div class="rm-hint fold-note">最多 3 行，每行 24 字；保存后立即显示在大屏底部正中</div>
          <textarea v-model="infoDraft" rows="3" placeholder="例如：奖池 10 万 · 第 9 名起有奖"></textarea>
          <div class="rm-foot">
            <span class="rm-hint" :class="{ 'is-warn': infoProblem }">{{ infoProblem }}</span>
            <button class="rm-btn is-primary" :disabled="!infoDirty || saving" @click="saveInfo">保存</button>
          </div>
        </fold-card>

        <!-- 公告走字灯：一个输入框 + “播一次 / 循环播放”切换；正在循环的文字显示在上方，点一下可修改 -->
        <fold-card title="公告走字灯" :summary="noticeSummary" storage-key="notice">
          <div v-if="loopText" class="loop-now">
            <button class="loop-text" @click="editLoop">正在循环：{{ loopText }}</button>
            <button class="rm-mini is-danger" :disabled="saving" @click="stopLoop">停止</button>
          </div>
          <div class="seg">
            <button :class="{ 'is-on': noticeMode === 'once' }" @click="noticeMode = 'once'">播一次</button>
            <button :class="{ 'is-on': noticeMode === 'loop' }" @click="noticeMode = 'loop'">循环播放</button>
          </div>
          <div class="rm-line">
            <input v-model="noticeText" type="text" :maxlength="noticeMax" :placeholder="noticeMode === 'once' ? '例如：3 号桌请裁判到场' : '例如：欢迎光临，祝各位好运'" @keyup.enter="sendNotice">
            <button class="rm-btn is-primary" :disabled="!noticeText.trim() || !ready || saving" @click="sendNotice">{{ noticeMode === 'once' ? '发送' : '开始循环' }}</button>
          </div>
          <div class="rm-hint fold-note">{{ noticeMode === 'once' ? '在走字带上播一遍，最多 40 字' : '没有公告时一直循环滚动，最多 200 字；会替换正在循环的文字' }}</div>
          <div class="chips"><button v-for="p in presets" :key="p" class="chip" @click="noticeText = p">{{ p }}</button></div>
        </fold-card>

        <section class="rm-card">
          <h3>盲注方案<small>{{ schemes.length }} / 5 套</small></h3>
          <scheme-list :schemes="schemes" :current-id="structure.schemeId" show-use
            @use="askApply" @edit="editScheme" @dup="dupScheme" @del="askDelete" @create="newScheme" @recommended="useRecommended" />
        </section>

        <fold-card title="操作日志" :summary="logSummary" storage-key="log">
          <div v-if="!log.length" class="rm-empty">还没有操作</div>
          <div v-for="e in log" :key="e.seq" class="logrow"><span class="at">{{ e.time }}</span><span class="what">{{ e.label }}</span><span class="who">{{ e.issuer }}</span></div>
        </fold-card>
      </div>
    </div>

    <div v-if="sheet" class="rm-mask" @click.self="sheet = ''">
      <div class="rm-sheet">
        <template v-if="sheet === 'more'">
          <h3>更多操作</h3>
          <div class="rm-sub">跳到某一级（剩余时间重新开始）</div>
          <div class="jump">
            <button v-for="r in jumpRows" :key="r.i" class="jrow" :class="{ 'is-cur': r.cur, 'is-brk': r.brk }" @click="askJump(r)">{{ r.label }}</button>
          </div>
          <div class="rm-acts">
            <button class="rm-btn is-danger" @click="askEnd">结束比赛</button>
            <button class="rm-btn" @click="askReset">重置时钟</button>
          </div>
          <button class="rm-btn is-danger is-wide" @click="askDeleteMatch">删除这场比赛</button>
        </template>
        <template v-else-if="sheet === 'delete'">
          <h3>删除「{{ settings.name }}」？</h3>
          <p>比赛的设置、盲注结构和操作日志都会删除，不能恢复。盲注方案不受影响。</p>
          <template v-if="boundScreens.length">
            <label class="f">正在显示这场比赛的 {{ boundScreens.length }} 块屏幕（{{ boundScreens.map(function (d) { return d.name || '未命名'; }).join('、') }}）改为：</label>
            <select v-model="moveTo">
              <option v-for="t in otherMatches" :key="t.id" :value="t.id">显示「{{ t.name }}」</option>
              <option value="">回到配对页（之后用手机重新绑定）</option>
            </select>
          </template>
          <div class="rm-acts">
            <button class="rm-btn" @click="sheet = ''">取消</button>
            <button class="rm-btn is-danger" :disabled="deleting" @click="deleteMatch">删除</button>
          </div>
        </template>
        <template v-else-if="sheet === 'confirm'">
          <h3>{{ confirm.title }}</h3>
          <p>{{ confirm.text }}</p>
          <div class="rm-acts">
            <button class="rm-btn" @click="sheet = ''">取消</button>
            <button class="rm-btn" :class="confirm.danger ? 'is-danger' : 'is-primary'" @click="runConfirm">{{ confirm.ok }}</button>
          </div>
        </template>
      </div>
    </div>
    <scheme-editor v-if="editing" :scheme="editing.id ? editing : null" :count="schemes.length" @close="editing = null" @saved="onSaved" />
    <div v-if="toast" class="rm-toast" :class="'is-' + toast.tone">{{ toast.text }}</div>
  </div>
</template>

<script>
/*
 * 比赛控制页（手机遥控）：当前倒计时、播放器、常驻信息栏、公告走字灯、盲注方案、操作日志。
 * 命令通过实时连接下发（带版本号与 opId，暂停带按下时刻）；设置与方案通过 REST 保存。
 */
import api from '@/lib/api';
import ClockModel from '@/lib/clock';
import { adminLink } from '@/lib/client';
import { uuid, clockText } from '@/lib/util';
import { fmtNum, clockDigits, levelCount, STATE_WORD, STATE_TONE, nextLevelAfter } from '@shared/clock.mjs';
import { INFO_LINES, INFO_LINE_MAX, rowLabel } from '@shared/structure.mjs';
import PlayerControl from '@/components/PlayerControl.vue';
import SchemeEditor from '@/components/SchemeEditor.vue';
import SchemeList from '@/components/SchemeList.vue';
import FoldCard from '@/components/FoldCard.vue';
import { addRecommendedScheme } from '@/lib/schemes';

var DONE = { start: '比赛已开始', resume: '已继续', pause: '已暂停', next: '已进入下一级', prev: '已回到上一级', jump: '已跳转',
  add: '时间已调整', setRemaining: '剩余时间已设定', end: '比赛已结束', reset: '时钟已重置', notice: '公告已发送' };
var REASON = { conflict: '状态刚被别人改过，已刷新，请确认后再按', empty: '公告内容不能为空', notfound: '这场比赛不存在或已删除', unknown: '无法识别的操作' };

export default {
  name: 'ControlView',
  components: { PlayerControl: PlayerControl, SchemeEditor: SchemeEditor, SchemeList: SchemeList, FoldCard: FoldCard },
  props: { tid: String },
  data: function () {
    return {
      status: 'connecting', ready: false, fatal: '', settings: {}, structure: { levels: [], schemeId: null }, version: 0,
      view: { level: '', word: '', tone: 'white', time: '--:--', blinds: '', ante: '', next: '', dim: false, over: false,
        status: 'pristine', levelMs: 0, remainMs: 0, canPrev: false, canNext: false, li: 0 },
      infoDraft: '', infoBase: '', noticeText: '', noticeMode: 'once', saving: false,
      schemes: [], log: [], sheet: '', confirm: {}, toast: null, editing: null, displays: [], otherMatches: [], moveTo: '', deleting: false,
      presets: ['请大家保持安静', '请裁判到场', '比赛即将开始，请回到座位', '休息即将结束，请回到座位', '请勿在比赛区域使用手机']
    };
  },
  computed: {
    infoLines: function () { return this.infoDraft.replace(/\r/g, '').split('\n'); },
    infoProblem: function () {
      var lines = this.infoLines;
      if (lines.length > INFO_LINES) return '最多 ' + INFO_LINES + ' 行，多出的行不会显示';
      for (var i = 0; i < lines.length; i++) if (lines[i].trim().length > INFO_LINE_MAX) return '第 ' + (i + 1) + ' 行超过 ' + INFO_LINE_MAX + ' 字，超出部分不会显示';
      return '';
    },
    infoDirty: function () { return this.infoDraft !== this.infoBase; },
    noticeMax: function () { return this.noticeMode === 'once' ? 40 : 200; },
    /** 正在循环的文字（关闭时为空） */
    loopText: function () { var mq = this.settings.marquee || {}; return mq.enabled && mq.text ? mq.text : ''; },
    infoSummary: function () { var first = String(this.infoBase || '').split('\n')[0]; return first || '未设置'; },
    noticeSummary: function () { return this.loopText ? '循环中：' + this.loopText : '没有循环文字'; },
    logSummary: function () { var e = this.log[0]; return e ? e.time + ' ' + e.label + ' · ' + e.issuer : '还没有操作'; },
    boundScreens: function () { var tid = this.tid; return this.displays.filter(function (d) { return d.tid === tid; }); },
    jumpRows: function () {
      var cur = this.view.li;
      return this.structure.levels.map(function (e, i) {
        var label = e.type === 'break' ? rowLabel(e) + ' ' + e.minutes + ' 分钟' : '第 ' + e.no + ' 级　' + e.sb + ' / ' + e.bb + (e.ante ? '　前注 ' + e.ante : '');
        return { i: i, label: label, cur: i === cur, brk: e.type === 'break' };
      });
    }
  },
  created: function () {
    var self = this;
    this.pending = {};
    this.link = adminLink({ tid: this.tid, onMessage: this.onMessage, onStatus: function (s) { self.status = s; } });
    this.clock = new ClockModel(this.link);
    this.loadSchemes();
  },
  mounted: function () { var self = this; (function loop() { self.frame(); self.raf = requestAnimationFrame(loop); })(); },
  beforeDestroy: function () { this.link.close(); cancelAnimationFrame(this.raf); clearTimeout(this.toastTimer); clearTimeout(this.logTimer); },
  methods: {
    onMessage: function (m) {
      if (m.t === 'gone') { this.fatal = '这场比赛不存在或已被删除'; return; }
      if (m.t === 'schemes') { this.loadSchemes(); return; }
      if (m.t === 'presence') { this.displays = m.displays || []; return; }
      if (m.t === 'snap' && m.tid === this.tid) {
        if (!this.clock.set(m)) return;
        var first = !this.ready;
        this.ready = true; this.settings = m.settings || {}; this.structure = m.structure; this.version = m.version;
        var info = this.settings.infoText || '';
        if (first || !this.infoDirty) { this.infoDraft = info; }
        this.infoBase = info;
        this.scheduleLog();
        return;
      }
      if (m.t === 'ack') {
        delete this.pending[m.opId];
        if (m.ok) this.showToast(DONE[m.type] || '已完成', 'go');
        else this.showToast(REASON[m.reason] || '操作没有成功', 'warn');
      }
    },
    /* 每帧读一次时钟，只在显示的值变化时才更新界面 */
    frame: function () {
      var r = this.clock.read(); if (!r) return;
      var s = r.s, c = r.c, d = r.d, v = this.view, L = s.structure.levels, fmt = function (n) { return fmtNum(n, s.settings.numberFormat); };
      var set = function (k, val) { if (v[k] !== val) v[k] = val; };
      var cd = clockDigits(d.secs);
      set('time', (d.over ? '+' : '') + cd.digits.slice(0, 2) + ':' + cd.digits.slice(2));
      set('level', d.brk ? rowLabel(d.e) : '第 ' + (d.e ? d.e.no : '-') + ' 级　共 ' + levelCount(L) + ' 级');
      set('word', STATE_WORD[d.kind]); set('tone', STATE_TONE[d.kind]); set('dim', d.dim); set('over', d.over);
      var bl = d.blinds;
      set('blinds', bl ? (d.brk ? '休息后 ' : '') + fmt(bl.sb) + ' / ' + fmt(bl.bb) : '');
      set('ante', bl && bl.ante ? fmt(bl.ante) : '');
      var nx = L[c.li + 1], nb = nextLevelAfter(L, c.li);
      set('next', !nx ? '已是最后一级' : nx.type === 'break' ? '下一个：' + rowLabel(nx) + ' ' + nx.minutes + ' 分钟' : '下一级：' + fmt(nb.sb) + ' / ' + fmt(nb.bb));
      set('status', s.state.status); set('li', c.li);
      set('levelMs', d.e ? d.e.minutes * 60000 : 0);
      set('remainMs', Math.round(Math.max(0, c.rem) / 250) * 250);
      set('canPrev', c.li > 0); set('canNext', c.li < L.length - 1);
    },
    send: function (type, payload) {
      if (!this.ready) return;
      var cmd = { opId: uuid(), type: type, payload: payload || {}, baseVersion: this.version, pressedAt: Math.round(this.link.serverNow()) };
      if (!this.link.send({ t: 'cmd', tid: this.tid, cmd: cmd })) { this.showToast('还没连上服务器，请稍后再按', 'warn'); return; }
      this.pending[cmd.opId] = type;
    },
    /** 播一次：下发一次性公告；循环播放：设为常驻循环文字（替换正在循环的） */
    sendNotice: function () {
      var self = this, text = this.noticeText.trim(); if (!text) return;
      if (this.noticeMode === 'once') { this.send('notice', { text: text }); this.noticeText = ''; return; }
      this.saveSettings({ marquee: { text: text, enabled: true } }, '已开始循环播放').then(function (ok) { if (ok) self.noticeText = ''; });
    },
    editLoop: function () { this.noticeMode = 'loop'; this.noticeText = this.loopText; },
    stopLoop: function () { this.saveSettings({ marquee: { enabled: false } }, '已停止循环'); },
    saveSettings: function (patch, okText) {
      var self = this; this.saving = true;
      return api.put('/api/tournaments/' + this.tid + '/settings', patch)
        .then(function () { self.showToast(okText || '已保存', 'go'); return true; })
        .catch(function (e) { self.showToast(e.message, 'warn'); return false; })
        .then(function (ok) { self.saving = false; return ok; });
    },
    saveInfo: function () { this.infoBase = this.infoDraft; this.saveSettings({ infoText: this.infoDraft }); },
    loadSchemes: function () { var self = this; api.get('/api/schemes').then(function (list) { self.schemes = list; }).catch(function () {}); },
    scheduleLog: function () {
      var self = this; clearTimeout(this.logTimer);
      this.logTimer = setTimeout(function () {
        api.get('/api/tournaments/' + self.tid + '/log').then(function (list) {
          self.log = list.slice(0, 30).map(function (e) { return { seq: e.seq, time: clockText(e.at, true), label: e.label, issuer: e.issuer }; });
        }).catch(function () {});
      }, 400);
    },
    ask: function (title, text, ok, danger, run) { this.confirm = { title: title, text: text, ok: ok, danger: danger, run: run }; this.sheet = 'confirm'; },
    runConfirm: function () { var run = this.confirm.run; this.sheet = ''; if (run) run(); },
    askJump: function (r) { var self = this; this.ask('跳到这一项？', r.label + '。本级时间会从头开始。', '跳转', false, function () { self.send('jump', { index: r.i }); }); },
    askEnd: function () { var self = this; this.ask('结束比赛？', '大屏会显示“比赛结束”，倒计时停在这一刻。之后可以“重置时钟”重新开始，或者在“更多操作”里删除这场比赛。', '结束比赛', true, function () { self.send('end'); }); },
    /** 删除比赛：绑定的屏幕默认改为显示另一场比赛（最常见：这场打完，屏幕接着显示下一场），也可以回到配对页 */
    askDeleteMatch: function () {
      var self = this, tid = this.tid;
      api.get('/api/tournaments').then(function (list) {
        self.otherMatches = list.filter(function (t) { return t.id !== tid; });
        self.moveTo = self.otherMatches.length ? self.otherMatches[0].id : '';
        self.sheet = 'delete';
      }).catch(function (e) { self.showToast(e.message, 'warn'); });
    },
    deleteMatch: function () {
      var self = this, n = this.boundScreens.length; this.deleting = true;
      api.del('/api/tournaments/' + this.tid + (n && this.moveTo ? '?moveTo=' + encodeURIComponent(this.moveTo) : ''))
        .then(function (r) {
          var moved = r && r.moved ? '，' + r.moved + ' 块屏幕已改为显示另一场比赛' : (n ? '，屏幕已回到配对页' : '');
          self.sheet = ''; self.link.close();
          // 提示放在地址参数里带回首页（首页按需加载，直接发事件可能没人接收）
          self.$router.replace({ path: '/', query: { msg: '比赛已删除' + moved } });
        })
        .catch(function (e) { self.showToast(e.message, 'warn'); })
        .then(function () { self.deleting = false; });
    },
    askReset: function () { var self = this; this.ask('重置时钟？', '回到第 1 级、未开始的状态。操作日志会保留。', '重置', true, function () { self.send('reset'); }); },
    askApply: function (s) {
      var self = this, running = this.view.status === 'running' || this.view.status === 'paused';
      this.ask('使用「' + s.name + '」？', running ? '比赛进行中，已开始和当前的级别必须与新方案一致，否则会被拒绝。' : '这场比赛的盲注结构会换成这套方案。', '使用', false, function () {
        api.post('/api/tournaments/' + self.tid + '/scheme', { schemeId: s.id }).then(function () { self.showToast('已使用「' + s.name + '」', 'go'); }).catch(function (e) { self.showToast(e.message, 'warn'); });
      });
    },
    askDelete: function (s) {
      var self = this, n = (s.usedBy || []).length;
      this.ask('删除「' + s.name + '」？', n ? '有 ' + n + ' 场比赛正在使用它：这些比赛会保留现有的结构，但不再跟随这套方案更新。' : '删除后不能恢复。', '删除', true, function () {
        api.del('/api/schemes/' + s.id).then(function () { self.showToast('已删除', 'go'); self.loadSchemes(); }).catch(function (e) { self.showToast(e.message, 'warn'); });
      });
    },
    dupScheme: function (s) { var self = this; api.post('/api/schemes/' + s.id + '/duplicate').then(function () { self.showToast('已复制', 'go'); self.loadSchemes(); }).catch(function (e) { self.showToast(e.message, 'warn'); }); },
    /* 悬浮编辑页：编辑已有方案，或新建一套（从一级开始，“添加级别”会自动推算） */
    editScheme: function (s) { this.editing = s; },
    newScheme: function () { this.editing = {}; },
    useRecommended: function () {
      var self = this;
      addRecommendedScheme().then(function () { self.showToast('已加入推荐方案', 'go'); self.loadSchemes(); }).catch(function (e) { self.showToast(e.message, 'warn'); });
    },
    onSaved: function (s, msg) { this.editing = null; this.showToast(msg || '已保存', 'go'); this.loadSchemes(); },
    showToast: function (text, tone) {
      var self = this; this.toast = { text: text, tone: tone || 'go' };
      clearTimeout(this.toastTimer); this.toastTimer = setTimeout(function () { self.toast = null; }, 3000);
    }
  }
};
</script>

<style lang="scss">
@import '@/styles/remote.scss';
.ctl .net { font-size: 12px; color: $print; white-space: nowrap; }
.ctl .net .rm-dot { margin-right: 6px; vertical-align: 1px; }
.ctl-clock { padding-top: 16px; }
.c-row1 { display: -webkit-flex; display: flex; -webkit-justify-content: space-between; justify-content: space-between; font-size: 14px; color: $print; }
.c-word { font-weight: 900; letter-spacing: .1em; }
.c-word.is-go { color: $go; } .c-word.is-warn { color: $warn; } .c-word.is-stop { color: $stop; } .c-word.is-white { color: $white; }
.c-time { margin-top: 4px; text-align: center; font-family: $num; font-weight: 800; font-size: 96px; line-height: 1.05; letter-spacing: .02em; }
.c-time.is-dim { opacity: .5; }
.c-time.is-over { color: $stop; }
.c-blinds { text-align: center; font-family: $num; font-weight: 800; font-size: 30px; }
.c-blinds em { font-style: normal; font-size: 16px; color: $print; margin-left: 10px; font-family: $hei; font-weight: 400; }
.c-next { margin-top: 4px; text-align: center; font-size: 13px; color: $print; }
.chips { margin-top: 8px; }
.chip { margin: 0 6px 6px 0; height: 28px; padding: 0 10px; border-radius: 14px; border: 1px solid $rule; background: transparent; color: $print; font-size: 12px; cursor: pointer; }
.switch { font-size: 14px; display: -webkit-flex; display: flex; -webkit-align-items: center; align-items: center; }
.switch input { width: 18px; height: 18px; margin: 0 8px 0 0; }
.logrow { display: -webkit-flex; display: flex; padding: 7px 0; border-top: 1px solid #1A1A1A; font-size: 13px; }
.logrow:first-of-type { border-top: 0; }
.logrow .at { width: 70px; -webkit-flex: none; flex: none; font-family: $num; color: $print; }
.logrow .what { -webkit-flex: 1; flex: 1; min-width: 0; }
.logrow .who { -webkit-flex: none; flex: none; margin-left: 8px; color: $print; }
.jump { max-height: 46vh; overflow-y: auto; -webkit-overflow-scrolling: touch; border: 1px solid $rule; border-radius: 4px; }
.jrow { display: block; width: 100%; padding: 11px 12px; text-align: left; border: 0; border-top: 1px solid #1A1A1A; background: transparent; color: $white; font-size: 14px; cursor: pointer; }
.jrow:first-child { border-top: 0; }
.jrow.is-brk { color: $warn; }
.jrow.is-cur { background: $white; color: #050505; }
.fold-note { margin: 0 0 8px; }
/* 正在循环的文字：点一下填回输入框修改 */
.loop-now { display: -webkit-flex; display: flex; -webkit-align-items: center; align-items: center; margin-bottom: 10px; padding: 8px 10px; border: 1px solid #3A3220; border-radius: 4px; background: #15130C; }
.loop-text { -webkit-flex: 1; flex: 1; min-width: 0; padding: 0; border: 0; background: transparent; color: $warn; text-align: left; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
/* 播一次 / 循环播放 */
.seg { display: -webkit-flex; display: flex; margin-bottom: 8px; border: 1px solid $rule; border-radius: 4px; overflow: hidden; }
.seg button { -webkit-flex: 1; flex: 1; height: 34px; border: 0; background: transparent; color: $print; font-size: 14px; cursor: pointer; }
.seg button + button { border-left: 1px solid $rule; }
.seg button.is-on { background: $white; color: #050505; font-weight: 700; }
/* 宽屏：左列固定显示倒计时与播放器，右侧卡片两两一行 */
@media (min-width: 1024px) {
  .rm-wrap.ctl-grid { max-width: 1320px; display: -webkit-flex; display: flex; -webkit-align-items: flex-start; align-items: flex-start; }
  .ctl-main { width: 440px; -webkit-flex: none; flex: none; position: -webkit-sticky; position: sticky; top: 54px; }
  .ctl-side { -webkit-flex: 1; flex: 1; min-width: 0; margin-left: 16px; display: -webkit-flex; display: flex; -webkit-flex-wrap: wrap; flex-wrap: wrap;
    -webkit-align-items: flex-start; align-items: flex-start; -webkit-justify-content: space-between; justify-content: space-between; }
  .ctl-side > .rm-card { width: calc(50% - 8px); }
}
</style>
