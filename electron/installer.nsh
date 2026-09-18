# Copyright (c) 2026 Doug Trier. MIT License; see root LICENSE.
# Preparation must precede the default install section and old uninstaller.
!ifndef TRIER_PRESERVATION_SCRIPT
  !define TRIER_PRESERVATION_SCRIPT "${PROJECT_DIR}\electron\preserve-data.ps1"
!endif
!ifndef TRIER_STATE_ARGUMENT
  !define TRIER_STATE_ARGUMENT ""
!endif
!ifndef TRIER_REGISTRY_ROOT
  !define TRIER_REGISTRY_ROOT HKLM
!endif
!ifndef TRIER_REGISTRY_KEY
  !define TRIER_REGISTRY_KEY "Software\TrierOS\Persistence"
!endif

!macro TrierMaintain ACTION
  InitPluginsDir
  File /oname=$PLUGINSDIR\preserve-data.ps1 "${TRIER_PRESERVATION_SCRIPT}"
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\preserve-data.ps1" -Action ${ACTION} -PackageKind NSIS -InstallDir "$INSTDIR" ${TRIER_STATE_ARGUMENT}'
  Pop $0
  ${If} $0 != 0
    SetErrorLevel 1
    IfSilent +2
    MessageBox MB_ICONSTOP|MB_OK "Trier OS data preservation failed. No further changes will be made. See the installation log and persistent backups."
    Abort
  ${EndIf}
!macroend

!macro customHeader
  !ifndef BUILD_UNINSTALLER
    Section "-Update Existing Installation (retain all data)"
      SectionIn RO
      DetailPrint "Update Existing Installation: preserving databases, accounts and groups."
      !insertmacro TrierMaintain Prepare
    SectionEnd
    Function .onInstFailed
      !insertmacro TrierMaintain Rollback
    FunctionEnd
  !endif
!macroend

!macro customInit
  # Retain the registered path; after uninstall the persistence key survives.
  ReadRegStr $0 ${TRIER_REGISTRY_ROOT} "${TRIER_REGISTRY_KEY}" InstallDir
  ${If} $0 != ""
    StrCpy $INSTDIR $0
  ${EndIf}
!macroend

!macro customInstall
  !insertmacro TrierMaintain Commit
  WriteRegStr ${TRIER_REGISTRY_ROOT} "${TRIER_REGISTRY_KEY}" InstallDir "$INSTDIR"
!macroend

!macro customUnInit
  # Block the generic flag which bypasses our backup and confirmation gate.
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "--delete-app-data" $1
  ${IfNot} ${Errors}
    MessageBox MB_ICONSTOP|MB_OK "Use the separate confirmed Trier OS data reset operation. Uninstall retains databases, users and configuration."
    Abort
  ${EndIf}
!macroend

!macro customRemoveFiles
  !insertmacro TrierMaintain Uninstall
  Delete "$INSTDIR\${UNINSTALL_FILENAME}"
  # Never recursively remove the program tree: customer files may be present.
!macroend
