<template>
  <div class="sl">
    <div v-if="!schemes.length" class="rm-empty">还没有方案。可以直接使用推荐方案（18 级，每级 20 分钟，每 4 级休息一次），也可以自己新建一套。</div>
    <div v-for="s in schemes" :key="s.id" class="rm-row">
      <div class="main">
        <b>{{ s.name }}</b><span v-if="s.id === currentId" class="rm-tag">使用中</span><span v-if="s.regEnd" class="rm-tag is-reg">截止买入</span>
        <div class="meta">{{ s.plays }} 级 · {{ s.rows - s.plays }} 次休息 · 约 {{ hoursText(s.minutes) }}<template v-if="!showUse && s.usedBy && s.usedBy.length"> · {{ s.usedBy.length }} 场比赛在用</template></div>
      </div>
      <div class="acts">
        <button v-if="showUse && s.id !== currentId" class="rm-mini" @click="$emit('use', s)">使用</button>
        <button class="rm-mini" aria-label="编辑" @click="$emit('edit', s)">✎</button>
        <button class="rm-mini" :disabled="full" @click="$emit('dup', s)">复制</button>
        <button class="rm-mini is-danger" @click="$emit('del', s)">删除</button>
      </div>
    </div>
    <div class="sl-acts">
      <button class="rm-btn is-primary" :disabled="full" @click="$emit('create')">新建方案</button>
      <button class="rm-btn" :disabled="full" @click="$emit('recommended')">使用推荐方案</button>
    </div>
    <div v-if="full" class="rm-hint sl-full">最多 {{ max }} 套，删掉一套才能再新建</div>
  </div>
</template>

<script>
/* 盲注方案列表（首页与比赛页共用）：编辑、复制、删除、新建、使用推荐方案；比赛页额外显示“使用” */
import { MAX_SCHEMES } from '@shared/structure.mjs';

export default {
  name: 'SchemeList',
  props: { schemes: { type: Array, default: function () { return []; } }, currentId: { type: String, default: null }, showUse: Boolean },
  computed: { full: function () { return this.schemes.length >= MAX_SCHEMES; }, max: function () { return MAX_SCHEMES; } },
  methods: {
    hoursText: function (min) { var h = Math.floor(min / 60), m = min % 60; return (h ? h + ' 小时' : '') + (h && m ? ' ' : '') + (m ? m + ' 分' : (h ? '' : '0 分')); }
  }
};
</script>

<style lang="scss">
.sl .rm-row .meta { white-space: normal; }
.sl-acts { display: -webkit-flex; display: flex; margin-top: 10px; }
.sl-acts .rm-btn { -webkit-flex: 1; flex: 1; }
.sl-acts .rm-btn + .rm-btn { margin-left: 10px; }
.sl-full { margin-top: 6px; }
</style>
