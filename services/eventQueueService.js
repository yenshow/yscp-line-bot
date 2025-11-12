/**
 * 簡化事件隊列服務
 * 處理 HCP 事件的基本隊列管理
 */

const LoggerService = require("./loggerService");
const FlexMessageService = require("./flexMessageService");
const EventStorageService = require("./eventStorageService");
const configService = require("./configService");
const HCPClient = require("./hcpClient");

class EventQueueService {
	constructor() {
		// 事件隊列管理
		this.eventQueue = [];
		this.priorityQueue = [];
		this.isProcessing = false;
		this.maxConcurrent = 5;
		this.processingCount = 0;

		// 事件去重機制
		this.processedEvents = new Map();
		this.eventDeduplicationTTL = 60000; // 1分鐘去重時間

		// 基本頻率控制
		this.lastSendTime = 0;
		this.minSendInterval = 5000; // 5秒間隔

		// 服務依賴
		this.lineBotClient = null;
		this.flexMessageService = null;
		this.hcpClient = HCPClient.getInstance();

		// 定時清理機制
		this.cleanupInterval = null;
		this.startCleanupTimer();

		// 在 constructor 末尾加入 Watchdog 定時器
		this.watchdogInterval = setInterval(() => {
			try {
				if (!this.hasEventsToProcess()) return;
				// 情況1：完全沒有在處理
				if (!this.isProcessing) {
					LoggerService.hcp("[WATCHDOG] 偵測到待處理事件且 isProcessing=false → 重新啟動");
					return this.startProcessing();
				}
				// 情況2：旗標卡住 (isProcessing=true) 但實際沒有任務
				if (this.isProcessing && this.processingCount === 0) {
					LoggerService.warn("[WATCHDOG] 偵測到 processingCount=0 但 isProcessing=true → 重置旗標並重啟");
					this.isProcessing = false;
					return this.startProcessing();
				}
			} catch (err) {
				LoggerService.warn("[WATCHDOG] 執行錯誤", err);
			}
		}, 15000); // 每 15 秒檢查一次
	}

	/**
	 * 初始化服務依賴
	 */
	initialize(lineBotClient) {
		this.lineBotClient = lineBotClient;
	}

	/**
	 * 獲取 FlexMessageService 實例（延遲載入）
	 */
	getFlexMessageService() {
		if (!this.flexMessageService) {
			const FlexMessageService = require("./flexMessageService");
			this.flexMessageService = new FlexMessageService();
		}
		return this.flexMessageService;
	}

	/**
	 * 檢查事件是否已處理過（去重機制）
	 * @param {Object} eventData - 事件數據
	 * @returns {boolean} 是否為重複事件
	 */
	isDuplicateEvent(eventData) {
		const eventId = eventData.eventId;
		if (!eventId) {
			return false;
		}

		const now = Date.now();
		const processedTime = this.processedEvents.get(eventId);

		if (processedTime && now - processedTime < this.eventDeduplicationTTL) {
			return true;
		}

		this.processedEvents.set(eventId, now);
		return false;
	}

	/**
	 * 清理過期的事件記錄
	 */
	cleanupProcessedEvents() {
		const now = Date.now();
		for (const [eventId, processedTime] of this.processedEvents.entries()) {
			if (now - processedTime > this.eventDeduplicationTTL) {
				this.processedEvents.delete(eventId);
			}
		}
	}

	/**
	 * 計算事件優先級
	 * @param {Object} eventData - 事件數據
	 * @returns {string} 優先級 ('high' 或 'normal')
	 */
	calculateEventPriority(eventData) {
		const eventConfig = this.hcpClient.getEventTypeConfig(eventData.eventType);

		if (eventConfig && eventConfig.priority) {
			return eventConfig.priority === "medium" ? "normal" : eventConfig.priority;
		}

		return "normal";
	}

	/**
	 * 添加 HCP 事件到隊列
	 * @param {Object} eventData - HCP 事件數據
	 */
	enqueueHCPEvent(eventData) {
		const priority = this.calculateEventPriority(eventData);
		return this.enqueueEvent(eventData, priority);
	}

