import { useState } from 'react';

/* ── Keyframes ─────────────────────────────────────────────────────────────── */
const SCAN_STYLE = `
  @keyframes scanSweep {
    0%   { opacity: 0;   transform: translateY(0px); }
    8%   { opacity: 0.7; }
    92%  { opacity: 0.7; }
    100% { opacity: 0;   transform: translateY(210px); }
  }
  @keyframes pulseDot {
    0%, 100% { opacity: 0.4; transform: scale(1); }
    50%       { opacity: 1;   transform: scale(1.3); }
  }
  @keyframes breatheRing {
    0%, 100% { opacity: 0.22; }
    50%       { opacity: 0.42; }
  }
  @keyframes shimmer {
    0%   { stroke-dashoffset: 0; }
    100% { stroke-dashoffset: -48; }
  }
  .scan-sweep   { animation: scanSweep  3.8s ease-in-out infinite; }
  .pulse-dot    { animation: pulseDot   2s   ease-in-out infinite; }
  .breathe-ring { animation: breatheRing 4s  ease-in-out infinite; }
  .shimmer-dash { animation: shimmer    3s   linear      infinite; }
`;

const Login = () => {
  const [formData, setFormData]         = useState({ email: '', password: '' });
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const logoConfig = (() => {
    try { return JSON.parse(localStorage.getItem('logoConfig')) || {}; } catch { return {}; }
  })();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res  = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user',  JSON.stringify(data.user));
        window.location.href = '/dashboard';
      } else {
        setError(data.error || data.message || 'Invalid credentials.');
      }
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{SCAN_STYLE}</style>

      {/* ── Root shell — rich deep-teal, no seams ──────────────────────────── */}
      <div className="relative min-h-screen overflow-hidden" style={{
        background: 'linear-gradient(140deg, #1a4d46 0%, #0f3530 28%, #0a2420 60%, #071a18 100%)',
      }}>

        {/* ══════════════════════════════════════════════════════════════════════
            FULL-VIEWPORT SVG BACKDROP
        ══════════════════════════════════════════════════════════════════════ */}
        <div className="absolute inset-0 pointer-events-none">
          <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice"
            style={{ width: '100%', height: '100%' }}>
            <defs>
              {/* Gradients */}
              <radialGradient id="gBrain" cx="50%" cy="50%" r="50%">
                <stop offset="0%"   stopColor="#2dd4bf" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="gMRI" cx="50%" cy="50%" r="50%">
                <stop offset="0%"   stopColor="#0d9488" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#0d9488" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="gCT" cx="50%" cy="50%" r="50%">
                <stop offset="0%"   stopColor="#3A9A8D" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#3A9A8D" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="gAmber" cx="50%" cy="50%" r="50%">
                <stop offset="0%"   stopColor="#D4841A" stopOpacity="0.14" />
                <stop offset="100%" stopColor="#D4841A" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="gCenter" cx="50%" cy="50%" r="50%">
                <stop offset="0%"   stopColor="#1a5c54" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#1a5c54" stopOpacity="0" />
              </radialGradient>

              {/* Soft glow filter */}
              <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="glowStrong" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>

              {/* Clip paths */}
              <clipPath id="clipBrain">
                <ellipse cx="246" cy="296" rx="116" ry="106" />
              </clipPath>
              <clipPath id="clipCT">
                <circle cx="1228" cy="208" r="78" />
              </clipPath>
            </defs>

            {/* ── Atmospheric glow blobs ──────────────────────────────────── */}
            <circle cx="280"  cy="380" r="360" fill="url(#gBrain)"  />
            <circle cx="730"  cy="660" r="300" fill="url(#gMRI)"    />
            <circle cx="1228" cy="210" r="220" fill="url(#gCT)"     />
            <circle cx="1060" cy="800" r="200" fill="url(#gAmber)"  />
            {/* Subtle brightening behind the login card area */}
            <circle cx="1100" cy="450" r="260" fill="url(#gCenter)" />

            {/* ── Global DICOM scan-line texture ──────────────────────────── */}
            {Array.from({ length: 46 }).map((_, i) => (
              <line key={i} x1="0" y1={i * 20} x2="1440" y2={i * 20}
                stroke="#2dd4bf" strokeWidth="0.4" opacity="0.045" />
            ))}

            {/* ── Vertical grid — right half only ────────────────────────── */}
            {Array.from({ length: 10 }).map((_, i) => (
              <line key={`vg${i}`} x1={820 + i * 68} y1="0" x2={820 + i * 68} y2="900"
                stroke="#2dd4bf" strokeWidth="0.3" opacity="0.038" />
            ))}

            {/* ══════════════════════════════════════════════════════════════
                BRAIN MRI  —  upper-left
            ══════════════════════════════════════════════════════════════ */}
            {/* Outer atmospheric glow */}
            <circle cx="246" cy="296" r="180" fill="url(#gBrain)" />

            {/* DICOM frame */}
            <rect x="116" y="174" width="260" height="244" rx="6"
              fill="rgba(10,36,32,0.55)" stroke="#2dd4bf" strokeWidth="0.8" opacity="0.38" />

            {/* Animated border shimmer */}
            <rect x="116" y="174" width="260" height="244" rx="6"
              fill="none" stroke="#2dd4bf" strokeWidth="1.5" opacity="0.18"
              strokeDasharray="12,8" className="shimmer-dash" />

            {/* Corner marks */}
            {[[116,174],[376,174],[116,418],[376,418]].map(([cx,cy], i) => (
              <g key={i}>
                <line x1={cx-8} y1={cy} x2={cx+8} y2={cy} stroke="#2dd4bf" strokeWidth="1.3" opacity="0.6" />
                <line x1={cx} y1={cy-8} x2={cx} y2={cy+8} stroke="#2dd4bf" strokeWidth="1.3" opacity="0.6" />
              </g>
            ))}

            {/* Skull — outer */}
            <ellipse cx="246" cy="296" rx="116" ry="106"
              fill="none" stroke="#2dd4bf" strokeWidth="2" opacity="0.6"
              filter="url(#glow)" />
            {/* Skull — inner */}
            <ellipse cx="246" cy="296" rx="100" ry="91"
              fill="rgba(26,77,70,0.08)" stroke="#2dd4bf" strokeWidth="1" opacity="0.32" />

            {/* Brain gyri — lateral sulci */}
            <path d="M178 263 Q198 246 223 250 Q238 244 250 252 Q264 244 283 248 Q300 254 312 266"
              fill="none" stroke="#5eead4" strokeWidth="1.1" opacity="0.38" />
            <path d="M168 288 Q188 278 213 281 Q233 277 246 285 Q260 277 280 281 Q297 278 316 288"
              fill="none" stroke="#5eead4" strokeWidth="1.1" opacity="0.36" />
            <path d="M172 314 Q192 306 216 309 Q234 304 248 312 Q262 304 282 309 Q300 306 312 316"
              fill="none" stroke="#5eead4" strokeWidth="1" opacity="0.3" />
            <path d="M176 340 Q196 332 218 335 Q236 330 248 338 Q262 330 282 335 Q298 332 310 342"
              fill="none" stroke="#5eead4" strokeWidth="1" opacity="0.24" />

            {/* Midline cross */}
            <line x1="246" y1="192" x2="246" y2="400" stroke="#5eead4" strokeWidth="0.7" opacity="0.22" strokeDasharray="3,6" />
            <line x1="132" y1="296" x2="360" y2="296" stroke="#5eead4" strokeWidth="0.7" opacity="0.22" strokeDasharray="3,6" />

            {/* Ventricles */}
            <ellipse cx="234" cy="292" rx="15" ry="10"
              fill="rgba(10,36,32,0.85)" stroke="#2dd4bf" strokeWidth="1" opacity="0.55" />
            <ellipse cx="258" cy="292" rx="12" ry="9"
              fill="rgba(10,36,32,0.85)" stroke="#2dd4bf" strokeWidth="1" opacity="0.5" />

            {/* Animated scan sweep */}
            <line className="scan-sweep" x1="132" y1="232" x2="360" y2="232"
              stroke="#2dd4bf" strokeWidth="1.8" opacity="0.65"
              style={{ transformOrigin: '246px 232px' }} />

            {/* Raster lines clipped to skull */}
            {Array.from({ length: 19 }).map((_, i) => (
              <line key={i} x1="130" y1={194 + i * 11} x2="362" y2={194 + i * 11}
                stroke="#2dd4bf" strokeWidth="0.6"
                opacity={i % 4 === 0 ? 0.17 : 0.07}
                clipPath="url(#clipBrain)" />
            ))}

            {/* DICOM text */}
            <text x="124" y="189" fill="#2dd4bf" fontSize="8" fontFamily="monospace" opacity="0.7">BRAIN AXIAL</text>
            <text x="124" y="199" fill="#2dd4bf" fontSize="8" fontFamily="monospace" opacity="0.55">T1-WEIGHTED</text>
            <text x="368" y="189" fill="#2dd4bf" fontSize="8" fontFamily="monospace" opacity="0.55" textAnchor="end">TE: 11 ms</text>
            <text x="368" y="199" fill="#2dd4bf" fontSize="8" fontFamily="monospace" opacity="0.55" textAnchor="end">TR: 650 ms</text>
            <text x="124" y="413" fill="#2dd4bf" fontSize="8" fontFamily="monospace" opacity="0.5">L</text>
            <text x="368" y="413" fill="#2dd4bf" fontSize="8" fontFamily="monospace" opacity="0.5" textAnchor="end">R</text>
            <text x="246" y="428" fill="#2dd4bf" fontSize="7.5" fontFamily="monospace" opacity="0.42" textAnchor="middle">FOV: 240 mm · 3.0T · ARIS</text>

            {/* ══════════════════════════════════════════════════════════════
                MRI BORE MACHINE  —  lower-center, straddles both halves
            ══════════════════════════════════════════════════════════════ */}
            {/* Outer housing */}
            <rect x="390" y="498" width="580" height="370" rx="34"
              fill="rgba(13,148,136,0.04)"
              stroke="#0d9488" strokeWidth="1.8" opacity="0.32" />
            <rect x="412" y="516" width="536" height="334" rx="24"
              fill="none" stroke="#0d9488" strokeWidth="0.8" opacity="0.14" />

            {/* Housing detail lines */}
            <line x1="390" y1="558" x2="970" y2="558" stroke="#0d9488" strokeWidth="0.6" opacity="0.14" />
            <line x1="390" y1="830" x2="970" y2="830" stroke="#0d9488" strokeWidth="0.6" opacity="0.14" />

            {/* Amber accent stripe on housing */}
            <rect x="390" y="552" width="580" height="6" rx="3"
              fill="rgba(212,132,26,0.12)" stroke="none" />

            {/* Bore rings — outer to inner */}
            {[178, 158, 138, 120, 102, 86].map((r, i) => (
              <circle key={r} cx="680" cy="683" r={r}
                fill="none"
                stroke={i >= 4 ? '#2dd4bf' : '#0d9488'}
                strokeWidth={i === 0 ? 2.4 : 1.4}
                opacity={0.12 + i * 0.09}
                className={i >= 4 ? 'breathe-ring' : undefined}
                filter={i === 5 ? 'url(#glow)' : undefined}
              />
            ))}

            {/* Amber ring accent */}
            <circle cx="680" cy="683" r="164"
              fill="none" stroke="#D4841A" strokeWidth="0.8" opacity="0.14"
              strokeDasharray="6,10" />

            {/* Inner bore */}
            <circle cx="680" cy="683" r="70"
              fill="rgba(7,26,24,0.95)"
              stroke="#2dd4bf" strokeWidth="1.4" opacity="0.5"
              filter="url(#glow)" />

            {/* Bore crosshair */}
            <line x1="680" y1="648" x2="680" y2="718" stroke="#2dd4bf" strokeWidth="0.9" opacity="0.35" strokeDasharray="3,5" />
            <line x1="645" y1="683" x2="715" y2="683" stroke="#2dd4bf" strokeWidth="0.9" opacity="0.35" strokeDasharray="3,5" />
            <circle cx="680" cy="683" r="4" fill="#2dd4bf" opacity="0.5" />

            {/* Magnetic field arcs */}
            {[-1, 1].map(side => [28, 52, 76].map((offset, i) => (
              <path key={`${side}${i}`}
                d={`M${390 + (side === 1 ? 580 : 0)} ${652 - offset}
                    Q${390 + (side === 1 ? 580 + 44 + i*22 : -(44 + i*22))} 683
                     ${390 + (side === 1 ? 580 : 0)} ${714 + offset}`}
                fill="none"
                stroke={i === 0 ? '#D4841A' : '#0d9488'}
                strokeWidth="0.9" opacity={0.16 - i * 0.04}
                strokeDasharray="4,7" />
            )))}

            {/* Patient table */}
            <rect x="620" y="865" width="120" height="12" rx="5"
              fill="rgba(45,212,191,0.1)" stroke="#2dd4bf" strokeWidth="1" opacity="0.42" />
            <rect x="648" y="877" width="64"  height="20" rx="3"
              fill="none" stroke="#2dd4bf" strokeWidth="0.7" opacity="0.25" />

            {/* MRI labels */}
            <text x="406" y="535" fill="#0d9488" fontSize="8.5" fontFamily="monospace" opacity="0.5">MRI 3.0 TESLA</text>
            <text x="406" y="547" fill="#0d9488" fontSize="8"   fontFamily="monospace" opacity="0.36">MAGNET: SUPERCONDUCTING</text>
            <text x="954" y="535" fill="#0d9488" fontSize="8.5" fontFamily="monospace" opacity="0.45" textAnchor="end">SLICE: 5.0 mm</text>
            <text x="954" y="547" fill="#0d9488" fontSize="8"   fontFamily="monospace" opacity="0.33" textAnchor="end">MATRIX: 256×256</text>

            {/* ══════════════════════════════════════════════════════════════
                CT SCAN  —  far-right upper, bleeds into login card zone
            ══════════════════════════════════════════════════════════════ */}
            {/* DICOM frame */}
            <rect x="1146" y="122" width="168" height="172" rx="6"
              fill="rgba(10,36,32,0.5)" stroke="#3A9A8D" strokeWidth="0.8" opacity="0.38" />

            {/* Animated border */}
            <rect x="1146" y="122" width="168" height="172" rx="6"
              fill="none" stroke="#3A9A8D" strokeWidth="1.4" opacity="0.15"
              strokeDasharray="10,8" className="shimmer-dash" />

            {/* Corner marks */}
            {[[1146,122],[1314,122],[1146,294],[1314,294]].map(([cx,cy], i) => (
              <g key={i}>
                <line x1={cx-6} y1={cy} x2={cx+6} y2={cy} stroke="#3A9A8D" strokeWidth="1.1" opacity="0.55" />
                <line x1={cx} y1={cy-6} x2={cx} y2={cy+6} stroke="#3A9A8D" strokeWidth="1.1" opacity="0.55" />
              </g>
            ))}

            {/* CT rings */}
            {[78, 65, 52, 40, 28, 16].map((r, i) => (
              <circle key={r} cx="1228" cy="208" r={r}
                fill="none" stroke="#3A9A8D"
                strokeWidth={i === 0 ? 2 : 1.1}
                opacity={0.15 + i * 0.08}
                filter={i === 5 ? 'url(#glow)' : undefined} />
            ))}

            {/* Lung fields */}
            <ellipse cx="1209" cy="202" rx="19" ry="23"
              fill="rgba(58,154,141,0.07)" stroke="#3A9A8D" strokeWidth="0.9" opacity="0.48" />
            <ellipse cx="1247" cy="202" rx="19" ry="23"
              fill="rgba(58,154,141,0.07)" stroke="#3A9A8D" strokeWidth="0.9" opacity="0.48" />

            {/* Spine */}
            <ellipse cx="1228" cy="208" rx="8" ry="9"
              fill="rgba(58,154,141,0.12)" stroke="#3A9A8D" strokeWidth="0.9" opacity="0.58"
              filter="url(#glow)" />

            {/* Heart silhouette */}
            <ellipse cx="1228" cy="194" rx="5" ry="7"
              fill="rgba(212,132,26,0.15)" stroke="#D4841A" strokeWidth="0.7" opacity="0.4" />

            {/* CT raster lines */}
            {Array.from({ length: 12 }).map((_, i) => (
              <line key={i} x1="1150" y1={156 + i * 9} x2="1310" y2={156 + i * 9}
                stroke="#3A9A8D" strokeWidth="0.55" opacity="0.09"
                clipPath="url(#clipCT)" />
            ))}

            {/* CT labels */}
            <text x="1152" y="137" fill="#3A9A8D" fontSize="7.5" fontFamily="monospace" opacity="0.68">CT THORAX</text>
            <text x="1308" y="137" fill="#3A9A8D" fontSize="7.5" fontFamily="monospace" opacity="0.55" textAnchor="end">120 kV · 250 mAs</text>
            <text x="1152" y="306" fill="#3A9A8D" fontSize="7"   fontFamily="monospace" opacity="0.5">AXIAL · W/W: 350/40</text>
            <text x="1308" y="306" fill="#D4841A" fontSize="7"   fontFamily="monospace" opacity="0.45" textAnchor="end">ARIS · 3.0T</text>

            {/* ── ECG waveform — lower left ───────────────────────────────── */}
            <polyline
              points="48,762 72,762 86,728 98,796 112,750 124,762 148,762 162,748 176,776 188,762 214,762"
              fill="none" stroke="#2dd4bf" strokeWidth="1.4" opacity="0.3" />
            <circle cx="86" cy="728" r="2.5" fill="#2dd4bf" opacity="0.4" />
            <text x="48"  y="782" fill="#2dd4bf" fontSize="7" fontFamily="monospace" opacity="0.35">ECG · HR: 72 bpm</text>
            <text x="214" y="782" fill="#D4841A" fontSize="7" fontFamily="monospace" opacity="0.32" textAnchor="start"> · SINUS</text>

            {/* ── Spine column — bottom right ─────────────────────────────── */}
            {[0,1,2,3,4].map(i => (
              <g key={i}>
                <rect x="1060" y={548 + i * 46} width="38" height="32"
                  rx="5" fill="rgba(58,154,141,0.07)" stroke="#3A9A8D" strokeWidth="0.9" opacity="0.35" />
                {i > 0 && (
                  <line x1="1079" y1={548 + i * 46} x2="1079" y2={594 + (i-1) * 46}
                    stroke="#3A9A8D" strokeWidth="0.6" opacity="0.2" />
                )}
              </g>
            ))}
            <text x="1062" y="782" fill="#3A9A8D" fontSize="7" fontFamily="monospace" opacity="0.35">LUMBAR SPINE</text>

            {/* ── Measurement ruler — right edge ──────────────────────────── */}
            {Array.from({ length: 18 }).map((_, i) => (
              <g key={i}>
                <line x1="1418" y1={40 + i * 46} x2={i % 3 === 0 ? 1406 : 1411} y2={40 + i * 46}
                  stroke="#0d9488" strokeWidth="0.8" opacity="0.3" />
                {i % 3 === 0 && (
                  <text x="1404" y={44 + i * 46}
                    fill="#0d9488" fontSize="7" fontFamily="monospace" opacity="0.35" textAnchor="end">
                    {i * 5}
                  </text>
                )}
              </g>
            ))}

            {/* ── Ruler — bottom ──────────────────────────────────────────── */}
            {Array.from({ length: 25 }).map((_, i) => (
              <line key={i} x1={i * 60} y1="892" x2={i * 60} y2={i % 5 === 0 ? 878 : 884}
                stroke="#0d9488" strokeWidth="0.65" opacity="0.22" />
            ))}

            {/* ── Amber accent dots scattered ─────────────────────────────── */}
            <circle cx="490" cy="490" r="2.5" fill="#D4841A" opacity="0.35" />
            <circle cx="880" cy="498" r="2"   fill="#D4841A" opacity="0.28" />
            <circle cx="380" cy="460" r="1.8" fill="#2dd4bf" opacity="0.4" />
          </svg>
        </div>

        {/* ── Soft right-side vignette so card "lifts" from background ───── */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse at 78% 50%, rgba(26,77,70,0.22) 0%, transparent 60%)',
        }} />

        {/* ══════════════════════════════════════════════════════════════════════
            CONTENT LAYER
        ══════════════════════════════════════════════════════════════════════ */}
        <div className="relative z-10 min-h-screen flex">

          {/* ── Left branding ──────────────────────────────────────────────── */}
          <div className="hidden lg:flex lg:flex-1 flex-col justify-between p-12 xl:p-16">

            {/* Wordmark */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(45,212,191,0.12)', border: '1.5px solid rgba(45,212,191,0.3)' }}>
                <svg className="w-4.5 h-4.5" style={{ color: '#2dd4bf', width:'18px', height:'18px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.5 12.5l3 3 5-6 3 3 4-5" />
                </svg>
              </div>
              <div>
                <span style={{ fontFamily: "'Cinzel', serif", color: '#fbbf24', fontWeight: 700, fontSize: '1.1rem', letterSpacing: '0.22em' }}>
                  ARIS
                </span>
                <span style={{ display: 'block', fontSize: '0.6rem', color: 'rgba(45,212,191,0.6)', letterSpacing: '0.18em', textTransform: 'uppercase', marginTop: '1px' }}>
                  Diagnostic Centre
                </span>
              </div>
            </div>

            {/* Headline block */}
            <div>
              {/* Status pill */}
              <div className="inline-flex items-center gap-2 mb-5 px-3 py-1.5 rounded-full"
                style={{ background: 'rgba(45,212,191,0.1)', border: '1px solid rgba(45,212,191,0.25)' }}>
                <span className="pulse-dot w-2 h-2 rounded-full inline-block" style={{ background: '#2dd4bf' }} />
                <span style={{ fontSize: '0.7rem', color: '#5eead4', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600 }}>
                  Healthcare ERP Platform
                </span>
              </div>

              <h1 className="font-bold text-white leading-[1.12] mb-5"
                style={{ fontSize: 'clamp(2rem, 3.2vw, 2.8rem)', textShadow: '0 2px 24px rgba(0,0,0,0.7)' }}>
                Smarter<br />
                <span style={{ color: '#2dd4bf' }}>Diagnostics.</span><br />
                <span style={{ color: '#fbbf24' }}>Better Care.</span>
              </h1>

              <p className="text-sm leading-relaxed" style={{ color: 'rgba(167,228,218,0.72)', maxWidth: '300px', textShadow: '0 1px 10px rgba(0,0,0,0.6)' }}>
                Complete ERP for modern diagnostic centres — MRI, CT, patient records, billing, and financials unified.
              </p>

              {/* Feature list */}
              <div className="mt-7 space-y-3">
                {[
                  { label: 'Patient registration & clinical workflows',  color: '#2dd4bf' },
                  { label: 'Billing, GST & financial reconciliation',     color: '#D4841A' },
                  { label: 'Procurement, assets & stock management',      color: '#2dd4bf' },
                ].map(({ label, color }) => (
                  <div key={label} className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center"
                      style={{ background: `rgba(${color === '#2dd4bf' ? '45,212,191' : '212,132,26'},0.14)`, border: `1px solid rgba(${color === '#2dd4bf' ? '45,212,191' : '212,132,26'},0.35)` }}>
                      <svg style={{ width: '10px', height: '10px', color }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-xs" style={{ color: 'rgba(167,228,218,0.8)', textShadow: '0 1px 6px rgba(0,0,0,0.6)' }}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-xs tracking-wide" style={{ color: 'rgba(45,212,191,0.3)' }}>
              © {new Date().getFullYear()} Feenixtech &mdash; All rights reserved
            </p>
          </div>

          {/* ── Login card ─────────────────────────────────────────────────── */}
          <div className="flex-1 lg:flex-none lg:w-[430px] xl:w-[460px] flex items-center justify-center px-5 py-10">
            <div className="w-full" style={{ maxWidth: '390px' }}>

              {/* Card */}
              <div className="rounded-2xl p-8" style={{
                background: 'rgba(255,255,255,0.98)',
                boxShadow: '0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(45,212,191,0.12), 0 8px 32px rgba(0,0,0,0.3)',
                backdropFilter: 'blur(28px)',
              }}>

                {/* Logo */}
                <div className="flex flex-col items-center mb-6">
                  {logoConfig.customLogo ? (
                    <img src={logoConfig.customLogo} alt="Logo" className="object-contain mb-2"
                      style={{ height: '52px', maxWidth: '160px' }} />
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <div className="w-13 h-13 rounded-2xl flex items-center justify-center mb-1"
                        style={{ width: '52px', height: '52px', background: 'linear-gradient(135deg, #0f4a42 0%, #0d9488 60%, #3A9A8D 100%)', boxShadow: '0 6px 20px rgba(13,148,136,0.35)' }}>
                        <svg style={{ width: '26px', height: '26px', color: '#fbbf24' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.5 12.5l3 3 5-6 3 3 4-5" />
                        </svg>
                      </div>
                      <span style={{ fontFamily: "'Cinzel', serif", color: '#0f4c55', fontWeight: 700, fontSize: '1.3rem', letterSpacing: '0.22em', marginTop: '4px' }}>
                        ARIS
                      </span>
                      <span style={{ fontSize: '0.62rem', color: '#94a3b8', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                        Diagnostic Centre
                      </span>
                    </div>
                  )}
                </div>

                {/* Gradient divider */}
                <div className="mb-5" style={{ height: '1.5px', background: 'linear-gradient(90deg, transparent, #0d9488 40%, #D4841A 60%, transparent)' }} />

                {/* Heading */}
                <div className="mb-5">
                  <h2 className="font-bold text-slate-800" style={{ fontSize: '1.15rem' }}>Sign in</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Enter your credentials to access your workspace</p>
                </div>

                {/* Error */}
                {error && (
                  <div className="mb-4 flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs"
                    style={{ background: '#fff5f5', border: '1.5px solid #fecaca' }}>
                    <svg className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-red-600 leading-snug">{error}</p>
                  </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4" noValidate>

                  {/* Email */}
                  <div>
                    <label htmlFor="email" className="block text-xs font-semibold text-slate-500 mb-1.5">Email address</label>
                    <div className="relative">
                      <svg className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ width: '14px', height: '14px', color: '#94a3b8' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      <input
                        id="email" name="email" type="email" autoComplete="email" required
                        value={formData.email} onChange={handleChange}
                        placeholder="you@example.com"
                        style={{
                          width: '100%', paddingLeft: '2.25rem', paddingRight: '0.875rem',
                          paddingTop: '0.55rem', paddingBottom: '0.55rem',
                          fontSize: '0.8125rem', color: '#1e293b',
                          background: '#f8fafc', border: '1.5px solid #e2e8f0',
                          borderRadius: '0.7rem', outline: 'none', transition: 'all 0.18s',
                          boxSizing: 'border-box',
                        }}
                        onFocus={e => Object.assign(e.target.style, { border: '1.5px solid #0d9488', background: '#fff', boxShadow: '0 0 0 3px rgba(13,148,136,0.1)' })}
                        onBlur={e  => Object.assign(e.target.style,  { border: '1.5px solid #e2e8f0', background: '#f8fafc', boxShadow: 'none' })}
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <label htmlFor="password" className="block text-xs font-semibold text-slate-500 mb-1.5">Password</label>
                    <div className="relative">
                      <svg className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ width: '14px', height: '14px', color: '#94a3b8' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <input
                        id="password" name="password" type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password" required
                        value={formData.password} onChange={handleChange}
                        placeholder="••••••••"
                        style={{
                          width: '100%', paddingLeft: '2.25rem', paddingRight: '2.5rem',
                          paddingTop: '0.55rem', paddingBottom: '0.55rem',
                          fontSize: '0.8125rem', color: '#1e293b',
                          background: '#f8fafc', border: '1.5px solid #e2e8f0',
                          borderRadius: '0.7rem', outline: 'none', transition: 'all 0.18s',
                          boxSizing: 'border-box',
                        }}
                        onFocus={e => Object.assign(e.target.style, { border: '1.5px solid #0d9488', background: '#fff', boxShadow: '0 0 0 3px rgba(13,148,136,0.1)' })}
                        onBlur={e  => Object.assign(e.target.style,  { border: '1.5px solid #e2e8f0', background: '#f8fafc', boxShadow: 'none' })}
                      />
                      <button type="button" tabIndex={-1} onClick={() => setShowPassword(v => !v)}
                        style={{ position: 'absolute', right: 0, top: 0, bottom: 0, display: 'flex', alignItems: 'center', padding: '0 0.75rem', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>
                        {showPassword ? (
                          <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                              d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Submit */}
                  <button type="submit" disabled={loading}
                    className="w-full flex items-center justify-center gap-2 font-semibold text-white rounded-xl"
                    style={{
                      padding: '0.7rem', fontSize: '0.875rem', marginTop: '0.25rem',
                      background: loading
                        ? '#0d9488'
                        : 'linear-gradient(135deg, #0a3d3a 0%, #0d9488 50%, #3A9A8D 100%)',
                      boxShadow: loading ? 'none' : '0 6px 20px rgba(13,148,136,0.38)',
                      border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                      opacity: loading ? 0.75 : 1,
                      transition: 'all 0.2s',
                    }}>
                    {loading ? (
                      <>
                        <svg style={{ width: '16px', height: '16px' }} className="animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Signing in…
                      </>
                    ) : (
                      <>
                        Sign in
                        <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                      </>
                    )}
                  </button>
                </form>

                {/* Footer */}
                <div className="mt-6 pt-4" style={{ borderTop: '1px solid #f1f5f9' }}>
                  <p className="text-center" style={{ fontSize: '0.7rem', color: '#cbd5e1', letterSpacing: '0.04em' }}>
                    Powered by <span style={{ color: '#0d9488', fontWeight: 600 }}>Feenixtech</span>
                    <span style={{ color: '#D4841A', marginLeft: '4px' }}>·</span>
                    <span style={{ marginLeft: '4px' }}>Secure Healthcare ERP</span>
                  </p>
                </div>
              </div>

              {/* Mobile tag */}
              <p className="lg:hidden mt-5 text-center text-xs" style={{ color: 'rgba(45,212,191,0.45)' }}>
                ARIS Diagnostic Centre &mdash; Healthcare ERP Platform
              </p>
            </div>
          </div>

        </div>
      </div>
    </>
  );
};

export default Login;
