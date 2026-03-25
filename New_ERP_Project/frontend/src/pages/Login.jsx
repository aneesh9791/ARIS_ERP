import { useState } from 'react';

const ANIM = `
  @keyframes fadeUp  { from{opacity:0;transform:translateY(22px)} to{opacity:1;transform:translateY(0)} }
  @keyframes spin    { to{transform:rotate(360deg)} }
  @keyframes breathe { 0%,100%{opacity:.18;transform:scale(1)} 50%{opacity:.38;transform:scale(1.07)} }
  @keyframes drift   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-16px)} }
  @keyframes pulse   { 0%,100%{opacity:.5;transform:scale(1)} 50%{opacity:1;transform:scale(1.4)} }
  @keyframes shimmer { 0%{background-position:200% center} 100%{background-position:-200% center} }
  .fadeUp  { animation: fadeUp  .65s cubic-bezier(.22,1,.36,1) both }
  .spin    { animation: spin    .9s linear infinite }
  .breathe { animation: breathe 6s ease-in-out infinite }
  .drift   { animation: drift   8s ease-in-out infinite }
  .pulse-d { animation: pulse   2.2s ease-in-out infinite }
  .d1{animation-delay:.1s} .d2{animation-delay:.2s} .d3{animation-delay:.3s} .d4{animation-delay:.4s}
`;

const FEATURES = [
  { label: 'Patient Registration & Clinical Workflows', amber: false },
  { label: 'Billing, GST & Financial Management',       amber: true  },
  { label: 'Procurement, Assets & Inventory',           amber: false },
];

