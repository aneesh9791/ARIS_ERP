ARIS MWL Server
===============
DICOM Modality Worklist (MWL) server that fetches scheduled studies
from the ARIS ERP and serves them to imaging modalities (CT, MRI, X-Ray etc.)
via the DICOM C-FIND protocol.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INSTALLATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Double-click  ARIS_MWL_Server_Setup.exe
   → Click Next → Install
   → The app is installed to C:\Program Files\ARIS_MWL\
   → Windows Firewall rule for port 104 is added automatically
   → Administrator elevation is handled automatically (UAC prompt)

2. Launch from Start Menu → ARIS MWL Server
   (or tick "Launch now" at the end of the installer)

3. Go to the  Settings  tab and enter:
      ERP URL      →  https://your-aris-erp.com
      Bearer Token →  (copy from ARIS → Settings → MWL Settings)
      Center ID    →  (numeric ID, e.g. 1)

4. Click  "Test Connection"  — confirm it shows OK.

5. Click  "▶ Start DICOM Server"

6. Click  "⟳ Refresh Now"  — patients appear in the Worklist tab.

7. Optional: tick  "Start ARIS MWL Server automatically when Windows starts"
   The app will then start silently in the system tray on every boot.

To uninstall:  Control Panel → Programs → ARIS MWL Server → Uninstall

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REQUIREMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Windows 10 / 11  (64-bit recommended)
  Windows 7 / 8 also supported
• Network access to the ARIS ERP server (HTTPS)

No Python, no additional software required.
Administrator elevation, firewall rule, and Program Files
installation are all handled automatically by the installer.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODALITY CONFIGURATION (on the scanner)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Add a new MWL Server / Worklist Provider on the scanner:
  Host / IP   →  IP address of the Windows PC running this app
  Port        →  104  (default)
  AE Title    →  ARIS_MWL  (or whatever you set in Settings)
  Called AE   →  ARIS_MWL

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GETTING THE BEARER TOKEN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Log in to ARIS ERP as admin
2. Go to Settings → MWL Settings
3. Find your center and click "Generate Token"
4. Copy the token immediately (shown only once)
5. Paste it in this app's Settings tab → Bearer Token

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW IT WORKS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. App polls ARIS ERP every N minutes (configurable) via HTTPS.

2. The ERP returns DICOM-ready worklist items:
   • Patient name, PID, DOB, sex
   • Accession number, Study UID
   • Scheduled procedure (modality, date/time, description)
   • Referring physician

3. Worklist is cached locally and served to scanners over DICOM.

4. When a scanner (CT/MRI/X-Ray) sends a C-FIND query, this app
   responds with matching items — pre-populating the patient and
   study information on acquired images automatically.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONFIG FILE & LOGS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Both files are stored in the same folder as the EXE:

  aris_mwl_config.json  —  settings (bearer token stored encrypted)
  aris_mwl.log          —  activity log (rotates at 5 MB, keeps 3 backups)

Do not share aris_mwl_config.json — it contains your bearer token.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
USING A PORT OTHER THAN 104
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
If you cannot run as Administrator, use port 4242 or 11112.
Change it in Settings → Port, then configure the scanner to match.
No firewall rule needed for ports above 1024.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TROUBLESHOOTING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• "Permission denied on port 104"
  → Run EXE as Administrator (see step 2 above)

• "Cannot connect to ERP"
  → Check ERP URL is https:// and reachable from this PC
  → Check Bearer Token and Center ID are correct
  → Use Diagnostics tab → Test ERP Connection

• Scanner not receiving worklist
  → Use Diagnostics tab → DICOM Self-test (verifies SCP is running)
  → Use Diagnostics tab → C-ECHO to ping the scanner
  → Check scanner's MWL config matches IP/Port/AE Title
  → Check Windows Firewall (see above)

• Token lost / need to regenerate
  → Log in to ARIS ERP → Settings → MWL Settings → Generate Token
  → Paste new token in Settings tab → Save
