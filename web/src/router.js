import Vue from 'vue';
import VueRouter from 'vue-router';

Vue.use(VueRouter);
/* 通过 /tv/ 打开时（电视 APK 外壳和电视浏览器）默认进入大屏页 */
var ON_TV = /^\/tv\/?$/.test(location.pathname);
/* 各页面按需加载，电视只下载大屏需要的代码 */
export default new VueRouter({
  mode: 'hash',
  routes: [
    ON_TV ? { path: '/', redirect: '/display' } : { path: '/', component: function () { return import('./views/Home.vue'); } },
    { path: '/display', component: function () { return import('./views/Display.vue'); } },
    { path: '/t/:tid', component: function () { return import('./views/Control.vue'); }, props: true },
    { path: '*', redirect: '/' }
  ]
});
