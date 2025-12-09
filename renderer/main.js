const { ipcRenderer } = require("electron");

let currentStep = 1;

// 步驟管理
function showStep(step) {
	// 隱藏所有步驟內容
	document.querySelectorAll(".step-content").forEach((el) => {
		el.classList.remove("active");
	});

	// 顯示當前步驟
	document.getElementById("step" + step).classList.add("active");

	// 更新步驟指示器
	document.querySelectorAll(".step").forEach((el, index) => {
		el.classList.remove("active", "completed");
		if (index + 1 < step) {
			el.classList.add("completed");
		} else if (index + 1 === step) {
			el.classList.add("active");
		}
	});

	// 更新按鈕顯示
	document.getElementById("prevBtn").style.display = step > 1 ? "block" : "none";
	document.getElementById("nextBtn").style.display = step < 4 ? "block" : "none";

	// 載入步驟特定數據
	if (step === 2) {
		checkConfigStatus();
		// 自動刷新配置值（響應式更新）
		ipcRenderer.send("load-config-values");
	} else if (step === 3) {
		clearTestLogs();
	} else if (step === 4) {
		checkServiceStatus();
	}
}

let step1Completed = false;
let step2Completed = false;
let step3Completed = false;
let isInitializing = true; // 標記是否正在初始化

function nextStep() {
	// 驗證當前步驟是否完成
	if (currentStep === 1 && !step1Completed) {
		alert("請先完成授權啟用");
		return;
	} else if (currentStep === 2 && !step2Completed) {
		alert("請先建立配置檔案");
		return;
	} else if (currentStep === 3 && !step3Completed) {
		alert("請先完成服務測試");
		return;
	}

	if (currentStep < 4) {
		currentStep++;
		showStep(currentStep);
	}
}

function previousStep() {
	if (currentStep > 1) {
		currentStep--;
		showStep(currentStep);
	}
}

// Step 1: 授權相關
function activateLicense() {
	const serialNumber = document.getElementById("serialNumberInput").value.trim();
	if (!serialNumber) {
		showStatus("step1-status", "請輸入 SerialNumber", "error");
		return;
	}

	showStatus("step1-status", "正在啟用授權...", "info");
	ipcRenderer.send("activate-license", serialNumber);
}

function checkLicenseStatus() {
	ipcRenderer.send("check-license");
}

// Step 2: 配置相關
const configItems = [
	{
		section: "YSCP API 配置",
		items: [
			{ key: "YSCP_HOST", required: true, description: "YSCP 伺服器主機地址", example: "https://yscp.yenshow.com" },
			{ key: "YSCP_AK", required: true, description: "YSCP Access Key（從 YSCP 系統管理員處獲取）", example: "18371575" },
			{ key: "YSCP_SK", required: true, description: "YSCP Secret Key（從 YSCP 系統管理員處獲取）", example: "T71HkApJGkpVRp3r7RcT" }
		]
	},
	{
		section: "Line Bot 配置",
		items: [
			{
				key: "LINE_CHANNEL_ACCESS_TOKEN",
				required: true,
				description: "Line Bot Channel Access Token（從 Line Developers Console 獲取）",
				example: "qvTEkDbD0BAiKL0+H3ys+..."
			},
			{
				key: "LINE_CHANNEL_SECRET",
				required: true,
				description: "Line Bot Channel Secret（從 Line Developers Console 獲取）",
				example: "5536866037f2fff45a061cb45700f4b3"
			}
		]
	},
	{
		section: "伺服器配置",
		items: [{ key: "PORT", required: true, description: "應用程式監聽端口", example: "6000", default: "6000" }]
	},
	{
		section: "Webhook 配置",
		items: [
			{
				key: "WEBHOOK_URL",
				required: true,
				description: "公開的 Webhook URL，用於接收 YSCP 事件推送（需使用 ngrok 或公開域名）",
				example: "https://your-domain.com/api/linebot/yscp-event-receiver"
			},
			{ key: "EVENT_TOKEN", required: true, description: "事件驗證 Token，用於驗證 YSCP 事件推送的合法性", example: "yscp_line_bot_2024_secure_token" }
		]
	},
	{
		section: "Ngrok 配置",
		items: [
			{
				key: "NGROK_AUTHTOKEN",
				required: true,
				description: "Ngrok Authtoken（用於本地開發時提供公開 URL），前往 https://dashboard.ngrok.com/get-started/your-authtoken 獲取",
				example: "342Tb0KeRwKttw5DsEMYTseiUjL_..."
			},
			{
				key: "NGROK_URL",
				required: true,
				description: "公開 URL（如果使用 ngrok，此值會在啟動後自動更新；如果使用固定域名，也可直接填入）",
				example: "https://xxx.ngrok-free.dev 或 https://your-domain.com"
			}
		]
	}
];

