/**
 * Flex Message 服務
 * 負責創建各種 Line Bot 的 Flex Message
 */

const HCPClient = require("./hcpClient");
const LoggerService = require("./loggerService");
const EventStorageService = require("./eventStorageService");

class FlexMessageService {
	constructor() {
		// 延遲載入 HCPClient 避免循環依賴
		this.hcpClient = null;

		// 統一的視覺風格配置
		this.theme = {
			colors: {
				// 主要品牌色彩
				primary: "#2563EB", // 現代藍色，更深的色調
				primaryLight: "#3B82F6", // 較淺的藍色

				// 功能色彩
				success: "#10B981", // 翠綠色，更現代
				error: "#EF4444", // 紅色，更柔和
				warning: "#F59E0B", // 琥珀色，更溫暖
				info: "#06B6D4", // 青色，用於資訊提示

				// 管理員專用色彩
				admin: "#7C3AED", // 紫色，更深的色調
				adminLight: "#8B5CF6", // 較淺的紫色

				// 文字色彩
				text: "#1F2937", // 深灰色，更好的對比度
				textSecondary: "#4B5563", // 次要文字
				textMuted: "#9CA3AF", // 靜音文字

				// 背景色彩
				background: "#FFFFFF", // 純白背景
				backgroundSecondary: "#F9FAFB" // 次要背景
			},
			sizes: {
				xl: "xl",
				lg: "lg",
				md: "md",
				sm: "sm",
				xs: "xs"
			},
			spacing: {
				xs: "xs",
				sm: "sm",
				md: "md",
				lg: "lg",
				xl: "xl"
			}
		};
	}

	/**
	 * 獲取 HCPClient 實例（延遲載入）
	 */
	getHCPClient() {
		if (!this.hcpClient) {
			this.hcpClient = HCPClient.getInstance();
		}
		return this.hcpClient;
	}

	/**
	 * 創建統一的文字元素
	 * @param {string} text - 文字內容
	 * @param {string} size - 字體大小
	 * @param {string} color - 顏色
	 * @param {Object} options - 其他選項
	 */
	createText(text, size = "md", color = null, options = {}) {
		return {
			type: "text",
			text: text,
			size: size,
			color: color || this.theme.colors.text,
			...options
		};
	}

	/**
	 * 創建統一的按鈕元素
	 * @param {string} label - 按鈕文字
	 * @param {string} data - postback 數據
	 * @param {string} style - 按鈕樣式
	 */
	createButton(label, data, style = "primary") {
		const buttonConfig = {
			type: "button",
			height: "sm",
			action: {
				type: "postback",
				label: label,
				data: data
			}
		};

		// 如果是 admin 樣式，使用紫色背景
		if (style === "admin") {
			buttonConfig.color = this.theme.colors.admin;
			buttonConfig.style = "primary"; // 使用 primary 樣式但覆蓋顏色
		} else if (style === "adminLight") {
			buttonConfig.color = this.theme.colors.adminLight;
			buttonConfig.style = "primary"; // 使用 primary 樣式但覆蓋顏色
		} else {
			buttonConfig.style = style;
		}

		return buttonConfig;
	}

	/**
	 * 創建重新發送圖片按鈕的 footer
	 * @param {string} eventId - 事件 ID
	 * @returns {Object|null}
	 */
	createResendImageFooter(eventId) {
		if (!eventId) {
			return null;
		}

		return {
			type: "box",
			layout: "vertical",
			contents: [this.createButton("📸 重新發送圖片", `resend_image_${eventId}`, "primary")],
			paddingAll: "12px"
		};
	}

