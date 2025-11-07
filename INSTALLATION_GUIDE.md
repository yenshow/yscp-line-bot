# HCP Line Bot 安裝指南

## 🎯 系統需求

**必要軟體**: Node.js 16+、npm、ngrok  
**必要帳號**: HCP API 憑證、Line Bot 憑證

## 🚀 快速安裝

### 1. 安裝必要軟體

**Node.js**: 前往 [nodejs.org](https://nodejs.org/) 下載 LTS 版本  
**ngrok**: 前往 [ngrok.com/download](https://ngrok.com/download) 下載並設定 authtoken

```bash
# macOS 用戶可使用 Homebrew
brew install node
brew install ngrok/ngrok/ngrok
ngrok config add-authtoken YOUR_AUTHTOKEN
```

### 2. 一鍵啟動（推薦）

```bash
cd backend
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
cd backend
npm install
```

### 2. 建立 `.env` 檔案

```env
HCP_HOST=https://yscp.yenshow.com
HCP_AK=您的_Access_Key
HCP_SK=您的_Secret_Key
LINE_CHANNEL_ACCESS_TOKEN=您的_Channel_Access_Token
LINE_CHANNEL_SECRET=您的_Channel_Secret
PORT=6000
EVENT_TOKEN=hcp_line_bot_2024_secure_token
WEBHOOK_URL=http://localhost:6000/api/hcp/event-receiver
```

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
# 重啟服務（推薦）
npm run restart

# 零停機重載服務
npm run reload

# 完全重置服務（清除並重新啟動）
npm run reset

# 停止服務
npm run stop

# 查看服務狀態
npm run status

# 查看實時日誌
npm run logs
```

> 📖 詳細重啟流程請參考 [RESTART_GUIDE.md](RESTART_GUIDE.md)

## 📋 配置說明

### HCP API 配置

登入 HCP 管理介面，獲取 `HCP_HOST`、`HCP_AK`、`HCP_SK`

### Line Bot 配置

前往 [Line Developers Console](https://developers.line.biz/console/)，建立 Messaging API Channel，獲取 `LINE_CHANNEL_ACCESS_TOKEN`、`LINE_CHANNEL_SECRET`

### Webhook 設定

在 Line Developers Console 設定 Webhook URL: `https://your-ngrok-url.ngrok.io/webhook`

**HCP 事件接收端點**（已配置）：

- 主要端點：`/api/linebot/hcp-event-receiver`
- 向後兼容：`/api/hcp/event-receiver`

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

**無法接收事件**

1. 檢查 HCP 管理介面中的事件訂閱設定
2. 確認 Webhook URL 正確設定
3. 檢查 `data/event-types.json` 中的事件類型配置
4. 查看日誌：`npm run logs-app`

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
3. **設定 Webhook URL**：`https://您的域名/api/hcp/event-receiver`
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
