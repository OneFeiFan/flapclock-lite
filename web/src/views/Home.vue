<template>
  <div class="rm home">
    <header class="rm-top">
      <div class="ttl">翻牌钟</div>
      <button class="me" @click="openRename">{{ me }} ✎</button>
    </header>

    <div class="rm-wrap">
      <!-- 比赛 -->
      <section class="rm-card">
        <h3>比赛<button class="rm-btn is-sm is-primary" @click="openCreate">新建比赛</button></h3>
        <div v-if="loaded && !tournaments.length" class="rm-empty">还没有比赛，先新建一场</div>
        <router-link v-for="t in tournaments" :key="t.id" :to="'/t/' + t.id" class="rm-row tour">
          <div class="main">
            <b>{{ t.name }}</b><span class="rm-tag" :class="{ 'is-dim': t.status !== 'running' }">{{ statusText(t.status) }}</span>
            <div class="meta">{{ t.level || '—' }} · {{ t.schemeName || '未关联方案' }} · {{ t.screens }} 块屏</div>
          </div>
          <span class="go">›</span>
        </router-link>
      </section>

      <!-- 盲注方案：不用先建比赛，就能在这里准备方案 -->
      <section class="rm-card">
        <h3>盲注方案<small>{{ schemes.length }} / 5 套</small></h3>
        <scheme-list :schemes="schemes" @edit="editScheme" @dup="dupScheme" @del="askDelete" @create="editing = {}" @recommended="useRecommended" />
      </section>

      <!-- 屏幕 -->
      <section class="rm-card">
        <h3>屏幕<small>{{ onlineCount }} 块在线</small></h3>
        <div v-if="!displays.length" class="rm-empty">电视打开大屏页后会出现在这里。也可以用手机相机扫电视上的二维码，直接绑定。</div>
        <div v-for="d in displays" :key="d.id" class="rm-row">
          <div class="main">
            <i class="rm-dot" :class="{ 'is-on': d.online }"></i> <b>{{ d.name || '未命名屏幕' }}</b>
            <div class="meta">{{ d.tid ? '显示：' + tourName(d.tid) : '未绑定' }}<template v-if="d.code"> · 配对码 {{ d.code }}</template><template v-if="!d.online"> · 离线</template></div>
          </div>
          <div class="acts">
            <button v-if="!d.tid && d.code" class="rm-mini is-primary" @click="openPair(d.code)">绑定</button>
            <template v-else>
              <button class="rm-mini" :disabled="!d.online" @click="identify(d)">识别</button>
              <button class="rm-mini" @click="openScreen(d)">设置</button>
            </template>
          </div>
        </div>
      </section>
    </div>

    <div v-if="sheet" class="rm-mask" @click.self="sheet = ''">
      <div class="rm-sheet">
        <!-- 新建比赛 -->
        <template v-if="sheet === 'create'">
          <h3>新建比赛</h3>
          <label class="f">比赛名称</label><input v-model="form.name" type="text" maxlength="24" placeholder="例如：周五深筹赛">
          <label class="f">盲注方案</label>
          <select v-if="schemes.length" v-model="form.schemeId" @change="onSchemePick">
              <option v-for="s in schemes" :key="s.id" :value="s.id">{{ s.name }}（{{ s.plays }} 级）</option>
              <option value="__newscheme" :disabled="schemesFull">＋ 新建盲注方案…{{ schemesFull ? '（已满 5 套）' : '' }}</option>
              <option value="__recscheme" :disabled="schemesFull">＋ 使用推荐方案（18 级）{{ schemesFull ? '（已满 5 套）' : '' }}</option>
            </select>
            <div v-else class="noscheme">
              <p>还没有盲注方案，先准备一套：可以直接使用推荐方案（18 级，每级 20 分钟，每 4 级休息一次），也可以自己创建。之后都能修改。</p>
              <div class="rm-acts"><button class="rm-btn is-primary" :disabled="busy" @click="useRecommended">使用推荐方案</button><button class="rm-btn" @click="editing = {}">自己创建</button></div>
            </div>
          <div class="rm-acts"><button class="rm-btn" @click="sheet = ''">取消</button><button class="rm-btn is-primary" :disabled="busy || !form.name.trim() || !schemeReady" @click="create">创建</button></div>
        </template>

        <!-- 绑定屏幕 -->
        <template v-else-if="sheet === 'pair'">
          <h3>绑定这块屏幕</h3>
          <label class="f">配对码（电视屏幕上的 6 位数字）</label><input v-model="form.code" type="text" inputmode="numeric" maxlength="6">
          <label class="f">显示哪场比赛</label>
          <select v-model="form.tid">
            <option v-for="t in tournaments" :key="t.id" :value="t.id">{{ t.name }}</option>
            <option value="__new">＋ 新建一场比赛</option>
          </select>
          <template v-if="form.tid === '__new'">
            <label class="f">新比赛名称</label><input v-model="form.name" type="text" maxlength="24" placeholder="例如：周五深筹赛">
            <label class="f">盲注方案</label>
            <select v-if="schemes.length" v-model="form.schemeId" @change="onSchemePick">
              <option v-for="s in schemes" :key="s.id" :value="s.id">{{ s.name }}（{{ s.plays }} 级）</option>
              <option value="__newscheme" :disabled="schemesFull">＋ 新建盲注方案…{{ schemesFull ? '（已满 5 套）' : '' }}</option>
              <option value="__recscheme" :disabled="schemesFull">＋ 使用推荐方案（18 级）{{ schemesFull ? '（已满 5 套）' : '' }}</option>
            </select>
            <div v-else class="noscheme">
              <p>还没有盲注方案，先准备一套：可以直接使用推荐方案（18 级，每级 20 分钟，每 4 级休息一次），也可以自己创建。之后都能修改。</p>
              <div class="rm-acts"><button class="rm-btn is-primary" :disabled="busy" @click="useRecommended">使用推荐方案</button><button class="rm-btn" @click="editing = {}">自己创建</button></div>
            </div>
          </template>
          <label class="f">给屏幕起个名字</label><input v-model="form.screen" type="text" maxlength="16" placeholder="例如：大厅左">
          <div class="rm-acts"><button class="rm-btn" @click="sheet = ''">取消</button><button class="rm-btn is-primary" :disabled="busy || !canPair" @click="pair">绑定</button></div>
        </template>

        <!-- 屏幕设置 -->
        <template v-else-if="sheet === 'screen'">
          <h3>屏幕设置</h3>
          <label class="f">名称</label><input v-model="form.screen" type="text" maxlength="16">
          <label class="f">显示哪场比赛</label>
          <select v-model="form.tid"><option v-for="t in tournaments" :key="t.id" :value="t.id">{{ t.name }}</option></select>
          <div class="rm-acts"><button class="rm-btn" @click="sheet = ''">取消</button><button class="rm-btn is-primary" :disabled="busy" @click="saveScreen">保存</button></div>
          <button class="rm-btn is-danger is-wide" :disabled="busy" @click="unpair">解除绑定（屏幕回到配对页）</button>
        </template>

        <!-- 确认（删除方案） -->
        <template v-else-if="sheet === 'confirm'">
          <h3>{{ confirm.title }}</h3>
          <p>{{ confirm.text }}</p>
          <div class="rm-acts"><button class="rm-btn" @click="sheet = ''">取消</button><button class="rm-btn is-danger" @click="runConfirm">{{ confirm.ok }}</button></div>
        </template>

        <!-- 本机名称 -->
        <template v-else-if="sheet === 'rename'">
          <h3>本机名称</h3>
          <p>操作日志里会用这个名字记录是谁做的操作。</p>
          <input v-model="form.me" type="text" maxlength="16">
          <div class="rm-acts"><button class="rm-btn" @click="sheet = ''">取消</button><button class="rm-btn is-primary" :disabled="!form.me.trim()" @click="saveMe">保存</button></div>
        </template>
      </div>
    </div>
    <!-- 在首页直接创建方案（还没有方案时） -->
    <scheme-editor v-if="editing" :scheme="editing.id ? editing : null" :count="schemes.length" @close="onEditorClose" @saved="onSchemeSaved" />
    <div v-if="toast" class="rm-toast" :class="'is-' + toast.tone">{{ toast.text }}</div>
  </div>
