#!/usr/bin/env node
/**
 * 翻牌钟简化版 · 一键部署
 *
 * 部署拓扑（域名取自 deploy/.env 的 DOMAIN；仓库里一律写成占位符，不出现真实域名）：
 *   https://<你的域名>/        遥控页（手机）
 *   https://<你的域名>/tv/     大屏页（电视 APK 加载的地址）
 *   https://<你的域名>/api/... 接口
 *   wss://<你的域名>/ws        实时通道
 *
 * 为什么不是「起个容器发布 80/443」：
 *   这台服务器上 80/443 由既有的边缘网关容器独占（全站唯一），
 *   本项目自己去 publish 80/443 只会端口冲突。所以本项目只在 docker 网络里监听 18630，
 *   由 /opt/edge/conf.d/<你的域名>.conf 那份 vhost 做 TLS 终结和反向代理。
 *   边缘侧那两份文件（挂载 + include）已经写进那个项目的发布包，正常发布不会丢；
 *   万一被旧版发布包覆盖，用 --repair-edge 一条命令修回来。
 *
 * 用法（在仓库根目录执行）：
 *   node deploy/deploy.mjs                 # 打包源码 → 远端构建镜像 → 起容器 → 装边缘 vhost → 自检
 *   node deploy/deploy.mjs --check         # 只自检，不动服务器
 *   node deploy/deploy.mjs --no-build      # 跳过镜像构建（只重新起容器 / 装边缘配置）
 *   node deploy/deploy.mjs --no-edge       # 不碰 /opt/edge（只更新应用本身）
 *   node deploy/deploy.mjs --repair-edge   # 只修边缘扩展点（poker-timer 发布会把它冲掉时用）
 *   node deploy/deploy.mjs --host root@1.2.3.4
 *   node deploy/deploy.mjs --certs-dir D:\certs
 *
 * 配置：deploy/.env（见 deploy/.env.example）。
 * 前提：本机到服务器的 ssh 免密已配好（poker-timer-platform 仓库的 deploy/setup-ssh.mjs 可装公钥）。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SHIP = path.join(__dirname, '.ship');

// ─── 参数 ───
const args = process.argv.slice(2);
const has = (n) => args.includes('--' + n);
const flag = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : undefined; };
const opt = {
  check: has('check'),
  repairEdge: has('repair-edge'),
  noEdge: has('no-edge'),
  noBuild: has('no-build'),
  host: flag('host'),
  certsDir: flag('certs-dir')
};

// ─── 配置 ───
function loadDotEnv(file) {
  const out = {};
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !line.trim().startsWith('#')) out[m[1]] = m[2];
    }
  } catch { /* 没有 deploy/.env 时用下面的默认值 */ }
  return out;
}
const env = loadDotEnv(path.join(__dirname, '.env'));
const DEPLOY_HOST = opt.host || env.DEPLOY_HOST || '';
const DEPLOY_PORT = env.DEPLOY_PORT || '22';
const FLAPCLOCK_DIR = env.FLAPCLOCK_DIR || '/opt/flapclock';
const EDGE_DIR = env.EDGE_DIR || '/opt/edge';
// 故意不给默认域名：默认值等于把真实域名写进公开仓库。
// 真实值放 deploy/.env（已被 .gitignore 忽略），没配就直接报错停下。
const DOMAIN = env.DOMAIN || '';
const EDGE_CONTAINER = env.EDGE_CONTAINER || 'poker-timer-web';
const POKER_TIMER_DIR = env.POKER_TIMER_DIR || '/opt/poker-timer';
const CERTS_DIR = path.resolve(opt.certsDir || env.CERTS_DIR || path.join(__dirname, 'certs-local'));
const SRC_DIR = FLAPCLOCK_DIR + '/src';
const TAG = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);   // 20261007T133000 → 20261007133000

