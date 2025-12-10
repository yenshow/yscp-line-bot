/**
 * Electron 主程式
 * 用於打包和啟動 YSCP Line Bot 應用程式
 */

const { app, BrowserWindow, Tray, Menu, ipcMain, shell, dialog, nativeImage } = require("electron");
const path = require("path");
const { spawn, execSync } = require("child_process");
const fs = require("fs");

let mainWindow = null;
let tray = null;
let nodeProcess = null;
let envFileWatcher = null; // .env 檔案監聽器

// 應用程式路徑初始化
function initializePaths() {
	if (app.isPackaged) {
		// 打包後：資源在 asar 中，數據在應用程式目錄
		const appResourcePath = app.getAppPath(); // 指向 app.asar
		let appDataPath;

		if (process.platform === "darwin") {
			// macOS: /Applications/AppName.app/Contents/MacOS/AppName -> ../Resources/
			appDataPath = path.resolve(path.dirname(process.execPath), "..", "Resources");
		} else if (process.platform === "win32") {
			// Windows: C:\Program Files\AppName\resources\app.asar -> ..\ (應用程式根目錄)
			// 或 C:\Users\...\AppData\Local\AppName\app-1.0.0\AppName.exe -> .\
			appDataPath = path.resolve(path.dirname(process.execPath));
		} else {
			// Linux: 數據在執行檔同目錄
			appDataPath = path.resolve(path.dirname(process.execPath));
		}

		return { appResourcePath, appDataPath };
	} else {
		// 開發環境：兩者相同
		return { appResourcePath: __dirname, appDataPath: __dirname };
	}
}

const { appResourcePath, appDataPath } = initializePaths();

// 取得圖示路徑（支援多平台格式）
function resolveIcon() {
	const iconExt = process.platform === "win32" ? "ico" : process.platform === "darwin" ? "icns" : "png";
	const iconName = `icon.${iconExt}`;
	const candidates = [
		path.join(appDataPath, "build", iconName),
		path.join(appResourcePath, "build", iconName),
		// 備用：嘗試其他格式
		path.join(appDataPath, "build", "icon.png"),
		path.join(appResourcePath, "build", "icon.png")
	];

	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}
	return null;
}

const nodeAppPath = path.join(appResourcePath, "app.js");
const ecosystemConfigPath = path.join(appResourcePath, "ecosystem.config.js");
const envPath = path.join(appDataPath, ".env");

// 讀取 .env 檔案內容（共用函數）
function readEnvFile() {
	const values = {};
	if (fs.existsSync(envPath)) {
		try {
			const content = fs.readFileSync(envPath, "utf-8");
			const lines = content.split("\n");
			lines.forEach((line) => {
				line = line.trim();
				if (line && !line.startsWith("#")) {
					const match = line.match(/^([^=]+)=(.*)$/);
					if (match) {
						const key = match[1].trim();
						const value = match[2].trim().replace(/^["']|["']$/g, "");
						values[key] = value;
					}
				}
			});
		} catch (error) {
			console.error("讀取配置檔案失敗:", error);
		}
	}
	return values;
}

// 獲取 PM2 命令路徑
function getPm2Command() {
	// PM2 可能在資源目錄的 node_modules 中（開發環境）或需要全局安裝
	const pm2Path = path.join(appResourcePath, "node_modules", ".bin", "pm2");
	const pm2GlobalPath = process.platform === "win32" ? "pm2.cmd" : "pm2";

	if (fs.existsSync(pm2Path)) {
		return { cmd: pm2Path, available: true };
	}

	// 檢查全域 PM2
	try {
		execSync(`${pm2GlobalPath} --version`, { stdio: "ignore" });
		return { cmd: pm2GlobalPath, available: true };
	} catch (e) {
		return { cmd: null, available: false };
	}
}

// 檢查 Node.js 應用是否存在
function checkNodeApp() {
	if (!fs.existsSync(nodeAppPath)) {
		console.error(`❌ 找不到應用程式: ${nodeAppPath}`);
		return false;
	}
	return true;
}

// 啟動 Node.js 應用
function startNodeApp() {
	if (!checkNodeApp()) {
		return false;
	}

	console.log("🚀 啟動 YSCP Line Bot 服務...");

	const pm2 = getPm2Command();
	const env = {
		...process.env,
		NODE_ENV: "production",
		PORT: process.env.PORT || "6000"
	};

	if (pm2.available && fs.existsSync(ecosystemConfigPath)) {
		// 使用 PM2 啟動
		nodeProcess = spawn(pm2.cmd, ["start", ecosystemConfigPath], {
			cwd: appDataPath,
			shell: true,
			env
		});
	} else {
		// 直接啟動 Node.js
		// Windows 上需要確保使用正確的 Node.js 路徑
		const nodeCmd = process.platform === "win32" ? "node.exe" : "node";
		const spawnOptions = {
			cwd: appDataPath,
			env: { ...env, PATH: process.env.PATH }
		};

		// Windows 上需要 shell: true 來正確執行
		if (process.platform === "win32") {
			spawnOptions.shell = true;
		}

		nodeProcess = spawn(nodeCmd, [nodeAppPath], spawnOptions);
	}

	// 處理輸出
	nodeProcess.stdout?.on("data", (data) => {
		console.log(`[Node] ${data.toString()}`);
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send("node-log", data.toString());
		}
	});

	nodeProcess.stderr?.on("data", (data) => {
		console.error(`[Node Error] ${data.toString()}`);
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send("node-error", data.toString());
		}
	});

	nodeProcess.on("exit", (code) => {
		console.log(`Node.js 應用程式已退出，代碼: ${code}`);
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send("node-exit", code);
		}
		// 如果不是手動停止，可以選擇自動重啟
		if (code !== 0 && code !== null) {
			console.log("⚠️  應用程式異常退出，3 秒後重啟...");
			setTimeout(() => {
				if (!mainWindow?.isDestroyed()) {
					startNodeApp();
				}
			}, 3000);
		}
	});

	return true;
}

