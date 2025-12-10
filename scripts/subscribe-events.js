#!/usr/bin/env node

/**
 * HCP 事件訂閱腳本
 * 用於新裝置初始化時執行一次事件訂閱
 */

require("dotenv").config();
const HCPClient = require("../services/hcpClient");
const configService = require("../services/configService");
const LoggerService = require("../services/loggerService");

async function subscribeEvents() {
	console.log("📨 開始訂閱 HCP 事件...");
	console.log("==============================\n");

	// 檢查配置
	if (!process.env.YSCP_AK || !process.env.YSCP_SK) {
		console.error("❌ YSCP API 配置不完整");
		console.error("   請確認 .env 檔案中已設定 YSCP_AK 和 YSCP_SK");
		process.exit(1);
	}

	if (!process.env.WEBHOOK_URL) {
		console.error("❌ Webhook URL 未設定");
		console.error("   請確認 .env 檔案中已設定 WEBHOOK_URL");
		process.exit(1);
	}

	// EVENT_TOKEN 現在由系統自動生成，如果不存在則生成一個
	if (!process.env.EVENT_TOKEN || process.env.EVENT_TOKEN.trim() === "") {
		const crypto = require("crypto");
		const fs = require("fs");
		const path = require("path");
		const envPath = path.join(process.cwd(), ".env");
		
		// 生成新的 EVENT_TOKEN
		const newToken = crypto.randomBytes(32).toString("base64");
		
		// 讀取並更新 .env 檔案
		let content = "";
		if (fs.existsSync(envPath)) {
			content = fs.readFileSync(envPath, "utf-8");
		}
		
		const lines = content.split("\n");
		const newLines = [];
		let tokenUpdated = false;
		
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (line.trim().match(/^EVENT_TOKEN\s*=/)) {
				newLines.push(`EVENT_TOKEN=${newToken}`);
				tokenUpdated = true;
			} else {
				newLines.push(line);
			}
		}
		
		if (!tokenUpdated) {
			// 如果沒有找到，在 Webhook 配置區段後添加
			let insertIndex = newLines.length;
			for (let i = 0; i < newLines.length; i++) {
				if (newLines[i].includes("# Webhook")) {
					insertIndex = i + 1;
					for (let j = i + 1; j < newLines.length; j++) {
						const nextLine = newLines[j].trim();
						if (nextLine && !nextLine.startsWith("#") && nextLine.includes("=")) {
							insertIndex = j + 1;
						} else if (nextLine.startsWith("#")) {
							break;
						}
					}
					break;
				}
			}
			newLines.splice(insertIndex, 0, `EVENT_TOKEN=${newToken}`);
		}
		
		fs.writeFileSync(envPath, newLines.join("\n"), "utf-8");
		process.env.EVENT_TOKEN = newToken;
		console.log("✅ 已自動生成 EVENT_TOKEN");
	}

	// 載入事件類型配置
	const configData = configService.loadConfig("event-types.json", {
		eventTypes: {},
		settings: {}
	});

	const eventTypes = configData.eventTypes || {};
	const enabledEventTypes = [];

	// 收集啟用的事件類型
	Object.entries(eventTypes).forEach(([code, config]) => {
		if (config.enabled) {
			enabledEventTypes.push(parseInt(code));
		}
	});

	if (enabledEventTypes.length === 0) {
		console.warn("⚠️  沒有啟用的事件類型需要訂閱");
		console.warn("   請檢查 data/event-types.json 中的配置");
		process.exit(0);
	}

	console.log(`📋 找到 ${enabledEventTypes.length} 個啟用的事件類型：`);
	enabledEventTypes.forEach((code) => {
		const config = eventTypes[String(code)];
		console.log(`   - ${code}: ${config.name || `事件類型 ${code}`}`);
	});
	console.log("");

	// 初始化 HCP Client
	const hcpClient = HCPClient.getInstance();

	// 準備訂閱參數
	const params = {
		eventTypes: enabledEventTypes,
		eventDest: process.env.WEBHOOK_URL,
		token: process.env.EVENT_TOKEN,
		passBack: 1
	};

	console.log("🔗 Webhook URL:", process.env.WEBHOOK_URL);
	console.log("🔑 Event Token:", process.env.EVENT_TOKEN.substring(0, 10) + "...");
	console.log("");

	// 執行訂閱
	try {
		console.log("⏳ 正在訂閱事件...");
		const result = await hcpClient.subscribeEventsByTypes(params);

		if (result.code === "0") {
			console.log("✅ 事件訂閱成功！");
			console.log("");
			console.log("📝 訂閱詳情：");
			console.log(`   - 已訂閱 ${enabledEventTypes.length} 個事件類型`);
			console.log(`   - Webhook URL: ${process.env.WEBHOOK_URL}`);
			console.log("");
			console.log("💡 提示：");
			console.log("   - 事件將自動推送到上述 Webhook URL");
			console.log("   - 可以在 HCP 管理介面查看訂閱狀態");
		} else {
			console.error("❌ 事件訂閱失敗");
			console.error(`   錯誤訊息: ${result.msg || result.message || "未知錯誤"}`);
			console.error(`   錯誤代碼: ${result.code}`);
			process.exit(1);
		}
	} catch (error) {
		console.error("❌ 訂閱事件時發生錯誤");
		console.error(`   錯誤: ${error.message}`);
		if (error.response) {
			console.error(`   HTTP 狀態碼: ${error.response.status}`);
			console.error(`   回應內容: ${JSON.stringify(error.response.data)}`);
		}
		process.exit(1);
	}
}

// 執行訂閱
subscribeEvents().catch((error) => {
	console.error("❌ 執行訂閱腳本時發生錯誤:", error);
	process.exit(1);
});
