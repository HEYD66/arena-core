; Keep the assisted installer, with a supported nsDialogs directory page for a visible app subfolder.
!include MUI2.nsh
!include FileFunc.nsh
!include nsDialogs.nsh

!ifndef BUILD_UNINSTALLER
  !insertmacro MUI_DIRECTORYPAGE_INTERFACE
  Var facetDefaultDirectory
  Var facetPreviousUserDirectory
  Var facetPreviousMachineDirectory
  Var facetDirectoryShown
  Var facetDirectoryCandidate
  Var facetDirectoryStableTicks

  !macro customInit
    ReadRegStr $facetPreviousUserDirectory HKCU "Software\${APP_GUID}" InstallLocation
    ReadRegStr $facetPreviousMachineDirectory HKLM "Software\${APP_GUID}" InstallLocation
    ; initMultiUser has already restored existing installs and /D. Only new installs get a default.
    ; /currentuser and /allusers also set the builder's installation flags on fresh installs.
    ; Actual registry paths, rather than those mode flags, identify an existing install.
    ${If} $facetPreviousUserDirectory == ""
    ${AndIf} $facetPreviousMachineDirectory == ""
      !insertmacro GetDParameter $R0
      ${If} $R0 == ""
        IfFileExists "D:\*.*" 0 +3
          StrCpy $facetDefaultDirectory "D:\Facet"
          Goto +2
        StrCpy $facetDefaultDirectory "C:\Facet"
        StrCpy $INSTDIR $facetDefaultDirectory
      ${EndIf}
    ${EndIf}
  !macroend

  Function FacetNormalizeDirectory
    Push $0
    Push $1
    ; Preserve a previous custom install directory, including on upgrade.
    ${If} $INSTDIR == $facetPreviousUserDirectory
    ${AndIf} $INSTDIR != ""
      Goto facet_directory_done
    ${EndIf}
    ${If} $INSTDIR == $facetPreviousMachineDirectory
    ${AndIf} $INSTDIR != ""
      Goto facet_directory_done
    ${EndIf}
    ${If} $INSTDIR == ""
      Goto facet_directory_done
    ${EndIf}
    System::Call 'shlwapi::PathIsRelativeW(w "$INSTDIR") i .r0'
    ${If} $0 != 0
      Goto facet_directory_done
    ${EndIf}
    StrCpy $1 $INSTDIR
    facet_trim_directory:
      StrCpy $0 $1 1 -1
      ${If} $0 == "\"
        StrCpy $1 $1 -1
        Goto facet_trim_directory
      ${EndIf}
    ${GetFileName} "$1" $0
    ${If} $0 != "Facet"
      StrCpy $INSTDIR "$1\Facet"
    ${Else}
      StrCpy $INSTDIR $1
    ${EndIf}
    facet_directory_done:
    Pop $1
    Pop $0
  FunctionEnd

  Function FacetDirectoryShow
    ; The install-mode page can reassign INSTDIR after customInit. Apply the new-install default once.
    ${If} $facetDirectoryShown != "1"
    ${AndIf} $facetDefaultDirectory != ""
      StrCpy $INSTDIR $facetDefaultDirectory
    ${EndIf}
    StrCpy $facetDirectoryShown "1"
    Call FacetNormalizeDirectory
    nsDialogs::Create 1018
    Pop $mui.DirectoryPage
    ${If} $mui.DirectoryPage == error
      Abort
    ${EndIf}
    ${NSD_CreateLabel} 0u 0u 100% 42u "Setup 将安装 千面 Facet 到下列文件夹。选择盘符或父文件夹后会自动补上 Facet 子文件夹。单击 [安装] 开始安装。"
    Pop $mui.DirectoryPage.Text
    ${NSD_CreateGroupBox} 0u 48u 100% 48u "目标文件夹"
    Pop $mui.DirectoryPage.DirectoryBox
    ${NSD_CreateText} 8u 66u 72% 14u "$INSTDIR"
    Pop $mui.DirectoryPage.Directory
    System::Call 'user32::SetWindowLongW(p $mui.DirectoryPage.Directory, i -12, i 1019)'
    ${NSD_CreateButton} 78% 65u 20% 16u "浏览(&B)..."
    Pop $mui.DirectoryPage.BrowseButton
    System::Call 'user32::SetWindowLongW(p $mui.DirectoryPage.BrowseButton, i -12, i 1001)'
    ${NSD_OnClick} $mui.DirectoryPage.BrowseButton FacetDirectoryBrowse
    SectionGetSize 0 $0
    ${NSD_CreateLabel} 0u 109u 100% 12u "所需空间：$0 KB"
    Pop $mui.DirectoryPage.SpaceRequired
    ${NSD_CreateLabel} 0u 123u 100% 12u ""
    Pop $mui.DirectoryPage.SpaceAvailable
    Call FacetDirectorySpace
    GetDlgItem $0 $HWNDPARENT 1
    SendMessage $0 ${WM_SETTEXT} 0 "STR:$(^InstallBtn)"
    StrCpy $facetDirectoryCandidate $INSTDIR
    StrCpy $facetDirectoryStableTicks 0
    ${NSD_CreateTimer} FacetDirectoryTimer 200
    ; nsDialogs timers must run inside the dialog's own Show loop.
    nsDialogs::Show
    ${NSD_KillTimer} FacetDirectoryTimer
  FunctionEnd

  Function FacetDirectoryBrowse
    Pop $0
    ${NSD_GetText} $mui.DirectoryPage.Directory $INSTDIR
    nsDialogs::SelectFolderDialog "选择安装位置" "$INSTDIR"
    Pop $0
    ${If} $0 != error
      StrCpy $INSTDIR $0
      Call FacetNormalizeDirectory
      ${NSD_SetText} $mui.DirectoryPage.Directory $INSTDIR
      Call FacetDirectorySpace
    ${EndIf}
  FunctionEnd

  Function FacetDirectorySpace
    Push $0
    Push $1
    ${GetRoot} "$INSTDIR" $1
    System::Call 'kernel32::GetDiskFreeSpaceExW(w "$1\", *l .r0, p 0, p 0) i .r1'
    ${If} $1 != 0
      System::Int64Op $0 / 1048576
      Pop $0
      ${NSD_SetText} $mui.DirectoryPage.SpaceAvailable "可用空间：$0 MB"
    ${Else}
      ${NSD_SetText} $mui.DirectoryPage.SpaceAvailable "请确认所选磁盘可以访问。"
    ${EndIf}
    Pop $1
    Pop $0
  FunctionEnd

  Function FacetDirectoryTimer
    Push $0
    Push $1
    ; Keep normalization active across temporary page hiding/minimization; Show owns timer lifetime.
    ; Do not modify a partially typed path or an open Browse dialog.
    System::Call 'user32::GetFocus() p .r0'
    ${If} $0 == $mui.DirectoryPage.Directory
      Goto facet_timer_done
    ${EndIf}
    System::Call 'user32::IsWindowEnabled(p $HWNDPARENT) i .r0'
    ${If} $0 == 0
      Goto facet_timer_done
    ${EndIf}
    ${NSD_GetText} $mui.DirectoryPage.Directory $0
    ${If} $0 != $facetDirectoryCandidate
      StrCpy $facetDirectoryCandidate $0
      StrCpy $facetDirectoryStableTicks 0
      Goto facet_timer_done
    ${EndIf}
    IntOp $facetDirectoryStableTicks $facetDirectoryStableTicks + 1
    ${If} $facetDirectoryStableTicks < 2
      Goto facet_timer_done
    ${EndIf}
    StrCpy $INSTDIR $0
    Call FacetNormalizeDirectory
    ${If} $INSTDIR != $0
      SendMessage $mui.DirectoryPage.Directory ${WM_SETTEXT} 0 "STR:$INSTDIR"
      StrCpy $facetDirectoryCandidate $INSTDIR
      Call FacetDirectorySpace
    ${EndIf}
    facet_timer_done:
    Pop $1
    Pop $0
  FunctionEnd

  Function FacetDirectoryLeave
    ${NSD_KillTimer} FacetDirectoryTimer
    ${NSD_GetText} $mui.DirectoryPage.Directory $INSTDIR
    Call FacetNormalizeDirectory
    SendMessage $mui.DirectoryPage.Directory ${WM_SETTEXT} 0 "STR:$INSTDIR"
    System::Call 'shlwapi::PathIsRelativeW(w "$INSTDIR") i .r0'
    ${If} $INSTDIR == ""
    ${OrIf} $0 != 0
      MessageBox MB_OK|MB_ICONEXCLAMATION "请选择完整的安装路径。"
      ${NSD_CreateTimer} FacetDirectoryTimer 200
      Abort
    ${EndIf}
    ${GetRoot} "$INSTDIR" $0
    IfFileExists "$0\*.*" facet_drive_valid
      MessageBox MB_OK|MB_ICONEXCLAMATION "无法访问所选磁盘，请重新选择安装位置。"
      ${NSD_CreateTimer} FacetDirectoryTimer 200
      Abort
    facet_drive_valid:
    System::Call 'kernel32::GetFileAttributesW(w "$INSTDIR") i .r0'
    ${If} $0 != -1
      IntOp $0 $0 & 16
      ${If} $0 == 0
        MessageBox MB_OK|MB_ICONEXCLAMATION "此路径已存在同名文件，请选择其他安装位置。"
        ${NSD_CreateTimer} FacetDirectoryTimer 200
        Abort
      ${EndIf}
    ${EndIf}
  FunctionEnd

  ; Preserve the builder's PRE callback (including skipping this page on automatic updates).
  !macroundef MUI_PAGE_DIRECTORY
  !macro MUI_PAGE_DIRECTORY
    !insertmacro MUI_PAGE_INIT
    !insertmacro MUI_SET MUI_DIRECTORYPAGE ""
    Function FacetDirectoryCreate
      !insertmacro MUI_PAGE_FUNCTION_CUSTOM PRE
      !insertmacro MUI_HEADER_TEXT "$(MUI_TEXT_DIRECTORY_TITLE)" "$(MUI_TEXT_DIRECTORY_SUBTITLE)"
      Call FacetDirectoryShow
    FunctionEnd
    PageEx custom
      PageCallbacks FacetDirectoryCreate FacetDirectoryLeave
      Caption " "
    PageExEnd
  !macroend
!endif
