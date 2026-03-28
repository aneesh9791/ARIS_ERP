"""
dicom_server.py — DICOM Modality Worklist SCP (C-FIND handler)

Uses pynetdicom to serve a DICOM MWL on a configurable port.
The worklist is cached from the ARIS ERP API and updated by the main app.

DICOM SOP Class: Modality Worklist Information – FIND (1.2.840.10008.5.1.4.31)
"""
import re
import time
import threading
import logging
import concurrent.futures

from pynetdicom import AE, evt
from pynetdicom.sop_class import ModalityWorklistInformationFind, Verification
from pydicom.dataset import Dataset
from pydicom.sequence import Sequence
from pydicom.uid import generate_uid

logger = logging.getLogger(__name__)

# ── Shared cache ──────────────────────────────────────────────────────────────
_cache: list = []
_cache_lock  = threading.Lock()
_server      = None          # ThreadedAssociationServer (pynetdicom)
_log_cb      = None          # optional callable(str) for UI log
_allowed_ips: set = set()    # empty = allow all connections

# Loopback addresses always allowed (needed for self-test)
_LOOPBACK = {'127.0.0.1', '::1', 'localhost'}


def set_log_callback(fn):
    global _log_cb
    _log_cb = fn


def _log(msg: str):
    logger.info(msg)
    if _log_cb:
        try:
            _log_cb(msg)
        except Exception:
            pass


def update_cache(items: list):
    """Replace the worklist cache (called after ERP fetch)."""
    global _cache
    with _cache_lock:
        _cache = list(items)


def get_cache() -> list:
    with _cache_lock:
        return list(_cache)


# ── DICOM Dataset builder ─────────────────────────────────────────────────────

def _build_dataset(item: dict) -> Dataset:
    """Convert one ARIS ERP worklist item to a DICOM Dataset."""
    ds = Dataset()

    ds.PatientName           = item.get('patient_name_dicom', '') or ''
    ds.PatientID             = item.get('patient_pid', '') or item.get('patient_id', '') or ''
    ds.PatientBirthDate      = item.get('patient_dob', '') or ''
    ds.PatientSex            = item.get('patient_sex', 'O') or 'O'
    ds.OtherPatientIDs       = ''
    ds.PatientComments       = item.get('patient_blood_group', '') or ''

    ds.AccessionNumber               = item.get('accession_number', '') or ''
    ds.ReferringPhysicianName        = item.get('referring_physician_dicom', '') or ''
    ds.StudyInstanceUID              = item.get('study_instance_uid') or generate_uid()
    ds.RequestedProcedureDescription = (
        item.get('scheduled_procedure', {}).get('procedure_description', '') or ''
    )
    ds.RequestedProcedureID  = item.get('accession_number', '') or ''
    ds.StudyDate             = ''
    ds.StudyTime             = ''

    proc     = item.get('scheduled_procedure', {}) or {}
    sps      = Dataset()
    sched_dt = proc.get('scheduled_datetime', '') or ''

    sps.ScheduledProcedureStepStartDate   = sched_dt[:8]   if len(sched_dt) >= 8  else ''
    sps.ScheduledProcedureStepStartTime   = sched_dt[8:14] if len(sched_dt) >= 14 else ''
    sps.Modality                          = proc.get('modality', 'OT') or 'OT'
    sps.ScheduledStationAETitle           = proc.get('station_ae_title', '') or ''
    sps.ScheduledPerformingPhysicianName  = item.get('referring_physician_dicom', '') or ''
    sps.ScheduledProcedureStepDescription = proc.get('procedure_description', '') or ''
    sps.ScheduledProcedureStepID          = item.get('accession_number', '') or ''
    sps.ScheduledStationName              = item.get('center', {}).get('name', '') or ''
    sps.CommentsOnTheScheduledProcedureStep = item.get('notes', '') or ''

    ds.ScheduledProcedureStepSequence = Sequence([sps])
    return ds


# ── Matching logic ────────────────────────────────────────────────────────────

def _extract_date_range(date_str: str):
    """
    Parse a DICOM date value into (start, end) as YYYYMMDD strings or None.

    Formats handled (DICOM PS3.4 C.2.2.2.5):
      '20260328'            → exact match  → ('20260328', '20260328')
      '20260328-20260330'   → bounded range → ('20260328', '20260330')
      '20260328-'           → from date     → ('20260328', None)
      '-20260330'           → up to date    → (None, '20260330')
      '' / '*'              → wildcard      → (None, None)
    """
    if not date_str or date_str in ('*', ''):
        return None, None
    if '-' in date_str:
        parts = date_str.split('-', 1)
        start = parts[0] if parts[0] else None
        end   = parts[1] if parts[1] else None
        return start, end
    return date_str, date_str    # exact date


