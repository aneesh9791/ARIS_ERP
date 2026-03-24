-- 096: Add missing CT, MRI, X-Ray and Ultrasound studies for Kerala diagnostic centres
-- All added to center_id = 1 (master centre) with Kerala market rates (INR)
-- SAC codes: 999721 = CT, 999722 = MRI, 999729 = X-Ray / Ultrasound
-- ON CONFLICT DO NOTHING — safe to re-run

-- ══════════════════════════════════════════════════════════════════════════════
-- CT STUDIES
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO study_master
  (study_code, study_name, modality, study_type, center_id,
   base_rate, insurance_rate, self_pay_rate,
   gst_rate, gst_applicable, is_taxable, sac_code, active)
VALUES
  -- ── Neck ──────────────────────────────────────────────────────────────────
  ('CT_NECK_P',       'CT Neck - Plain',                     'CT','Plain',    1,  700,  700,  650, 0.18,true,true,'999721',true),
  ('CT_NECK_C',       'CT Neck - Contrast',                  'CT','Contrast', 1,  900,  900,  850, 0.18,true,true,'999721',true),

  -- ── Paranasal Sinuses (very common - sinusitis, pre-FESS) ─────────────────
  ('CT_PNS',          'CT Paranasal Sinuses - Plain',        'CT','Plain',    1,  500,  500,  480, 0.18,true,true,'999721',true),

  -- ── Temporal Bone / Mastoid (CSOM, cholesteatoma - ENT referrals) ─────────
  ('CT_TEMPORAL',     'CT Temporal Bone - Plain',            'CT','Plain',    1,  650,  650,  620, 0.18,true,true,'999721',true),

  -- ── Orbit ─────────────────────────────────────────────────────────────────
  ('CT_ORBIT_P',      'CT Orbit - Plain',                    'CT','Plain',    1,  650,  650,  620, 0.18,true,true,'999721',true),
  ('CT_ORBIT_C',      'CT Orbit - Contrast',                 'CT','Contrast', 1,  850,  850,  820, 0.18,true,true,'999721',true),

  -- ── Chest with Contrast (mediastinal masses, staging) ─────────────────────
  ('CT_CHEST_C',      'CT Chest - Contrast',                 'CT','Contrast', 1, 1200, 1200, 1100, 0.18,true,true,'999721',true),

  -- ── Abdomen only (free gas, appendix, liver plain) ────────────────────────
  ('CT_ABDOMEN_P',    'CT Abdomen - Plain',                  'CT','Plain',    1,  700,  700,  650, 0.18,true,true,'999721',true),
  ('CT_ABDOMEN_C',    'CT Abdomen - Contrast',               'CT','Contrast', 1,  900,  900,  850, 0.18,true,true,'999721',true),

  -- ── Pelvis only ───────────────────────────────────────────────────────────
  ('CT_PELVIS_P',     'CT Pelvis - Plain',                   'CT','Plain',    1,  700,  700,  650, 0.18,true,true,'999721',true),
  ('CT_PELVIS_C',     'CT Pelvis - Contrast',                'CT','Contrast', 1,  900,  900,  850, 0.18,true,true,'999721',true),

  -- ── Chest + Abdomen + Pelvis (oncology staging - CAP scan) ───────────────
  ('CT_CAP_C',        'CT Chest Abdomen Pelvis - Contrast',  'CT','Contrast', 1, 2800, 2800, 2600, 0.18,true,true,'999721',true),

  -- ── CT Angiography (vascular - aneurysm, AVM, stroke workup) ─────────────
  ('CT_CTA_BRAIN',    'CT Angiography Brain - Contrast',     'CT','Contrast', 1, 3500, 3500, 3000, 0.18,true,true,'999721',true),
  ('CT_CTA_NECK',     'CT Angiography Neck - Contrast',      'CT','Contrast', 1, 3000, 3000, 2800, 0.18,true,true,'999721',true),
  ('CT_CTA_AORTA',    'CT Aortic Angiography - Contrast',    'CT','Contrast', 1, 4000, 4000, 3500, 0.18,true,true,'999721',true),

  -- ── CT Pulmonary Angiography (CTPA — PE, common in medical wards) ─────────
  ('CT_CTPA',         'CT Pulmonary Angiography - Contrast', 'CT','Contrast', 1, 2500, 2500, 2200, 0.18,true,true,'999721',true),

  -- ── Spine ─────────────────────────────────────────────────────────────────
  ('CT_CSPINE_P',     'CT Cervical Spine - Plain',           'CT','Plain',    1,  700,  700,  650, 0.18,true,true,'999721',true),
  ('CT_TSPINE_P',     'CT Thoracic Spine - Plain',           'CT','Plain',    1,  700,  700,  650, 0.18,true,true,'999721',true),

  -- ── Facial Bones (maxillofacial trauma — common road accidents Kerala) ─────
  ('CT_FACIAL',       'CT Facial Bones - Plain',             'CT','Plain',    1,  600,  600,  570, 0.18,true,true,'999721',true),

  -- ── Nasopharynx / Larynx ──────────────────────────────────────────────────
  ('CT_NASOPHARYNX_C','CT Nasopharynx - Contrast',           'CT','Contrast', 1,  900,  900,  850, 0.18,true,true,'999721',true),
  ('CT_LARYNX_C',     'CT Larynx - Contrast',                'CT','Contrast', 1,  900,  900,  850, 0.18,true,true,'999721',true),

  -- ── Joints ────────────────────────────────────────────────────────────────
  ('CT_KNEE_P',       'CT Knee - Plain',                     'CT','Plain',    1,  700,  700,  650, 0.18,true,true,'999721',true),
  ('CT_HIP_P',        'CT Hip Joint - Plain',                'CT','Plain',    1,  750,  750,  700, 0.18,true,true,'999721',true),

  -- ── CT Urography (hematuria, ureteral calculi) ────────────────────────────
  ('CT_CTU',          'CT Urography - Contrast',             'CT','Contrast', 1, 1800, 1800, 1600, 0.18,true,true,'999721',true),

  -- ── Liver Triple Phase (HCC — common in Kerala due to hepatitis B/alcohol) ─
  ('CT_LIVER_3P',     'CT Liver Triple Phase - Contrast',    'CT','Contrast', 1, 2000, 2000, 1800, 0.18,true,true,'999721',true),

  -- ── CT Brain with Perfusion (stroke protocol) ─────────────────────────────
  ('CT_BRAIN_PERF',   'CT Brain Perfusion - Plain',          'CT','Plain',    1, 3000, 3000, 2800, 0.18,true,true,'999721',true),

  -- ── Whole Body (trauma polytrauma — Kerala has high RTA rate) ─────────────
  ('CT_WHOLE_BODY',   'CT Whole Body - Contrast',            'CT','Contrast', 1, 5000, 5000, 4500, 0.18,true,true,'999721',true)

