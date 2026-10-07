/* 翻牌钟服务端入口 */
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import express from 'express';
import { Store } from './store.js';
import { Hub } from './hub.js';
import { registerRoutes } from './routes.js';
import { SchemeLibrary } from './schemes.js';
import { printBanner } from './lan.js';

var __dirname = path.dirname(fileURLToPath(import.meta.url));
/* 默认端口 18630：避开 80/443、3000、3306、5432、6379、8000~8090、8443、8888、9000~9200 等常见服务端口，
 * 也低于 Linux 的临时端口范围（32768 起）。可用环境变量 PORT 修改。 */
var PORT = +process.env.PORT || 18630;
var DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
var HOST = process.env.HOST || '0.0.0.0';   // 监听所有网卡，局域网里的手机和电视才能访问
var LAN_MODE = process.argv.indexOf('--lan') >= 0;

var store = new Store(DATA_DIR);
var schemes = new SchemeLibrary(store);
var app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '512kb' }));
var server = http.createServer(app);
var hub = new Hub({ server: server, store: store });
registerRoutes(app, { store: store, hub: hub, schemes: schemes });

var dist = path.join(__dirname, '..', 'web', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '7d', setHeaders: function (res, p) { if (p.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache'); } }));
  app.get('/', function (req, res) { res.sendFile(path.join(dist, 'index.html')); });
  // 大屏页放在 /tv/ 下：电视 APK 外壳只允许加载这个路径（页面内用 hash 路由，默认进入大屏）
  // 注意：Express 默认不区分末尾斜杠，'/tv' 这条路由同时匹配 /tv 和 /tv/，所以按原始路径判断是否需要补斜杠
  app.get('/tv', function (req, res) {
    if (req.originalUrl.split('?')[0] === '/tv') return res.redirect(301, '/tv/');
    res.setHeader('Cache-Control', 'no-cache'); res.sendFile(path.join(dist, 'index.html'));
  });
} else {
  app.get('/', function (req, res) { res.type('text').send('前端尚未构建：请在 web 目录执行 npm run build，或用 npm run dev 启动开发服务器。'); });
}

server.on('error', function (e) {
  if (e.code === 'EADDRINUSE') console.error('\n端口 ' + PORT + ' 已被占用（可能是服务已经在运行，或者被其他程序占用）。\n请换一个端口启动，例如：PORT=18631 npm run lan（Windows PowerShell：$env:PORT=18631; npm run lan）\n');
  else if (e.code === 'EACCES') console.error('\n没有权限使用端口 ' + PORT + '（1024 以下的端口需要管理员权限），请换一个端口。\n');
  else console.error(e);
  process.exit(1);
});
server.listen(PORT, HOST, function () { printBanner(PORT, LAN_MODE); });
function shutdown() { store.flushAll(); hub.close(); server.close(function () { process.exit(0); }); setTimeout(function () { process.exit(0); }, 1500); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
