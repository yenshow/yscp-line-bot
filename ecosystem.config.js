// 確保載入環境變數
require("dotenv").config();

module.exports = {
	apps: [
		{
			name: "yscp-line-bot-backend",
			script: "app.js",
			cwd: __dirname,
			instances: 1,
			autorestart: true,
			watch: false,
			max_memory_restart: "1G",
			env: {
				NODE_ENV: "development",
				// PORT 從 .env 讀取，預設值在 config.js 中定義
				TZ: "Asia/Taipei"
			},
			env_production: {
				NODE_ENV: "production",
				// PORT 從 .env 讀取，預設值在 config.js 中定義
				TZ: "Asia/Taipei"
			},
			// 日誌配置 - 分離 stdout 和 stderr
			error_file: "./logs/error.log", // 錯誤日誌
			out_file: "./logs/app.log", // 標準輸出日誌
			time: true,
			// 自動重啟配置
			min_uptime: "10s",
			max_restarts: 3, // 減少重啟次數，避免端口被佔用時一直重啟
			restart_delay: 10000, // 增加重啟延遲，給端口釋放更多時間
			// 健康檢查
			health_check_grace_period: 3000,
			// 進程管理 - 優化重啟配置
			kill_timeout: 8000,
			listen_timeout: 5000,
			// 強制停止配置
			force: true,
			// 停止等待時間
			stop_timeout: 8000,
			// 日誌配置 - 時間格式優化
			log_date_format: "YYYY-MM-DD HH:mm:ss",
			merge_logs: true,
			// 日誌輪轉 - 避免檔案過大
			log_type: "text",
			// 日誌大小限制
			max_log_size: "10M",
			// 保留日誌數量
			retain_logs: 5
		},
		// Ngrok 隧道（僅在有 authtoken 時啟動）
		...(function () {
			try {
				const ngrokService = require("./services/ngrokService");

				// 如果啟用了 ngrok 但還沒配置，嘗試自動配置
				if (ngrokService.enabled && !ngrokService.isConfigured()) {
					ngrokService.configureAuthtoken();
				}

				// 檢查是否應該啟動 ngrok
				if (ngrokService.shouldStart()) {
					const ngrokPath = ngrokService.getNgrokPath();
					if (!ngrokPath || ngrokPath === "ngrok") {
						return [];
					}

					// 從環境變數讀取端口，預設為 6000（與 config.js 保持一致）
					const port = process.env.PORT || 6000;
				return [
						{
							name: "ngrok-tunnel",
							script: ngrokPath,
							args: `http ${port} --log=stdout`,
							cwd: __dirname,
							instances: 1,
							autorestart: true,
							watch: false,
							env: {
								NODE_ENV: "development",
								TZ: "Asia/Taipei"
							},
							// ngrok 專用配置
							min_uptime: "5s",
							max_restarts: 5,
							restart_delay: 2000,
							// 進程管理
							kill_timeout: 5000,
							listen_timeout: 3000,
							force: true,
							stop_timeout: 5000,
							// 日誌配置 - 整合到主要日誌檔案
							error_file: "./logs/error.log",
							out_file: "./logs/app.log",
							log_date_format: "YYYY-MM-DD HH:mm:ss",
							time: true,
							merge_logs: true
						}
					];
				}
			} catch (error) {
				// 如果無法載入 ngrokService，不啟動 ngrok
				console.warn("⚠️  無法載入 ngrokService，跳過 ngrok 啟動:", error.message);
			}
			return [];
		})()
	]
};
