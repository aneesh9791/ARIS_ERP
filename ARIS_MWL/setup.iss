; ─────────────────────────────────────────────────────────────────────────────
; ARIS MWL Server — Inno Setup installer script
;
; Requirements:
;   Inno Setup 6.x  →  https://jrsoftware.org/isdl.php
;
; Build order:
;   1. Run build.bat  →  produces dist\ARIS_MWL_Server\
;   2. Compile this script (iscc setup.iss  OR  open in Inno Setup IDE)
;   →  produces dist\ARIS_MWL_Server_Setup.exe
; ─────────────────────────────────────────────────────────────────────────────

[Setup]
AppId={{A7D2F3E1-4B8C-4E9A-B1C2-3D5F6A7B8C9D}
AppName=ARIS MWL Server
AppVersion=1.0
AppPublisher=ARIS Health Systems
AppPublisherURL=https://ariserp.com
AppSupportURL=https://ariserp.com
AppUpdatesURL=https://ariserp.com

; Install to C:\Program Files\ARIS_MWL\
DefaultDirName={autopf}\ARIS_MWL
DefaultGroupName=ARIS MWL Server
AllowNoIcons=yes

; Output
OutputDir=dist
OutputBaseFilename=ARIS_MWL_Server_Setup
SetupIconFile=

; Compression
Compression=lzma2/ultra64
SolidCompression=yes

; Always require Administrator (needed to install to Program Files + firewall)
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=

; Uninstaller
UninstallDisplayIcon={app}\ARIS_MWL_Server.exe
UninstallDisplayName=ARIS MWL Server

; Appearance
WizardStyle=modern
WizardSmallImageFile=
DisableWelcomePage=no
LicenseFile=
InfoBeforeFile=
InfoAfterFile=

; Misc
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=6.1   ; Windows 7 minimum


; ─────────────────────────────────────────────────────────────────────────────
[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"


; ─────────────────────────────────────────────────────────────────────────────
[Tasks]
Name: "desktopicon"; \
  Description: "Create a &desktop shortcut"; \
  GroupDescription: "Additional icons:"; \
  Flags: unchecked

Name: "startupentry"; \
  Description: "Start ARIS MWL Server automatically when &Windows starts"; \
  GroupDescription: "Startup:"; \
  Flags: unchecked


; ─────────────────────────────────────────────────────────────────────────────
[Files]
; Main application folder (entire --onedir output)
Source: "dist\ARIS_MWL_Server\*"; \
  DestDir: "{app}"; \
  Flags: ignoreversion recursesubdirs createallsubdirs

; README
Source: "README.txt"; \
  DestDir: "{app}"; \
  Flags: ignoreversion


; ─────────────────────────────────────────────────────────────────────────────
[Icons]
; Start Menu
Name: "{group}\ARIS MWL Server"; \
  Filename: "{app}\ARIS_MWL_Server.exe"; \
  Comment: "DICOM Modality Worklist Server"

Name: "{group}\README"; \
  Filename: "{app}\README.txt"

Name: "{group}\Uninstall ARIS MWL Server"; \
  Filename: "{uninstallexe}"

; Desktop shortcut (optional task)
Name: "{autodesktop}\ARIS MWL Server"; \
  Filename: "{app}\ARIS_MWL_Server.exe"; \
  Tasks: desktopicon; \
  Comment: "DICOM Modality Worklist Server"


; ─────────────────────────────────────────────────────────────────────────────
[Registry]
; Windows startup entry (optional task)
Root: HKCU; \
  Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; \
  ValueType: string; \
  ValueName: "ARIS_MWL_Server"; \
  ValueData: """{app}\ARIS_MWL_Server.exe"" --minimized"; \
  Flags: uninsdeletevalue; \
  Tasks: startupentry


; ─────────────────────────────────────────────────────────────────────────────
[Run]
; Add Windows Firewall inbound rule for DICOM port 104
Filename: "netsh"; \
  Parameters: "advfirewall firewall add rule name=""ARIS MWL Server"" dir=in action=allow protocol=TCP localport=104 profile=any"; \
  Flags: runhidden; \
  StatusMsg: "Configuring Windows Firewall for DICOM port 104..."

; Launch app after install (optional)
Filename: "{app}\ARIS_MWL_Server.exe"; \
  Description: "Launch ARIS MWL Server now"; \
  Flags: nowait postinstall skipifsilent


; ─────────────────────────────────────────────────────────────────────────────
[UninstallRun]
; Remove the firewall rule on uninstall
Filename: "netsh"; \
  Parameters: "advfirewall firewall delete rule name=""ARIS MWL Server"""; \
  Flags: runhidden


; ─────────────────────────────────────────────────────────────────────────────
[UninstallDelete]
; Remove log and config files left behind by the app
Type: files; Name: "{app}\aris_mwl_config.json"
Type: files; Name: "{app}\aris_mwl.log"
Type: files; Name: "{app}\aris_mwl.log.1"
Type: files; Name: "{app}\aris_mwl.log.2"
Type: files; Name: "{app}\aris_mwl.log.3"
Type: dirifempty; Name: "{app}"


; ─────────────────────────────────────────────────────────────────────────────
[Messages]
; Custom messages shown in the installer wizard
FinishedHeadingLabel=ARIS MWL Server is installed
FinishedLabelNoIcons=The application was successfully installed in:%n%n[app]%n%nOpen the app, go to Settings, and enter your ERP URL, Bearer Token, and Center ID.
