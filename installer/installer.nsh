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
    
    ; 注意：配置和授權驗證現在在應用程式內完成，不再需要執行 post-install.js
    ; 顯示完成訊息
    MessageBox MB_YESNO|MB_ICONQUESTION \
            "安裝完成！$\n$\n是否要立即啟動應用程式？" \
            IDYES launch_app IDNO done 
    
    launch_app:
        Exec "$INSTDIR\yscp-line-bot.exe"
    
    done:
FunctionEnd

; 注意：配置和授權驗證現在在應用程式內完成，不再需要安裝器中的配置頁面