// 停止 Node.js 應用
function stopNodeApp() {
	if (!nodeProcess) return;

	console.log("🛑 停止 YSCP Line Bot 服務...");

	// 嘗試使用 PM2 停止
	const pm2 = getPm2Command();
	if (pm2.available) {
		try {
			execSync(`${pm2.cmd} stop all`, { stdio: "ignore", cwd: appDataPath });
		} catch (e) {
			// PM2 不可用，忽略
		}
	}

	// 終止進程（跨平台處理）
	if (!nodeProcess.killed) {
		const signal = process.platform === "win32" ? null : "SIGTERM";
		try {
			if (signal) {
				nodeProcess.kill(signal);
			} else {
				// Windows: 使用 taskkill 或直接終止
				nodeProcess.kill();
			}
		} catch (error) {
			console.error("終止進程失敗:", error);
		}

		// 如果進程未在 5 秒內退出，強制終止
		setTimeout(() => {
			if (nodeProcess && !nodeProcess.killed) {
				try {
					if (process.platform === "win32") {
						nodeProcess.kill();
					} else {
				nodeProcess.kill("SIGKILL");
					}
				} catch (error) {
					console.error("強制終止進程失敗:", error);
				}
			}
		}, 5000);
	}
	nodeProcess = null;
}

// 建立主視窗
function createWindow() {
	// 如果視窗已存在且未銷毀，直接顯示並聚焦
	if (mainWindow && !mainWindow.isDestroyed()) {
		if (mainWindow.isMinimized()) {
			mainWindow.restore();
		}
		mainWindow.show();
		mainWindow.focus();
		return;
	}

	mainWindow = new BrowserWindow({
		width: 800,
		height: 600,
		title: "YSCP Line Bot",
		icon: resolveIcon() || undefined,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false
		},
		// 如需預先隱藏主視窗可改為 false
		show: true,
		autoHideMenuBar: true
	});

	// 載入 HTML 頁面
	const htmlPath = path.join(appResourcePath, "renderer", "index.html");

	// 僅在開發環境或調試模式下輸出詳細日誌
	if (!app.isPackaged || process.env.DEBUG) {
		console.log("📄 載入 HTML 路徑:", htmlPath);
		console.log("📁 資源路徑:", appResourcePath);
		console.log("📁 數據路徑:", appDataPath);
	}

	// 監聽載入錯誤
	mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription, validatedURL) => {
		console.error("❌ 頁面載入失敗:", {
			errorCode,
			errorDescription,
			validatedURL,
			htmlPath
		});
	});

	// 監聽控制台錯誤
	mainWindow.webContents.on("console-message", (event, level, message) => {
		if (level >= 2) {
			// 2 = error, 3 = warning
			console.error("🔴 Renderer 錯誤:", message);
		}
	});

	// loadFile 可以自動處理 asar 內的路徑
	mainWindow.loadFile(htmlPath).catch((error) => {
		console.error("❌ 載入 HTML 失敗:", error);
		// 如果載入失敗，顯示錯誤訊息
		mainWindow.webContents.once("did-finish-load", () => {
			mainWindow.webContents.executeJavaScript(`
				document.body.innerHTML = '<div style="padding: 40px; text-align: center; font-family: system-ui;">
					<h1 style="color: #dc3545;">❌ 載入錯誤</h1>
					<p>無法載入應用程式介面</p>
					<p style="font-size: 12px; color: #666; margin-top: 20px;">錯誤: ${error.message}</p>
					<p style="font-size: 12px; color: #666;">路徑: ${htmlPath}</p>
					<p style="font-size: 11px; color: #999; margin-top: 10px;">請檢查應用程式是否正確安裝</p>
				</div>';
			`);
		});
	});

	// 視窗載入完成後初始化
	mainWindow.webContents.once("did-finish-load", () => {
		// 發送初始狀態
		sendToWindow("license-status", checkLicenseStatus());
		sendToWindow("config-status", {
			exists: fs.existsSync(envPath),
			path: envPath
		});
		sendToWindow("service-status", { running: nodeProcess && !nodeProcess.killed });

		// 開始監聽 .env 檔案變化
		watchEnvFile();
	});

	// 視窗關閉時隱藏到系統托盤（僅在 macOS 和 Linux，Windows 通常直接退出）
	mainWindow.on("close", (event) => {
		// Windows 上如果沒有系統托盤，直接退出
		if (process.platform === "win32" && !tray) {
			app.isQuiting = true;
			return;
		}

		if (!app.isQuiting) {
			event.preventDefault();
			mainWindow.hide();
		}
	});

	mainWindow.on("closed", () => {
		// 關閉檔案監聽器
		if (envFileWatcher) {
			envFileWatcher.close();
			envFileWatcher = null;
		}
		mainWindow = null;
	});
}

