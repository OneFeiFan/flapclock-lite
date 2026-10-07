<template>
  <div class="pc">
    <div class="pc-keys">
      <button class="pc-side" :class="{ 'is-holding': holding === 'prev' }" :disabled="disabled || !canPrev"
        @touchstart.prevent="hold('prev')" @touchend.prevent="release" @touchcancel="release" @mousedown="hold('prev')" @mouseup="release" @mouseleave="release">
        <span class="ic">⏮</span><span class="lb">上一级</span><i class="fill"></i>
      </button>
      <button class="pc-main" :class="'is-' + mainTone" :disabled="disabled || mainDisabled" @click="$emit('cmd', mainType)">
        <span class="ic">{{ mainIcon }}</span><span class="lb">{{ mainLabel }}</span>
      </button>
      <button class="pc-side" :class="{ 'is-holding': holding === 'next' }" :disabled="disabled || !canNext"
        @touchstart.prevent="hold('next')" @touchend.prevent="release" @touchcancel="release" @mousedown="hold('next')" @mouseup="release" @mouseleave="release">
        <span class="ic">⏭</span><span class="lb">下一级</span><i class="fill"></i>
      </button>
    </div>
    <div class="pc-hint">上一级、下一级需要长按</div>

    <div ref="track" class="pc-track" :class="{ 'is-drag': dragging, 'is-off': !seekable }"
      @touchstart="dragStart" @touchmove.prevent="dragMove" @touchend="dragEnd" @mousedown="dragStart">
      <div class="pc-done" :style="{ width: shownPct + '%' }"></div>
      <div class="pc-thumb" :style="{ left: shownPct + '%' }"></div>
    </div>
    <div class="pc-times">
      <button class="pc-step" :disabled="disabled || !seekable" @click="$emit('cmd', 'add', { deltaMs: -60000 })">−1 分</button>
      <span class="pc-label">{{ dragging ? '松手设为剩余 ' + previewText : '已过 ' + elapsedText + '　剩余 ' + remainText }}</span>
      <button class="pc-step" :disabled="disabled || !seekable" @click="$emit('cmd', 'add', { deltaMs: 60000 })">+1 分</button>
    </div>
  </div>
</template>

<script>
/*
 * 播放器式遥控：中间开始 / 暂停 / 继续；两侧长按 0.6 秒切换级别（防误触）；
 * 进度条显示本级已过时间，拖动预览剩余时间，松手才下发“设定剩余时间”。触摸和鼠标都支持。
 */
import { mmss } from '@shared/clock.mjs';

var HOLD_MS = 600;

export default {
  name: 'PlayerControl',
  props: {
    status: { type: String, default: 'pristine' },
    levelMs: { type: Number, default: 0 },
    remainMs: { type: Number, default: 0 },
    canPrev: Boolean, canNext: Boolean, disabled: Boolean
  },
  data: function () { return { holding: '', dragging: false, dragPct: 0 }; },
  computed: {
    mainType: function () { return this.status === 'pristine' ? 'start' : this.status === 'paused' ? 'resume' : this.status === 'running' ? 'pause' : 'start'; },
    mainLabel: function () { return { pristine: '开始比赛', paused: '继续', running: '暂停', finished: '比赛已结束' }[this.status] || '开始'; },
    mainIcon: function () { return this.status === 'running' ? '❚❚' : '▶'; },
    mainTone: function () { return this.status === 'running' ? 'stop' : this.status === 'finished' ? 'off' : 'go'; },
    mainDisabled: function () { return this.status === 'finished'; },
    seekable: function () { return (this.status === 'running' || this.status === 'paused') && this.levelMs > 0; },
    elapsedPct: function () { return this.levelMs > 0 ? Math.max(0, Math.min(100, (1 - Math.max(0, this.remainMs) / this.levelMs) * 100)) : 0; },
    shownPct: function () { return this.dragging ? this.dragPct : this.elapsedPct; },
    previewMs: function () { return Math.max(1000, Math.round(this.levelMs * (1 - this.dragPct / 100) / 1000) * 1000); },
    previewText: function () { return mmss(Math.round(this.previewMs / 1000)); },
    elapsedText: function () { return mmss(Math.round(Math.max(0, this.levelMs - Math.max(0, this.remainMs)) / 1000)); },
    remainText: function () { return mmss(Math.ceil(Math.max(0, this.remainMs) / 1000)); }
  },
  beforeDestroy: function () { clearTimeout(this.holdTimer); this.unbindMouse(); },
  methods: {
    hold: function (type) {
      var self = this; clearTimeout(this.holdTimer); this.holding = type;
      this.holdTimer = setTimeout(function () { self.holding = ''; self.$emit('cmd', type); }, HOLD_MS);
    },
    release: function () { clearTimeout(this.holdTimer); this.holding = ''; },
    pctAt: function (ev) {
      var r = this.$refs.track.getBoundingClientRect(), p = ev.touches && ev.touches.length ? ev.touches[0] : (ev.changedTouches && ev.changedTouches.length ? ev.changedTouches[0] : ev);
      return Math.max(0, Math.min(100, (p.clientX - r.left) / r.width * 100));
    },
    dragStart: function (ev) {
      if (this.disabled || !this.seekable) return;
      this.dragging = true; this.dragPct = this.pctAt(ev);
      if (!ev.touches) { var self = this; this.onMove = function (e) { self.dragMove(e); }; this.onUp = function (e) { self.dragEnd(e); }; document.addEventListener('mousemove', this.onMove); document.addEventListener('mouseup', this.onUp); }
    },
    dragMove: function (ev) { if (this.dragging) this.dragPct = this.pctAt(ev); },
    dragEnd: function (ev) {
      if (!this.dragging) return;
      if (ev && (ev.changedTouches || ev.clientX !== undefined)) this.dragPct = this.pctAt(ev);
      this.dragging = false; this.unbindMouse();
      this.$emit('cmd', 'setRemaining', { ms: this.previewMs });
    },
    unbindMouse: function () { if (this.onMove) { document.removeEventListener('mousemove', this.onMove); document.removeEventListener('mouseup', this.onUp); this.onMove = null; } }
  }
};
</script>

