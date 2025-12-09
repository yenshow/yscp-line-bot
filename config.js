require("dotenv").config();

const config = {
	// YSCP API 配置
	hcp: {
		host: process.env.YSCP_HOST || "https://yscp.yenshow.com",
		ak: process.env.YSCP_AK,
		sk: process.env.YSCP_SK,
		apiVersion: process.env.YSCP_API_VER || "v1"
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
		// YSCP 事件回呼地址 (需要設定為您的伺服器公開 URL)
		webhookUrl: process.env.WEBHOOK_URL,
		// 事件訂閱驗證 Token
		eventToken: process.env.EVENT_TOKEN || "your_unique_verification_token"
	}
};

module.exports = config;