	/**
	 * 建立事件紀錄清單 FlexMessage
	 * @param {Array} events - 事件清單
	 * @param {number} total - 事件總數
	 * @param {number} page - 當前頁碼 (從1開始)
	 * @param {number} pageSize - 每頁顯示數量
	 * @returns {Object} Flex Message 物件
	 */
	async createEventHistoryFlexMessage(events = [], total = 0, page = 1, pageSize = 10) {
		if (!events.length) {
			return {
				type: "flex",
				altText: "🔔 事件記錄",
				contents: {
					type: "bubble",
					body: {
						type: "box",
						layout: "vertical",
						contents: [
							this.createText("🔔 事件記錄", "xl", this.theme.colors.error, { weight: "bold" }),
							this.createText("目前尚無事件紀錄。", "md", this.theme.colors.textSecondary, { margin: "md" })
						]
					}
				}
			};
		}

		const totalPages = Math.max(1, Math.ceil(total / pageSize));
		const hasPrevPage = page > 1;
		const hasNextPage = page < totalPages;
		const hcpClient = this.getHCPClient();

		const formatTime = (input) => {
			if (!input) {
				return "未知時間";
			}
			const date = new Date(input);
			if (Number.isNaN(date.getTime())) {
				return "未知時間";
			}
			return date.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
		};

		const bubbles = await Promise.all(
			events.map(async (event) => {
				const typeName = typeof hcpClient.getEventTypeName === "function" ? hcpClient.getEventTypeName(event.eventType) : null;
				const typeLabel = typeName || `事件 ${event.eventType || "未知"}`;
				const timeLabel = event.happenTime ? formatTime(event.happenTime) : formatTime(event.storedAt);
				const sourceLabel = event.srcName || event.srcType || "未知設備";

				let imageUrl = event.imageUrl || null;
				if (!imageUrl) {
					const imageSources = event.imageSources || {};
					const faceImage = imageSources.faceUrl || event?.data?.alarmResult?.faces?.URL || null;
					const picUri = imageSources.picUri || event?.data?.picUri || null;
					// 檢查事件層級的 eventPicUri（用於溫度等事件）
					const eventPicUri = event.eventPicUri || event?.data?.eventPicUri || null;
					const targetUri = faceImage || picUri || eventPicUri || null;

					if (targetUri) {
						try {
							imageUrl = await this.fetchEventImage(targetUri, "history", event.eventId);
						} catch (error) {
							LoggerService.error("取得事件紀錄圖片失敗", error);
						}
					}
				}

				if (imageUrl && !event.imageUrl) {
					EventStorageService.updateEventImage(event.eventId, imageUrl);
				}

				const bodyContents = [
					this.createInfoRow("⏰ 時間:", timeLabel),
					this.createInfoRow("🔖 事件類型:", typeLabel),
					this.createInfoRow("📹 設備名稱:", sourceLabel)
				];

				if (imageUrl) {
					bodyContents.push({
						type: "image",
						url: imageUrl,
						size: "full",
						aspectRatio: "16:9",
						aspectMode: "cover",
						margin: "md"
					});
				}

				const bubble = {
					type: "bubble",
					header: this.createHeader("🚨 YSCP 系統警報", typeLabel),
					body: {
						type: "box",
						layout: "vertical",
						contents: bodyContents
					}
				};

				const footer = imageUrl ? this.createResendImageFooter(event.eventId) : null;
				if (footer) {
					bubble.footer = footer;
				}

				return bubble;
			})
		);

		if (hasPrevPage || hasNextPage || totalPages > 1) {
			const paginationButtons = [];
			if (hasPrevPage) {
				paginationButtons.push(this.createButton("⬅️ 上一頁", `page_event_history_${page - 1}`, "secondary"));
			}
			if (hasNextPage) {
				paginationButtons.push(this.createButton("下一頁 ➡️", `page_event_history_${page + 1}`, "primary"));
			}

			const paginationBubble = {
				type: "bubble",
				header: {
					type: "box",
					layout: "vertical",
					contents: [this.createText("📊 事件分頁", "xl", this.theme.colors.background, { weight: "bold", align: "center" })],
					backgroundColor: this.theme.colors.info,
					paddingAll: "20px"
				},
				body: {
					type: "box",
					layout: "vertical",
					contents: [
						{
							type: "box",
							layout: "vertical",
							spacing: "sm",
							contents: [
								this.createInfoRow("📄 當前頁面:", `第 ${page} 頁，共 ${totalPages} 頁`),
								this.createInfoRow("📋 顯示範圍:", `${(page - 1) * pageSize + 1} - ${Math.min(page * pageSize, total)}`),
								this.createInfoRow("📦 事件總數:", `${total} 筆`)
							]
						}
					],
					paddingAll: "16px"
				},
				styles: {
					body: { backgroundColor: this.theme.colors.backgroundSecondary }
				}
			};

			if (paginationButtons.length) {
				paginationBubble.footer = {
					type: "box",
					layout: "vertical",
					spacing: "sm",
					contents: paginationButtons
				};
			}

			bubbles.push(paginationBubble);
		}

		return {
			type: "flex",
			altText: `🔔 事件記錄列表 (共 ${total} 筆)`,
			contents: {
				type: "carousel",
				contents: bubbles
			}
		};
	}

	/**
	 * 創建統一的標題頭部
	 * @param {string} title - 標題
	 * @param {string} subtitle - 副標題
	 */
	createHeader(title, subtitle = null) {
		const contents = [this.createText(title, "xl", this.theme.colors.background, { weight: "bold" })];

		if (subtitle) {
			contents.push(this.createText(subtitle, "sm", this.theme.colors.background, { margin: "sm" }));
		}

		return {
			type: "box",
			layout: "vertical",
			contents: contents,
			backgroundColor: this.theme.colors.primary,
			paddingAll: "20px"
		};
	}

	/**
	 * 創建統一的資訊行
	 * @param {string} label - 標籤
	 * @param {string} value - 值
	 */
	createInfoRow(label, value) {
		const contents = [];

		contents.push(
			this.createText(label, "md", this.theme.colors.textMuted, { flex: 0, margin: "md" }),
			this.createText(value, "md", this.theme.colors.text, { wrap: true })
		);

		return {
			type: "box",
			layout: "baseline",
			contents: contents,
			margin: "sm"
		};
	}

	/**
	 * 創建幫助訊息 Flex Message
	 * @param {boolean} isAdmin - 是否為管理員
	 * @returns {Object} Flex Message 物件
	 */
	createHelpFlexMessage(isAdmin = false) {
		return {
			type: "flex",
			altText: "YSCP 智慧通知 - 幫助訊息",
			contents: {
				type: "bubble",
				header: this.createHeader("🚨 YSCP 智慧通知"),
				body: {
					type: "box",
					layout: "vertical",
					contents: [
						this.createText("系統功能", "lg", null, { weight: "bold", margin: "md" }),
						{
							type: "box",
							layout: "vertical",
							margin: "md",
							spacing: "sm",
							contents: [
								this.createInfoRow("監控狀態", "即時查看系統運行狀態"),
								this.createInfoRow("設備管理", "編碼裝置與攝影機管理"),
								this.createInfoRow("事件通知", "即時警報與事件推送"),
								this.createInfoRow("用戶管理", isAdmin ? "管理員專用功能" : "權限控制與用戶管理")
							]
						}
					],
					paddingAll: "12px",
					paddingBottom: "4px"
				},
				footer: {
					type: "box",
					layout: "vertical",
					contents: [
						this.createText("快速操作", "lg", null, { weight: "bold", margin: "lg" }),
						{
							type: "box",
							layout: "horizontal",
							contents: [this.createButton("📊 系統狀態", "show_system_status", "primary"), this.createButton("🔔 事件記錄", "show_events", "primary")],
							spacing: "sm",
							margin: "lg"
						},
						{
							type: "box",
							layout: "horizontal",
							contents: [this.createButton("📷 攝影機", "show_cameras", "secondary"), this.createButton("📹 設備列表", "show_devices", "secondary")],
							spacing: "sm",
							margin: "sm"
						},
						...(isAdmin
							? [
									{
										type: "box",
										layout: "horizontal",
										contents: [this.createButton("👑 用戶管理", "show_user_management", "admin")],
										spacing: "sm",
										margin: "sm"
									}
							  ]
							: [])
					],
					paddingAll: "12px",
					paddingTop: "4px"
				}
			}
		};
	}

