const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const http = require("http");
const path = require("path");
const config = require("./config");

// 路由
const lineBotRoutes = require("./routes/lineBot");

const app = express();

// 中間件
app.use(helmet()); // 安全標頭
app.use(cors()); // 跨域請求

// 自定義 morgan 日誌 - 過濾掉 /temp 目錄的 404 錯誤
app.use(
	morgan("combined", {
		skip: function (req, res) {
			// 跳過對 /temp 目錄的 404 錯誤日誌
			return res.statusCode === 404 && req.url.startsWith("/temp");
		}
	})
);

// LINE webhook 路由需要原始 body 來驗證簽名，所以不能先解析 body
// 對於其他路由，先解析 JSON 和 URL 編碼
app.use((req, res, next) => {
	if (
		req.path === "/webhook" ||
		req.path.startsWith("/webhook/") ||
		(req.path === "/api/linebot" && req.method === "POST") ||
		(req.path.startsWith("/api/linebot/") && !req.path.includes("hcp-event-receiver"))
	) {
		return next();
	}
	// 其他路由（包括 YSCP 事件接收端點）正常解析 body
	express.json()(req, res, next);
});

app.use((req, res, next) => {
	// 排除 LINE webhook 路由
	if (
		req.path === "/webhook" ||
		req.path.startsWith("/webhook/") ||
		(req.path === "/api/linebot" && req.method === "POST") ||
		(req.path.startsWith("/api/linebot/") && !req.path.includes("hcp-event-receiver"))
	) {
		return next();
	}
	// 其他路由（包括 YSCP 事件接收端點）正常解析 URL 編碼
	express.urlencoded({ extended: true })(req, res, next);
});

// 靜態文件服務 - 提供臨時圖片
app.use("/temp", express.static(path.join(__dirname, "temp")));

// 路由
app.use("/webhook", lineBotRoutes);
app.use("/api/linebot", lineBotRoutes);
app.use("/", lineBotRoutes);

// 根路由（GET 請求）- 如果路由中沒有處理，則使用這個
app.get("/", (req, res) => {
	res.json({
		message: "YSCP Line Bot 後端服務",
		version: "1.0.0",
		endpoints: {
			lineBot: "/webhook",
			test: "/webhook/test",
			yscpEventReceiver: "/api/linebot/yscp-event-receiver"
		}
	});
});

// 健康檢查端點
app.get("/health", (req, res) => {
	res.json({
		status: "healthy",
		timestamp: new Date().toISOString(),
		uptime: process.uptime()
	});
});

