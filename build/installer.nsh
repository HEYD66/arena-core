; Require a normal application exit so upgrades/uninstall never force-close live instances.
!macro customCheckAppRunning
  !insertmacro nsProcess::FindProcess "${APP_EXECUTABLE_FILENAME}" $R0
  ${if} $R0 == 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "请先从千面 Facet 中正常退出，再继续安装或卸载。实例和登录资料会保留。" /SD IDOK
    SetErrorLevel 2
    Quit
  ${endif}
!macroend
