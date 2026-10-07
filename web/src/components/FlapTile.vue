<template>
  <div class="flap" :style="boxStyle">
    <div class="win" :style="winStyle">
      <div class="h t"><b ref="t" :style="glyphStyle"></b><i ref="sT" class="sh"></i></div>
      <div class="h b"><b ref="b" :style="glyphStyle"></b><i ref="sB" class="sh sh-grad"></i></div>
      <div ref="lt" class="l lt"><b ref="ltb" :style="glyphStyle"></b><i ref="sLT" class="sh"></i></div>
      <div ref="lb" class="l lb"><b ref="lbb" :style="glyphStyle"></b><i ref="sLB" class="sh"></i></div>
    </div>
    <span class="hinge" :style="hingeStyle"></span>
    <span class="pin" :style="pinL"></span><span class="pin" :style="pinR"></span>
  </div>
</template>

<script>
/* 一块翻片。每次走时是一次完整的物理翻动：上半片受重力加速落下，下半片砸到底后回弹两次（PRD 7.4）。
 * 动画用 CSS 过渡 + 定时器实现，不依赖 Web Animations 的 finished，老电视浏览器也能跑。
 * 父组件通过 ref 调用 set(value, { animate, spins, delay }) 精确控制翻动。 */
import { REDUCED } from '@/lib/util';

