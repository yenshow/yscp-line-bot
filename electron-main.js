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

// 應用程式路徑
const appPath = app.isPackaged ? path.dirname(process.execPath) : __dirname;

// 公用：取得圖示路徑 (若不存在則回傳 null)
function resolveIcon() {
	const candidate = path.join(appPath, "build", "icon.png");
	return fs.existsSync(candidate) ? candidate : null;
}
const nodeAppPath = path.join(appPath, "app.js");
const ecosystemConfigPath = path.join(appPath, "ecosystem.config.js");
const envPath = path.join(appPath, ".env");

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
	const pm2Path = path.join(appPath, "node_modules", ".bin", "pm2");
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
			cwd: appPath,
			shell: true,
			env
		});
	} else {
		// 直接啟動 Node.js
		const nodeCmd = process.platform === "win32" ? "node.exe" : "node";
		nodeProcess = spawn(nodeCmd, [nodeAppPath], {
			cwd: appPath,
			shell: true,
			env: { ...env, PATH: process.env.PATH }
		});
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
			execSync(`${pm2.cmd} stop all`, { stdio: "ignore", cwd: appPath });
		} catch (e) {
			// PM2 不可用，忽略
		}
	}

	// 終止進程
	if (!nodeProcess.killed) {
		nodeProcess.kill("SIGTERM");
		setTimeout(() => {
			if (nodeProcess && !nodeProcess.killed) {
				nodeProcess.kill("SIGKILL");
			}
		}, 5000);
	}
	nodeProcess = null;
}

// 建立主視窗
function createWindow() {
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

	// 載入 HTML 頁面（使用外部文件）
	const htmlPath = path.join(appPath, "renderer", "index.html");
	mainWindow.loadFile(htmlPath);

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

	// 視窗關閉時隱藏到系統托盤
	mainWindow.on("close", (event) => {
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
				if (mainWindow) {
					mainWindow.show();
				}
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
		if (mainWindow) {
			mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
		}
	});
}

// 輔助函數：安全發送訊息到主視窗
function sendToWindow(channel, data) {
	if (mainWindow && !mainWindow.isDestroyed()) {
		mainWindow.webContents.send(channel, data);
	}
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
	const logsPath = path.join(appPath, "logs");

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
					const envTemplate = `# YSCP API 配置
YSCP_HOST=
YSCP_AK=
YSCP_SK=

# Line Bot 配置
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=

# 伺服器配置
PORT=6000

# Webhook 配置
WEBHOOK_URL=
EVENT_TOKEN=

# Ngrok 配置（可選，用於本地開發時提供公開 URL）
# 1. 前往 https://dashboard.ngrok.com/get-started/your-authtoken 註冊並取得 authtoken
# 2. 將 authtoken 填入下方，應用程式啟動時會自動配置
NGROK_AUTHTOKEN=

# 公開 URL 配置（用於圖片顯示）
# 如果使用 ngrok，此值會在 ngrok 啟動後自動更新
NGROK_URL=
`;
					fs.writeFileSync(envPath, envTemplate);
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
					shell.showItemInFolder(appPath);
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

ipcMain.on("activate-license", async (event, serialNumber) => {
	try {
		const LicenseService = require("./services/licenseService");
		const success = await LicenseService.saveLicense(serialNumber);

		sendToWindow("license-activated", {
			success: success,
			serialNumber: success ? serialNumber : null,
			error: success ? null : "無法從伺服器獲取 License Key 或儲存失敗"
		});
	} catch (error) {
		// 提供更詳細的錯誤訊息
		let errorMessage = error.message || "無法從伺服器獲取 License Key 或儲存失敗";

		// 根據錯誤類型提供更友好的訊息
		if (error.message.includes("找不到對應的 SerialNumber") || error.message.includes("授權不存在")) {
			errorMessage = `SerialNumber "${serialNumber}" 不存在，請確認是否已在後台建立授權`;
		} else if (error.message.includes("授權未啟用")) {
			errorMessage = `SerialNumber "${serialNumber}" 的授權尚未啟用，請在後台啟用授權`;
		} else if (error.message.includes("請求超時")) {
			errorMessage = "連線超時，請檢查網路連線或後端服務狀態";
		} else if (error.message.includes("ECONNREFUSED") || error.message.includes("ENOTFOUND")) {
			errorMessage = "無法連接到授權伺服器，請檢查 LICENSE_SERVER_URL 配置";
		}

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
	sendToWindow("config-status", {
		exists: fs.existsSync(envPath),
		path: envPath
	});
	// 重新啟動監聽（如果檔案狀態改變）
	watchEnvFile();
});

ipcMain.on("load-config-values", () => {
	sendToWindow("config-values", readEnvFile());
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
					// 重新讀取配置並發送給前端
					const values = readEnvFile();
					sendToWindow("config-values", values);
					console.log("📝 .env 檔案已更新，自動同步到 UI");
				} catch (error) {
					console.error("讀取 .env 檔案失敗:", error);
				}
			}, debounceDelay);
		}
	});

	console.log("👀 開始監聽 .env 檔案變化");
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
		const values = readEnvFile();
		const required = [
			"YSCP_HOST",
			"YSCP_AK",
			"YSCP_SK",
			"LINE_CHANNEL_ACCESS_TOKEN",
			"LINE_CHANNEL_SECRET",
			"PORT",
			"WEBHOOK_URL",
			"EVENT_TOKEN",
			"NGROK_AUTHTOKEN",
			"NGROK_URL"
		];
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
	const postInstallPath = path.join(appPath, "installer", "post-install.js");
	const postInstallFlag = path.join(appPath, "data", ".post-install-completed");

	// 檢查是否需要執行 post-install.js
	if (fs.existsSync(postInstallPath) && !fs.existsSync(postInstallFlag)) {
		console.log("🔧 首次啟動，執行安裝後配置...");

		// 確保 data 目錄存在
		const dataDir = path.join(appPath, "data");
		if (!fs.existsSync(dataDir)) {
			fs.mkdirSync(dataDir, { recursive: true });
		}

		// 執行 post-install.js
		const nodeProcess = spawn(process.execPath, [postInstallPath], {
			cwd: appPath,
			env: { ...process.env, INSTALL_DIR: appPath }
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

// 應用程式準備就緒
app.whenReady().then(() => {
	// 執行安裝後配置（如果需要）
	runPostInstallIfNeeded();

	createTray();
	createWindow();

	// 自動啟動服務（可選）
	// startNodeApp();
});

// 所有視窗關閉時
app.on("window-all-closed", () => {
	// macOS 上通常應用程式會繼續運行
	if (process.platform !== "darwin") {
		app.quit();
	}
});

app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) {
		createWindow();
	}
});

// 應用程式退出前
app.on("before-quit", () => {
	app.isQuiting = true;
	stopNodeApp();
});

// 處理未捕獲的異常
process.on("uncaughtException", (error) => {
	console.error("未捕獲的異常:", error);
});