function checkConfigStatus() {
	ipcRenderer.send("check-config-status");
	ipcRenderer.send("load-config-values");
}

function openConfigFile() {
	ipcRenderer.send("open-config");
}

function validateConfig() {
	// 先刷新配置值，再進行驗證
	ipcRenderer.send("load-config-values");
	ipcRenderer.send("validate-config");
}

function renderConfigItems(configValues) {
	const container = document.getElementById("config-items");
	const progressContainer = document.getElementById("config-progress");

	let html = "";
	let totalRequired = 0;
	let completedRequired = 0;
	let totalOptional = 0;
	let completedOptional = 0;

	configItems.forEach((section) => {
		html += '<div class="config-section">';
		html += '<div class="config-section-title">' + section.section + "</div>";

		section.items.forEach((item) => {
			const value = configValues[item.key] || "";
			const isEmpty = !value || value.trim() === "";
			const isCompleted = !isEmpty;
			const isRequired = item.required;

			if (isRequired) {
				totalRequired++;
				if (isCompleted) completedRequired++;
			} else {
				totalOptional++;
				if (isCompleted) completedOptional++;
			}

			html += '<div class="config-item ' + (isRequired ? "required" : "optional") + (isCompleted ? " completed" : "") + '">';
			html += '<div class="config-header">';
			html += '<span class="config-name">' + item.key + "</span>";
			html += '<span class="config-badge ' + (isRequired ? "required" : "optional") + (isCompleted ? " completed" : "") + '">';
			html += isRequired ? "必填" : "可選";
			if (isCompleted) html += " ✓";
			html += "</span>";
			html += "</div>";
			html += '<div class="config-description">' + item.description + "</div>";
			if (item.example) {
				html +=
					'<div style="font-size: 11px; color: #999; margin-top: 5px;">範例: <code style="background: #f0f0f0; padding: 2px 4px; border-radius: 2px;">' +
					item.example +
					"</code></div>";
			}
			html += '<div class="config-value ' + (isEmpty ? "empty" : "") + '">';
			html += isEmpty ? (item.default ? "預設值: " + item.default : "未設定") : value.length > 50 ? value.substring(0, 50) + "..." : value;
			html += "</div>";
			html += "</div>";
		});

		html += "</div>";
	});

	container.innerHTML = html;

	// 更新進度條
	const totalItems = totalRequired + totalOptional;
	const completedItems = completedRequired + completedOptional;
	const progress = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;
	const requiredProgress = totalRequired > 0 ? (completedRequired / totalRequired) * 100 : 100;

	document.getElementById("progressFill").style.width = progress + "%";
	document.getElementById("progressText").textContent =
		"必填項目: " +
		completedRequired +
		"/" +
		totalRequired +
		" (" +
		Math.round(requiredProgress) +
		"%) | " +
		"總進度: " +
		completedItems +
		"/" +
		totalItems +
		" (" +
		Math.round(progress) +
		"%)";

	progressContainer.style.display = "block";

	// 更新完成狀態
	if (completedRequired === totalRequired && totalRequired > 0) {
		document.getElementById("step2-indicator").classList.add("completed");
		step2Completed = true;
		showStatus("step2-status", "✅ 所有必填項目已配置完成！", "success");
	} else if (totalRequired > 0) {
		step2Completed = false;
		showStatus("step2-status", "⚠️ 還有 " + (totalRequired - completedRequired) + " 個必填項目未配置", "warning");
	} else {
		step2Completed = true;
		showStatus("step2-status", "✅ 配置檔案已建立", "success");
	}
	
	// 檢查是否應該自動跳轉（僅在初始化時）
	if (isInitializing) {
		checkAutoJumpToStep4();
	}
}