ON CONFLICT (study_code) DO NOTHING;


-- ══════════════════════════════════════════════════════════════════════════════
-- MRI STUDIES
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO study_master
  (study_code, study_name, modality, study_type, center_id,
   base_rate, insurance_rate, self_pay_rate,
   gst_rate, gst_applicable, is_taxable, sac_code, active)
VALUES
  -- ── Spine (Thoracic/Dorsal — commonly missed, back pain very prevalent) ───
  ('MRI_TSPINE_P',    'MRI Thoracic Spine - Plain',           'MRI','Plain',    1,  950,  950,  900, 0.18,true,true,'999722',true),
  ('MRI_TSPINE_C',    'MRI Thoracic Spine - Contrast',        'MRI','Contrast', 1, 1200, 1200, 1100, 0.18,true,true,'999722',true),

  -- ── Whole Spine ───────────────────────────────────────────────────────────
  ('MRI_WHOLE_SPINE', 'MRI Whole Spine - Plain',              'MRI','Plain',    1, 2500, 2500, 2200, 0.18,true,true,'999722',true),

  -- ── Spine Contrast (post-op, infection, mets) ─────────────────────────────
  ('MRI_CSPINE_C',    'MRI Cervical Spine - Contrast',        'MRI','Contrast', 1, 1200, 1200, 1100, 0.18,true,true,'999722',true),
  ('MRI_LSPINE_C',    'MRI Lumbar Spine - Contrast',          'MRI','Contrast', 1, 1200, 1200, 1100, 0.18,true,true,'999722',true),

  -- ── Pelvis (gynaecological, rectal staging) ───────────────────────────────
  ('MRI_PELVIS_P',    'MRI Pelvis - Plain',                   'MRI','Plain',    1, 1100, 1100, 1000, 0.18,true,true,'999722',true),
  ('MRI_PELVIS_C',    'MRI Pelvis - Contrast',                'MRI','Contrast', 1, 1400, 1400, 1300, 0.18,true,true,'999722',true),

  -- ── Hip (AVN of femoral head — very common in Kerala) ────────────────────
  ('MRI_HIP_P',       'MRI Hip Joint - Plain',                'MRI','Plain',    1,  900,  900,  850, 0.18,true,true,'999722',true),
  ('MRI_HIP_C',       'MRI Hip Joint - Contrast',             'MRI','Contrast', 1, 1200, 1200, 1100, 0.18,true,true,'999722',true),

  -- ── Ankle ─────────────────────────────────────────────────────────────────
  ('MRI_ANKLE_P',     'MRI Ankle - Plain',                    'MRI','Plain',    1,  850,  850,  800, 0.18,true,true,'999722',true),
  ('MRI_ANKLE_C',     'MRI Ankle - Contrast',                 'MRI','Contrast', 1, 1100, 1100, 1000, 0.18,true,true,'999722',true),

  -- ── Wrist (carpal tunnel, TFCC) ───────────────────────────────────────────
  ('MRI_WRIST_P',     'MRI Wrist - Plain',                    'MRI','Plain',    1,  850,  850,  800, 0.18,true,true,'999722',true),
  ('MRI_WRIST_C',     'MRI Wrist - Contrast',                 'MRI','Contrast', 1, 1100, 1100, 1000, 0.18,true,true,'999722',true),

  -- ── Elbow ─────────────────────────────────────────────────────────────────
  ('MRI_ELBOW_P',     'MRI Elbow - Plain',                    'MRI','Plain',    1,  850,  850,  800, 0.18,true,true,'999722',true),

  -- ── Foot ──────────────────────────────────────────────────────────────────
  ('MRI_FOOT_P',      'MRI Foot - Plain',                     'MRI','Plain',    1,  850,  850,  800, 0.18,true,true,'999722',true),

  -- ── Neck (thyroid, lymph nodes, carotid — very common in Kerala) ─────────
  ('MRI_NECK_P',      'MRI Neck - Plain',                     'MRI','Plain',    1,  950,  950,  900, 0.18,true,true,'999722',true),
  ('MRI_NECK_C',      'MRI Neck - Contrast',                  'MRI','Contrast', 1, 1200, 1200, 1100, 0.18,true,true,'999722',true),

  -- ── Orbit ─────────────────────────────────────────────────────────────────
  ('MRI_ORBIT_P',     'MRI Orbit - Plain',                    'MRI','Plain',    1,  950,  950,  900, 0.18,true,true,'999722',true),
  ('MRI_ORBIT_C',     'MRI Orbit - Contrast',                 'MRI','Contrast', 1, 1200, 1200, 1100, 0.18,true,true,'999722',true),

  -- ── MRCP (biliary / pancreatic — common workup in Kerala) ────────────────
  ('MRI_MRCP',        'MRI MRCP - Plain',                     'MRI','Plain',    1, 1500, 1500, 1400, 0.18,true,true,'999722',true),

  -- ── MR Angiography Brain (CoW — aneurysm, AVM) ───────────────────────────
  ('MRI_MRA_BRAIN',   'MRI MR Angiography Brain - Plain',     'MRI','Plain',    1, 2000, 2000, 1800, 0.18,true,true,'999722',true),

  -- ── MR Angiography Neck (carotid stenosis) ────────────────────────────────
  ('MRI_MRA_NECK',    'MRI MR Angiography Neck - Plain',      'MRI','Plain',    1, 2000, 2000, 1800, 0.18,true,true,'999722',true),

  -- ── Breast (screening / staging — high breast cancer prevalence Kerala) ───
  ('MRI_BREAST_P',    'MRI Breast - Plain',                   'MRI','Plain',    1, 1500, 1500, 1400, 0.18,true,true,'999722',true),
  ('MRI_BREAST_C',    'MRI Breast - Contrast',                'MRI','Contrast', 1, 2000, 2000, 1800, 0.18,true,true,'999722',true),

  -- ── Liver (HCC, cirrhosis — hepatitis B prevalent Kerala) ────────────────
  ('MRI_LIVER_P',     'MRI Liver - Plain',                    'MRI','Plain',    1, 1200, 1200, 1100, 0.18,true,true,'999722',true),
  ('MRI_LIVER_C',     'MRI Liver - Contrast',                 'MRI','Contrast', 1, 1600, 1600, 1500, 0.18,true,true,'999722',true),

  -- ── Prostate (mpMRI — prostate cancer increasing in Kerala) ──────────────
  ('MRI_PROSTATE_P',  'MRI Prostate - Plain',                 'MRI','Plain',    1, 2000, 2000, 1800, 0.18,true,true,'999722',true),
  ('MRI_PROSTATE_C',  'MRI Prostate - Contrast',              'MRI','Contrast', 1, 2500, 2500, 2200, 0.18,true,true,'999722',true),

  -- ── Fetal MRI (congenital anomalies — strong maternal care focus Kerala) ──
  ('MRI_FETAL',       'MRI Fetal - Plain',                    'MRI','Plain',    1, 2500, 2500, 2200, 0.18,true,true,'999722',true),

  -- ── Cardiac ───────────────────────────────────────────────────────────────
  ('MRI_CARDIAC_P',   'MRI Cardiac - Plain',                  'MRI','Plain',    1, 3000, 3000, 2800, 0.18,true,true,'999722',true),
  ('MRI_CARDIAC_C',   'MRI Cardiac - Contrast',               'MRI','Contrast', 1, 3500, 3500, 3200, 0.18,true,true,'999722',true),

  -- ── Pituitary (hormonal disorders — common) ───────────────────────────────
  ('MRI_PITUITARY_P', 'MRI Pituitary - Plain',                'MRI','Plain',    1, 1000, 1000,  950, 0.18,true,true,'999722',true),
  ('MRI_PITUITARY_C', 'MRI Pituitary - Contrast',             'MRI','Contrast', 1, 1300, 1300, 1200, 0.18,true,true,'999722',true),

  -- ── Internal Auditory Canal (acoustic neuroma, sensorineural hearing loss)
  ('MRI_IAC_P',       'MRI Internal Auditory Canal - Plain',  'MRI','Plain',    1, 1000, 1000,  950, 0.18,true,true,'999722',true),
  ('MRI_IAC_C',       'MRI Internal Auditory Canal - Contrast','MRI','Contrast',1, 1300, 1300, 1200, 0.18,true,true,'999722',true),

  -- ── Brachial Plexus (birth injuries, trauma — common in tertiary centres) ─
  ('MRI_BRACHIAL_P',  'MRI Brachial Plexus - Plain',          'MRI','Plain',    1, 1500, 1500, 1400, 0.18,true,true,'999722',true),
  ('MRI_BRACHIAL_C',  'MRI Brachial Plexus - Contrast',       'MRI','Contrast', 1, 1800, 1800, 1600, 0.18,true,true,'999722',true),

  -- ── Sacroiliac Joints (ankylosing spondylitis, sacroiliitis) ─────────────
  ('MRI_SI_JOINTS',   'MRI Sacroiliac Joints - Plain',        'MRI','Plain',    1, 1000, 1000,  950, 0.18,true,true,'999722',true),

  -- ── Rectum (rectal cancer staging) ───────────────────────────────────────
  ('MRI_RECTUM_P',    'MRI Rectum - Plain',                   'MRI','Plain',    1, 1200, 1200, 1100, 0.18,true,true,'999722',true),
  ('MRI_RECTUM_C',    'MRI Rectum - Contrast',                'MRI','Contrast', 1, 1500, 1500, 1400, 0.18,true,true,'999722',true),

  -- ── Scrotum ───────────────────────────────────────────────────────────────
  ('MRI_SCROTUM',     'MRI Scrotum - Plain',                  'MRI','Plain',    1, 1000, 1000,  950, 0.18,true,true,'999722',true),

  -- ── Temporomandibular Joint (TMJ dysfunction — common referral) ───────────
  ('MRI_TMJ',         'MRI Temporomandibular Joint - Plain',  'MRI','Plain',    1, 1000, 1000,  950, 0.18,true,true,'999722',true),

  -- ── Brain Spectroscopy (MRS — brain tumour characterisation) ─────────────
  ('MRI_BRAIN_MRS',   'MRI Brain with Spectroscopy - Plain',  'MRI','Plain',    1, 2500, 2500, 2200, 0.18,true,true,'999722',true),

  -- ── Brain Perfusion (DWI/PWI stroke — acute stroke protocol) ─────────────
  ('MRI_BRAIN_DWI',   'MRI Brain Diffusion (DWI) - Plain',    'MRI','Plain',    1, 1500, 1500, 1400, 0.18,true,true,'999722',true),

  -- ── Abdomen & Pelvis Contrast (all centers need this) ────────────────────
  ('MRI_ABDOPELVIS_P','MRI Abdomen & Pelvis - Plain',         'MRI','Plain',    1, 1200, 1200, 1100, 0.18,true,true,'999722',true)

