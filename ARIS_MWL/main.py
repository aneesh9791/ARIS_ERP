"""
ARIS MWL Server — Windows Desktop Application
Modality Worklist SCP that fetches scheduled studies from ARIS ERP.

Tabs:
  1. Worklist  — patient/study list fetched from ERP
  2. Settings  — ERP connection (URL, token, center ID) + DICOM AE/port
  3. Log       — live activity log

Requirements: pip install -r requirements.txt
"""
import sys
import os
import ipaddress
import threading
import logging
import logging.handlers
import tkinter as tk
from tkinter import ttk, messagebox
from datetime import datetime
from typing import Optional

import customtkinter as ctk
import pystray
from PIL import Image, ImageDraw

import config as cfg_module
import erp_client
import dicom_server

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format='%(levelname)s %(name)s: %(message)s')
logger = logging.getLogger('aris_mwl')

_LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'aris_mwl.log')
_file_handler = logging.handlers.RotatingFileHandler(
    _LOG_FILE, maxBytes=5 * 1024 * 1024, backupCount=3, encoding='utf-8')
_file_handler.setFormatter(
    logging.Formatter('%(asctime)s %(levelname)s %(name)s: %(message)s'))
logging.getLogger().addHandler(_file_handler)

# ── Theme ─────────────────────────────────────────────────────────────────────
ctk.set_appearance_mode('System')          # follows Windows dark/light mode
ctk.set_default_color_theme('blue')

# Brand accent
ACCENT  = '#1a5276'
SUCCESS = '#1e8449'
DANGER  = '#c0392b'
WARN    = '#e67e22'
GRAY    = '#717d7e'


