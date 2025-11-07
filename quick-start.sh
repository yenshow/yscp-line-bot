#!/bin/bash

# HCP Line Bot 快速開始腳本
echo "🚀 HCP Line Bot 快速開始"
echo "========================"

# 環境檢查
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安裝，請安裝: https://nodejs.org/"
    exit 1
fi
if ! command -v npm &> /dev/null; then
    echo "❌ npm 未安裝"
    exit 1
fi
if ! command -v ngrok &> /dev/null; then
    echo "❌ ngrok 未安裝，請安裝: https://ngrok.com/download"
    exit 1
fi
echo "✅ 環境檢查通過"

# 建立 .env 檔案
if [ ! -f .env ]; then
    echo "⚠️  建立 .env 範例檔案..."
    cat > .env << EOF
HCP_HOST=https://yscp.yenshow.com
HCP_AK=您的_Access_Key
HCP_SK=您的_Secret_Key
LINE_CHANNEL_ACCESS_TOKEN=您的_Channel_Access_Token
LINE_CHANNEL_SECRET=您的_Channel_Secret
PORT=6000
EVENT_TOKEN=your_unique_verification_token_here
WEBHOOK_URL=http://localhost:6000/api/hcp/event-receiver
NGROK_URL=
PUBLIC_URL=
EOF
    echo "✅ 已建立 .env 範例檔案"
    echo "⚠️  請編輯 .env 檔案，填入您的實際配置"
    read -p "按 Enter 繼續..."
fi

# 安裝依賴
echo "📦 安裝依賴套件..."
npm install || { echo "❌ 依賴安裝失敗"; exit 1; }
echo "✅ 依賴安裝完成"

# 驗證 .env 配置
if grep -q "您的_Access_Key" .env || grep -q "您的_Channel_Access_Token" .env; then
    echo "⚠️  .env 檔案中仍有佔位符，請編輯後繼續"
    read -p "按 Enter 繼續..."
fi

# 啟動 ngrok
echo "🌐 啟動 ngrok 隧道..."
ngrok http 6000 > /dev/null 2>&1 &
NGROK_PID=$!
sleep 5

NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$NGROK_URL" ]; then
    echo "❌ 無法獲取 ngrok URL"
    kill $NGROK_PID 2>/dev/null || true
    exit 1
fi

WEBHOOK_URL="${NGROK_URL}/api/linebot/hcp-event-receiver"
# 跨平台兼容的 sed 命令（支援 Linux、macOS、Windows Git Bash/WSL）
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS 需要備份後綴
    sed -i.bak "s|^WEBHOOK_URL=.*|WEBHOOK_URL=$WEBHOOK_URL|" .env
    sed -i.bak "s|^NGROK_URL=.*|NGROK_URL=$NGROK_URL|" .env
    sed -i.bak "s|^PUBLIC_URL=.*|PUBLIC_URL=$NGROK_URL|" .env
    rm -f .env.bak
else
    # Linux / WSL / Windows Git Bash
    sed -i "s|^WEBHOOK_URL=.*|WEBHOOK_URL=$WEBHOOK_URL|" .env
    sed -i "s|^NGROK_URL=.*|NGROK_URL=$NGROK_URL|" .env
    sed -i "s|^PUBLIC_URL=.*|PUBLIC_URL=$NGROK_URL|" .env
fi
echo "✅ ngrok 隧道已建立: $WEBHOOK_URL"

# 啟動後端服務
echo "🚀 啟動後端服務..."
# 跨平台兼容的進程終止函數
cleanup() {
    echo "🛑 停止所有服務..."
    kill $NGROK_PID 2>/dev/null || true
    npm run stop
    exit 0
}
trap cleanup INT

npm start &
sleep 5

# 檢查服務狀態
curl -s http://localhost:6000/health > /dev/null && echo "✅ 後端服務正常" || { 
    echo "❌ 後端服務失敗"
    kill $NGROK_PID 2>/dev/null || true
    exit 1
}
curl -s http://localhost:4040/api/tunnels > /dev/null && echo "✅ ngrok 隧道正常" || { 
    echo "❌ ngrok 隧道失敗"
    kill $NGROK_PID 2>/dev/null || true
    exit 1
}

echo "🎉 服務已啟動！"
echo "📋 服務資訊:"
echo "   本地: http://localhost:6000"
echo "   Webhook: $WEBHOOK_URL"
echo "   監控: http://localhost:4040"
echo ""
echo "📝 下一步:"
echo "   1. 在 HCP 管理介面訂閱事件"
echo "      - Webhook URL: $WEBHOOK_URL"
echo "   2. 設定管理員用戶（編輯 data/user-management.json）"
echo "   3. 手動同步用戶: node scripts/user-sync.js"
echo "   4. 在 Line Bot 中發送「管理」指令測試用戶管理"
echo ""
echo "📋 常用命令:"
echo "   npm run restart              # 重啟服務"
echo "   npm run reload               # 零停機重載服務"
echo "   npm run reset                # 完全重置服務"
echo "   npm run status               # 查看服務狀態"
echo "   npm run logs                 # 查看實時日誌"
echo ""
echo "🧹 自動清理服務:"
echo "   - 臨時檔案 (temp/): 每30分鐘清理一次，保留7天"
echo "   - 日誌檔案 (logs/): 每小時輪轉，每天清理超過7天的舊日誌"
echo ""
echo "⚠️  按 Ctrl+C 停止所有服務"
wait
