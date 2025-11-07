# YSCP Line Bot - 智能監控通知系統

整合 HikCentral Professional (HCP) 監控系統與 Line Bot，實現即時警報通知功能。

## ✨ 主要功能

- 🔐 **HCP API 整合** - 連接 HikCentral Professional 監控系統
- 🤖 **Line Bot 服務** - 智能訊息處理和權限管理
- 📨 **即時事件通知** - 自動推送監控事件到 Line
- 👥 **用戶權限管理** - 管理員和群組權限控制
- 🧹 **自動清理服務** - 統一的檔案和日誌清理管理（保留 7 天）

## 🚀 快速開始

### 一鍵啟動（推薦）

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

### 後續設定

1. **編輯 `.env` 檔案**，填入您的 HCP 和 Line Bot 憑證
2. **訂閱事件**：使用 HCP 管理介面訂閱事件，設定 Webhook URL
3. **管理用戶**：透過 Line Bot 發送「管理」或「admin」指令（管理員專用）
4. **測試系統**：在 HCP 管理介面測試事件推送

> 📖 詳細安裝指南請參考 [INSTALLATION_GUIDE.md](INSTALLATION_GUIDE.md)

## 📨 系統架構

```
HikCentral Professional → Webhook → Line Bot → 使用者
      (偵測事件)         (接收推送)   (發送通知)
```

### 通知範例

```
🚨 HCP 系統警報
⏰ 時間: 2024/10/13 下午2:30:00
📌 事件類別: 門禁事件
🔖 事件類型: 門禁拒絕
📹 設備名稱: 主入口門禁
```

## 🔧 配置說明

### 環境變數

在 `.env` 檔案中設定：

```env
# HCP API 配置
HCP_HOST=https://yscp.yenshow.com
HCP_AK=您的_Access_Key
HCP_SK=您的_Secret_Key

# Line Bot 配置
LINE_CHANNEL_ACCESS_TOKEN=您的_Channel_Access_Token
LINE_CHANNEL_SECRET=您的_Channel_Secret

# Webhook 配置
WEBHOOK_URL=https://您的公開域名/api/hcp/event-receiver
EVENT_TOKEN=您的唯一驗證Token
```

### 事件訂閱

**在 HCP 管理介面訂閱事件**：

1. 登入 HCP 管理介面
2. 前往「事件服務」→「事件訂閱」
3. 設定 Webhook URL：`https://您的域名/api/hcp/event-receiver`
4. 選擇要訂閱的事件類型

**主要事件類型**（可在 `data/event-types.json` 查看完整列表）：

- 🚪 **197128**: 門禁事件
- 👤 **197130**: 人臉識別匹配
- 🌡️ **193**: 溫度異常
- 🦺 **3089**: 安全設備檢測

## 📖 詳細文件

