const axios = require("axios");
const crypto = require("crypto");
const https = require("https");
const config = require("../config");
const configService = require("./configService");
const LoggerService = require("./loggerService");

class HCPClient {
	static instance = null;

	constructor() {
		if (HCPClient.instance) {
			return HCPClient.instance;
		}

		this.baseURL = config.hcp.host;
		this.ak = config.hcp.ak;
		this.sk = config.hcp.sk;
		this.apiVersion = config.hcp.apiVersion;

		// 建立 HTTPS Agent 忽略自簽憑證錯誤
		this.httpsAgent = new https.Agent({
			rejectUnauthorized: false
		});

		// 事件類型配置
		this.eventTypes = {};
		this.settings = {};
		this.lastConfigLoadTime = null;
		this.loadEventTypes();

		HCPClient.instance = this;
	}

	/**
	 * 獲取單例實例
	 */
	static getInstance() {
		if (!HCPClient.instance) {
			HCPClient.instance = new HCPClient();
		}
		return HCPClient.instance;
	}

	/**
	 * 生成 HCP API 簽名
	 * @param {string} method - HTTP 方法
	 * @param {string} accept - Accept 標頭
	 * @param {string} contentType - Content-Type 標頭
	 * @param {string} urlPath - URL 路徑
	 * @returns {string} Base64 編碼的簽名
	 */
	generateSignature(method, accept, contentType, urlPath) {
		let textToSign = "";
		textToSign += method + "\n";
		textToSign += accept + "\n";
		textToSign += contentType + "\n";
		textToSign += urlPath;

		const hash = crypto.createHmac("sha256", this.sk).update(textToSign).digest("base64");
		return hash;
	}

	/**
	 * 通用操作錯誤處理
	 * @param {string} operation - 操作名稱
	 * @param {Error} error - 錯誤對象
	 * @param {Object} context - 額外上下文
	 * @returns {Object} 標準化錯誤回應
	 */
	handleOperationError(operation, error, context = {}) {
		LoggerService.error(`${operation}失敗`, { ...context, error: error.message });
		return {
			success: false,
			message: `${operation}失敗: ${error.message}`,
			error: error.message
		};
	}

	/**
	 * 發送 HCP API 請求
	 * @param {string} endpoint - API 端點
	 * @param {Object} data - 請求資料
	 * @param {string} method - HTTP 方法，預設為 POST
	 * @returns {Promise<Object>} API 回應
	 */
	async request(endpoint, data = {}, method = "POST") {
		try {
			const url = `${this.baseURL}${endpoint}`;
			const accept = "application/json";
			const contentType = "application/json;charset=UTF-8";

			// 生成簽名
			const signature = this.generateSignature(method, accept, contentType, endpoint);

			const headers = {
				Accept: accept,
				"Content-Type": contentType,
				"X-Ca-Key": this.ak,
				"X-Ca-Signature": signature
			};

			const response = await axios({
				method,
				url,
				headers,
				httpsAgent: this.httpsAgent, // 使用自訂 HTTPS Agent
				data: Object.keys(data).length > 0 ? data : undefined,
				timeout: 10000 // 10 秒超時
			});

			return response.data;
		} catch (error) {
			// 記錄詳細的錯誤信息，包括狀態碼
			const statusCode = error.response?.status || "N/A";
			const statusText = error.response?.statusText || "N/A";

			LoggerService.error(`HCP API 請求失敗: ${method} ${endpoint} - 狀態碼: ${statusCode} ${statusText}`, {
				endpoint,
				method,
				error: error.message,
				status: error.response?.status,
				statusText: error.response?.statusText,
				data: error.response?.data
			});

			// 使用新的狀態碼記錄功能
			if (error.response?.status) {
				LoggerService.httpStatus(`HCP API 請求失敗: ${error.message}`, error.response.status, method, endpoint);
			} else {
				// 網路錯誤或其他非 HTTP 錯誤
				LoggerService.httpStatus(`HCP API 請求失敗: ${error.message}`, 0, method, endpoint);
			}

			// 返回錯誤信息而不是拋出異常
			return {
				code: "-1",
				msg: `API 請求失敗: ${error.message}`,
				data: null,
				error: {
					status: error.response?.status,
					statusText: error.response?.statusText,
					data: error.response?.data
				}
			};
		}
	}

	/**
	 * 獲取平台版本資訊
	 * @returns {Promise<Object>} 平台版本資訊
	 */
	async getPlatformVersion() {
		const endpoint = `/artemis/api/common/${this.apiVersion}/version`;
		return await this.request(endpoint);
	}

