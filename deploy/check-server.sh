#!/bin/bash
# 翻牌钟简化版 · 服务器侧自检（在服务器上跑，只读，不改任何东西）
#
#   bash /opt/flapclock/src/deploy/check-server.sh
#
# 和 deploy/check.sh 的分工：
#   check.sh        从公网按域名检查「用户能不能用」
#   check-server.sh 在服务器上检查「部署本身有没有被别的项目冲掉」
#
# 最要紧的一项在最后：poker-timer 发布时会用**它发布包里**的 compose 和 nginx.conf
# 重建 poker-timer-web 容器。如果那次发布的包没带上边缘扩展点（/opt/edge 的挂载与 include），
# 已经接入的项目就会突然 502，而自己的容器看上去一切正常。这个脚本会直接指出这种情况。
set -u
FLAPCLOCK_DIR="${FLAPCLOCK_DIR:-/opt/flapclock}"
EDGE_DIR="${EDGE_DIR:-/opt/edge}"
# 域名没有内置默认值：写成默认值等于把真实域名泄进仓库。
# deploy.mjs 会把这个变量传进来；单独手动跑时才需要自己设。
DOMAIN="${DOMAIN:?请先设置 DOMAIN 环境变量，例如 DOMAIN=你的域名 bash deploy/check-server.sh}"
EDGE_CONTAINER="${EDGE_CONTAINER:-poker-timer-web}"
POKER_TIMER_DIR="${POKER_TIMER_DIR:-/opt/poker-timer}"
pass=0; fail=0
ok()  { echo "  通过  $1"; pass=$((pass + 1)); }
bad() { echo "  失败  $1"; fail=$((fail + 1)); }
tip() { echo "        修复：$1"; }

echo "服务器侧自检"

# ---- 应用容器 ----
if ! docker inspect flapclock-app >/dev/null 2>&1; then
  bad "容器 flapclock-app 不存在（跑一次 deploy/deploy.mjs 部署）"
else
  state=$(docker inspect flapclock-app --format '{{.State.Status}}')
  health=$(docker inspect flapclock-app --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}无{{end}}')
  [ "$state" = running ] && ok "容器 flapclock-app 运行中" || bad "容器 flapclock-app 状态是 $state"
  case "$health" in
    healthy) ok "容器健康检查通过" ;;
    无)      bad "容器没有健康检查（compose 里的 healthcheck 没生效？）" ;;
    *)       bad "容器健康状态是 $health（docker inspect flapclock-app --format '{{json .State.Health}}' 看细节）" ;;
  esac
fi

# ---- 接入的边缘网络 ----
networks=$(docker inspect flapclock-app --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null)
if [ -n "$networks" ]; then
  ok "容器接入网络：$networks"
  echo "$networks" | grep -q current_default \
    && ok "已接入 poker-timer 的网络（边缘才能按名字访问它）" \
    || bad "没有接入 current_default：边缘会反代不到 flapclock-app:18630"
else
  bad "读不到容器网络（容器不存在？）"
fi

# ---- 边缘侧的挂载：被 poker-timer 发布会冲掉的就是这里 ----
mounts=$(docker inspect "$EDGE_CONTAINER" --format '{{range .Mounts}}{{.Destination}} {{end}}' 2>/dev/null)
if [ -z "$mounts" ]; then
  bad "读不到边缘容器 $EDGE_CONTAINER（EDGE_CONTAINER 写错，或它没在跑）"
else
  echo "$mounts" | grep -q '/etc/nginx/edge-conf.d' \
    && ok "边缘容器挂载了 $EDGE_DIR/conf.d" \
    || { bad "边缘容器缺少 $EDGE_DIR/conf.d 挂载（接入其他项目的 vhost 就靠它）"
         tip "在仓库根目录执行  node deploy/deploy.mjs --repair-edge"; }
  echo "$mounts" | grep -q '/etc/nginx/edge-certs' \
    && ok "边缘容器挂载了 $EDGE_DIR/certs" \
    || { bad "边缘容器缺少 $EDGE_DIR/certs 挂载（证书就靠它）"
         tip "在仓库根目录执行  node deploy/deploy.mjs --repair-edge"; }
fi

# ---- 边缘的 include 是否还在 ----
edge_conf="$POKER_TIMER_DIR/current/nginx.conf"
if [ -r "$edge_conf" ]; then
  grep -q 'edge-conf.d' "$edge_conf" \
    && ok "poker-timer 的 nginx.conf 里有边缘 include" \
    || { bad "poker-timer 的 nginx.conf 里没有 edge-conf.d 的 include（被发布包的旧版本覆盖了）"
         tip "在仓库根目录执行  node deploy/deploy.mjs --repair-edge"; }
else
  bad "读不到 $edge_conf"
fi

# ---- 边缘目录里的文件 ----
[ -s "$EDGE_DIR/conf.d/$DOMAIN.conf" ] \
  && ok "边缘 vhost 存在：$EDGE_DIR/conf.d/$DOMAIN.conf" \
  || bad "缺 $EDGE_DIR/conf.d/$DOMAIN.conf（deploy.mjs 只在证书齐了之后才会装它）"
[ -s "$EDGE_DIR/certs/$DOMAIN.pem" ] && [ -s "$EDGE_DIR/certs/$DOMAIN.key" ] \
  && ok "边缘证书存在：$EDGE_DIR/certs/$DOMAIN.pem/.key" \
  || bad "缺 $EDGE_DIR/certs/$DOMAIN.pem 或 .key（nginx 会因此起不来）"

# ---- 边缘 nginx 配置语法 ----
if docker exec "$EDGE_CONTAINER" nginx -t >/tmp/flapclock-nginx-t.log 2>&1; then
  ok "边缘 nginx 配置语法检查通过"
else
  bad "边缘 nginx 配置语法检查失败："; sed 's/^/        /' /tmp/flapclock-nginx-t.log
fi
rm -f /tmp/flapclock-nginx-t.log

# ---- 边缘到应用的连通性（真正的链路测试）----
if docker exec "$EDGE_CONTAINER" wget -qO- --timeout=5 "http://flapclock-app:18630/api/time" >/dev/null 2>&1; then
  ok "边缘容器能访问 flapclock-app:18630"
else
  bad "边缘容器访问不到 flapclock-app:18630（看 docker exec $EDGE_CONTAINER wget -qO- http://flapclock-app:18630/api/time）"
fi

echo "结果：通过 $pass 项，失败 $fail 项"
[ "$fail" -eq 0 ]
