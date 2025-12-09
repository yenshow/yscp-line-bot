/**
 * 簡化事件儲存服務
 * 負責基本的事件資料儲存和查詢
 */

const path = require("path");
const LoggerService = require("./loggerService");
const fileSystem = require("./fileSystemService");

class EventStorageService {
	constructor() {
		// 使用 Map 儲存事件資料，key 為 eventId
		this.eventStorage = new Map();

		// 設定事件資料過期時間（7天）
		this.eventTTL = 7 * 24 * 60 * 60 * 1000; // 7天
		this.historyFilePath = path.join(__dirname, "..", "data", "event-history.json");
		this.maxHistorySize = 300;

		// 定時清理過期事件
		this.cleanupInterval = setInterval(() => {
			this.cleanupExpiredEvents();
		}, 24 * 60 * 60 * 1000); // 每天清理一次

		this.ensureHistoryFile();
	}

	ensureHistoryFile() {
		try {
			if (!fileSystem.fileExists(this.historyFilePath)) {
				const initial = { events: [], lastUpdated: null };
				fileSystem.writeFile(this.historyFilePath, JSON.stringify(initial, null, 2));
				return;
			}

			const content = fileSystem.readFile(this.historyFilePath);
			if (!content || !content.trim()) {
				const initial = { events: [], lastUpdated: null };
				fileSystem.writeFile(this.historyFilePath, JSON.stringify(initial, null, 2));
				return;
			}

			JSON.parse(content);
		} catch (error) {
			LoggerService.error("初始化事件歷史檔案失敗", error);
			const fallback = { events: [], lastUpdated: null };
			fileSystem.writeFile(this.historyFilePath, JSON.stringify(fallback, null, 2));
		}
	}

	loadHistoryData() {
		try {
			const content = fileSystem.readFile(this.historyFilePath);
			if (!content) {
				return { events: [], lastUpdated: null };
			}
			const parsed = JSON.parse(content);
			if (!Array.isArray(parsed.events)) {
				parsed.events = [];
			}
			return parsed;
		} catch (error) {
			LoggerService.error("讀取事件歷史資料失敗", error);
			return { events: [], lastUpdated: null };
		}
	}

	saveHistoryData(data) {
		try {
			fileSystem.writeFile(this.historyFilePath, JSON.stringify(data, null, 2));
		} catch (error) {
			LoggerService.error("寫入事件歷史資料失敗", error);
		}
	}

	appendEventToHistory(eventData) {
		if (!eventData || !eventData.eventId) {
			return;
		}

		try {
			const history = this.loadHistoryData();
			const imageSources = {
				picUri: eventData?.data?.picUri || null,
				faceUrl: eventData?.data?.alarmResult?.faces?.URL || null,
				eventPicUri: eventData?.eventPicUri || eventData?.data?.eventPicUri || null
			};

			const candidate = eventData?.data?.alarmResult?.faces?.identify?.candidate || null;
			const meta = candidate
				? {
						name: candidate?.reserve_field?.name || null,
						similarity: typeof candidate?.similarity === "number" ? candidate.similarity : null
				  }
				: null;

			const historyItem = {
				eventId: eventData.eventId,
				ability: eventData.ability || null,
				eventType: eventData.eventType || null,
				happenTime: eventData.happenTime || null,
				srcName: eventData.srcName || null,
				srcType: eventData.srcType || null,
				storedAt: eventData.storedAt || Date.now(),
				imageUrl: eventData.imageUrl || null
			};

			if (imageSources.picUri || imageSources.faceUrl || imageSources.eventPicUri) {
				historyItem.imageSources = imageSources;
			}

			if (meta && (meta.name || meta.similarity !== null)) {
				historyItem.meta = meta;
			}

			history.events.unshift(historyItem);
			if (history.events.length > this.maxHistorySize) {
				history.events = history.events.slice(0, this.maxHistorySize);
			}

			history.lastUpdated = new Date().toISOString();
			this.saveHistoryData(history);
		} catch (error) {
			LoggerService.error("追加事件歷史資料失敗", error);
		}
	}

