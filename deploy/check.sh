#!/bin/bash
# 翻牌钟简化版 · 部署后自检
#
# 用法：deploy/check.sh https://你的域名
#
# 检查：接口、遥控页、大屏页、实时通道握手；HTTPS 还会检查证书链是否适合安卓 6 的电视盒子。
# 全部通过才算部署完成。
#
# 两个只用于排查的环境变量（正式自检不要设）：
#   CHECK_RESOLVE=你的服务器IP   域名还没解析好时，强制把这个域名指向这个 IP 来检查
#   CHECK_INSECURE=1            允许自签证书（证书还没签发时先把链路跑通），结果里会明确标注
set -u
BASE="${1:?用法：deploy/check.sh https://你的域名}"
BASE="${BASE%/}"
pass=0; fail=0; notes=0
ok()   { echo "  通过  $1"; pass=$((pass + 1)); }
bad()  { echo "  失败  $1"; fail=$((fail + 1)); }
note() { echo "  注意  $1"; notes=$((notes + 1)); }

DOMAIN_ONLY=$(echo "$BASE" | sed -E 's#^https?://([^/:]+).*#\1#')
PORT_ONLY=$(echo "$BASE" | sed -E 's#^https?://[^/:]+:([0-9]+).*#\1#')
[ "$PORT_ONLY" = "$BASE" ] && PORT_ONLY=443

CURL=(curl -s)
if [ -n "${CHECK_INSECURE:-}" ]; then CURL+=(-k); fi
if [ -n "${CHECK_RESOLVE:-}" ]; then CURL+=(--resolve "$DOMAIN_ONLY:$PORT_ONLY:$CHECK_RESOLVE"); fi
code() { "${CURL[@]}" -o /dev/null -w '%{http_code}' --max-time 10 "$1"; }
body() { "${CURL[@]}" --max-time 10 "$1"; }

echo "检查 $BASE"
[ -n "${CHECK_RESOLVE:-}" ] && note "已强制解析到 $CHECK_RESOLVE（DNS 生效后请去掉 CHECK_RESOLVE 重跑）"
[ -n "${CHECK_INSECURE:-}" ] && note "已允许自签证书，这**不是**正式自检；换上正式证书后必须重新跑一次"

# ---- 接口：唯一被文档认可的探活接口，恒 200、不读盘 ----
t=$(body "$BASE/api/time")
case "$t" in
  *[0-9]*) ok "接口 /api/time" ;;
  *) bad "接口 /api/time（服务没起来，或边缘没有转发到 flapclock-app:18630）" ;;
esac

# ---- 遥控页 ----
[ "$(code "$BASE/")" = 200 ] && ok "遥控页 /" || bad "遥控页 /（前端产物没进镜像？）"

# ---- 大屏页：不能只看状态码 ----
# 前端产物缺失时服务端会给 / 回一段“前端尚未构建”的纯文本，状态码同样是 200，
# 只看状态码会把这种情况当成通过，实际电视打开是白屏。这里额外确认返回的是真页面。
tv=$(body "$BASE/tv/")
if [ "$(code "$BASE/tv/")" != 200 ]; then
  bad "大屏页 /tv/（返回的不是 200）"
elif echo "$tv" | grep -q '/assets/'; then
  ok "大屏页 /tv/（返回的是前端页面）"
else
  bad "大屏页 /tv/ 返回的不是页面（前端产物缺失或静态目录不对）"
fi

# ---- 实时通道：大屏和手机都靠它，握手必须是 101 ----
ws=$("${CURL[@]}" -o /dev/null -w '%{http_code}' --max-time 5 --http1.1 \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' "$BASE/ws")
if [ "$ws" = 101 ]; then
  ok "实时通道 /ws（握手返回 101）"
else
  bad "实时通道 /ws（返回 $ws：检查边缘 vhost 里 Upgrade / Connection 两个请求头和路径 /ws）"
fi

# ---- 证书：安卓 6 的电视盒子不认 Let's Encrypt ----
case "$BASE" in
  https://*)
    if [ -n "${CHECK_INSECURE:-}" ]; then
      note "跳过证书链检查（当前是自签证书）"
    else
      connect="${CHECK_RESOLVE:-$DOMAIN_ONLY}:$PORT_ONLY"
      chain=$(echo | openssl s_client -connect "$connect" -servername "$DOMAIN_ONLY" -showcerts 2>/dev/null \
        | grep -E '^ *[0-9]+ s:| i:')
      echo "  证书链："; echo "$chain" | sed 's/^/      /'
      if [ -z "$chain" ]; then
        bad "拿不到证书链（证书没装、域名没解析，或 443 不通）"
      elif echo "$chain" | grep -q "ISRG Root X1"; then
        bad "证书来自 Let's Encrypt（根证书 ISRG Root X1）：安卓 7.1 以下的电视盒子不认，正式版 APK 会打不开"
      else
        ok "证书链（请确认根证书在安卓 6 的系统信任列表里，例如 TrustAsia / Certum、DigiCert、GlobalSign）"
      fi
      echo | openssl s_client -connect "$connect" -servername "$DOMAIN_ONLY" 2>/dev/null \
        | openssl x509 -noout -enddate 2>/dev/null | sed 's/notAfter=/  证书到期：/'
    fi
    ;;
  *) note "不是 HTTPS 地址：正式版 APK 只能加载 HTTPS 地址" ;;
esac

echo "结果：通过 $pass 项，失败 $fail 项，注意 $notes 项"
[ "$fail" -eq 0 ]