	/**
	 * 創建用戶管理面板 Flex Message
	 * @param {Array} pendingUsers - 待審核用戶列表
	 * @param {Array} allUsers - 所有用戶列表
	 * @returns {Object} Flex Message 物件
	 */
	createUserManagementFlexMessage(pendingUsers = [], allUsers = []) {
		const pendingCount = pendingUsers.length;
		const totalUsers = allUsers.length;

		return {
			type: "flex",
			altText: `👑 用戶管理面板 (${pendingCount} 個待審核)`,
			contents: {
				type: "bubble",
				header: this.createHeader("👑 用戶管理面板"),
				body: {
					type: "box",
					layout: "vertical",
					contents: [
						this.createText("📊 統計資訊", "lg", null, { weight: "bold", margin: "md" }),
						this.createInfoRow("待審核:", `${pendingCount} 個`),
						this.createInfoRow("總用戶:", `${totalUsers} 個`)
					]
				},
				footer: {
					type: "box",
					layout: "vertical",
					contents: [
						{
							type: "box",
							layout: "vertical",
							contents: [
								this.createButton("📋 查看待審核用戶", "show_pending_users", "primary"),
								this.createButton("🗑️ 管理現有用戶", "manage_existing_users", "secondary")
							],
							spacing: "md"
						}
					]
				}
			}
		};
	}

	/**
	 * 創建現有用戶管理 Flex Message
	 * @param {Array} existingUsers - 現有用戶列表
	 * @param {number} page - 當前頁碼 (從1開始)
	 * @param {number} pageSize - 每頁顯示數量
	 * @returns {Object} Flex Message 物件
	 */
	createExistingUsersFlexMessage(existingUsers, page = 1, pageSize = 9) {
		if (existingUsers.length === 0) {
			return {
				type: "flex",
				altText: "❌ 沒有現有用戶",
				contents: {
					type: "bubble",
					body: {
						type: "box",
						layout: "vertical",
						contents: [
							this.createText("❌ 沒有現有用戶", "lg", this.theme.colors.error, { weight: "bold" }),
							this.createText("目前沒有任何已授權的用戶", "md", this.theme.colors.textSecondary, { margin: "md" })
						]
					}
				}
			};
		}

		// 計算分頁數據
		const startIndex = (page - 1) * pageSize;
		const endIndex = startIndex + pageSize;
		const displayUsers = existingUsers.slice(startIndex, endIndex);
		const totalPages = Math.ceil(existingUsers.length / pageSize);
		const hasNextPage = page < totalPages;
		const hasPrevPage = page > 1;

		const bubbles = displayUsers.map((user, index) => {
			const displayName = user.displayName || (user.profile ? user.profile.displayName : null) || "未知用戶";
			const pictureUrl = user.pictureUrl || (user.profile ? user.profile.pictureUrl : null) || "https://via.placeholder.com/120x120/cccccc/666666?text=👤";
			const roleLabel = user.isAdmin ? "管理員" : "通知目標";

			const header = {
				type: "box",
				layout: "vertical",
				contents: [this.createText(`用戶名稱：${displayName}`, "xl", this.theme.colors.background, { weight: "bold" })],
				backgroundColor: this.theme.colors.info,
				paddingAll: "20px"
			};

			const body = {
				type: "box",
				layout: "vertical",
				contents: [
					{
						type: "image",
						url: pictureUrl,
						size: "lg",
						aspectMode: "cover",
						aspectRatio: "1:1",
						margin: "md"
					},
					this.createInfoRow("🔐 權限:", roleLabel),
					this.createInfoRow("📅 加入時間:", user.addedAt ? new Date(user.addedAt).toLocaleString("zh-TW") : "未知")
				]
			};

			return {
				type: "bubble",
				header: header,
				body: body,
				footer: {
					type: "box",
					layout: "vertical",
					spacing: "sm",
					contents: [this.createButton("🗑️ 移除用戶", `remove_user_${user.id}`, "secondary")]
				}
			};
		});

		// 添加分頁控制卡片
		if (hasNextPage || hasPrevPage || totalPages > 1) {
			const paginationButtons = [];

			// 上一頁按鈕
			if (hasPrevPage) {
				paginationButtons.push(this.createButton("⬅️ 上一頁", `page_existing_${page - 1}`, "secondary"));
			}

			// 下一頁按鈕
			if (hasNextPage) {
				paginationButtons.push(this.createButton("下一頁 ➡️", `page_existing_${page + 1}`, "primary"));
			}

			const paginationCard = {
				type: "bubble",
				header: {
					type: "box",
					layout: "vertical",
					contents: [this.createText("📊 分頁資訊", "xl", this.theme.colors.background, { weight: "bold", align: "center" })],
					backgroundColor: this.theme.colors.info,
					paddingAll: "20px"
				},
				body: {
					type: "box",
					layout: "vertical",
					contents: [
						{
							type: "box",
							layout: "vertical",
							margin: "lg",
							spacing: "sm",
							contents: [
								this.createInfoRow("📄 當前頁面:", `第 ${page} 頁，共 ${totalPages} 頁`),
								this.createInfoRow("📋 顯示範圍:", `${startIndex + 1} - ${Math.min(endIndex, existingUsers.length)}`),
								this.createInfoRow("👥 總用戶數:", `${existingUsers.length} 個`)
							]
						}
					],
					paddingAll: "16px"
				},
				styles: {
					body: { backgroundColor: this.theme.colors.backgroundSecondary }
				}
			};

			// 只有當有按鈕時才添加 footer
			if (paginationButtons.length > 0) {
				paginationCard.footer = {
					type: "box",
					layout: "vertical",
					spacing: "sm",
					contents: paginationButtons
				};
			}

			bubbles.push(paginationCard);
		}

		return {
			type: "flex",
			altText: `現有用戶管理 (${existingUsers.length} 人)`,
			contents: {
				type: "carousel",
				contents: bubbles
			}
		};
	}