if (!DEPLOY_HOST) {
  console.error('[FAIL] 没配目标服务器：复制 deploy/.env.example 为 deploy/.env 填 DEPLOY_HOST，或加 --host root@1.2.3.4');
  process.exit(1);
}
if (!DOMAIN) {
  console.error('[FAIL] 没配域名：复制 deploy/.env.example 为 deploy/.env 填 DOMAIN。\n'
    + '       这里故意不给默认值——默认值等于把真实域名写进公开仓库。');
  process.exit(1);
}

// ─── 本机命令 ───
function run(file, argv, opts = {}) {
  const res = spawnSync(file, argv, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
  if (res.error) { console.error('[FAIL] 无法执行 ' + file + '：' + res.error.message); process.exit(1); }
  return res;
}
function runOrDie(file, argv, opts = {}) {
  const res = run(file, argv, { stdio: 'inherit', ...opts });
  if (res.status !== 0) { console.error('[FAIL] ' + file + ' ' + argv.join(' ') + ' 退出码 ' + res.status); process.exit(1); }
}

// ─── 远端命令 ───
// 统一用 `ssh host bash -s` + stdin 传脚本：脚本内容里的引号、反斜杠、中文都不需要转义，
// 也不会被 Windows 的 cmd 二次解释。
function remote(script, opts = {}) {
  const res = run('ssh', ['-p', DEPLOY_PORT, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', DEPLOY_HOST, 'bash -s'],
    { input: script });
  const out = (res.stdout || '') + (res.stderr || '');
  if (res.status !== 0 && !opts.allowFail) {
    if (out.trim()) console.error(out.trim());
    console.error('[FAIL] 远端命令失败（退出码 ' + res.status + '）');
    process.exit(1);
  }
  return { status: res.status, out: out, stdout: res.stdout || '' };
}
// 需要「干净的输出」时用这个：远端脚本自己别打印别的东西
function remoteOut(script) { return remote(script).stdout.trim(); }

function scp(local, remotePath) {
  runOrDie('scp', ['-P', DEPLOY_PORT, '-o', 'BatchMode=yes', local, DEPLOY_HOST + ':' + remotePath]);
}

// ssh 目标里的 IP（用于域名还没解析时强制解析做自检）
const SERVER_IP = (DEPLOY_HOST.split('@').pop() || '').match(/^\d+\.\d+\.\d+\.\d+$/) ? DEPLOY_HOST.split('@').pop() : '';

// ─── 打包：只把镜像需要的东西拷进 deploy/.ship ───
// 不直接同步整个仓库：Windows 上装出来的 node_modules 含平台相关二进制，
// 拷到 Linux 上会让镜像直接崩；.git 之类更是纯浪费。
const SHIP_FILES = ['Dockerfile', '.dockerignore', 'docker-compose.yml'];
const SHIP_DIRS = ['server', 'shared', 'web'];
const SHIP_EXTRA = [
  'deploy/healthcheck.mjs',
  'deploy/flapclock.env.example',
  'deploy/check.sh',
  'deploy/check-server.sh'
];
const SKIP_NAMES = new Set(['node_modules', '.git', 'dist', 'data', '.ship', '.stage', 'build', '.gradle', 'logs']);
const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.json', '.vue', '.html', '.htm', '.css', '.scss', '.sass', '.md',
  '.yml', '.yaml', '.sh', '.conf', '.example', '.txt', '.env', '.svg', '.xml', '.gitignore', '.dockerignore']);

function isTextFile(file) {
  const base = path.basename(file);
  if (base === 'Dockerfile' || base === '.dockerignore' || base === '.gitignore') return true;
  return TEXT_EXT.has(path.extname(file).toLowerCase());
}

function copyShipped(from, to) {
  const st = fs.statSync(from);
  if (st.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from)) {
      if (SKIP_NAMES.has(entry)) continue;
      copyShipped(path.join(from, entry), path.join(to, entry));
    }
    return;
  }
  if (isTextFile(from)) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    // Windows 检出（core.autocrlf=true）会把 .sh / Dockerfile / .conf 变成 CRLF，
    // 传到 Linux 上会变成 /bin/bash^M 跑不起来这类极难定位的故障，所以统一转成 LF
    fs.writeFileSync(to, fs.readFileSync(from, 'utf8').replace(/\r\n/g, '\n'));
  } else {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
}

