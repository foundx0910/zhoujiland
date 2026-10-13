#!/usr/bin/env bash
# ------------------------------------------------------------------
# Cloudflare 部署助手：不需要记 wrangler 命令，也不需要手改配置文件。
#
#   ./cf.sh login      登录 Cloudflare（浏览器授权一次，之后不用再登）
#   ./cf.sh create-db  创建 D1 数据库，并自动把 database_id 写进 wrangler.toml
#   ./cf.sh create-kv  创建 KV（存图片），并自动把 id 写进 wrangler.toml
#   ./cf.sh deploy     构建前端 + 部署上线
#   ./cf.sh init-db    手动在线上建表（可选：首次访问网站也会自动建）
#   ./cf.sh dev        本地跑 Worker（本地模拟 D1/KV，不碰线上数据）
#   ./cf.sh tail       实时查看线上日志
#   ./cf.sh whoami     查看当前登录的 Cloudflare 账号
# ------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$0")"

# 1) 找到 Node（优先用随项目附带的便携版）
find_node() {
  for c in "../.tools/node/bin/node" "./.tools/node/bin/node" "$(command -v node 2>/dev/null || true)"; do
    if [ -n "${c:-}" ] && [ -x "$c" ]; then echo "$c"; return 0; fi
  done
  return 1
}

if ! NODE_BIN="$(find_node)"; then
  echo "❌ 找不到 Node.js（需要 22.5 以上）。"
  echo "   可以到 https://nodejs.org 下载安装，或把便携版解压到 $(cd .. && pwd)/.tools/node"
  exit 1
fi
export PATH="$(dirname "$NODE_BIN"):$PATH"

# 2) npm 缓存放进项目目录，避免系统 ~/.npm 权限问题
if [ -z "${npm_config_cache:-}" ]; then
  export npm_config_cache="$(cd .. && pwd)/.npm-cache"
  mkdir -p "$npm_config_cache"
fi

WRANGLER=("$NODE_BIN" node_modules/wrangler/bin/wrangler.js)

if [ ! -f node_modules/wrangler/bin/wrangler.js ]; then
  echo "❌ 还没安装依赖。请先在本目录执行：npm install"
  exit 1
fi

# 兼容 macOS(BSD) 与 Linux(GNU) 的 sed -i
sed_inplace() {
  if sed --version >/dev/null 2>&1; then
    sed -i -E "$@"
  else
    sed -i '' -E "$@"
  fi
}

D1_RE='^database_id = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"'
KV_RE='^id = "[0-9a-f]{32}"'

# 读取 wrangler.toml 里当前填写的 ID
d1_id() { grep -E '^database_id = "' wrangler.toml | sed -E 's/^[^"]*"([^"]*)".*/\1/' | head -1; }
kv_id() { grep -E '^id = "' wrangler.toml | sed -E 's/^[^"]*"([^"]*)".*/\1/' | head -1; }

# 是否还是占位值（空 / REPLACE / 全 0）
is_placeholder() {
  case "${1:-}" in
    ""|*REPLACE*|00000000-0000-0000-0000-000000000000|00000000000000000000000000000000) return 0 ;;
    *) return 1 ;;
  esac
}

# workerd 的平台二进制偶尔会被 npm 漏装，这里自愈一次
ensure_workerd() {
  local pkg=""
  case "$(uname -s)/$(uname -m)" in
    Darwin/arm64) pkg="darwin-arm64" ;;
    Darwin/x86_64) pkg="darwin-64" ;;
    Linux/aarch64|Linux/arm64) pkg="linux-arm64" ;;
    Linux/x86_64) pkg="linux-64" ;;
    *) return 0 ;;
  esac
  [ -d "node_modules/@cloudflare/workerd-$pkg" ] && return 0
  local ver
  ver="$("$NODE_BIN" -p "require('./node_modules/workerd/package.json').version" 2>/dev/null || true)"
  [ -z "$ver" ] && return 0
  echo "ℹ️ 检测到缺少 workerd 平台二进制，正在补装 @cloudflare/workerd-$pkg@$ver …"
  npm install --no-save --no-audit --no-fund "@cloudflare/workerd-$pkg@$ver" >/dev/null 2>&1 || true
}

usage() {
  cat <<'TXT'
用法：./cf.sh <命令>

  login       登录 Cloudflare（会打开浏览器，点一下授权即可）
  create-db   创建 D1 数据库，自动写入 wrangler.toml
  create-kv   创建 KV 命名空间（存图片），自动写入 wrangler.toml
  deploy      构建前端 + 部署上线，最后会打印访问地址
  init-db     手动在线上建表（可选，首次访问网站也会自动建）
  dev         本地跑 Worker：http://127.0.0.1:8787（用本地模拟的 D1/KV）
  tail        实时查看线上日志（Ctrl+C 退出）
  whoami      查看当前登录的账号
TXT
}

cmd="${1:-help}"
shift || true

