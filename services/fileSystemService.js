/**
 * 統一檔案系統服務
 * 整合目錄管理、檔案操作、檔案監聽等功能
 */

const fs = require("fs");
const path = require("path");
const config = require("../config");

class FileSystemService {
	constructor() {
		this.baseDir = path.join(__dirname, "..");
		this.directories = {
			data: path.join(this.baseDir, "data"),
			logs: path.join(this.baseDir, "logs"),
			temp: path.join(this.baseDir, "temp")
		};

		// 檔案監聽器管理
		this.watchers = new Map();

		// 定時清理任務管理（職權分離：統一管理所有清理任務）
		this.cleanupTasks = new Map(); // Map<taskId, intervalId>

		this.ensureAllDirectories();
	}

	/**
	 * 確保所有必要目錄存在
	 */
	ensureAllDirectories() {
		Object.entries(this.directories).forEach(([name, dirPath]) => {
			this.ensureDirectory(dirPath, name);
		});
	}

	/**
	 * 確保指定目錄存在
	 * @param {string} dirPath - 目錄路徑
	 * @param {string} dirName - 目錄名稱（用於日誌）
	 */
	ensureDirectory(dirPath, dirName = "目錄") {
		try {
			if (!fs.existsSync(dirPath)) {
				fs.mkdirSync(dirPath, { recursive: true });
			}
		} catch (error) {
			console.error(`❌ 創建${dirName}目錄失敗:`, error.message);
		}
	}

	/**
	 * 獲取目錄路徑
	 * @param {string} dirName - 目錄名稱 (data, logs, temp)
	 * @returns {string} 目錄路徑
	 */
	getDirectory(dirName) {
		return this.directories[dirName] || null;
	}

	/**
	 * 檢查檔案是否存在
	 * @param {string} filePath - 檔案路徑
	 * @returns {boolean} 檔案是否存在
	 */
	fileExists(filePath) {
		return fs.existsSync(filePath);
	}

	/**
	 * 讀取檔案內容
	 * @param {string} filePath - 檔案路徑
	 * @param {string} encoding - 編碼格式
	 * @returns {string|null} 檔案內容
	 */
	readFile(filePath, encoding = "utf8") {
		try {
			if (this.fileExists(filePath)) {
				return fs.readFileSync(filePath, encoding);
			}
			return null;
		} catch (error) {
			console.error(`❌ 讀取檔案失敗 ${filePath}:`, error.message);
			return null;
		}
	}

	/**
	 * 寫入檔案內容
	 * @param {string} filePath - 檔案路徑
	 * @param {string} content - 檔案內容
	 * @param {string} encoding - 編碼格式
	 * @returns {boolean} 是否成功
	 */
	writeFile(filePath, content, encoding = "utf8") {
		try {
			// 確保目錄存在
			const dirPath = path.dirname(filePath);
			this.ensureDirectory(dirPath);

			fs.writeFileSync(filePath, content, encoding);
			return true;
		} catch (error) {
			console.error(`❌ 寫入檔案失敗 ${filePath}:`, error.message);
			return false;
		}
	}

	/**
	 * 追加內容到檔案
	 * @param {string} filePath - 檔案路徑
	 * @param {string} content - 要追加的內容
	 * @param {string} encoding - 編碼格式
	 * @returns {boolean} 是否成功
	 */
	appendFile(filePath, content, encoding = "utf8") {
		try {
			// 確保目錄存在
			const dirPath = path.dirname(filePath);
			this.ensureDirectory(dirPath);

			fs.appendFileSync(filePath, content, encoding);
			return true;
		} catch (error) {
			console.error(`❌ 追加檔案失敗 ${filePath}:`, error.message);
			return false;
		}
	}

	/**
	 * 刪除檔案
	 * @param {string} filePath - 檔案路徑
	 * @returns {boolean} 是否成功
	 */
	deleteFile(filePath) {
		try {
			if (this.fileExists(filePath)) {
				fs.unlinkSync(filePath);
				return true;
			}
			return false;
		} catch (error) {
			console.error(`❌ 刪除檔案失敗 ${filePath}:`, error.message);
			return false;
		}
	}