function packageAll() {
  console.log('==> 打包源码 → deploy/.ship');
  fs.rmSync(SHIP, { recursive: true, force: true });
  fs.mkdirSync(SHIP, { recursive: true });
  for (const f of SHIP_FILES) copyShipped(path.join(ROOT, f), path.join(SHIP, f));
  for (const d of SHIP_DIRS) copyShipped(path.join(ROOT, d), path.join(SHIP, d));
  for (const f of SHIP_EXTRA) copyShipped(path.join(ROOT, f), path.join(SHIP, f));
  // 镜像里必须有前端产物，构建阶段会产出；这里只断言构建入口都在，避免传一半的包上去
  for (const need of ['server/index.js', 'shared/clock.mjs', 'web/package.json', 'web/vite.config.js', 'deploy/healthcheck.mjs']) {
    if (!fs.existsSync(path.join(SHIP, need))) { console.error('[FAIL] 打包后缺少 ' + need); process.exit(1); }
  }
  const tgz = path.join(__dirname, '.ship.tgz');
  fs.rmSync(tgz, { force: true });
  runOrDie('tar', ['-czf', tgz, '-C', SHIP, '.']);
  const kb = (fs.statSync(tgz).size / 1024).toFixed(0);
  console.log('  ✓ deploy/.ship.tgz（' + kb + ' KB）');
  return tgz;
}

// ─── 预检 ───
function preflight() {
  console.log('==> 预检 ' + DEPLOY_HOST);
  const out = remote(`
set -e
echo "docker: $(docker --version 2>&1)"
echo "compose: $(docker compose version 2>&1 | head -1)"
if docker network inspect current_default >/dev/null 2>&1; then
  echo "network: current_default 存在"
else
  echo "network: MISSING"
fi
if docker inspect EDGE_CONTAINER_NAME >/dev/null 2>&1; then
  echo "edge: EDGE_CONTAINER_NAME 存在"
else
  echo "edge: MISSING"
fi
`.replace(/EDGE_CONTAINER_NAME/g, EDGE_CONTAINER)).out.trim();
  console.log(out.split('\n').map(function (l) { return '  ' + l; }).join('\n'));
  if (/network: MISSING/.test(out)) {
    console.error('[FAIL] 找不到 docker 网络 current_default。\n'
      + '       它是 poker-timer 的 compose 项目网络，本服务要接入它，边缘才能按名字访问 flapclock-app。\n'
      + '       请先确认 poker-timer 已经部署（docker compose ls），或把 deploy/.env 里的 EDGE_NETWORK 改成实际网络名。');
    process.exit(1);
  }
  if (/edge: MISSING/.test(out)) {
    console.error('[FAIL] 找不到边缘容器 ' + EDGE_CONTAINER + '（持有 80/443 的那个）。\n'
      + '       它没跑的话，域名不会被转发到本项目；可先 --no-edge 只部署应用容器。');
    process.exit(1);
  }
}

