/**
 * Line Bot 控制器
 * 專注於 HTTP 請求處理，不包含業務邏輯
 */

const LineBotManager = require("../services/lineBotService");
const LoggerService = require("../services/loggerService");
const FlexMessageService = require("../services/flexMessageService");
const EventStorageService = require("../services/eventStorageService");
const configService = require("../services/configService");
const config = require("../config");

class LineBotController {
	constructor() {
		this.lineBotService = LineBotManager.getService();
		this.isConfigured = LineBotManager.isServiceConfigured();

		// 去重機制：記錄已處理的事件 ID（60 秒內不重複處理）
		this.processedEvents = new Map();
		this.dedupeTTL = 60000; // 60 秒

		// 頻率控制：記錄最後推送時間，限制推送間隔
		this.lastPushTime = 0;
		this.minPushInterval = 2000; // 2 秒最小間隔

		// 定期清理過期的去重記錄（每 5 分鐘）
		setInterval(() => this.cleanupProcessedEvents(), 5 * 60 * 1000);
	}

	/**
	 * 檢查事件是否為重複（去重）
	 * @param {string} eventId - 事件 ID
	 * @returns {boolean} 是否為重複事件
	 */
	isDuplicateEvent(eventId) {
		if (!eventId) return false;
		const now = Date.now();
		const processedTime = this.processedEvents.get(eventId);
		if (processedTime && now - processedTime < this.dedupeTTL) {
			return true;
		}
		this.processedEvents.set(eventId, now);
		return false;
	}

	/**
	 * 清理過期的去重記錄
	 */
	cleanupProcessedEvents() {
		const now = Date.now();
		for (const [eventId, processedTime] of this.processedEvents.entries()) {
			if (now - processedTime > this.dedupeTTL) {
				this.processedEvents.delete(eventId);
			}
		}
	}

	/**
	 * 執行頻率控制（確保推送間隔）
	 * @returns {Promise<void>}
	 */
	async enforceRateLimit() {
		const now = Date.now();
		const timeSinceLastPush = now - this.lastPushTime;
		if (timeSinceLastPush < this.minPushInterval) {
			const waitTime = this.minPushInterval - timeSinceLastPush;
			await new Promise((resolve) => setTimeout(resolve, waitTime));
		}
		this.lastPushTime = Date.now();
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
			await Promise.all(events.map((event) => this.lineBotService.handleEvent(event)));

			res.status(200).json({
				success: true,
				processedEvents: events.length
			});
		} catch (error) {
			LoggerService.error("Line Bot Webhook 錯誤", error);
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
			const botClient = this.lineBotService?.client;

			// 立即回應成功
			res.status(200).json({
				success: true,
				message: "事件已接收"
			});

			// 記錄成功回應
			LoggerService.httpStatus(`HCP 事件推送回應: 事件已接收`, 200, req.method, req.originalUrl);

			// 非同步直接處理並推送（含去重和頻率控制）
			if (events.length && botClient) {
				const usersCfg = configService.loadConfig("user-management.json", { users: {} });
				const targets = Object.values(usersCfg.users || {})
					.filter((u) => u && (u.role === "admin" || u.role === "target"))
					.map((u) => u.id || u.userId)
					.filter(Boolean);

				if (targets.length === 0) {
					LoggerService.warn("沒有通知目標，跳過推送");
					return;
				}

				// 過濾重複事件
				const uniqueEvents = events.filter((ev) => {
					const isDup = this.isDuplicateEvent(ev.eventId);
					if (isDup) {
						LoggerService.hcp(`[EVENT_RECEIVER] 跳過重複事件: ${ev.eventId}`);
					}
					return !isDup;
				});

				if (uniqueEvents.length === 0) {
					LoggerService.hcp(`[EVENT_RECEIVER] 所有事件都是重複的，跳過處理`);
					return;
				}

				LoggerService.hcp(`[EVENT_RECEIVER] 處理 ${uniqueEvents.length} 個事件（已過濾 ${events.length - uniqueEvents.length} 個重複事件）`);

				// 處理事件（含頻率控制和併發限制）
				const processEvent = async (ev) => {
					try {
						const flexMsg = await new FlexMessageService().createEventFlexMessage({
							ability,
							...ev
						});

						// 頻率控制：在推送前確保間隔（避免觸發 Line Bot API 速率限制）
						await this.enforceRateLimit();

						await Promise.all(targets.map((id) => botClient.pushMessage(id, [flexMsg])));
						EventStorageService.appendEventToHistory({ ...ev, ability });
					} catch (err) {
						LoggerService.error("即時處理並推送事件失敗", err);
					}
				};

				// 限制併發數量為 3，避免同時發起過多 API 請求
				const maxConcurrent = 3;
				const processWithConcurrency = async () => {
					for (let i = 0; i < uniqueEvents.length; i += maxConcurrent) {
						const batch = uniqueEvents.slice(i, i + maxConcurrent);
						await Promise.all(batch.map(processEvent));
					}
				};

				// 非同步執行，不阻塞 HTTP 回應
				void processWithConcurrency();
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
}

module.exports = LineBotController;