	/**
	 * 添加事件到隊列
	 */
	enqueueEvent(eventData, priority = "normal") {
		if (this.isDuplicateEvent(eventData)) {
			return false;
		}

		const eventItem = {
			data: eventData,
			processor: this.processEvent.bind(this),
			enqueuedAt: Date.now(),
			priority: priority
		};

		// 根據優先級選擇隊列
		if (priority === "high") {
			this.priorityQueue.push(eventItem);
		} else {
			this.eventQueue.push(eventItem);
		}

		LoggerService.hcp(`[DEBUG ENQUEUE] eventId=${eventData.eventId} priority=${priority} isProcessing=${this.isProcessing}`);
		LoggerService.hcp(`事件已加入隊列: ${eventData.eventType} (${eventData.eventId})`);

		// 如果沒有在處理，開始處理
		if (!this.isProcessing) {
			this.startProcessing();
		}

		return true;
	}

	/**
	 * 開始處理事件隊列
	 */
	async startProcessing() {
		if (this.isProcessing) {
			return;
		}

		LoggerService.hcp("[DEBUG START] enter startProcessing");
		this.isProcessing = true;
		this.cleanupProcessedEvents();
		try {
			while (this.hasEventsToProcess()) {
				if (this.processingCount >= this.maxConcurrent) {
					await new Promise((resolve) => setTimeout(resolve, 1000));
					continue;
				}

				const eventItem = this.getNextEvent();
				if (!eventItem) {
					LoggerService.hcp("[EVENT_QUEUE] 沒有事件待處理，結束循環");
					break;
				}

				this.processingCount++;
				LoggerService.hcp(`[EVENT_QUEUE] 處理事件開始 eventId=${eventItem.data?.eventId}`);
				this.processEventItem(eventItem).finally(() => {
					this.processingCount--;
					LoggerService.hcp(`[EVENT_QUEUE] 處理事件結束 eventId=${eventItem.data?.eventId} currentProcessing=${this.processingCount}`);
				});
			}
		} catch (error) {
			LoggerService.error("[EVENT_QUEUE] 佇列處理致命錯誤", error);
		} finally {
			this.isProcessing = false;
			LoggerService.hcp("[DEBUG START] leave startProcessing");
			LoggerService.hcp("[EVENT_QUEUE] 處理流程結束");
		}
	}

	/**
	 * 處理單個事件項目
	 */
	async processEventItem(eventItem) {
		const { data, processor } = eventItem;

		try {
			EventStorageService.storeEvent(data);
			LoggerService.hcp(`[EVENT_QUEUE] storeEvent 完成 eventId=${data?.eventId}`);
			await processor(data);
		} catch (error) {
			LoggerService.error(`事件處理失敗: ${data.eventType || "未知"}`, error);
		}
	}

	/**
	 * 處理事件
	 */
	async processEvent(eventData) {
		try {
			LoggerService.hcp(`[EVENT_PROCESS] 開始處理 eventId=${eventData?.eventId}`);
			// FlexMessageService 內部已自行處理圖片查詢
			await this.enforceRateLimit();
			const result = await this.sendEventNotification(eventData);
			LoggerService.hcp(`[EVENT_PROCESS] 處理完成 eventId=${eventData?.eventId}`);
			return result;
		} catch (error) {
			LoggerService.error("處理事件失敗", error);
			throw error;
		}
	}

