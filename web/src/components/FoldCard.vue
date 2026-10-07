<template>
  <section class="rm-card fold" :class="{ 'is-open': open }">
    <button class="fold-h" type="button" :aria-expanded="open ? 'true' : 'false'" @click="toggle">
      <span class="fold-t">{{ title }}</span>
      <span v-if="!open && summary" class="fold-s">{{ summary }}</span>
      <span class="fold-i" aria-hidden="true">{{ open ? '收起' : '展开' }}</span>
    </button>
    <div v-if="open" class="fold-b"><slot /></div>
  </section>
</template>

<script>
/*
 * 可折叠卡片：手机上默认收起（标题行显示摘要），宽屏（≥1024px）默认展开；
 * 用户手动展开或收起后，按 storageKey 记在本机，下次打开保持。
 */
import { storage } from '@/lib/util';

export default {
  name: 'FoldCard',
  props: { title: String, summary: String, storageKey: String },
  data: function () {
    var saved = this.storageKey ? storage('flapclock.fold.' + this.storageKey) : null;
    var wide = typeof window !== 'undefined' && window.innerWidth >= 1024;
    return { open: saved === '1' ? true : saved === '0' ? false : wide };
  },
  methods: {
    toggle: function () {
      this.open = !this.open;
      if (this.storageKey) storage('flapclock.fold.' + this.storageKey, this.open ? '1' : '0');
    }
  }
};
</script>

<style lang="scss">
.fold { padding: 0; }
.fold-h { width: 100%; min-height: 50px; padding: 12px 14px; border: 0; background: transparent; color: $white; text-align: left; cursor: pointer;
  display: -webkit-flex; display: flex; -webkit-align-items: center; align-items: center; -webkit-tap-highlight-color: transparent; }
.fold-t { -webkit-flex: none; flex: none; font-size: 16px; font-weight: 900; letter-spacing: .06em; }
.fold-s { -webkit-flex: 1; flex: 1; min-width: 0; margin-left: 12px; font-size: 13px; color: $print; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fold-i { -webkit-flex: none; flex: none; margin-left: auto; padding-left: 12px; font-size: 12px; color: #6A6A68; }
.fold-b { padding: 0 14px 14px; }
</style>
