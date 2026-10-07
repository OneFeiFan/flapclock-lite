/* 主题注册表：大屏按赛事设置里的 theme 选择主题。以后新增主题（例如时刻表版）只需在这里登记一个组件。
 * 主题组件只负责“怎么画”，时钟、同步、提醒都由大屏页统一处理。组件接收的 props：
 *   clock    ClockModel，调用 clock.read() 得到当前状态
 *   messages MessageStore，公告与弹幕
 *   settings 赛事设置
 *   onLand   翻片落地回调（主音频屏用来播放翻片声） */
import ClassicBoard from './classic/ClassicBoard.vue';

export var THEMES = {
  classic: { key: 'classic', name: '经典', component: ClassicBoard }
};
export function themeOf(key) { return THEMES[key] || THEMES.classic; }
export function themeList() { return Object.keys(THEMES).map(function (k) { return { key: k, name: THEMES[k].name }; }); }