	/**
	 * 發送事件通知
	 */
	async sendEventNotification(eventData) {
		// 從 users.role 取得通知目標（admin 與 target）
		const data = configService.loadConfig("user-management.json", { users: {} });
		const entries = Object.entries(data.users || {});
		const targets = entries
			.filter(([_, u]) => u && (u.role === "admin" || u.role === "target"))
			.map(([key, u]) => u.id || u.userId || key)
			.filter(Boolean);

		if (targets.length === 0) {
			LoggerService.warn("沒有設定通知目標，警報訊息無法發送");
			return { success: false, error: "沒有通知目標" };
		}

		const flexMessage = await this.getFlexMessageService().createEventFlexMessage(eventData);
		const messages = [flexMessage];

		const sendPromises = targets.map((targetId) =>
			this.lineBotClient
				.pushMessage(targetId, messages)
				.then(() => ({ targetId, success: true }))
				.catch((error) => {
					LoggerService.error(`發送通知到 ${targetId} 失敗`, error);
					return { targetId, success: false, error: error.message };
				})
		);

		const results = await Promise.all(sendPromises);
		const successCount = results.filter((r) => r.success).length;

		if (successCount > 0) {
			const storedEvent = EventStorageService.getEvent(eventData.eventId) || {
				...eventData,
				storedAt: Date.now()
			};
			LoggerService.hcp(`[EVENT_HISTORY] 寫入歷史 eventId=${eventData.eventId} image=${storedEvent.imageUrl || storedEvent?.data?.eventPicUri || "none"}`);
			EventStorageService.appendEventToHistory(storedEvent);
		}

		return { success: true, successCount, results };
	}

	/**
	 * 基本頻率控制
	 */
	async enforceRateLimit() {
		const now = Date.now();
		const timeSinceLastSend = now - this.lastSendTime;

		if (timeSinceLastSend < this.minSendInterval) {
			const waitTime = this.minSendInterval - timeSinceLastSend;
			await new Promise((resolve) => setTimeout(resolve, waitTime));
		}

		this.lastSendTime = Date.now();
	}
	// 私有方法
	hasEventsToProcess() {
		return this.eventQueue.length > 0 || this.priorityQueue.length > 0;
	}

	getNextEvent() {
		// 優先處理高優先級隊列
		if (this.priorityQueue.length > 0) {
			return this.priorityQueue.shift();
		}

		if (this.eventQueue.length > 0) {
			return this.eventQueue.shift();
		}

		return null;
	}

	/**
	 * 啟動定時清理機制
	 */
	startCleanupTimer() {
		// 每分鐘清理一次過期事件記錄
		this.cleanupInterval = setInterval(() => {
			this.cleanupProcessedEvents();
		}, 60000); // 60秒
	}

	/**
	 * 停止定時清理機制
	 */
	stopCleanupTimer() {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = null;
		}
	}

	/**
	 * 獲取事件隊列狀態（向後兼容）
	 */
	getEventQueueStatus() {
		return {
			totalQueueLength: this.eventQueue.length + this.priorityQueue.length,
			eventQueueLength: this.eventQueue.length,
			priorityQueueLength: this.priorityQueue.length,
			processingCount: this.processingCount,
			maxConcurrent: this.maxConcurrent,
			isProcessing: this.isProcessing
		};
	}

	/**
	 * 獲取速率限制狀態（向後兼容）
	 */
	getRateLimitStatus() {
		const now = Date.now();
		const timeSinceLastSend = now - this.lastSendTime;
		const nextAvailableTime = this.lastSendTime + this.minSendInterval;

		return {
			lastSendTime: this.lastSendTime,
			timeSinceLastSend: timeSinceLastSend,
			minSendInterval: this.minSendInterval,
			nextAvailableTime: nextAvailableTime,
			canSendNow: timeSinceLastSend >= this.minSendInterval,
			waitTime: Math.max(0, this.minSendInterval - timeSinceLastSend)
		};
	}

	/**
	 * 暫停發送（向後兼容）
	 */
	pauseSending(reason = "手動暫停") {
		LoggerService.warn(`事件隊列服務已暫停: ${reason}`);
		// 簡化版本：只記錄日誌，不實際暫停
	}

	/**
	 * 恢復發送（向後兼容）
	 */
	resumeSending() {
		LoggerService.hcp("事件隊列服務已恢復");
		// 簡化版本：只記錄日誌
	}

	/**
	 * 銷毀服務
	 */
	destroy() {
		this.stopCleanupTimer();
		if (this.watchdogInterval) {
			clearInterval(this.watchdogInterval);
			this.watchdogInterval = null;
		}
	}
}

// 導出單例，並在載入時即啟動佇列處理
const singleton = new EventQueueService();
// 確保佇列循環啟動（若有殘餘事件）
setImmediate(() => {
	singleton.startProcessing();
});

module.exports = singleton;