	/**
	 * 取得事件列表（分頁，依 storedAt 新到舊）
	 * @param {Object} options
	 * @param {number} options.page - 頁碼（從1開始）
	 * @param {number} options.pageSize - 每頁數量
	 * @param {string|undefined} options.ability - 過濾 ability
	 * @param {number|undefined} options.eventType - 過濾 eventType
	 * @returns {{ list: Array, total: number }}
	 */
	listEvents({ page = 1, pageSize = 10, ability, eventType } = {}) {
		try {
			const all = [];
			for (const [, value] of this.eventStorage.entries()) {
				// 只保留未過期
				if (Date.now() - value.storedAt <= this.eventTTL) {
					all.push(value);
				}
			}

			// 過濾條件
			const filtered = all.filter((e) => {
				if (ability && e.ability !== ability) return false;
				if (typeof eventType === "number" && e.eventType !== eventType) return false;
				return true;
			});

			// 依時間新到舊排序
			filtered.sort((a, b) => b.storedAt - a.storedAt);

			const total = filtered.length;
			const start = Math.max(0, (page - 1) * pageSize);
			const end = start + pageSize;
			const list = filtered.slice(start, end);

			return { list, total };
		} catch (error) {
			LoggerService.error("列出事件資料失敗", error);
			return { list: [], total: 0 };
		}
	}

	/**
	 * 儲存事件資料
	 * @param {Object} eventData - 事件資料
	 */
	storeEvent(eventData) {
		try {
			const { eventId } = eventData;

			if (!eventId) {
				LoggerService.warn("無法儲存事件：缺少 eventId");
				return false;
			}

			// 儲存事件資料，包含時間戳記
			const storedEvent = {
				...eventData,
				storedAt: Date.now(),
				imageUrl: eventData.imageUrl || null
			};
			this.eventStorage.set(eventId, storedEvent);

			return true;
		} catch (error) {
			LoggerService.error("儲存事件資料失敗", error);
			return false;
		}
	}

	updateEventData(eventId, updates = {}) {
		if (!eventId || !updates || typeof updates !== "object") {
			return;
		}

		const current = this.eventStorage.get(eventId);
		if (!current) {
			return;
		}

		const dataUpdates = updates.data && typeof updates.data === "object" ? updates.data : null;
		const mergedData = {
			...(current.data || {})
		};
		if (dataUpdates) {
			Object.assign(mergedData, dataUpdates);
		}

		const mergedEvent = {
			...current,
			...updates
		};

		if (dataUpdates) {
			mergedEvent.data = mergedData;
		}

		this.eventStorage.set(eventId, mergedEvent);
	}

	updateEventImage(eventId, imageUrl) {
		if (!eventId || !imageUrl) {
			return;
		}

		try {
			const current = this.eventStorage.get(eventId);
			if (current) {
				current.imageUrl = imageUrl;
				this.eventStorage.set(eventId, current);
			}

			const history = this.loadHistoryData();
			let changed = false;
			history.events = history.events.map((event) => {
				if (event.eventId === eventId) {
					changed = true;
					return {
						...event,
						imageUrl
					};
				}
				return event;
			});

			if (changed) {
				history.lastUpdated = new Date().toISOString();
				this.saveHistoryData(history);
			}
		} catch (error) {
			LoggerService.error("更新事件圖片連結失敗", error);
		}
	}

	/**
	 * 更新歷史記錄中的圖片來源資訊
	 * @param {string} eventId - 事件 ID
	 * @param {Object} imageSources - 圖片來源物件
	 * @param {string|null} imageSources.picUri - 圖片 URI
	 * @param {string|null} imageSources.faceUrl - 人臉圖片 URL
	 * @param {string|null} imageSources.eventPicUri - 事件圖片 URI
	 */
	updateEventImageSources(eventId, imageSources = {}) {
		if (!eventId || !imageSources || Object.keys(imageSources).length === 0) {
			return;
		}

		try {
			const history = this.loadHistoryData();
			let changed = false;
			history.events = history.events.map((event) => {
				if (event.eventId === eventId) {
					changed = true;
					const existingImageSources = event.imageSources || {};
					return {
						...event,
						imageSources: {
							...existingImageSources,
							...imageSources
						}
					};
				}
				return event;
			});

			if (changed) {
				history.lastUpdated = new Date().toISOString();
				this.saveHistoryData(history);
			}
		} catch (error) {
			LoggerService.error("更新事件圖片來源失敗", error);
		}
	}