# ═════════════════════════════════════════════════════════════════════════════
class App(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title('ARIS MWL Server')
        self.geometry('1160x700')
        self.minsize(900, 580)

        self.cfg, _config_warning = cfg_module.load()
        self._stop_refresh       = threading.Event()
        self._refresh_running    = False
        self._refresh_in_progress = False   # guard against parallel manual refreshes
        self._last_good_sync: Optional[datetime] = None
        self._config_warning  = _config_warning
        self._alive           = True        # cleared on destroy; guards self.after() in threads

        # Register DICOM log callback before building UI
        dicom_server.set_log_callback(self._log)

        self._build_ui()
        self._apply_treeview_style()

        # System tray
        self._tray_icon = None
        self._setup_tray()

        # Show config warning after UI is ready
        if self._config_warning:
            self.after(300, lambda: messagebox.showwarning(
                'Config Warning', self._config_warning, parent=self))

        # Start minimized to tray if launched with --minimized flag
        if '--minimized' in sys.argv:
            self.after(100, self.withdraw)

        # Auto-start on launch if configured
        if (self.cfg.get('erp_url') and
                self.cfg.get('erp_token') and
                self.cfg.get('erp_center_id') and
                self.cfg.get('auto_start_dicom', True)):
            self.after(400,  self._cmd_start_dicom)
            self.after(800,  self._cmd_refresh)
            self.after(1000, self._start_auto_refresh)

    # ── UI construction ───────────────────────────────────────────────────────

    def _build_ui(self):
        # ── Top header bar ──────────────────────────────────────────────────
        hdr = ctk.CTkFrame(self, height=46, corner_radius=0, fg_color=ACCENT)
        hdr.pack(fill='x')
        hdr.pack_propagate(False)
        ctk.CTkLabel(
            hdr, text='  ARIS MWL Server',
            font=ctk.CTkFont(size=17, weight='bold'),
            text_color='white',
        ).pack(side='left', padx=12, pady=8)
        ctk.CTkLabel(
            hdr, text='Modality Worklist Gateway',
            font=ctk.CTkFont(size=12),
            text_color='#aed6f1',
        ).pack(side='left', padx=4, pady=8)

        # ── Status strip ────────────────────────────────────────────────────
        sbar = ctk.CTkFrame(self, height=28, corner_radius=0)
        sbar.pack(fill='x')
        sbar.pack_propagate(False)

        self._lbl_erp   = ctk.CTkLabel(sbar, text='◉  ERP: —',        text_color=GRAY, font=ctk.CTkFont(size=12))
        self._lbl_dicom = ctk.CTkLabel(sbar, text='◉  DICOM: Stopped', text_color=GRAY, font=ctk.CTkFont(size=12))
        self._lbl_sync  = ctk.CTkLabel(sbar, text='Last sync: —',      text_color=GRAY, font=ctk.CTkFont(size=12))
        self._lbl_count = ctk.CTkLabel(sbar, text='0 studies',          text_color=GRAY, font=ctk.CTkFont(size=12))

        self._lbl_erp.pack(  side='left',  padx=(12, 20))
        self._lbl_dicom.pack(side='left',  padx=(0,  20))
        self._lbl_sync.pack( side='left',  padx=(0,  10))
        self._lbl_count.pack(side='right', padx=12)

        # ── Tab view ────────────────────────────────────────────────────────
        tabs = ctk.CTkTabview(self, anchor='nw')
        tabs.pack(fill='both', expand=True, padx=8, pady=6)
        tabs.add('Worklist')
        tabs.add('Settings')
        tabs.add('Diagnostics')
        tabs.add('Log')

        self._build_worklist_tab(tabs.tab('Worklist'))
        self._build_settings_tab(tabs.tab('Settings'))
        self._build_diagnostics_tab(tabs.tab('Diagnostics'))
        self._build_log_tab(tabs.tab('Log'))

    # ── Worklist tab ──────────────────────────────────────────────────────────

    def _build_worklist_tab(self, tab):
        # Toolbar
        bar = ctk.CTkFrame(tab, fg_color='transparent')
        bar.pack(fill='x', pady=(4, 6))

        ctk.CTkButton(bar, text='⟳  Refresh Now', width=130,
                      command=self._cmd_refresh).pack(side='left', padx=(0, 12))

        ctk.CTkLabel(bar, text='Auto every').pack(side='left', padx=(0, 4))
        self._var_interval = tk.StringVar(value=str(self.cfg.get('refresh_interval_min', 5)))
        ctk.CTkEntry(bar, textvariable=self._var_interval, width=46).pack(side='left')
        ctk.CTkLabel(bar, text='min').pack(side='left', padx=(3, 16))

        ctk.CTkLabel(bar, text='Days ahead:').pack(side='left', padx=(0, 4))
        self._var_days = tk.StringVar(value=str(self.cfg.get('days_ahead', 1)))
        ctk.CTkEntry(bar, textvariable=self._var_days, width=46).pack(side='left', padx=(0, 16))

        self._var_completed = tk.BooleanVar(value=self.cfg.get('include_completed', False))
        ctk.CTkCheckBox(bar, text='Include Completed',
                        variable=self._var_completed).pack(side='left')

        # Stale data warning banner — packed here so it sits above the table;
        # hidden with pack_forget() initially and restored with pack(before=...) later.
        self._stale_banner = ctk.CTkLabel(
            tab, text='', fg_color='#7d3c00', text_color='#fdebd0',
            font=ctk.CTkFont(size=12, weight='bold'), corner_radius=4)

        # Table
        self._tbl_frame = ctk.CTkFrame(tab)
        self._tbl_frame.pack(fill='both', expand=True)
        tbl_frame = self._tbl_frame

        cols = ('Accession #', 'Patient Name', 'PID', 'DOB', 'Sex',
                'Modality', 'Study / Procedure', 'Date', 'Time',
                'Referring Doctor', 'Status')
        widths = (150, 220, 120, 100, 50, 90, 260, 100, 70, 190, 120)

        self._tree = ttk.Treeview(tbl_frame, columns=cols,
                                  show='headings', selectmode='browse')
        for col, w in zip(cols, widths):
            self._tree.heading(col, text=col)
            self._tree.column(col, width=w, minwidth=50, stretch=False)

        vsb = ttk.Scrollbar(tbl_frame, orient='vertical',   command=self._tree.yview)
        hsb = ttk.Scrollbar(tbl_frame, orient='horizontal',  command=self._tree.xview)
        self._tree.configure(yscrollcommand=vsb.set, xscrollcommand=hsb.set)

        vsb.pack(side='right',  fill='y')
        hsb.pack(side='bottom', fill='x')
        self._tree.pack(fill='both', expand=True)

        # Row colors
        self._tree.tag_configure('completed', foreground='#7f8c8d')
        self._tree.tag_configure('emergency', foreground=DANGER)

    # ── Settings tab ─────────────────────────────────────────────────────────

    def _build_settings_tab(self, tab):
        outer = ctk.CTkScrollableFrame(tab, fg_color='transparent')
        outer.pack(fill='both', expand=True)

        # ── ERP Connection ──────────────────────────────────────────────────
        frm = ctk.CTkFrame(outer)
        frm.pack(fill='x', padx=6, pady=(6, 10))
        frm.columnconfigure(1, weight=1)

        ctk.CTkLabel(frm, text='ERP Connection',
                     font=ctk.CTkFont(size=14, weight='bold')).grid(
            row=0, column=0, columnspan=3, sticky='w', padx=14, pady=(12, 6))

        erp_fields = [
            ('ERP URL',     'erp_url',      False, 'e.g. https://aris.yourclinic.com'),
            ('Bearer Token','erp_token',    True,  'Token from ARIS → Settings → MWL'),
            ('Center ID',   'erp_center_id',False, 'Numeric center ID (e.g. 1)'),
        ]
        self._vars_erp = {}
        for i, (label, key, secret, hint) in enumerate(erp_fields, start=1):
            ctk.CTkLabel(frm, text=label + ':', width=130, anchor='e').grid(
                row=i, column=0, padx=(14, 6), pady=6, sticky='e')
            var = tk.StringVar(value=str(self.cfg.get(key, '')))
            kw  = {'show': '●'} if secret else {}
            ent = ctk.CTkEntry(frm, textvariable=var, width=480,
                               placeholder_text=hint, **kw)
            ent.grid(row=i, column=1, padx=6, pady=6, sticky='w')
            self._vars_erp[key] = var

        # SSL verify checkbox
        self._var_ssl_verify = tk.BooleanVar(value=self.cfg.get('ssl_verify', True))
        ctk.CTkCheckBox(frm, text='Verify TLS certificate (uncheck only for self-signed certs)',
                        variable=self._var_ssl_verify).grid(
            row=4, column=1, sticky='w', padx=6, pady=(0, 4))

        # Test button row
        btn_row = ctk.CTkFrame(frm, fg_color='transparent')
        btn_row.grid(row=5, column=1, sticky='w', padx=6, pady=(4, 12))
        ctk.CTkButton(btn_row, text='Test Connection', width=150,
                      command=self._cmd_test_erp).pack(side='left')
        self._lbl_test = ctk.CTkLabel(btn_row, text='', width=300)
        self._lbl_test.pack(side='left', padx=10)

        # ── DICOM Server ────────────────────────────────────────────────────
        frm2 = ctk.CTkFrame(outer)
        frm2.pack(fill='x', padx=6, pady=(0, 10))
        frm2.columnconfigure(1, weight=1)

        ctk.CTkLabel(frm2, text='DICOM MWL Server (SCP)',
                     font=ctk.CTkFont(size=14, weight='bold')).grid(
            row=0, column=0, columnspan=3, sticky='w', padx=14, pady=(12, 6))

        dicom_fields = [
            ('AE Title',    'ae_title',    'Local AE Title — max 16 ASCII chars (e.g. ARIS_MWL)'),
            ('Port',        'dicom_port',  'TCP port for DICOM C-FIND (default 104, needs admin)'),
            ('Allowed IPs', 'allowed_ips', 'Comma-separated modality IPs e.g. 192.168.1.10,192.168.1.11 — blank = allow all'),
        ]
        self._vars_dicom = {}
        for i, (label, key, hint) in enumerate(dicom_fields, start=1):
            ctk.CTkLabel(frm2, text=label + ':', width=130, anchor='e').grid(
                row=i, column=0, padx=(14, 6), pady=6, sticky='e')
            var = tk.StringVar(value=str(self.cfg.get(key, '')))
            ctk.CTkEntry(frm2, textvariable=var, width=220,
                         placeholder_text=hint).grid(
                row=i, column=1, padx=6, pady=6, sticky='w')
            self._vars_dicom[key] = var

        self._var_autostart = tk.BooleanVar(value=self.cfg.get('auto_start_dicom', True))
        ctk.CTkCheckBox(frm2, text='Auto-start DICOM server on launch',
                        variable=self._var_autostart).grid(
            row=3, column=1, sticky='w', padx=6, pady=(0, 4))

        btn_row2 = ctk.CTkFrame(frm2, fg_color='transparent')
        btn_row2.grid(row=4, column=1, sticky='w', padx=6, pady=(4, 12))
        self._btn_dicom = ctk.CTkButton(btn_row2, text='▶  Start DICOM Server',
                                        width=180, command=self._cmd_toggle_dicom)
        self._btn_dicom.pack(side='left')
        # Store default colors for safe restore in _cmd_stop_dicom
        self._btn_dicom_default_fg    = self._btn_dicom.cget('fg_color')
        self._btn_dicom_default_hover = self._btn_dicom.cget('hover_color')

        # ── Windows Startup ─────────────────────────────────────────────────
        frm3 = ctk.CTkFrame(outer)
        frm3.pack(fill='x', padx=6, pady=(0, 10))

        ctk.CTkLabel(frm3, text='Windows Startup',
                     font=ctk.CTkFont(size=14, weight='bold')).grid(
            row=0, column=0, columnspan=3, sticky='w', padx=14, pady=(12, 4))

        self._var_startup = tk.BooleanVar(
            value=self._check_startup_registered())
        ctk.CTkCheckBox(
            frm3,
            text='Start ARIS MWL Server automatically when Windows starts',
            variable=self._var_startup,
            command=self._toggle_startup,
        ).grid(row=1, column=0, columnspan=2, sticky='w', padx=14, pady=4)

        ctk.CTkLabel(
            frm3,
            text='The app will start hidden in the system tray. '
                 'Click the tray icon to open it.',
            text_color=GRAY, font=ctk.CTkFont(size=11),
        ).grid(row=2, column=0, columnspan=2, sticky='w', padx=14, pady=(0, 4))

        self._lbl_startup = ctk.CTkLabel(frm3, text='', font=ctk.CTkFont(size=11))
        self._lbl_startup.grid(row=3, column=0, columnspan=2,
                                sticky='w', padx=14, pady=(0, 12))

        # ── Save ────────────────────────────────────────────────────────────
        ctk.CTkButton(outer, text='💾  Save Settings', width=160,
                      command=self._cmd_save).pack(anchor='w', padx=12, pady=6)

        ctk.CTkLabel(outer,
                     text='ℹ  Bearer token is generated in ARIS ERP → Settings → MWL Settings.\n'
                          '   The token is shown only once. Keep it private.',
                     justify='left', text_color=GRAY,
                     font=ctk.CTkFont(size=11)).pack(anchor='w', padx=12, pady=(0, 10))

    # ── Diagnostics tab ───────────────────────────────────────────────────────

    def _build_diagnostics_tab(self, tab):
        outer = ctk.CTkScrollableFrame(tab, fg_color='transparent')
        outer.pack(fill='both', expand=True)

        # ── ERP Connection Test ─────────────────────────────────────────────
        frm1 = ctk.CTkFrame(outer)
        frm1.pack(fill='x', padx=6, pady=(8, 10))

        ctk.CTkLabel(frm1, text='ERP Connection Test',
                     font=ctk.CTkFont(size=14, weight='bold')).pack(
            anchor='w', padx=14, pady=(12, 4))
        ctk.CTkLabel(frm1,
                     text='Verifies that this app can reach the ARIS ERP and authenticate with the Bearer token.',
                     text_color=GRAY, font=ctk.CTkFont(size=11)).pack(anchor='w', padx=14, pady=(0, 8))

        row1 = ctk.CTkFrame(frm1, fg_color='transparent')
        row1.pack(anchor='w', padx=14, pady=(0, 12))
        self._btn_diag_erp = ctk.CTkButton(row1, text='▶  Test ERP Connection', width=180,
                                            command=self._diag_test_erp)
        self._btn_diag_erp.pack(side='left')
        self._diag_lbl_erp = ctk.CTkLabel(row1, text='', width=420,
                                           font=ctk.CTkFont(size=12))
        self._diag_lbl_erp.pack(side='left', padx=12)

        # ── DICOM Self-test ─────────────────────────────────────────────────
        frm2 = ctk.CTkFrame(outer)
        frm2.pack(fill='x', padx=6, pady=(0, 10))

        ctk.CTkLabel(frm2, text='DICOM Self-test  (C-FIND to localhost)',
                     font=ctk.CTkFont(size=14, weight='bold')).pack(
            anchor='w', padx=14, pady=(12, 4))
        ctk.CTkLabel(frm2,
                     text='Connects to this app\'s own DICOM SCP on localhost and sends a C-FIND query.\n'
                          'Confirms the MWL server is running and returning worklist items correctly.',
                     text_color=GRAY, font=ctk.CTkFont(size=11), justify='left').pack(
            anchor='w', padx=14, pady=(0, 8))

        row2 = ctk.CTkFrame(frm2, fg_color='transparent')
        row2.pack(anchor='w', padx=14, pady=(0, 12))
        self._btn_diag_self = ctk.CTkButton(row2, text='▶  Run Self-test', width=180,
                                             command=self._diag_self_test)
        self._btn_diag_self.pack(side='left')
        self._diag_lbl_self = ctk.CTkLabel(row2, text='', width=420,
                                            font=ctk.CTkFont(size=12))
        self._diag_lbl_self.pack(side='left', padx=12)

        # ── Modality C-ECHO ─────────────────────────────────────────────────
        frm3 = ctk.CTkFrame(outer)
        frm3.pack(fill='x', padx=6, pady=(0, 10))

        ctk.CTkLabel(frm3, text='Modality C-ECHO Test  (DICOM Ping)',
                     font=ctk.CTkFont(size=14, weight='bold')).pack(
            anchor='w', padx=14, pady=(12, 4))
        ctk.CTkLabel(frm3,
                     text='Sends a DICOM C-ECHO (verification ping) to a modality to confirm two-way connectivity.\n'
                          'Use this to verify each scanner (CT, MRI, X-Ray) can talk to this MWL server.',
                     text_color=GRAY, font=ctk.CTkFont(size=11), justify='left').pack(
            anchor='w', padx=14, pady=(0, 8))

        # Input fields grid
        grid = ctk.CTkFrame(frm3, fg_color='transparent')
        grid.pack(anchor='w', padx=14, pady=(0, 6))

        fields = [
            ('Modality IP',    '_diag_ip',         '192.168.1.x',   160),
            ('Port',           '_diag_port',        '104',            80),
            ('Modality AE',    '_diag_remote_ae',   'CT_AE_TITLE',   160),
        ]
        for col, (label, attr, hint, w) in enumerate(fields):
            ctk.CTkLabel(grid, text=label + ':').grid(row=0, column=col*2,
                                                       padx=(0, 4), pady=4, sticky='e')
            var = tk.StringVar()
            setattr(self, attr, var)
            ctk.CTkEntry(grid, textvariable=var, width=w,
                         placeholder_text=hint).grid(row=0, column=col*2+1,
                                                      padx=(0, 16), pady=4)

        row3 = ctk.CTkFrame(frm3, fg_color='transparent')
        row3.pack(anchor='w', padx=14, pady=(4, 12))
        self._btn_diag_echo = ctk.CTkButton(row3, text='▶  Send C-ECHO', width=180,
                                             command=self._diag_echo)
        self._btn_diag_echo.pack(side='left')
        self._diag_lbl_echo = ctk.CTkLabel(row3, text='', width=420,
                                            font=ctk.CTkFont(size=12))
        self._diag_lbl_echo.pack(side='left', padx=12)

        # ── Modality list (add / remove saved modalities) ───────────────────
        frm4 = ctk.CTkFrame(outer)
        frm4.pack(fill='x', padx=6, pady=(0, 10))

        ctk.CTkLabel(frm4, text='Saved Modalities',
                     font=ctk.CTkFont(size=14, weight='bold')).pack(
            anchor='w', padx=14, pady=(12, 4))
        ctk.CTkLabel(frm4,
                     text='Save modality details for quick C-ECHO testing.',
                     text_color=GRAY, font=ctk.CTkFont(size=11)).pack(
            anchor='w', padx=14, pady=(0, 6))

        list_frame = ctk.CTkFrame(frm4)
        list_frame.pack(fill='x', padx=14, pady=(0, 8))

        cols = ('Name', 'IP', 'Port', 'AE Title', 'Last Echo', 'Result')
        self._mod_tree = ttk.Treeview(list_frame, columns=cols,
                                      show='headings', height=5)
        widths = (120, 130, 60, 140, 150, 100)
        for col, w in zip(cols, widths):
            self._mod_tree.heading(col, text=col)
            self._mod_tree.column(col, width=w, minwidth=50)
        self._mod_tree.pack(fill='x', pady=(0, 6))
        self._mod_tree.tag_configure('ok',   foreground='#1e8449')
        self._mod_tree.tag_configure('fail', foreground=DANGER)

        btn_row4 = ctk.CTkFrame(frm4, fg_color='transparent')
        btn_row4.pack(anchor='w', padx=14, pady=(0, 12))
        ctk.CTkButton(btn_row4, text='+ Save Current',  width=130,
                      command=self._diag_save_modality).pack(side='left', padx=(0, 8))
        ctk.CTkButton(btn_row4, text='Echo Selected',   width=130,
                      command=self._diag_echo_selected).pack(side='left', padx=(0, 8))
        ctk.CTkButton(btn_row4, text='Echo All',        width=100,
                      command=self._diag_echo_all).pack(side='left', padx=(0, 8))
        ctk.CTkButton(btn_row4, text='Remove',          width=90,
                      fg_color=DANGER, hover_color='#a93226',
                      command=self._diag_remove_modality).pack(side='left')

        # Load saved modalities
        self._reload_modality_list()

    # ── Diagnostics commands ──────────────────────────────────────────────────

    def _diag_test_erp(self):
        self._btn_diag_erp.configure(state='disabled', text='Testing…')
        self._diag_lbl_erp.configure(text='', text_color=GRAY)
        def _run():
            ok, msg = erp_client.test_connection(self.cfg)
            color  = SUCCESS if ok else DANGER
            prefix = '✓  ' if ok else '✗  '
            self.after(0, lambda: (
                self._diag_lbl_erp.configure(text=prefix + msg, text_color=color),
                self._btn_diag_erp.configure(state='normal', text='▶  Test ERP Connection'),
            ))
            self._log(f'ERP test: {msg}')
        threading.Thread(target=_run, daemon=True).start()

    def _diag_self_test(self):
        self._btn_diag_self.configure(state='disabled', text='Testing…')
        self._diag_lbl_self.configure(text='', text_color=GRAY)
        # Read port from the live UI field (not stale cfg) so test matches what's configured
        ae   = self._vars_dicom['ae_title'].get().strip() or self.cfg.get('ae_title', 'ARIS_MWL')
        try:
            port = int(self._vars_dicom['dicom_port'].get().strip() or self.cfg.get('dicom_port', 104))
        except ValueError:
            port = int(self.cfg.get('dicom_port', 104))
        def _run():
            ok, msg, count = dicom_server.self_test(ae, port)
            color  = SUCCESS if ok else DANGER
            prefix = '✓  ' if ok else '✗  '
            self.after(0, lambda: (
                self._diag_lbl_self.configure(text=prefix + msg, text_color=color),
                self._btn_diag_self.configure(state='normal', text='▶  Run Self-test'),
            ))
            self._log(f'DICOM self-test: {msg}')
        threading.Thread(target=_run, daemon=True).start()

    def _diag_echo(self, ip=None, port=None, remote_ae=None, result_label=None):
        ip        = ip        or self._diag_ip.get().strip()
        port      = port      or self._diag_port.get().strip()
        remote_ae = remote_ae or self._diag_remote_ae.get().strip()
        lbl       = result_label or self._diag_lbl_echo
        # Only manage the main echo button when called directly (not from Echo All/Selected)
        own_btn   = result_label is None

        if not ip or not port or not remote_ae:
            lbl.configure(text='Fill in IP, Port and AE Title', text_color=WARN)
            return

        try:
            port_int = int(port)
            if not (1 <= port_int <= 65535):
                raise ValueError
        except ValueError:
            lbl.configure(text=f'Invalid port: "{port}"', text_color=WARN)
            return

        if own_btn:
            self._btn_diag_echo.configure(state='disabled', text='Sending…')
        lbl.configure(text=f'Sending C-ECHO to {remote_ae} @ {ip}:{port_int} …', text_color=GRAY)
        local_ae = self.cfg.get('ae_title', 'ARIS_MWL')

        def _run():
            ok, msg, ms = dicom_server.echo_modality(ip, port_int, remote_ae, local_ae)
            color  = SUCCESS if ok else DANGER
            prefix = '✓  ' if ok else '✗  '
            def _done():
                lbl.configure(text=prefix + msg, text_color=color)
                if own_btn:
                    self._btn_diag_echo.configure(state='normal', text='▶  Send C-ECHO')
            self.after(0, _done)
            self._log(f'C-ECHO {remote_ae}@{ip}:{port} → {msg}')

        threading.Thread(target=_run, daemon=True).start()

    def _diag_save_modality(self):
        ip        = self._diag_ip.get().strip()
        port      = self._diag_port.get().strip()
        remote_ae = self._diag_remote_ae.get().strip()
        if not ip or not port or not remote_ae:
            messagebox.showwarning('Missing Fields',
                                   'Enter IP, Port and AE Title before saving.',
                                   parent=self)
            return
        modalities = self.cfg.get('saved_modalities', [])
        # Avoid duplicates by AE title
        modalities = [m for m in modalities if m.get('ae') != remote_ae]
        modalities.append({'name': remote_ae, 'ip': ip,
                            'port': int(port), 'ae': remote_ae})
        self.cfg['saved_modalities'] = modalities
        cfg_module.save(self.cfg)
        self._reload_modality_list()
        self._log(f'Saved modality {remote_ae} @ {ip}:{port}')

    def _diag_remove_modality(self):
        sel = self._mod_tree.selection()
        if not sel:
            return
        ae = self._mod_tree.item(sel[0])['values'][3]
        modalities = [m for m in self.cfg.get('saved_modalities', [])
                      if m.get('ae') != ae]
        self.cfg['saved_modalities'] = modalities
        cfg_module.save(self.cfg)
        self._reload_modality_list()

    def _diag_echo_selected(self):
        sel = self._mod_tree.selection()
        if not sel:
            return
        vals = self._mod_tree.item(sel[0])['values']
        self._diag_ip.set(str(vals[1]))
        self._diag_port.set(str(vals[2]))
        self._diag_remote_ae.set(str(vals[3]))
        self._diag_echo()

    def _diag_echo_all(self):
        modalities = self.cfg.get('saved_modalities', [])
        if not modalities:
            return
        local_ae = self.cfg.get('ae_title', 'ARIS_MWL')

        def _echo_one(m):
            ok, msg, ms = dicom_server.echo_modality(
                m['ip'], m['port'], m['ae'], local_ae)
            result = f'{"OK" if ok else "FAIL"}  {ms}ms'
            tag    = 'ok' if ok else 'fail'
            ts     = datetime.now().strftime('%H:%M:%S')
            self.after(0, self._update_modality_result, m['ae'], ts, result, tag)
            self._log(f'C-ECHO {m["ae"]}@{m["ip"]}:{m["port"]} → {msg}')

        # Each modality echoed in parallel — one timeout doesn't block others
        for m in modalities:
            threading.Thread(target=_echo_one, args=(m,), daemon=True).start()

    def _update_modality_result(self, ae, ts, result, tag):
        for item in self._mod_tree.get_children():
            if self._mod_tree.item(item)['values'][3] == ae:
                vals = list(self._mod_tree.item(item)['values'])
                vals[4] = ts
                vals[5] = result
                self._mod_tree.item(item, values=vals, tags=(tag,))
                break

    def _reload_modality_list(self):
        for row in self._mod_tree.get_children():
            self._mod_tree.delete(row)
        for m in self.cfg.get('saved_modalities', []):
            self._mod_tree.insert('', 'end', values=(
                m.get('name', m.get('ae', '')),
                m.get('ip', ''),
                m.get('port', ''),
                m.get('ae', ''),
                '—', '—',
            ))

    # ── Log tab ───────────────────────────────────────────────────────────────

    def _build_log_tab(self, tab):
        self._log_box = ctk.CTkTextbox(
            tab, wrap='word',
            font=ctk.CTkFont(family='Consolas', size=11),
            state='disabled',
        )
        self._log_box.pack(fill='both', expand=True, padx=4, pady=(4, 0))
        ctk.CTkButton(tab, text='Clear Log', width=90,
                      command=self._clear_log).pack(anchor='e', padx=8, pady=6)

    # ── Treeview style ────────────────────────────────────────────────────────

    def _apply_treeview_style(self):
        style = ttk.Style(self)
        style.theme_use('clam')
        style.configure('Treeview',
                        rowheight=32, font=('Segoe UI', 12),
                        background='#1c1c1c', foreground='#ececec',
                        fieldbackground='#1c1c1c', borderwidth=0)
        style.configure('Treeview.Heading',
                        font=('Segoe UI', 12, 'bold'),
                        background='#2b2b2b', foreground='white')
        style.map('Treeview', background=[('selected', '#1a5276')])

    # ── Commands ──────────────────────────────────────────────────────────────

    def _cmd_refresh(self):
        """Fetch worklist from ERP in a background thread."""
        if self._refresh_in_progress:
            return   # drop duplicate request — previous fetch still running
        self._refresh_in_progress = True
        self._sync_runtime_cfg()

        def _fetch():
            try:
                items = erp_client.fetch_worklist(self.cfg)
                dicom_server.update_cache(items)
                self.after(0, self._populate_table, items)
                self.after(0, self._set_erp_status, True,
                           f'Connected  ({len(items)} studies)')
                self._log(f'Worklist refreshed — {len(items)} studies')
            except Exception as exc:
                msg = str(exc)
                self.after(0, self._set_erp_status, False, msg)
                self._log(f'Refresh error: {msg}')
            finally:
                self._refresh_in_progress = False

        threading.Thread(target=_fetch, daemon=True).start()

    def _cmd_start_dicom(self):
        ae          = self._vars_dicom['ae_title'].get().strip()    or 'ARIS_MWL'
        allowed_ips = self._vars_dicom['allowed_ips'].get().strip()
        port_str    = self._vars_dicom['dicom_port'].get().strip()
        try:
            port = int(port_str) if port_str else self.cfg.get('dicom_port', 104)
            if not (1 <= port <= 65535):
                raise ValueError(f'Port {port} out of range')
        except ValueError as e:
            messagebox.showerror('Invalid Port', str(e), parent=self)
            return
        try:
            dicom_server.start(ae, port, allowed_ips=allowed_ips)
            self._set_dicom_status(True, ae, port)
            self._btn_dicom.configure(text='■  Stop DICOM Server',
                                      fg_color=DANGER, hover_color='#a93226')
        except PermissionError:
            msg = (f'Permission denied on port {port}.\n\n'
                   f'Port {port} requires Administrator privileges on Windows.\n\n'
                   'Fix 1 (recommended):  Change the port to 11112 in Settings\n'
                   '         (set your scanner to port 11112 too — no admin needed)\n\n'
                   'Fix 2:  Right-click the EXE → Run as Administrator\n\n'
                   'Fix 3:  Right-click EXE → Properties → Compatibility\n'
                   '        → tick "Run this program as an administrator"')
            self._log(f'DICOM start failed: permission denied on port {port}')
            messagebox.showerror('Permission Denied', msg, parent=self)
        except OSError as exc:
            err = str(exc)
            if 'in use' in err.lower() or '98' in err or '10048' in err:
                msg = (f'Port {port} is already in use by another application.\n\n'
                       'Another DICOM server or service may be running on this port.\n\n'
                       'Try changing the port to 11112 in Settings.')
            else:
                msg = f'Network error starting DICOM server:\n\n{exc}'
            self._log(f'DICOM start failed (OSError): {exc}')
            messagebox.showerror('DICOM Server Error', msg, parent=self)
        except Exception as exc:
            self._log(f'DICOM start failed: {type(exc).__name__}: {exc}')
            messagebox.showerror('DICOM Server Error',
                                 f'{type(exc).__name__}:\n\n{exc}', parent=self)

    def _cmd_stop_dicom(self):
        dicom_server.stop()
        self._set_dicom_status(False)
        self._btn_dicom.configure(
            text='▶  Start DICOM Server',
            fg_color=self._btn_dicom_default_fg,
            hover_color=self._btn_dicom_default_hover,
        )

    def _cmd_toggle_dicom(self):
        if not self._cmd_save():   # always save settings first; abort on validation error
            return
        if dicom_server.is_running():
            self._cmd_stop_dicom()
        else:
            self._cmd_start_dicom()

    def _cmd_test_erp(self):
        self._cmd_save()
        self._lbl_test.configure(text='Testing…', text_color=GRAY)

        def _test():
            ok, msg = erp_client.test_connection(self.cfg)
            color   = SUCCESS if ok else DANGER
            text    = ('✓  ' if ok else '✗  ') + msg
            self.after(0, lambda: self._lbl_test.configure(text=text, text_color=color))

        threading.Thread(target=_test, daemon=True).start()

    def _cmd_save(self) -> bool:
        """Validate and save all settings from UI back to config file.
        Returns True on success, False if validation failed."""
        # Validate AE title
        ae_title = self._vars_dicom['ae_title'].get().strip()
        if ae_title:
            if len(ae_title) > 16:
                messagebox.showerror('Invalid AE Title',
                    f'AE Title must be ≤16 characters. "{ae_title}" is {len(ae_title)} chars.',
                    parent=self)
                return False
            if not ae_title.isascii():
                messagebox.showerror('Invalid AE Title',
                    'AE Title must contain only ASCII characters.', parent=self)
                return False

        # Validate port
        port_str = self._vars_dicom['dicom_port'].get().strip()
        if port_str:
            try:
                port_int = int(port_str)
                if not (1 <= port_int <= 65535):
                    raise ValueError
            except ValueError:
                messagebox.showerror('Invalid Port',
                    f'Port must be a number between 1 and 65535. Got: "{port_str}"',
                    parent=self)
                return False

        # Validate IP allowlist (WORKFLOW-F)
        allowed_ips_str = self._vars_dicom['allowed_ips'].get().strip()
        if allowed_ips_str:
            bad_ips = []
            for ip in allowed_ips_str.split(','):
                ip = ip.strip()
                if ip:
                    try:
                        ipaddress.ip_address(ip)
                    except ValueError:
                        bad_ips.append(ip)
            if bad_ips:
                messagebox.showerror('Invalid IP Address',
                    f'The following entries are not valid IP addresses:\n'
                    f'{", ".join(bad_ips)}\n\n'
                    f'Use comma-separated IPv4 or IPv6 addresses (e.g. 192.168.1.10)',
                    parent=self)
                return False

        # Capture current DICOM-critical settings before saving (WORKFLOW-A)
        dicom_was_running    = dicom_server.is_running()
        old_ae               = self.cfg.get('ae_title', '')
        old_port             = self.cfg.get('dicom_port', 104)
        old_allowed          = self.cfg.get('allowed_ips', '')

        for key, var in self._vars_erp.items():
            self.cfg[key] = var.get().strip()
        for key, var in self._vars_dicom.items():
            val = var.get().strip()
            if key == 'dicom_port':
                self.cfg[key] = int(val) if val else self.cfg.get('dicom_port', 104)
            else:
                self.cfg[key] = val
        self.cfg['auto_start_dicom']     = self._var_autostart.get()
        self.cfg['refresh_interval_min'] = _safe_int(self._var_interval.get(), 5)
        self.cfg['days_ahead']           = _safe_int(self._var_days.get(), 1)
        self.cfg['include_completed']    = self._var_completed.get()
        self.cfg['ssl_verify']           = self._var_ssl_verify.get()
        cfg_module.save(self.cfg)
        self._log('Settings saved')

        # WORKFLOW-A: warn and offer restart if DICOM settings changed while running
        if dicom_was_running:
            new_ae      = self.cfg.get('ae_title', '')
            new_port    = self.cfg.get('dicom_port', 104)
            new_allowed = self.cfg.get('allowed_ips', '')
            if (new_ae != old_ae or new_port != old_port or new_allowed != old_allowed):
                restart = messagebox.askyesno(
                    'DICOM Settings Changed',
                    'DICOM server settings (AE Title / Port / Allowed IPs) have changed.\n\n'
                    'The running DICOM server is still using the old settings.\n\n'
                    'Restart the DICOM server now to apply the new settings?',
                    parent=self)
                if restart:
                    self._cmd_stop_dicom()
                    self._cmd_start_dicom()

        return True

    def _clear_log(self):
        self._log_box.configure(state='normal')
        self._log_box.delete('1.0', 'end')
        self._log_box.configure(state='disabled')

    # ── Auto-refresh loop ────────────────────────────────────────────────────

    def _start_auto_refresh(self):
        if self._refresh_running:
            return   # guard against double invocation
        self._refresh_running = True
        self._stop_refresh.clear()

        def _loop():
            while not self._stop_refresh.wait(
                    timeout=self.cfg.get('refresh_interval_min', 5) * 60):
                self.after(0, self._cmd_refresh)
            self._refresh_running = False

        threading.Thread(target=_loop, daemon=True, name='auto-refresh').start()

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _sync_runtime_cfg(self):
        """Push toolbar controls into cfg without writing to disk."""
        self.cfg['refresh_interval_min'] = _safe_int(self._var_interval.get(), 5)
        self.cfg['days_ahead']           = _safe_int(self._var_days.get(), 1)
        self.cfg['include_completed']    = self._var_completed.get()

    def _populate_table(self, items: list):
        for row in self._tree.get_children():
            self._tree.delete(row)

        for item in items:
            proc    = item.get('scheduled_procedure', {}) or {}
            tags    = []
            status  = item.get('workflow_status', '')
            if 'COMPLETED' in str(status).upper():
                tags.append('completed')
            if proc.get('emergency'):
                tags.append('emergency')

            self._tree.insert('', 'end', tags=tuple(tags), values=(
                item.get('accession_number') or '—',
                item.get('patient_name', ''),
                item.get('patient_pid', ''),
                item.get('patient_dob_iso', ''),
                item.get('patient_sex', ''),
                proc.get('modality', ''),
                proc.get('procedure_description', ''),
                proc.get('scheduled_date', ''),
                proc.get('scheduled_time', ''),
                item.get('referring_physician_name', ''),
                status,
            ))

        self._last_good_sync = datetime.now()
        self._stale_banner.pack_forget()   # hide stale warning on successful refresh
        self._lbl_count.configure(
            text=f'{len(items)} studies', text_color='white')
        self._lbl_sync.configure(
            text=f'Last sync: {self._last_good_sync.strftime("%H:%M:%S")}',
            text_color='white')

    def _set_erp_status(self, ok: bool, msg: str = ''):
        if ok:
            self._lbl_erp.configure(text=f'◉  ERP: {msg}', text_color=SUCCESS)
        else:
            self._lbl_erp.configure(text='◉  ERP: Error', text_color=DANGER)
            # Show stale banner if data is more than 30 minutes old
            if (self._last_good_sync and
                    (datetime.now() - self._last_good_sync).total_seconds() > 1800):
                self._stale_banner.configure(
                    text=f'  ⚠  Worklist data is stale — last update was '
                         f'{self._last_good_sync.strftime("%H:%M:%S")}. '
                         f'ERP is unreachable. Modalities are receiving outdated data.  ')
                self._stale_banner.pack(
                    fill='x', padx=4, pady=(0, 4), before=self._tbl_frame)

    def _set_dicom_status(self, running: bool, ae: str = '', port: int = 0):
        if running:
            self._lbl_dicom.configure(
                text=f'◉  DICOM: {ae}:{port}', text_color=SUCCESS)
        else:
            self._lbl_dicom.configure(
                text='◉  DICOM: Stopped', text_color=GRAY)

    def _log(self, msg: str):
        ts   = datetime.now().strftime('%H:%M:%S')
        line = f'[{ts}]  {msg}\n'
        if not self._alive:
            return   # window already destroyed — log to file handler only
        try:
            self.after(0, self._append_log, line)
        except Exception:
            pass   # Tcl/Tk destroyed before thread finished

    _MAX_LOG_LINES = 2000

    def _append_log(self, line: str):
        self._log_box.configure(state='normal')
        self._log_box.insert('end', line)
        self._log_box.see('end')
        # Trim oldest lines when over cap
        try:
            total = int(self._log_box.index('end-1c').split('.')[0])
            if total > self._MAX_LOG_LINES:
                self._log_box.delete('1.0', f'{total - self._MAX_LOG_LINES}.0')
        except Exception:
            pass
        self._log_box.configure(state='disabled')

    # ── System tray ───────────────────────────────────────────────────────────

    def _make_tray_image(self) -> Image.Image:
        """Draw a simple blue circle icon with 'MWL' text."""
        size = 64
        img  = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        d    = ImageDraw.Draw(img)
        d.ellipse([0, 0, size - 1, size - 1], fill='#1a5276')
        # Draw three white bars to suggest a worklist/list icon
        bar_x, bar_w, bar_h = 14, 36, 5
        for y in [16, 28, 40]:
            d.rectangle([bar_x, y, bar_x + bar_w, y + bar_h], fill='white')
        return img

    def _setup_tray(self):
        image = self._make_tray_image()
        menu  = pystray.Menu(
            pystray.MenuItem('Show ARIS MWL Server',
                             self._tray_show, default=True),
            pystray.MenuItem('Refresh Worklist',
                             lambda icon, item: self.after(0, self._cmd_refresh)),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem(
                lambda text: ('Stop DICOM Server'
                              if dicom_server.is_running()
                              else 'Start DICOM Server'),
                lambda icon, item: self.after(0, self._cmd_toggle_dicom),
            ),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem('Exit', self._tray_exit),
        )
        self._tray_icon = pystray.Icon(
            'ARIS_MWL_Server', image, 'ARIS MWL Server', menu)
        threading.Thread(
            target=self._tray_icon.run, daemon=True, name='tray').start()

    def _tray_show(self, icon=None, item=None):
        self.after(0, self.deiconify)
        self.after(0, self.lift)
        self.after(0, self.focus_force)

    def _tray_exit(self, icon=None, item=None):
        self._alive = False
        self._stop_refresh.set()
        if dicom_server.is_running():
            dicom_server.stop()
        if self._tray_icon:
            self._tray_icon.stop()
        try:
            self.after(0, self.destroy)
        except Exception:
            pass

    # ── Windows startup registration ──────────────────────────────────────────

    def _check_startup_registered(self) -> bool:
        """Check if the app is already registered in Windows startup."""
        try:
            import winreg
            key = winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                r'Software\Microsoft\Windows\CurrentVersion\Run',
                0, winreg.KEY_READ)
            winreg.QueryValueEx(key, 'ARIS_MWL_Server')
            winreg.CloseKey(key)
            return True
        except Exception:
            return False

    def _set_windows_startup(self, enabled: bool) -> tuple:
        """
        Add/remove the app from HKCU\\...\\Run so it launches at Windows login.
        Returns (success: bool, message: str).
        """
        try:
            import winreg
        except ImportError:
            return False, 'winreg not available (not running on Windows)'

        APP_KEY = 'ARIS_MWL_Server'
        REG_PATH = r'Software\Microsoft\Windows\CurrentVersion\Run'

        try:
            key = winreg.OpenKey(
                winreg.HKEY_CURRENT_USER, REG_PATH,
                0, winreg.KEY_SET_VALUE)

            if enabled:
                # Build the startup command — EXE or pythonw
                if getattr(sys, 'frozen', False):
                    cmd = f'"{sys.executable}" --minimized'
                else:
                    cmd = (f'"{sys.executable}" '
                           f'"{os.path.abspath(__file__)}" --minimized')
                winreg.SetValueEx(key, APP_KEY, 0, winreg.REG_SZ, cmd)
                msg = f'Registered in Windows startup:\n{cmd}'
            else:
                try:
                    winreg.DeleteValue(key, APP_KEY)
                    msg = 'Removed from Windows startup'
                except FileNotFoundError:
                    msg = 'Was not in Windows startup (nothing to remove)'

            winreg.CloseKey(key)
            return True, msg

        except PermissionError:
            return False, 'Permission denied writing to registry'
        except Exception as exc:
            return False, str(exc)

    def _toggle_startup(self):
        enabled = self._var_startup.get()
        ok, msg = self._set_windows_startup(enabled)
        color   = SUCCESS if ok else DANGER
        self._lbl_startup.configure(
            text=('✓  ' if ok else '✗  ') + msg.split('\n')[0],
            text_color=color)
        self._log(f'Windows startup {"enabled" if enabled else "disabled"}: {msg}')

    # ── Window close ─────────────────────────────────────────────────────────

    def on_close(self):
        """Clicking X hides to tray — app keeps running in background."""
        self.withdraw()
        if self._tray_icon and hasattr(self._tray_icon, 'notify'):
            try:
                self._tray_icon.notify(
                    'ARIS MWL Server is still running.\n'
                    'Double-click the tray icon to reopen.',
                    'Running in background'
                )
            except (NotImplementedError, Exception):
                pass   # notify not supported on this pystray backend


# ── Utility ───────────────────────────────────────────────────────────────────

def _safe_int(value, default: int) -> int:
    try:
        return int(value)
    except (ValueError, TypeError):
        return default


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == '__main__':
    app = App()
    app.protocol('WM_DELETE_WINDOW', app.on_close)
    app.mainloop()
