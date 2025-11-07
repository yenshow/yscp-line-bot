module.exports = {
	apps: [
		{
			name: "hcp-line-bot-backend",
			script: "app.js",
			cwd: __dirname,
			instances: 1,
			autorestart: true,
			watch: false,
			max_memory_restart: "1G",
			env: {
				NODE_ENV: "development",
				PORT: 6000,
				TZ: "Asia/Taipei"
			},
			env_production: {
				NODE_ENV: "production",
				PORT: 6000,
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
		{
			name: "ngrok-tunnel",
			script: "ngrok",
			args: "http 6000 --log=stdout",
			cwd: "/Users/caijunyao/Desktop/yscp line bot/backend",
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
			log_file: "/dev/null",
			time: false,
			merge_logs: false
		}
	]
};
