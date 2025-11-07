/**
 * 簡化配置管理服務
 * 提供基本的 JSON 配置檔案讀寫功能
 */

const path = require("path");
const fileSystem = require("./fileSystemService");
const LoggerService = require("./loggerService");

class ConfigService {
	constructor() {
		this.dataDir = fileSystem.getDirectory("data");
	}

	/**
	 * 載入配置檔案
	 * @param {string} filename - 檔案名稱
	 * @param {Object} defaultValue - 預設值
	 * @returns {Object} 配置資料
	 */
	loadConfig(filename, defaultValue = {}) {
		try {
			const filePath = path.join(this.dataDir, filename);

			if (fileSystem.fileExists(filePath)) {
				const data = fileSystem.readFile(filePath);
				return JSON.parse(data);
			} else {
				// 檔案不存在，使用預設值並保存
				this.saveConfig(filename, defaultValue);
				return defaultValue;
			}
		} catch (error) {
			LoggerService.error(`載入配置失敗 ${filename}`, error);
			return defaultValue;
		}
	}

	/**
	 * 保存配置檔案
	 * @param {string} filename - 檔案名稱
	 * @param {Object} data - 配置資料
	 * @returns {boolean} 是否成功
	 */
	saveConfig(filename, data) {
		try {
			const filePath = path.join(this.dataDir, filename);

			// 添加時間戳
			const configWithTimestamp = {
				...data,
				lastUpdated: new Date().toISOString()
			};

			return fileSystem.writeFile(filePath, JSON.stringify(configWithTimestamp, null, 2));
		} catch (error) {
			LoggerService.error(`保存配置失敗 ${filename}`, error);
			return false;
		}
	}

	/**
	 * 獲取快取的配置（向後兼容）
	 * @param {string} filename - 檔案名稱
	 * @returns {Object|null} 配置資料
	 */
	getCachedConfig(filename) {
		return this.loadConfig(filename);
	}

	/**
	 * 檢查配置是否有更新（向後兼容）
	 * @param {string} filename - 檔案名稱
	 * @returns {boolean} 是否有更新
	 */
	isConfigUpdated(filename) {
		// 簡化版本：總是返回 true，強制重新載入
		return true;
	}

	/**
	 * 獲取所有監聽的配置檔案（向後兼容）
	 * @returns {Array} 配置檔案列表
	 */
	getWatchedConfigs() {
		return [];
	}
}

// 導出單例實例
module.exports = new ConfigService();
