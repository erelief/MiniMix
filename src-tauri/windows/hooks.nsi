; hooks.nsi — NSIS installer hooks for MiniMix "拼好图"
; Registers context menu ("用拼好图打开") with multi-file selection support,
; and "Open with" context menu entries.

!define HOOK_BINARY "app"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

Var InstallContextMenu
Var CtxCheckbox

; ---- Custom page: context menu option ----
Page custom ContextMenuPage ContextMenuPageLeave

Function ContextMenuPage
  !insertmacro MUI_HEADER_TEXT "右键菜单集成" "选择是否添加资源管理器右键菜单"
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 10u 10u 280u 24u "安装后，您可以在资源管理器中右键选中多个图片，选择「用拼好图打开」一次性添加到拼好图中。"
  Pop $0

  ${NSD_CreateCheckbox} 10u 40u 280u 12u "添加右键菜单「用拼好图打开」（支持多选图片）"
  Pop $CtxCheckbox
  ${NSD_SetState} $CtxCheckbox ${BST_CHECKED}

  nsDialogs::Show
FunctionEnd

Function ContextMenuPageLeave
  ${NSD_GetState} $CtxCheckbox $InstallContextMenu
FunctionEnd

; ---- Image extensions list ----
!macro RegisterContextMenuExt EXT
  StrCpy $R9 "${EXT}"
  Call registerOneContextMenuExt
!macroend

!macro UnregisterContextMenuExt EXT
  StrCpy $R9 "${EXT}"
  Call un.registerOneContextMenuExt
!macroend

; ---- Post-install ----
!macro NSIS_HOOK_POSTINSTALL
  Push "MiniMix"
  Call fixOpenCommand2

  StrCpy $R0 ".png"
  Call registerImageExt
  StrCpy $R0 ".jpg"
  Call registerImageExt
  StrCpy $R0 ".jpeg"
  Call registerImageExt
  StrCpy $R0 ".bmp"
  Call registerImageExt
  StrCpy $R0 ".gif"
  Call registerImageExt
  StrCpy $R0 ".webp"
  Call registerImageExt

  ${If} $InstallContextMenu == ${BST_CHECKED}
    !insertmacro RegisterContextMenuExt ".png"
    !insertmacro RegisterContextMenuExt ".jpg"
    !insertmacro RegisterContextMenuExt ".jpeg"
    !insertmacro RegisterContextMenuExt ".bmp"
    !insertmacro RegisterContextMenuExt ".gif"
    !insertmacro RegisterContextMenuExt ".webp"
  ${EndIf}

  System::Call 'Shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend

; ---- Post-uninstall ----
!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCR "MiniMix"

  StrCpy $R0 ".png"
  Call un.registerImageExt
  StrCpy $R0 ".jpg"
  Call un.registerImageExt
  StrCpy $R0 ".jpeg"
  Call un.registerImageExt
  StrCpy $R0 ".bmp"
  Call un.registerImageExt
  StrCpy $R0 ".gif"
  Call un.registerImageExt
  StrCpy $R0 ".webp"
  Call un.registerImageExt

  !insertmacro UnregisterContextMenuExt ".png"
  !insertmacro UnregisterContextMenuExt ".jpg"
  !insertmacro UnregisterContextMenuExt ".jpeg"
  !insertmacro UnregisterContextMenuExt ".bmp"
  !insertmacro UnregisterContextMenuExt ".gif"
  !insertmacro UnregisterContextMenuExt ".webp"

  System::Call 'Shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend

; ---- Helper functions ----

Function registerOneContextMenuExt
  StrCpy $R8 "$\""
  StrCpy $R8 "$R8$INSTDIR\${HOOK_BINARY}.exe"
  StrCpy $R8 "$R8$\""

  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\$R9\shell\MiniMix" "" "用拼好图打开"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\$R9\shell\MiniMix" "Icon" "$R8,0"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\$R9\shell\MiniMix" "MultiSelectModel" "Player"

  StrCpy $R7 "$R8 $\"%1$\""
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\$R9\shell\MiniMix\command" "" $R7
FunctionEnd

Function un.registerOneContextMenuExt
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\$R9\shell\MiniMix"
FunctionEnd

Function fixOpenCommand2
  Pop $R1
  StrCpy $R2 "$\""
  StrCpy $R2 "$R2$INSTDIR\${HOOK_BINARY}.exe"
  StrCpy $R2 "$R2$\""
  StrCpy $R2 "$R2 $\""
  StrCpy $R2 "$R2%1$\""
  WriteRegStr HKCR "$R1\shell\open\command" "" $R2
  WriteRegStr HKCR "$R1\DefaultIcon" "" "$INSTDIR\${HOOK_BINARY}.exe,0"
FunctionEnd

Function registerImageExt
  WriteRegStr HKCR "$R0\OpenWithProgids" "MiniMix" ""
  ReadRegStr $R1 HKCR "$R0" ""
  StrCmp $R1 "" +2 0
  WriteRegStr HKCR "$R1\OpenWithList" "MiniMix" ""
FunctionEnd

Function un.registerImageExt
  DeleteRegValue HKCR "$R0\OpenWithProgids" "MiniMix"
  ReadRegStr $R1 HKCR "$R0" ""
  StrCmp $R1 "" +2 0
  DeleteRegValue HKCR "$R1\OpenWithList" "MiniMix"
FunctionEnd
