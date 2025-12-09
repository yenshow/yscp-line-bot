#!/bin/bash

# YSCP Line Bot PM2 清理腳本
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

APP_NAME="yscp-line-bot-backend"
TUNNEL_NAME="ngrok-tunnel"

echo "🧹 開始清理 PM2 服務..."

if command -v pm2 >/dev/null 2>&1; then
	echo "📋 PM2 版本: $(pm2 -v)"
else
	echo "❌ 未安裝 PM2，請先執行 npm install -g pm2 或在專案中安裝"
	exit 1
fi

cleanup_process() {
	local name="$1"

	if pm2 describe "$name" >/dev/null 2>&1; then
		echo "🛑 停止並刪除 $name"
		pm2 delete "$name" >/dev/null
	else
		echo "ℹ️  未找到 $name，略過"
	fi
}

cleanup_process "$APP_NAME"
cleanup_process "$TUNNEL_NAME"

if pm2 list | grep -q "$ROOT_DIR/ecosystem.config.js"; then
	echo "🗂️  發現以 ecosystem.config.js 啟動的匿名進程，全部刪除"
	pm2 delete "$ROOT_DIR/ecosystem.config.js" >/dev/null 2>&1 || true
fi

echo "🧽 清理殘留 ngrok 進程..."
pkill -f "ngrok http 6000" >/dev/null 2>&1 || true

echo "🧾 清空 PM2 日誌緩存"
pm2 flush >/dev/null

LOG_DIR="$ROOT_DIR/logs"
if [ -d "$LOG_DIR" ]; then
	echo "🗑️  刪除舊日誌檔案"
	rm -f "$LOG_DIR"/*.log 2>/dev/null || true
fi

echo "✅ PM2 清理完成，可重新執行 npm run start 或 npm run reset"