ON CONFLICT (study_code) DO NOTHING;


-- ══════════════════════════════════════════════════════════════════════════════
-- X-RAY — Missing views commonly requested in Kerala
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO study_master
  (study_code, study_name, modality, study_type, center_id,
   base_rate, insurance_rate, self_pay_rate,
   gst_rate, gst_applicable, is_taxable, sac_code, active)
VALUES
  ('XRAY_CSPINE',  'X-Ray Cervical Spine - Plain',           'XRAY','Plain',1, 160,160,150, 0.18,true,true,'999729',true),
  ('XRAY_TSPINE',  'X-Ray Thoracic Spine - Plain',           'XRAY','Plain',1, 160,160,150, 0.18,true,true,'999729',true),
  ('XRAY_ANKLE',   'X-Ray Ankle - Plain',                    'XRAY','Plain',1, 130,130,120, 0.18,true,true,'999729',true),
  ('XRAY_WRIST',   'X-Ray Wrist - Plain',                    'XRAY','Plain',1, 130,130,120, 0.18,true,true,'999729',true),
  ('XRAY_FOOT',    'X-Ray Foot - Plain',                     'XRAY','Plain',1, 130,130,120, 0.18,true,true,'999729',true),
  ('XRAY_HIP',     'X-Ray Hip Joint - Plain',                'XRAY','Plain',1, 140,140,130, 0.18,true,true,'999729',true),
  ('XRAY_ELBOW',   'X-Ray Elbow - Plain',                    'XRAY','Plain',1, 120,120,110, 0.18,true,true,'999729',true),
  ('XRAY_FOREARM', 'X-Ray Forearm - Plain',                  'XRAY','Plain',1, 120,120,110, 0.18,true,true,'999729',true),
  ('XRAY_LEG',     'X-Ray Leg (Tibia-Fibula) - Plain',       'XRAY','Plain',1, 120,120,110, 0.18,true,true,'999729',true),
  ('XRAY_PNS',     'X-Ray Paranasal Sinuses - Plain',        'XRAY','Plain',1, 150,150,140, 0.18,true,true,'999729',true),
  ('XRAY_CLAVICLE','X-Ray Clavicle - Plain',                 'XRAY','Plain',1, 120,120,110, 0.18,true,true,'999729',true),
  ('XRAY_RIBS',    'X-Ray Ribs - Plain',                     'XRAY','Plain',1, 130,130,120, 0.18,true,true,'999729',true),
  ('XRAY_HUMERUS', 'X-Ray Humerus - Plain',                  'XRAY','Plain',1, 120,120,110, 0.18,true,true,'999729',true),
  ('XRAY_KUB',     'X-Ray KUB - Plain',                      'XRAY','Plain',1, 130,130,120, 0.18,true,true,'999729',true)

