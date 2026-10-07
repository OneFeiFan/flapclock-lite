<template>
  <!-- 待机页：没有指定比赛时显示。扫码打开遥控页（已选中这块屏幕），在手机上选择或新建一场比赛 -->
  <div class="pairing">
    <div class="pr-title">扫码开始使用</div>
    <div class="pr-sub">用微信或手机浏览器扫右边的二维码，打开遥控页，选择或新建一场比赛，这块屏幕就会开始显示</div>
    <div class="pr-label">本机编号</div>
    <div class="pr-code">
      <flap-tile v-for="(ch, i) in chars" :key="i" :class="{ 'ml': i > 0 }" :value="ch" :w="112" :h="168" :fs="176" :r="4" :hg="4" :pin="8" />
    </div>
    <div class="pr-tip">也可以在手机遥控页首页的“屏幕”里，按这个编号找到这块屏幕</div>
    <qr-code class="pr-qr" :text="pairUrl" :size="420" dark="#050505" light="#F2F2EE" />
  </div>
</template>

<script>
/* 待机页：二维码指向遥控首页并带上本机设备编号（/#/?screen=…），手机打开后直接为这块屏幕选择比赛 */
import FlapTile from '@/components/FlapTile.vue';
import QrCode from '@/components/QrCode.vue';

export default {
  name: 'Pairing',
  components: { FlapTile: FlapTile, QrCode: QrCode },
  props: { deviceId: { type: String, default: '' }, deviceLabel: { type: String, default: '' } },
  computed: {
    chars: function () { var c = String(this.deviceLabel || '').split('-')[0].split(''); while (c.length < 6) c.push('-'); return c.slice(0, 6); },
    pairUrl: function () { return location.protocol + '//' + location.host + '/#/?screen=' + encodeURIComponent(this.deviceId); }
  }
};
</script>

<style lang="scss">
.pairing { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; background: $black; color: $white; font-family: $hei; font-weight: 900; }
.pr-title { position: absolute; left: 140px; top: 130px; font-size: 76px; letter-spacing: .06em; }
.pr-sub { position: absolute; left: 140px; top: 242px; width: 1040px; font-size: 32px; line-height: 1.55; color: $print; letter-spacing: .03em; }
.pr-label { position: absolute; left: 140px; top: 430px; font-size: 28px; color: $print; letter-spacing: .1em; }
.pr-code { position: absolute; left: 140px; top: 482px; display: -webkit-flex; display: flex; }
.pr-code .ml { margin-left: 14px; }
.pr-tip { position: absolute; left: 140px; top: 700px; width: 1040px; font-size: 26px; color: #6A6A68; letter-spacing: .03em; }
/* 二维码四周留浅色边，保证扫码识别 */
.pr-qr { position: absolute; right: 150px; top: 300px; padding: 28px; background: #F2F2EE; border-radius: 8px; line-height: 0; }
</style>