// 建立系統托盤
function createTray() {
	const iconPath = resolveIcon();
	tray = iconPath ? new Tray(iconPath) : new Tray(nativeImage.createEmpty());

	const contextMenu = Menu.buildFromTemplate([
		{
			label: "顯示主視窗",
			click: () => {
				showAndFocusWindow() || createWindow();
			}
		},
		{
			label: "啟動服務",
			click: () => {
				if (startNodeApp()) {
					sendToWindow("service-started");
				}
			}
		},
		{
			label: "停止服務",
			click: () => {
				stopNodeApp();
				sendToWindow("service-stopped");
			}
		},
		{ type: "separator" },
		{
			label: "開啟配置",
			click: openConfigFile
		},
		{
			label: "查看日誌",
			click: openLogsFiles
		},
		{ type: "separator" },
		{
			label: "退出",
			click: () => {
				app.isQuiting = true;
				stopNodeApp();
				app.quit();
			}
		}
	]);

	tray.setToolTip("YSCP Line Bot");
	tray.setContextMenu(contextMenu);

	tray.on("click", () => {
		if (mainWindow && !mainWindow.isDestroyed()) {
			if (mainWindow.isVisible()) {
				mainWindow.hide();
			} else {
				showAndFocusWindow();
			}
		} else {
			createWindow();
		}
	});
}

// 輔助函數：安全發送訊息到主視窗
function sendToWindow(channel, data) {
	if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
		try {
		mainWindow.webContents.send(channel, data);
		} catch (error) {
			console.error(`發送訊息到視窗失敗 [${channel}]:`, error);
		}
	}
}

// 輔助函數：顯示並聚焦視窗
function showAndFocusWindow() {
	if (mainWindow && !mainWindow.isDestroyed()) {
		if (mainWindow.isMinimized()) {
			mainWindow.restore();
		}
		mainWindow.show();
		mainWindow.focus();
		return true;
	}
	return false;
}

// 輔助函數：安全開啟檔案或目錄
function safeOpenPath(filePath, fallbackToFolder = true) {
	return shell.openPath(filePath).catch((error) => {
		console.error(`無法開啟 ${filePath}:`, error);
		if (fallbackToFolder) {
			shell.showItemInFolder(filePath);
		}
	});
}

// 檢查授權狀態
function checkLicenseStatus() {
	try {
		const LicenseService = require("./services/licenseService");
		const status = LicenseService.getLicenseStatus();
		return {
			hasLicense: status.hasLicense,
			serialNumber: status.licenseData ? status.licenseData.serialNumber : null
		};
	} catch (error) {
		console.error("檢查授權狀態失敗:", error);
		return { hasLicense: false, serialNumber: null };
	}
}

// 開啟日誌檔案（共用函數）
function openLogsFiles() {
	const logsPath = path.join(appDataPath, "logs");

	// 確保日誌目錄存在
	if (!fs.existsSync(logsPath)) {
		fs.mkdirSync(logsPath, { recursive: true });
	}

	// 獲取日誌檔案列表
	const logFiles = fs.readdirSync(logsPath).filter((file) => file.endsWith(".log"));

	if (logFiles.length === 0) {
		// 沒有日誌檔案，只開啟目錄
		shell.openPath(logsPath);
	} else if (logFiles.length === 1) {
		// 只有一個日誌檔案，直接開啟
		safeOpenPath(path.join(logsPath, logFiles[0]));
	} else {
		// 多個日誌檔案，顯示選擇對話框
		dialog
			.showMessageBox(mainWindow, {
				type: "question",
				buttons: ["開啟目錄", "開啟 app.log", "開啟 error.log", "取消"],
				defaultId: 0,
				title: "選擇日誌",
				message: "有多個日誌檔案可用",
				detail: `找到 ${logFiles.length} 個日誌檔案：\n${logFiles.join("\n")}`
			})
			.then((result) => {
				if (result.response === 0) {
					shell.openPath(logsPath);
				} else if (result.response === 1) {
					const appLogPath = path.join(logsPath, "app.log");
					if (fs.existsSync(appLogPath)) {
						safeOpenPath(appLogPath);
					}
				} else if (result.response === 2) {
					const errorLogPath = path.join(logsPath, "error.log");
					if (fs.existsSync(errorLogPath)) {
						safeOpenPath(errorLogPath);
					}
				}
			});
	}
}

