; Trier OS - Custom NSIS Installer Script
; Sets default install directory to C:\Trier OS

!macro customInit
  StrCpy $INSTDIR "C:\Trier OS"
!macroend
