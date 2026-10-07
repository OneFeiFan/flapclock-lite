<template><div class="qr" v-html="svg"></div></template>
<script>
import { qrSvg } from '@/lib/qr';
export default {
  name: 'QrCode',
  props: { text: { type: String, required: true }, size: { type: Number, default: 160 }, dark: String, light: String },
  computed: { svg: function () { return this.text ? qrSvg(this.text, this.size, this.dark, this.light) : ''; } }
};
</script>
<style>.qr { line-height: 0; } .qr svg { display: block; }</style>
