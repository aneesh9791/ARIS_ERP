; ─────────────────────────────────────────────────────────────────────────────
; ARIS MWL Server — Inno Setup 6 installer script
;
; Build order:
;   1. Run build.bat  →  produces  dist\ARIS_MWL_Server\
;   2. Compile:  iscc setup.iss
;   →  output:   dist\ARIS_MWL_Server_Setup.exe
;
; Windows compatibility:
;   Minimum: Windows 8.1 / Server 2012 R2  (Python 3.9+ requirement)
;   Tested:  Windows 8.1, 10, 11
;   Note:    Windows 7 is NOT supported — Python 3.9+ does not run on Win 7.
;            For Win 7 support a Python 3.8 build would be required.
; ─────────────────────────────────────────────────────────────────────────────

[Setup]
; ── Unique app identity (NEVER change the AppId GUID) ──────────────────────
AppId={{A7D2F3E1-4B8C-4E9A-B1C2-3D5F6A7B8C9D}
AppName=ARIS MWL Server
AppVersion=1.2
AppVerName=ARIS MWL Server 1.2
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
; Admin needed for: Program Files install + firewall rule.
; The app itself does NOT require admin at runtime (config/log in %LOCALAPPDATA%).
PrivilegesRequired=admin

; ── Windows version info (shown in Programs & Features) ───────────────────
VersionInfoVersion=1.2.0.0
VersionInfoCompany=ARIS Health Systems
VersionInfoDescription=ARIS DICOM Modality Worklist Server
VersionInfoProductName=ARIS MWL Server
VersionInfoProductVersion=1.2

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
; Windows 8.1 (NT 6.3) is the true minimum for Python 3.9+.
; Blocking Win 7 prevents a confusing silent failure on first launch.
MinVersion=6.3


; ─────────────────────────────────────────────────────────────────────────────
[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"


; ─────────────────────────────────────────────────────────────────────────────
[Dirs]
; Install directory — read-only for normal users (app does NOT write here)
Name: "{app}"
; App data directory — user-writable without admin (config + logs live here)
Name: "{localappdata}\ARIS_MWL"; Permissions: users-full


; ─────────────────────────────────────────────────────────────────────────────
[Tasks]
Name: "desktopicon"; \
  Description: "Create a &desktop shortcut"; \
  GroupDescription: "Additional icons:"; \
  Flags: unchecked

; Startup entry — checked by default so the app runs silently on every login.
; App has no UAC manifest, so Windows starts it without any elevation prompt.
Name: "startupentry"; \
  Description: "Start ARIS MWL Server automatically when &Windows starts (recommended)"; \
  GroupDescription: "Startup:"


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
; ── Windows startup entry (runs for the installing user) ──────────────────
; No UAC prompt at startup because the exe has no requireAdministrator manifest.
Root: HKCU; \
  Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; \
  ValueType: string; \
  ValueName: "ARIS_MWL_Server"; \
  ValueData: """{app}\ARIS_MWL_Server.exe"" --minimized"; \
  Flags: uninsdeletevalue; \
  Tasks: startupentry


; ─────────────────────────────────────────────────────────────────────────────
[Run]
; Add Windows Firewall inbound rules for DICOM ports 104 and 11112
Filename: "netsh"; \
  Parameters: "advfirewall firewall add rule name=""ARIS MWL Server"" dir=in action=allow protocol=TCP localport=104 profile=any"; \
  Flags: runhidden; \
  StatusMsg: "Configuring Windows Firewall (port 104)..."

Filename: "netsh"; \
  Parameters: "advfirewall firewall add rule name=""ARIS MWL Server (11112)"" dir=in action=allow protocol=TCP localport=11112 profile=any"; \
  Flags: runhidden; \
  StatusMsg: "Configuring Windows Firewall (port 11112)..."

; Offer to launch the app immediately after install
Filename: "{app}\ARIS_MWL_Server.exe"; \
  Description: "Launch ARIS MWL Server now"; \
  Flags: nowait postinstall skipifsilent


; ─────────────────────────────────────────────────────────────────────────────
[UninstallRun]
; Remove both firewall rules
Filename: "netsh"; \
  Parameters: "advfirewall firewall delete rule name=""ARIS MWL Server"""; \
  Flags: runhidden; \
  RunOnceId: "DelFirewallRule104"

Filename: "netsh"; \
  Parameters: "advfirewall firewall delete rule name=""ARIS MWL Server (11112)"""; \
  Flags: runhidden; \
  RunOnceId: "DelFirewallRule11112"


; ─────────────────────────────────────────────────────────────────────────────
[UninstallDelete]
; Remove PyInstaller _internal folder and empty app dir
Type: filesandordirs; Name: "{app}\_internal"
Type: dirifempty;     Name: "{app}"
; Note: user data in {localappdata}\ARIS_MWL (config, logs) is intentionally
;       preserved on uninstall so settings survive a reinstall.
