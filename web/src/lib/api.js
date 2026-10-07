/* 基于 XMLHttpRequest 的小封装（老浏览器没有 fetch） */
import { clientName } from './client';

function request(method, url, body) {
  return new Promise(function (resolve, reject) {
    var x = new XMLHttpRequest();
    x.open(method, url, true);
    x.setRequestHeader('Content-Type', 'application/json');
    x.setRequestHeader('X-Client', encodeURIComponent(clientName()));   // 操作人（手机名称）
    x.onload = function () {
      var data = null;
      try { data = x.responseText ? JSON.parse(x.responseText) : null; } catch (e) { data = null; }
      if (x.status >= 200 && x.status < 300) resolve(data);
      else { var err = new Error((data && data.error) || ('请求失败（' + x.status + '）')); err.status = x.status; err.code = data && data.code; reject(err); }
    };
    x.onerror = function () { reject(new Error('无法连接服务器，请检查网络')); };
    x.send(body === undefined ? null : JSON.stringify(body));
  });
}
export default {
  get: function (u) { return request('GET', u); },
  post: function (u, b) { return request('POST', u, b || {}); },
  put: function (u, b) { return request('PUT', u, b || {}); },
  del: function (u) { return request('DELETE', u); }
};