	getEventFromHistory(eventId) {
		if (!eventId) {
			return null;
		}

		try {
			const history = this.loadHistoryData();
			return history.events.find((event) => event.eventId === eventId) || null;
		} catch (error) {
			LoggerService.error("從事件歷史取得事件資料失敗", error);
			return null;
		}
	}

	/**
	 * 根據事件 ID 取得事件資料
	 * @param {string} eventId - 事件 ID
	 * @returns {Object|null} 事件資料或 null
	 */
	getEvent(eventId) {
		try {
			const eventData = this.eventStorage.get(eventId);

			if (!eventData) {
				return null;
			}

			// 檢查是否過期
			if (Date.now() - eventData.storedAt > this.eventTTL) {
				this.eventStorage.delete(eventId);
				return null;
			}

			return eventData;
		} catch (error) {
			LoggerService.error("取得事件資料失敗", error);
			return null;
		}
	}

	getEventHistory({ page = 1, pageSize = 10, ability, eventType } = {}) {
		try {
			const history = this.loadHistoryData();
			let list = Array.isArray(history.events) ? [...history.events] : [];

			if (ability) {
				list = list.filter((event) => event.ability === ability);
			}

			if (typeof eventType === "number") {
				list = list.filter((event) => Number(event.eventType) === eventType);
			}

			const validPage = Number.isInteger(page) && page > 0 ? page : 1;
			const validPageSize = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 10;
			const startIndex = (validPage - 1) * validPageSize;
			const endIndex = startIndex + validPageSize;

			return {
				list: list.slice(startIndex, endIndex),
				total: list.length,
				lastUpdated: history.lastUpdated
			};
		} catch (error) {
			LoggerService.error("取得事件歷史列表失敗", error);
			return { list: [], total: 0, lastUpdated: null };
		}
	}

	/**
	 * 取得事件的圖片 URI
	 * @param {string} eventId - 事件 ID
	 * @returns {string|null} 圖片 URI 或 null
	 */
	getEventImageUri(eventId) {
		try {
			let eventData = this.getEvent(eventId);

			if (!eventData) {
				eventData = this.getEventFromHistory(eventId);
			}

			if (!eventData) {
				return null;
			}

			const imageSources = eventData.imageSources || {};
			if (imageSources.picUri) {
				return imageSources.picUri;
			}
			if (imageSources.faceUrl) {
				return imageSources.faceUrl;
			}
			if (imageSources.eventPicUri) {
				return imageSources.eventPicUri;
			}

			const data = eventData.data || {};
			if (data.picUri) {
				return data.picUri;
			}
			if (data?.alarmResult?.faces?.URL) {
				return data.alarmResult.faces.URL;
			}
			if (data?.eventPicUri) {
				return data.eventPicUri;
			}

			// 檢查事件層級的 eventPicUri
			if (eventData.eventPicUri) {
				return eventData.eventPicUri;
			}

			return null;
		} catch (error) {
			LoggerService.error("取得事件圖片 URI 失敗", error);
			return null;
		}
	}

	/**
	 * 清理過期的事件資料
	 */
	cleanupExpiredEvents() {
		try {
			const now = Date.now();
			let cleanedCount = 0;

			for (const [eventId, eventData] of this.eventStorage.entries()) {
				if (now - eventData.storedAt > this.eventTTL) {
					this.eventStorage.delete(eventId);
					cleanedCount++;
				}
			}

			if (cleanedCount > 0) {
				LoggerService.debug(`清理了 ${cleanedCount} 個過期事件`);
			}
		} catch (error) {
			LoggerService.error("清理過期事件失敗", error);
		}
	}

	/**
	 * 清理資源
	 */
	destroy() {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = null;
		}
		this.eventStorage.clear();
	}
}

// 導出單例實例
module.exports = new EventStorageService();
