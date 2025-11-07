#!/usr/bin/env node

const LoggerService = require("../services/loggerService");

/**
 * 日誌清理腳本
 * 清理超過指定天數的舊日誌檔案
 */

async function main() {
	const args = process.argv.slice(2);
	const daysToKeep = parseInt(args[0]) || 7; // 預設保留 7 天

	console.log("🧹 日誌清理工具");
	console.log("================\n");

	try {
		// 獲取日誌檔案列表
		const logFiles = LoggerService.getLogFiles();

		if (logFiles.length === 0) {
			console.log("✅ 沒有找到日誌檔案");
			return;
		}

		console.log(`📋 找到 ${logFiles.length} 個日誌檔案`);

		// 執行清理
		const cleanedCount = LoggerService.cleanupOldLogs(daysToKeep);

		console.log(`✅ 已清理 ${cleanedCount} 個超過 ${daysToKeep} 天的日誌檔案`);
	} catch (error) {
		console.error("❌ 日誌清理失敗:", error.message);
		process.exit(1);
	}
}

main().catch(console.error);