// ─── 上传 ───
function upload(tgz) {
  console.log('==> 上传到 ' + FLAPCLOCK_DIR);
  remote(`
set -e
mkdir -p ${FLAPCLOCK_DIR}/releases ${FLAPCLOCK_DIR}/data ${EDGE_DIR}/conf.d ${EDGE_DIR}/certs
# 容器里以 node 用户（uid 1000）运行，数据目录属主不对会让 store.js 启动时就抛错
chown 1000:1000 ${FLAPCLOCK_DIR}/data
`);
  scp(tgz, FLAPCLOCK_DIR + '/releases/' + TAG + '.tgz');
  const res = remote(`
set -e
rm -rf ${SRC_DIR}
mkdir -p ${SRC_DIR}
tar -xzf ${FLAPCLOCK_DIR}/releases/${TAG}.tgz -C ${SRC_DIR}
chmod 755 ${SRC_DIR}/deploy/*.sh
echo "  ✓ 已展开到 ${SRC_DIR}"
# 运行参数：只在第一次部署时生成，之后不会覆盖（改过的值会保留）。
# 模板里的 PUBLIC_ORIGIN 是占位符，落盘前按真实域名填好——否则启动横幅会显示“你的域名”。
if [ ! -f ${FLAPCLOCK_DIR}/.env ]; then
  sed "s|^PUBLIC_ORIGIN=.*|PUBLIC_ORIGIN=https://${DOMAIN}|" ${SRC_DIR}/deploy/flapclock.env.example > ${FLAPCLOCK_DIR}/.env
  echo "  ✓ 已生成 ${FLAPCLOCK_DIR}/.env（首次，PUBLIC_ORIGIN 已填成 https://${DOMAIN}）"
fi
# tag 每次部署都更新，回滚时能认出容器里跑的是哪一次构建
sed -i "s/^FLAPCLOCK_TAG=.*/FLAPCLOCK_TAG=${TAG}/" ${FLAPCLOCK_DIR}/.env
echo "  ✓ 保留的历史发布包：$(ls -1 ${FLAPCLOCK_DIR}/releases | wc -l) 个"
`);
  console.log(res.out.trimEnd());
}

// ─── 构建并启动 ───
function buildAndUp() {
  const cf = '-f ' + SRC_DIR + '/docker-compose.yml --env-file ' + FLAPCLOCK_DIR + '/.env';
  if (!opt.noBuild) {
    console.log('==> 服务器上构建镜像（首次要拉 node:22-alpine、装依赖，几分钟）');
  }
  const script = `
set -e
cd ${SRC_DIR}
${opt.noBuild ? '' : 'docker compose ' + cf + ' build'}
docker compose ${cf} up -d
# 等健康检查通过：/api/time 和 /tv/ 都要真的有响应
for i in $(seq 1 60); do
  h=$(docker inspect flapclock-app --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' 2>/dev/null || echo missing)
  [ "$h" = "healthy" ] && break
  sleep 2
done
echo "  容器状态：$(docker inspect flapclock-app --format '{{.State.Status}} / {{if .State.Health}}{{.State.Health.Status}}{{else}}无健康检查{{end}}')"
docker logs --tail 12 flapclock-app 2>&1 | sed 's/^/    /'
if [ "$h" != "healthy" ]; then
  echo "!! 容器没有变成 healthy，最近日志："
  docker logs --tail 60 flapclock-app 2>&1 | sed 's/^/    /'
  exit 1
fi
`;
  const res = remote(script, { allowFail: true });
  console.log(res.out.trimEnd());
  if (res.status !== 0) {
    console.error('[FAIL] 应用容器没起来。常见原因：');
    console.error('       - 端口环境变量写错（服务端会直接报错退出，日志里有“启动参数有误”）');
    console.error('       - 数据目录属主不对（日志里有 EACCES / mkdir 报错）');
    console.error('       - 构建时依赖拉不下来（--build-arg NPM_REGISTRY 可换源）');
    process.exit(1);
  }
}