	/**
	 * 獲取檔案狀態
	 * @param {string} filePath - 檔案路徑
	 * @returns {Object|null} 檔案狀態資訊
	 */
	getFileStats(filePath) {
		try {
			if (this.fileExists(filePath)) {
				return fs.statSync(filePath);
			}
			return null;
		} catch (error) {
			console.error(`❌ 獲取檔案狀態失敗 ${filePath}:`, error.message);
			return null;
		}
	}

	/**
	 * 獲取目錄中的所有檔案
	 * @param {string} dirPath - 目錄路徑
	 * @returns {Array} 檔案列表
	 */
	getDirectoryFiles(dirPath) {
		try {
			if (this.fileExists(dirPath)) {
				return fs.readdirSync(dirPath);
			}
			return [];
		} catch (error) {
			console.error(`❌ 獲取目錄檔案失敗 ${dirPath}:`, error.message);
			return [];
		}
	}

	/**
	 * 清理過期檔案
	 * @param {string} dirPath - 目錄路徑
	 * @param {number} maxAge - 最大年齡（毫秒）
	 * @param {string} pattern - 檔案名稱模式（可選）
	 * @returns {number} 清理的檔案數量
	 */
	cleanupExpiredFiles(dirPath, maxAge, pattern = null) {
		try {
			const files = this.getDirectoryFiles(dirPath);
			const now = Date.now();
			let cleanedCount = 0;

			files.forEach((filename) => {
				// 如果有模式限制，檢查檔案名稱
				if (pattern && !filename.match(pattern)) {
					return;
				}

				const filePath = path.join(dirPath, filename);
				const stats = this.getFileStats(filePath);

				if (stats && now - stats.mtime.getTime() > maxAge) {
					if (this.deleteFile(filePath)) {
						cleanedCount++;
					}
				}
			});

			// 清理完成，不記錄日誌
			return cleanedCount;
		} catch (error) {
			console.error(`❌ 清理檔案失敗 ${dirPath}:`, error.message);
			return 0;
		}
	}

	/**
	 * 獲取目錄狀態
	 * @param {string} dirName - 目錄名稱 (data, logs, temp)
	 * @returns {Object} 目錄狀態
	 */
	getDirectoryStatus(dirName) {
		const dirPath = this.getDirectory(dirName);
		if (!dirPath) {
			return { exists: false, error: "未知目錄" };
		}

		try {
			const files = this.getDirectoryFiles(dirPath);
			let totalSize = 0;

			files.forEach((filename) => {
				const filePath = path.join(dirPath, filename);
				const stats = this.getFileStats(filePath);
				if (stats && stats.isFile()) {
					totalSize += stats.size;
				}
			});

			return {
				exists: true,
				path: dirPath,
				fileCount: files.length,
				totalSize: totalSize,
				totalSizeMB: Math.round((totalSize / 1024 / 1024) * 100) / 100
			};
		} catch (error) {
			return {
				exists: false,
				error: error.message,
				path: dirPath
			};
		}
	}

	/**
	 * 獲取所有目錄狀態
	 * @returns {Object} 所有目錄狀態
	 */
	getAllDirectoryStatus() {
		const status = {};
		Object.keys(this.directories).forEach((dirName) => {
			status[dirName] = this.getDirectoryStatus(dirName);
		});
		return status;
	}

	// ========== 檔案監聽功能 ==========

	/**
	 * 監聽檔案變更
	 * @param {string} filePath - 檔案路徑
	 * @param {Function} callback - 變更回調函數
	 * @param {string} description - 檔案描述
	 */
	watchFile(filePath, callback, description = "檔案") {
		try {
			const fullPath = path.resolve(filePath);

			if (!this.fileExists(fullPath)) {
				console.warn(`⚠️ 監聽檔案不存在: ${fullPath}`);
				return;
			}

			// 移除已存在的監聽器
			if (this.watchers.has(fullPath)) {
				this.unwatchFile(fullPath);
			}

			fs.watchFile(fullPath, (curr, prev) => {
				// 檢查檔案是否真的被修改
				if (curr.mtime.getTime() !== prev.mtime.getTime()) {
					console.log(`📝 檢測到 ${description} 變更，重新載入配置...`);
					callback();
				}
			});

			this.watchers.set(fullPath, { callback, description });
		} catch (error) {
			console.error(`❌ 設置檔案監聽失敗: ${error.message}`);
		}
	}