	/**
	 * 創建待審核用戶列表 Flex Message
	 * @param {Array} pendingUsers - 待審核用戶列表
	 * @param {number} page - 當前頁碼 (從1開始)
	 * @param {number} pageSize - 每頁顯示數量
	 * @returns {Object} Flex Message 物件
	 */
	createPendingUsersFlexMessage(pendingUsers, page = 1, pageSize = 9) {
		if (pendingUsers.length === 0) {
			return {
				type: "flex",
				altText: "✅ 沒有待審核的用戶",
				contents: {
					type: "bubble",
					body: {
						type: "box",
						layout: "vertical",
						contents: [
							this.createText("✅ 沒有待審核的用戶", "xl", this.theme.colors.success, { weight: "bold", align: "center" }),
							this.createText("所有用戶都已經處理完成", "md", this.theme.colors.textSecondary, { align: "center", margin: "md" })
						]
					}
				}
			};
		}

		// 計算分頁數據
		const startIndex = (page - 1) * pageSize;
		const endIndex = startIndex + pageSize;
		const displayUsers = pendingUsers.slice(startIndex, endIndex);
		const totalPages = Math.ceil(pendingUsers.length / pageSize);
		const hasNextPage = page < totalPages;
		const hasPrevPage = page > 1;

		const bubbles = displayUsers.map((user, index) => {
			// 構建用戶資訊內容
			const userInfoContents = [this.createText("👤 用戶資訊", "md", null, { weight: "bold", margin: "md" })];

			// 如果有用戶詳細資訊，顯示頭像和名稱
			if (user.profile) {
				userInfoContents.push({
					type: "box",
					layout: "horizontal",
					contents: [
						// 用戶頭像
						{
							type: "image",
							url: user.profile.pictureUrl || "https://via.placeholder.com/50x50/cccccc/666666?text=👤",
							size: "sm",
							aspectRatio: "1:1",
							aspectMode: "cover",
							margin: "sm"
						},
						// 用戶名稱和狀態
						{
							type: "box",
							layout: "vertical",
							contents: [this.createText(user.profile.displayName || "未知用戶", "md", null, { weight: "bold" })],
							flex: 1,
							margin: "sm"
						}
					]
				});
			}

			// 添加基本資訊（移除 ID，加入狀態）
			userInfoContents.push(
				this.createInfoRow("📋 狀態:", "待審核"),
				this.createInfoRow("📋 類型:", user.type || "未知"),
				this.createInfoRow("📅 申請時間:", user.timestamp ? new Date(user.timestamp).toLocaleString("zh-TW") : "未知")
			);

			// Header 顯示『用戶名稱：』，若無則顯示『待審核 X』
			const dn = (user.profile && user.profile.displayName) || null;
			const header = {
				type: "box",
				layout: "vertical",
				contents: [this.createText(dn ? `用戶名稱：${dn}` : `待審核 ${startIndex + index + 1}`, "xl", this.theme.colors.background, { weight: "bold" })],
				backgroundColor: this.theme.colors.warning,
				paddingAll: "20px"
			};

			// Body 改為：圖片 + 狀態/類型/申請時間（加間距）
			const body = {
				type: "box",
				layout: "vertical",
				spacing: "md",
				contents: [
					{
						type: "image",
						url: (user.profile && user.profile.pictureUrl) || "https://via.placeholder.com/120x120/cccccc/666666?text=👤",
						size: "lg",
						aspectMode: "cover",
						aspectRatio: "1:1",
						margin: "md"
					},
					this.createInfoRow("📋 狀態:", "待審核"),
					this.createInfoRow("📋 類型:", user.type || "未知"),
					this.createInfoRow("📅 申請時間:", user.timestamp ? new Date(user.timestamp).toLocaleString("zh-TW") : "未知")
				]
			};

			return {
				type: "bubble",
				header: header,
				body: body,
				footer: {
					type: "box",
					layout: "vertical",
					spacing: "sm",
					contents: [this.createButton("✅ 批准", `approve_${user.id}`, "primary"), this.createButton("❌ 拒絕", `reject_${user.id}`, "secondary")]
				}
			};
		});

		// 添加分頁控制卡片
		if (hasNextPage || hasPrevPage || totalPages > 1) {
			const paginationButtons = [];

			// 上一頁按鈕
			if (hasPrevPage) {
				paginationButtons.push(this.createButton("⬅️ 上一頁", `page_pending_${page - 1}`, "secondary"));
			}

			// 下一頁按鈕
			if (hasNextPage) {
				paginationButtons.push(this.createButton("下一頁 ➡️", `page_pending_${page + 1}`, "primary"));
			}

			const paginationCard = {
				type: "bubble",
				header: {
					type: "box",
					layout: "vertical",
					contents: [this.createText("📊 分頁資訊", "xl", this.theme.colors.background, { weight: "bold", align: "center" })],
					backgroundColor: this.theme.colors.warning,
					paddingAll: "20px"
				},
				body: {
					type: "box",
					layout: "vertical",
					contents: [
						{
							type: "box",
							layout: "vertical",
							margin: "lg",
							spacing: "sm",
							contents: [
								this.createInfoRow("📄 當前頁面:", `第 ${page} 頁，共 ${totalPages} 頁`),
								this.createInfoRow("📋 顯示範圍:", `${startIndex + 1} - ${Math.min(endIndex, pendingUsers.length)}`),
								this.createInfoRow("⏳ 待審核數:", `${pendingUsers.length} 個`)
							]
						}
					],
					paddingAll: "16px"
				},
				styles: {
					body: { backgroundColor: this.theme.colors.backgroundSecondary }
				}
			};

			// 只有當有按鈕時才添加 footer
			if (paginationButtons.length > 0) {
				paginationCard.footer = {
					type: "box",
					layout: "vertical",
					spacing: "sm",
					contents: paginationButtons
				};
			}

			bubbles.push(paginationCard);
		}

		return {
			type: "flex",
			altText: `📋 待審核用戶 (${pendingUsers.length} 個)`,
			contents: {
				type: "carousel",
				contents: bubbles
			}
		};
	}

