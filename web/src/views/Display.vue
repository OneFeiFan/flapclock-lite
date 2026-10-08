<template>
  <div class="display" @click="unlock">
    <div class="dp-screen" :style="screenStyle">
      <div class="dp-shift" :style="shiftStyle">
        <pairing v-if="phase === 'pair'" :device-id="deviceId" :device-label="deviceLabel" />
        <component :is="themeComp" v-else-if="phase === 'board'" :clock="clock" :messages="messages" :settings="settings" />
        <div v-else-if="phase === 'replaced'" class="dp-cover">
          <div class="t">这块屏幕已在另一个窗口打开</div>
          <div class="s">同一台设备的同一个浏览器只算一块屏幕，后打开的窗口会接替显示。</div>
          <div class="s">要在这台设备上再显示一块屏幕，请在地址后面加上编号，例如 {{ exampleUrl }}</div>
          <button class="dp-btn" @click.stop="takeOver">在这里继续显示</button>
        </div>
        <div v-else class="dp-boot">
          <div class="t">翻牌钟</div>
          <div class="s">{{ linkStatus === 'offline' ? '暂时连不上服务器，正在重试' : '正在连接服务器' }}</div>
        </div>
      </div>
      <div ref="flash" class="dp-flash"></div>
      <div v-if="ident" class="dp-ident"><div class="n">{{ ident }}</div><div class="i">本机编号 {{ deviceLabel }}</div></div>
    </div>
    <div v-if="phase === 'board' && linkStatus !== 'online'" class="dp-net">离线运行中，时间照常走</div>
    <div v-if="hint" class="dp-hint">{{ hint }}</div>
  </div>
</template>

<script>
/* 大屏页：只负责连接、配对、提醒与屏幕保护；画面交给主题组件（PRD 第 7 章）
 * 每台设备第一次打开时生成自己的编号并保存在浏览器里，服务器按编号把它当作一块独立的屏幕。
 * 同一台设备需要显示多块屏幕时（例如一台电脑接两块显示器），在地址后加 ?screen=2 区分。 */
import Link from '@/lib/link';
import ClockModel from '@/lib/clock';
import MessageStore from '@/lib/messages';
import Alerts from '@/lib/alerts';
import * as voice from '@/lib/voice';
import { voicePreload } from '@shared/voice.mjs';
import { keepAwake } from '@/lib/wakelock';
import { storage, uuid, origin, REDUCED } from '@/lib/util';
import { themeOf } from '@/themes';
import { LANE } from '@shared/clock.mjs';
import Pairing from './display/Pairing.vue';