	/**
	 * 停止監聽檔案
	 * @param {string} filePath - 檔案路徑
	 */
	unwatchFile(filePath) {
		const fullPath = path.resolve(filePath);
		const watcher = this.watchers.get(fullPath);

		if (watcher) {
			fs.unwatchFile(fullPath);
			this.watchers.delete(fullPath);
		}
	}

	/**
	 * 停止所有監聽器
	 */
	unwatchAll() {
		for (const [filePath, watcher] of this.watchers) {
			fs.unwatchFile(filePath);
		}
		this.watchers.clear();
	}

	/**
	 * 獲取監聽狀態
	 */
	getWatchStatus() {
		const status = [];
		for (const [filePath, watcher] of this.watchers) {
			status.push({
				file: path.basename(filePath),
				description: watcher.description,
				path: filePath
			});
		}
		return status;
	}

	// ========== 臨時檔案管理功能 ==========

	/**
	 * 保存 base64 圖片為臨時文件
	 * @param {string} base64Data - Base64 編碼的圖片數據
	 * @param {string} cameraId - 攝影機 ID
	 * @returns {string|null} 圖片 URL 或 null
	 */
	saveBase64Image(base64Data, cameraId) {
		try {
			const timestamp = Date.now();
			const filename = `camera_${cameraId}_${timestamp}.jpg`;
			const filepath = path.join(this.directories.temp, filename);

			const base64String = base64Data.replace(/^data:image\/[a-z]+;base64,/, "");

			// 使用統一檔案系統服務寫入檔案
			const success = this.writeFile(filepath, base64String, "base64");
			if (!success) return null;

			// 檢查是否有設置公網可訪問的 URL
			const baseUrl = process.env.NGROK_URL || process.env.PUBLIC_URL || `http://localhost:${config.server.port}`;
			const imageUrl = `${baseUrl}/temp/${filename}`;

			// 如果使用 localhost，記錄警告
			if (baseUrl.includes("localhost")) {
				console.warn("⚠️ 警告：使用 localhost URL，Line Bot 可能無法訪問圖片。請設置 NGROK_URL 或 PUBLIC_URL 環境變數。");
			}

			// 檔案將由定時清理服務自動管理
			return imageUrl;
		} catch (error) {
			console.error("❌ 保存 base64 圖片失敗:", error.message);
			return null;
		}
	}

	/**
	 * 獲取臨時文件的 URL
	 * @param {string} filename - 文件名稱
	 * @returns {string} 完整的文件 URL
	 */
	getTempFileUrl(filename) {
		const baseUrl = process.env.NGROK_URL || `http://localhost:${config.server.port}`;
		return `${baseUrl}/temp/${filename}`;
	}

	// ========== 定時清理功能 ==========

	/**
	 * 啟動定時清理任務（通用方法，職權分離）
	 * @param {string} taskId - 任務唯一標識
	 * @param {string} dirPath - 要清理的目錄路徑
	 * @param {number} intervalMinutes - 清理間隔（分鐘）
	 * @param {number} maxAgeMinutes - 檔案最大保存時間（分鐘）
	 * @param {RegExp|null} filePattern - 檔案名稱模式（可選，如 /\.(jpg|jpeg|png|gif)$/i）
	 * @param {string} description - 任務描述（用於日誌）
	 * @returns {string} 任務 ID
	 */
	startScheduledCleanupTask(taskId, dirPath, intervalMinutes, maxAgeMinutes, filePattern = null, description = "檔案") {
		// 停止已存在的任務（如果有的話）
		this.stopScheduledCleanupTask(taskId);

		// 立即執行一次清理
		this.performScheduledCleanup(dirPath, maxAgeMinutes, filePattern, description);

		// 設定定時清理
		const intervalMs = intervalMinutes * 60 * 1000;
		const intervalId = setInterval(() => {
			this.performScheduledCleanup(dirPath, maxAgeMinutes, filePattern, description);
		}, intervalMs);

		this.cleanupTasks.set(taskId, intervalId);

		const readableRetention = maxAgeMinutes >= 1440 ? `${Math.round(maxAgeMinutes / 1440)} 天` : `${maxAgeMinutes} 分鐘`;
		console.log(`🧹 [${taskId}] 定時清理任務已啟動 - 每 ${intervalMinutes} 分鐘清理一次，保留 ${readableRetention} 內的 ${description}`);

		return taskId;
	}