// Step 3: 測試相關
function testService() {
	showStatus("step3-status", "正在啟動測試服務...", "info");
	document.getElementById("testBtn").disabled = true;
	document.getElementById("stopTestBtn").disabled = false;
	addLog("test-logs", "開始測試服務啟動...");
	ipcRenderer.send("test-service");
}

function stopTest() {
	ipcRenderer.send("stop-service");
	document.getElementById("testBtn").disabled = false;
	document.getElementById("stopTestBtn").disabled = true;
	addLog("test-logs", "測試已停止");
}

function clearTestLogs() {
	document.getElementById("test-logs").innerHTML = "<div>等待測試...</div>";
}

// 統一的日誌添加函數
function addLog(logElementId, message) {
	const logsEl = document.getElementById(logElementId);
	const div = document.createElement("div");
	div.textContent = new Date().toLocaleTimeString() + " - " + message;
	logsEl.appendChild(div);
	logsEl.scrollTop = logsEl.scrollHeight;
}

// Step 4: 服務控制
function startService() {
	ipcRenderer.send("start-service");
}

function stopService() {
	ipcRenderer.send("stop-service");
}

function openLogs() {
	ipcRenderer.send("open-logs");
}

function openConfig() {
	ipcRenderer.send("open-config");
}

function checkServiceStatus() {
	ipcRenderer.send("check-service-status");
}

// 工具函數
function showStatus(elementId, message, type) {
	const el = document.getElementById(elementId);
	el.innerHTML = '<div class="status-box ' + type + '">' + message + "</div>";
}

// 檢查是否應該自動跳轉到步驟4
function checkAutoJumpToStep4() {
	if (isInitializing && step1Completed && step2Completed) {
		// 初始化完成且前兩步都已完成，自動跳轉到步驟4
		console.log("所有設定已完成，自動跳轉到步驟4");
		isInitializing = false;
		currentStep = 4;
		showStep(4);
	}
}

// IPC 事件監聽
ipcRenderer.on("license-status", (event, status) => {
	if (status.hasLicense) {
		showStatus("step1-status", "✅ 授權已啟用 (SerialNumber: " + (status.serialNumber || "N/A") + ")", "success");
		document.getElementById("step1-indicator").classList.add("completed");
		step1Completed = true;
	} else {
		showStatus("step1-status", "❌ 尚未啟用授權", "error");
		step1Completed = false;
	}
	
	// 檢查是否應該自動跳轉
	if (isInitializing) {
		checkAutoJumpToStep4();
	}
});

ipcRenderer.on("license-activated", (event, result) => {
	if (result.success) {
		showStatus("step1-status", "✅ 授權啟用成功！SerialNumber: " + result.serialNumber, "success");
		document.getElementById("serialNumberInput").value = "";
		document.getElementById("step1-indicator").classList.add("completed");
		step1Completed = true;
		setTimeout(() => checkLicenseStatus(), 500);
	} else {
		showStatus("step1-status", "❌ 授權啟用失敗: " + (result.error || "未知錯誤"), "error");
		step1Completed = false;
	}
});

ipcRenderer.on("config-status", (event, status) => {
	if (status.exists) {
		// 載入配置值
		ipcRenderer.send("load-config-values");
	} else {
		showStatus("step2-status", "⚠️ 配置檔案不存在，請點擊「開啟配置」建立", "warning");
		step2Completed = false;
	}
});

ipcRenderer.on("config-values", (event, values) => {
	// 檢查是否有更新（簡單的視覺反饋）
	const container = document.getElementById("config-items");
	if (container && container.innerHTML.trim() !== "") {
		// 如果已經有內容，添加一個短暫的更新提示
		const updateIndicator = document.createElement("div");
		updateIndicator.style.cssText =
			"position: fixed; top: 20px; right: 20px; background: #28a745; color: white; padding: 8px 16px; border-radius: 4px; z-index: 1000; font-size: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.2);";
		updateIndicator.textContent = "✓ 配置已自動更新";
		document.body.appendChild(updateIndicator);

		setTimeout(() => {
			updateIndicator.style.transition = "opacity 0.3s";
			updateIndicator.style.opacity = "0";
			setTimeout(() => updateIndicator.remove(), 300);
		}, 1500);
	}

	renderConfigItems(values);
});

