; ─────────────────────────────────────────────────────────────────────────────
; ARIS MWL Server — Inno Setup 6 installer script
;
; Build order:
;   1. Run build.bat  →  produces  dist\ARIS_MWL_Server\
;   2. Compile:  iscc setup.iss
;   →  output:   dist\ARIS_MWL_Server_Setup.exe
; ─────────────────────────────────────────────────────────────────────────────

[Setup]
; ── Unique app identity (NEVER change the AppId GUID) ──────────────────────
AppId={{A7D2F3E1-4B8C-4E9A-B1C2-3D5F6A7B8C9D}
AppName=ARIS MWL Server
AppVersion=1.1
AppVerName=ARIS MWL Server 1.1
AppPublisher=ARIS Health Systems
AppPublisherURL=https://ariserp.com
AppSupportURL=https://ariserp.com
AppUpdatesURL=https://ariserp.com
AppCopyright=Copyright (C) 2025 ARIS Health Systems

; ── Installation directory ─────────────────────────────────────────────────
; {autopf} = C:\Program Files  (64-bit) or C:\Program Files (x86)  (32-bit)
DefaultDirName={autopf}\ARIS_MWL
DefaultGroupName=ARIS MWL Server
AllowNoIcons=no
CreateAppDir=yes

; ── Output ─────────────────────────────────────────────────────────────────
OutputDir=dist
OutputBaseFilename=ARIS_MWL_Server_Setup

; ── Compression ────────────────────────────────────────────────────────────
Compression=lzma2/ultra64
SolidCompression=yes

; ── Privileges ─────────────────────────────────────────────────────────────
; Always require Administrator — needed for Program Files + firewall rule
PrivilegesRequired=admin

; ── Windows version info (shown in Programs & Features) ───────────────────
VersionInfoVersion=1.1.0.0
VersionInfoCompany=ARIS Health Systems
VersionInfoDescription=ARIS DICOM Modality Worklist Server
VersionInfoProductName=ARIS MWL Server
VersionInfoProductVersion=1.1

; ── Uninstaller ────────────────────────────────────────────────────────────
CreateUninstallRegKey=yes
UninstallDisplayName=ARIS MWL Server
UninstallDisplayIcon={app}\ARIS_MWL_Server.exe
UninstallFilesDir={app}

; ── Appearance ─────────────────────────────────────────────────────────────
WizardStyle=modern
DisableWelcomePage=no
DisableDirPage=no
DisableProgramGroupPage=no

; ── Platform ───────────────────────────────────────────────────────────────
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0   ; Windows 10 minimum


; ─────────────────────────────────────────────────────────────────────────────
[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"


; ─────────────────────────────────────────────────────────────────────────────
[Dirs]
; Explicitly create the install directory with full permissions
Name: "{app}"; Permissions: users-full


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
; Main application — entire PyInstaller --onedir output
Source: "dist\ARIS_MWL_Server\*"; \
  DestDir: "{app}"; \
  Flags: ignoreversion recursesubdirs createallsubdirs

; Documentation
Source: "README.txt"; \
  DestDir: "{app}"; \
  Flags: ignoreversion isreadme


; ─────────────────────────────────────────────────────────────────────────────
[Icons]
; Start Menu
Name: "{group}\ARIS MWL Server"; \
  Filename: "{app}\ARIS_MWL_Server.exe"; \
  Comment: "DICOM Modality Worklist Server"

Name: "{group}\README - ARIS MWL Server"; \
  Filename: "{app}\README.txt"

Name: "{group}\Uninstall ARIS MWL Server"; \
  Filename: "{uninstallexe}"; \
  Comment: "Remove ARIS MWL Server from this computer"

; Desktop shortcut (optional)
Name: "{autodesktop}\ARIS MWL Server"; \
  Filename: "{app}\ARIS_MWL_Server.exe"; \
  Tasks: desktopicon; \
  Comment: "DICOM Modality Worklist Server"


; ─────────────────────────────────────────────────────────────────────────────
[Registry]
; Auto-start on Windows login (optional task)
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

; Offer to launch the app immediately after install
Filename: "{app}\ARIS_MWL_Server.exe"; \
  Description: "Launch ARIS MWL Server now"; \
  Flags: nowait postinstall skipifsilent


; ─────────────────────────────────────────────────────────────────────────────
[UninstallRun]
; Remove the firewall rule
Filename: "netsh"; \
  Parameters: "advfirewall firewall delete rule name=""ARIS MWL Server"""; \
  Flags: runhidden; \
  RunOnceId: "DelFirewallRule"


; ─────────────────────────────────────────────────────────────────────────────
[UninstallDelete]
; Remove runtime files that Inno Setup's uninstaller won't track
Type: files;      Name: "{app}\aris_mwl_config.json"
Type: files;      Name: "{app}\aris_mwl.log"
Type: files;      Name: "{app}\aris_mwl.log.1"
Type: files;      Name: "{app}\aris_mwl.log.2"
Type: files;      Name: "{app}\aris_mwl.log.3"
Type: filesandordirs; Name: "{app}\_internal"
Type: dirifempty; Name: "{app}"
