const path = require("path");
const fileSystem = require("./fileSystemService");

/**
 * 統一日誌服務
 * 提供分類日誌功能，時間格式統一在最前面
 */
class LoggerService {
	constructor() {
		// 確保 fileSystem 服務可用
		if (!fileSystem || typeof fileSystem.getDirectory !== "function") {
			console.error("❌ FileSystemService 未正確初始化");
			this.logsDir = path.join(__dirname, "../logs");
		} else {
			this.logsDir = fileSystem.getDirectory("logs");
		}

		// 防止重複記錄的緩存
		this.lastLogs = new Map();
		this.duplicateThreshold = 5000; // 5秒內不記錄相同訊息
	}

	/**
	 * 格式化時間戳
	 * @returns {string} 格式化的時間戳
	 */
	getTimestamp() {
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, "0");
		const day = String(now.getDate()).padStart(2, "0");
		const hours = String(now.getHours()).padStart(2, "0");
		const minutes = String(now.getMinutes()).padStart(2, "0");
		const seconds = String(now.getSeconds()).padStart(2, "0");
		const milliseconds = String(now.getMilliseconds()).padStart(3, "0");

		return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
	}

	/**
	 * 檢查是否為重複訊息
	 * @param {string} key - 訊息唯一鍵
	 * @param {string} message - 訊息內容
	 * @returns {boolean} 是否為重複訊息
	 */
	isDuplicateMessage(key, message) {
		// 使用統一的時間閾值避免重複訊息
		const now = Date.now();
		const lastLog = this.lastLogs.get(key);

		if (lastLog && now - lastLog.timestamp < this.duplicateThreshold) {
			lastLog.count++;
			return true;
		}

		this.lastLogs.set(key, { timestamp: now, message, count: 1 });
		return false;
	}

	/**
	 * 寫入日誌檔案（統一使用 FileSystemService）
	 * @param {string} filename - 日誌檔案名稱
	 * @param {string} message - 日誌訊息
	 * @param {string} level - 日誌等級
	 */
	writeLog(filename, message, level = "INFO") {
		try {
			if (!fileSystem || typeof fileSystem.appendFile !== "function") {
				throw new Error("FileSystemService 未正確初始化，無法寫入日誌");
			}

			const timestamp = this.getTimestamp();
			const logEntry = `[${timestamp}] [${level}] ${message}\n`;
			const logPath = path.join(this.logsDir, filename);

			fileSystem.appendFile(logPath, logEntry);
		} catch (error) {
			console.error("寫入日誌檔案錯誤:", error);
		}
	}

	/**
	 * 系統/服務資訊日誌（合併 system 和 service）
	 * @param {string} message - 訊息
	 */
	info(message) {
		this.writeLog("app.log", message, "INFO");
		console.log(`ℹ️ [資訊] ${message}`);
	}

	/**
	 * 系統啟動日誌（向後兼容，內部調用 info）
	 * @param {string} message - 訊息
	 */
	system(message) {
		this.info(message);
	}

	/**
	 * 服務狀態日誌（向後兼容，內部調用 info）
	 * @param {string} message - 訊息
	 */
	service(message) {
		this.info(message);
	}

	/**
	 * 用戶活動日誌
	 * @param {string} message - 訊息
	 */
	user(message) {
		this.writeLog("app.log", message, "USER");
		console.log(`👤 [用戶] ${message}`);
	}

	/**
	 * 用戶狀態變更（結構化 JSON）
	 * @param {Object} payload - { id, fromRole, toRole, type, displayName }
	 */
	logUserStateChange(payload) {
		try {
			const timestamp = this.getTimestamp();
			const entry = { timestamp, ...payload };
			this.writeLog("app.log", `USER_STATE ${JSON.stringify(entry)}`, "USERJSON");
			console.log(`🗂️ [用戶狀態] ${payload.id}: ${payload.fromRole || "unknown"} -> ${payload.toRole}`);
		} catch (error) {
			this.error("記錄用戶狀態變更錯誤", error);
		}
	}

	/**
	 * YSCP 事件日誌
	 * @param {string} message - 訊息
	 * @param {string} eventId - 事件ID（可選，用於更精確的去重）
	 */
	hcp(message, eventId = null) {
		// 簡化 YSCP 日誌，重複處理由事件隊列層負責
		this.writeLog("app.log", message, "YSCP");
		console.log(`📨 [YSCP] ${message}`);
	}


	/**
	 * HTTP 狀態碼日誌（記錄所有狀態碼）
	 * @param {string} message - 訊息
	 * @param {number} statusCode - HTTP 狀態碼
	 * @param {string} method - HTTP 方法
	 * @param {string} endpoint - 端點
	 */
	httpStatus(message, statusCode, method = "", endpoint = "") {
		const statusMessage = `HTTP ${statusCode}: ${message}${method ? ` (${method} ${endpoint})` : ""}`;

		// 根據狀態碼分類記錄
		if (statusCode >= 200 && statusCode < 300) {
			// 成功狀態碼記錄到 app.log
			this.writeLog("app.log", statusMessage, "HTTP");
		} else if (statusCode >= 400 && statusCode < 500) {
			// 客戶端錯誤記錄到警告日誌
			this.warn(statusMessage);
		} else if (statusCode >= 500) {
			// 伺服器錯誤記錄到錯誤日誌
			this.error(statusMessage);
		} else {
			// 其他狀態碼記錄到 app.log
			this.writeLog("app.log", statusMessage, "HTTP");
		}
	}

	/**
	 * 錯誤日誌
	 * @param {string} message - 錯誤訊息
	 * @param {Error} error - 錯誤對象
	 */
	error(message, error = null) {
		const errorMessage = error ? `${message}: ${error.message}` : message;
		this.writeLog("error.log", errorMessage, "ERROR");
		console.error(`❌ [錯誤] ${errorMessage}`);

		if (error && error.stack) {
			this.writeLog("error.log", error.stack, "ERROR");
		}
	}

	/**
	 * 警告日誌
	 * @param {string} message - 警告訊息
	 */
	warn(message) {
		this.writeLog("error.log", message, "WARN");
		console.warn(`⚠️ [警告] ${message}`);
	}

	/**
	 * 調試日誌（僅控制台輸出）
	 * @param {string} message - 調試訊息
	 */
	debug(message) {
		// 調試訊息只輸出到控制台，不寫入檔案
		if (process.env.NODE_ENV !== "production") {
			console.log(`🐛 [調試] ${message}`);
		}
	}

	/**
	 * 獲取日誌檔案列表（統一使用 FileSystemService）
	 * @returns {Array} 日誌檔案列表
	 */
	getLogFiles() {
		try {
			if (!fileSystem || typeof fileSystem.getDirectoryFiles !== "function") {
				throw new Error("FileSystemService 未正確初始化，無法獲取日誌檔案列表");
			}

			const files = fileSystem.getDirectoryFiles(this.logsDir);
			return files.filter((file) => file.endsWith(".log"));
		} catch (error) {
			this.error("獲取日誌檔案列表錯誤", error);
			return [];
		}
	}

	/**
	 * 獲取日誌目錄統計資訊（使用 FileSystemService 統一方法）
	 * @returns {Object} 目錄統計資訊
	 */
	getLogDirectoryStats() {
		try {
			// 使用 FileSystemService 的統一方法，過濾日誌相關檔案
			const stats = fileSystem.getDirectoryStatus("logs", {
				filePattern: /\.(log|bak)$/,
				includeFileDetails: true
			});

			if (!stats || !stats.exists) {
				return { totalSize: 0, totalSizeMB: "0", totalSizeGB: "0", fileCount: 0, files: [] };
			}

			// 轉換為 LoggerService 期望的格式
			return {
				totalSize: stats.totalSize,
				totalSizeMB: stats.totalSizeMB.toString(),
				totalSizeGB: stats.totalSizeGB,
				fileCount: stats.fileCount,
				files: stats.files || []
			};
		} catch (error) {
			this.error("獲取日誌目錄統計資訊錯誤", error);
			return { totalSize: 0, totalSizeMB: "0", totalSizeGB: "0", fileCount: 0, files: [] };
		}
	}

	/**
	 * 檢查日誌目錄容量並發出告警（使用 FileSystemService 統一方法）
	 * @param {Object} stats - 目錄統計資訊（可選，如果不提供則重新計算）
	 */
	checkLogDirectoryCapacity(stats = null) {
		try {
			// 使用 FileSystemService 的統一容量檢查方法
			const directoryStats = fileSystem.checkDirectoryCapacity(this.logsDir, {
				filePattern: /\.(log|bak)$/,
				warningThresholdMB: 500,
				criticalThresholdMB: 1000,
				fileCountWarning: 100,
				singleFileWarningMB: 50,
				onWarning: (message) => {
					this.warn(`[日誌告警] ${message}`);
				},
				onCritical: (message) => {
					this.warn(`[日誌告警] ${message}，建議立即清理`);
				}
			});

			// 如果提供了 stats 參數，確保返回的格式一致
			if (stats && directoryStats) {
				// 更新 stats 對象以保持一致性
				stats.totalSize = directoryStats.totalSize;
				stats.totalSizeMB = directoryStats.totalSizeMB.toString();
				stats.totalSizeGB = directoryStats.totalSizeGB;
				stats.fileCount = directoryStats.fileCount;
				if (directoryStats.files) {
					stats.files = directoryStats.files;
				}
			}
		} catch (error) {
			this.error("檢查日誌目錄容量錯誤", error);
		}
	}

	/**
	 * 清理舊日誌檔案（職權分離：完全依賴 FileSystemService）
	 * @param {number} daysToKeep - 保留天數
	 * @returns {Object} 清理結果統計
	 */
	cleanupOldLogs(daysToKeep = 7) {
		try {
			// 職權分離：統一使用 FileSystemService 的清理方法
			if (!fileSystem || typeof fileSystem.cleanupExpiredFiles !== "function") {
				this.error("FileSystemService 未正確初始化，無法清理日誌");
				return { cleanedCount: 0, freedSpaceMB: 0 };
			}

			// 清理前統計
			const statsBefore = this.getLogDirectoryStats();
			const sizeBeforeMB = parseFloat(statsBefore.totalSizeMB);

			const cutoffTime = daysToKeep * 24 * 60 * 60 * 1000; // 轉換為毫秒
			// 統一清理所有日誌相關檔案（包括 .log 和 .bak 備份檔案）
			const cleanedCount = fileSystem.cleanupExpiredFiles(this.logsDir, cutoffTime, /\.(log|bak)$/);

			// 清理後統計
			const statsAfter = this.getLogDirectoryStats();
			const sizeAfterMB = parseFloat(statsAfter.totalSizeMB);
			const freedSpaceMB = (sizeBeforeMB - sizeAfterMB).toFixed(2);

			if (cleanedCount > 0) {
				this.service(`清理了 ${cleanedCount} 個超過 ${daysToKeep} 天的舊日誌檔案，釋放空間 ${freedSpaceMB}MB`);
			}

			return {
				cleanedCount,
				freedSpaceMB: parseFloat(freedSpaceMB),
				sizeBeforeMB,
				sizeAfterMB,
				fileCountBefore: statsBefore.fileCount,
				fileCountAfter: statsAfter.fileCount
			};
		} catch (error) {
			this.error("清理舊日誌檔案錯誤", error);
			return { cleanedCount: 0, freedSpaceMB: 0 };
		}
	}

	/**
	 * 檢查日誌檔案大小並輪轉（統一使用 FileSystemService）
	 * @param {string} filename - 日誌檔案名稱
	 * @param {number} maxSize - 最大檔案大小（MB）
	 */
	rotateLogFile(filename, maxSize = 10) {
		try {
			if (!fileSystem || typeof fileSystem.fileExists !== "function") {
				throw new Error("FileSystemService 未正確初始化，無法執行日誌輪轉");
			}

			const filePath = path.join(this.logsDir, filename);

			if (!fileSystem.fileExists(filePath)) {
				return;
			}

			const stats = fileSystem.getFileStats(filePath);
			if (!stats) return;

			const fileSizeMB = stats.size / (1024 * 1024);

			if (fileSizeMB > maxSize) {
				// 先記錄：創建備份檔案
				const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
				const backupPath = path.join(this.logsDir, `${filename}.${timestamp}.bak`);

				// 讀取原檔案內容並寫入備份檔案
				const content = fileSystem.readFile(filePath);
				if (content && fileSystem.writeFile(backupPath, content)) {
					// 確認備份成功後，再清空原檔案（保持檔案存在以繼續寫入）
					fileSystem.writeFile(filePath, ""); // 清空檔案而不是刪除，保持檔案存在
					this.system(`日誌檔案已輪轉: ${filename} -> ${path.basename(backupPath)} (已備份並清空)`);
				}
			}
		} catch (error) {
			this.error("日誌輪轉錯誤", error);
		}
	}

	/**
	 * 生成清理統計報告
	 * @param {Object} cleanupResult - 清理結果
	 * @param {Object} directoryStats - 目錄統計資訊
	 */
	generateCleanupReport(cleanupResult, directoryStats) {
		const report = {
			timestamp: this.getTimestamp(),
			cleanup: {
				filesDeleted: cleanupResult.cleanedCount,
				spaceFreedMB: cleanupResult.freedSpaceMB,
				sizeBeforeMB: cleanupResult.sizeBeforeMB,
				sizeAfterMB: cleanupResult.sizeAfterMB,
				fileCountBefore: cleanupResult.fileCountBefore,
				fileCountAfter: cleanupResult.fileCountAfter
			},
			directory: {
				totalSizeMB: directoryStats.totalSizeMB,
				totalSizeGB: directoryStats.totalSizeGB,
				fileCount: directoryStats.fileCount
			}
		};

		// 輸出統計報告
		this.info(
			`📊 [清理統計] 刪除檔案: ${cleanupResult.cleanedCount} 個 | 釋放空間: ${cleanupResult.freedSpaceMB}MB | 當前目錄: ${directoryStats.totalSizeMB}MB (${directoryStats.fileCount} 個檔案)`
		);

		return report;
	}

	/**
	 * 統一日誌維護任務（整合輪轉與清理）
	 * 先執行輪轉檢查，再清理舊檔案，簡化為單一任務
	 */
	performLogMaintenance() {
		try {
			// 步驟 0: 檢查日誌目錄容量（監控告警）
			const directoryStats = this.getLogDirectoryStats();
			this.checkLogDirectoryCapacity(directoryStats);

			// 步驟 1: 檢查並執行日誌輪轉（如果檔案過大）
			this.rotateLogFile("app.log", 10);
			this.rotateLogFile("error.log", 5);

			// 步驟 2: 清理超過保留期限的舊日誌檔案（保留 1 年）
			const cleanupResult = this.cleanupOldLogs(365);

			// 步驟 3: 生成清理統計報告
			const updatedStats = this.getLogDirectoryStats();
			this.generateCleanupReport(cleanupResult, updatedStats);
		} catch (error) {
			this.error("執行日誌維護任務錯誤", error);
		}
	}

	/**
	 * 啟動統一日誌維護任務（精簡版：單一定時任務）
	 */
	scheduleLogMaintenance() {
		// 統一維護任務：每 24 小時執行一次
		// 執行順序：先輪轉（處理大檔案）→ 再清理（處理舊檔案）
		const maintenanceInterval = 24 * 60 * 60 * 1000; // 24 小時

		// 立即執行一次維護
		this.performLogMaintenance();

		// 設定定時維護
		setInterval(() => {
			this.performLogMaintenance();
		}, maintenanceInterval);

		this.service("日誌維護任務已啟動（每 24 小時執行一次：輪轉 → 清理）");
	}
}

module.exports = new LoggerService();