// ─── 装边缘 vhost 与证书 ───
function installEdge() {
  if (opt.noEdge) { console.log('==> 跳过边缘配置（--no-edge）'); return; }
  console.log('==> 安装边缘 vhost 与证书到 ' + EDGE_DIR);
  const pem = path.join(CERTS_DIR, DOMAIN + '.pem');
  const key = path.join(CERTS_DIR, DOMAIN + '.key');
  const hasPem = fs.existsSync(pem);
  const hasKey = fs.existsSync(key);
  if (!hasPem || !hasKey) {
    console.log('  ! 本地还没有 ' + DOMAIN + ' 的证书对（' + CERTS_DIR + '），跳过边缘 vhost 安装。');
    console.log('    拿到腾讯云免费 DV 证书（Nginx 格式）后，把 ' + DOMAIN + '.pem 和 .key 放进该目录，');
    console.log('    再执行一次 node deploy/deploy.mjs --no-build 即可。');
    console.log('    注意：没有证书时 nginx 起不来，所以这一步必须跳过而不是硬装。');
    return;
  }
  scp(pem, EDGE_DIR + '/certs/' + DOMAIN + '.pem');
  scp(key, EDGE_DIR + '/certs/' + DOMAIN + '.key');
  // 仓库里的 edge/*.conf 是模板：域名写成 flapclock.example.com。
  // nginx 配置读不了环境变量，只能在传上去之前做替换 —— 换成真实域名，并以 <DOMAIN>.conf 为名落盘，
  // 这样仓库里不会出现真实域名，服务器上拿到的仍是原样的配置。
  const stage = path.join(__dirname, '.stage');
  fs.mkdirSync(stage, { recursive: true });
  for (const f of fs.readdirSync(path.join(__dirname, 'edge'))) {
    if (!f.endsWith('.conf')) continue;
    const filled = fs.readFileSync(path.join(__dirname, 'edge', f), 'utf8')
      .replace(/flapclock\.example\.com/g, DOMAIN)
      .replace(/\r\n/g, '\n');
    const staged = path.join(stage, f);
    fs.writeFileSync(staged, filled);
    scp(staged, EDGE_DIR + '/conf.d/' + DOMAIN + '.conf');
  }
  fs.rmSync(stage, { recursive: true, force: true });
  const res = remote(`
set -e
chmod 644 ${EDGE_DIR}/certs/${DOMAIN}.pem ${EDGE_DIR}/conf.d/*.conf
chmod 600 ${EDGE_DIR}/certs/${DOMAIN}.key
echo "  ✓ 证书与 vhost 已就位"
if ! docker exec ${EDGE_CONTAINER} nginx -t 2>&1; then
  echo "!! 边缘 nginx 配置语法检查失败，已放弃 reload（现有站点不受影响）"
  exit 1
fi
docker exec ${EDGE_CONTAINER} nginx -s reload
echo "  ✓ 边缘已 reload"
`, { allowFail: true });
  console.log(res.out.trimEnd());
  if (res.status !== 0) {
    console.error('[FAIL] 边缘配置没生效。如果报的是挂载缺失，执行：node deploy/deploy.mjs --repair-edge');
    process.exit(1);
  }
}

// ─── 自检 ───
function runChecks(publicCheck) {
  console.log('==> 服务器侧自检');
  const res = remote(`
FLAPCLOCK_DIR=${FLAPCLOCK_DIR} EDGE_DIR=${EDGE_DIR} DOMAIN=${DOMAIN} EDGE_CONTAINER=${EDGE_CONTAINER} POKER_TIMER_DIR=${POKER_TIMER_DIR} \
  bash ${SRC_DIR}/deploy/check-server.sh
`, { allowFail: true });
  console.log(res.out.trimEnd());

  if (!publicCheck) { return res.status === 0; }

  console.log('\n==> 公网自检（按域名 ' + DOMAIN + '）');
  let r = remote('bash ' + SRC_DIR + '/deploy/check.sh https://' + DOMAIN, { allowFail: true });
  console.log(r.out.trimEnd());
  if (r.status === 0) return res.status === 0;
  // 域名还没解析时（ICP/解析刚加、DNS 未生效）用 --resolve 直接指向服务器再查一次，
  // 把「链路不通」和「DNS 没生效」两种失败区分开
  if (SERVER_IP) {
    console.log('\n  上面可能是 DNS 还没生效，改为强制解析到 ' + SERVER_IP + ' 再查一次（只验证链路本身）：');
    r = remote('CHECK_RESOLVE=' + SERVER_IP + ' bash ' + SRC_DIR + '/deploy/check.sh https://' + DOMAIN, { allowFail: true });
    console.log(r.out.trimEnd());
  }
  return res.status === 0 && r.status === 0;
}

