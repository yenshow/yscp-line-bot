# YSCP Line Bot - 智能監控通知系統

整合 Yenshow Center Professional (YSCP) 監控系統與 Line Bot，實現即時警報通知功能。

## ✨ 主要功能

- 🔐 **YSCP API 整合** - 連接 HikCentral Professional 監控系統
- 🤖 **Line Bot 服務** - 智能訊息處理和權限管理
- 📨 **即時事件通知** - 自動推送監控事件到 Line
- 👥 **用戶權限管理** - 管理員和群組權限控制
- 🔑 **授權驗證系統** - 基於 MAC Address 的授權管理機制
- 🧹 **自動清理服務** - 統一的檔案和日誌清理管理（保留 7 天）
- 🌐 **跨平台支援** - 支援 Windows、macOS、Linux
- 📦 **安裝精靈** - 專業的安裝程式，支援授權驗證和自動配置

## 🚀 快速開始

### 安裝方式

**Windows 平台**：

1. 下載 `YSCP-Line-Bot-Setup.exe` 安裝檔
2. 執行安裝精靈，按照提示完成安裝
3. 在安裝過程中完成授權驗證和系統配置

**macOS 平台**：

1. 下載 `YSCP-Line-Bot.dmg` 安裝檔
2. 拖拽到 Applications 資料夾
3. 首次執行時完成授權驗證和配置

**Linux 平台**：

1. 下載 `YSCP-Line-Bot.AppImage` 安裝檔
2. 賦予執行權限：`chmod +x YSCP-Line-Bot.AppImage`
3. 執行安裝檔並完成配置

### 安裝後啟動

安裝完成後，從開始選單或桌面快捷方式啟動服務，或使用命令列：

```bash
npm start
```

### 後續設定

1. **授權驗證**：安裝精靈會引導完成授權驗證（如未完成，請參考授權系統說明）
2. **系統配置**：編輯 `.env` 檔案，填入 YSCP 和 Line Bot 憑證
3. **事件訂閱**：系統會自動訂閱事件（如失敗可手動執行 `npm run subscribe-events`）
4. **管理用戶**：透過 Line Bot 發送「管理」或「admin」指令（管理員專用）

> 📖 詳細安裝指南請參考 [安裝指南](docs/INSTALLATION_GUIDE.md)  
> 💻 開發環境設置請參考 [開發環境指南](docs/DEVELOPMENT.md)

## 📨 系統架構

### YSCP OpenAPI 模式（集中化管理）

```
HikCentral Professional → Webhook → Line Bot → 使用者
      (偵測事件)         (接收推送)   (發送通知)
```

### 通知範例

```
🚨 YSCP 系統警報
⏰ 時間: 2024/10/13 下午2:30:00
📌 事件類別: 門禁事件
🔖 事件類型: 門禁拒絕
📹 設備名稱: 主入口門禁
```

## 🔧 配置說明

### 環境變數

在 `.env` 檔案中設定：

```env
# YSCP API 配置
YSCP_HOST=https://yscp.yenshow.com
YSCP_AK=您的_Access_Key
YSCP_SK=您的_Secret_Key

# Line Bot 配置
LINE_CHANNEL_ACCESS_TOKEN=您的_Channel_Access_Token
LINE_CHANNEL_SECRET=您的_Channel_Secret

# 伺服器配置
PORT=6000

# Webhook 配置
WEBHOOK_URL=https://您的公開域名/api/linebot/yscp-event-receiver
EVENT_TOKEN=您的唯一驗證Token

# Ngrok 配置（可選，用於本地開發時提供公開 URL）
# 1. 前往 https://dashboard.ngrok.com/get-started/your-authtoken 註冊並取得 authtoken
# 2. 將 authtoken 填入下方，應用程式啟動時會自動配置
NGROK_AUTHTOKEN=您的ngrok_authtoken

# 公開 URL 配置（用於圖片顯示）
# 如果使用 ngrok，此值會在 ngrok 啟動後自動更新
# 如果使用固定域名，也可以直接填入
NGROK_URL=https://您的ngrok域名.ngrok-free.dev
```

### 事件訂閱

安裝完成後系統會自動執行事件訂閱，如失敗可手動執行：`npm run subscribe-events`

## 📖 詳細文件

