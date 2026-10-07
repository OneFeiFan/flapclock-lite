#!/bin/bash
# 部署后自检：./deploy/check.sh https://flapclock.example.com
# 检查接口、遥控页、大屏页、WebSocket 握手；HTTPS 地址还会检查证书链是否适合安卓 6 的电视盒子。
set -u
BASE="${1:?用法：deploy/check.sh https://你的域名}"
BASE="${BASE%/}"
pass=0; fail=0
ok()  { echo "  通过  $1"; pass=$((pass + 1)); }
bad() { echo "  失败  $1"; fail=$((fail + 1)); }
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$1"; }

echo "检查 $BASE"
[ "$(code "$BASE/api/time")" = 200 ] && ok "接口 /api/time" || bad "接口 /api/time（服务没启动，或 Nginx 没有转发到正确的端口）"
[ "$(code "$BASE/")" = 200 ]         && ok "遥控页 /"       || bad "遥控页 /（是否执行过 npm run build？）"
[ "$(code "$BASE/tv/")" = 200 ]      && ok "大屏页 /tv/"    || bad "大屏页 /tv/"
ws=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 --http1.1 \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' "$BASE/ws")
[ "$ws" = 101 ] && ok "实时通道 /ws（握手返回 101）" || bad "实时通道 /ws（返回 $ws：检查 Nginx 的 Upgrade / Connection 配置）"

case "$BASE" in
  https://*)
    host=$(echo "$BASE" | sed -E 's#https://([^/:]+).*#\1#')
    chain=$(echo | openssl s_client -connect "$host:443" -servername "$host" -showcerts 2>/dev/null | grep -E '^ *[0-9]+ s:| i:')
    echo "  证书链："; echo "$chain" | sed 's/^/      /'
    if echo "$chain" | grep -q "ISRG Root X1"; then
      bad "证书来自 Let's Encrypt（根证书 ISRG Root X1），安卓 7.1 以下的电视盒子不认，正式版 APK 会打不开"
    else
      ok "证书链（请确认根证书在安卓 6 的系统信任列表里，例如 DigiCert、GlobalSign）"
    fi
    echo | openssl s_client -connect "$host:443" -servername "$host" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | sed 's/notAfter=/  证书到期：/'
    ;;
  *) echo "  提示  不是 HTTPS 地址：正式版 APK 只能加载 HTTPS 地址" ;;
esac
echo "结果：通过 $pass 项，失败 $fail 项"
[ "$fail" -eq 0 ]
