/**
 * Line Bot 服務
 * 專注於 Line Bot 業務邏輯：事件處理、訊息發送、用戶互動
 */

const line = require("@line/bot-sdk");
const config = require("../config");
const FlexMessageService = require("./flexMessageService");
const fileSystem = require("./fileSystemService");
const LoggerService = require("./loggerService");
const HCPClient = require("./hcpClient");
const UserService = require("./userService");
const EventStorageService = require("./eventStorageService");

/**
 * Line Bot 服務管理器
 */
class LineBotManager {
	constructor() {
		if (LineBotManager.instance) {
			return LineBotManager.instance;
		}

		this.isConfigured = config.line.channelAccessToken && config.line.channelSecret;
		this.service = null;

		if (this.isConfigured) {
			this.service = new LineBotService();
			// console.log("✅ Line Bot 服務已初始化");
		} else {
			LoggerService.warn("Line Bot 未配置，服務不可用");
		}

		LineBotManager.instance = this;
	}

	getService() {
		return this.service;
	}

	isServiceConfigured() {
		return this.isConfigured;
	}

	getConfigStatus() {
		return {
			configured: this.isConfigured,
			hasToken: !!config.line.channelAccessToken,
			hasSecret: !!config.line.channelSecret
		};
	}
}

/**
 * Line Bot 核心服務
 */
class LineBotService {
	constructor() {
		// Line Bot 客戶端
		this.client = new line.Client({
			channelAccessToken: config.line.channelAccessToken,
			channelSecret: config.line.channelSecret
		});

		// 依賴注入其他服務（延遲載入避免循環依賴）
		this.flexMessageService = null;
		this.hcpClient = null;
		// 用戶詳細資訊緩存
		this.userProfiles = new Map(); // 用戶詳細資訊緩存

		// 現有用戶數據緩存
		this.existingUsersCache = {
			data: null,
			timestamp: 0,
			ttl: 60000 // 60 秒緩存
		};

		// 群組/聊天室摘要快取（避免頻繁呼叫 SDK）
		this.groupSummaryCache = new Map(); // Map<groupId, { data, ts }>
		this.roomSummaryCache = new Map(); // Map<roomId, { data, ts }>
		this.groupCacheTTL = 5 * 60 * 1000; // 5 分鐘

		// 事件圖片快取（提供重新發送功能）
		this.eventImageCache = new Map(); // Map<eventId, { imageUrl, ts }>
		this.eventImageCacheTTL = 30 * 60 * 1000; // 30 分鐘
	}

	// ============================== 用戶資料與權限 ==============================

	async updateUserSnapshot(userId, type = "user") {
		if (type === "user") {
			const profile = await this.getUserProfile(userId);
			UserService.upsertUser(userId, {
				id: userId,
				type,
				displayName: profile.displayName || null,
				pictureUrl: profile.pictureUrl || null
			});
			return;
		}

		if (type === "group") {
			const summary = await this.getGroupSummaryWithCache(userId);
			UserService.upsertUser(userId, {
				id: userId,
				type: "group",
				displayName: summary?.displayName || null,
				pictureUrl: summary?.pictureUrl || null
			});
			return;
		}

		if (type === "room") {
			const summary = await this.getRoomSummaryWithCache(userId);
			UserService.upsertUser(userId, {
				id: userId,
				type: "room",
				displayName: summary?.displayName || null,
				pictureUrl: summary?.pictureUrl || null
			});
			return;
		}

		// 預設：只標記基本資訊
		UserService.upsertUser(userId, { id: userId, type });
	}

	setUserRoleSyncTargets(userId, role) {
		UserService.setRole(userId, role);
	}

	getUserRecord(userId) {
		return UserService.getAllUsers().find((u) => u.id === userId) || null;
	}

	getUserRole(userIdOrGroupId) {
		return UserService.getRole(userIdOrGroupId);
	}

	isAuthorizedRole(role) {
		return role === "admin" || role === "target";
	}

	isAdmin(userId) {
		return this.getUserRole(userId) === "admin";
	}

	// ============================== 依賴服務存取 ==============================

	/** 獲取 FlexMessageService 實例（延遲載入） */
	getFlexMessageService() {
		if (!this.flexMessageService) {
			this.flexMessageService = new FlexMessageService();
		}
		return this.flexMessageService;
	}

	/** 獲取 HCPClient 實例（延遲載入） */
	getHCPClient() {
		if (!this.hcpClient) {
			this.hcpClient = HCPClient.getInstance();
		}
		return this.hcpClient;
	}

	// ============================== Line Bot SDK 方法（含快取） ==============================

	/** 獲取用戶詳細資訊 */
	async getUserProfile(userId) {
		try {
			const profile = await this.client.getProfile(userId);
			return {
				id: userId,
				displayName: profile.displayName,
				pictureUrl: profile.pictureUrl
			};
		} catch (error) {
			LoggerService.error(`獲取用戶 ${userId} 資訊失敗`, error);
			return {
				id: userId,
				displayName: "未知用戶",
				pictureUrl: null
			};
		}
	}

