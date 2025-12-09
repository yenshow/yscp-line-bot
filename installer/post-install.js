/**
 * 安裝後配置腳本
 * 在安裝完成後自動執行，進行系統配置和授權啟用
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const LicenseService = require("../services/licenseService");

const INSTALL_DIR = process.env.INSTALL_DIR || process.cwd();
const DATA_DIR = path.join(INSTALL_DIR, "data");
const ENV_FILE = path.join(INSTALL_DIR, ".env");

console.log("🔧 YSCP Line Bot 安裝後配置");
console.log("========================");
console.log(`安裝目錄: ${INSTALL_DIR}`);

// 確保必要目錄存在
function ensureDirectories() {
	const dirs = [DATA_DIR, path.join(INSTALL_DIR, "logs"), path.join(INSTALL_DIR, "temp")];
	dirs.forEach((dir) => {
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
			console.log(`✅ 建立目錄: ${dir}`);
		}
	});
}

// 讀取授權資訊（從安裝精靈傳入）
function loadLicenseFromInstaller() {
	const licenseIni = path.join(INSTALL_DIR, "license.ini");
	if (fs.existsSync(licenseIni)) {
		const ini = require("ini");
		const config = ini.parse(fs.readFileSync(licenseIni, "utf-8"));
		if (config.License) {
			return {
				serialNumber: config.License.SerialNumber
			};
		}
	}
	return null;
}

// 啟用授權（異步）
async function activateLicense(licenseInfo) {
	if (!licenseInfo) {
		console.log("⚠️  未找到授權資訊，請稍後手動啟用");
		return false;
	}

	try {
		const { serialNumber } = licenseInfo;

		if (!serialNumber) {
			console.error("❌ SerialNumber 不能為空");
			return false;
		}

		// 從伺服器獲取 License Key 並儲存授權
		const success = await LicenseService.saveLicense(serialNumber);
		if (success) {
			console.log("✅ 授權已成功啟用");
			return true;
		} else {
			console.error("❌ 授權啟用失敗（無法從伺服器獲取 License Key 或儲存失敗）");
			console.error("   請確認：");
			console.error("   1. 授權伺服器已啟動並可訪問");
			console.error("   2. LICENSE_SERVER_URL 環境變數已正確設定");
			console.error("   3. SerialNumber 已在授權伺服器中建立並啟用");
			return false;
		}
	} catch (error) {
		console.error(`❌ 啟用授權時發生錯誤: ${error.message}`);
		return false;
	}
}

// 建立 .env 檔案（如果不存在）
function createEnvFile() {
	if (fs.existsSync(ENV_FILE)) {
		console.log("✅ .env 檔案已存在");
		return;
	}

	const envTemplate = `# YSCP API 配置
HCP_HOST=https://yscp.yenshow.com
HCP_AK=
HCP_SK=

# Line Bot 配置
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=

# 伺服器配置
PORT=6000

# Webhook 配置
WEBHOOK_URL=http://localhost:6000/api/linebot/yscp-event-receiver
EVENT_TOKEN=yscp_line_bot_2024_secure_token

# Ngrok 配置（可選，用於本地開發時提供公開 URL）
# 1. 前往 https://dashboard.ngrok.com/get-started/your-authtoken 註冊並取得 authtoken
# 2. 將 authtoken 填入下方，應用程式啟動時會自動配置
NGROK_AUTHTOKEN=

# 公開 URL 配置（用於圖片顯示）
# 如果使用 ngrok，此值會在 ngrok 啟動後自動更新
NGROK_URL=

# 授權伺服器配置（專業授權管理系統）
LICENSE_SERVER_URL=https://api.yenshow.com
LICENSE_ONLINE_MODE=true
LICENSE_HEARTBEAT_INTERVAL=3600000
LICENSE_OFFLINE_GRACE_PERIOD=86400000
`;

	fs.writeFileSync(ENV_FILE, envTemplate);
	console.log("✅ 已建立 .env 範例檔案");
}

// 主函數（異步）
async function main() {
	try {
		console.log("\n📦 步驟 1: 建立必要目錄");
		ensureDirectories();

		console.log("\n🔑 步驟 2: 啟用授權");
		const licenseInfo = loadLicenseFromInstaller();
		await activateLicense(licenseInfo);

		console.log("\n⚙️  步驟 3: 建立配置檔案");
		createEnvFile();

		console.log("\n✅ 安裝後配置完成！");
		console.log("\n📝 下一步:");
		console.log("   1. 編輯 .env 檔案，填入必要配置：");
		console.log("      - HCP_AK 和 HCP_SK（YSCP API 憑證）");
		console.log("      - LINE_CHANNEL_ACCESS_TOKEN 和 LINE_CHANNEL_SECRET（Line Bot 憑證）");
		console.log("      - WEBHOOK_URL（公開的 Webhook URL，用於接收 YSCP 事件）");
		console.log("      - EVENT_TOKEN（事件驗證 Token）");
		console.log("");
		console.log("   2. （可選）配置 Ngrok（用於本地開發時提供公開 URL）：");
		console.log("      a. 前往 https://dashboard.ngrok.com/get-started/your-authtoken");
		console.log("      b. 註冊/登入帳號並取得 authtoken");
		console.log("      c. 在 .env 中設定 NGROK_AUTHTOKEN=你的authtoken");
		console.log("      d. 應用程式啟動時會自動配置 ngrok，並更新 NGROK_URL");
		console.log("");
		console.log("   3. （可選）配置授權伺服器 URL（如使用線上授權）：");
		console.log("      LICENSE_SERVER_URL=https://api.yenshow.com");
		console.log("");
		console.log("   4. 啟動服務:");
		console.log("      - 開發模式: npm run dev");
		console.log("      - 生產模式: npm start");
		console.log("      - Electron 應用: npm run electron");
	} catch (error) {
		console.error(`❌ 配置過程發生錯誤: ${error.message}`);
		process.exit(1);
	}
}

main();