export default {
  name: 'DisplayView',
  components: { Pairing: Pairing },
  data: function () {
    return { phase: 'boot', settings: {}, linkStatus: 'connecting', scale: 1, ox: 0, oy: 0, shiftN: 0, hint: '',
      messages: new MessageStore(), deviceId: '', deviceLabel: '', ident: '', screenVoice: false };
  },
  computed: {
    themeComp: function () { return themeOf(this.settings.theme).component; },
    screenStyle: function () { var t = 'translate(' + this.ox + 'px,' + this.oy + 'px) scale(' + this.scale + ')'; return { WebkitTransform: t, transform: t }; },
    shiftStyle: function () {
      var P = [[0, 0], [2, 1], [-1, 2], [-2, -1], [1, -2]], p = P[this.shiftN % P.length], t = 'translate(' + p[0] + 'px,' + p[1] + 'px)';   // 防烧屏：每 10 分钟整体微移
      return { WebkitTransform: t, transform: t };
    },
    exampleUrl: function () { return origin() + '#/display?screen=2'; }
  },
  created: function () {
    /* 设备编号：在电视 APK 外壳里优先用外壳的安装号（清浏览器缓存也不会变）；普通浏览器里生成并保存在本地 */
    var shell = '';
    try { if (window.TvDeviceBridge && window.TvDeviceBridge.getInstallationId) shell = String(window.TvDeviceBridge.getInstallationId() || ''); } catch (e) { shell = ''; }
    shell = shell.replace(/[^0-9A-Za-z-]/g, '').slice(0, 40);
    var base = shell ? 'tv-' + shell : (storage('flapclock.device') || uuid());
    if (!shell) storage('flapclock.device', base);
    var slot = String(this.$route.query.screen || '').replace(/[^0-9A-Za-z_\u4e00-\u9fa5]/g, '').slice(0, 12);
    this.deviceId = slot ? base + '-' + slot : base;
    this.deviceLabel = base.slice(-6).toUpperCase() + (slot ? '-' + slot : '');
    this.clock = new ClockModel(null);
  },
  mounted: function () {
    var self = this;
    this.connect();
    this.alerts = new Alerts({ onFlash: function () { self.flash(); }, onVoice: function (name) { voice.play(name); } });
    this.fit(); window.addEventListener('resize', this.fit);
    document.addEventListener('keydown', this.onKey);
    this.timers = [
      setInterval(function () { self.checkAlerts(); }, 200),
      setInterval(function () { self.shiftN++; }, 10 * 60 * 1000),
      setInterval(function () { self.messages.prune(self.clock.now(), LANE.width, LANE.speed); }, 2000)
    ];
    // 电视 APK 外壳本身就是全屏，不需要提示
    if (!window.TvDeviceBridge) this.hint = '点一下屏幕或按遥控器确认键：进入全屏';
    this.hintTimer = setTimeout(function () { self.hint = ''; }, 15000);
  },
  beforeDestroy: function () {
    if (this.link) this.link.close(); this.timers.forEach(clearInterval); clearTimeout(this.hintTimer); clearTimeout(this.identTimer);
    window.removeEventListener('resize', this.fit); document.removeEventListener('keydown', this.onKey);
  },
  methods: {
    connect: function () {
      var self = this;
      this.link = new Link({
        hello: function () { return { t: 'hello', role: 'display', deviceId: self.deviceId, label: self.deviceLabel }; },
        onMessage: function (m) { self.onMessage(m); },
        onStatus: function (s) { self.linkStatus = s; }
      });
      this.clock.link = this.link;
    },
    takeOver: function () { this.phase = 'boot'; this.connect(); },
    onMessage: function (m) {
      if (m.t === 'hello') { if (m.paired === false) this.phase = 'pair'; }   // 待机：等手机为它选择比赛
      else if (m.t === 'replaced') { this.link.close(); this.phase = 'replaced'; this.clock.snap = null; this.messages.clear(); this.alerts.reset(); }
      else if (m.t === 'paired') { /* 已选择比赛，随后的快照会切到计时画面 */ }
      else if (m.t === 'display') { this.screenVoice = !!m.voice; this.preloadVoice(); }   // 这块屏幕是否播报语音（手机上的屏幕设置）
      else if (m.t === 'identify') { var self = this; this.ident = m.name; clearTimeout(this.identTimer); this.identTimer = setTimeout(function () { self.ident = ''; }, 6000); }
      else if (m.t === 'snap') {
        if (this.clock.snap && this.clock.snap.tid !== m.tid) { this.messages.clear(); this.alerts.reset(); }
        if (this.clock.set(m)) { this.settings = m.settings || {}; this.phase = 'board'; this.preloadVoice(); }
      }
      else if (m.t === 'msg') this.messages.add(m.m);
      else if (m.t === 'msgs') { var ms = this.messages; (m.list || []).forEach(function (x) { ms.add(x); }); }
      else if (m.t === 'retract') this.messages.retract(m.id);
      else if (m.t === 'unpaired') { this.phase = 'pair'; this.clock.snap = null; this.messages.clear(); this.alerts.reset(); }
    },
    checkAlerts: function () {
      if (this.phase !== 'board') return;
      var r = this.clock.read(); if (!r) return;
      this.alerts.update(r, { flash: this.settings.flash !== false && !REDUCED, voice: this.screenVoice ? this.settings.voice || null : null });
    },
    /** 开了语音的屏幕：提前加载固定句子和当前、之后两个级别的语音，到点直接播放 */
    preloadVoice: function () {
      var s = this.clock.snap; if (!this.screenVoice || !s) return;
      var li = this.clock.read() ? this.clock.read().c.li : 0;
      voice.preload(voicePreload(s.structure.levels, li));
    },
    flash: function () {
      var el = this.$refs.flash; if (!el) return;
      el.className = 'dp-flash is-on';
      setTimeout(function () { el.className = 'dp-flash'; }, 160);
    },
    unlock: function () {
      keepAwake(); this.hint = '';
      var d = document.documentElement, fs = d.requestFullscreen || d.webkitRequestFullscreen;
      if (fs && !document.fullscreenElement && !document.webkitFullscreenElement) { try { var p = fs.call(d); if (p && p.catch) p.catch(function () {}); } catch (e) { /* 不支持全屏 */ } }
    },
    onKey: function (e) {
      if (this.phase === 'replaced' && (e.keyCode === 13 || e.keyCode === 23)) { this.takeOver(); return; }
      if (e.keyCode === 13 || e.keyCode === 23 || e.keyCode === 32) this.unlock();
    },
    fit: function () {
      var w = window.innerWidth, h = window.innerHeight, s = Math.min(w / 1920, h / 1080);
      this.scale = s; this.ox = (w - 1920 * s) / 2; this.oy = (h - 1080 * s) / 2;
    }
  }
};
</script>

