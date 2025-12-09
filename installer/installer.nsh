; NSIS 安裝精靈自定義腳本
; 用於 Windows 安裝程式

; 安裝前檢查
Function .onInit
    ; 檢查是否已安裝
    ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\YSCPLineBot" "UninstallString"
    StrCmp $R0 "" done
    
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION \
        "YSCP Line Bot 已經安裝。$\n$\n點擊 '確定' 移除舊版本，或 '取消' 取消此次安裝。" \
        IDOK uninst
    Abort
    
    uninst:
        ClearErrors
        ExecWait '$R0 _?=$INSTDIR'
        
        IfErrors no_remove_uninstaller done
        no_remove_uninstaller:
    
    done:
FunctionEnd

; 安裝後執行
Function .onInstSuccess
    ; 建立開始選單快捷方式
    CreateShortCut "$SMPROGRAMS\YSCP Line Bot\YSCP Line Bot.lnk" "$INSTDIR\yscp-line-bot.exe"
    CreateShortCut "$SMPROGRAMS\YSCP Line Bot\卸載.lnk" "$INSTDIR\Uninstall.exe"
    
    ; 建立桌面快捷方式
    CreateShortCut "$DESKTOP\YSCP Line Bot.lnk" "$INSTDIR\yscp-line-bot.exe"
    
    ; 執行安裝後配置腳本（post-install.js）
    ; 檢查 Node.js 是否存在（Electron 應用通常內嵌 Node.js）
    ; 嘗試使用內嵌的 Node.js 執行 post-install.js
    IfFileExists "$INSTDIR\resources\app.asar" 0 check_nodejs
        ; Electron 打包後，使用 asar 中的 Node.js
        ; 注意：實際路徑可能因打包方式而異
        ExecWait '"$INSTDIR\resources\app.asar.unpacked\node_modules\.bin\node.exe" "$INSTDIR\installer\post-install.js"' $0
        Goto post_install_done
    
    check_nodejs:
        ; 嘗試使用系統 Node.js
        ExecWait 'node "$INSTDIR\installer\post-install.js"' $0
        IfErrors skip_post_install
        Goto post_install_done
    
    skip_post_install:
        ; 如果無法執行 post-install.js，顯示提示
        MessageBox MB_OK|MB_ICONINFORMATION \
            "安裝完成！$\n$\n注意：無法自動執行配置腳本。$\n請手動執行：node installer\post-install.js"
        Goto done
    
    post_install_done:
    ; 顯示完成訊息
    MessageBox MB_YESNO|MB_ICONQUESTION \
            "安裝完成！$\n$\n是否要立即啟動應用程式？" \
            IDYES launch_app IDNO done
    
    launch_app:
        Exec "$INSTDIR\yscp-line-bot.exe"
    
    done:
FunctionEnd

; 自定義安裝頁面
Page custom LicensePage LicensePageLeave
Page custom ConfigPage ConfigPageLeave

; 授權驗證頁面（簡化版：只需 SerialNumber）
Function LicensePage
    !insertmacro MUI_HEADER_TEXT "授權驗證" "請輸入您的 SerialNumber（可選，稍後也可手動啟用）"
    
    nsDialogs::Create 1018
    Pop $0
    
    ${NSD_CreateLabel} 0 10u 100% 20u "SerialNumber（選填）：$\n系統會自動從授權伺服器獲取對應的 License Key"
    Pop $0
    
    ${NSD_CreateText} 0 35u 100% 12u ""
    Pop $SerialNumber
    
    ${NSD_CreateLabel} 0 60u 100% 30u "提示：$\n- 如果現在不輸入，可以稍後手動啟用授權$\n- 授權伺服器 URL 需要在 .env 中配置 LICENSE_SERVER_URL"
    Pop $0
    
    nsDialogs::Show
FunctionEnd

Function LicensePageLeave
    ${NSD_GetText} $SerialNumber $1
    
    ; SerialNumber 是可選的，如果提供則儲存
    StrCmp $1 "" skip_save
    
    ; 儲存授權資訊（只儲存 SerialNumber）
    WriteINIStr "$INSTDIR\license.ini" "License" "SerialNumber" $1
    
    skip_save:
FunctionEnd

