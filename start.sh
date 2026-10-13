#!/usr/bin/env bash
# 一键启动楼层论坛：自动找到 Node（优先用随项目附带/同级的便携版），缺前端产物时自动构建。
set -euo pipefail

cd "$(dirname "$0")"

find_node() {
  for c in "../.tools/node/bin/node" "./.tools/node/bin/node" "$(command -v node 2>/dev/null || true)"; do
    if [ -n "${c:-}" ] && [ -x "$c" ]; then echo "$c"; return 0; fi
  done
  return 1
}

NODE_BIN="$(find_node)" || {
  echo "找不到 Node.js（需要 22.5 以上，内置 node:sqlite）。" >&2
  echo "可以到 https://nodejs.org 下载安装，或把便携版解压到 $(cd .. && pwd)/.tools/node" >&2
  exit 1
}

export PATH="$(dirname "$NODE_BIN"):$PATH"
export npm_config_cache="${npm_config_cache:-$(cd .. && pwd)/.npm-cache}"

echo "使用 Node: $("$NODE_BIN" -v)"

if [ ! -d node_modules ]; then
  echo "[1/2] 首次运行，安装依赖…"
  npm install --no-audit --no-fund
fi

if [ ! -f dist/index.html ]; then
  echo "[2/2] 构建前端…"
  npm run build
fi

echo "启动服务：http://127.0.0.1:${PORT:-3000}"
exec "$NODE_BIN" --disable-warning=ExperimentalWarning server/index.js