// 開啟配置（共用函數）
function openConfigFile() {
	if (fs.existsSync(envPath)) {
		// 檔案存在，使用系統預設編輯器開啟
		safeOpenPath(envPath);
	} else {
		// 檔案不存在，詢問是否要建立
		dialog
			.showMessageBox(mainWindow, {
				type: "question",
				buttons: ["建立檔案", "開啟目錄", "取消"],
				defaultId: 0,
				title: "配置檔案不存在",
				message: ".env 配置檔案不存在",
				detail: "是否要建立新的配置檔案？"
			})
			.then((result) => {
				if (result.response === 0) {
					// 建立 .env 檔案
					fs.writeFileSync(envPath, getEnvTemplate());
					// 開啟新建立的檔案
					safeOpenPath(envPath);
					// 開始監聽新建立的檔案
					watchEnvFile();
					// 通知前端配置檔案已建立
					sendToWindow("config-status", {
						exists: true,
						path: envPath
					});
					sendToWindow("config-values", readEnvFile());
				} else if (result.response === 1) {
					shell.showItemInFolder(appDataPath);
				}
			});
	}
}

// IPC 處理
ipcMain.on("start-service", async () => {
	// 先檢查授權狀態
	const licenseStatus = checkLicenseStatus();

	if (!licenseStatus.hasLicense) {
		// 授權未啟用，顯示提示
		sendToWindow("license-required", {
			message: "服務無法啟動：尚未啟用授權",
			reason: "授權檔案不存在，請先啟用授權"
		});
		return;
	}

	// 嘗試啟動服務
	if (startNodeApp()) {
		sendToWindow("service-starting");
	}
});

ipcMain.on("check-license", () => {
	sendToWindow("license-status", checkLicenseStatus());
});

ipcMain.on("activate-license", async (event, data) => {
	try {
		const LicenseService = require("./services/licenseService");
		const { serialNumber, licenseKey } = data;

		if (!serialNumber || !licenseKey) {
			sendToWindow("license-activated", {
				success: false,
				error: "請輸入 SerialNumber 和 LicenseKey"
			});
			return;
		}

		// 直接使用提供的 LicenseKey，不從伺服器獲取
		const success = await LicenseService.saveLicense(serialNumber, { licenseKey }, false);

		sendToWindow("license-activated", {
			success: success,
			serialNumber: success ? serialNumber : null,
			error: success ? null : "授權儲存失敗"
		});
	} catch (error) {
		// 提供更詳細的錯誤訊息
		let errorMessage = error.message || "授權儲存失敗";
		
		// 根據錯誤類型提供更友好的訊息
		if (error.message && error.message.includes("加密")) {
			errorMessage = "授權資料加密失敗，請檢查系統環境";
		} else if (error.message && error.message.includes("權限")) {
			errorMessage =
				"沒有寫入權限，請檢查應用程式權限設定\n\n提示：\n- macOS: 請在「系統偏好設定」→「安全性與隱私」中允許應用程式存取檔案\n- Windows: 請以管理員權限執行應用程式\n- Linux: 請檢查目錄權限設定";
		} else if ((error.message && error.message.includes("目錄不存在")) || error.message.includes("無法建立授權目錄")) {
			errorMessage = "無法建立授權檔案目錄，請檢查應用程式安裝路徑\n\n提示：請確認應用程式有權限在安裝目錄建立 data 資料夾";
		} else if (error.message && error.message.includes("磁碟空間")) {
			errorMessage = "磁碟空間不足，無法儲存授權檔案";
		} else if (error.message && error.message.includes("無法寫入授權檔案")) {
			// 保留完整的錯誤訊息（包含路徑資訊）
			errorMessage = error.message;
		} else if (error.message && error.message.includes("SerialNumber 不匹配")) {
			errorMessage = error.message; // 保留原始錯誤訊息
		} else if (error.message && (error.message.includes("驗證失敗") || error.message.includes("License Key"))) {
			// 授權伺服器驗證相關錯誤
			if (error.message.includes("ECONNREFUSED") || error.message.includes("ENOTFOUND") || error.message.includes("timeout")) {
				errorMessage = "無法連接到授權伺服器，請檢查網路連接或授權伺服器狀態";
			} else {
				errorMessage = error.message; // 保留原始錯誤訊息（如：License Key 驗證失敗）
			}
		}

		console.error("授權啟用失敗:", error);
		sendToWindow("license-activated", {
			success: false,
			error: errorMessage
		});
	}
});

