"""
config.py — Persistent JSON configuration for ARIS MWL Server

Security note: The bearer token is stored using Windows DPAPI encryption
(via pywin32) when available. On non-Windows or when pywin32 is not installed,
the token is stored as plaintext — a warning is shown on load.
"""
import json
import os
import base64
import logging

logger = logging.getLogger(__name__)

CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'aris_mwl_config.json')

DEFAULTS = {
    'erp_url':              '',
    'erp_token':            '',
    'erp_center_id':        '',
    'ae_title':             'ARIS_MWL',
    'dicom_port':           104,
    'refresh_interval_min': 5,
    'days_ahead':           1,
    'include_completed':    False,
    'auto_start_dicom':     True,
    'allowed_ips':          '',    # comma-separated IP allowlist for DICOM SCP; empty = allow all
    'ssl_verify':           True,  # verify ERP TLS certificate; set False only for self-signed certs
}

# ── DPAPI token encryption (Windows only, pywin32 required) ──────────────────

def _encrypt_token(token: str) -> str:
    """Encrypt token using Windows DPAPI. Returns base64 string."""
    try:
        import win32crypt
        encrypted = win32crypt.CryptProtectData(
            token.encode('utf-8'), 'ARIS_MWL_TOKEN', None, None, None, 0)
        return 'dpapi:' + base64.b64encode(encrypted).decode('ascii')
    except Exception:
        # DPAPI not available — store base64-encoded with b64: prefix
        return 'b64:' + base64.b64encode(token.encode('utf-8')).decode('ascii')


def _decrypt_token(stored: str) -> str:
    """Decrypt a stored token. Handles dpapi:, b64:, plain: (legacy), and raw plaintext."""
    if not stored:
        return ''
    if stored.startswith('dpapi:'):
        try:
            import win32crypt
            encrypted = base64.b64decode(stored[6:])
            _, token = win32crypt.CryptUnprotectData(encrypted, None, None, None, 0)
            return token.decode('utf-8')
        except Exception as e:
            logger.warning(f'DPAPI decrypt failed: {e} — token cleared')
            return ''
    if stored.startswith('b64:'):
        return base64.b64decode(stored[4:]).decode('utf-8')
    if stored.startswith('plain:'):
        # Legacy prefix from earlier versions — treat same as b64:
        return base64.b64decode(stored[6:]).decode('utf-8')
    # Legacy: raw plaintext (pre-encryption versions)
    return stored


def _token_is_encrypted(stored: str) -> bool:
    return stored.startswith('dpapi:')


# ── Load / Save ───────────────────────────────────────────────────────────────

def load() -> tuple:
    """
    Load config from file, merging missing keys from DEFAULTS.
    Returns (config_dict, warning_message_or_None).
    """
    if not os.path.exists(CONFIG_FILE):
        return dict(DEFAULTS), None

    try:
        with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
            saved = json.load(f)
    except json.JSONDecodeError as e:
        warning = (
            f'Config file is corrupt and could not be loaded.\n'
            f'File: {CONFIG_FILE}\n'
            f'Error: {e}\n\n'
            f'Defaults have been loaded. Your previous settings were NOT lost — '
            f'the corrupt file is still on disk. Do not save until you have '
            f'inspected or restored it.'
        )
        return dict(DEFAULTS), warning
    except Exception as e:
        return dict(DEFAULTS), f'Could not read config file: {e}'

    cfg = {**DEFAULTS, **saved}

    # Decrypt token if stored encrypted
    if 'erp_token' in cfg:
        cfg['erp_token'] = _decrypt_token(cfg['erp_token'])

    # Warn if token is still plaintext (no pywin32 / non-Windows)
    raw_stored = saved.get('erp_token', '')
    if raw_stored and not _token_is_encrypted(raw_stored):
        warning = (
            'Security notice: The Bearer token is stored as plaintext in the config file.\n'
            'Install pywin32 (pip install pywin32) to enable encrypted storage.'
        )
        return cfg, warning

    return cfg, None


def save(cfg: dict) -> None:
    """Persist config to file, encrypting the token. Uses atomic write via temp file."""
    import tempfile
    to_save = dict(cfg)
    if to_save.get('erp_token'):
        to_save['erp_token'] = _encrypt_token(to_save['erp_token'])

    dir_ = os.path.dirname(CONFIG_FILE)
    fd, tmp_path = tempfile.mkstemp(dir=dir_, suffix='.tmp', prefix='aris_mwl_')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(to_save, f, indent=2)
        os.replace(tmp_path, CONFIG_FILE)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise
