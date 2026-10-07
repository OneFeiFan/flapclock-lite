<template>
  <div class="mbar">
    <div class="mbar-lane">
      <div v-for="m in store.items" :key="m.id" :ref="'m' + m.id" class="mbar-msg" :class="['is-' + m.type, { 'is-gone': m.gone }]">
        <span v-if="m.type === 'notice'" class="tag">公告</span><span v-else-if="m.type !== 'loop' && m.from" class="from">{{ m.from }}</span><span class="txt">{{ m.text }}</span>
      </div>
    </div>
  </div>
</template>

<script>
/* 消息栏：位置 = 宽度 − 速度 ×（服务器当前时刻 − 进场时刻），每块屏同一公式，所以位置同步 */
import { LANE } from '@shared/clock.mjs';
import { REDUCED } from '@/lib/util';

export default {
  name: 'MessageBar',
  props: { store: { type: Object, required: true }, clock: { type: Object, required: true } },
  mounted: function () { var self = this; (function loop() { self.frame(); self.raf = requestAnimationFrame(loop); })(); },
  beforeDestroy: function () { cancelAnimationFrame(this.raf); },
  methods: {
    frame: function () {
      var now = this.clock.now(), refs = this.$refs;
      this.store.items.forEach(function (m) {
        var el = (refs['m' + m.id] || [])[0]; if (!el) return;
        var x;
        if (REDUCED) { var slot = (m.estW + LANE.gap) / LANE.speed * 1000; x = now >= m.startAt && now < m.startAt + slot ? (LANE.width - el.offsetWidth) / 2 : LANE.width + 60; }
        else x = LANE.width - LANE.speed * (now - m.startAt) / 1000;
        var v = 'translate3d(' + x.toFixed(1) + 'px,0,0)';
        el.style.webkitTransform = v; el.style.transform = v;
      });
    }
  }
};
</script>

<style lang="scss">
.mbar { position: relative; width: 1776px; height: 110px; overflow: hidden;
  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 70px, #000 1706px, transparent 1776px);
  mask-image: linear-gradient(90deg, transparent 0, #000 70px, #000 1706px, transparent 1776px); }
.mbar-lane { position: absolute; left: 0; top: 0; right: 0; bottom: 0; }
.mbar-msg { position: absolute; left: 0; top: 24px; height: 62px; display: -webkit-flex; display: flex; -webkit-align-items: center; align-items: center;
  white-space: nowrap; font-family: $hei; font-weight: 900; font-size: 46px; color: $white; letter-spacing: .02em;
  -webkit-transform: translate3d(1900px, 0, 0); transform: translate3d(1900px, 0, 0); will-change: transform; transition: opacity .3s; }
.mbar-msg.is-gone { opacity: 0; }
.mbar-msg .tag { display: inline-block; height: 44px; line-height: 44px; padding: 0 14px; margin-right: 18px; border-radius: 2px;
  background: $warn; color: #000; font-size: 26px; letter-spacing: .08em; }
.mbar-msg .from { margin-right: 18px; font-size: 30px; color: $print; }
</style>
