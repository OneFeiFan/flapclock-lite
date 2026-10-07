/* 本机名称：首次打开时自动生成（如“手机 3F2A”），可在首页修改；操作日志里显示为操作人 */
import { storage } from './util';
import Link from './link';

var KEY = 'flapclock.client';
export function clientName() {
  var n = storage(KEY);
  if (!n) { n = '手机 ' + Math.random().toString(16).slice(2, 6).toUpperCase(); storage(KEY, n); }
  return n;
}
export function setClientName(n) {
  n = String(n || '').trim().slice(0, 16);
  if (n) storage(KEY, n);
  return clientName();
}
/** 手机端的实时连接：以管理身份连接，可选立即查看某场比赛 */
export function adminLink(opts) {
  return new Link({
    hello: function () { return { t: 'hello', role: 'admin', name: clientName(), tid: opts.tid || null }; },
    onMessage: opts.onMessage, onStatus: opts.onStatus, onOpen: opts.onOpen
  });
}