</template>

<script>
/*
 * 手机遥控首页：比赛列表、屏幕列表、扫码绑定、本机名称。
 * 电视配对页的二维码指向 /#/?pair=配对码，打开后直接弹出“绑定这块屏幕”。
 */
import api from '@/lib/api';
import { adminLink, clientName, setClientName } from '@/lib/client';
import { addRecommendedScheme } from '@/lib/schemes';
import SchemeEditor from '@/components/SchemeEditor.vue';
import SchemeList from '@/components/SchemeList.vue';
import { MAX_SCHEMES } from '@shared/structure.mjs';

var STATUS = { pristine: '未开始', running: '进行中', paused: '暂停', finished: '已结束' };

export default {
  name: 'HomeView',
  components: { SchemeEditor: SchemeEditor, SchemeList: SchemeList },
  data: function () {
    return { me: clientName(), loaded: false, tournaments: [], displays: [], schemes: [], sheet: '', busy: false, toast: null, editing: null, confirm: {}, lastSchemeId: '', picking: false,
      form: { name: '', schemeId: '', code: '', tid: '', screen: '', me: '', displayId: '' } };
  },
  computed: {
    onlineCount: function () { return this.displays.filter(function (d) { return d.online; }).length; },
    schemesFull: function () { return this.schemes.length >= MAX_SCHEMES; },
    /** 选中的是一套真正的方案（不是“新建”“推荐”这两个特殊选项） */
    schemeReady: function () { var id = this.form.schemeId; return !!id && id.indexOf('__') !== 0; },
    canPair: function () {
      var f = this.form;
      return /^\d{6}$/.test(f.code.trim()) && f.tid && (f.tid !== '__new' || (f.name.trim() && this.schemeReady));
    }
  },
  created: function () {
    var self = this;
    this.connect();
    Promise.all([this.loadTournaments(), this.loadSchemes(), api.get('/api/displays').then(function (l) { self.displays = l; })]).then(function () {
      self.loaded = true;
      var code = String(self.$route.query.pair || '');
      if (code) { self.$router.replace({ path: '/' }); self.openPair(code); }
    }).catch(function (e) { self.loaded = true; self.showToast(e.message, 'warn'); });
  },
  beforeDestroy: function () { this.link.close(); clearTimeout(this.toastTimer); },
  methods: {
    loadTournaments: function () { var self = this; return api.get('/api/tournaments').then(function (l) { self.tournaments = l; }); },
    loadSchemes: function () { var self = this; return api.get('/api/schemes').then(function (l) { self.schemes = l; }); },
    statusText: function (s) { return STATUS[s] || s; },
    tourName: function (tid) { var t = this.tournaments.find(function (x) { return x.id === tid; }); return t ? t.name : '已删除的比赛'; },
    defaultScheme: function () { return this.schemes.length ? this.schemes[0].id : ''; },
    /** 加入推荐方案；在新建比赛 / 绑定的弹层里时同时选中它 */
    useRecommended: function () {
      var self = this, inSheet = this.sheet === 'create' || this.sheet === 'pair'; this.busy = true;
      addRecommendedScheme().then(function (s) {
        self.showToast('已加入推荐方案，可以随时修改', 'go');
        return self.loadSchemes().then(function () { if (inSheet) { self.form.schemeId = s.id; self.lastSchemeId = s.id; } });
      }).catch(function (e) { self.showToast(e.message, 'warn'); if (inSheet) self.form.schemeId = self.lastSchemeId; })
        .then(function () { self.busy = false; });
    },
    /** 下拉框里选了“新建盲注方案”或“使用推荐方案”；记住之前选的方案，取消时恢复 */
    onSchemePick: function () {
      var id = this.form.schemeId;
      if (id === '__newscheme') { this.picking = true; this.editing = {}; }
      else if (id === '__recscheme') this.useRecommended();
      else this.lastSchemeId = id;
    },
    onEditorClose: function () {
      this.editing = null;
      if (this.picking) { this.picking = false; this.form.schemeId = this.lastSchemeId; }
    },
    onSchemeSaved: function (s, msg) {
      var self = this, select = this.picking || (!this.editing.id && (this.sheet === 'create' || this.sheet === 'pair'));
      this.editing = null; this.picking = false; this.showToast(msg || '方案已保存', 'go');
      this.loadSchemes().then(function () { if (select) { self.form.schemeId = s.id; self.lastSchemeId = s.id; } });
    },
    editScheme: function (s) { this.editing = s; },
    dupScheme: function (s) { var self = this; api.post('/api/schemes/' + s.id + '/duplicate').then(function () { self.showToast('已复制', 'go'); self.loadSchemes(); }).catch(function (e) { self.showToast(e.message, 'warn'); }); },
    askDelete: function (s) {
      var self = this, n = (s.usedBy || []).length;
      this.confirm = { title: '删除「' + s.name + '」？', ok: '删除', text: n ? '有 ' + n + ' 场比赛正在使用它：这些比赛会保留现有的结构，但不再跟随这套方案更新。' : '删除后不能恢复。',
        run: function () { api.del('/api/schemes/' + s.id).then(function () { self.showToast('已删除', 'go'); self.loadSchemes(); }).catch(function (e) { self.showToast(e.message, 'warn'); }); } };
      this.sheet = 'confirm';
    },
    runConfirm: function () { var run = this.confirm.run; this.sheet = ''; if (run) run(); },
    openCreate: function () { this.form.name = ''; this.form.schemeId = this.lastSchemeId = this.defaultScheme(); this.sheet = 'create'; },
    create: function () {
      var self = this; this.busy = true;
      api.post('/api/tournaments', { name: this.form.name.trim(), schemeId: this.form.schemeId })
        .then(function (t) { self.sheet = ''; self.$router.push('/t/' + t.id); })
        .catch(function (e) { self.showToast(e.message, 'warn'); })
        .then(function () { self.busy = false; });
    },
    openPair: function (code) {
      var f = this.form;
      f.code = String(code || ''); f.tid = this.tournaments.length ? this.tournaments[0].id : '__new';
      f.name = ''; f.schemeId = this.lastSchemeId = this.defaultScheme(); f.screen = '';
      this.sheet = 'pair';
    },
    pair: function () {
      var self = this, f = this.form; this.busy = true;
      var ready = f.tid === '__new'
        ? api.post('/api/tournaments', { name: f.name.trim(), schemeId: f.schemeId }).then(function (t) { return t.id; })
        : Promise.resolve(f.tid);
      ready.then(function (tid) { return api.post('/api/displays/pair', { code: f.code.trim(), tid: tid, name: f.screen.trim() }); })
        .then(function (d) { self.sheet = ''; self.showToast('已绑定「' + (d.name || '屏幕') + '」', 'go'); self.loadTournaments(); })
        .catch(function (e) { self.showToast(e.message, 'warn'); })
        .then(function () { self.busy = false; });
    },
    openScreen: function (d) { this.form.displayId = d.id; this.form.screen = d.name || ''; this.form.tid = d.tid || (this.tournaments[0] && this.tournaments[0].id) || ''; this.sheet = 'screen'; },
    saveScreen: function () {
      var self = this; this.busy = true;
      api.put('/api/displays/' + this.form.displayId, { name: this.form.screen.trim(), tid: this.form.tid })
        .then(function () { self.sheet = ''; self.showToast('已保存', 'go'); })
        .catch(function (e) { self.showToast(e.message, 'warn'); })
        .then(function () { self.busy = false; });
    },
    unpair: function () {
      var self = this; this.busy = true;
      api.del('/api/displays/' + this.form.displayId)
        .then(function () { self.sheet = ''; self.showToast('已解除绑定', 'go'); })
        .catch(function (e) { self.showToast(e.message, 'warn'); })
        .then(function () { self.busy = false; });
    },
    identify: function (d) { var self = this; api.post('/api/displays/' + d.id + '/identify').then(function () { self.showToast('「' + (d.name || '屏幕') + '」正在显示名字', 'go'); }).catch(function (e) { self.showToast(e.message, 'warn'); }); },
    openRename: function () { this.form.me = this.me; this.sheet = 'rename'; },
    /** 实时连接：屏幕上下线、比赛列表、方案库变化时自动刷新 */
    connect: function () {
      var self = this;
      this.link = adminLink({ onMessage: function (m) {
        if (m.t === 'presence') self.displays = m.displays;
        else if (m.t === 'tournaments') self.loadTournaments();
        else if (m.t === 'schemes') self.loadSchemes();
      } });
    },
    /** 改名后用新名字重连，之后的操作都记在新名字下 */
    saveMe: function () { this.me = setClientName(this.form.me); this.sheet = ''; this.link.close(); this.connect(); },
    showToast: function (text, tone) {
      var self = this; this.toast = { text: text, tone: tone || 'go' };
      clearTimeout(this.toastTimer); this.toastTimer = setTimeout(function () { self.toast = null; }, 3000);
    }
  }
};
</script>

<style lang="scss">
@import '@/styles/remote.scss';
.home .me { height: 32px; padding: 0 12px; border-radius: 16px; border: 1px solid $rule; background: transparent; color: $print; font-size: 13px; cursor: pointer; }
.home .tour { color: $white; text-decoration: none; }
.home .tour .go { font-size: 22px; color: $print; margin-left: 10px; }
.home .noscheme p { margin: 0; font-size: 13px; line-height: 1.6; color: $print; }
.home .noscheme .rm-acts { margin-top: 10px; }
</style>