var DIGITS = '0123456789'.split('');
var CJK = /([\u3000-\u303f\u3400-\u9fff\uff00-\uffef]+)/g;
var EASE_RELEASE = 'cubic-bezier(.55,.05,.95,.45)';
var EASE_FALL = 'cubic-bezier(.4,.3,.9,.75)';
function html(t) { return String(t === null || t === undefined ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(CJK, '<span class="k">$1</span>'); }
function tf(el, ms, ease, transform) {
  var s = el.style;
  if (ms) { s.webkitTransition = '-webkit-transform ' + ms + 'ms ' + ease; s.transition = 'transform ' + ms + 'ms ' + ease; }
  else { s.webkitTransition = 'none'; s.transition = 'none'; }
  s.webkitTransform = transform; s.transform = transform;
}
function op(el, ms, ease, v) { var s = el.style; s.webkitTransition = s.transition = ms ? 'opacity ' + ms + 'ms ' + ease : 'none'; s.opacity = v; }
function anim(el, v) { el.style.webkitAnimation = v; el.style.animation = v; }

export default {
  name: 'FlapTile',
  props: {
    value: { type: [String, Number], default: '' },
    w: { type: Number, default: 60 }, h: { type: Number, default: 90 }, fs: { type: Number, default: 88 },
    r: { type: Number, default: 3 }, hg: { type: Number, default: 3 }, pin: { type: Number, default: 6 },
    pool: { type: Array, default: function () { return DIGITS; } }
  },
  computed: {
    boxStyle: function () { return { width: this.w + 'px', height: this.h + 'px', borderRadius: this.r + 'px' }; },
    winStyle: function () { var p = this.h * 6 + 'px'; return { borderRadius: this.r + 'px', WebkitPerspective: p, perspective: p }; },
    glyphStyle: function () { return { fontSize: this.fs + 'px', lineHeight: this.h + 'px' }; },
    hingeStyle: function () { return { top: (this.h - this.hg) / 2 + 'px', height: this.hg + 'px' }; },
    pinL: function () { return { width: this.pin + 'px', height: this.pin + 'px', top: (this.h - this.pin) / 2 + 'px', left: -this.pin / 2 + 'px' }; },
    pinR: function () { return { width: this.pin + 'px', height: this.pin + 'px', top: (this.h - this.pin) / 2 + 'px', right: -this.pin / 2 + 'px' }; }
  },
  watch: { value: function (v) { this.set(v, { animate: true }); } },
  created: function () {
    this.cur = String(this.value); this.target = this.cur;
    this.spinLeft = 0; this.busy = false; this.wanted = false; this.heavy = true; this.stepMs = 90; this.timers = []; this.dead = false;
  },
  mounted: function () { this.paint(this.cur); },
  beforeDestroy: function () { this.dead = true; this.timers.forEach(clearTimeout); },
  methods: {
    paint: function (v) { this.cur = v; this.$refs.t.innerHTML = this.$refs.b.innerHTML = html(v); },
    set: function (v, o) {
      v = String(v); o = o || {};
      if (!o.animate && !this.busy && v === this.cur) return;
      if (o.animate) { this.wanted = true; this.heavy = o.heavy !== false; } else if (v !== this.target) this.wanted = false;
      this.target = v;
      if (!o.animate || REDUCED || document.hidden) { if (!this.busy) this.paint(v); return; }
      if (o.spins) this.spinLeft = Math.max(this.spinLeft, o.spins);
      if (o.stepMs) this.stepMs = o.stepMs;
      if (!this.busy) { this.busy = true; var self = this; this.later(function () { self.run(); }, o.delay || 0); }
    },
    run: function () {
      if (this.dead) return;
      if (this.cur === this.target && this.spinLeft <= 0) { this.busy = false; return; }
      if (this.spinLeft <= 0 && !this.wanted) { this.paint(this.target); this.busy = false; return; }
      var next, heavy = false, self = this;
      if (this.spinLeft > 0) {
        this.spinLeft--; var tries = 0;
        do { next = this.pool[Math.floor(Math.random() * this.pool.length)]; } while ((next === this.cur || next === this.target) && ++tries < 8);
      } else { next = this.target; heavy = this.heavy; }
      this.flip(next, heavy, function () { self.run(); });
    },
    flip: function (next, heavy, done) {
      var R = this.$refs, old = this.cur, self = this;
      this.cur = next;
      R.t.innerHTML = html(next); R.b.innerHTML = html(old); R.ltb.innerHTML = html(old); R.lbb.innerHTML = html(next);
      var fall = heavy ? 190 : Math.max(30, this.stepMs / 2), drop = heavy ? 160 : Math.max(30, this.stepMs / 2);
      anim(R.lb, 'none'); tf(R.lt, 0, '', 'rotateX(0deg)'); tf(R.lb, 0, '', 'rotateX(90deg)');
      op(R.sLT, 0, '', 0); op(R.sB, 0, '', 0); op(R.sT, 0, '', heavy ? 0.4 : 0); op(R.sLB, 0, '', heavy ? 0.5 : 0);
      R.lt.style.visibility = 'visible'; R.lb.style.visibility = 'visible';
      void R.lt.offsetWidth;
      tf(R.lt, fall, heavy ? EASE_RELEASE : 'ease-in', 'rotateX(-90deg)');           // 上半片落下
      if (heavy) { op(R.sLT, fall, 'ease-in', 0.55); op(R.sB, fall, 'ease-in', 0.45); op(R.sT, fall + 120, 'ease-out', 0); }
      function finish() {
        R.lb.style.visibility = 'hidden'; anim(R.lb, 'none'); tf(R.lb, 0, '', 'rotateX(90deg)'); op(R.sLB, 0, '', 0); op(R.sT, 0, '', 0);
        done();
      }
      this.later(function () {
        R.lt.style.visibility = 'hidden';
        tf(R.lb, drop, heavy ? EASE_FALL : 'cubic-bezier(.3,1.4,.5,1)', 'rotateX(0deg)');   // 下半片带着速度砸到底
        if (heavy) op(R.sLB, drop, 'linear', 0);
        self.later(function () {
          R.b.innerHTML = html(next); op(R.sB, 0, '', 0);                               // 落地瞬间底层换成新字，回弹不露旧字
          self.$emit('land', heavy);
          if (!heavy) { finish(); return; }
          tf(R.lb, 0, '', 'rotateX(0deg)'); void R.lb.offsetWidth; anim(R.lb, 'flapRebound 190ms linear');
          self.later(finish, 200);
        }, drop);
      }, fall);
    },
    later: function (fn, ms) {
      var self = this;
      var id = setTimeout(function () { var i = self.timers.indexOf(id); if (i >= 0) self.timers.splice(i, 1); if (!self.dead) fn(); }, ms);
      this.timers.push(id);
    }
  }
};
</script>
