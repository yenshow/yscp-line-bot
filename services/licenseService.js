/**
 * 授權驗證服務（專業版）
 * 提供 License Key 獲取、驗證、儲存等功能
 * 支援線上驗證功能
 */

const crypto = require("crypto");
const os = require("os");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const FileSystemService = require("./fileSystemService");
const LoggerService = require("./loggerService");

/**
 * 讀取 .env 檔案內容（用於 Electron 主進程環境）
 * @param {string} envPath - .env 檔案路徑
 * @returns {Object} 環境變數物件
 */
function readEnvFile(envPath) {
	const values = {};
	if (fs.existsSync(envPath)) {
		try {
			const content = fs.readFileSync(envPath, "utf-8");
			const lines = content.split("\n");
			lines.forEach((line) => {
				line = line.trim();
				if (line && !line.startsWith("#")) {
					const match = line.match(/^([^=]+)=(.*)$/);
					if (match) {
						const key = match[1].trim();
						const value = match[2].trim().replace(/^["']|["']$/g, "");
						values[key] = value;
					}
				}
			});
		} catch (error) {
			console.error("[LicenseService] 讀取 .env 檔案失敗:", error);
		}
	}
	return values;
}

/**
 * 獲取環境變數值（優先從 process.env，如果沒有則從 .env 檔案讀取）
 * @param {string} key - 環境變數鍵名
 * @param {string} defaultValue - 預設值
 * @returns {string} 環境變數值
 */
function getEnvValue(key, defaultValue = null) {
	// 優先使用 process.env（已由 dotenv 載入）
	if (process.env[key]) {
		return process.env[key];
	}

	// 如果 process.env 沒有，嘗試從 .env 檔案讀取
	// 優先順序：1. Electron 主進程的安裝目錄 2. 當前工作目錄 3. 相對於服務目錄的父目錄
	const envPaths = [];

	// 1. 嘗試從 Electron 主進程的安裝目錄讀取（打包後）
	try {
		const { app } = require("electron");
		if (app) {
			const appPath = app.isPackaged ? path.dirname(process.execPath) : path.dirname(__dirname);
			envPaths.push(path.join(appPath, ".env"));
		}
	} catch (error) {
		// 不在 Electron 環境中，忽略
	}

	// 2. 嘗試從當前工作目錄讀取
	try {
		const cwd = process.cwd();
		envPaths.push(path.join(cwd, ".env"));
	} catch (error) {
		// 忽略
	}

	// 3. 嘗試從相對於服務目錄的父目錄讀取（開發環境）
	try {
		envPaths.push(path.join(__dirname, "..", ".env"));
	} catch (error) {
		// 忽略
	}

	// 依序嘗試讀取
	for (const envPath of envPaths) {
		try {
			const envValues = readEnvFile(envPath);
			if (envValues[key]) {
				return envValues[key];
			}
		} catch (error) {
			// 繼續嘗試下一個路徑
		}
	}

	return defaultValue;
}

class LicenseService {
	constructor() {
		// 獲取數據目錄路徑（在 Electron 環境中需要特殊處理）
		let dataDir = FileSystemService.getDirectory("data");

		// 在 Electron 環境中，如果路徑指向 asar 內部，使用應用程式數據目錄
		try {
			const { app } = require("electron");
			if (app && app.isPackaged) {
				// 打包後：數據應該在應用程式目錄，而不是 asar 內部
				const appDataPath =
					process.platform === "darwin" ? path.resolve(path.dirname(process.execPath), "..", "Resources") : path.resolve(path.dirname(process.execPath));

				// 檢查原路徑是否在 asar 中
				if (dataDir && dataDir.includes(".asar")) {
					// 使用應用程式數據目錄
					dataDir = path.join(appDataPath, "data");
					// 確保目錄存在
					if (!fs.existsSync(dataDir)) {
						fs.mkdirSync(dataDir, { recursive: true });
					}
				}
			}
		} catch (error) {
			// 不在 Electron 環境中，使用預設路徑
		}

		this.licenseFilePath = path.join(dataDir, ".license");

		// 授權密鑰（用於加密授權檔案，實際應用中應從環境變數或安全配置讀取）
		this.encryptionKey = getEnvValue("LICENSE_ENCRYPTION_KEY", "default_encryption_key_change_in_production");

		// 授權伺服器配置（支援從 .env 檔案讀取）
		this.licenseServerUrl = getEnvValue("LICENSE_SERVER_URL", "https://api.yenshow.com");
		const onlineModeValue = getEnvValue("LICENSE_ONLINE_MODE", "true");
		this.onlineMode = onlineModeValue !== "false"; // 預設啟用線上模式
		this.offlineGracePeriod = parseInt(getEnvValue("LICENSE_OFFLINE_GRACE_PERIOD", "86400000")); // 24小時
	}

	/**
	 * 發送 HTTP 請求到授權伺服器（內部方法）
	 * @param {string} endpoint - API 端點
	 * @param {Object} data - 請求資料
	 * @param {Function} responseTransformer - 回應轉換函數
	 * @returns {Promise<Object>} 請求結果
	 */
	async _makeRequest(endpoint, data, responseTransformer = null) {
		if (!this.onlineMode) {
			return { success: false, error: "線上模式已停用" };
		}

		try {
			const url = new URL(`${this.licenseServerUrl}${endpoint}`);
			const postData = JSON.stringify(data);

			const options = {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Content-Length": Buffer.byteLength(postData)
				},
				timeout: 10000 // 10秒超時
			};

			return new Promise((resolve, reject) => {
				const client = url.protocol === "https:" ? https : http;

				// 如果是 HTTPS，配置 Agent 以處理 SSL 證書
				if (url.protocol === "https:") {
					const httpsAgent = new https.Agent({
						rejectUnauthorized: getEnvValue("NODE_TLS_REJECT_UNAUTHORIZED", "1") !== "0" // 預設驗證證書
					});
					options.agent = httpsAgent;
				}

				const req = client.request(url, options, (res) => {
					let responseData = "";
					const statusCode = res.statusCode;

					res.on("data", (chunk) => {
						responseData += chunk;
					});
					res.on("end", () => {
						try {
							// 記錄原始回應（用於調試）
							LoggerService.system(`授權 API 回應 (${endpoint}): HTTP ${statusCode}, 回應長度: ${responseData.length}`);

							// 檢查 HTTP 狀態碼
							if (statusCode < 200 || statusCode >= 300) {
								// HTTP 錯誤狀態碼
								let errorMessage = `HTTP ${statusCode}: ${res.statusMessage || "請求失敗"}`;

								// 嘗試解析錯誤回應
								try {
									const errorResponse = JSON.parse(responseData);
									errorMessage = errorResponse.error || errorResponse.message || errorMessage;

									LoggerService.warn(`授權 API 請求失敗 (${endpoint}): HTTP ${statusCode}`, {
										statusCode,
										error: errorMessage,
										response: errorResponse
									});

									resolve({
										success: false,
										error: errorMessage,
										code: errorResponse.code,
										statusCode: statusCode
									});
									return;
								} catch (parseError) {
									// 無法解析錯誤回應，使用預設錯誤訊息
									LoggerService.warn(`授權 API 請求失敗 (${endpoint}): HTTP ${statusCode}`, {
										statusCode,
										responseData: responseData.substring(0, 200)
									});

									resolve({
										success: false,
										error: errorMessage,
										statusCode: statusCode
									});
									return;
								}
							}

							// HTTP 狀態碼正常，解析回應
							const response = JSON.parse(responseData);

							// 記錄回應內容（用於調試）
							LoggerService.system(`授權 API 回應內容 (${endpoint}):`, JSON.stringify(response).substring(0, 200));

							// 適配新後端的統一回應格式 { success, message, result: { ... } }
							if (response.success && response.result) {
								LoggerService.system(`授權 API 成功 (${endpoint}): 從 result 中提取資料`);
								if (responseTransformer) {
									const transformed = responseTransformer(response.result);
									LoggerService.system(`授權 API 轉換後結果 (${endpoint}):`, JSON.stringify(transformed).substring(0, 200));
									resolve(transformed);
								} else {
									resolve(response.result);
								}
							} else if (response.success === false) {
								// 後端返回錯誤（即使 HTTP 狀態碼是 200）
								LoggerService.warn(`授權 API 返回錯誤 (${endpoint}):`, response);
								resolve({
									success: false,
									error: response.error || response.message || "未知錯誤",
									code: response.code
								});
							} else {
								// 回應格式不符合預期
								LoggerService.warn(`授權 API 回應格式不符合預期 (${endpoint}):`, response);
								resolve(response);
							}
						} catch (error) {
							LoggerService.error(`解析授權 API 回應失敗 (${endpoint}):`, {
								statusCode,
								responseData: responseData.substring(0, 200),
								error: error.message
							});
							reject(new Error(`解析回應失敗: ${error.message}`));
						}
					});
				});

				req.on("error", (error) => {
					LoggerService.error(`授權 API 請求錯誤 (${endpoint}):`, error);
					reject(error);
				});

				req.on("timeout", () => {
					req.destroy();
					LoggerService.warn(`授權 API 請求超時 (${endpoint})`);
					reject(new Error("請求超時"));
				});

				req.write(postData);
				req.end();
			});
		} catch (error) {
			LoggerService.error(`API 請求失敗 (${endpoint}):`, error);
			return {
				success: false,
				error: error.message,
				offline: true
			};
		}
	}

	/**
	 * 根據 SerialNumber 從伺服器獲取 License Key
	 * @param {string} serialNumber - 序號
	 * @returns {Promise<Object>} 包含 licenseKey 的結果
	 */
	async getLicenseKeyFromServer(serialNumber) {
		if (!serialNumber) {
			return { success: false, error: "SerialNumber 不能為空" };
		}

		return this._makeRequest("/api/license/get-license-key", { serialNumber }, (result) => ({
			success: true,
			licenseKey: result.licenseKey,
			serialNumber: result.serialNumber,
			status: result.status
		}));
	}

	/**
	 * 線上驗證授權
	 * @param {string} licenseKey - License Key
	 * @returns {Promise<Object>} 驗證結果
	 */
	async validateOnline(licenseKey) {
		if (!licenseKey) {
			return { success: false, error: "License Key 不能為空" };
		}

		try {
			const result = await this._makeRequest("/api/license/validate", { licenseKey }, (result) => ({
				success: true,
				valid: result.valid,
				error: result.error,
				code: result.code,
				status: result.status,
				license: result.license
			}));
			return result;
		} catch (error) {
			// 處理連線錯誤（如 ECONNREFUSED, ENOTFOUND, timeout 等）
			let errorMessage = error.message || "無法連接到授權伺服器";
			if (error.code === "ECONNREFUSED") {
				errorMessage = "無法連接到授權伺服器，請檢查授權伺服器是否運行";
			} else if (error.code === "ENOTFOUND") {
				errorMessage = "無法解析授權伺服器地址，請檢查 LICENSE_SERVER_URL 配置";
			} else if (error.message && error.message.includes("timeout")) {
				errorMessage = "連線超時，請檢查網路連接或授權伺服器狀態";
			}
			return {
				success: false,
				error: errorMessage,
				code: "CONNECTION_ERROR"
			};
		}
	}

	/**
	 * 啟用授權（線上）
	 * @param {string} licenseKey - License Key
	 * @returns {Promise<Object>} 啟用結果
	 */
	async activateOnline(licenseKey) {
		if (!licenseKey) {
			return { success: false, error: "License Key 不能為空" };
		}

		return this._makeRequest("/api/license/activate", { licenseKey }, (result) => ({
			success: true,
			message: result.message || "授權啟用成功",
			activatedAt: result.activatedAt
		}));
	}

	/**
	 * 加密資料
	 * @param {string} text - 要加密的文字
	 * @returns {string} 加密後的 Base64 字串
	 */
	encrypt(text) {
		try {
			const algorithm = "aes-256-cbc";
			const key = crypto.scryptSync(this.encryptionKey, "salt", 32);
			const iv = crypto.randomBytes(16);
			const cipher = crypto.createCipheriv(algorithm, key, iv);

			let encrypted = cipher.update(text, "utf8", "hex");
			encrypted += cipher.final("hex");

			// 將 IV 和加密資料組合在一起
			return iv.toString("hex") + ":" + encrypted;
		} catch (error) {
			LoggerService.error("加密失敗", error);
			throw error;
		}
	}

	/**
	 * 解密資料
	 * @param {string} encrypted - 加密的文字
	 * @returns {string} 解密後的文字
	 */
	decrypt(encrypted) {
		try {
			const algorithm = "aes-256-cbc";
			const key = crypto.scryptSync(this.encryptionKey, "salt", 32);
			const parts = encrypted.split(":");

			if (parts.length !== 2) {
				throw new Error("加密資料格式錯誤");
			}

			const iv = Buffer.from(parts[0], "hex");
			const encryptedText = parts[1];
			const decipher = crypto.createDecipheriv(algorithm, key, iv);

			let decrypted = decipher.update(encryptedText, "hex", "utf8");
			decrypted += decipher.final("utf8");

			return decrypted;
		} catch (error) {
			LoggerService.error("解密失敗", error);
			throw error;
		}
	}

	/**
	 * 儲存授權資訊（從 SerialNumber 獲取 License Key 並啟用）
	 * @param {string} serialNumber - 序號
	 * @param {Object} additionalData - 額外資料（可選）
	 * @param {boolean} activateOnline - 是否線上啟用（預設：true）
	 * @returns {Promise<boolean>} 是否成功
	 */
	async saveLicense(serialNumber, additionalData = {}, activateOnline = true) {
		try {
			if (!serialNumber) {
				throw new Error("SerialNumber 不能為空");
			}

			// 檢查是否已經存在授權檔案
			const existingLicense = this.loadLicense();
			if (existingLicense) {
				// 如果已有授權檔案，檢查是否為相同的 SerialNumber 和 LicenseKey
				if (additionalData && additionalData.licenseKey) {
					// 手動輸入模式：檢查 SerialNumber 和 LicenseKey 是否都匹配
					if (existingLicense.serialNumber === serialNumber && existingLicense.licenseKey === additionalData.licenseKey) {
						LoggerService.system(`授權已存在且匹配: SerialNumber=${serialNumber}，跳過儲存和驗證`);
						return true; // 已存在相同授權，直接返回成功（不重新驗證，避免後端標記為已使用）
					}
				} else if (existingLicense.serialNumber === serialNumber) {
					// 從伺服器獲取模式：只檢查 SerialNumber
					LoggerService.system(`授權已存在: SerialNumber=${serialNumber}，跳過儲存`);
					return true; // 已存在相同授權，直接返回成功
				}
				
				// 不同的授權，需要先刪除舊授權
				LoggerService.system(`發現不同的授權，將替換舊授權: ${existingLicense.serialNumber} -> ${serialNumber}`);
				try {
					FileSystemService.deleteFile(this.licenseFilePath);
				} catch (error) {
					LoggerService.warn("刪除舊授權檔案失敗", error);
				}
			}

			let licenseKey = null;

			// 如果 additionalData 中包含 licenseKey，直接使用（手動輸入模式）
			if (additionalData && additionalData.licenseKey) {
				licenseKey = additionalData.licenseKey;
				LoggerService.system(`使用手動輸入的 License Key: SerialNumber=${serialNumber}`);
				
				// 驗證 LicenseKey 是否有效（連接到授權伺服器驗證）
				// 注意：驗證不會標記為已使用，只有 activateOnline 才會
				if (this.onlineMode) {
					try {
						LoggerService.system(`開始驗證 License Key: SerialNumber=${serialNumber}`);
						const validateResult = await this.validateOnline(licenseKey);
						
						if (!validateResult.success || !validateResult.valid) {
							const errorMsg = validateResult.error || "License Key 驗證失敗";
							const errorCode = validateResult.code || "VALIDATION_FAILED";
							LoggerService.error(`License Key 驗證失敗: ${errorMsg} (${errorCode})`, validateResult);
							throw new Error(errorMsg);
						}
						
						// 驗證 SerialNumber 是否匹配
						if (validateResult.license && validateResult.license.serialNumber) {
							if (validateResult.license.serialNumber !== serialNumber) {
								const errorMsg = `SerialNumber 不匹配：輸入的 ${serialNumber} 與授權中的 ${validateResult.license.serialNumber} 不一致`;
								LoggerService.error(errorMsg);
								throw new Error(errorMsg);
							}
						}
						
						LoggerService.system(`License Key 驗證成功: SerialNumber=${serialNumber}`);
					} catch (error) {
						LoggerService.error("License Key 驗證失敗", error);
						throw error; // 重新拋出錯誤，保留原始錯誤訊息
					}
				}
			} else {
				// 從伺服器獲取 License Key
				if (this.onlineMode) {
					try {
						LoggerService.system(`開始從伺服器獲取 License Key: SerialNumber=${serialNumber}`);

						const keyResult = await this.getLicenseKeyFromServer(serialNumber);
						LoggerService.system(`getLicenseKeyFromServer 返回結果:`, JSON.stringify(keyResult).substring(0, 200));

						if (keyResult && keyResult.success && keyResult.licenseKey) {
							licenseKey = keyResult.licenseKey;
							LoggerService.system(`成功從伺服器獲取 License Key: ${licenseKey}`);
						} else {
							const errorMsg = (keyResult && keyResult.error) || "無法從伺服器獲取 License Key";
							const errorCode = (keyResult && keyResult.code) || "UNKNOWN_ERROR";
							LoggerService.error(`從伺服器獲取 License Key 失敗: ${errorMsg} (${errorCode})`, keyResult);
							throw new Error(errorMsg);
						}
					} catch (error) {
						LoggerService.error("從伺服器獲取 License Key 失敗", error);
						throw error; // 直接拋出錯誤，保留原始錯誤訊息
					}
				} else {
					throw new Error("離線模式無法獲取 License Key，請啟用線上模式");
				}
			}

			if (!licenseKey) {
				throw new Error("License Key 不能為空");
			}

			// 先準備授權資料（不啟用）
			const licenseData = {
				serialNumber,
				licenseKey,
				activatedAt: new Date().toISOString(),
				lastOnlineValidation: new Date().toISOString(),
				...additionalData
			};

			// 加密儲存
			let encrypted;
			try {
				encrypted = this.encrypt(JSON.stringify(licenseData));
			} catch (error) {
				LoggerService.error("加密授權資料失敗", error);
				throw new Error(`加密授權資料失敗: ${error.message}`);
			}

			// 確保目錄存在
			const dirPath = path.dirname(this.licenseFilePath);
			try {
				if (!fs.existsSync(dirPath)) {
					fs.mkdirSync(dirPath, { recursive: true });
					LoggerService.system(`已建立授權目錄: ${dirPath}`);
				}
			} catch (mkdirError) {
				LoggerService.error(`無法建立授權目錄: ${dirPath}`, mkdirError);
				throw new Error(`無法建立授權目錄: ${mkdirError.message}`);
			}

			// 嘗試直接寫入檔案（不使用 FileSystemService，因為可能有路徑問題）
			try {
				fs.writeFileSync(this.licenseFilePath, encrypted, "utf8");
				LoggerService.system(`授權檔案已寫入: ${this.licenseFilePath}`);
			} catch (writeError) {
				// 檔案寫入失敗，檢查可能的原因
				let errorMsg = `無法寫入授權檔案: ${this.licenseFilePath}`;

				// 檢查目錄權限
				try {
					if (!fs.existsSync(dirPath)) {
						errorMsg += "\n原因：目錄不存在";
					} else {
						// 檢查是否有寫入權限
						try {
							fs.accessSync(dirPath, fs.constants.W_OK);
							errorMsg += "\n原因：檔案寫入失敗（可能是權限問題或磁碟空間不足）";
						} catch (accessError) {
							errorMsg += "\n原因：沒有寫入權限";
						}
					}
				} catch (checkError) {
					errorMsg += `\n原因：${checkError.message}`;
				}

				// 添加詳細的調試資訊
				errorMsg += `\n檔案路徑：${this.licenseFilePath}`;
				errorMsg += `\n目錄路徑：${dirPath}`;

				LoggerService.error(errorMsg, {
					filePath: this.licenseFilePath,
					dirPath: dirPath,
					error: writeError.message,
					code: writeError.code
				});
				throw new Error(errorMsg);
			}

			LoggerService.system(`授權已儲存: SerialNumber=${serialNumber}, LicenseKey=${licenseKey}`);

			// 儲存成功後，再進行線上啟用（如果啟用）
			// 這樣可以確保只有在儲存成功後才標記授權為已使用
			if (this.onlineMode && activateOnline && licenseKey) {
				try {
					LoggerService.system(`開始線上啟用授權: SerialNumber=${serialNumber}`);
					const activateResult = await this.activateOnline(licenseKey);
					if (!activateResult.success) {
						LoggerService.warn("線上啟用失敗", activateResult.error);
						// 不阻止儲存，但記錄警告（授權已儲存，只是啟用失敗）
					} else {
						LoggerService.system("授權線上啟用成功");
					}
				} catch (error) {
					LoggerService.warn("線上啟用錯誤", error);
					// 不阻止儲存，但記錄警告（授權已儲存，只是啟用失敗）
				}
			}

			return true;
		} catch (error) {
			LoggerService.error("儲存授權失敗", error);
			// 重新拋出錯誤，讓調用者可以獲取詳細錯誤訊息
			throw error;
		}
	}

	/**
	 * 載入授權資訊
	 * @returns {Object|null} 授權資料或 null
	 */
	loadLicense() {
		try {
			if (!FileSystemService.fileExists(this.licenseFilePath)) {
				return null;
			}

			const encrypted = FileSystemService.readFile(this.licenseFilePath);
			if (!encrypted) {
				return null;
			}

			const decrypted = this.decrypt(encrypted);
			const licenseData = JSON.parse(decrypted);

			return licenseData;
		} catch (error) {
			LoggerService.error("載入授權失敗", error);
			return null;
		}
	}

	/**
	 * 驗證並載入授權（增強版：支援線上驗證）
	 * @param {boolean} strictMode - 嚴格模式（已廢棄，保留用於相容性）
	 * @param {boolean} requireOnline - 是否要求線上驗證（預設：false，允許離線降級）
	 * @returns {Promise<Object>} 驗證結果
	 */
	async validateAndLoadLicense(strictMode = true, requireOnline = false) {
		try {
			const licenseData = this.loadLicense();
			if (!licenseData) {
				return {
					valid: false,
					reason: "授權檔案不存在",
					code: "NO_LICENSE"
				};
			}

			if (!licenseData.licenseKey) {
				return {
					valid: false,
					reason: "授權檔案中缺少 License Key",
					code: "NO_LICENSE_KEY"
				};
			}

			// 線上驗證（如果啟用）
			if (this.onlineMode && licenseData.licenseKey) {
				try {
					const onlineResult = await this.validateOnline(licenseData.licenseKey);

					if (onlineResult.success && onlineResult.valid) {
						// 更新最後驗證時間
						licenseData.lastOnlineValidation = new Date().toISOString();
						this.saveLicenseData(licenseData);

						return {
							valid: true,
							licenseData: licenseData,
							code: "VALID_ONLINE",
							online: true
						};
					} else if (requireOnline) {
						// 要求線上驗證但失敗
						return {
							valid: false,
							reason: onlineResult.error || "線上驗證失敗",
							code: onlineResult.code || "ONLINE_VALIDATION_FAILED",
							online: false
						};
					} else {
						// 線上驗證失敗，但允許離線降級
						LoggerService.warn("線上驗證失敗，使用離線模式");
					}
				} catch (error) {
					LoggerService.warn("線上驗證錯誤，使用離線模式", error);
					if (requireOnline) {
						return {
							valid: false,
							reason: `線上驗證錯誤: ${error.message}`,
							code: "ONLINE_VALIDATION_ERROR",
							online: false
						};
					}
				}
			}

			// 離線驗證（降級模式）- 僅檢查授權檔案是否存在
			// 檢查離線寬限期
			if (licenseData.lastOnlineValidation) {
				const lastValidation = new Date(licenseData.lastOnlineValidation);
				const now = new Date();
				const offlineTime = now - lastValidation;

				if (offlineTime > this.offlineGracePeriod) {
					return {
						valid: false,
						reason: "離線時間過長，請重新連線驗證",
						code: "OFFLINE_GRACE_PERIOD_EXCEEDED",
						offlineTime: offlineTime
					};
				}
			}

			return {
				valid: true,
				licenseData: licenseData,
				code: "VALID_OFFLINE",
				online: false
			};
		} catch (error) {
			LoggerService.error("驗證授權失敗", error);
			return {
				valid: false,
				reason: `授權驗證過程發生錯誤: ${error.message}`,
				code: "VALIDATION_ERROR"
			};
		}
	}

	/**
	 * 儲存授權資料（內部方法）
	 * @param {Object} licenseData - 授權資料
	 */
	saveLicenseData(licenseData) {
		try {
			const encrypted = this.encrypt(JSON.stringify(licenseData));
			FileSystemService.writeFile(this.licenseFilePath, encrypted);
		} catch (error) {
			LoggerService.error("儲存授權資料失敗", error);
		}
	}

	/**
	 * 刪除授權檔案
	 * @returns {boolean} 是否成功
	 */
	deleteLicense() {
		try {
			if (FileSystemService.fileExists(this.licenseFilePath)) {
				return FileSystemService.deleteFile(this.licenseFilePath);
			}
			return true;
		} catch (error) {
			LoggerService.error("刪除授權失敗", error);
			return false;
		}
	}

	/**
	 * 獲取授權狀態（不驗證，僅讀取）
	 * @returns {Object} 授權狀態
	 */
	getLicenseStatus() {
		const licenseData = this.loadLicense();

		return {
			exists: licenseData !== null,
			hasLicense: licenseData !== null,
			licenseData: licenseData
				? {
						serialNumber: licenseData.serialNumber,
						licenseKey: licenseData.licenseKey ? licenseData.licenseKey.substring(0, 8) + "..." : null,
						activatedAt: licenseData.activatedAt,
						lastOnlineValidation: licenseData.lastOnlineValidation
				  }
				: null
		};
	}
}

// 導出單例實例
module.exports = new LicenseService();