- [安裝指南](docs/INSTALLATION_GUIDE.md) - 完整的安裝和部署指南
- [專業授權管理系統](docs/PROFESSIONAL_LICENSE_SYSTEM.md) - 授權驗證系統完整指南
- [API 文件](#api-端點) - API 端點說明

## 🔧 API 端點

### 主要端點

| 方法 | 端點                              | 說明                          |
| ---- | --------------------------------- | ----------------------------- |
| POST | `/webhook`                        | Line Bot Webhook（主要）      |
| POST | `/api/linebot`                    | Line Bot API（主要）          |
| POST | `/api/linebot/yscp-event-receiver` | 接收 YSCP 事件推送（主要）     |
| POST | `/api/yscp/event-receiver`         | 接收 YSCP 事件推送（向後兼容） |
| GET  | `/api/cleanup/status`             | 獲取清理服務狀態              |
| POST | `/api/cleanup/manual`             | 手動觸發清理（臨時檔案）      |
| GET  | `/api/license/status`             | 獲取授權狀態                  |
| POST | `/api/license/validate`           | 驗證授權                      |
| POST | `/api/license/activate`           | 啟用授權                      |
| GET  | `/health`                         | 健康檢查                      |

### Line Bot 指令

**基本指令**：

- **版本** - 查看 YSCP 平台版本資訊
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
# 測試授權系統
npm run test-license

# 測試服務
curl http://localhost:6000/health
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

## 🔑 授權系統

系統已整合專業授權管理系統，支援線上驗證、管理後台、硬體指紋綁定等功能。

> 📖 詳細說明請參考 [專業授權管理系統](docs/PROFESSIONAL_LICENSE_SYSTEM.md)

## 🔐 安全建議

1. ✅ 使用強密碼作為 `EVENT_TOKEN`
2. ✅ 使用 HTTPS 作為 Webhook URL（生產環境）
3. ✅ 不要將 `.env` 檔案提交到版本控制
4. ✅ 生產環境設定 `LICENSE_ENCRYPTION_KEY` 環境變數
5. ✅ 妥善保管授權生成器工具

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

1. 檢查 YSCP 管理介面中的事件訂閱設定
2. 確認 Webhook URL 正確：`https://您的域名/api/linebot/yscp-event-receiver`
3. 檢查 `data/event-types.json` 中的事件類型配置
4. 查看日誌：`npm run logs-app` 和 `npm run logs-error`
5. 手動執行事件訂閱：`npm run subscribe-events`

**Line Bot 無回應**

1. 確認 LINE Channel 配置正確（Access Token、Secret）
2. 確認 Webhook URL 已設定並啟用
3. 測試服務：`curl http://localhost:6000/webhook/test`
4. 手動同步用戶：`node scripts/user-sync.js`

> 💡 詳細疑難排解請參考 [INSTALLATION_GUIDE.md](INSTALLATION_GUIDE.md)

## 📦 專案結構

```
YSCP Line Bot/
├── app.js                    # 應用程式入口
├── config.js                 # 配置檔案
├── package.json              # 專案依賴
├── ecosystem.config.js        # PM2 配置
├── installer/                 # 安裝精靈相關檔案
│   ├── installer.nsh         # NSIS 安裝腳本
│   └── post-install.js       # 安裝後配置腳本
├── controllers/              # 控制器
│   └── lineBotController.js
├── routes/                   # 路由
│   └── lineBot.js
├── services/                 # 核心服務
│   ├── fileSystemService.js  # 檔案系統服務（統一清理管理）
│   ├── loggerService.js      # 日誌服務（自動清理和輪轉）
│   ├── lineBotService.js     # Line Bot 服務
│   ├── hcpClient.js          # YSCP API 客戶端
│   └── ...                   # 其他服務
├── scripts/                  # 管理腳本
│   ├── subscribe-events.js   # 事件訂閱腳本
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

## 📝 主要命令

```bash
npm start      # 啟動服務
npm run restart    # 重啟服務
npm run stop       # 停止服務
npm run status     # 查看服務狀態
npm run logs       # 查看實時日誌
npm run subscribe-events  # 手動訂閱事件
```

> 📖 完整命令列表請參考 [安裝指南](docs/INSTALLATION_GUIDE.md)

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