	/** 獲取群組成員資訊 */
	async getGroupMemberProfile(groupId, userId) {
		try {
			const profile = await this.client.getGroupMemberProfile(groupId, userId);
			return {
				id: userId,
				displayName: profile.displayName,
				pictureUrl: profile.pictureUrl
			};
		} catch (error) {
			LoggerService.error(`獲取群組成員 ${userId} 資訊失敗`, error);
			return {
				id: userId,
				displayName: "未知用戶",
				pictureUrl: null
			};
		}
	}

	/** 取得群組摘要（含快取） */
	async getGroupSummaryWithCache(groupId) {
		try {
			const cache = this.groupSummaryCache.get(groupId);
			const now = Date.now();
			if (cache && now - cache.ts < this.groupCacheTTL) {
				return cache.data;
			}

			if (this.client.getGroupSummary) {
				const summary = await this.client.getGroupSummary(groupId);
				const data = {
					id: groupId,
					displayName: summary?.groupName || null,
					pictureUrl: summary?.pictureUrl || null
				};
				this.groupSummaryCache.set(groupId, { data, ts: now });
				return data;
			}
			return null;
		} catch (error) {
			LoggerService.error(`獲取群組摘要失敗: ${groupId}`, error);
			return null;
		}
	}

	/** 取得聊天室摘要（含快取） */
	async getRoomSummaryWithCache(roomId) {
		try {
			const cache = this.roomSummaryCache.get(roomId);
			const now = Date.now();
			if (cache && now - cache.ts < this.groupCacheTTL) {
				return cache.data;
			}

			if (this.client.getRoomSummary) {
				const summary = await this.client.getRoomSummary(roomId);
				const data = {
					id: roomId,
					displayName: summary?.roomName || null,
					pictureUrl: summary?.pictureUrl || null
				};
				this.roomSummaryCache.set(roomId, { data, ts: now });
				return data;
			}
			return null;
		} catch (error) {
			LoggerService.error(`獲取聊天室摘要失敗: ${roomId}`, error);
			return null;
		}
	}

	/** 獲取用戶詳細資訊（帶緩存） */
	async getUserProfileWithCache(userId) {
		if (this.userProfiles.has(userId)) {
			return this.userProfiles.get(userId);
		}

		const profile = await this.getUserProfile(userId);
		this.userProfiles.set(userId, profile);
		return profile;
	}

	// ============================== 退追蹤/離開事件處理 ==============================

	async handleUnfollowEvent(event) {
		try {
			const userId = event.source.userId;
			if (userId) {
				// 移除用戶資料（保持向後兼容，但實際上 UserService 不支援 inactive 角色）
				LoggerService.user(`用戶取消關注: ${userId}`);
			}
			return { success: true };
		} catch (error) {
			LoggerService.error("處理 unfollow 事件錯誤", error);
			return { success: false };
		}
	}

	async handleLeaveEvent(event) {
		try {
			const groupId = event.source.groupId;
			const roomId = event.source.roomId;
			const id = groupId || roomId;
			if (id) {
				const targetType = groupId ? "群組" : "聊天室";
				LoggerService.user(`Bot 離開${targetType}: ${id}`);
			}
			return { success: true };
		} catch (error) {
			LoggerService.error("處理 leave 事件錯誤", error);
			return { success: false };
		}
	}

	// ============================== 事件處理相關方法 ==============================

	/**
	 * 處理 Line Bot 事件
	 */
	async handleEvent(event) {
		try {
			// 先處理需要記錄的事件（不受權限限制）
			if (event.type === "follow") {
				return await this.handleFollowEvent(event);
			} else if (event.type === "join") {
				return await this.handleJoinEvent(event);
			} else if (event.type === "unfollow") {
				return await this.handleUnfollowEvent(event);
			} else if (event.type === "leave") {
				return await this.handleLeaveEvent(event);
			}

			// 對於需要互動的事件，檢查權限
			const permission = this.checkUserPermission(event);
			if (!permission.hasPermission) {
				// 確保未授權用戶能收到權限拒絕訊息
				if (event.replyToken) {
					await this.sendPermissionDeniedMessage(event.replyToken);
					LoggerService.user(`已向未授權用戶發送權限拒絕訊息: ${event.source.userId || event.source.groupId || event.source.roomId}`);
				} else {
					LoggerService.warn("無法發送權限拒絕訊息：replyToken 不存在");
				}
				return { success: false, action: "permission_denied" };
			}

			// 處理需要權限的事件
			if (event.type === "message" && event.message.type === "text") {
				return await this.handleTextMessage(event);
			} else if (event.type === "postback") {
				return await this.handlePostback(event);
			}

			return { success: true, action: "no_action_needed" };
		} catch (error) {
			LoggerService.error("處理 Line Bot 事件錯誤", error);
			if (event.replyToken) {
				await this.sendErrorMessage(event.replyToken);
			}
			throw error;
		}
	}

