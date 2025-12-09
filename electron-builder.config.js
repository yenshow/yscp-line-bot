/**
 * Electron Builder 配置
 * 用於打包主應用程式為安裝檔
 */

module.exports = {
	appId: "com.yenshow.yscp-line-bot",
	productName: "YSCP Line Bot",
	copyright: "Copyright © 2024 Yenshow",
	directories: {
		output: "dist",
		buildResources: "build"
	},
	files: [
		"electron-main.js",
		"app.js",
		"config.js",
		"ecosystem.config.js",
		"services/**/*",
		"controllers/**/*",
		"routes/**/*",
		"scripts/**/*",
		"data/**/*",
		"installer/**/*",
		"renderer/**/*",
		"!node_modules/**/*",
		"!dist/**/*",
		"!logs/**/*",
		"!temp/**/*",
		"!.git/**/*",
		"!*.md",
		"!docs/**/*"
	],
	extraFiles: [
		{
			from: "node_modules/ngrok/bin",
			to: "node_modules/ngrok/bin",
			filter: ["**/*"]
		}
	],
	win: {
		target: [
			{
				target: "nsis",
				arch: ["x64"]
			}
		],
		icon: "build/line-bot.ico",
		requestedExecutionLevel: "asInvoker",
		// 減少防毒軟體誤判的設定
		publisherName: "Yenshow",
		verifyUpdateCodeSignature: false,
		// 添加應用程式資訊，增加可信度
		artifactName: "${productName}-Setup-${version}.${ext}",
		// 排除可能被誤判的檔案
		extraResources: [],
		// 設定檔案權限
		fileAssociations: []
	},
	nsis: {
		oneClick: false,
		allowToChangeInstallationDirectory: true,
		createDesktopShortcut: true,
		createStartMenuShortcut: true,
		installerIcon: "build/line-bot.ico",
		uninstallerIcon: "build/line-bot.ico",
		installerHeaderIcon: "build/line-bot.ico",
		include: "installer/installer.nsh",
		license: "LICENSE",
		runAfterFinish: true,
		script: "installer/installer.nsh",
		// 減少防毒軟體誤判的設定
		warningsAsErrors: false,
		// 使用標準壓縮方式
		compression: "normal",
		// 添加安裝程式資訊
		installerLanguages: ["TradChinese"],
		// 設定安裝程式版本資訊
		displayLanguageSelector: false
	},
	mac: {
		target: [
			{
				target: "zip",
				arch: ["arm64"]
			}
		],
		icon: "build/line-bot.icns",
		category: "public.app-category.utilities"
	},
	// 不輸出 linux 安裝檔，如需再開啟
	// linux: {
	// 	 target: [
	// 	   { target: "AppImage", arch: ["x64"] }
	// 	 ],
	// 	 icon: "build/line-bot.png",
	// 	 category: "Utility"
	// },
	extraMetadata: {
		main: "electron-main.js",
		// 添加應用程式描述，增加可信度
		description: "YSCP OpenAPI 整合 Line Bot 後端服務",
		author: "Yenshow"
	},
	nodeGypRebuild: false,
	buildDependenciesFromSource: false,
	// 減少防毒軟體誤判：排除不必要的檔案
	asarUnpack: [
		"node_modules/ngrok/bin/**/*"
	],
	afterAllArtifactBuild: async (context) => {
		// 自動清理無用檔案
		const { artifacts } = context;
		const fs = require("fs/promises");
		for (const file of artifacts) {
			if (file.endsWith("builder-debug.yml") || file.includes(".icon-") || file.endsWith(".DS_Store")) {
				try {
					await fs.unlink(file);
				} catch {}
			}
		}
	}
};