	/**
	 * 停止定時清理任務
	 * @param {string} taskId - 任務唯一標識
	 */
	stopScheduledCleanupTask(taskId) {
		const intervalId = this.cleanupTasks.get(taskId);
		if (intervalId) {
			clearInterval(intervalId);
			this.cleanupTasks.delete(taskId);
			console.log(`🛑 [${taskId}] 定時清理任務已停止`);
		}
	}

	/**
	 * 停止所有清理任務
	 */
	stopAllCleanupTasks() {
		for (const [taskId, intervalId] of this.cleanupTasks) {
			clearInterval(intervalId);
		}
		this.cleanupTasks.clear();
		console.log("🛑 所有定時清理任務已停止");
	}

	/**
	 * 執行定時清理（通用方法，職權分離）
	 * @param {string} dirPath - 目錄路徑
	 * @param {number} maxAgeMinutes - 檔案最大保存時間（分鐘）
	 * @param {RegExp|null} filePattern - 檔案名稱模式（可選）
	 * @param {string} description - 描述（用於日誌）
	 * @returns {number} 清理的檔案數量
	 */
	performScheduledCleanup(dirPath, maxAgeMinutes, filePattern = null, description = "檔案") {
		try {
			const maxAge = maxAgeMinutes * 60 * 1000; // 轉換為毫秒

			// 檢查目錄容量（僅對 temp 目錄）
			if (dirPath === this.directories.temp) {
				this.checkDirectoryCapacity(dirPath);
			}

			const cleanedCount = this.cleanupExpiredFiles(dirPath, maxAge, filePattern);

			if (cleanedCount > 0) {
				console.log(`🧹 [${description}] 定時清理完成 - 刪除了 ${cleanedCount} 個過期檔案`);
			}

			return cleanedCount;
		} catch (error) {
			console.error(`❌ [${description}] 定時清理執行失敗:`, error.message);
			return 0;
		}
	}

	/**
	 * 啟動臨時檔案清理（便捷方法，職權分離）
	 * @param {number} intervalMinutes - 清理間隔（分鐘）
	 * @param {number} maxAgeMinutes - 檔案最大保存時間（分鐘）
	 */
	startScheduledCleanup(intervalMinutes = 30, maxAgeMinutes = 10080) {
		return this.startScheduledCleanupTask("temp-files", this.directories.temp, intervalMinutes, maxAgeMinutes, /\.(jpg|jpeg|png|gif)$/i, "臨時圖片");
	}

	/**
	 * 停止臨時檔案清理（便捷方法）
	 */
	stopScheduledCleanup() {
		this.stopScheduledCleanupTask("temp-files");
	}