	/**
	 * 檢查用戶權限
	 */
	checkUserPermission(event) {
		const source = event.source;
		if (source.type === "user" && source.userId) {
			const role = this.getUserRole(source.userId);
			return { hasPermission: this.isAuthorizedRole(role), reason: role || "未知" };
		} else if (source.type === "group" && source.groupId) {
			const role = this.getUserRole(source.groupId);
			return { hasPermission: this.isAuthorizedRole(role), reason: role || "未知" };
		} else if (source.type === "room" && source.roomId) {
			const role = this.getUserRole(source.roomId);
			return { hasPermission: this.isAuthorizedRole(role), reason: role || "未知" };
		}
		return { hasPermission: false, reason: "未知來源類型" };
	}

	/**
	 * 處理文字訊息
	 */
	async handleTextMessage(event) {
		const message = event.message.text.toLowerCase();
		const replyToken = event.replyToken;

		try {
			// 檢查是否為管理員指令
			const isAdminCommand = await this.checkAdminCommand(event, message);
			if (isAdminCommand) {
				return { success: true };
			}
			if (message.includes("幫助") || message.includes("help") || message.includes("功能") || message.includes("menu")) {
				await this.sendHelpMessage(replyToken, event);
			}
			return { success: true };
		} catch (error) {
			LoggerService.error("處理文字訊息錯誤", error);
			throw error;
		}
	}

	/**
	 * 處理 Postback 事件
	 */
	async handlePostback(event) {
		const data = event.postback.data;
		const replyToken = event.replyToken;

		try {
			// 攝影機擷圖
			if (data.startsWith("capture_")) {
				const cameraId = data.replace("capture_", "");
				await this.sendCameraCapture(replyToken, `擷圖 ${cameraId}`);
			}
			// 系統功能按鈕
			else if (data === "show_help") {
				await this.sendHelpMessage(replyToken);
			} else if (data === "show_system_status") {
				await this.sendSystemStatus(replyToken);
			} else if (data === "show_devices") {
				await this.sendEncodeDeviceList(replyToken);
			} else if (data === "show_cameras") {
				await this.sendCameraList(replyToken);
			} else if (data === "show_events") {
				await this.sendEventLog(replyToken, 1);
			} else if (data === "show_user_management") {
				await this.sendAdminPanel(replyToken);
			}
			// 用戶管理相關
			else if (data === "show_pending_users") {
				await this.sendNewUsersList(replyToken);
			} else if (data === "manage_existing_users") {
				await this.sendExistingUsersList(replyToken);
			} else if (data.startsWith("approve_")) {
				const userId = data.replace("approve_", "");
				await this.handleApproveUserFromPostback(replyToken, userId);
			} else if (data.startsWith("reject_")) {
				const userId = data.replace("reject_", "");
				await this.handleRejectUserFromPostback(replyToken, userId);
			} else if (data.startsWith("remove_user_")) {
				const userId = data.replace("remove_user_", "");
				await this.handleRemoveUserFromPostback(replyToken, userId);
			} else if (data.startsWith("resend_image_")) {
				const eventId = data.replace("resend_image_", "");
				await this.handleResendEventImage(replyToken, eventId);
			}
			// 分頁控制
			else if (data.startsWith("page_existing_")) {
				const page = parseInt(data.replace("page_existing_", ""));
				await this.handleExistingUsersPage(replyToken, page);
			} else if (data.startsWith("page_pending_")) {
				const page = parseInt(data.replace("page_pending_", ""));
				await this.handlePendingUsersPage(replyToken, page);
			} else if (data.startsWith("page_devices_")) {
				const page = parseInt(data.replace("page_devices_", ""));
				await this.handleDevicesPage(replyToken, page);
			} else if (data.startsWith("page_cameras_")) {
				const page = parseInt(data.replace("page_cameras_", ""));
				await this.handleCamerasPage(replyToken, page);
			} else if (data.startsWith("page_event_history_")) {
				const page = parseInt(data.replace("page_event_history_", ""));
				await this.handleEventHistoryPage(replyToken, page);
			}
			return { success: true };
		} catch (error) {
			LoggerService.error("處理 Postback 錯誤", error);
			throw error;
		}
	}

	registerEventImage(eventId, imageUrl) {
		if (!eventId || !imageUrl) {
			return;
		}

		this.cleanupEventImageCache();
		this.eventImageCache.set(eventId, { imageUrl, timestamp: Date.now() });
		EventStorageService.updateEventImage(eventId, imageUrl);
	}

	getEventImageFromCache(eventId) {
		if (!eventId) {
			return null;
		}

		this.cleanupEventImageCache();
		const record = this.eventImageCache.get(eventId);
		if (!record) {
			return null;
		}

		return record.imageUrl;
	}

	cleanupEventImageCache() {
		const now = Date.now();
		for (const [key, value] of this.eventImageCache.entries()) {
			if (!value || now - value.timestamp > this.eventImageCacheTTL) {
				this.eventImageCache.delete(key);
			}
		}
	}

