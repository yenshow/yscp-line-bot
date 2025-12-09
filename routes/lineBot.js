/**
 * Line Bot 路由 - 專注於 Line Bot 核心功能
 * 只處理 Line Bot Webhook 和基本測試功能
 */

const express = require("express");
const line = require("@line/bot-sdk");
const config = require("../config");
const LineBotController = require("../controllers/lineBotController");
const LineBotManager = require("../services/lineBotService");

const router = express.Router();
const lineBotController = new LineBotController();

// Line Bot 中間件（如果已配置）
let lineMiddleware = null;
if (LineBotManager.isServiceConfigured()) {
	lineMiddleware = line.middleware({
		channelAccessToken: config.line.channelAccessToken,
		channelSecret: config.line.channelSecret
	});
}

// ========== Line Bot Webhook 端點 ==========

/**
 * Line Bot Webhook 端點
 * POST / - 處理 LINE Bot Webhook 事件
 */
router.post("/", async (req, res, next) => {
	// 處理 LINE Bot Webhook 事件
	if (lineMiddleware) {
		return lineMiddleware(req, res, (err) => {
			if (err) return next(err);
			lineBotController.handleWebhook(req, res).catch(next);
		});
	} else {
		lineBotController.handleWebhook(req, res).catch(next);
	}
});

/**
 * YSCP 事件接收端點（Webhook）- 用於 Line Bot 通知
 * POST /hcp-event-receiver (保持向後兼容，實際使用 yscp-event-receiver)
 */
router.post("/hcp-event-receiver", (req, res) => {
	lineBotController.handleEventReceiver(req, res);
});

/**
 * Line Bot Webhook 端點
 * GET / - Line Platform 驗證用
 */
router.get("/", (req, res) => lineBotController.getStatus(req, res));

// ========== 測試端點 ==========

/**
 * 測試端點
 * GET /test
 */
router.get("/test", (req, res) => lineBotController.test(req, res));

module.exports = router;
