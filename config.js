require("dotenv").config();

const config = {
	// HCP API 配置
	hcp: {
		host: process.env.HCP_HOST || "https://yscp.yenshow.com",
		ak: process.env.HCP_AK,
		sk: process.env.HCP_SK,
		apiVersion: process.env.HCP_API_VER || "v1"
	},

	// Line Bot 配置
	line: {
		channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
		channelSecret: process.env.LINE_CHANNEL_SECRET
	},

	// 伺服器配置
	server: {
		port: process.env.PORT || 6000,
		env: "development",
		// HCP 事件回呼地址 (需要設定為您的伺服器公開 URL)
		webhookUrl: process.env.WEBHOOK_URL,
		// 事件訂閱驗證 Token
		eventToken: process.env.EVENT_TOKEN || "your_unique_verification_token"
	}
};

module.exports = config;