	/**
	 * 處理用戶加好友事件
	 */
	async handleFollowEvent(event) {
		const replyToken = event.replyToken;
		const userId = event.source.userId;

		try {
			LoggerService.user(`新用戶加好友: ${userId}`);

			// 先建立/更新使用者快照與足跡
			await this.updateUserSnapshot(userId, "user");

			// 檢查是否已有權限（以 users.role 為準）
			const currentRole = this.getUserRole(userId);
			if (this.isAuthorizedRole(currentRole)) {
				// 同步 users.role（保持 admin/target）
				this.setUserRoleSyncTargets(userId, currentRole === "admin" ? "admin" : "target");

				// 發送幫助訊息
				if (replyToken) {
					await this.sendHelpMessage(replyToken, event);
				}
			} else {
				// 標記為 pending 並提示
				this.setUserRoleSyncTargets(userId, "pending");
				if (replyToken) {
					await this.sendPermissionDeniedMessage(replyToken);
				}
				LoggerService.warn(`用戶 ${userId} 未授權，等待審核`);
			}

			return { success: true };
		} catch (error) {
			LoggerService.error("處理加好友事件錯誤", error);
			throw error;
		}
	}

	/**
	 * 處理群組加入事件
	 */
	async handleJoinEvent(event) {
		const replyToken = event.replyToken;
		const groupId = event.source.groupId;
		const roomId = event.source.roomId;

		try {
			const targetId = groupId || roomId;
			const targetType = groupId ? "群組" : "聊天室";

			LoggerService.user(`Bot 加入${targetType}: ${targetId}`);

			// upsert 群組/聊天室紀錄
			UserService.upsertUser(targetId, { id: targetId, type: groupId ? "group" : "room" });

			// 檢查是否已有權限（以 users.role 為準）
			const currentRole = this.getUserRole(targetId);
			if (this.isAuthorizedRole(currentRole)) {
				// 已授權群組發送幫助訊息
				this.setUserRoleSyncTargets(targetId, "target");
				if (replyToken) {
					await this.sendHelpMessage(replyToken, event);
				}
			} else {
				this.setUserRoleSyncTargets(targetId, "pending");
				if (replyToken) {
					await this.sendPermissionDeniedMessage(replyToken);
				}
				LoggerService.warn(`${targetType} ${targetId} 未授權，等待管理員審核`);
			}

			return { success: true };
		} catch (error) {
			LoggerService.error("處理加入事件錯誤", error);
			throw error;
		}
	}

	// ============================== 管理員指令處理 ==============================

	/**
	 * 檢查並處理管理員指令
	 */
	async checkAdminCommand(event, message) {
		const userId = event.source.userId;
		// 檢查是否為管理員
		const isAdmin = this.isAdmin(userId);
		if (!isAdmin) {
			return false;
		}

		const replyToken = event.replyToken;

		try {
			// 簡化管理員指令 - 只保留核心功能
			if (message.includes("管理") || message.includes("admin")) {
				await this.sendAdminPanel(replyToken);
				return true;
			}
		} catch (error) {
			LoggerService.error("處理管理員指令錯誤", error);
			await this.sendErrorMessage(replyToken, "管理員指令處理失敗");
		}

		return false;
	}

	/** 發送管理員面板 */
	async sendAdminPanel(replyToken) {
		try {
			// 獲取待審核用戶和所有用戶數據
			const pendingUsers = await this.getPendingUsersData();
			// 使用 users.role 作為授權清單來源
			const allUsers = UserService.getAllUsers().filter((u) => u.role === "admin" || u.role === "target");

			// 創建 FlexMessage
			const flexMessage = this.getFlexMessageService().createUserManagementFlexMessage(pendingUsers, allUsers);
			await this.callLineBotAPI("replyMessage", replyToken, [flexMessage]);
			return { success: true };
		} catch (error) {
			LoggerService.error("發送管理員面板錯誤", error);
			return { success: false, error: error.message };
		}
	}

	// addPendingUser 已移除

	// ============================== 清單與分頁 ==============================

	/** 獲取待審核用戶數據 */
	async getPendingUsersData() {
		try {
			const all = UserService.getAllUsers();
			const pendingBase = all.filter((u) => u.role === "pending");

			// 併發限制：避免一次請求過多 SDK
			const runWithConcurrency = async (tasks, limit = 3) => {
				const results = [];
				let index = 0;
				const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
					while (index < tasks.length) {
						const current = index++;
						results[current] = await tasks[current]();
					}
				});
				await Promise.all(workers);
				return results;
			};

			// 補齊 profile 與 timestamp 以符合 Flex 的顯示需求
			const tasks = pendingBase.map((u) => async () => {
				const id = u.id;
				let profile = null;
				if (u.type === "user") {
					// 若本地已有快照，避免再次打 SDK
					if (u.displayName || u.pictureUrl) {
						profile = {
							id,
							displayName: u.displayName || null,
							pictureUrl: u.pictureUrl || null
						};
					} else {
						try {
							profile = await this.getUserProfileWithCache(id);
						} catch (_) {}
					}
				}
				return {
					id,
					type: u.type === "user" ? "用戶" : u.type === "group" ? "群組" : "聊天室",
					timestamp: u.addedAt || null,
					profile
				};
			});

			const pending = await runWithConcurrency(tasks, 3);

