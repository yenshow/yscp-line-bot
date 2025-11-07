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
 * GET / - Line Platform 驗證用
 * POST / - 接收 Line Bot 事件
 */
router.get("/", (req, res) => lineBotController.getStatus(req, res));

router.post("/", async (req, res, next) => {
	if (lineMiddleware) {
		return lineMiddleware(req, res, (err) => {
			if (err) return next(err);
			lineBotController.handleWebhook(req, res).catch(next);
		});
	} else {
		lineBotController.handleWebhook(req, res).catch(next);
	}
});

// ========== 測試端點 ==========

/**
 * 測試端點
 * GET /test
 */
router.get("/test", (req, res) => lineBotController.test(req, res));

/**
 * HCP 事件接收端點（Webhook）- 用於 Line Bot 通知
 * POST /hcp-event-receiver
 */
router.post("/hcp-event-receiver", (req, res) => {
	lineBotController.handleEventReceiver(req, res);
});

module.exports = router;