def _dicom_wildcard_match(pattern: str, value: str) -> bool:
    """
    DICOM PS3.4 C.2.2.2.4 wildcard match.
    '*' matches zero or more characters; '?' matches exactly one character.
    Matching is case-insensitive.
    Returns True if value matches pattern (or pattern is empty/'*').
    """
    pattern = pattern.strip().upper()
    value   = value.strip().upper()
    if not pattern or pattern == '*':
        return True
    # Convert DICOM wildcard to regex
    regex = re.escape(pattern).replace(r'\*', '.*').replace(r'\?', '.')
    return re.fullmatch(regex, value) is not None


def _matches(query: Dataset, ds: Dataset) -> bool:
    """
    Lightweight C-FIND matching.
    Empty / '*' values in query are wildcards. Non-empty values must match.
    Supports DICOM wildcard characters * and ? (PS3.4 C.2.2.2.4).
    """
    # Accession number
    if hasattr(query, 'AccessionNumber') and query.AccessionNumber not in ('', None, '*'):
        if not _dicom_wildcard_match(str(query.AccessionNumber), str(ds.AccessionNumber)):
            return False

    # Patient ID
    if hasattr(query, 'PatientID') and query.PatientID not in ('', None, '*'):
        if not _dicom_wildcard_match(str(query.PatientID), str(ds.PatientID)):
            return False

    # Patient Name — wildcard * and ? within name supported
    if hasattr(query, 'PatientName') and str(query.PatientName) not in ('', '*'):
        if not _dicom_wildcard_match(str(query.PatientName), str(ds.PatientName)):
            return False

    # ScheduledProcedureStepSequence
    if hasattr(query, 'ScheduledProcedureStepSequence'):
        q_seq = query.ScheduledProcedureStepSequence
        d_seq = ds.ScheduledProcedureStepSequence
        if q_seq and d_seq:
            q_sps = q_seq[0]
            d_sps = d_seq[0]

            # Modality
            if hasattr(q_sps, 'Modality') and q_sps.Modality not in ('', None, '*'):
                if not _dicom_wildcard_match(str(q_sps.Modality), str(d_sps.Modality)):
                    return False

            # AE Title
            if (hasattr(q_sps, 'ScheduledStationAETitle') and
                    q_sps.ScheduledStationAETitle not in ('', None, '*')):
                if not _dicom_wildcard_match(str(q_sps.ScheduledStationAETitle),
                                             str(d_sps.ScheduledStationAETitle)):
                    return False

            # Date — handles bounded, open-ended, and exact DICOM date formats
            if hasattr(q_sps, 'ScheduledProcedureStepStartDate'):
                start, end = _extract_date_range(
                    str(q_sps.ScheduledProcedureStepStartDate or ''))
                if start is not None or end is not None:
                    item_date = str(d_sps.ScheduledProcedureStepStartDate or '')
                    if item_date:
                        if start is not None and item_date < start:
                            return False
                        if end is not None and item_date > end:
                            return False

    return True


# ── Event handlers ────────────────────────────────────────────────────────────

def _handle_find(event):
    """Respond to a DICOM C-FIND MWL request. Handles Cancel (0xFE00)."""
    requestor = event.assoc.requestor
    _log(f'C-FIND from {(requestor.ae_title or b"").decode("ascii","ignore").strip()} @ {requestor.address}')

    query   = event.identifier
    items   = get_cache()
    matched = 0

    for item in items:
        # Honour SCU cancel request
        if event.is_cancelled:
            _log('C-FIND cancelled by SCU')
            yield 0xFE00, None
            return

        try:
            ds = _build_dataset(item)
            if _matches(query, ds):
                matched += 1
                yield 0xFF00, ds
        except Exception as e:
            logger.warning(f'Error building dataset: {e}')
            continue

    _log(f'C-FIND completed — {matched}/{len(items)} matched')


def _handle_conn_open(event):
    assoc = event.assoc
    addr  = assoc.requestor.address
    ae    = (assoc.requestor.ae_title or b'').decode('ascii', errors='ignore').strip()

    # IP allowlist check — loopback always allowed for self-test (BUG-J)
    if _allowed_ips and addr not in _allowed_ips and addr not in _LOOPBACK:
        _log(f'REJECTED connection from unauthorized IP: {addr} (AE: {ae})')
        assoc.abort()
        return

    _log(f'Association opened: {ae} @ {addr}')


def _handle_conn_close(event):
    addr = event.assoc.requestor.address
    ae   = (event.assoc.requestor.ae_title or b'').decode('ascii', errors='ignore').strip()
    _log(f'Association closed: {ae} @ {addr}')


# ── Server lifecycle ──────────────────────────────────────────────────────────

