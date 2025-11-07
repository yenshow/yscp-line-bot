/**
 * Line Bot 控制器
 * 專注於 HTTP 請求處理，不包含業務邏輯
 */

const LineBotManager = require("../services/lineBotService");
const HCPClient = require("../services/hcpClient");
const EventQueueService = require("../services/eventQueueService");
const LoggerService = require("../services/loggerService");

class LineBotController {
	constructor() {
		this.lineBotService = LineBotManager.getService();
		this.isConfigured = LineBotManager.isServiceConfigured();
		this.hcpClient = HCPClient.getInstance();
		this.eventQueueService = new EventQueueService();

		// 初始化事件隊列服務
		this.initializeEventQueueService();
	}

	/**
	 * 初始化事件隊列服務
	 */
	initializeEventQueueService() {
		// 延遲初始化，避免循環依賴
		setTimeout(() => {
			try {
				if (!this.lineBotService) {
					LoggerService.warn("LineBotService 未配置，事件隊列服務初始化延遲");
					return;
				}

				if (this.lineBotService.client) {
					this.eventQueueService.initialize(this.lineBotService.client, null);
				} else {
					LoggerService.warn("LineBotService 客戶端未配置");
				}
			} catch (error) {
				LoggerService.error("LineBotController 事件隊列服務初始化失敗", error);
			}
		}, 500);
	}

	/**
	 * 獲取 Line Bot 狀態
	 */
	async getStatus(req, res) {
		res.status(200).json({
			message: this.isConfigured ? "Line Bot Webhook 端點正常" : "Line Bot Webhook 端點正常（未配置）",
			configured: !!this.isConfigured,
			timestamp: new Date().toISOString()
		});
	}

	/**
	 * 處理 Line Bot Webhook 事件
	 */
	async handleWebhook(req, res) {
		try {
			if (!this.isConfigured) {
				return res.status(200).json({
					message: "Line Bot Webhook 端點正常（未配置）",
					configured: false,
					timestamp: new Date().toISOString()
				});
			}

			const events = req.body.events;

			if (!events || !Array.isArray(events)) {
				return res.status(400).json({
					success: false,
					error: "Invalid events format"
				});
			}

			// 處理所有事件
			const promises = events.map((event) => {
				return this.lineBotService.handleEvent(event);
			});
			await Promise.all(promises);

			res.status(200).json({
				success: true,
				processedEvents: events.length
			});
		} catch (error) {
			console.error("Line Bot Webhook 錯誤:", error);
			res.status(500).json({
				success: false,
				error: "Internal Server Error",
				message: error.message
			});
		}
	}

	/**
	 * 測試 Line Bot 服務
	 */
	async test(req, res) {
		res.json({
			message: this.isConfigured ? "Line Bot 服務正常運行" : "Line Bot 服務未配置",
			configured: !!this.isConfigured,
			timestamp: new Date().toISOString()
		});
	}

	// 用戶管理改由 Line 訊息互動處理，不再提供 HTTP API

	// 事件隊列管理功能已移除 - 由系統自動管理

	/**
	 * 處理 HCP 事件接收（Webhook）- 用於 Line Bot 通知
	 */
	async handleEventReceiver(req, res) {
		const startTime = Date.now();

		try {
			// 檢查 req.body 是否存在
			if (!req.body || typeof req.body !== "object") {
				LoggerService.warn(`[EVENT_RECEIVER] 無效的請求體: ${typeof req.body}`);
				LoggerService.httpStatus(`HCP 事件推送回應: 無效的請求體`, 400, req.method, req.originalUrl);
				return res.status(400).json({
					success: false,
					error: "Invalid request body",
					message: "請求體為空或格式錯誤"
				});
			}

			const eventData = req.body;
			LoggerService.debug(`[EVENT_RECEIVER] 收到的事件數據: ${JSON.stringify(eventData)}`);

			const receivedToken =
				req.headers["x-ca-token"] || req.headers["token"] || req.headers["authorization"] || req.headers["x-auth-token"] || req.headers["x-event-token"];
			const config = require("../config");

			if (config.server.eventToken && config.server.eventToken !== "your_unique_verification_token" && receivedToken !== config.server.eventToken) {
				LoggerService.warn("事件 Token 驗證失敗");
				LoggerService.httpStatus(`HCP 事件推送回應: Token 驗證失敗`, 401, req.method, req.originalUrl);
				return res.status(401).json({
					success: false,
					error: "Unauthorized",
					message: "Token 驗證失敗"
				});
			}

			// 驗證訊息格式
			if (!eventData.method || eventData.method !== "OnEventNotify") {
				LoggerService.warn(`[EVENT_RECEIVER] 未知的事件方法: ${eventData.method}`);
				LoggerService.httpStatus(`HCP 事件推送回應: 未知的事件方法`, 400, req.method, req.originalUrl);
				return res.status(400).json({
					success: false,
					error: "Invalid event format",
					message: "未知的事件方法"
				});
			}

			// 提取事件參數
			const params = eventData.params || {};
			const ability = params.ability;
			const events = params.events || [];

			// 立即回應成功
			res.status(200).json({
				success: true,
				message: "事件已接收"
			});

			// 記錄成功回應
			LoggerService.httpStatus(`HCP 事件推送回應: 事件已接收`, 200, req.method, req.originalUrl);

			// 非同步處理事件（用於 Line Bot 通知）
			if (events.length > 0) {
				LoggerService.hcp(`[EVENT_RECEIVER] 接收到 ${events.length} 個 ${ability} 事件，開始處理`);

				// 只記錄一次完整的原始事件資料
				LoggerService.hcp(`[原始資料] 完整事件資料: ${JSON.stringify(eventData, null, 2)}`);

				events.forEach((event) => {
					this.eventQueueService.enqueueHCPEvent({
						ability,
						eventType: event.eventType,
						happenTime: event.happenTime,
						srcName: event.srcName,
						srcType: event.srcType,
						srcIndex: event.srcIndex,
						eventId: event.eventId,
						data: event.data // 傳遞完整的原始 data 內容
					});
				});
			} else {
				LoggerService.hcp("[EVENT_RECEIVER] 沒有事件需要處理");
			}
		} catch (error) {
			const processingTime = Date.now() - startTime;
			LoggerService.error(`處理 HCP 事件錯誤: ${error.message} - 處理時間: ${processingTime}ms`, error);
			LoggerService.httpStatus(`HCP 事件推送回應: 處理事件時發生錯誤`, 500, req.method, req.originalUrl);
			res.status(500).json({
				success: false,
				error: "Internal Server Error",
				message: "處理事件時發生錯誤"
			});
		}
	}

	/**
	 * 統一的錯誤處理方法
	 */
	handleError(res, error, operation) {
		const errorMessage = `${operation}失敗`;
		console.error(`❌ ${errorMessage}:`, error);
		this.sendResponse(res, false, errorMessage, { error: error.message }, 500);
	}

	/**
	 * 統一的 API 回應方法
	 */
	sendResponse(res, success, message, data = null, statusCode = 200) {
		const response = {
			success,
			message
		};
		if (data) {
			response.data = data;
		}
		res.status(statusCode).json(response);
	}

	/**
	 * 統一的成功回應方法（向後兼容）
	 */
	sendSuccess(res, message, data = null) {
		this.sendResponse(res, true, message, data);
	}
}

module.exports = LineBotController;