- [安裝指南](INSTALLATION_GUIDE.md) - 完整的安裝和部署指南
- [API 文件](#api-端點) - API 端點說明

## 🔧 API 端點

### 主要端點

| 方法 | 端點                      | 說明                          |
| ---- | ------------------------- | ----------------------------- |
| POST | `/webhook`                | Line Bot Webhook（主要）      |
| POST | `/api/linebot`            | Line Bot API（主要）          |
| POST | `/api/hcp/event-receiver` | 接收 HCP 事件推送（向後兼容） |
| GET  | `/api/cleanup/status`     | 獲取清理服務狀態              |
| POST | `/api/cleanup/manual`     | 手動觸發清理（臨時檔案）      |
| GET  | `/health`                 | 健康檢查                      |

### Line Bot 指令

**基本指令**：

- **版本** - 查看 HCP 平台版本資訊
- **攝影機** - 查看攝影機列表
- **擷圖 [ID]** - 擷取指定攝影機圖片
- **幫助** - 顯示使用說明

**管理員指令**（僅限管理員）：

- **管理** 或 **admin** - 開啟用戶管理面板
  - 查看待審核用戶
  - 管理現有用戶（管理員和通知目標）
  - 透過 Flex Message 互動管理用戶權限

## 🧪 測試

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

## 🔐 安全建議

1. ✅ 使用強密碼作為 `EVENT_TOKEN`
2. ✅ 使用 HTTPS 作為 Webhook URL（生產環境）
3. ✅ 不要將 `.env` 檔案提交到版本控制

## 🐛 疑難排解

### 常見問題

**服務無法啟動**

```bash
npm run reset              # 完全重置服務（推薦）
# 或
lsof -i :6000              # 檢查端口占用
kill -9 $(lsof -ti :6000)  # 強制終止佔用端口的進程
npm run start              # 重新啟動
```

> 📖 詳細重啟流程請參考 [RESTART_GUIDE.md](RESTART_GUIDE.md)

**無法接收事件**

1. 檢查 HCP 管理介面中的事件訂閱設定
2. 確認 Webhook URL 正確：`https://您的域名/api/hcp/event-receiver`
3. 檢查 `data/event-types.json` 中的事件類型配置
4. 查看日誌：`npm run logs-app` 和 `npm run logs-error`

**Line Bot 無回應**

1. 確認 LINE Channel 配置正確（Access Token、Secret）
2. 確認 Webhook URL 已設定並啟用
3. 測試服務：`curl http://localhost:6000/webhook/test`
4. 手動同步用戶：`node scripts/user-sync.js`

> 💡 詳細疑難排解請參考 [INSTALLATION_GUIDE.md](INSTALLATION_GUIDE.md)

## 📦 專案結構

```
yscp-line-bot/
└── backend/                    # 後端服務
    ├── services/              # 核心服務
    │   ├── fileSystemService.js    # 檔案系統服務（統一清理管理）
    │   ├── loggerService.js        # 日誌服務（自動清理和輪轉）
    │   ├── lineBotService.js       # Line Bot 服務
    │   ├── hcpClient.js            # HCP API 客戶端
    │   └── ...                     # 其他服務
    ├── controllers/            # 控制器
    ├── routes/                 # 路由
    ├── scripts/                # 管理腳本
    ├── data/                   # 配置資料
    ├── logs/                   # 日誌檔案（自動清理，保留7天）
    ├── temp/                   # 臨時圖片（自動清理，保留7天）
    └── quick-start.sh          # 一鍵啟動
```

## 🛠️ 技術棧

**後端**: Node.js + Express + Line Bot SDK + PM2

## 📝 主要命令

### 快速啟動

```bash
npm run quick-start      # 一鍵啟動所有服務
```

### 服務管理（PM2）

```bash
npm run start      # 啟動服務
npm run stop       # 停止服務
npm run restart    # 重啟服務（推薦）
npm run reload     # 零停機重載服務
npm run reset      # 完全重置服務（清除並重新啟動）
npm run delete     # 完全移除服務
npm run status     # 查看服務狀態
npm run logs       # 查看實時日誌
npm run monitor    # 打開監控儀表板
```

> 📖 詳細重啟流程請參考 [RESTART_GUIDE.md](RESTART_GUIDE.md)

### 用戶管理

**透過 Line Bot 互動管理**（推薦）：

1. 在 Line 中對 Bot 發送「管理」或「admin」指令（需為管理員）
2. 使用 Flex Message 面板管理用戶
   - 查看待審核用戶
   - 審核/拒絕新用戶
   - 管理現有用戶權限

**手動同步用戶**（腳本）：

```bash
# 同步 LINE followers 到用戶管理系統
node scripts/user-sync.js
```

**用戶角色說明**：

- **admin**：管理員，可以使用所有管理功能
- **target**：通知目標，可以接收 HCP 事件通知
- **pending**：待審核，等待管理員審核
- **blocked**：已封鎖，不會接收任何通知

### 事件管理

**在 HCP 管理介面訂閱事件**：

1. 登入 HCP 管理介面
2. 前往「事件服務」→「事件訂閱」
3. 設定 Webhook URL 並選擇事件類型

**查看事件配置**：

- 事件類型配置：`data/event-types.json`
- 事件訂閱狀態：透過 HCP 管理介面查看

### 系統監控與清理

```bash
npm run logs-app                               # 查看系統日誌
npm run logs-error                             # 查看錯誤日誌
npm run log-cleanup                           # 手動清理舊日誌（保留7天）
```

**自動清理服務**（已啟用）：

- **臨時檔案** (`temp/`): 每 30 分鐘清理一次，保留 7 天內的圖片檔案
- **日誌檔案** (`logs/`): 每小時輪轉，每天清理超過 7 天的舊日誌

> 📖 完整命令列表請參考 [INSTALLATION_GUIDE.md](INSTALLATION_GUIDE.md)

## 📄 授權

MIT License

---

**版本**: v1.3.0 | **最後更新**: 2024/10/31

### 更新日誌

**v1.3.0** (2024/10/31)

- ✨ 統一清理服務管理（FileSystemService 職權分離）
- ✨ 自動清理服務（臨時檔案和日誌檔案保留 7 天）
- ✨ 新增 restart、reload、reset 命令
- 🔧 優化 PM2 重啟配置（減少重啟次數，避免端口衝突）
- 🔧 改進錯誤處理和日誌記錄
- 🗑️ 移除前端相關功能（專注於 Line Bot）