	/**
	 * 檢查目錄容量並發出警告
	 * @param {string} dirPath - 目錄路徑
	 */
	checkDirectoryCapacity(dirPath) {
		try {
			const fs = require("fs");
			if (!fs.existsSync(dirPath)) return;

			// 計算目錄總大小
			let totalSize = 0;
			let fileCount = 0;
			const files = fs.readdirSync(dirPath);

			files.forEach((file) => {
				const filePath = path.join(dirPath, file);
				const stats = fs.statSync(filePath);
				if (stats.isFile()) {
					totalSize += stats.size;
					fileCount++;
				}
			});

			const totalSizeMB = totalSize / (1024 * 1024);
			const totalSizeGB = totalSizeMB / 1024;

			// 容量警告閾值
			const warningThresholdMB = 500; // 500MB 警告
			const criticalThresholdMB = 1000; // 1GB 嚴重警告

			if (totalSizeMB > criticalThresholdMB) {
				console.warn(`🚨 嚴重警告: ${dirPath} 目錄容量已達 ${totalSizeMB.toFixed(2)}MB (${fileCount} 個檔案)`);
			} else if (totalSizeMB > warningThresholdMB) {
				console.warn(`⚠️ 容量警告: ${dirPath} 目錄容量已達 ${totalSizeMB.toFixed(2)}MB (${fileCount} 個檔案)`);
			}

			// 記錄容量資訊（每小時記錄一次）
			if (Date.now() % (60 * 60 * 1000) < 30000) {
				// 每小時的前30秒內記錄
				console.log(`📊 目錄容量: ${dirPath} - ${totalSizeMB.toFixed(2)}MB (${fileCount} 個檔案)`);
			}
		} catch (error) {
			console.error("❌ 檢查目錄容量失敗:", error.message);
		}
	}

	/**
	 * 手動清理臨時檔案（整合原 cleanup-temp.js 功能）
	 * @param {number} maxAgeMinutes - 檔案最大保存時間（分鐘）
	 * @returns {Object} 清理結果
	 */
	manualCleanupTempFiles(maxAgeMinutes = 10) {
		try {
			const tempDir = this.directories.temp;

			// 檢查 temp 目錄是否存在
			if (!this.fileExists(tempDir)) {
				console.log("📁 temp 目錄不存在，無需清理");
				return { success: true, deletedCount: 0, totalSize: 0 };
			}

			const files = this.getDirectoryFiles(tempDir);
			const now = Date.now();
			let deletedCount = 0;
			let totalSize = 0;

			console.log(`🧹 開始手動清理 temp 目錄: ${tempDir}`);
			console.log(`⏰ 當前時間: ${new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}`);
			const readableRetention = maxAgeMinutes >= 1440 ? `${Math.round(maxAgeMinutes / 1440)} 天` : `${maxAgeMinutes} 分鐘`;
			console.log(`📅 最大保存時間: ${readableRetention}`);

			files.forEach((filename) => {
				const filePath = path.join(tempDir, filename);
				const stats = this.getFileStats(filePath);

				if (!stats) return;

				const fileAge = now - stats.mtime.getTime();
				const ageMinutes = Math.floor(fileAge / (1000 * 60));

				// 只處理圖片文件
				if (filename.match(/\.(jpg|jpeg|png|gif)$/i)) {
					totalSize += stats.size;

					if (ageMinutes > maxAgeMinutes) {
						if (this.deleteFile(filePath)) {
							console.log(`🗑️  已刪除: ${filename} (${ageMinutes} 分鐘前)`);
							deletedCount++;
						} else {
							console.error(`❌ 刪除失敗: ${filename}`);
						}
					} else {
						console.log(`⏳ 保留: ${filename} (${ageMinutes} 分鐘前)`);
					}
				}
			});

			console.log(`\n📊 清理結果:`);
			console.log(`   - 刪除文件: ${deletedCount} 個`);
			console.log(`   - 總大小: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
			console.log(`✅ 手動清理完成`);

			return {
				success: true,
				deletedCount,
				totalSize,
				totalSizeMB: Math.round((totalSize / 1024 / 1024) * 100) / 100
			};
		} catch (error) {
			console.error("❌ 手動清理過程發生錯誤:", error);
			return { success: false, error: error.message };
		}
	}

	/**
	 * 獲取清理服務狀態
	 * @returns {Object} 清理服務狀態
	 */
	getCleanupStatus() {
		return {
			isRunning: !!this.cleanupInterval,
			tempDir: this.directories.temp,
			status: this.getDirectoryStatus("temp")
		};
	}
}

// 導出單例實例
module.exports = new FileSystemService();