	/**
	 * 創建編碼裝置 Flex Message
	 * @param {Array} devices - 編碼裝置列表
	 * @param {number} total - 總數量
	 * @param {number} page - 當前頁碼 (從1開始)
	 * @param {number} pageSize - 每頁顯示數量
	 * @returns {Object} Flex Message 物件
	 */
	createEncodeDeviceFlexMessage(devices, total, page = 1, pageSize = 10) {
		const onlineDevices = devices.filter((device) => device.status === 1);
		const offlineCount = devices.length - onlineDevices.length;

		// 如果沒有上線裝置，顯示提示訊息
		if (onlineDevices.length === 0) {
			return {
				type: "flex",
				altText: `📹 編碼裝置列表 (共 ${total} 個，全部離線)`,
				contents: {
					type: "bubble",
					header: this.createHeader("📹 編碼裝置狀態", "所有裝置離線"),
					body: {
						type: "box",
						layout: "vertical",
						contents: [
							this.createText("⚠️ 無上線裝置", "xl", this.theme.colors.error, { weight: "bold", align: "center" }),
							this.createText("目前沒有上線的編碼裝置", "md", this.theme.colors.textSecondary, { align: "center", margin: "md" }),
							{
								type: "box",
								layout: "vertical",
								margin: "lg",
								spacing: "sm",
								contents: [this.createInfoRow("📊 總裝置數:", `${total} 個`), this.createInfoRow("🔴 離線裝置:", `${offlineCount} 個`)]
							}
						]
					},
					styles: { body: { backgroundColor: this.theme.colors.backgroundSecondary } }
				}
			};
		}

		// 計算分頁數據
		const startIndex = (page - 1) * pageSize;
		const endIndex = startIndex + pageSize;
		const displayDevices = onlineDevices.slice(startIndex, endIndex);
		const totalPages = Math.ceil(onlineDevices.length / pageSize);
		const hasNextPage = page < totalPages;
		const hasPrevPage = page > 1;

		const bubbles = displayDevices.map((device) => ({
			type: "bubble",
			header: {
				type: "box",
				layout: "vertical",
				contents: [this.createText(device.encodeDevName || "未知裝置", "xl", this.theme.colors.background, { weight: "bold" })],
				backgroundColor: this.theme.colors.primary,
				paddingAll: "20px"
			},
			body: {
				type: "box",
				layout: "vertical",
				contents: [
					{
						type: "box",
						layout: "vertical",
						margin: "md",
						spacing: "sm",
						contents: [
							this.createInfoRow("🆔 裝置ID:", device.encodeDevIndexCode),
							this.createInfoRow("📡 狀態:", device.status === 1 ? "🟢 線上" : "🔴 離線"),
							this.createInfoRow("🌐 IP位址:", `${device.encodeDevIp}:${device.encodeDevPort}`)
						]
					}
				],
				paddingAll: "16px"
			},
			footer: {
				type: "box",
				layout: "vertical",
				spacing: "sm",
				contents: [this.createText("💡 編碼設備", "sm", this.theme.colors.textMuted, { align: "center" })],
				paddingAll: "12px"
			}
		}));

		// 添加分頁控制卡片
		if (hasNextPage || hasPrevPage || totalPages > 1) {
			const paginationButtons = [];

			// 上一頁按鈕
			if (hasPrevPage) {
				paginationButtons.push(this.createButton("⬅️ 上一頁", `page_devices_${page - 1}`, "secondary"));
			}

			// 下一頁按鈕
			if (hasNextPage) {
				paginationButtons.push(this.createButton("下一頁 ➡️", `page_devices_${page + 1}`, "primary"));
			}

			const paginationCard = {
				type: "bubble",
				header: {
					type: "box",
					layout: "vertical",
					contents: [this.createText("📊 分頁資訊", "xl", this.theme.colors.background, { weight: "bold", align: "center" })],
					backgroundColor: this.theme.colors.info,
					paddingAll: "20px"
				},
				body: {
					type: "box",
					layout: "vertical",
					contents: [
						{
							type: "box",
							layout: "vertical",
							margin: "lg",
							spacing: "sm",
							contents: [
								this.createInfoRow("📄 當前頁面:", `第 ${page} 頁，共 ${totalPages} 頁`),
								this.createInfoRow("📋 顯示範圍:", `${startIndex + 1} - ${Math.min(endIndex, onlineDevices.length)}`),
								this.createInfoRow("📹 線上裝置:", `${onlineDevices.length} 個`)
							]
						}
					],
					paddingAll: "16px"
				},
				styles: {
					body: { backgroundColor: this.theme.colors.backgroundSecondary }
				}
			};

			// 只有當有按鈕時才添加 footer
			if (paginationButtons.length > 0) {
				paginationCard.footer = {
					type: "box",
					layout: "vertical",
					spacing: "sm",
					contents: paginationButtons
				};
			}

			bubbles.push(paginationCard);
		}

		return {
			type: "flex",
			altText: `📹 編碼裝置列表 (共 ${total} 個)`,
			contents: { type: "carousel", contents: bubbles }
		};
	}

