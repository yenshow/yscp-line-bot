/**
 * Ngrok 配置服務
 * 自動配置 ngrok authtoken 並管理隧道
 */

const fs = require("fs");
const path = require("path");
const { execSync, spawn } = require("child_process");
const os = require("os");

class NgrokService {
	constructor() {
		this.authtoken = process.env.NGROK_AUTHTOKEN || null;
		this.enabled = !!this.authtoken;
		this.ngrokPath = this.findNgrokPath();
		this.configPath = this.getConfigPath();
	}

	/**
	 * 尋找 ngrok 二進制檔案路徑
	 */
	findNgrokPath() {
		const possiblePaths = [
			// 優先：專案 node_modules
			path.join(__dirname, "..", "node_modules", "ngrok", "bin", process.platform === "win32" ? "ngrok.exe" : "ngrok"),
			// Electron 打包後的路徑
			path.join(process.resourcesPath || __dirname, "app.asar.unpacked", "node_modules", "ngrok", "bin", process.platform === "win32" ? "ngrok.exe" : "ngrok"),
			path.join(process.resourcesPath || __dirname, "node_modules", "ngrok", "bin", process.platform === "win32" ? "ngrok.exe" : "ngrok"),
			// 嘗試使用 require.resolve（可能失敗，但不影響）
			(function () {
				try {
					const ngrokModulePath = require.resolve("ngrok");
					const ngrokDir = path.dirname(ngrokModulePath);
					return path.join(ngrokDir, "bin", process.platform === "win32" ? "ngrok.exe" : "ngrok");
				} catch (e) {
					return null;
				}
			})()
		].filter((p) => p !== null);

		for (const ngrokPath of possiblePaths) {
			if (ngrokPath && fs.existsSync(ngrokPath)) {
				return ngrokPath;
			}
		}

		// 如果都找不到，嘗試系統路徑
		return "ngrok";
	}

	/**
	 * 取得 ngrok 配置檔案路徑
	 */
	getConfigPath() {
		const homeDir = os.homedir();
		let configDir;
		
		if (process.platform === "win32") {
			configDir = path.join(homeDir, "AppData", "Local", "ngrok");
		} else if (process.platform === "darwin") {
			// macOS: 新版本使用 ~/Library/Application Support/ngrok
			// 舊版本使用 ~/.ngrok2
			const newPath = path.join(homeDir, "Library", "Application Support", "ngrok");
			const oldPath = path.join(homeDir, ".ngrok2");
			
			// 優先使用已存在的路徑，否則使用新路徑
			if (fs.existsSync(path.join(newPath, "ngrok.yml"))) {
				configDir = newPath;
			} else if (fs.existsSync(path.join(oldPath, "ngrok.yml"))) {
				configDir = oldPath;
			} else {
				// 預設使用新路徑
				configDir = newPath;
			}
		} else {
			// Linux: 使用 ~/.ngrok2
			configDir = path.join(homeDir, ".ngrok2");
		}

		// 確保目錄存在
		if (!fs.existsSync(configDir)) {
			fs.mkdirSync(configDir, { recursive: true });
		}

		return path.join(configDir, "ngrok.yml");
	}

	/**
	 * 配置 ngrok authtoken
	 */
	configureAuthtoken() {
		if (!this.enabled) {
			console.log("⚠️  Ngrok 未啟用（未設定 NGROK_AUTHTOKEN）");
			return false;
		}

		if (!this.ngrokPath || this.ngrokPath === "ngrok") {
			console.warn("⚠️  找不到 ngrok 二進制檔案，無法配置 authtoken");
			return false;
		}

		try {
			// 使用 ngrok config add-authtoken 命令
			const command = `"${this.ngrokPath}" config add-authtoken ${this.authtoken}`;
			execSync(command, { stdio: "inherit", shell: true });
			console.log("✅ Ngrok authtoken 已成功配置");
			return true;
		} catch (error) {
			console.error(`❌ 配置 ngrok authtoken 失敗: ${error.message}`);
			return false;
		}
	}

	/**
	 * 檢查 ngrok 是否已配置
	 */
	isConfigured() {
		if (!this.enabled) {
			return false;
		}

		try {
			if (fs.existsSync(this.configPath)) {
				const configContent = fs.readFileSync(this.configPath, "utf-8");
				return configContent.includes("authtoken:");
			}
		} catch (error) {
			// 忽略錯誤
		}

		return false;
	}

	/**
	 * 取得 ngrok 狀態
	 */
	getStatus() {
		return {
			enabled: this.enabled,
			configured: this.isConfigured(),
			ngrokPath: this.ngrokPath,
			configPath: this.configPath
		};
	}

	/**
	 * 取得 ngrok 二進制檔案路徑（供 PM2 使用）
	 */
	getNgrokPath() {
		return this.ngrokPath;
	}

	/**
	 * 檢查是否應該啟動 ngrok
	 */
	shouldStart() {
		return this.enabled && this.isConfigured();
	}
}

module.exports = new NgrokService();