// ─── 边缘扩展点：一键修复 ───
// poker-timer 每次发布会用它发布包里的 compose 与 nginx.conf 重建 poker-timer-web。
// 只要那次发布的包带上了扩展点（仓库里已经改好），一切正常；
// 万一是旧包（例如从别的机器、别的分支发布），挂载和 include 就没了 ——
// 现象是 flapclock 突然 502。这里把两处补回去并重建容器。
const COMPOSE_MOUNTS = [
  '      - /opt/edge/conf.d:/etc/nginx/edge-conf.d:ro',
  '      - /opt/edge/certs:/etc/nginx/edge-certs:ro'
];
const INCLUDE_LINE = 'include /etc/nginx/edge-conf.d/*.conf;';

function patchCompose(text) {
  if (text.indexOf('/opt/edge/conf.d:/etc/nginx/edge-conf.d') >= 0) return { text, changed: false };
  const lines = text.split('\n');
  const anchor = lines.findIndex((l) => l.indexOf('/etc/nginx/conf.d/poker-timer.conf') >= 0);
  if (anchor < 0) return { text, changed: false, error: '在 compose 里找不到 nginx.conf 的挂载行，无法确定插入位置' };
  lines.splice(anchor + 1, 0, ...COMPOSE_MOUNTS);
  return { text: lines.join('\n'), changed: true };
}

function patchNginx(text) {
  if (text.indexOf('edge-conf.d') >= 0) return { text, changed: false };
  return {
    text: text.replace(/\s*$/, '\n')
      + '\n# 项目接入的边缘扩展点：/opt/edge/conf.d 里的 vhost 由 docker-compose 挂进 /etc/nginx/edge-conf.d\n'
      + '# 必须放在文件末尾：同一端口上第一个出现的 server 块才是默认服务器，\n'
      + '# 放在这里不会改变 timer-*/www 现有站点在域名写错时的默认行为。\n'
      + INCLUDE_LINE + '\n',
    changed: true
  };
}

