"""
test_modality.py — DICOM MWL Modality Simulator
Simulates a CT/MRI/X-Ray querying the ARIS MWL Server via C-FIND.
Use this to test the worklist server without a real scanner.

Usage (run in Command Prompt):
  python test_modality.py
  python test_modality.py 192.168.1.10 11112 ARIS_MWL
  python test_modality.py [host] [port] [called_ae] [calling_ae]

Defaults:
  host       = 127.0.0.1   (localhost)
  port       = 11112
  called_ae  = ARIS_MWL
  calling_ae = TEST_SCU
"""
import sys

try:
    from pynetdicom import AE
    from pynetdicom.sop_class import ModalityWorklistInformationFind, Verification
    from pydicom.dataset import Dataset
    from pydicom.sequence import Sequence
except ImportError:
    print('ERROR: pynetdicom / pydicom not installed.')
    print('Run:  pip install pynetdicom pydicom')
    input('\nPress Enter to exit...')
    sys.exit(1)

# ── Arguments ────────────────────────────────────────────────────────────────
host       = sys.argv[1] if len(sys.argv) > 1 else '127.0.0.1'
port       = int(sys.argv[2]) if len(sys.argv) > 2 else 11112
called_ae  = sys.argv[3] if len(sys.argv) > 3 else 'ARIS_MWL'
calling_ae = sys.argv[4] if len(sys.argv) > 4 else 'TEST_SCU'

print('=' * 60)
print('  ARIS MWL — Modality Simulator Test')
print('=' * 60)
print(f'  Server   : {host}:{port}')
print(f'  Called AE: {called_ae}')
print(f'  My AE    : {calling_ae}')
print('=' * 60)

# ── Step 1: C-ECHO (ping) ────────────────────────────────────────────────────
print('\n[1/2] C-ECHO (DICOM Ping)...')
ae_echo = AE(ae_title=calling_ae)
ae_echo.add_requested_context(Verification)
ae_echo.acse_timeout = ae_echo.network_timeout = ae_echo.dimse_timeout = 10

assoc = ae_echo.associate(host, port, ae_title=called_ae)
if assoc.is_established:
    status = assoc.send_c_echo()
    assoc.release()
    if status and status.Status == 0x0000:
        print('  ✓  C-ECHO success — server is reachable')
    else:
        print('  ✗  C-ECHO failed')
else:
    print(f'  ✗  Cannot connect to {host}:{port}')
    print('     Check: server is running, IP/port/AE title are correct')
    input('\nPress Enter to exit...')
    sys.exit(1)

# ── Step 2: C-FIND (worklist query) ──────────────────────────────────────────
print('\n[2/2] C-FIND (Worklist Query)...')
ae_find = AE(ae_title=calling_ae)
ae_find.add_requested_context(ModalityWorklistInformationFind)
ae_find.acse_timeout = ae_find.network_timeout = ae_find.dimse_timeout = 10

assoc = ae_find.associate(host, port, ae_title=called_ae)
if not assoc.is_established:
    print('  ✗  Association rejected for C-FIND')
    input('\nPress Enter to exit...')
    sys.exit(1)

# Build wildcard query — same as a real scanner would send
ds = Dataset()
ds.PatientName                = ''
ds.PatientID                  = ''
ds.PatientBirthDate           = ''
ds.PatientSex                 = ''
ds.AccessionNumber            = ''
ds.ReferringPhysicianName     = ''
ds.StudyInstanceUID           = ''
ds.RequestedProcedureDescription = ''
ds.RequestedProcedureID       = ''

sps = Dataset()
sps.Modality                              = ''
sps.ScheduledProcedureStepStartDate       = ''
sps.ScheduledProcedureStepStartTime       = ''
sps.ScheduledStationAETitle               = ''
sps.ScheduledProcedureStepDescription     = ''
sps.ScheduledProcedureStepID              = ''
sps.ScheduledStationName                  = ''
ds.ScheduledProcedureStepSequence = Sequence([sps])

print()
print(f'  {"#":<4} {"Patient Name":<25} {"PID":<12} {"Accession":<14} {"Modality":<10} {"Date"}')
print(f'  {"-"*4} {"-"*25} {"-"*12} {"-"*14} {"-"*10} {"-"*10}')

count = 0
for status, identifier in assoc.send_c_find(ds, ModalityWorklistInformationFind):
    if status and status.Status == 0xFF00 and identifier:
        count += 1
        name = str(getattr(identifier, 'PatientName',  '—') or '—')
        pid  = str(getattr(identifier, 'PatientID',    '—') or '—')
        acc  = str(getattr(identifier, 'AccessionNumber', '—') or '—')
        mod  = '—'
        date = '—'
        try:
            sps_r = identifier.ScheduledProcedureStepSequence[0]
            mod   = str(getattr(sps_r, 'Modality', '—') or '—')
            date  = str(getattr(sps_r, 'ScheduledProcedureStepStartDate', '—') or '—')
        except Exception:
            pass
        print(f'  {count:<4} {name:<25} {pid:<12} {acc:<14} {mod:<10} {date}')

assoc.release()

print()
print('=' * 60)
if count == 0:
    print('  ✓  Server responded — 0 worklist items')
    print('     (Try clicking Refresh Now in the app first)')
else:
    print(f'  ✓  {count} worklist item(s) returned — modality simulation OK')
print('=' * 60)

input('\nPress Enter to exit...')