// 清理服務狀態端點
app.get("/api/cleanup/status", (req, res) => {
	try {
		const cleanupStatus = FileSystemService.getCleanupStatus();
		res.json({
			success: true,
			cleanup: cleanupStatus,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		res.status(500).json({
			success: false,
			error: "獲取清理狀態失敗",
			message: error.message
		});
	}
});

// ========== 授權管理端點 ==========

/**
 * 獲取授權狀態（不包含敏感資訊）
 * GET /api/license/status
 */
app.get("/api/license/status", (req, res) => {
	try {
		const status = LicenseService.getLicenseStatus();
		res.json({
			success: true,
			hasLicense: status.hasLicense,
			serialNumber: status.licenseData ? status.licenseData.serialNumber : null,
			activatedAt: status.licenseData ? status.licenseData.activatedAt : null,
			lastOnlineValidation: status.licenseData ? status.licenseData.lastOnlineValidation : null,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		res.status(500).json({
			success: false,
			error: "獲取授權狀態失敗",
			message: error.message
		});
	}
});

/**
 * 啟用授權（從 SerialNumber 獲取 License Key 並儲存到本地）
 * POST /api/license/activate
 * Body: { serialNumber }
 */
app.post("/api/license/activate", express.json(), async (req, res) => {
	try {
		const { serialNumber } = req.body;

		if (!serialNumber) {
			return res.status(400).json({
				success: false,
				error: "缺少必要參數",
				message: "請提供 serialNumber"
			});
		}

		// 從伺服器獲取 License Key 並儲存
		const saveSuccess = await LicenseService.saveLicense(serialNumber);

		if (saveSuccess) {
			return res.json({
				success: true,
				message: "授權啟用成功",
				serialNumber: serialNumber
			});
		} else {
			return res.status(500).json({
				success: false,
				error: "啟用授權失敗",
				message: "無法從伺服器獲取 License Key 或儲存失敗"
			});
		}
	} catch (error) {
		res.status(500).json({
			success: false,
			error: "啟用授權過程發生錯誤",
			message: error.message
		});
	}
});

// 手動觸發清理端點
app.post("/api/cleanup/manual", (req, res) => {
	try {
		const result = FileSystemService.manualCleanupTempFiles(10080); // 清理7天前的檔案（10080分鐘 = 7天）
		res.json({
			success: result.success,
			message: result.success ? "手動清理已完成" : "手動清理失敗",
			result: result,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		res.status(500).json({
			success: false,
			error: "手動清理失敗",
			message: error.message
		});
	}
});

// 錯誤處理中間件
app.use((error, req, res, next) => {
	const LoggerService = require("./services/loggerService");
	const errorMessage = `伺服器錯誤: ${req.method} ${req.originalUrl} - ${error.message}`;

	// 記錄錯誤到 error.log
	LoggerService.error(errorMessage, error);

	// LINE SDK 錯誤返回適當的狀態碼
	const line = require("@line/bot-sdk");
	if (error instanceof line.SignatureValidationFailed) {
		res.status(401).json({
			error: "Signature Validation Failed",
			message: "簽名驗證失敗"
		});
	} else if (error instanceof line.JSONParseError) {
		res.status(400).json({
			error: "JSON Parse Error",
			message: "JSON 解析錯誤"
		});
	} else {
		res.status(500).json({
			error: "Internal Server Error",
			message: "伺服器內部錯誤"
		});
	}
});

// 建立 HTTP 伺服器
const server = http.createServer(app);

// 引入檔案系統服務並啟動定時清理
const FileSystemService = require("./services/fileSystemService");

// 引入授權驗證服務
const LicenseService = require("./services/licenseService");

// 啟動伺服器
const PORT = config.server.port;
const LoggerService = require("./services/loggerService");

// 授權驗證（在啟動伺服器之前）
// 使用 async/await 處理授權驗證
(async () => {
	try {
		const licenseCheck = await LicenseService.validateAndLoadLicense(true, false);
		if (!licenseCheck.valid) {
			const errorMessage = `❌ 授權驗證失敗: ${licenseCheck.reason}`;
			const helpMessage = `\n請聯繫管理員獲取有效的授權。\n請確認授權伺服器配置正確（LICENSE_SERVER_URL）\n\n錯誤代碼: ${licenseCheck.code}`;

			console.error(errorMessage);
			console.error(helpMessage);
			LoggerService.error(errorMessage + helpMessage);

			// 延遲退出，讓日誌有時間寫入
			setTimeout(() => {
				process.exit(1);
			}, 1000);
			return;
		}

		const mode = licenseCheck.online ? "線上模式" : "離線模式";
		console.log(`✅ 授權驗證通過 (${mode})`);
		LoggerService.system(`授權驗證通過 (${mode})`);
	} catch (error) {
		console.error("❌ 授權驗證過程發生錯誤:", error);
		LoggerService.error("授權驗證過程發生錯誤", error);
		setTimeout(() => {
			process.exit(1);
		}, 1000);
		return;
	}

	// 配置 Ngrok（如果已設定 authtoken）
	try {
		const ngrokService = require("./services/ngrokService");
		if (ngrokService.enabled) {
			if (!ngrokService.isConfigured()) {
				console.log("🔧 正在配置 Ngrok authtoken...");
				ngrokService.configureAuthtoken();
			} else {
				console.log("✅ Ngrok 已配置");
			}
		} else {
			console.log("ℹ️  Ngrok 未啟用（未設定 NGROK_AUTHTOKEN）");
		}
	} catch (error) {
		console.warn("⚠️  Ngrok 配置檢查失敗:", error.message);
	}

	server.listen(PORT, () => {
		const startupMessage = `🚀 伺服器運行在 http://localhost:${PORT}`;
		const webhookMessage = `📱 Line Bot Webhook: http://localhost:${PORT}/webhook`;

		// 同時輸出到 console 和日誌
		console.log(startupMessage);
		console.log(webhookMessage);
		LoggerService.system(startupMessage);
		LoggerService.system(webhookMessage);

		// 啟動定時清理服務（臨時圖片檔案）
		// 每30分鐘清理一次，保留7天內的圖片檔案（10080分鐘 = 7天）
		FileSystemService.startScheduledCleanup(30, 10080); // 每30分鐘清理一次，保留7天內的檔案

		// 啟動統一日誌維護任務（整合輪轉與清理）
		LoggerService.scheduleLogMaintenance(); // 每 24 小時執行一次：輪轉 → 清理

		// 啟動用戶同步服務（如果 Line Bot 已配置）
		const LineBotManager = require("./services/lineBotService");
		if (LineBotManager.isServiceConfigured()) {
			const lineBotService = LineBotManager.getService();
			if (lineBotService) {
				// 延遲 5 秒啟動，確保服務完全初始化
				setTimeout(() => {
					// follower 同步已移除（隱私限制）
					const syncMessage = "🔄 用戶同步服務已啟動";
					console.log(syncMessage);
					LoggerService.system(syncMessage);
				}, 5000);
			}
		}
	});
})();

// 處理端口被佔用錯誤（避免重複記錄）
let eaddrInuseLogged = false;
server.on("error", (error) => {
	if (error.code === "EADDRINUSE") {
		// 只記錄一次端口被佔用錯誤，避免日誌重複
		if (!eaddrInuseLogged) {
			const errorMessage = `端口 ${PORT} 已被佔用，請檢查是否有其他進程正在使用該端口。可以使用以下命令檢查：lsof -i :${PORT} 或 pm2 list`;
			console.error(`❌ ${errorMessage}`);
			LoggerService.error(errorMessage, error);
			eaddrInuseLogged = true;
		}
		// 不立即退出，讓 PM2 處理重啟邏輯
		// PM2 會在達到 max_restarts 後停止重啟
	} else {
		const errorMessage = `伺服器啟動失敗: ${error.message}`;
		console.error(`❌ ${errorMessage}`);
		LoggerService.error(errorMessage, error);
	}
});

module.exports = app;