<style lang="scss">
/* 卡片已有左右留白，这里不再加，避免窄屏放不下三个按钮 */
.pc { padding: 16px 0 12px; }
.pc-keys { display: -webkit-flex; display: flex; -webkit-align-items: center; align-items: center; -webkit-justify-content: center; justify-content: center; }
/* 圆形按钮：不允许被压缩（否则宽度变窄成椭圆），清掉浏览器默认的按钮样式与内边距 */
.pc .pc-side, .pc .pc-main { -webkit-flex: none; flex: none; -webkit-appearance: none; appearance: none; padding: 0; box-sizing: border-box; }
.pc button { -webkit-tap-highlight-color: transparent; font-family: $hei; cursor: pointer; }
.pc button:disabled { opacity: .35; cursor: default; }
.pc-side { position: relative; overflow: hidden; width: 92px; height: 92px; border-radius: 50%; border: 2px solid $rule; background: $flap; color: $white;
  display: -webkit-flex; display: flex; -webkit-flex-direction: column; flex-direction: column; -webkit-align-items: center; align-items: center; -webkit-justify-content: center; justify-content: center; }
.pc-side .ic { font-size: 26px; line-height: 1; }
.pc-side .lb { margin-top: 6px; font-size: 13px; color: $print; }
.pc-side .fill { position: absolute; left: 0; bottom: 0; width: 100%; height: 0; background: rgba(242, 242, 238, .16); }
.pc-side.is-holding .fill { height: 100%; -webkit-transition: height .6s linear; transition: height .6s linear; }
.pc .pc-main { margin: 0 20px; }
.pc-main { width: 132px; height: 132px; border-radius: 50%; border: 0; color: #050505;
  display: -webkit-flex; display: flex; -webkit-flex-direction: column; flex-direction: column; -webkit-align-items: center; align-items: center; -webkit-justify-content: center; justify-content: center; }
.pc-main.is-go { background: $go; }
.pc-main.is-stop { background: $stop; }
.pc-main.is-off { background: $flap; color: $print; }
.pc-main .ic { font-size: 40px; line-height: 1; }
.pc-main .lb { margin-top: 8px; font-size: 16px; font-weight: 900; letter-spacing: .08em; }
/* 按屏幕宽度分三档，保证三个按钮放得下且彼此留有间距 */
@media (max-width: 413px) {
  .pc-side { width: 80px; height: 80px; }
  .pc-main { width: 120px; height: 120px; }
  .pc .pc-main { margin: 0 16px; }
  .pc-main .ic { font-size: 36px; }
}
/* 最窄一档：320 宽的屏幕可用约 266px，三个按钮加间距共 256px */
@media (max-width: 374px) {
  .pc-side { width: 66px; height: 66px; }
  .pc-side .ic { font-size: 22px; }
  .pc-side .lb { margin-top: 4px; font-size: 12px; }
  .pc-main { width: 100px; height: 100px; }
  .pc .pc-main { margin: 0 12px; }
  .pc-main .ic { font-size: 32px; }
  .pc-main .lb { margin-top: 6px; font-size: 14px; }
}
.pc-hint { margin-top: 10px; text-align: center; font-size: 12px; color: #5A5A58; }
.pc-track { position: relative; height: 34px; margin-top: 18px; cursor: pointer; touch-action: none; }
.pc-track::before { content: ''; position: absolute; left: 0; right: 0; top: 15px; height: 4px; background: #262626; }
.pc-done { position: absolute; left: 0; top: 15px; height: 4px; background: $white; }
.pc-thumb { position: absolute; top: 7px; width: 20px; height: 20px; margin-left: -10px; border-radius: 50%; background: $white; }
.pc-track.is-drag .pc-thumb { -webkit-transform: scale(1.3); transform: scale(1.3); }
.pc-track.is-off { opacity: .35; cursor: default; }
.pc-times { display: -webkit-flex; display: flex; -webkit-align-items: center; align-items: center; -webkit-justify-content: space-between; justify-content: space-between; margin-top: 4px; }
.pc-label { font-size: 13px; color: $print; font-family: $num; letter-spacing: .02em; }
.pc-step { height: 36px; padding: 0 14px; border-radius: 18px; border: 1px solid $rule; background: transparent; color: $white; font-size: 14px; }
</style>