	/**
	 * 獲取編碼裝置列表
	 * @param {Object} params - 查詢參數
	 * @returns {Promise<Object>} 編碼裝置列表
	 */
	async getEncodeDeviceList(params = {}) {
		const endpoint = `/artemis/api/resource/v1/encodeDevice/encodeDeviceList`;
		return await this.request(endpoint, params);
	}

	// ========== 攝影機相關 API ==========

	/**
	 * 獲取攝影機列表 (根據 Postman 集合)
	 * @param {Object} params - 查詢參數
	 * @returns {Promise<Object>} 攝影機列表
	 */
	async getCameraList(params = {}) {
		const endpoint = `/artemis/api/resource/v1/cameras`;
		return await this.request(endpoint, params);
	}

	// getPreviewURLs 方法已移除（Line Bot 不需要串流功能）

	/**
	 * 擷取即時圖片
	 * @param {Object} params - 擷取參數
	 * @returns {Promise<Object>} 擷取結果
	 */
	async captureCameraImage(params) {
		const endpoint = `/artemis/api/video/v1/camera/capture`;
		return await this.request(endpoint, params);
	}

	/**
	 * 獲取事件圖片數據
	 * @param {Object} params - 圖片參數
	 * @param {String} params.picUri - 圖片 URI
	 * @returns {Promise<Object>} Base64 編碼的圖片數據
	 */
	async getEventImage(params) {
		try {
			const endpoint = `/artemis/api/eventService/v1/image_data`;
			LoggerService.hcp(`取得事件圖片: ${params.picUri}`);

			const result = await this.request(endpoint, params);
			return result;
		} catch (error) {
			LoggerService.error("HCP getEventImage API 調用失敗", error);
			return {
				code: "-1",
				msg: `API 調用失敗: ${error.message}`,
				data: null
			};
		}
	}

	// ========== 事件訂閱相關 API ==========

	/**
	 * 獲取事件訂閱詳情
	 * @returns {Promise<Object>} 訂閱詳情
	 */
	async getEventSubscriptionDetails() {
		const endpoint = `/artemis/api/eventService/v1/eventSubscriptionView`;
		return await this.request(endpoint, {});
	}

	/**
	 * 訂閱事件類型
	 * @param {Object} params - 訂閱參數
	 * @returns {Promise<Object>} 訂閱結果
	 */
	async subscribeEventsByTypes(params) {
		const endpoint = `/artemis/api/eventService/v1/eventSubscriptionByEventTypes`;
		return await this.request(endpoint, params);
	}

	/**
	 * 取消事件訂閱
	 * @param {Object} params - 取消訂閱參數
	 * @returns {Promise<Object>} 取消訂閱結果
	 */
	async unsubscribeEvents(params) {
		const endpoint = `/artemis/api/eventService/v1/eventUnSubscriptionByEventTypes`;
		return await this.request(endpoint, params);
	}

	// ========== 事件隊列管理 ==========

	/**
	 * 標準化訂閱資料格式
	 * @param {Object} data - 原始資料
	 * @returns {Array} 標準化的資料陣列
	 */
	normalizeSubscriptionData(data) {
		if (data.detail) return data.detail;
		if (Array.isArray(data)) return data;
		return [data];
	}

	/**
	 * 載入事件類型配置
	 * @param {Boolean} forceReload - 是否強制重新載入
	 * @param {Boolean} autoSync - 是否自動同步訂閱狀態
	 */
	loadEventTypes(forceReload = false, autoSync = true) {
		const configData = configService.loadConfig("event-types.json", {
			eventTypes: {},
			settings: {}
		});

		this.eventTypes = configData.eventTypes || {};
		this.settings = configData.settings || {};
		this.lastConfigLoadTime = Date.now();

		// 如果啟用了自動訂閱管理且需要同步，檢查並同步訂閱狀態
		if (autoSync && this.settings.autoSubscribeNewTypes) {
			this.checkAndSyncSubscriptions();
		}
	}