export default function Login() {
  const [form, setForm]         = useState({ email: '', password: '' });
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [showPass, setShowPass] = useState(false);

  const logoConfig = (() => {
    try { return JSON.parse(localStorage.getItem('logoConfig')) || {}; } catch { return {}; }
  })();

  const onChange = e => { setForm({ ...form, [e.target.name]: e.target.value }); if (error) setError(''); };

  const onSubmit = async e => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const res  = await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(form) });
      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        window.location.href = '/dashboard';
      } else { setError(data.error || data.message || 'Invalid credentials.'); }
    } catch { setError('Network error. Please check your connection.'); }
    finally  { setLoading(false); }
  };

  return (
    <>
      <style>{ANIM}</style>

      {/* ── Page shell ─────────────────────────────────────────────────────── */}
      <div style={{
        minHeight: '100vh', display: 'flex',
        fontFamily: "'Inter', system-ui, sans-serif",
        background: '#f0fdfa',
      }}>

        {/* ════════════════════════════════════════════════════════════════════
            LEFT  —  rich brand panel
        ════════════════════════════════════════════════════════════════════ */}
        <div className="hidden lg:flex lg:flex-col" style={{
          width: '52%', position: 'relative', overflow: 'hidden',
          flexDirection: 'column', padding: '3.5rem 4rem',
          background: 'linear-gradient(160deg, #0a2826 0%, #134e4a 32%, #0f766e 66%, #0d9488 100%)',
        }}>

          {/* Large glow blob — bottom left (amber accent) */}
          <div style={{
            position:'absolute', bottom: -120, left: -120,
            width: 500, height: 500, borderRadius:'50%',
            background: 'radial-gradient(circle, rgba(212,132,26,0.22) 0%, transparent 65%)',
            pointerEvents:'none',
          }}/>

          {/* Large glow blob — top right (teal lighter) */}
          <div style={{
            position:'absolute', top: -100, right: -100,
            width: 460, height: 460, borderRadius:'50%',
            background: 'radial-gradient(circle, rgba(94,234,212,0.14) 0%, transparent 65%)',
            pointerEvents:'none',
          }}/>

          {/* Mid glow — center */}
          <div className="drift" style={{
            position:'absolute', top:'40%', left:'55%',
            width: 220, height: 220, borderRadius:'50%',
            background: 'radial-gradient(circle, rgba(212,132,26,0.12) 0%, transparent 70%)',
            pointerEvents:'none',
          }}/>

          {/* Animated rings */}
          <div className="breathe" style={{
            position:'absolute', top: -60, right: -60,
            width: 400, height: 400, borderRadius:'50%',
            border: '1.5px solid rgba(255,255,255,0.12)',
            pointerEvents:'none',
          }}/>
          <div className="breathe" style={{
            position:'absolute', top: -10, right: -10,
            width: 260, height: 260, borderRadius:'50%',
            border: '1px solid rgba(255,255,255,0.08)',
            pointerEvents:'none', animationDelay:'.9s',
          }}/>
          <div className="breathe" style={{
            position:'absolute', bottom: -80, left: -80,
            width: 360, height: 360, borderRadius:'50%',
            border: '1px solid rgba(212,132,26,0.2)',
            pointerEvents:'none', animationDelay:'1.6s',
          }}/>

          {/* Dot grid */}
          <div style={{
            position:'absolute', inset:0, pointerEvents:'none', opacity:.35,
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.25) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}/>

          {/* Diagonal bottom-right highlight strip */}
          <div style={{
            position:'absolute', bottom:0, right:0,
            width:'60%', height:'40%',
            background: 'linear-gradient(135deg, transparent 0%, rgba(94,234,212,0.06) 100%)',
            pointerEvents:'none',
          }}/>

          {/* ── Content ──────────────────────────────────────────────────── */}
          <div style={{ position:'relative', zIndex:1, display:'flex', flexDirection:'column', height:'100%' }}>

            {/* Wordmark */}
            <div className="fadeUp">
              <div style={{ fontSize:'1.2rem', fontWeight:900, letterSpacing:'0.22em', color:'#ffffff' }}>ARIS</div>
              <div style={{ fontSize:'0.6rem', color:'rgba(94,234,212,0.85)', letterSpacing:'0.2em',
                textTransform:'uppercase', marginTop:2 }}>Diagnostic Centre</div>
            </div>

            {/* Main hero text */}
            <div style={{ marginTop:'auto', marginBottom:'auto' }}>

              {/* Pill badge */}
              <div className="fadeUp d1" style={{
                display:'inline-flex', alignItems:'center', gap:8,
                padding:'6px 15px', borderRadius:999, marginBottom:'1.6rem',
                background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.2)',
                backdropFilter:'blur(6px)',
              }}>
                <span className="pulse-d" style={{
                  display:'inline-block', width:7, height:7, borderRadius:'50%',
                  background:'#5eead4',
                }}/>
                <span style={{ fontSize:'0.67rem', fontWeight:700, color:'#5eead4',
                  letterSpacing:'0.15em', textTransform:'uppercase' }}>
                  Healthcare ERP Platform
                </span>
              </div>

              {/* Big headline */}
              <h1 className="fadeUp d2" style={{
                fontSize:'clamp(2.4rem, 3.4vw, 3.2rem)', fontWeight:900,
                lineHeight:1.1, color:'#ffffff', marginBottom:'1.1rem',
                textShadow:'0 2px 20px rgba(0,0,0,0.25)',
              }}>
                Smarter<br/>
                <span style={{
                  background:'linear-gradient(90deg, #5eead4 0%, #D4841A 100%)',
                  WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
                  backgroundSize:'200% auto',
                }}>Diagnostics.</span><br/>
                Better Care.
              </h1>

              <p className="fadeUp d3" style={{
                fontSize:'0.95rem', lineHeight:1.85, color:'rgba(255,255,255,0.72)',
                maxWidth:'340px', marginBottom:'2.5rem',
              }}>
                One unified platform for diagnostic centres — from patient walk-in to financial close.
              </p>

              {/* Features */}
              <div className="fadeUp d4" style={{ display:'flex', flexDirection:'column', gap:'0.9rem' }}>
                {FEATURES.map(f => (
                  <div key={f.label} style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <div style={{
                      width:8, height:8, borderRadius:'50%', flexShrink:0,
                      background: f.amber ? '#D4841A' : '#5eead4',
                      boxShadow: `0 0 8px ${f.amber ? 'rgba(212,132,26,0.7)' : 'rgba(94,234,212,0.7)'}`,
                    }}/>
                    <span style={{ fontSize:'0.88rem', fontWeight:500, color:'rgba(255,255,255,0.82)' }}>
                      {f.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Stats row */}
            <div style={{
              display:'flex', gap:'2.5rem',
              paddingTop:'1.75rem', borderTop:'1px solid rgba(255,255,255,0.14)',
            }}>
              {[
                { v:'50K+',  l:'Patients',      c:'#5eead4' },
                { v:'1,200', l:'Scans/Month',   c:'#D4841A' },
                { v:'99.9%', l:'System Uptime', c:'#5eead4' },
              ].map(s => (
                <div key={s.l}>
                  <div style={{ fontSize:'1.35rem', fontWeight:800, color:s.c,
                    textShadow:`0 0 12px ${s.c}60` }}>{s.v}</div>
                  <div style={{ fontSize:'0.7rem', color:'rgba(255,255,255,0.5)', marginTop:2 }}>{s.l}</div>
                </div>
              ))}
            </div>

          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════════
            RIGHT  —  login card
        ════════════════════════════════════════════════════════════════════ */}
        <div style={{
          flex:1, display:'flex', alignItems:'center', justifyContent:'center',
          padding:'2.5rem 1.5rem',
          background:'linear-gradient(160deg, #f0fdfa 0%, #ffffff 50%, #fff8f0 100%)',
        }}>
          <div className="fadeUp" style={{ width:'100%', maxWidth:'420px' }}>

            {/* Mobile wordmark */}
            <div style={{ textAlign:'center', marginBottom:'2rem' }} className="flex lg:hidden">
              <div style={{ fontSize:'1.15rem', fontWeight:900, letterSpacing:'0.22em', color:'#134e4a' }}>ARIS</div>
              <div style={{ fontSize:'0.58rem', color:'#0d9488', letterSpacing:'0.18em',
                textTransform:'uppercase', marginTop:2 }}>Diagnostic Centre</div>
            </div>

            {/* Card */}
            <div style={{
              background:'#ffffff', borderRadius:24, padding:'2.25rem',
              boxShadow:'0 4px 6px rgba(0,0,0,0.03), 0 24px 64px rgba(13,148,136,0.13), 0 0 0 1px rgba(13,148,136,0.09)',
            }}>

              {/* Custom logo (if configured) */}
              {logoConfig.customLogo && (
                <div style={{ display:'flex', justifyContent:'center', marginBottom:'1.6rem' }}>
                  <img src={logoConfig.customLogo} alt="Logo"
                    style={{ height:56, maxWidth:170, objectFit:'contain' }}/>
                </div>
              )}

              {/* Teal-amber gradient divider */}
              <div style={{
                height:2, borderRadius:2, marginBottom:'1.6rem',
                background:'linear-gradient(90deg, transparent 0%, #134e4a 30%, #0d9488 55%, #D4841A 75%, transparent 100%)',
                opacity:.5,
              }}/>

              <div style={{ textAlign:'center', marginBottom:'1.6rem' }}>
                <h2 style={{ fontSize:'1.3rem', fontWeight:800, color:'#134e4a', marginBottom:4 }}>
                  Welcome back
                </h2>
                <p style={{ fontSize:'0.85rem', color:'#64748b' }}>
                  Sign in to your workspace
                </p>
              </div>

              {/* Error */}
              {error && (
                <div style={{
                  display:'flex', alignItems:'flex-start', gap:8,
                  padding:'10px 14px', borderRadius:12, marginBottom:'1rem',
                  background:'#fef2f2', border:'1px solid #fecaca',
                }}>
                  <svg width="15" height="15" fill="none" stroke="#ef4444" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"
                    style={{ flexShrink:0, marginTop:1 }}>
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <span style={{ fontSize:'0.82rem', color:'#dc2626', lineHeight:1.5 }}>{error}</span>
                </div>
              )}

              {/* Form */}
              <form onSubmit={onSubmit} noValidate>

                {/* Email */}
                <div style={{ marginBottom:'1rem' }}>
                  <label style={{ display:'block', fontSize:'0.78rem', fontWeight:600,
                    color:'#374151', marginBottom:7 }}>Email address</label>
                  <div style={{ position:'relative' }}>
                    <svg width="15" height="15" fill="none" stroke="#9ca3af" strokeWidth="1.8"
                      strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"
                      style={{ position:'absolute', left:13, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }}>
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                      <polyline points="22,6 12,13 2,6"/>
                    </svg>
                    <input name="email" type="email" autoComplete="email" required
                      value={form.email} onChange={onChange} placeholder="you@example.com"
                      style={{
                        width:'100%', boxSizing:'border-box',
                        paddingLeft:40, paddingRight:14, paddingTop:11, paddingBottom:11,
                        fontSize:'0.875rem', color:'#111827',
                        background:'#f9fafb', border:'1.5px solid #e5e7eb',
                        borderRadius:11, outline:'none', transition:'all .15s',
                      }}
                      onFocus={e => Object.assign(e.target.style,{ borderColor:'#0d9488', background:'#fff', boxShadow:'0 0 0 3px rgba(13,148,136,0.12)' })}
                      onBlur={e  => Object.assign(e.target.style,{ borderColor:'#e5e7eb', background:'#f9fafb', boxShadow:'none' })}
                    />
                  </div>
                </div>

                {/* Password */}
                <div style={{ marginBottom:'1.5rem' }}>
                  <label style={{ display:'block', fontSize:'0.78rem', fontWeight:600,
                    color:'#374151', marginBottom:7 }}>Password</label>
                  <div style={{ position:'relative' }}>
                    <svg width="15" height="15" fill="none" stroke="#9ca3af" strokeWidth="1.8"
                      strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"
                      style={{ position:'absolute', left:13, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }}>
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                      <path d="M7 11V7a5 5 0 0110 0v4"/>
                    </svg>
                    <input name="password" type={showPass ? 'text' : 'password'}
                      autoComplete="current-password" required
                      value={form.password} onChange={onChange} placeholder="••••••••"
                      style={{
                        width:'100%', boxSizing:'border-box',
                        paddingLeft:40, paddingRight:42, paddingTop:11, paddingBottom:11,
                        fontSize:'0.875rem', color:'#111827',
                        background:'#f9fafb', border:'1.5px solid #e5e7eb',
                        borderRadius:11, outline:'none', transition:'all .15s',
                      }}
                      onFocus={e => Object.assign(e.target.style,{ borderColor:'#0d9488', background:'#fff', boxShadow:'0 0 0 3px rgba(13,148,136,0.12)' })}
                      onBlur={e  => Object.assign(e.target.style,{ borderColor:'#e5e7eb', background:'#f9fafb', boxShadow:'none' })}
                    />
                    <button type="button" tabIndex={-1} onClick={() => setShowPass(v => !v)}
                      style={{ position:'absolute', right:0, top:0, bottom:0, padding:'0 13px',
                        background:'none', border:'none', cursor:'pointer', color:'#9ca3af',
                        display:'flex', alignItems:'center' }}>
                      {showPass ? (
                        <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8"
                          strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                          <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
                          <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                      ) : (
                        <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8"
                          strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Button */}
                <button type="submit" disabled={loading}
                  style={{
                    width:'100%', padding:'13px 0',
                    fontSize:'0.95rem', fontWeight:700, color:'#f0fdfa',
                    background: loading ? 'rgba(13,148,136,0.45)'
                      : 'linear-gradient(135deg, #134e4a 0%, #0f766e 50%, #0d9488 100%)',
                    border:'none', borderRadius:12,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    boxShadow: loading ? 'none' : '0 6px 22px rgba(13,148,136,0.38)',
                    transition:'all .2s',
                    display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                    letterSpacing:'0.01em',
                  }}
                  onMouseEnter={e => { if(!loading) Object.assign(e.currentTarget.style,{ boxShadow:'0 10px 30px rgba(13,148,136,0.52)', transform:'translateY(-1px)' }); }}
                  onMouseLeave={e => { if(!loading) Object.assign(e.currentTarget.style,{ boxShadow:'0 6px 22px rgba(13,148,136,0.38)', transform:'translateY(0)' }); }}
                >
                  {loading && (
                    <svg className="spin" width="15" height="15" fill="none" stroke="currentColor"
                      strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" d="M12 2a10 10 0 0110 10" opacity=".3"/>
                      <path strokeLinecap="round" d="M12 2a10 10 0 0110 10"/>
                    </svg>
                  )}
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            </div>

            {/* Footer */}
            <p style={{ textAlign:'center', marginTop:'1.25rem', fontSize:'0.72rem', color:'#94a3b8' }}>
              © {new Date().getFullYear()} Feenixtech &mdash; ARIS ERP · All rights reserved
            </p>

          </div>
        </div>

      </div>
    </>
  );
}
