!include "${__FILEDIR__}\install-path.nsh"

; Require a normal application exit so upgrades/uninstall never force-close live instances.
!macro customCheckAppRunning
  ; An online update starts NSIS just before the old process exits. Wait without killing it.
  ${if} ${isUpdated}
    StrCpy $R1 0
    ${do}
      !insertmacro nsProcess::FindProcess "${APP_EXECUTABLE_FILENAME}" $R0
      ${if} $R0 != 0
        ${exitDo}
      ${endif}
      Sleep 250
      IntOp $R1 $R1 + 1
    ${loopWhile} $R1 < 120
  ${endif}
  !insertmacro nsProcess::FindProcess "${APP_EXECUTABLE_FILENAME}" $R0
  ${if} $R0 == 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "请先从千面 Facet 中正常退出，再继续安装或卸载。实例和登录资料会保留。" /SD IDOK
    SetErrorLevel 2
    Quit
  ${endif}
!macroend