	/**
	 * 檢查並同步訂閱狀態
	 */
	async checkAndSyncSubscriptions() {
		try {
			// 不記錄訂閱檢查

			// 獲取當前訂閱狀態
			const currentSubscriptions = await this.getEventSubscriptionDetails();
			const subscribedTypes = new Set();

			if (currentSubscriptions.code === "0" && currentSubscriptions.data) {
				// 使用標準化方法處理不同的資料格式
				const dataArray = this.normalizeSubscriptionData(currentSubscriptions.data);

				dataArray.forEach((sub) => {
					if (sub && sub.eventTypes) {
						if (Array.isArray(sub.eventTypes)) {
							sub.eventTypes.forEach((type) => subscribedTypes.add(type));
						} else {
							subscribedTypes.add(sub.eventTypes);
						}
					}
				});
			}

			// 檢查配置中需要訂閱的事件類型
			const shouldSubscribe = [];
			const shouldUnsubscribe = [];

			// 一次性遍歷所有配置的事件類型
			Object.entries(this.eventTypes).forEach(([code, config]) => {
				const eventCode = parseInt(code);
				const isSubscribed = subscribedTypes.has(eventCode);

				// 只有啟用的事件才需要訂閱
				if (config.enabled && !isSubscribed) {
					shouldSubscribe.push(eventCode);
				}

				// 未啟用但已訂閱的事件需要取消訂閱
				if (!config.enabled && isSubscribed) {
					shouldUnsubscribe.push(eventCode);
				}
			});

			// 檢查不在配置中的事件（需要取消訂閱）
			subscribedTypes.forEach((eventCode) => {
				const codeStr = String(eventCode);
				if (!this.eventTypes[codeStr]) {
					shouldUnsubscribe.push(eventCode);
					LoggerService.hcp(`發現未配置的事件類型 ${eventCode}，將取消訂閱`);
				}
			});

			// 執行訂閱/取消訂閱操作
			if (shouldSubscribe.length > 0) {
				await this.syncSubscribeEvents(shouldSubscribe);
			}

			if (shouldUnsubscribe.length > 0) {
				await this.syncUnsubscribeEvents(shouldUnsubscribe);
			}

			// 不記錄同步完成
		} catch (error) {
			LoggerService.error("同步訂閱狀態失敗", error);
		}
	}

	/**
	 * 準備訂閱參數
	 */
	prepareSubscriptionParams(eventTypes) {
		return {
			eventTypes: eventTypes,
			eventDest: process.env.WEBHOOK_URL,
			token: process.env.EVENT_TOKEN,
			passBack: 1
		};
	}

	/**
	 * 統一訂閱操作處理
	 * @param {Array} eventTypes - 事件類型陣列
	 * @param {string} operation - 操作類型 ('subscribe' 或 'unsubscribe')
	 * @returns {Promise<Object>} 操作結果
	 */
	async executeSubscriptionOperation(eventTypes, operation) {
		try {
			const params = operation === "subscribe" ? this.prepareSubscriptionParams(eventTypes) : { eventTypes };

			const result = await (operation === "subscribe" ? this.subscribeEventsByTypes(params) : this.unsubscribeEvents(params));

			return this.handleSubscriptionResult(result, eventTypes, operation);
		} catch (error) {
			return this.handleOperationError(`${operation}事件`, error, { eventTypes });
		}
	}

	/**
	 * 處理訂閱操作結果
	 * @param {Object} result - API 回應結果
	 * @param {Array} eventTypes - 事件類型陣列
	 * @param {string} operation - 操作類型
	 * @returns {Object} 處理結果
	 */
	handleSubscriptionResult(result, eventTypes, operation) {
		const operationName = operation === "subscribe" ? "訂閱" : "取消訂閱";

		if (result.code === "0") {
			return { success: true, message: `自動${operationName}成功` };
		} else {
			LoggerService.error(`自動${operationName}失敗: ${result.msg}`);
			return { success: false, message: `自動${operationName}失敗: ${result.msg}` };
		}
	}

	/**
	 * 同步訂閱事件
	 */
	async syncSubscribeEvents(eventTypes) {
		return await this.executeSubscriptionOperation(eventTypes, "subscribe");
	}

	/**
	 * 同步取消訂閱事件
	 */
	async syncUnsubscribeEvents(eventTypes) {
		return await this.executeSubscriptionOperation(eventTypes, "unsubscribe");
	}

	/**
	 * 獲取事件類型名稱
	 * @param {Number|String} eventType - 事件類型代碼
	 * @returns {String} 事件類型名稱
	 */
	getEventTypeName(eventType) {
		const eventTypeStr = String(eventType);
		return this.eventTypes[eventTypeStr]?.name || `事件類型 ${eventType}`;
	}

	/**
	 * 取得事件類型配置
	 * @param {number} eventType - 事件類型
	 * @returns {Object|null} 事件類型配置
	 */
	getEventTypeConfig(eventType) {
		return this.eventTypes[String(eventType)] || null;
	}

	/**
	 * 手動重新載入事件類型配置並同步訂閱
	 */
	async reloadEventTypes() {
		try {
			LoggerService.hcp("手動重新載入事件類型配置");
			this.loadEventTypes(true, true);

			return {
				success: true,
				message: "事件類型配置已重新載入",
				count: Object.keys(this.eventTypes).length
			};
		} catch (error) {
			LoggerService.error("重新載入事件類型配置失敗", error);
			throw error;
		}
	}
}

module.exports = HCPClient;