ipcMain.on("stop-service", () => {
	stopNodeApp();
	sendToWindow("service-stopped");
});

ipcMain.on("open-logs", () => {
	openLogsFiles();
});

ipcMain.on("open-config", () => {
	openConfigFile();
});

// 配置相關 IPC 處理器
ipcMain.on("check-config-status", () => {
	// 確保 .env 檔案存在（如果不存在則自動建立）
	// 同時確保 EVENT_TOKEN 和 WEBHOOK_URL 存在（如果不存在則自動生成）
	const fileCreated = ensureEnvFileExists();
	
	if (!app.isPackaged || process.env.DEBUG) {
		console.log("📁 檢查配置檔案狀態:", {
			path: envPath,
			exists: fs.existsSync(envPath),
			created: fileCreated
		});
	}
	
	sendToWindow("config-status", {
		exists: fs.existsSync(envPath),
		path: envPath
	});
	// 重新啟動監聽（如果檔案狀態改變）
	watchEnvFile();
	// 自動發送配置值（確保前端能立即收到）
	const values = readEnvFile();
	if (!app.isPackaged || process.env.DEBUG) {
		console.log("📋 發送配置值:", Object.keys(values).length, "個項目");
	}
	sendToWindow("config-values", values);
});

ipcMain.on("load-config-values", () => {
	// 確保 WEBHOOK_URL 存在（基於 NGROK_URL 自動生成）
	ensureWebhookUrl();
	
	const values = readEnvFile();
	if (!app.isPackaged || process.env.DEBUG) {
		console.log("📋 載入配置值:", Object.keys(values).length, "個項目");
	}
	sendToWindow("config-values", values);
});

// 生成隨機的 EVENT_TOKEN
function generateEventToken() {
	const crypto = require("crypto");
	// 生成 32 字節的隨機 token，轉換為 base64 字串（約 44 個字元）
	return crypto.randomBytes(32).toString("base64");
}

// 確保 EVENT_TOKEN 存在（如果不存在則自動生成）
function ensureEventToken() {
	const values = readEnvFile();
	if (!values.EVENT_TOKEN || values.EVENT_TOKEN.trim() === "") {
		// 生成新的 EVENT_TOKEN
		const newToken = generateEventToken();
		
		// 讀取現有的 .env 檔案內容
		let content = "";
		if (fs.existsSync(envPath)) {
			content = fs.readFileSync(envPath, "utf-8");
		}
		
		// 更新或添加 EVENT_TOKEN
		const lines = content.split("\n");
		const newLines = [];
		let tokenUpdated = false;
		
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const trimmed = line.trim();
			
			// 檢查是否為 EVENT_TOKEN 配置項
			if (trimmed.match(/^EVENT_TOKEN\s*=/)) {
				newLines.push(`EVENT_TOKEN=${newToken}`);
				tokenUpdated = true;
			} else {
				newLines.push(line);
			}
		}
		
		// 如果沒有找到 EVENT_TOKEN，在 Webhook 配置區段後添加
		if (!tokenUpdated) {
			let insertIndex = newLines.length;
			for (let i = 0; i < newLines.length; i++) {
				if (newLines[i].includes("# Webhook")) {
					// 找到 Webhook 配置區段，找到該區段的最後一個配置項位置
					insertIndex = i + 1;
					for (let j = i + 1; j < newLines.length; j++) {
						const nextLine = newLines[j].trim();
						if (nextLine && !nextLine.startsWith("#") && nextLine.includes("=")) {
							insertIndex = j + 1;
						} else if (nextLine.startsWith("#") && nextLine !== "# Webhook") {
							break;
						}
					}
					break;
				}
			}
			newLines.splice(insertIndex, 0, `EVENT_TOKEN=${newToken}`);
		}
		
		// 寫入檔案
		try {
			fs.writeFileSync(envPath, newLines.join("\n"), "utf-8");
			if (!app.isPackaged || process.env.DEBUG) {
				console.log("✅ 已自動生成 EVENT_TOKEN");
			}
		} catch (error) {
			console.error("更新 EVENT_TOKEN 失敗:", error);
		}
	}
}

// 生成 .env 模板內容（共用函數）
function getEnvTemplate() {
	return `# YSCP API 配置
YSCP_HOST=
YSCP_AK=
YSCP_SK=

# Line Bot 配置
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=

# 伺服器配置
PORT=6000

# Ngrok 配置（必填，用於本地開發時提供公開 URL）
# 前往 https://dashboard.ngrok.com/get-started/your-authtoken 註冊並取得 authtoken
NGROK_AUTHTOKEN=

# 系統自動生成的配置（無需手動填寫，測試啟動後會自動生成）
# Webhook 配置
WEBHOOK_URL=
# 事件驗證 Token
EVENT_TOKEN=
# 公開 URL 配置（用於圖片顯示）
NGROK_URL=
`;
}