function repairEdge() {
  console.log('==> 修复边缘扩展点（' + DEPLOY_HOST + ':' + POKER_TIMER_DIR + '）');
  const tmp = path.join(__dirname, '.repair');
  fs.mkdirSync(tmp, { recursive: true });

  let anyChange = false;
  let needRecreate = false;
  let needReload = false;
  // 两处都要补：
  //   current/  当前正在跑的 release（容器挂的就是它，缺了会立刻 502）
  //   stage/    下次 install.sh 的输入。stage 是上一次 deploy.mjs 打包上传的，
  //             如果有人不经打包、直接在服务器上跑 install.sh，缺了它同样会丢扩展点。
  const targets = [
    [POKER_TIMER_DIR + '/current/docker-compose.yml', patchCompose, 'current-docker-compose.yml'],
    [POKER_TIMER_DIR + '/current/nginx.conf', patchNginx, 'current-nginx.conf'],
    [POKER_TIMER_DIR + '/stage/docker-compose.yml', patchCompose, 'stage-docker-compose.yml'],
    [POKER_TIMER_DIR + '/stage/nginx.conf', patchNginx, 'stage-nginx.conf']
  ];
  for (const [remotePath, patch, localName] of targets) {
    const probe = remote('test -f ' + remotePath, { allowFail: true });
    if (probe.status !== 0) { console.log('  · 跳过（不存在）：' + remotePath); continue; }
    const before = remoteOut('cat ' + remotePath);
    if (!before) { console.error('[FAIL] 读不到 ' + remotePath); process.exit(1); }
    const r = patch(before);
    if (r.error) { console.error('[FAIL] ' + remotePath + '：' + r.error); process.exit(1); }
    if (!r.changed) { console.log('  · 已经修好：' + remotePath); continue; }
    const localFile = path.join(tmp, localName);
    fs.writeFileSync(localFile, r.text.replace(/\r\n/g, '\n'));
    scp(localFile, '/tmp/flapclock-' + localName);
    const applied = remote(`
set -e
cp -a ${remotePath} ${remotePath}.bak-${TAG}
install -m 644 /tmp/flapclock-${localName} ${remotePath}
rm -f /tmp/flapclock-${localName}
echo "  ✓ 已补 ${remotePath}（原文件备份为 .bak-${TAG}）"
`);
    console.log(applied.out.trimEnd());
    anyChange = true;
    if (remotePath.indexOf('/current/docker-compose.yml') >= 0) needRecreate = true;
    if (remotePath.indexOf('/current/nginx.conf') >= 0) needReload = true;
  }

  // 只有「正在跑的那份 compose」变了才需要重建容器（加挂载必须重建）；
  // 只补了 stage 或只补了 include 的话，reload 就够，别平白让现有站点中断一次
  if (needRecreate) {
    console.log('==> 重建边缘容器 ' + EDGE_CONTAINER + '（现有站点约 1~2 秒不可用）');
    const res = remote(`
set -e
docker compose --env-file /etc/poker-timer.env -f ${POKER_TIMER_DIR}/current/docker-compose.yml up -d --force-recreate --no-deps web
docker exec ${EDGE_CONTAINER} nginx -t
docker exec ${EDGE_CONTAINER} nginx -s reload
docker inspect ${EDGE_CONTAINER} --format '  挂载：{{range .Mounts}}{{.Destination}} {{end}}'
`, { allowFail: true });
    console.log(res.out.trimEnd());
    if (res.status !== 0) { console.error('[FAIL] 重建边缘容器失败'); process.exit(1); }
  } else if (needReload) {
    console.log('==> reload 边缘容器 ' + EDGE_CONTAINER + '（不重建，不影响现有站点）');
    const res = remote(`
set -e
docker exec ${EDGE_CONTAINER} nginx -t
docker exec ${EDGE_CONTAINER} nginx -s reload
`, { allowFail: true });
    console.log(res.out.trimEnd());
    if (res.status !== 0) { console.error('[FAIL] 边缘 reload 失败'); process.exit(1); }
  } else if (!anyChange) {
    console.log('  · 无需改动');
  }
  console.log('  ✓ 边缘扩展点已恢复');
}

// ─── 主流程 ───
console.log('==========================================');
console.log('  翻牌钟简化版 · 部署');
console.log('  域名:   https://' + DOMAIN + '/');
console.log('  服务器: ' + DEPLOY_HOST + '  (' + FLAPCLOCK_DIR + ')');
console.log('  边缘:   ' + EDGE_CONTAINER + ' 持有 80/443，本项目在内部 18630');
console.log('==========================================');

if (opt.repairEdge) {
  repairEdge();
  const ok = runChecks(false);
  process.exit(ok ? 0 : 1);
}

let publicCheck = false;
if (!opt.check) {
  preflight();
  const tgz = packageAll();
  upload(tgz);
  buildAndUp();
  installEdge();
  publicCheck = !opt.noEdge;
} else {
  console.log('[--check] 只做自检，不动服务器');
  // --check 也要跑公网自检：服务器侧通过不代表用户打得开
  // （边缘挂载漂移、证书、/ws 升级这些都是只在公网路径上才暴露的问题）
  publicCheck = !opt.noEdge;
}

const ok = runChecks(publicCheck);
console.log('\n=== ' + (ok ? '完成' : '有失败项，见上文') + ' ===');
if (ok) {
  const pem = path.join(CERTS_DIR, DOMAIN + '.pem');
  if (!fs.existsSync(pem)) {
    console.log('提示：本地还没有 ' + DOMAIN + ' 的正式证书。现在的状态是「应用容器已跑通、边缘 vhost 未安装」，');
    console.log('      域名暂时访问不到。把腾讯云免费 DV（Nginx 格式）的 .pem/.key 放进 ' + CERTS_DIR + '，');
    console.log('      再执行 node deploy/deploy.mjs --no-build 即可上线。');
  }
}
process.exit(ok ? 0 : 1);