; 配置頁面
Function ConfigPage
    !insertmacro MUI_HEADER_TEXT "系統配置" "請輸入系統配置資訊"
    
    nsDialogs::Create 1018
    Pop $0
    
    ${NSD_CreateLabel} 0 10u 100% 10u "YSCP Host:"
    Pop $0
    
    ${NSD_CreateText} 0 25u 100% 12u "https://yscp.yenshow.com"
    Pop $HCPHost
    
    ${NSD_CreateLabel} 0 50u 100% 10u "YSCP Access Key:"
    Pop $0
    
    ${NSD_CreateText} 0 65u 100% 12u ""
    Pop $HCPAK
    
    ${NSD_CreateLabel} 0 90u 100% 10u "YSCP Secret Key:"
    Pop $0
    
    ${NSD_CreateText} 0 105u 100% 12u ""
    Pop $HCPSK
    
    nsDialogs::Show
FunctionEnd

Function ConfigPageLeave
    ${NSD_GetText} $HCPHost $0
    ${NSD_GetText} $HCPAK $1
    ${NSD_GetText} $HCPSK $2
    
    ; 儲存配置到 .env 檔案
    FileOpen $3 "$INSTDIR\.env" w
    FileWrite $3 "# YSCP API 配置$\r$\n"
    FileWrite $3 "HCP_HOST=$0$\r$\n"
    FileWrite $3 "HCP_AK=$1$\r$\n"
    FileWrite $3 "HCP_SK=$2$\r$\n"
    FileWrite $3 "$\r$\n"
    FileWrite $3 "# Line Bot 配置$\r$\n"
    FileWrite $3 "LINE_CHANNEL_ACCESS_TOKEN=$\r$\n"
    FileWrite $3 "LINE_CHANNEL_SECRET=$\r$\n"
    FileWrite $3 "$\r$\n"
    FileWrite $3 "# 伺服器配置$\r$\n"
    FileWrite $3 "PORT=6000$\r$\n"
    FileWrite $3 "$\r$\n"
    FileWrite $3 "# Webhook 配置$\r$\n"
    FileWrite $3 "WEBHOOK_URL=http://localhost:6000/api/linebot/yscp-event-receiver$\r$\n"
    FileWrite $3 "EVENT_TOKEN=yscp_line_bot_2024_secure_token$\r$\n"
    FileWrite $3 "$\r$\n"
    FileWrite $3 "# Ngrok 配置（可選，用於本地開發時提供公開 URL）$\r$\n"
    FileWrite $3 "# 1. 前往 https://dashboard.ngrok.com/get-started/your-authtoken 註冊並取得 authtoken$\r$\n"
    FileWrite $3 "# 2. 將 authtoken 填入下方，應用程式啟動時會自動配置$\r$\n"
    FileWrite $3 "NGROK_AUTHTOKEN=$\r$\n"
    FileWrite $3 "$\r$\n"
    FileWrite $3 "# 公開 URL 配置（用於圖片顯示）$\r$\n"
    FileWrite $3 "# 如果使用 ngrok，此值會在 ngrok 啟動後自動更新$\r$\n"
    FileWrite $3 "NGROK_URL=$\r$\n"
    FileWrite $3 "$\r$\n"
    FileWrite $3 "# 授權伺服器配置（專業授權管理系統）$\r$\n"
    FileWrite $3 "LICENSE_SERVER_URL=https://api.yenshow.com$\r$\n"
    FileWrite $3 "LICENSE_ONLINE_MODE=true$\r$\n"
    FileWrite $3 "LICENSE_HEARTBEAT_INTERVAL=3600000$\r$\n"
    FileWrite $3 "LICENSE_OFFLINE_GRACE_PERIOD=86400000$\r$\n"
    FileClose $3
FunctionEnd

; 獲取 MAC Address
Function GetMACAddress
    Push $R0
    Push $R1
    Push $R2
    
    System::Call 'iphlpapi::GetAdaptersInfo(i 0, *i .R0) i .R1'
    System::Alloc $R0
    Pop $R1
    System::Call 'iphlpapi::GetAdaptersInfo(i R1, *i R0) i .R2'
    
    ; 解析 MAC Address（簡化版本）
    ; 實際實作需要更複雜的解析邏輯
    
    Pop $R2
    Pop $R1
    Pop $R0
    Push "00:00:00:00:00:00" ; 預設值
FunctionEnd

