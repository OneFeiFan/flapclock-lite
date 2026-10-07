import Vue from 'vue';
import App from './App.vue';
import router from './router';
import './styles/base.scss';

Vue.config.productionTip = false;
new Vue({ router: router, render: function (h) { return h(App); } }).$mount('#app');
