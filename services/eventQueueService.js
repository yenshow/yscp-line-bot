/*
 * 事件佇列服務（精簡版）
 * - 優先佇列 + 普通佇列
 * - Semaphore 控制最大併發
 * - 無 watchdog / 無 isProcessing 旗標
 */

const configService = require("./configService");
const LoggerService = require("./loggerService");
const EventStorageService = require("./eventStorageService");
const FlexMessageService = require("./flexMessageService");

class Semaphore {
	constructor(max) {
		this.max = max;
		this.count = 0;
		this.waiters = [];
	}
	async acquire() {
		if (this.count < this.max) {
			this.count++;
			return;
		}
		return new Promise((resolve) => this.waiters.push(resolve));
	}
	release() {
		if (this.waiters.length > 0) {
			const resolve = this.waiters.shift();
			resolve();
		} else {
			this.count--;
		}
	}
}

class EventQueueService {
	constructor(maxConcurrent = 5) {
		this.priorityQueue = [];
		this.normalQueue = [];
		this.semaphore = new Semaphore(maxConcurrent);
		this.running = false; // gate flag
		this.lineBotClient = null;
		this.flexMessageService = new FlexMessageService();

		// 去重
		this.processed = new Map();
		this.dedupeTTL = 60000;

		// 頻率控制
		this.lastSend = 0;
		this.minInterval = 5000;

		// 定時清理
		setInterval(() => this.cleanupProcessed(), 60000);
	}

	initialize(lineBotClient) {
		this.lineBotClient = lineBotClient;
	}

	/* ---------- 佇列操作 ---------- */
	enqueueHCPEvent(eventData) {
		const priority = this.getPriority(eventData);
		this.enqueue(eventData, priority);
	}

	enqueue(eventData, priority = "normal") {
		if (this.isDuplicate(eventData)) return false;
		(priority === "high" ? this.priorityQueue : this.normalQueue).push(eventData);
		LoggerService.hcp(`[ENQUEUE] eventId=${eventData.eventId} priority=${priority}`);
		if (!this.running) {
			this.running = true;
			void this.processLoop();
		}
		return true;
	}

	getPriority(eventData) {
		// 依 event type config 的 priority 欄位；預設 normal
		try {
			const cfg = require("./hcpClient").getInstance().getEventTypeConfig(eventData.eventType);
			if (cfg && cfg.priority) return cfg.priority === "medium" ? "normal" : cfg.priority;
		} catch {}
		return "normal";
	}

	isDuplicate({ eventId }) {
		if (!eventId) return false;
		const now = Date.now();
		const t = this.processed.get(eventId);
		if (t && now - t < this.dedupeTTL) return true;
		this.processed.set(eventId, now);
		return false;
	}

	cleanupProcessed() {
		const now = Date.now();
		for (const [id, t] of this.processed.entries()) {
			if (now - t > this.dedupeTTL) this.processed.delete(id);
		}
	}

	/* ---------- 核心處理迴圈 ---------- */
	async processLoop() {
		while (this.hasEvent()) {
			const evt = this.nextEvent();
			await this.semaphore.acquire();
			this.handleEvent(evt)
				.catch((e) => LoggerService.error("處理事件失敗", e))
				.finally(() => {
					this.semaphore.release();
				});
		}
		// 迴圈跑完才把 gate 關閉；若期間又有事件入列，enqueue 會再次啟動 loop
		this.running = false;
	}

	hasEvent() {
		return this.priorityQueue.length > 0 || this.normalQueue.length > 0;
	}

	nextEvent() {
		return this.priorityQueue.length ? this.priorityQueue.shift() : this.normalQueue.shift();
	}

	/* ---------- 單筆事件 ---------- */
	async handleEvent(eventData) {
		LoggerService.hcp(`[HANDLE] ${eventData.eventId}`);
		EventStorageService.storeEvent(eventData);

		await this.enforceRate();

		// 產生 Flex Message
		const flex = await this.flexMessageService.createEventFlexMessage(eventData);
		await this.pushToTargets(flex, eventData);
	}

	async enforceRate() {
		const now = Date.now();
		const delta = now - this.lastSend;
		if (delta < this.minInterval) {
			await new Promise((r) => setTimeout(r, this.minInterval - delta));
		}
		this.lastSend = Date.now();
	}

	async pushToTargets(flexMessage, eventData) {
		if (!this.lineBotClient) {
			LoggerService.warn("LineBotClient 未初始化，無法推送訊息");
			return;
		}
		const { users = {} } = configService.loadConfig("user-management.json", { users: {} });
		const targets = Object.values(users)
			.filter((u) => u && (u.role === "admin" || u.role === "target"))
			.map((u) => u.id || u.userId)
			.filter(Boolean);
		if (targets.length === 0) {
			LoggerService.warn("沒有通知目標");
			return;
		}
		await Promise.all(targets.map((id) => this.lineBotClient.pushMessage(id, [flexMessage]).catch((e) => LoggerService.error(`推送到 ${id} 失敗`, e))));
		// 寫入歷史
		const stored = EventStorageService.getEvent(eventData.eventId) || { ...eventData, storedAt: Date.now() };
		EventStorageService.appendEventToHistory(stored);
	}
}

// 匯出單例
module.exports = new EventQueueService(5);