// 建立 .env 檔案（如果不存在）
function ensureEnvFileExists() {
	if (!fs.existsSync(envPath)) {
		try {
			fs.writeFileSync(envPath, getEnvTemplate());
			// 開始監聽新建立的檔案
			watchEnvFile();
			if (!app.isPackaged || process.env.DEBUG) {
				console.log("✅ 已自動建立 .env 檔案");
			}
		} catch (error) {
			console.error("建立 .env 檔案失敗:", error);
			return false;
		}
	}
	
	// 確保 EVENT_TOKEN 存在（自動生成）
	ensureEventToken();
	
	// 確保 WEBHOOK_URL 存在（基於 NGROK_URL 自動生成）
	ensureWebhookUrl();
	
	return true;
}

// 確保 WEBHOOK_URL 存在（基於 NGROK_URL 自動生成）
function ensureWebhookUrl() {
	const values = readEnvFile();
	const ngrokUrl = values.NGROK_URL || "";
	
	// 如果 NGROK_URL 存在，自動生成 WEBHOOK_URL
	if (ngrokUrl && ngrokUrl.trim() !== "") {
		const webhookUrl = `${ngrokUrl.trim().replace(/\/$/, "")}/api/linebot/yscp-event-receiver`;
		
		// 檢查是否需要更新 WEBHOOK_URL
		if (!values.WEBHOOK_URL || values.WEBHOOK_URL.trim() === "" || values.WEBHOOK_URL !== webhookUrl) {
			// 讀取現有的 .env 檔案內容
			let content = "";
			if (fs.existsSync(envPath)) {
				content = fs.readFileSync(envPath, "utf-8");
			}
			
			// 更新或添加 WEBHOOK_URL
			const lines = content.split("\n");
			const newLines = [];
			let urlUpdated = false;
			
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				const trimmed = line.trim();
				
				// 檢查是否為 WEBHOOK_URL 配置項
				if (trimmed.match(/^WEBHOOK_URL\s*=/)) {
					newLines.push(`WEBHOOK_URL=${webhookUrl}`);
					urlUpdated = true;
				} else {
					newLines.push(line);
				}
			}
			
			// 如果沒有找到 WEBHOOK_URL，在 Webhook 配置區段後添加
			if (!urlUpdated) {
				let insertIndex = newLines.length;
				for (let i = 0; i < newLines.length; i++) {
					if (newLines[i].includes("# Webhook")) {
						// 找到 Webhook 配置區段，找到該區段的第一個配置項位置
						insertIndex = i + 1;
						break;
					}
				}
				newLines.splice(insertIndex, 0, `WEBHOOK_URL=${webhookUrl}`);
			}
			
			// 寫入檔案
			try {
				fs.writeFileSync(envPath, newLines.join("\n"), "utf-8");
				if (!app.isPackaged || process.env.DEBUG) {
					console.log("✅ 已自動生成 WEBHOOK_URL:", webhookUrl);
				}
			} catch (error) {
				console.error("更新 WEBHOOK_URL 失敗:", error);
			}
		}
	}
}

