/**
 * 安裝後配置腳本（已簡化）
 * 注意：配置和授權驗證現在在應用程式內完成，此腳本僅用於建立必要目錄
 */

const fs = require("fs");
const path = require("path");

const INSTALL_DIR = process.env.INSTALL_DIR || process.cwd();
const DATA_DIR = path.join(INSTALL_DIR, "data");

console.log("🔧 YSCP Line Bot 安裝後配置");
console.log("========================");
console.log(`安裝目錄: ${INSTALL_DIR}`);

// 確保必要目錄存在
function ensureDirectories() {
	const dirs = [DATA_DIR, path.join(INSTALL_DIR, "logs"), path.join(INSTALL_DIR, "temp")];
	dirs.forEach((dir) => {
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
			console.log(`✅ 建立目錄: ${dir}`);
		}
	});
}

// 主函數
function main() {
	try {
		console.log("\n📦 建立必要目錄");
		ensureDirectories();

		console.log("\n✅ 安裝後配置完成！");
		console.log("\n📝 下一步:");
		console.log("   1. 啟動應用程式，在應用程式內完成配置和授權驗證");
		console.log("   2. 按照應用程式內的設定精靈完成所有配置");
	} catch (error) {
		console.error(`❌ 配置過程發生錯誤: ${error.message}`);
		process.exit(1);
	}
}

main();