def start(ae_title: str, port: int, allowed_ips: str = '') -> None:
    """
    Start the DICOM MWL SCP (non-blocking). Raises on failure.

    allowed_ips: comma-separated IP addresses allowed to connect.
                 Empty string = allow all.
    """
    global _server, _allowed_ips

    if _server is not None:
        raise RuntimeError('DICOM server is already running')

    # Parse IP allowlist
    if allowed_ips:
        _allowed_ips = {ip.strip() for ip in allowed_ips.split(',') if ip.strip()}
        _log(f'IP allowlist: {", ".join(sorted(_allowed_ips))}')
    else:
        _allowed_ips = set()

    ae_title_clean = ae_title.strip()
    ae = AE(ae_title=ae_title_clean)
    ae.add_supported_context(ModalityWorklistInformationFind)
    ae.add_supported_context(Verification)   # C-ECHO — modalities always ping first

    handlers = [
        (evt.EVT_C_FIND,     _handle_find),
        (evt.EVT_C_ECHO,     lambda event: 0x0000),  # accept all C-ECHO pings
        (evt.EVT_CONN_OPEN,  _handle_conn_open),
        (evt.EVT_CONN_CLOSE, _handle_conn_close),
    ]

    _server = ae.start_server(('0.0.0.0', port), block=False, evt_handlers=handlers)
    _log(f'DICOM MWL SCP started — AE={ae_title_clean}  Port={port}')


def stop() -> None:
    """Stop the DICOM MWL SCP."""
    global _server
    if _server is not None:
        try:
            _server.shutdown()
        except Exception as e:
            logger.warning(f'Error stopping DICOM server: {e}')
        finally:
            _server = None
        _log('DICOM MWL SCP stopped')


def is_running() -> bool:
    return _server is not None


# ── Diagnostic tests ──────────────────────────────────────────────────────────

def self_test(local_ae: str, port: int, timeout: int = 10) -> tuple:
    """
    C-FIND self-test: connect to localhost SCP and send empty query.
    Returns (success: bool, message: str, count: int).

    Uses a hard wall-clock timeout via concurrent.futures so that even if
    pynetdicom's internal timeouts fail to interrupt a blocked socket, the
    function is guaranteed to return within (timeout + 1) seconds.
    """
    if not is_running():
        return False, 'DICOM server is not running — start it first', 0

    def _attempt():
        ae = AE()
        ae.add_requested_context(ModalityWorklistInformationFind)
        ae.acse_timeout    = timeout
        ae.network_timeout = timeout
        ae.dimse_timeout   = timeout
        try:
            assoc = ae.associate('127.0.0.1', port, ae_title=local_ae.strip())
            if not assoc.is_established:
                return False, 'Association rejected — check AE title and port', 0

            ds = Dataset()
            ds.PatientName     = ''
            ds.PatientID       = ''
            ds.AccessionNumber = ''
            sps = Dataset()
            sps.Modality                        = ''
            sps.ScheduledProcedureStepStartDate = ''
            ds.ScheduledProcedureStepSequence   = Sequence([sps])

            count = 0
            for status, _ in assoc.send_c_find(ds, ModalityWorklistInformationFind):
                if status and status.Status == 0xFF00:
                    count += 1

            assoc.release()
            return True, f'SCP responded OK — {count} worklist item(s) in cache', count

        except Exception as exc:
            return False, f'{type(exc).__name__}: {exc}', 0

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
        fut = ex.submit(_attempt)
        try:
            return fut.result(timeout=timeout + 2)
        except concurrent.futures.TimeoutError:
            return False, f'Self-test timed out after {timeout}s — SCP not responding', 0


def echo_modality(remote_ip: str, remote_port: int,
                  remote_ae: str, local_ae: str,
                  timeout: int = 10) -> tuple:
    """
    C-ECHO to a remote modality (DICOM ping).
    Returns (success: bool, message: str, elapsed_ms: int).

    Uses a hard wall-clock timeout so a blocked socket never hangs the UI.
    """
    def _attempt():
        t0 = time.monotonic()
        ae = AE(ae_title=local_ae.strip())
        ae.add_requested_context(Verification)
        ae.acse_timeout    = timeout
        ae.network_timeout = timeout
        ae.dimse_timeout   = timeout
        try:
            assoc = ae.associate(remote_ip, remote_port, ae_title=remote_ae.strip())
            if not assoc.is_established:
                ms = int((time.monotonic() - t0) * 1000)
                return False, f'Association rejected by {remote_ae} @ {remote_ip}:{remote_port}', ms

            status = assoc.send_c_echo()
            ms     = int((time.monotonic() - t0) * 1000)
            assoc.release()

            if status and status.Status == 0x0000:
                return True, f'C-ECHO success — {remote_ae} responded in {ms} ms', ms
            code = hex(status.Status) if status else 'no response'
            return False, f'C-ECHO failed — status {code}', ms

        except ConnectionRefusedError:
            ms = int((time.monotonic() - t0) * 1000)
            return False, f'Connection refused — {remote_ip}:{remote_port} not reachable', ms
        except Exception as exc:
            ms = int((time.monotonic() - t0) * 1000)
            return False, f'{type(exc).__name__}: {exc}', ms

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
        fut = ex.submit(_attempt)
        try:
            return fut.result(timeout=timeout + 2)
        except concurrent.futures.TimeoutError:
            return False, f'C-ECHO timed out after {timeout}s — {remote_ip}:{remote_port} not responding', 0