// 儲存配置到 .env 檔案
ipcMain.on("save-config", (event, configValues) => {
	try {
		// 確保 .env 檔案存在
		if (!ensureEnvFileExists()) {
			sendToWindow("config-saved", {
				success: false,
				error: "無法建立 .env 檔案"
			});
			return;
		}
		
		// 移除 EVENT_TOKEN、WEBHOOK_URL 和 NGROK_URL（如果存在），因為它們由系統自動生成，不應該被用戶修改
		delete configValues.EVENT_TOKEN;
		delete configValues.WEBHOOK_URL;
		delete configValues.NGROK_URL;

		// 讀取現有的 .env 檔案內容
		let content = "";
		if (fs.existsSync(envPath)) {
			content = fs.readFileSync(envPath, "utf-8");
		}

		// 解析現有內容，更新配置值，保留註解和格式
		const lines = content.split("\n");
		const newLines = [];
		const processedKeys = new Set();

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const trimmed = line.trim();

			// 檢查是否為配置項
			const match = trimmed.match(/^([^=#\s]+)=(.*)$/);
			if (match) {
				const key = match[1].trim();
				if (configValues.hasOwnProperty(key)) {
					// 更新現有配置項的值
					const newValue = configValues[key] || "";
					newLines.push(`${key}=${newValue}`);
					processedKeys.add(key);
				} else {
					// 保留未更新的配置項（使用原始行，保留註解等）
					newLines.push(line);
					processedKeys.add(key);
				}
			} else {
				// 保留註解、空行和其他內容
				newLines.push(line);
			}
		}

		// 添加未在檔案中的新配置項（按照模板順序插入到對應區段）
		const configOrder = [
			{ key: "YSCP_HOST", section: "# YSCP API" },
			{ key: "YSCP_AK", section: "# YSCP API" },
			{ key: "YSCP_SK", section: "# YSCP API" },
			{ key: "LINE_CHANNEL_ACCESS_TOKEN", section: "# Line Bot" },
			{ key: "LINE_CHANNEL_SECRET", section: "# Line Bot" },
			{ key: "PORT", section: "# 伺服器配置" },
			{ key: "WEBHOOK_URL", section: "# Webhook" },
			{ key: "EVENT_TOKEN", section: "# Webhook" },
			{ key: "NGROK_AUTHTOKEN", section: "# Ngrok" },
			{ key: "NGROK_URL", section: "# 公開 URL" }
		];

		for (const item of configOrder) {
			if (configValues.hasOwnProperty(item.key) && !processedKeys.has(item.key)) {
				// 找到對應區段的位置
				let insertIndex = -1;
				for (let i = 0; i < newLines.length; i++) {
					if (newLines[i].includes(item.section)) {
						// 找到區段標題後，找到該區段的最後一個配置項位置
						insertIndex = i + 1;
						// 繼續往下找，直到找到下一個區段或檔案結尾
						for (let j = i + 1; j < newLines.length; j++) {
							const nextLine = newLines[j].trim();
							if (nextLine && !nextLine.startsWith("#") && nextLine.includes("=")) {
								insertIndex = j + 1;
							} else if (nextLine.startsWith("#") && nextLine !== item.section) {
								break;
							}
						}
						break;
					}
				}
				if (insertIndex >= 0) {
					newLines.splice(insertIndex, 0, `${item.key}=${configValues[item.key] || ""}`);
				} else {
					// 如果找不到對應區段，添加到檔案末尾
					newLines.push(`${item.key}=${configValues[item.key] || ""}`);
				}
				processedKeys.add(item.key);
			}
		}

		// 寫入檔案
		const newContent = newLines.join("\n");
		fs.writeFileSync(envPath, newContent, "utf-8");
		
		// 如果 NGROK_URL 有更新，確保 WEBHOOK_URL 也更新
		if (configValues.NGROK_URL) {
			ensureWebhookUrl();
		}

		// 通知前端儲存成功
		sendToWindow("config-saved", {
			success: true
		});

		if (!app.isPackaged || process.env.DEBUG) {
			console.log("✅ 配置已儲存到 .env 檔案");
		}
	} catch (error) {
		console.error("儲存配置失敗:", error);
		sendToWindow("config-saved", {
			success: false,
			error: error.message || "儲存失敗"
		});
	}
});

// 監聽 .env 檔案變化並自動更新前端
function watchEnvFile() {
	// 如果已有監聽器，先關閉
	if (envFileWatcher) {
		envFileWatcher.close();
		envFileWatcher = null;
	}

	// 如果檔案不存在，不監聽
	if (!fs.existsSync(envPath)) {
		return;
	}

	// 使用防抖來避免過於頻繁的更新
	let debounceTimer = null;
	const debounceDelay = 500; // 500ms 防抖延遲

	envFileWatcher = fs.watch(envPath, { persistent: false }, (eventType) => {
		// 只處理檔案變更事件
		if (eventType === "change") {
			// 清除之前的計時器
			if (debounceTimer) {
				clearTimeout(debounceTimer);
			}

			// 設置新的計時器
			debounceTimer = setTimeout(() => {
				try {
					// 如果 NGROK_URL 有更新，確保 WEBHOOK_URL 也更新
					ensureWebhookUrl();
					// 重新讀取配置並發送給前端
					const values = readEnvFile();
					sendToWindow("config-values", values);
					if (!app.isPackaged || process.env.DEBUG) {
						console.log("📝 .env 檔案已更新，自動同步到 UI");
					}
				} catch (error) {
					console.error("讀取 .env 檔案失敗:", error);
				}
			}, debounceDelay);
		}
	});

	if (!app.isPackaged || process.env.DEBUG) {
		console.log("👀 開始監聽 .env 檔案變化");
	}
}

ipcMain.on("validate-config", () => {
	if (!fs.existsSync(envPath)) {
		sendToWindow("config-validated", {
			valid: false,
			message: "配置檔案不存在"
		});
		return;
	}

	try {
		// 確保 EVENT_TOKEN 存在（自動生成）
		ensureEventToken();
		
		// 確保 WEBHOOK_URL 存在（基於 NGROK_URL 自動生成）
		ensureWebhookUrl();
		
		const values = readEnvFile();
		// 必填項目（選填項目：EVENT_TOKEN 和 WEBHOOK_URL 系統自動生成, NGROK_URL）
		const required = [
			"YSCP_HOST",
			"YSCP_AK",
			"YSCP_SK",
			"LINE_CHANNEL_ACCESS_TOKEN",
			"LINE_CHANNEL_SECRET",
			"PORT",
			"NGROK_AUTHTOKEN"
		];
		// 注意：EVENT_TOKEN 和 WEBHOOK_URL 由系統自動生成，NGROK_URL 為選填（可使用固定域名）
		const missing = required.filter((key) => !values[key] || values[key].trim() === "");

		sendToWindow("config-validated", {
			valid: missing.length === 0,
			message: missing.length > 0 ? `缺少必填項目: ${missing.join(", ")}` : "所有必填項目已正確設定"
		});
	} catch (error) {
		sendToWindow("config-validated", {
			valid: false,
			message: `讀取配置檔案失敗: ${error.message}`
		});
	}
});

ipcMain.on("test-service", async () => {
	const licenseStatus = checkLicenseStatus();
	if (!licenseStatus.hasLicense) {
		sendToWindow("test-error", "授權未啟用，請先完成步驟 1");
		return;
	}

	if (!fs.existsSync(envPath)) {
		sendToWindow("test-error", "配置檔案不存在，請先完成步驟 2");
		return;
	}

	// 如果已有服務在運行，先停止
	if (nodeProcess && !nodeProcess.killed) {
		stopNodeApp();
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}

	if (startNodeApp()) {
		setTimeout(() => {
			if (nodeProcess && !nodeProcess.killed) {
				sendToWindow("test-success");
			} else {
				sendToWindow("test-error", "服務啟動失敗，請檢查日誌");
			}
		}, 5000);
	} else {
		sendToWindow("test-error", "無法啟動服務");
	}
});

ipcMain.on("check-service-status", () => {
	const running = nodeProcess && !nodeProcess.killed;
	sendToWindow("service-status", { running });
});

// 檢查並執行安裝後配置腳本
function runPostInstallIfNeeded() {
	const postInstallPath = path.join(appResourcePath, "installer", "post-install.js");
	const postInstallFlag = path.join(appDataPath, "data", ".post-install-completed");

	// 檢查是否需要執行 post-install.js
	if (fs.existsSync(postInstallPath) && !fs.existsSync(postInstallFlag)) {
		console.log("🔧 首次啟動，執行安裝後配置...");

		// 確保 data 目錄存在
		const dataDir = path.join(appDataPath, "data");
		if (!fs.existsSync(dataDir)) {
			fs.mkdirSync(dataDir, { recursive: true });
		}

		// 執行 post-install.js
		const nodeProcess = spawn(process.execPath, [postInstallPath], {
			cwd: appDataPath,
			env: { ...process.env, INSTALL_DIR: appDataPath }
		});

		nodeProcess.stdout?.on("data", (data) => {
			console.log(`[Post-Install] ${data.toString()}`);
		});

		nodeProcess.stderr?.on("data", (data) => {
			console.error(`[Post-Install Error] ${data.toString()}`);
		});

		nodeProcess.on("exit", (code) => {
			if (code === 0) {
				console.log("✅ 安裝後配置完成");
				// 標記已完成
				try {
					fs.writeFileSync(postInstallFlag, new Date().toISOString());
				} catch (error) {
					console.error("無法寫入標記檔案:", error);
				}
			} else {
				console.error(`❌ 安裝後配置失敗，退出代碼: ${code}`);
			}
		});
	}
}

// 單例鎖定：確保應用程式只能開啟一個實例
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
	// 如果已經有實例在運行，退出當前實例
	console.log("⚠️  應用程式已在運行中，退出重複實例");
	app.quit();
} else {
	// 處理後續實例啟動請求（當用戶再次點擊應用程式時）
	app.on("second-instance", () => {
		if (!app.isPackaged || process.env.DEBUG) {
			console.log("📱 檢測到新的啟動請求，聚焦到現有視窗");
		}
		if (!showAndFocusWindow()) {
			// 如果視窗不存在（可能被關閉了），重新建立
			createWindow();
		}
	});

// 應用程式準備就緒
app.whenReady().then(() => {
	// 執行安裝後配置（如果需要）
	runPostInstallIfNeeded();

	createTray();
	createWindow();

	// 自動啟動服務（可選）
	// startNodeApp();
});
}

// 所有視窗關閉時
app.on("window-all-closed", () => {
	// macOS 上通常應用程式會繼續運行
	if (process.platform !== "darwin") {
		app.quit();
	}
});

app.on("activate", () => {
	// macOS: 當用戶點擊 Dock 圖示時
	if (!showAndFocusWindow()) {
		createWindow();
	}
});

// 應用程式退出前
app.on("before-quit", () => {
	app.isQuiting = true;
	stopNodeApp();
});

// 處理未捕獲的異常和拒絕
process.on("uncaughtException", (error) => {
	console.error("❌ 未捕獲的異常:", error);
	// 在生產環境中，可以選擇是否要退出應用程式
	if (!app.isPackaged) {
		// 開發環境：只記錄錯誤
		return;
	}
	// 生產環境：記錄錯誤但不退出（避免影響用戶使用）
});

process.on("unhandledRejection", (reason, promise) => {
	console.error("❌ 未處理的 Promise 拒絕:", reason);
});
