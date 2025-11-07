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
		this.duplicateThreshold = 30000; // 30秒內不記錄相同訊息
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
		// 簡化重複檢查，只在短時間內（5秒）避免完全相同的訊息
		const now = Date.now();
		const lastLog = this.lastLogs.get(key);

		if (lastLog && now - lastLog.timestamp < 5000) {
			lastLog.count++;
			return true;
		}

		this.lastLogs.set(key, { timestamp: now, message, count: 1 });
		return false;
	}

	/**
	 * 寫入日誌檔案
	 * @param {string} filename - 日誌檔案名稱
	 * @param {string} message - 日誌訊息
	 * @param {string} level - 日誌等級
	 */
	writeLog(filename, message, level = "INFO") {
		try {
			const timestamp = this.getTimestamp();
			const logEntry = `[${timestamp}] [${level}] ${message}\n`;
			const logPath = path.join(this.logsDir, filename);

			// 檢查 fileSystem 是否可用
			if (fileSystem && typeof fileSystem.appendFile === "function") {
				fileSystem.appendFile(logPath, logEntry);
			} else {
				// 使用 Node.js 原生方法作為備用
				const fs = require("fs");
				fs.appendFileSync(logPath, logEntry);
			}
		} catch (error) {
			console.error("寫入日誌檔案錯誤:", error);
		}
	}

	/**
	 * 系統啟動日誌
	 * @param {string} message - 訊息
	 */
	system(message) {
		this.writeLog("app.log", message, "SYSTEM");
		console.log(`🚀 [系統] ${message}`);
	}

	/**
	 * 服務啟動日誌（簡化版）
	 * @param {string} message - 訊息
	 */
	startup(message) {
		// 只在控制台顯示，不寫入檔案（避免重複）
		console.log(`🚀 ${message}`);
	}

	/**
	 * 服務狀態日誌
	 * @param {string} message - 訊息
	 */
	service(message) {
		// 服務狀態記錄到 app.log
		this.writeLog("app.log", message, "SERVICE");
		console.log(`⚙️ [服務] ${message}`);
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
	 * HCP 事件日誌
	 * @param {string} message - 訊息
	 * @param {string} eventId - 事件ID（可選，用於更精確的去重）
	 */
	hcp(message, eventId = null) {
		// 簡化 HCP 日誌，重複處理由事件隊列層負責
		this.writeLog("app.log", message, "HCP");
		console.log(`📨 [HCP] ${message}`);
	}

	/**
	 * HTTP 錯誤日誌（404, 500 等）
	 * @param {string} message - 錯誤訊息
	 * @param {number} statusCode - HTTP 狀態碼
	 */
	httpError(message, statusCode = 404) {
		const errorMessage = `HTTP ${statusCode}: ${message}`;
		// 所有 HTTP 錯誤都記錄到錯誤日誌
		this.error(errorMessage);
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
	 * 安全日誌（記錄到 error.log）
	 * @param {string} message - 安全相關訊息
	 */
	security(message) {
		// 安全相關事件記錄到 error.log
		this.writeLog("error.log", message, "SECURITY");
		console.warn(`🔒 [安全] ${message}`);
	}

	/**
	 * 性能日誌（記錄到 app.log）
	 * @param {string} message - 性能相關訊息
	 */
	performance(message) {
		// 性能相關記錄到 app.log
		this.writeLog("app.log", message, "PERF");
		console.log(`⚡ [性能] ${message}`);
	}

	/**
	 * 記錄新用戶活動到用戶活動日誌
	 * @param {string} id - 用戶/群組 ID
	 * @param {string} type - 類型
	 * @param {string} action - 動作
	 */
	logNewUserActivity(id, type, action = "加入") {
		// 記錄到 app.log
		this.user(`${action} ${type} ${id} 已記錄，等待管理員審核`);
	}

	/**
	 * 獲取日誌檔案列表
	 * @returns {Array} 日誌檔案列表
	 */
	getLogFiles() {
		try {
			// 檢查 fileSystem 是否可用
			if (fileSystem && typeof fileSystem.getDirectoryFiles === "function") {
				const files = fileSystem.getDirectoryFiles(this.logsDir);
				return files.filter((file) => file.endsWith(".log"));
			} else {
				// 使用 Node.js 原生方法作為備用
				const fs = require("fs");
				const files = fs.readdirSync(this.logsDir);
				return files.filter((file) => file.endsWith(".log"));
			}
		} catch (error) {
			this.error("獲取日誌檔案列表錯誤", error);
			return [];
		}
	}

	/**
	 * 清理舊日誌檔案（職權分離：完全依賴 FileSystemService）
	 * @param {number} daysToKeep - 保留天數
	 */
	cleanupOldLogs(daysToKeep = 7) {
		try {
			// 職權分離：統一使用 FileSystemService 的清理方法
			if (!fileSystem || typeof fileSystem.cleanupExpiredFiles !== "function") {
				this.error("FileSystemService 未正確初始化，無法清理日誌");
				return 0;
			}

			const cutoffTime = daysToKeep * 24 * 60 * 60 * 1000; // 轉換為毫秒
			const cleanedCount = fileSystem.cleanupExpiredFiles(this.logsDir, cutoffTime, /\.log$/);

			if (cleanedCount > 0) {
				this.service(`清理了 ${cleanedCount} 個超過 ${daysToKeep} 天的舊日誌檔案`);
			}

			return cleanedCount;
		} catch (error) {
			this.error("清理舊日誌檔案錯誤", error);
			return 0;
		}
	}

	/**
	 * 檢查日誌檔案大小並輪轉
	 * @param {string} filename - 日誌檔案名稱
	 * @param {number} maxSize - 最大檔案大小（MB）
	 */
	rotateLogFile(filename, maxSize = 10) {
		try {
			const filePath = path.join(this.logsDir, filename);

			// 檢查 fileSystem 是否可用
			if (fileSystem && typeof fileSystem.fileExists === "function") {
				if (!fileSystem.fileExists(filePath)) {
					return;
				}

				const stats = fileSystem.getFileStats(filePath);
				if (!stats) return;

				const fileSizeMB = stats.size / (1024 * 1024);

				if (fileSizeMB > maxSize) {
					// 創建備份檔案
					const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
					const backupPath = path.join(this.logsDir, `${filename}.${timestamp}.bak`);

					// 讀取原檔案內容並寫入備份檔案
					const content = fileSystem.readFile(filePath);
					if (content && fileSystem.writeFile(backupPath, content)) {
						fileSystem.deleteFile(filePath);
						this.system(`日誌檔案已輪轉: ${filename} -> ${path.basename(backupPath)}`);
					}
				}
			} else {
				// 使用 Node.js 原生方法作為備用
				const fs = require("fs");
				if (!fs.existsSync(filePath)) {
					return;
				}

				const stats = fs.statSync(filePath);
				const fileSizeMB = stats.size / (1024 * 1024);

				if (fileSizeMB > maxSize) {
					// 創建備份檔案
					const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
					const backupPath = path.join(this.logsDir, `${filename}.${timestamp}.bak`);

					// 讀取原檔案內容並寫入備份檔案
					const content = fs.readFileSync(filePath);
					fs.writeFileSync(backupPath, content);
					fs.unlinkSync(filePath);
					this.system(`日誌檔案已輪轉: ${filename} -> ${path.basename(backupPath)}`);
				}
			}
		} catch (error) {
			this.error("日誌輪轉錯誤", error);
		}
	}

	/**
	 * 定期清理和輪轉日誌（職權分離：使用 FileSystemService 管理清理任務）
	 */
	scheduleLogMaintenance() {
		// 每小時檢查一次日誌輪轉（輪轉是 LoggerService 的職責）
		setInterval(() => {
			this.rotateLogFile("app.log", 10);
			this.rotateLogFile("error.log", 5);
		}, 60 * 60 * 1000); // 1小時

		// 職權分離：使用 FileSystemService 啟動日誌清理任務（統一管理）
		if (fileSystem && typeof fileSystem.startScheduledCleanupTask === "function") {
			// 每天清理一次舊日誌，保留7天
			const daysToKeep = 7;
			const maxAgeMinutes = daysToKeep * 24 * 60; // 7天 = 10080分鐘
			fileSystem.startScheduledCleanupTask(
				"log-files",
				this.logsDir,
				24 * 60, // 每24小時（1440分鐘）檢查一次
				maxAgeMinutes,
				/\.log$/,
				"日誌檔案"
			);
		} else {
			// 備用方案：如果 FileSystemService 不可用，使用舊方法
			setInterval(() => {
				this.cleanupOldLogs(7);
			}, 24 * 60 * 60 * 1000); // 24小時
		}
	}
}

module.exports = new LoggerService();