			return pending;
		} catch (error) {
			LoggerService.error("獲取待審核用戶數據錯誤", error);
			return [];
		}
	}

	/** 發送新用戶列表 */
	async sendNewUsersList(replyToken, page = 1) {
		try {
			const pendingUsers = await this.getPendingUsersData();
			const flexMessage = this.getFlexMessageService().createPendingUsersFlexMessage(pendingUsers, page);
			await this.callLineBotAPI("replyMessage", replyToken, [flexMessage]);
			return { success: true };
		} catch (error) {
			LoggerService.error("發送新用戶列表錯誤", error);
			// 不發送權限拒絕訊息，避免重複錯誤
			return { success: false, error: error.message };
		}
	}

	/** 發送現有用戶列表 */
	async sendExistingUsersList(replyToken, page = 1) {
		try {
			const existingUsers = await this.getExistingUsersData();
			const flexMessage = this.getFlexMessageService().createExistingUsersFlexMessage(existingUsers, page);
			await this.callLineBotAPI("replyMessage", replyToken, [flexMessage]);
			return { success: true };
		} catch (error) {
			LoggerService.error("發送現有用戶列表錯誤", error);
			// 不發送權限拒絕訊息，避免重複錯誤
			return { success: false, error: error.message };
		}
	}

	/** 獲取現有用戶數據（包含詳細資訊） */
	async getExistingUsersData() {
		try {
			const now = Date.now();

			// 檢查緩存是否有效
			if (this.existingUsersCache.data && now - this.existingUsersCache.timestamp < this.existingUsersCache.ttl) {
				return this.existingUsersCache.data;
			}

			const all = UserService.getAllUsers();
			const authUsers = all.filter((u) => u.role === "admin" || u.role === "target");

			const existingUsers = await Promise.all(
				authUsers.map(async (u) => {
					const id = typeof u.id === "string" ? u.id : typeof u.userId === "string" ? u.userId : null;
					let profile = null;
					if (u.type === "user" && id) {
						try {
							profile = await this.getUserProfileWithCache(id);
						} catch (_) {}
					}
					return {
						id: id || "",
						isAdmin: u.role === "admin",
						role: u.role,
						addedAt: u.addedAt || new Date().toISOString(),
						type: u.type === "user" ? "用戶" : u.type === "group" ? "群組" : "聊天室",
						profile: profile || null,
						displayName: u.displayName || (profile ? profile.displayName : null),
						pictureUrl: u.pictureUrl || (profile ? profile.pictureUrl : null)
					};
				})
			);

			const result = existingUsers;

			this.existingUsersCache.data = result;
			this.existingUsersCache.timestamp = now;

			return result;
		} catch (error) {
			LoggerService.error("獲取現有用戶數據錯誤", error);
			return [];
		}
	}

	/**
	 * 從 Postback 處理批准用戶
	 */
	async handleApproveUserFromPostback(replyToken, userId) {
		try {
			// 從新用戶記錄中移除（如果存在）
			this.removeFromNewUsersLog(userId);

			// 同步 users.role
			this.setUserRoleSyncTargets(userId, "target");

			// 獲取用戶資訊
			const userRecord = this.getUserRecord(userId);
			const userInfo = {
				id: userId,
				displayName: userRecord?.displayName || null,
				pictureUrl: userRecord?.pictureUrl || null,
				role: "target"
			};

			// 使用 Flex Message 優化回傳訊息
			const flexMessage = this.getFlexMessageService().createUserOperationResultFlexMessage("approve", userInfo);
			await this.callLineBotAPI("replyMessage", replyToken, [flexMessage], true);

			LoggerService.user(`管理員通過按鈕批准了用戶 ${userId}${userInfo.displayName ? ` (${userInfo.displayName})` : ""}`);
		} catch (error) {
			LoggerService.error("批准用戶錯誤", error);
			await this.sendErrorMessage(replyToken);
		}
	}

	/**
	 * 從 Postback 處理拒絕用戶
	 */
	async handleRejectUserFromPostback(replyToken, userId) {
		try {
			// 獲取用戶資訊（在標記封鎖前）
			const userRecord = this.getUserRecord(userId);
			const userInfo = {
				id: userId,
				displayName: userRecord?.displayName || null,
				pictureUrl: userRecord?.pictureUrl || null,
				role: "blocked"
			};

			// 從新用戶記錄中移除
			this.removeFromNewUsersLog(userId);

			// 標記封鎖
			this.setUserRoleSyncTargets(userId, "blocked");

			// 使用 Flex Message 優化回傳訊息
			const flexMessage = this.getFlexMessageService().createUserOperationResultFlexMessage("reject", userInfo);
			await this.callLineBotAPI("replyMessage", replyToken, [flexMessage], true);

			LoggerService.user(`管理員通過按鈕拒絕了用戶 ${userId}${userInfo.displayName ? ` (${userInfo.displayName})` : ""}`);
		} catch (error) {
			LoggerService.error("拒絕用戶錯誤", error);
			await this.sendErrorMessage(replyToken);
		}
	}

	/**
	 * 處理移除用戶按鈕點擊
	 */
	async handleRemoveUserFromPostback(replyToken, userId) {
		try {
			// 檢查是否為管理員
			const isAdmin = this.isAdmin(userId);
			if (isAdmin) {
				await this.sendPermissionDeniedMessage(replyToken);
				return;
			}

			// 獲取用戶資訊（在移除前）
			const userRecord = this.getUserRecord(userId);
			const userInfo = {
				id: userId,
				displayName: userRecord?.displayName || null,
				pictureUrl: userRecord?.pictureUrl || null,
				role: "blocked"
			};

			// 從新用戶記錄中移除（如果存在）
			this.removeFromNewUsersLog(userId);

			// 清除緩存，確保下次獲取最新數據
			this.clearExistingUsersCache();

			// 標記封鎖
			this.setUserRoleSyncTargets(userId, "blocked");

			// 使用 Flex Message 優化回傳訊息
			const flexMessage = this.getFlexMessageService().createUserOperationResultFlexMessage("remove", userInfo);
			await this.callLineBotAPI("replyMessage", replyToken, [flexMessage], true);

			LoggerService.user(`管理員通過按鈕移除了用戶 ${userId}${userInfo.displayName ? ` (${userInfo.displayName})` : ""}`);
		} catch (error) {
			LoggerService.error("移除用戶錯誤", error);
			await this.sendErrorMessage(replyToken);
		}
	}

	/** 處理重新發送事件圖片 */
	async handleResendEventImage(replyToken, eventId) {
		try {
			if (!eventId) {
				await this.sendErrorMessage(replyToken, "圖片資訊不存在，請稍後再試。");
				return;
			}

			let imageUrl = this.getEventImageFromCache(eventId);

			if (!imageUrl) {
				const eventData = EventStorageService.getEvent(eventId) || EventStorageService.getEventFromHistory(eventId);

				if (eventData) {
					imageUrl = eventData.imageUrl || null;

					if (!imageUrl) {
						let imageSource = EventStorageService.getEventImageUri(eventId);
						if (!imageSource && eventData.data) {
							imageSource = eventData.data.picUri || eventData.data?.alarmResult?.faces?.URL || null;
						}

						if (imageSource) {
							try {
								imageUrl = await this.getFlexMessageService().fetchEventImage(imageSource, eventData.eventType || "resend", eventId);
							} catch (error) {
								LoggerService.error("重新擷取事件圖片失敗", error);
							}
						}

						if (imageUrl) {
							this.registerEventImage(eventId, imageUrl);
						}
					} else {
						this.registerEventImage(eventId, imageUrl);
					}
				}
			}

			if (!imageUrl) {
				await this.sendErrorMessage(replyToken, "圖片已失效或不存在，請稍後再試。");
				return;
			}

			const imageMessage = {
				type: "image",
				originalContentUrl: imageUrl,
				previewImageUrl: imageUrl
			};
			await this.callLineBotAPI("replyMessage", replyToken, [imageMessage]);
			LoggerService.service(`重新發送事件圖片: ${eventId}`);
		} catch (error) {
			LoggerService.error("重新發送事件圖片錯誤", error);
			await this.sendErrorMessage(replyToken);
		}
	}

	/** 清除現有用戶緩存 */
	clearExistingUsersCache() {
		this.existingUsersCache.data = null;
		this.existingUsersCache.timestamp = 0;
	}

	/** 處理現有用戶分頁 */
	async handleExistingUsersPage(replyToken, page) {
		try {
			// 驗證頁碼
			if (page < 1) {
				page = 1;
			}

			await this.sendExistingUsersList(replyToken, page);
			LoggerService.user(`管理員查看現有用戶第 ${page} 頁`);
		} catch (error) {
			LoggerService.error("處理現有用戶分頁錯誤", error);
			await this.sendErrorMessage(replyToken);
		}
	}

	/** 處理待審核用戶分頁 */
	async handlePendingUsersPage(replyToken, page) {
		try {
			// 驗證頁碼
			if (page < 1) {
				page = 1;
			}

			await this.sendNewUsersList(replyToken, page);
			LoggerService.user(`管理員查看待審核用戶第 ${page} 頁`);
		} catch (error) {
			LoggerService.error("處理待審核用戶分頁錯誤", error);
			await this.sendErrorMessage(replyToken);
		}
	}

	/** 處理編碼裝置分頁 */
	async handleDevicesPage(replyToken, page) {
		try {
			// 驗證頁碼
			if (page < 1) {
				page = 1;
			}

			await this.sendEncodeDeviceList(replyToken, page);
			LoggerService.user(`管理員查看編碼裝置第 ${page} 頁`);
		} catch (error) {
			LoggerService.error("處理編碼裝置分頁錯誤", error);
			await this.sendErrorMessage(replyToken);
		}
	}

	/** 處理攝影機分頁 */
	async handleCamerasPage(replyToken, page) {
		try {
			// 驗證頁碼
			if (page < 1) {
				page = 1;
			}

			await this.sendCameraList(replyToken, page);
			LoggerService.user(`管理員查看攝影機第 ${page} 頁`);
		} catch (error) {
			LoggerService.error("處理攝影機分頁錯誤", error);
			await this.sendErrorMessage(replyToken);
		}
	}

	/** 處理事件紀錄分頁 */
	async handleEventHistoryPage(replyToken, page) {
		try {
			if (page < 1) {
				page = 1;
			}

			await this.sendEventLog(replyToken, page);
			LoggerService.user(`使用者查看事件紀錄第 ${page} 頁`);
		} catch (error) {
			LoggerService.error("處理事件紀錄分頁錯誤", error);
			await this.sendErrorMessage(replyToken);
		}
	}

	// ============================== 工具 ==============================

	/** 從新用戶記錄中移除指定 ID（已簡化為日誌記錄） */
	removeFromNewUsersLog(targetId) {
		LoggerService.user(`用戶角色變更: ${targetId}`);
	}

	// ========== 用戶/群組管理相關方法 ==========

	/**
	 * 記錄新用戶或群組 ID
	 * @param {string} id - 用戶或群組 ID
	 * @param {string} type - 類型：'user', '群組', '聊天室', 'user（封鎖解除）', '群組（Bot離開）'
	 */
	// logNewUser 已移除（整合到統一日誌流程）

	// ============================== 圖片處理與訊息發送 ==============================

	/** 處理攝影機圖片 */
	processCameraImage(imageData, cameraId) {
		try {
			// 確保圖片資料格式正確
			let processedImageData = imageData;
			if (typeof imageData === "string" && !imageData.startsWith("data:image/")) {
				processedImageData = `data:image/jpeg;base64,${imageData}`;
			}

			// 使用統一的檔案系統服務儲存圖片
			return fileSystem.saveBase64Image(processedImageData, cameraId);
		} catch (error) {
			LoggerService.error("處理攝影機圖片失敗", error);
			return null;
		}
	}

	// ========== 訊息發送相關方法 ==========

	/** 發送權限拒絕訊息 */
	async sendPermissionDeniedMessage(replyToken) {
		try {
			const message = {
				type: "text",
				text: `🚫 權限不足\n\n` + `此為監控服務，僅限授權用戶使用\n\n` + `如需使用權限，\n請聯繫管理員手動添加。\n`
			};
			await this.callLineBotAPI("replyMessage", replyToken, [message]);
			return { success: true };
		} catch (error) {
			LoggerService.error("發送權限拒絕訊息錯誤", error);
			return { success: false, error: error.message };
		}
	}

	/** 發送錯誤訊息 */
	async sendErrorMessage(replyToken, customMessage = null) {
		try {
			const message = {
				type: "text",
				text: customMessage || "❌ 發生錯誤，請稍後再試或輸入「幫助」查看可用指令。"
			};
			await this.callLineBotAPI("replyMessage", replyToken, [message]);
			return { success: true };
		} catch (error) {
			LoggerService.error("發送錯誤訊息錯誤", error);
			return { success: false, error: error.message };
		}
	}

	/** 發送幫助訊息 */
	async sendHelpMessage(replyToken, event = null) {
		try {
			let isAdmin = false;
			if (event && event.source && event.source.userId) {
				const userId = event.source.userId;
				isAdmin = UserService.getRole(userId) === "admin";
			}

			// 使用 Flex Message 顯示幫助訊息
			const flexMessage = this.getFlexMessageService().createHelpFlexMessage(isAdmin);
			await this.callLineBotAPI("replyMessage", replyToken, [flexMessage]);
			return { success: true };
		} catch (error) {
			LoggerService.error("發送幫助訊息錯誤", error);
			return { success: false, error: error.message };
		}
	}

	/** 發送系統狀態 */
	async sendSystemStatus(replyToken) {
		try {
			const versionInfo = await this.getHCPClient().getPlatformVersion();

			let statusMessage = "📊 系統狀態\n\n";

			if (versionInfo.code === "0") {
				statusMessage += `🖥️ 平台: Yenshow Central Professional\n`;
				statusMessage += `📋 版本: ${versionInfo.data.softVersion}\n\n`;
			}

			statusMessage += `💡 系統運行正常，所有功能可用`;

			const message = { type: "text", text: statusMessage };
			await this.callLineBotAPI("replyMessage", replyToken, [message]);
			return { success: true };
		} catch (error) {
			LoggerService.error("發送系統狀態錯誤", error);
			await this.sendErrorMessage(replyToken);
			return { success: false, error: error.message };
		}
	}

	/** 發送事件記錄 */
	async sendEventLog(replyToken, page = 1) {
		try {
			const pageSize = 10;
			const history = EventStorageService.getEventHistory({ page, pageSize });

			if (!history.total) {
				const message = {
					type: "text",
					text: "🔔 事件記錄\n\n目前沒有事件紀錄。"
				};
				await this.callLineBotAPI("replyMessage", replyToken, [message]);
				return { success: true };
			}

			const flexMessage = await this.getFlexMessageService().createEventHistoryFlexMessage(history.list, history.total, page, pageSize);
			await this.callLineBotAPI("replyMessage", replyToken, [flexMessage]);
			return { success: true };
		} catch (error) {
			LoggerService.error("發送事件記錄錯誤", error);
			await this.sendErrorMessage(replyToken);
			return { success: false, error: error.message };
		}
	}

	/**
	 * 發送編碼裝置列表
	 */
	async sendEncodeDeviceList(replyToken, page = 1) {
		try {
			const firstPage = await this.getHCPClient().getEncodeDeviceList({ pageNo: 1, pageSize: 1 });

			if (firstPage.code !== "0" || !firstPage.data) {
				await this.sendErrorMessage(replyToken, "無法獲取編碼裝置列表");
				return { success: false, error: "無法獲取編碼裝置列表" };
			}

			const total = firstPage.data.total;
			const deviceList = await this.getHCPClient().getEncodeDeviceList({ pageNo: 1, pageSize: total });

			if (deviceList.code === "0" && deviceList.data.list) {
				const devices = deviceList.data.list;
				const flexMessage = this.getFlexMessageService().createEncodeDeviceFlexMessage(devices, total, page);
				await this.callLineBotAPI("replyMessage", replyToken, [flexMessage]);
				return { success: true };
			} else {
				await this.sendErrorMessage(replyToken, "無法獲取編碼裝置列表");
				return { success: false, error: "無法獲取編碼裝置列表" };
			}
		} catch (error) {
			LoggerService.error("發送編碼裝置列表錯誤", error);
			await this.sendErrorMessage(replyToken);
			return { success: false, error: error.message };
		}
	}

	/**
	 * 發送攝影機列表
	 */
	async sendCameraList(replyToken, page = 1) {
		try {
			const firstPage = await this.getHCPClient().getCameraList({ pageNo: 1, pageSize: 1 });

			if (firstPage.code !== "0" || !firstPage.data) {
				await this.sendErrorMessage(replyToken, "無法獲取攝影機列表");
				return { success: false, error: "無法獲取攝影機列表" };
			}

			const total = firstPage.data.total;
			const cameraList = await this.getHCPClient().getCameraList({ pageNo: 1, pageSize: total });

			if (cameraList.code === "0" && cameraList.data.list) {
				const cameras = cameraList.data.list;
				const flexMessage = this.getFlexMessageService().createCameraFlexMessage(cameras, total, page);
				await this.callLineBotAPI("replyMessage", replyToken, [flexMessage]);
				return { success: true };
			} else {
				await this.sendErrorMessage(replyToken, "無法獲取攝影機列表");
				return { success: false, error: "無法獲取攝影機列表" };
			}
		} catch (error) {
			LoggerService.error("發送攝影機列表錯誤", error);
			await this.sendErrorMessage(replyToken);
			return { success: false, error: error.message };
		}
	}

	/**
	 * 發送攝影機擷圖
	 */
	async sendCameraCapture(replyToken, message) {
		try {
			const cameraIdMatch = message.match(/(\d+)/);
			if (!cameraIdMatch) {
				await this.sendErrorMessage(replyToken, "攝影機 ID 格式錯誤");
				return { success: false, error: "缺少攝影機 ID" };
			}

			const cameraId = cameraIdMatch[1];
			LoggerService.service(`擷取攝影機 ${cameraId} 的圖片`);

			const captureResult = await this.getHCPClient().captureCameraImage({ cameraIndexCode: cameraId });

			if (captureResult.code === "0" && captureResult.data) {
				// 使用統一的圖片處理服務保存圖片並生成 URL
				const imageUrl = this.processCameraImage(captureResult.data, cameraId);

				if (imageUrl) {
					// 檢查是否為 localhost URL（Line Bot 無法訪問）
					if (imageUrl.includes("localhost")) {
						await this.sendErrorMessage(
							replyToken,
							`📷 攝影機 ${cameraId} 截圖成功，但無法顯示圖片。\n\n` +
								`⚠️ 需要設置公網可訪問的 URL 才能顯示圖片。\n\n` +
								`💡 請參考 CAMERA_IMAGE_FIX.md 文件設置 ngrok 或其他隧道服務。`
						);
						return { success: false, error: "需要公網 URL" };
					}

					const imageMessage = {
						type: "image",
						originalContentUrl: imageUrl,
						previewImageUrl: imageUrl
					};
					await this.callLineBotAPI("replyMessage", replyToken, [imageMessage]);
					return { success: true };
				} else {
					await this.sendErrorMessage(replyToken, `攝影機 ${cameraId} 圖片處理失敗`);
					return { success: false, error: "圖片處理失敗" };
				}
			} else {
				await this.sendErrorMessage(replyToken, `擷取攝影機 ${cameraId} 圖片失敗`);
				return { success: false, error: `擷取攝影機 ${cameraId} 圖片失敗` };
			}
		} catch (error) {
			LoggerService.error("發送攝影機擷圖錯誤", error);
			await this.sendErrorMessage(replyToken);
			return { success: false, error: error.message };
		}
	}

	/** 統一的 Line Bot API 調用方法 */
	async callLineBotAPI(method, ...args) {
		// 直接調用 Line Bot API（用戶互動，不受速率限制）
		return await this.client[method](...args);
	}
}

// 導出單例實例
module.exports = new LineBotManager();