ipcRenderer.on("config-validated", (event, result) => {
	if (result.valid) {
		showStatus("step2-status", "✅ 配置驗證通過！所有必填項目已正確設定", "success");
	} else {
		showStatus("step2-status", "❌ 配置驗證失敗: " + result.message, "error");
	}
});

ipcRenderer.on("test-success", () => {
	showStatus("step3-status", "✅ 測試成功！服務可以正常啟動", "success");
	document.getElementById("step3-indicator").classList.add("completed");
	document.getElementById("testBtn").disabled = false;
	document.getElementById("stopTestBtn").disabled = true;
	step3Completed = true;
});

ipcRenderer.on("test-error", (event, error) => {
	showStatus("step3-status", "❌ 測試失敗: " + error, "error");
	document.getElementById("testBtn").disabled = false;
	document.getElementById("stopTestBtn").disabled = true;
});

ipcRenderer.on("service-status", (event, status) => {
	if (currentStep === 3) {
		// 測試模式：如果服務運行中，標記測試成功
		if (status.running) {
			showStatus("step3-status", "✅ 測試成功！服務可以正常啟動", "success");
			document.getElementById("step3-indicator").classList.add("completed");
			document.getElementById("testBtn").disabled = false;
			document.getElementById("stopTestBtn").disabled = true;
			step3Completed = true;
		}
	} else if (currentStep === 4) {
		// 完整前端模式
		const statusEl = document.getElementById("serviceStatus");
		const startBtn = document.getElementById("startBtn");
		const stopBtn = document.getElementById("stopBtn");

		if (status.running) {
			statusEl.textContent = "運行中";
			statusEl.parentElement.className = "status-box success";
			startBtn.disabled = true;
			stopBtn.disabled = false;
		} else {
			statusEl.textContent = "已停止";
			statusEl.parentElement.className = "status-box";
			startBtn.disabled = false;
			stopBtn.disabled = true;
		}
	}
});

ipcRenderer.on("node-log", (event, message) => {
	if (currentStep === 3) {
		addLog("test-logs", message);
	} else if (currentStep === 4) {
		addLog("service-logs", message);
	}
});

ipcRenderer.on("node-error", (event, message) => {
	const errorMsg = message.toString();
	if (currentStep === 3) {
		addLog("test-logs", "ERROR: " + errorMsg);
	} else if (currentStep === 4) {
		addLog("service-logs", "ERROR: " + errorMsg);
	}
});

ipcRenderer.on("service-started", () => {
	if (currentStep === 3) {
		setTimeout(() => ipcRenderer.send("check-service-status"), 1000);
	} else if (currentStep === 4) {
		checkServiceStatus();
		addLog("service-logs", "服務已啟動");
	}
});

ipcRenderer.on("service-stopped", () => {
	if (currentStep === 4) {
		checkServiceStatus();
		addLog("service-logs", "服務已停止");
	}
});

// 檢查所有步驟是否已完成
function checkAllStepsCompleted() {
	// 檢查授權狀態（步驟1）
	ipcRenderer.send('check-license');
	
	// 檢查配置狀態（步驟2）
	ipcRenderer.send('check-config-status');
	ipcRenderer.send('load-config-values');
}

// 初始化
window.addEventListener("DOMContentLoaded", () => {
	// 先顯示步驟1，等待檢查結果後再決定是否跳轉
	showStep(1);
	
	// 檢查所有步驟的完成狀態
	checkAllStepsCompleted();
	
	// 設置超時，確保所有檢查完成後再決定是否跳轉
	// 如果1秒後仍未跳轉，說明設定未完成，結束初始化狀態
	setTimeout(() => {
		if (isInitializing) {
			isInitializing = false;
			console.log("設定未完成，保持在設定步驟");
		}
	}, 1500);
});
