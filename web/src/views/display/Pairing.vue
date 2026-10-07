<template>
  <div class="pairing">
    <div class="pr-title">配对这块屏幕</div>
    <div class="pr-sub">用手机扫右下角的二维码，选好比赛，这块屏幕就会开始显示</div>
    <div class="pr-code">
      <flap-tile v-for="(ch, i) in chars" :key="i" :class="{ 'ml': i > 0, 'ml-wide': i === 3 }" :value="ch" :w="150" :h="224" :fs="236" :r="4" :hg="5" :pin="10" />
    </div>
    <div class="pr-foot">
      <div class="pr-steps">
        <p><b>用手机相机</b>扫右边的二维码，在打开的页面里点“绑定”</p>
        <p><b>或在手机遥控页</b>首页的“屏幕”里找到这块屏幕，点“绑定”</p>
        <p class="pr-dev">本机编号 {{ deviceLabel }}</p>
      </div>
      <qr-code class="pr-qr" :text="pairUrl" :size="220" dark="#050505" light="#F2F2EE" />
    </div>
  </div>
</template>

<script>
import FlapTile from '@/components/FlapTile.vue';
import QrCode from '@/components/QrCode.vue';

export default {
  name: 'Pairing',
  components: { FlapTile: FlapTile, QrCode: QrCode },
  props: { code: { type: String, default: '' }, deviceLabel: { type: String, default: '' } },
  computed: {
    chars: function () { var c = (this.code || '------').split(''); while (c.length < 6) c.push('-'); return c.slice(0, 6); },
    pairUrl: function () { return location.protocol + '//' + location.host + '/#/?pair=' + this.code; }   // 指向遥控首页（根路径），手机扫码后直接进入绑定
  }
};
</script>

<style lang="scss">
.pairing { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; background: $black; color: $white; font-family: $hei; font-weight: 900; }
.pr-title { position: absolute; left: 140px; top: 120px; font-size: 72px; letter-spacing: .06em; }
.pr-sub { position: absolute; left: 140px; top: 222px; font-size: 30px; color: $print; letter-spacing: .04em; }
.pr-code { position: absolute; left: 140px; top: 330px; display: -webkit-flex; display: flex; }
.pr-code .ml { margin-left: 16px; }
.pr-code .ml-wide { margin-left: 56px; }
.pr-foot { position: absolute; left: 140px; right: 140px; top: 690px; display: -webkit-flex; display: flex; -webkit-justify-content: space-between; justify-content: space-between; -webkit-align-items: flex-end; align-items: flex-end;
  border-top: 2px solid $rule; padding-top: 48px; }
.pr-steps p { margin: 0 0 22px; font-size: 32px; color: $white; font-weight: 900; }
.pr-steps b { color: $print; margin-right: 18px; font-weight: 900; }
.pr-steps .pr-dev { margin-top: 36px; font-size: 22px; color: $print; }
.pr-qr { padding: 0; }
</style>