<style lang="scss">
.display { position: fixed; left: 0; top: 0; right: 0; bottom: 0; overflow: hidden; background: $black; cursor: none; }
.dp-screen { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; -webkit-transform-origin: 0 0; transform-origin: 0 0; overflow: hidden; }
.dp-shift { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; }
.dp-boot { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; background: $black; color: $white; font-family: $hei; font-weight: 900; text-align: center; padding-top: 420px; }
.dp-boot .t { font-size: 96px; letter-spacing: .1em; }
.dp-boot .s { margin-top: 30px; font-size: 32px; color: $print; }
.dp-cover { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; padding: 300px 180px 0; background: $black; color: $white; font-family: $hei; font-weight: 900; cursor: default; }
.dp-cover .t { font-size: 64px; letter-spacing: .04em; margin-bottom: 40px; }
.dp-cover .s { font-size: 30px; color: $print; line-height: 1.7; }
.dp-btn { margin-top: 56px; height: 88px; padding: 0 48px; background: $white; color: #000; border: 0; border-radius: 4px; font-family: $hei; font-weight: 900; font-size: 34px; letter-spacing: .08em; cursor: pointer; }
.dp-flash { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; background: #fff; opacity: 0; pointer-events: none; transition: opacity .5s ease-out; }
.dp-flash.is-on { opacity: .22; transition: opacity .12s; }
.dp-ident { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; padding-top: 330px; background: rgba(5, 5, 5, .92); color: $white; font-family: $hei; font-weight: 900; text-align: center; }
.dp-ident .n { font-size: 180px; line-height: 1.1; letter-spacing: .06em; color: $warn; }
.dp-ident .i { margin-top: 40px; font-size: 40px; color: $print; letter-spacing: .06em; }
.dp-net { position: fixed; right: 14px; bottom: 10px; font-size: 12px; color: $print; opacity: .7; font-family: $ui; }
.dp-net:before { content: ''; display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: $stop; margin-right: 6px; vertical-align: 1px; }
.dp-hint { position: fixed; left: 50%; top: 2.5%; -webkit-transform: translateX(-50%); transform: translateX(-50%); padding: 10px 18px; background: rgba(0, 0, 0, .75); color: $white; font-size: 14px; font-family: $ui; border: 1px solid #333; border-radius: 3px; white-space: nowrap; }
</style>
