# HCP Line Bot 安裝指南

## 🎯 系統需求

**支援平台**: Linux、macOS、Windows (透過 Git Bash 或 WSL)  
**必要軟體**: Git、Node.js 16+、npm、ngrok  
**必要帳號**: HCP API 憑證、Line Bot 憑證

## 🚀 快速安裝

### 1. 下載專案

使用 git 下載整個專案：

```bash
git clone https://github.com/yenshow/yscp-line-bot.git
cd yscp-line-bot
```

### 2. 安裝必要軟體

**Git**: 前往 [git-scm.com](https://git-scm.com/) 下載並安裝（Windows 用戶需要安裝 Git for Windows）  
**Node.js**: 前往 [nodejs.org](https://nodejs.org/) 下載 LTS 版本  
**ngrok**: 前往 [ngrok.com/download](https://ngrok.com/download) 下載並設定 authtoken

```bash
# macOS 用戶可使用 Homebrew
brew install node
brew install ngrok/ngrok/ngrok
ngrok config add-authtoken YOUR_AUTHTOKEN

# Linux 用戶可使用套件管理器
# Ubuntu/Debian
sudo apt update
sudo apt install nodejs npm
# 或使用 NodeSource 安裝最新版本
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs

# 下載並安裝 ngrok
wget https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz
tar -xzf ngrok-v3-stable-linux-amd64.tgz
sudo mv ngrok /usr/local/bin/
ngrok config add-authtoken YOUR_AUTHTOKEN

# CentOS/RHEL
sudo yum install nodejs npm
# 或使用 NodeSource
curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
sudo yum install -y nodejs

# Windows 用戶（推薦使用 Git Bash 或 WSL）
# 方法 1: 使用 Git Bash（推薦）
# 1. 下載並安裝 Git for Windows: https://git-scm.com/download/win
# 2. 下載並安裝 Node.js: https://nodejs.org/
# 3. 下載並安裝 ngrok: https://ngrok.com/download
# 4. 在 Git Bash 中執行腳本

# 方法 2: 使用 WSL (Windows Subsystem for Linux)
# 1. 啟用 WSL: wsl --install
# 2. 在 WSL 中按照 Linux 安裝步驟操作
# 3. 在 WSL 中執行腳本
```

### 3. 一鍵啟動（推薦）

```bash
npm run quick-start
```

腳本會自動：

- ✅ 檢查環境（Node.js、npm、ngrok）
- ✅ 建立 `.env` 範例檔案
- ✅ 安裝依賴套件
- ✅ 啟動 ngrok 隧道
- ✅ 啟動後端服務
- ✅ 檢查服務狀態

## 🔧 手動設定

### 1. 安裝依賴

```bash
npm install
```

### 2. 建立 `.env` 檔案

在專案根目錄建立 `.env` 檔案，並填入以下配置：

```env
# HCP API 配置
HCP_HOST=https://yscp.yenshow.com
HCP_AK=您的_Access_Key
HCP_SK=您的_Secret_Key

# Line Bot 配置
LINE_CHANNEL_ACCESS_TOKEN=您的_Channel_Access_Token
LINE_CHANNEL_SECRET=您的_Channel_Secret

# 伺服器配置
PORT=6000

# Webhook 配置
WEBHOOK_URL=http://localhost:6000/api/linebot/hcp-event-receiver
EVENT_TOKEN=hcp_line_bot_2024_secure_token

# 公開 URL 配置（用於圖片顯示，Line Bot 需要公網可訪問的 URL）
# NGROK_URL: ngrok 公開 URL（開發環境使用，quick-start 腳本會自動填入）
# PUBLIC_URL: 生產環境公開域名（生產環境使用，如果設定則優先使用此值）
NGROK_URL=
PUBLIC_URL=
```

> 💡 **提示**：使用 `npm run quick-start` 時，腳本會自動建立 `.env` 範例檔案，並在啟動 ngrok 後自動填入 `NGROK_URL`、`PUBLIC_URL` 和 `WEBHOOK_URL`。

### 3. 啟動服務

```bash
# 方法 1: 使用 PM2（推薦，生產環境）
npm start

# 方法 2: 開發模式（使用 nodemon）
npm run dev

# 方法 3: 一鍵啟動（包含 ngrok）
npm run quick-start
```

### 4. 服務管理

```bash
# 啟動服務
npm start

# 停止服務
npm run stop

# 重啟服務（推薦）
npm run restart

# 零停機重載服務
npm run reload

# 完全重置服務（清除並重新啟動）
npm run reset

# 完全移除服務
npm run delete

# 查看服務狀態
npm run status

# 查看實時日誌
npm run logs

# 查看應用程式日誌
npm run logs-app

# 查看錯誤日誌
npm run logs-error

# 打開監控儀表板
npm run monitor

# 手動清理日誌檔案（保留7天）
npm run log-cleanup
```

> 📖 詳細重啟流程請參考 [RESTART_GUIDE.md](RESTART_GUIDE.md)

## 📋 配置說明

### HCP API 配置

登入 HCP 管理介面，獲取以下配置：

- `HCP_HOST`: HCP 平台主機地址（預設：`https://yscp.yenshow.com`）
- `HCP_AK`: HCP Access Key
- `HCP_SK`: HCP Secret Key

### Line Bot 配置

前往 [Line Developers Console](https://developers.line.biz/console/)，建立 Messaging API Channel，獲取：

- `LINE_CHANNEL_ACCESS_TOKEN`: Line Bot Channel Access Token
- `LINE_CHANNEL_SECRET`: Line Bot Channel Secret

**重要**：在 Line Developers Console 中設定 Webhook URL 為：`https://您的公開域名/webhook` 或 `https://您的公開域名/api/linebot`

### Webhook 設定

**Line Bot Webhook**（用於接收 Line Bot 訊息）：

- 在 Line Developers Console 設定 Webhook URL: `https://your-ngrok-url.ngrok.io/webhook` 或 `https://your-ngrok-url.ngrok.io/api/linebot`
- 確保 Webhook 已啟用

**HCP 事件接收端點**（用於接收 HCP 事件推送）：

- 主要端點：`/api/linebot/hcp-event-receiver`（推薦）
- 向後兼容：`/api/hcp/event-receiver`
- 在 HCP 管理介面設定 Webhook URL 時使用上述端點之一

## 🧪 測試安裝

### 快速測試

```bash
# 一鍵測試所有功能
npm run quick-start
```

### 手動測試

```bash
# 基本服務測試
curl http://localhost:6000/health              # 測試後端服務
curl http://localhost:6000/webhook/test        # 測試 Line Bot
curl http://localhost:6000/api/cleanup/status  # 查看清理服務狀態

# 用戶同步（手動同步 LINE followers）
node scripts/user-sync.js                      # 同步用戶資料
```

## ✅ 安裝確認

### 快速驗證

```bash
npm run quick-start  # 一鍵啟動並驗證
```

### 確認清單

- [ ] **環境**: Node.js、npm、ngrok 已安裝
- [ ] **配置**: `.env` 檔案已正確設定
- [ ] **服務**: `npm run quick-start` 執行成功
- [ ] **Line Bot**: Webhook URL 已設定並啟用
- [ ] **用戶**: 已透過 Line Bot 或腳本同步用戶
  - 手動同步：`node scripts/user-sync.js`
  - Line Bot 管理：發送「管理」指令（管理員）
- [ ] **事件**: 在 HCP 管理介面已成功訂閱事件
- [ ] **管理員**: 至少設定一個管理員用戶（在 `data/user-management.json` 中）

## 🚨 常見問題

**ngrok 無法啟動**

```bash
ngrok config check
ngrok config add-authtoken YOUR_AUTHTOKEN
```

**端口被占用**

```bash
# 方法 1: 完全重置服務（推薦）
npm run reset

# 方法 2: 手動處理
lsof -i :6000              # 檢查端口占用
kill -9 $(lsof -ti :6000)  # 強制終止佔用端口的進程
npm run start              # 重新啟動
```

> 📖 詳細重啟流程請參考 [RESTART_GUIDE.md](RESTART_GUIDE.md)

**Line Bot 無回應**

1. 確認 LINE Channel 配置正確
2. 確認 Webhook URL 已設定並啟用
3. 測試服務：`curl http://localhost:6000/webhook/test`
4. 手動同步用戶：`node scripts/user-sync.js`

**Webhook 驗證失敗（400 Bad Request 或 502 Bad Gateway）**

**問題 1：ngrok 端口配置錯誤（502 Bad Gateway）**

如果 ngrok 顯示 `502 Bad Gateway` 錯誤，通常是 ngrok 轉發到錯誤的端口。

**檢查方法：**

```bash
# 查看 ngrok 轉發配置
curl http://localhost:4040/api/tunnels | grep -o '"addr":"[^"]*"'
```

**解決方案：**

```bash
# 1. 停止當前 ngrok
pkill ngrok

# 2. 確認應用程式運行在端口 6000
curl http://localhost:6000/health

# 3. 重新啟動 ngrok，使用正確的端口
ngrok http 6000

# 或使用 quick-start 腳本自動啟動
npm run quick-start
```

**確認：** ngrok 應該顯示：`https://xxx.ngrok-free.dev -> http://localhost:6000`（不是 `localhost:80`）

**問題 2：Line Bot 配置錯誤（400 Bad Request）**

如果 Webhook 驗證返回 `400 Bad Request`，通常是 `LINE_CHANNEL_SECRET` 或 `LINE_CHANNEL_ACCESS_TOKEN` 配置錯誤。

**檢查方法：**

```bash
# 使用檢查腳本診斷問題
node scripts/check-webhook.js
```

**解決方案：**

1. 確認 `.env` 檔案中的 `LINE_CHANNEL_SECRET` 與 Line Developers Console 中的完全一致
   - `LINE_CHANNEL_SECRET` 應為 32 字元的十六進制字串
   - 確認沒有多餘空格或換行
2. 確認 `LINE_CHANNEL_ACCESS_TOKEN` 正確且未過期
3. 確認 Webhook URL 正確設定：`https://您的ngrok域名/webhook`
4. 重新載入環境變數並重啟服務：
   ```bash
   npm run restart
   ```

**無法接收事件**

1. 檢查 HCP 管理介面中的事件訂閱設定
2. 確認 Webhook URL 正確設定：`https://您的域名/api/linebot/hcp-event-receiver`
3. 檢查 `data/event-types.json` 中的事件類型配置
4. 查看日誌：
   - `npm run logs-app` - 查看應用程式日誌
   - `npm run logs-error` - 查看錯誤日誌
   - `npm run logs` - 查看所有實時日誌

````

## 📚 相關資源

- [Node.js 官方文件](https://nodejs.org/docs/)
- [ngrok 官方文件](https://ngrok.com/docs)
- [Line Messaging API 文件](https://developers.line.biz/en/docs/messaging-api/)

---

**版本**: 1.3.0 | **最後更新**: 2024/10/31

## 📋 自動清理服務

系統已啟用自動清理服務，統一管理檔案和日誌清理：

### 清理設定（統一為 7 天）

| 項目                   | 保留時間 | 清理頻率             | 說明                       |
| ---------------------- | -------- | -------------------- | -------------------------- |
| **臨時檔案** (`temp/`) | 7 天     | 每 30 分鐘檢查       | 自動清理過期的圖片檔案     |
| **日誌檔案** (`logs/`) | 7 天     | 每小時輪轉，每天清理 | 自動輪轉大檔案，清理舊日誌 |
| **事件儲存** (記憶體)  | 7 天     | 每 24 小時清理       | 自動清理過期的事件資料     |

### 手動清理

```bash
# 手動清理日誌檔案（保留7天）
npm run log-cleanup

# 手動清理臨時檔案（通過 API）
curl -X POST http://localhost:6000/api/cleanup/manual
````

## 👥 用戶管理

### 用戶管理方式

**方式 1：透過 Line Bot 互動管理**（推薦）

1. 在 Line 中對 Bot 發送「管理」或「admin」指令
2. 使用 Flex Message 面板進行用戶管理
3. 僅限管理員使用

**方式 2：手動同步用戶**

```bash
# 同步 LINE followers 到用戶管理系統
node scripts/user-sync.js
```

**方式 3：手動編輯配置檔案**
編輯 `data/user-management.json`：

```json
{
	"adminUsers": ["管理員用戶ID"],
	"notificationTargets": ["通知目標用戶ID"],
	"blocked": ["封鎖用戶ID"],
	"users": {
		"用戶ID": {
			"id": "用戶ID",
			"role": "admin|target|pending|blocked",
			"type": "user",
			"displayName": "顯示名稱",
			"pictureUrl": "頭像URL",
			"addedAt": "ISO時間戳"
		}
	}
}
```

### 用戶角色說明

| 角色        | 說明     | 權限                                   |
| ----------- | -------- | -------------------------------------- |
| **admin**   | 管理員   | 可以使用所有管理功能，包括用戶管理面板 |
| **target**  | 通知目標 | 可以接收 HCP 事件通知                  |
| **pending** | 待審核   | 等待管理員審核，無法接收通知           |
| **blocked** | 已封鎖   | 不會接收任何通知                       |

## 📨 事件管理

### 事件訂閱流程

1. **登入 HCP 管理介面**
2. **前往「事件服務」→「事件訂閱」**
3. **設定 Webhook URL**：`https://您的域名/api/linebot/hcp-event-receiver`（推薦使用主要端點）
   - 或使用向後兼容端點：`https://您的域名/api/hcp/event-receiver`
4. **選擇要訂閱的事件類型**
5. **啟用訂閱**

### 事件類型配置

事件類型配置位於 `data/event-types.json`：

```json
{
	"eventTypes": {
		"197128": {
			"code": 197128,
			"name": "門禁事件",
			"enabled": true
		}
	},
	"settings": {
		"autoSubscribeNewTypes": true
	}
}
```

### 主要事件類型

- 🚪 **197128**: 門禁事件
- 👤 **197130**: 人臉識別匹配
- 🌡️ **193**: 溫度異常
- 🦺 **3089**: 安全設備檢測

## 🔧 API 端點

### 主要端點

| 方法 | 端點                              | 說明                          |
| ---- | --------------------------------- | ----------------------------- |
| POST | `/webhook`                        | Line Bot Webhook（主要）      |
| POST | `/api/linebot`                    | Line Bot API（主要）          |
| POST | `/api/linebot/hcp-event-receiver` | 接收 HCP 事件推送（主要）     |
| POST | `/api/hcp/event-receiver`         | 接收 HCP 事件推送（向後兼容） |
| GET  | `/api/cleanup/status`             | 獲取清理服務狀態              |
| POST | `/api/cleanup/manual`             | 手動觸發清理（臨時檔案）      |
| GET  | `/health`                         | 健康檢查                      |

## 🤖 Line Bot 指令

### 基本指令

- **版本** - 查看 HCP 平台版本資訊
- **攝影機** - 查看攝影機列表
- **擷圖 [ID]** - 擷取指定攝影機圖片
- **幫助** - 顯示使用說明

### 管理員指令（僅限管理員）

- **管理** 或 **admin** - 開啟用戶管理面板
  - 查看待審核用戶
  - 管理現有用戶（管理員和通知目標）
  - 透過 Flex Message 互動管理用戶權限

## 🔐 安全建議

1. ✅ 使用強密碼作為 `EVENT_TOKEN`
2. ✅ 使用 HTTPS 作為 Webhook URL（生產環境）
3. ✅ 不要將 `.env` 檔案提交到版本控制
4. ✅ 定期更新依賴套件以修復安全漏洞
5. ✅ 限制管理員權限，僅授予信任的用戶

## 📦 專案結構

```
yscp-line-bot/
├── app.js                    # 應用程式入口
├── config.js                 # 配置檔案
├── package.json              # 專案依賴
├── ecosystem.config.js        # PM2 配置
├── quick-start.sh            # 一鍵啟動腳本
├── controllers/              # 控制器
│   └── lineBotController.js
├── routes/                   # 路由
│   └── lineBot.js
├── services/                 # 核心服務
│   ├── fileSystemService.js  # 檔案系統服務（統一清理管理）
│   ├── loggerService.js      # 日誌服務（自動清理和輪轉）
│   ├── lineBotService.js     # Line Bot 服務
│   ├── hcpClient.js          # HCP API 客戶端
│   └── ...
├── scripts/                  # 管理腳本
│   ├── log-cleanup.js        # 日誌清理腳本
│   └── user-sync.js          # 用戶同步腳本
├── data/                     # 配置資料
│   ├── event-history.json
│   ├── event-types.json
│   └── user-management.json
├── logs/                     # 日誌檔案（自動清理，保留7天）
├── temp/                     # 臨時圖片（自動清理，保留7天）
└── .env                      # 環境變數（不提交到版本控制）
```

## 🛠️ 技術棧

**後端**: Node.js + Express + Line Bot SDK + PM2  
**日誌**: Winston  
**進程管理**: PM2  
**開發工具**: nodemon
