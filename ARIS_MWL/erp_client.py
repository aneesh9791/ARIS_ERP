"""
erp_client.py — ARIS ERP MWL API client
"""
import requests
from urllib.parse import urlparse


def _check_https(url: str) -> None:
    """Raise ValueError if the URL does not use HTTPS."""
    scheme = urlparse(url).scheme.lower()
    if scheme != 'https':
        raise ValueError(
            f'ERP URL must use HTTPS (got "{scheme}://").\n'
            'The Bearer token and patient data would travel unencrypted over HTTP.\n'
            'Please change the URL to start with https://'
        )


def fetch_worklist(cfg: dict) -> list:
    """
    Call GET /api/mwl/worklist on the ARIS ERP.
    Returns list of DICOM-ready worklist items.
    Raises ValueError if URL is not HTTPS or required config keys are missing.
    Raises requests.HTTPError or requests.ConnectionError on failure.
    """
    missing = [k for k in ('erp_url', 'erp_token', 'erp_center_id') if not cfg.get(k)]
    if missing:
        raise ValueError(f'Missing config: {", ".join(missing)}')
    _check_https(cfg['erp_url'])

    url = cfg['erp_url'].rstrip('/') + '/api/mwl/worklist'
    headers = {
        'Authorization': f'Bearer {cfg["erp_token"]}',
        'X-Center-ID':   str(cfg['erp_center_id']),
        'Accept':        'application/json',
    }
    params = {
        'days_ahead': cfg.get('days_ahead', 1),
    }
    if cfg.get('include_completed'):
        params['include_completed'] = 'true'

    verify = cfg.get('ssl_verify', True)
    resp = requests.get(url, headers=headers, params=params, timeout=15, verify=verify)
    resp.raise_for_status()
    data = resp.json()
    return data.get('worklist', [])


def test_connection(cfg: dict) -> tuple:
    """
    Quick health-check against /api/mwl/health, then verifies token.
    Returns (success: bool, message: str).
    """
    if not cfg.get('erp_url'):
        return False, 'ERP URL not configured'
    if not cfg.get('erp_token'):
        return False, 'Bearer token not configured'
    if not cfg.get('erp_center_id'):
        return False, 'Center ID not configured'

    # HTTPS check
    try:
        _check_https(cfg['erp_url'])
    except ValueError as e:
        return False, str(e).split('\n')[0]   # first line only for status label

    verify = cfg.get('ssl_verify', True)
    try:
        url = cfg['erp_url'].rstrip('/') + '/api/mwl/health'
        resp = requests.get(url, timeout=10, verify=verify)
        if resp.status_code == 200:
            url2 = cfg['erp_url'].rstrip('/') + '/api/mwl/worklist'
            headers = {
                'Authorization': f'Bearer {cfg["erp_token"]}',
                'X-Center-ID':   str(cfg['erp_center_id']),
            }
            r2 = requests.get(url2, headers=headers,
                              params={'days_ahead': 0}, timeout=10, verify=verify)
            if r2.status_code == 200:
                data   = r2.json()
                center = data.get('center', {})
                return True, f'OK — {center.get("name", "Connected")}'
            elif r2.status_code == 401:
                return False, 'Invalid token or Center ID'
            else:
                return False, f'Token check: HTTP {r2.status_code}'
        else:
            return False, f'Health check: HTTP {resp.status_code}'
    except requests.ConnectionError:
        return False, 'Cannot connect to ERP'
    except requests.Timeout:
        return False, 'Connection timed out'
    except Exception as e:
        return False, str(e)