	/**
	 * 創建攝影機 Flex Message
	 * @param {Array} cameras - 攝影機列表
	 * @param {number} total - 總數量
	 * @param {number} page - 當前頁碼 (從1開始)
	 * @param {number} pageSize - 每頁顯示數量
	 * @returns {Object} Flex Message 物件
	 */
	createCameraFlexMessage(cameras, total, page = 1, pageSize = 10) {
		const onlineCameras = cameras.filter((camera) => camera.status === 1);
		const offlineCount = cameras.length - onlineCameras.length;

		// 如果沒有上線攝影機，顯示提示訊息
		if (onlineCameras.length === 0) {
			return {
				type: "flex",
				altText: `📷 攝影機列表 (共 ${total} 個，全部離線)`,
				contents: {
					type: "bubble",
					header: this.createHeader("📷 攝影機狀態", "所有攝影機離線"),
					body: {
						type: "box",
						layout: "vertical",
						contents: [
							this.createText("⚠️ 無上線攝影機", "xl", this.theme.colors.error, { weight: "bold", align: "center" }),
							this.createText("目前沒有上線的攝影機", "md", this.theme.colors.textSecondary, { align: "center", margin: "md" }),
							{
								type: "box",
								layout: "vertical",
								margin: "lg",
								spacing: "sm",
								contents: [this.createInfoRow("📊 總攝影機數:", `${total} 個`), this.createInfoRow("🔴 離線攝影機:", `${offlineCount} 個`)]
							}
						]
					},
					styles: { body: { backgroundColor: this.theme.colors.backgroundSecondary } }
				}
			};
		}

		// 計算分頁數據
		const startIndex = (page - 1) * pageSize;
		const endIndex = startIndex + pageSize;
		const displayCameras = onlineCameras.slice(startIndex, endIndex);
		const totalPages = Math.ceil(onlineCameras.length / pageSize);
		const hasNextPage = page < totalPages;
		const hasPrevPage = page > 1;

		const bubbles = displayCameras.map((camera) => ({
			type: "bubble",
			header: {
				type: "box",
				layout: "vertical",
				contents: [this.createText(camera.cameraName || "未知攝影機", "xl", this.theme.colors.background, { weight: "bold" })],
				backgroundColor: this.theme.colors.success,
				paddingAll: "20px"
			},
			body: {
				type: "box",
				layout: "vertical",
				contents: [
					{
						type: "box",
						layout: "vertical",
						margin: "lg",
						spacing: "sm",
						contents: [
							this.createInfoRow("🆔 攝影機ID:", camera.cameraIndexCode),
							this.createInfoRow("📡 狀態:", camera.status === 1 ? "🟢 線上" : "🔴 離線"),
							this.createInfoRow("⚙️ 功能:", camera.capabilitySet || "無")
						]
					}
				],
				paddingAll: "16px"
			},
			footer: {
				type: "box",
				layout: "vertical",
				spacing: "sm",
				contents: [this.createButton("📸 擷圖", `capture_${camera.cameraIndexCode}`, "primary")],
				paddingAll: "12px"
			}
		}));

		// 添加分頁控制卡片
		if (hasNextPage || hasPrevPage || totalPages > 1) {
			const paginationButtons = [];

			// 上一頁按鈕
			if (hasPrevPage) {
				paginationButtons.push(this.createButton("⬅️ 上一頁", `page_cameras_${page - 1}`, "secondary"));
			}

			// 下一頁按鈕
			if (hasNextPage) {
				paginationButtons.push(this.createButton("下一頁 ➡️", `page_cameras_${page + 1}`, "primary"));
			}

			const paginationCard = {
				type: "bubble",
				header: {
					type: "box",
					layout: "vertical",
					contents: [this.createText("📊 分頁資訊", "xl", this.theme.colors.background, { weight: "bold", align: "center" })],
					backgroundColor: this.theme.colors.info,
					paddingAll: "20px"
				},
				body: {
					type: "box",
					layout: "vertical",
					contents: [
						{
							type: "box",
							layout: "vertical",
							margin: "lg",
							spacing: "sm",
							contents: [
								this.createInfoRow("📄 當前頁面:", `第 ${page} 頁，共 ${totalPages} 頁`),
								this.createInfoRow("📋 顯示範圍:", `${startIndex + 1} - ${Math.min(endIndex, onlineCameras.length)}`),
								this.createInfoRow("📷 線上攝影機:", `${onlineCameras.length} 個`)
							]
						}
					],
					paddingAll: "16px"
				},
				styles: {
					body: { backgroundColor: this.theme.colors.backgroundSecondary }
				}
			};

			// 只有當有按鈕時才添加 footer
			if (paginationButtons.length > 0) {
				paginationCard.footer = {
					type: "box",
					layout: "vertical",
					spacing: "sm",
					contents: paginationButtons
				};
			}

			bubbles.push(paginationCard);
		}

		return {
			type: "flex",
			altText: `📷 攝影機列表 (共 ${total} 個)`,
			contents: { type: "carousel", contents: bubbles }
		};
	}

	// ========== 事件 FlexMessage 相關方法 ==========

	/**
	 * 取得事件 ability，若缺失則回退至舊欄位或預設值
	 * @param {Object} eventData - 事件資料
	 * @returns {string|null} ability 值
	 */
	getEventAbility(eventData) {
		const eventType = eventData?.eventType;
		const abilityFromEvent = eventData?.ability || null;

		if (abilityFromEvent) {
			return abilityFromEvent;
		}

		const hcpClient = this.getHCPClient();
		const eventConfig = eventType != null ? hcpClient.getEventTypeConfig(eventType) : null;

		if (eventConfig?.ability) {
			return eventConfig.ability;
		}

		// 舊欄位向後相容
		if (eventConfig?.category) {
			switch (eventConfig.category) {
				case "faceMatch":
					return "event_face_match";
				case "accessControl":
					return "event_acs";
				case "temperature":
					return "event_vss";
				default:
					break;
			}
		}

		return null;
	}

	/**
	 * 建立事件 FlexMessage
	 * @param {Object} eventData - 完整的事件數據
	 * @returns {Promise<Object>} FlexMessage 物件
	 */
	async createEventFlexMessage(eventData) {
		const ability = this.getEventAbility(eventData);

		const handlerMap = {
			event_face_match: this.createFaceMatchFlexMessage.bind(this),
			event_acs: this.createAccessControlFlexMessage.bind(this),
			event_vss: this.createVssEventFlexMessage.bind(this)
		};

		if (ability && handlerMap[ability]) {
			return await handlerMap[ability](eventData);
		}

		// 預設回退為 event_vss 處理流程，確保舊資料仍可用
		return await this.createVssEventFlexMessage(eventData);
	}

	/**
	 * 建立事件 FlexMessage 的通用基礎方法
	 * 根據 HCP OpenAPI 規範，所有事件都遵循相同的通用處理原則
	 * @param {Object} eventData - 完整的事件數據
	 * @param {Object} options - 配置選項
	 * @param {Function} options.getImageUri - 取得圖片 URI 的函數，符合 HCP 規範的事件數據結構
	 * @param {string} options.imageType - 圖片類型標識，用於圖片處理和去重
	 * @returns {Promise<Object>} FlexMessage 物件
	 */
	async createBaseEventFlexMessage(eventData, options = {}) {
		const { eventType, happenTime, data, srcName, srcType } = eventData;
		const date = new Date(happenTime);
		const timeString = date.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });

		// 取得圖片資料（根據 HCP 規範，圖片 URI 位於 data 欄位中）
		let imageUrl = null;
		const { getImageUri, imageType } = options;
		if (getImageUri && typeof getImageUri === "function") {
			const targetUri = getImageUri(eventData, data);
			if (targetUri) {
				try {
					// 使用事件ID進行去重
					imageUrl = await this.fetchEventImage(targetUri, imageType || "generic_event", eventData.eventId);
				} catch (error) {
					LoggerService.error(`取得${imageType || "事件"}圖片失敗`, error);
				}
			}
		}

		// 建立 FlexMessage 內容
		const contents = [
			this.createText("🚨 YSCP 系統警報", "xl", this.theme.colors.error, { weight: "bold" }),
			{
				type: "box",
				layout: "vertical",
				margin: "md",
				spacing: "sm",
				contents: [
					this.createInfoRow("⏰ 時間:", timeString),
					this.createInfoRow("🔖 事件類型:", this.getHCPClient().getEventTypeName(eventType)),
					this.createInfoRow("📹 設備名稱:", srcName || "未知")
				]
			}
		];

		// 如果有圖片，添加圖片到 FlexMessage
		if (imageUrl) {
			contents.push({
				type: "image",
				url: imageUrl,
				size: "full",
				aspectRatio: "16:9",
				aspectMode: "cover",
				margin: "md"
			});
		}

		const bubble = {
			type: "bubble",
			body: {
				type: "box",
				layout: "vertical",
				contents: contents
			}
		};

		const footer = imageUrl ? this.createResendImageFooter(eventData.eventId) : null;
		if (footer) {
			bubble.footer = footer;
		}

		return {
			type: "flex",
			altText: `YSCP 系統警報 - ${this.getHCPClient().getEventTypeName(eventType)} (${srcName})`,
			contents: bubble
		};
	}

	/**
	 * 建立影像事件 (event_vss) 的 FlexMessage
	 * 包含 AIOP、溫度等影像能力事件
	 * @param {Object} eventData - 完整的事件數據
	 * @returns {Promise<Object>} FlexMessage 物件
	 */
	async createVssEventFlexMessage(eventData) {
		// 若佇列 enrich 尚未補到圖片，嘗試即時查詢一次（僅限 event_vss）
		if (!eventData.eventPicUri && !eventData._quickQueried) {
			try {
				eventData._quickQueried = true; // 避免重複查
				const hcp = this.getHCPClient();
				const res = await hcp.getEventRecords({ eventIndexCode: eventData.eventId, pageNo: 1, pageSize: 1 });
				if (res && res.code === "0" && res.data?.list?.length) {
					const first = res.data.list[0];
					eventData.eventPicUri =
						first.eventPicUri || (Array.isArray(first.eventPicList) ? first.eventPicList.find((x) => x?.eventPicUri)?.eventPicUri : null) || null;
				}
			} catch (err) {
				LoggerService.warn("quick query event_vss image failed", err);
			}
		}

		return await this.createBaseEventFlexMessage(eventData, {
			getImageUri: (eventData, data) => {
				if (eventData.eventPicUri) return eventData.eventPicUri;
				return data?.eventPicUri || data?.picUri || data?.alarmResult?.faces?.URL || null;
			},
			imageType: "event_vss"
		});
	}

	/**
	 * 建立人臉比對事件的 FlexMessage
	 * 根據 HCP OpenAPI 規範：事件代碼 131659，使用 Face Picture Comparison Event Message 格式
	 * 圖片 URI 位於 data.alarmResult.faces.URL
	 * @param {Object} eventData - 完整的事件數據
	 * @returns {Promise<Object>} FlexMessage 物件
	 */
	async createFaceMatchFlexMessage(eventData) {
		return await this.createBaseEventFlexMessage(eventData, {
			getImageUri: (eventData, data) => {
				// 根據 HCP 規範：Face Picture Comparison Event Message
				// 圖片位於 alarmResult.faces.URL
				const faces = data?.alarmResult?.faces;
				return faces?.URL || null;
			},
			imageType: "face_match"
		});
	}

	/**
	 * 建立門禁事件的 FlexMessage
	 * 根據 HCP OpenAPI 規範：事件代碼 196893，使用 Access Control Event Message 格式
	 * 圖片 URI 位於 data.picUri
	 * @param {Object} eventData - 完整的事件數據
	 * @returns {Promise<Object>} FlexMessage 物件
	 */
	async createAccessControlFlexMessage(eventData) {
		return await this.createBaseEventFlexMessage(eventData, {
			getImageUri: (eventData, data) => {
				// 根據 HCP 規範：Access Control Event Message
				// 圖片位於 data.picUri
				return data?.picUri || null;
			},
			imageType: "access_control"
		});
	}

	/**
	 * 取得事件圖片
	 * @param {string} picUri - 圖片 URI
	 * @param {string} eventType - 事件類型標識
	 * @param {string|null} eventId - 事件 ID
	 * @returns {Promise<string|null>} 圖片 URL 或 null
	 */
	async fetchEventImage(picUri, eventType, eventId = null) {
		try {
			const result = await this.getHCPClient().getEventImage({ picUri });

			// 處理不同的 API 回應格式
			let imageData = null;

			if (result && result.code === "0" && result.data) {
				// 標準 JSON 格式回應
				imageData = result.data;
			} else if (result && result.data && !result.code) {
				// 沒有 code 欄位但有 data 的情況
				imageData = result.data;
			} else if (typeof result === "string" && result.startsWith("data:image/")) {
				// 直接返回 base64 字串的情況
				imageData = result;
			} else {
				// 錯誤記錄
				const errorMsg = result ? `API 錯誤 - code: ${result.code}, msg: ${result.msg || "無錯誤訊息"}` : "API 無回應";
				LoggerService.warn(`取得事件圖片失敗: ${errorMsg}`);
				return null;
			}

			if (imageData) {
				// 使用統一的圖片處理方法
				const timestamp = Date.now();
				const fileName = `event_${eventType}_${timestamp}`;
				const imageUrl = this.processEventImage(imageData, fileName, eventId);

				if (imageUrl) {
					// 使用事件ID進行去重
					return imageUrl;
				} else {
					LoggerService.warn("圖片儲存失敗");
					return null;
				}
			}
		} catch (error) {
			LoggerService.error("取得事件圖片時發生錯誤", error);
			return null;
		}
	}

	/**
	 * 處理事件圖片（委託給 LineBotService）
	 * @param {string} imageData - 圖片資料
	 * @param {string} fileName - 檔案名稱
	 * @returns {string|null} 圖片 URL 或 null
	 */
	processEventImage(imageData, fileName, eventId = null) {
		// 委託給 LineBotService 的圖片處理方法
		const LineBotService = require("./lineBotService");
		const lineBotService = LineBotService.getService();
		if (!lineBotService) {
			return null;
		}

		const imageUrl = lineBotService.processCameraImage(imageData, fileName);
		if (imageUrl && eventId && typeof lineBotService.registerEventImage === "function") {
			lineBotService.registerEventImage(eventId, imageUrl);
		}
		return imageUrl;
	}

	/**
	 * 創建用戶操作結果 Flex Message（批准、拒絕、移除）
	 * @param {string} operation - 操作類型：'approve'（批准）、'reject'（拒絕）、'remove'（移除）
	 * @param {Object} userInfo - 用戶資訊 { id, displayName, pictureUrl, role }
	 * @returns {Object} Flex Message 物件
	 */
	createUserOperationResultFlexMessage(operation, userInfo = {}) {
		const { id, displayName, pictureUrl, role } = userInfo;
		const userId = id || "未知用戶";
		const userName = displayName || "未知用戶";
		const userImage = pictureUrl || "https://via.placeholder.com/120x120/cccccc/666666?text=👤";

		// 根據操作類型設定不同的配置
		const operationConfig = {
			approve: {
				icon: "✅",
				title: "用戶已批准",
				headerColor: this.theme.colors.success,
				message: "該用戶現在可以使用 Line Bot 服務，並可接收 HCP 事件通知。",
				status: "通知目標",
				altText: `✅ 已批准用戶: ${userName}`
			},
			reject: {
				icon: "❌",
				title: "用戶已拒絕",
				headerColor: this.theme.colors.error,
				message: "該用戶無法使用 Line Bot 服務，也不會接收任何通知。",
				status: "已封鎖",
				altText: `❌ 已拒絕用戶: ${userName}`
			},
			remove: {
				icon: "🗑️",
				title: "用戶已移除",
				headerColor: this.theme.colors.warning,
				message: "該用戶已從通知列表中移除，將無法再接收 HCP 事件通知。",
				status: "已封鎖",
				altText: `🗑️ 已移除用戶: ${userName}`
			}
		};

		const config = operationConfig[operation] || operationConfig.approve;

		return {
			type: "flex",
			altText: config.altText,
			contents: {
				type: "bubble",
				header: {
					type: "box",
					layout: "vertical",
					contents: [this.createText(`${config.icon} ${config.title}`, "xl", this.theme.colors.background, { weight: "bold" })],
					backgroundColor: config.headerColor,
					paddingAll: "20px"
				},
				body: {
					type: "box",
					layout: "vertical",
					spacing: "md",
					contents: [
						{
							type: "image",
							url: userImage,
							size: "lg",
							aspectMode: "cover",
							aspectRatio: "1:1",
							margin: "md"
						},
						this.createText("👤 用戶資訊", "md", null, { weight: "bold", margin: "md" }),
						this.createInfoRow("名稱:", userName),
						this.createInfoRow("狀態:", config.status)
					]
				},
				footer: {
					type: "box",
					layout: "vertical",
					spacing: "sm",
					contents: [this.createText(config.message, "sm", this.theme.colors.textSecondary, { wrap: true, margin: "md" })],
					paddingAll: "20px",
					backgroundColor: this.theme.colors.backgroundSecondary
				}
			}
		};
	}
}

module.exports = FlexMessageService;