case "$cmd" in
  login)
    ensure_workerd
    echo "▶ 即将打开浏览器，请在页面里点「Allow / 允许」完成授权…"
    "${WRANGLER[@]}" login "$@"
    echo "✅ 登录完成。接着执行：./cf.sh create-db"
    ;;

  whoami)
    ensure_workerd
    "${WRANGLER[@]}" whoami "$@"
    ;;

  create-db)
    ensure_workerd
    if ! is_placeholder "$(d1_id)"; then
      echo "✅ wrangler.toml 里已经填好 database_id（$(d1_id)），跳过创建。"
      exit 0
    fi
    echo "▶ 正在创建 D1 数据库 floor-forum…"
    out="$("${WRANGLER[@]}" d1 create floor-forum 2>&1)" || { printf '%s\n' "$out"; exit 1; }
    printf '%s\n' "$out"
    dbid="$(printf '%s' "$out" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1 || true)"
    if [ -z "$dbid" ]; then
      echo ""
      echo "⚠️ 没能自动识别 database_id。请把上面输出里的 database_id 复制到 wrangler.toml 第 20 行，然后继续。"
      exit 1
    fi
    sed_inplace "s|^database_id = \".*\"|database_id = \"$dbid\"|" wrangler.toml
    echo ""
    echo "✅ 已自动写入 wrangler.toml：database_id = $dbid"
    echo "   接着执行：./cf.sh create-kv"
    ;;

  create-kv)
    ensure_workerd
    if ! is_placeholder "$(kv_id)"; then
      echo "✅ wrangler.toml 里已经填好 KV id（$(kv_id)），跳过创建。"
      exit 0
    fi
    echo "▶ 正在创建 KV 命名空间（用来存上传的图片）…"
    out="$("${WRANGLER[@]}" kv namespace create UPLOADS 2>&1)" || { printf '%s\n' "$out"; exit 1; }
    printf '%s\n' "$out"
    kvid="$(printf '%s' "$out" | grep -oE 'id = "[0-9a-f]{32}"' | grep -oE '[0-9a-f]{32}' | head -1 || true)"
    if [ -z "$kvid" ]; then
      kvid="$(printf '%s' "$out" | grep -oE '[0-9a-f]{32}' | head -1 || true)"
    fi
    if [ -z "$kvid" ]; then
      echo ""
      echo "⚠️ 没能自动识别 KV id。请把上面输出里的 id 复制到 wrangler.toml 第 25 行，然后继续。"
      exit 1
    fi
    sed_inplace "s|^id = \".*\"|id = \"$kvid\"|" wrangler.toml
    echo ""
    echo "✅ 已自动写入 wrangler.toml：id = $kvid"
    echo "   接着执行：./cf.sh deploy"
    ;;

  deploy)
    ensure_workerd
    missing=""
    is_placeholder "$(d1_id)" && missing="$missing create-db"
    is_placeholder "$(kv_id)" && missing="$missing create-kv"
    if [ -n "$missing" ]; then
      echo "⚠️ wrangler.toml 里还有占位 ID，请先执行：$(for m in $missing; do printf './cf.sh %s  ' "$m"; done)"
      exit 1
    fi
    echo "▶ 第 1 步：构建前端…"
    "$NODE_BIN" build.mjs build
    echo ""
    echo "▶ 第 2 步：部署到 Cloudflare…"
    deploy_log="$(mktemp -t cf-deploy)"
    set +e
    "${WRANGLER[@]}" deploy "$@" 2>&1 | tee "$deploy_log"
    deploy_status="${PIPESTATUS[0]}"
    set -e
    if [ "$deploy_status" -ne 0 ]; then
      echo ""
      if grep -qE 'malformed response|Gateway Timeout|-> 50[0-9]|1000[0-9] ' "$deploy_log"; then
        echo "⚠️ 这是 Cloudflare 自己的 API 临时故障（504 网关超时），不是项目的问题。按顺序试："
        echo "   1) 等 1~2 分钟，重新执行：./cf.sh deploy"
        echo "   2) 看 https://www.cloudflarestatus.com 是否有 Workers 故障（有就等它恢复）"
        echo "   3) 反复失败：到控制台 Workers & Pages 首页右侧「Your subdomain」手动设一个子域，再重试"
        echo "   4) 如果你开了 VPN / 代理，换一个节点或临时关掉再试"
        echo "   5) 把上面那段报错（含 Ray ID）发给我，我帮你判断"
      else
        echo "⚠️ 部署失败，把上面的完整报错发给我即可。常见原因：没登录（./cf.sh login）、"
        echo "   wrangler.toml 里的 ID 不对、或网络中断后重试。"
      fi
      rm -f "$deploy_log"
      exit "$deploy_status"
    fi
    rm -f "$deploy_log"
    echo ""
    echo "✅ 部署完成。上面 Version ID 下面那行 https://floor-forum.xxx.workers.dev 就是你的网站地址。"
    echo "   打开后用 admin / admin123 登录，并立刻在「我的 → 修改密码」里改掉密码。"
    echo "   ⚠️ workers.dev 域名在国内常常打不开，要让别人访问请绑定自己的域名（见 README）。"
    ;;

  init-db)
    ensure_workerd
    "$NODE_BIN" scripts/gen-schema.mjs
    "${WRANGLER[@]}" d1 execute floor-forum --file=worker/schema.sql --remote "$@"
    echo "✅ 线上数据表已创建。"
    ;;

  dev)
    ensure_workerd
    "$NODE_BIN" build.mjs build
    "${WRANGLER[@]}" dev --port 8787 --ip 127.0.0.1 "$@"
    ;;

  tail)
    ensure_workerd
    "${WRANGLER[@]}" tail "$@"
    ;;

  help|-h|--help)
    usage
    ;;

  *)
    echo "❓ 不认识这个命令：$cmd"
    echo ""
    usage
    exit 1
    ;;
esac