ON CONFLICT (study_code) DO NOTHING;


-- ══════════════════════════════════════════════════════════════════════════════
-- ULTRASOUND — Missing studies common in Kerala
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO study_master
  (study_code, study_name, modality, study_type, center_id,
   base_rate, insurance_rate, self_pay_rate,
   gst_rate, gst_applicable, is_taxable, sac_code, active)
VALUES
  ('US_NECK',          'Ultrasound Neck - Plain',             'ULTRASOUND','Plain',1, 300,300,280, 0.18,true,true,'999729',true),
  ('US_SCROTUM',       'Ultrasound Scrotum - Plain',          'ULTRASOUND','Plain',1, 300,300,280, 0.18,true,true,'999729',true),
  ('US_WHOLE_ABD',     'Ultrasound Whole Abdomen - Plain',    'ULTRASOUND','Plain',1, 350,350,320, 0.18,true,true,'999729',true),
  ('US_SHOULDER',      'Ultrasound Shoulder - Plain',         'ULTRASOUND','Plain',1, 350,350,320, 0.18,true,true,'999729',true),
  ('US_DOPPLER_LL',    'Doppler Lower Limb Venous - Plain',   'ULTRASOUND','Plain',1, 500,500,480, 0.18,true,true,'999729',true),
  ('US_DOPPLER_CAROTID','Doppler Carotid - Plain',            'ULTRASOUND','Plain',1, 600,600,580, 0.18,true,true,'999729',true),
  ('US_DOPPLER_RENAL', 'Doppler Renal - Plain',               'ULTRASOUND','Plain',1, 500,500,480, 0.18,true,true,'999729',true),
  ('US_DOPPLER_PORTAL','Doppler Portal Venous - Plain',       'ULTRASOUND','Plain',1, 500,500,480, 0.18,true,true,'999729',true),
  ('US_BREAST',        'Ultrasound Breast - Plain',           'ULTRASOUND','Plain',1, 300,300,280, 0.18,true,true,'999729',true)

ON CONFLICT (study_code) DO NOTHING;
