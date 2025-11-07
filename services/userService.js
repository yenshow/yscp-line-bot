/**
 * UserService
 * - 單一真相：以 users.role 管理授權
 * - 提供統一的讀寫 API，集中透過 configService 存取 user-management.json
 */

const configService = require("./configService");
const LoggerService = require("./loggerService");

class UserService {
	constructor() {
		this.ttlMs = 3000; // 讀取快取 TTL
		this.cache = { data: null, ts: 0 };
	}

	load() {
		const now = Date.now();
		if (this.cache.data && now - this.cache.ts < this.ttlMs) {
			return this.cache.data;
		}
		const data = configService.loadConfig("user-management.json", { users: {}, pending: [], blocked: [], sync: {} });
		if (!data.users) data.users = {};
		this.cache = { data, ts: now };
		return data;
	}

	save(data) {
		// 保存前同步 pending 和 blocked 陣列（職權分離：確保一致性）
		this.syncPendingAndBlockedArrays(data);
		this.cache = { data, ts: Date.now() };
		return configService.saveConfig("user-management.json", data);
	}

	getAllUsers() {
		const data = this.load();
		return Object.entries(data.users || {}).map(([id, u]) => ({ id, ...u }));
	}

	getAuthorizedUserIds() {
		return this.getAllUsers()
			.filter((u) => u.role === "admin" || u.role === "target")
			.map((u) => u.id)
			.filter(Boolean);
	}

	getRole(id) {
		const data = this.load();
		return data.users?.[id]?.role || null;
	}

	setRole(id, role) {
		const data = this.load();
		if (!data.users) data.users = {};
		const existing = data.users[id] || { id, type: id?.startsWith("U") ? "user" : id?.startsWith("C") ? "group" : "room", addedAt: new Date().toISOString() };
		const prevRole = existing.role || null;
		existing.role = role;
		existing.lastUpdatedAt = new Date().toISOString();
		data.users[id] = existing;

		// 同步 pending 和 blocked 陣列（職權分離：確保與 users.role 一致）
		this.syncPendingAndBlockedArrays(data);

		this.save(data);

		try {
			LoggerService.logUserStateChange({ id, fromRole: prevRole, toRole: role, type: existing.type, displayName: existing.displayName || null });
		} catch (_) {}
	}

	/**
	 * 同步 pending 和 blocked 陣列（確保與 users.role 一致）
	 * @param {Object} data - 用戶管理資料
	 */
	syncPendingAndBlockedArrays(data) {
		// 確保 pending 和 blocked 陣列存在
		if (!Array.isArray(data.pending)) data.pending = [];
		if (!Array.isArray(data.blocked)) data.blocked = [];

		// 根據 users.role 重新計算陣列
		const allIds = Object.keys(data.users || {});
		data.pending = allIds.filter((id) => data.users[id] && data.users[id].role === "pending");
		data.blocked = allIds.filter((id) => data.users[id] && data.users[id].role === "blocked");
	}

	upsertUser(id, fields = {}) {
		const data = this.load();
		if (!data.users) data.users = {};
		const nowIso = new Date().toISOString();
		const existing = data.users[id] || { id, addedAt: nowIso };

		// 自動推斷 type（若未提供且不存在）
		const inferredType = (() => {
			if (fields.type) return fields.type;
			if (existing.type) return existing.type;
			if (typeof id === "string") {
				if (id.startsWith("U")) return "user";
				if (id.startsWith("C")) return "group"; // Line 群組多為 C 開頭
				return "room";
			}
			return "user";
		})();

		// 僅合併「已定義」的欄位，避免 undefined 覆蓋
		const next = { ...existing };
		const assignIfDefined = (key, val) => {
			if (val !== undefined) next[key] = val;
		};

		assignIfDefined("type", inferredType);
		assignIfDefined("role", fields.role);
		assignIfDefined("displayName", fields.displayName);
		assignIfDefined("pictureUrl", fields.pictureUrl);
		assignIfDefined("addedAt", existing.addedAt || nowIso);

		// 若有任何快照欄位更新，更新 lastUpdatedAt
		const snapshotKeys = ["displayName", "pictureUrl"];
		const snapshotChanged = snapshotKeys.some((k) => fields[k] !== undefined && fields[k] !== existing[k]);
		if (snapshotChanged) {
			next.lastUpdatedAt = nowIso;
		}

		data.users[id] = next;

		// 如果 role 有變更，同步 pending 和 blocked 陣列
		if (fields.role !== undefined && fields.role !== existing.role) {
			this.syncPendingAndBlockedArrays(data);
		}

		this.save(data);
		return { id, ...data.users[id] };
	}

	getPendingUsers() {
		return this.getAllUsers().filter((u) => u.role === "pending");
	}

	// 便捷查詢（可選）
	getByType(type) {
		return this.getAllUsers().filter((u) => u.type === type);
	}

	getGroups() {
		return this.getByType("group");
	}

	getRooms() {
		return this.getByType("room");
	}
}

module.exports = new UserService();
