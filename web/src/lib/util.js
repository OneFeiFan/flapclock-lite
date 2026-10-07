import { pad2 } from '@shared/clock.mjs';

export var REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

export function uuid() {
  var s = '', hex = '0123456789abcdef';
  for (var i = 0; i < 24; i++) s += hex.charAt(Math.floor(Math.random() * 16));
  return Date.now().toString(36) + '-' + s;
}
export function storage(key, value) {
  try {
    if (value === undefined) return window.localStorage.getItem(key);
    if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, value);
  } catch (e) { return null; }
  return value;
}
/* 服务器时刻（毫秒）显示为本地时钟 */
export function clockText(ms, withSeconds) {
  var d = new Date(ms);
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + (withSeconds ? ':' + pad2(d.getSeconds()) : '');
}
export function origin() { return location.protocol + '//' + location.host + location.pathname; }
