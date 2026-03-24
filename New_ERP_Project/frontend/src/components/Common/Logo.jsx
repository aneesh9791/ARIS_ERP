import React, { useState, useEffect } from 'react';
import '../../styles/theme.css';

/**
 * ARIS Diagnostic Centre Logo Component
 *
 * Props:
 *   size    — 'small' | 'medium' | 'large' | 'xlarge'  (default: 'medium')
 *   variant — 'sidebar' (white text) | 'light' (dark text)  (default: 'sidebar')
 *   className — extra wrapper classes
 */
const Logo = ({ size = 'medium', variant = 'sidebar', className = '' }) => {
  const [logoConfig, setLogoConfig] = useState({
    customLogo: null,
    companyName: 'ARIS Diagnostic Centre',
    tagline: 'A Feenixtech Venture',
    showTagline: true,
  });

  const loadConfig = () => {
    try {
      const saved = localStorage.getItem('logoConfig');
      if (saved) setLogoConfig(prev => ({ ...prev, ...JSON.parse(saved) }));
    } catch { /* keep defaults */ }
  };

  useEffect(() => {
    loadConfig();
    // Re-read whenever another tab or the settings page updates localStorage
    const onStorage = e => { if (e.key === 'logoConfig') loadConfig(); };
    window.addEventListener('storage', onStorage);
    // Also listen for same-tab updates via custom event
    window.addEventListener('logoConfigUpdated', loadConfig);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('logoConfigUpdated', loadConfig);
    };
  }, []);

  // ── Size mappings ──────────────────────────────────────────────────────────
  const sizeMap = {
    small:  { circle: 'w-7 h-7',  icon: 'w-4 h-4',  title: 'text-sm',   sub: 'text-xs',  img: 'h-7'  },
    medium: { circle: 'w-9 h-9',  icon: 'w-5 h-5',  title: 'text-base', sub: 'text-xs',  img: 'h-9'  },
    large:  { circle: 'w-12 h-12', icon: 'w-6 h-6', title: 'text-lg',   sub: 'text-sm',  img: 'h-12' },
    xlarge: { circle: 'w-16 h-16', icon: 'w-8 h-8', title: 'text-xl',   sub: 'text-sm',  img: 'h-16' },
  };
  const s = sizeMap[size] || sizeMap.medium;

  // ── Variant colour tokens ──────────────────────────────────────────────────
  //   sidebar  → used on dark teal-900 background (white text)
  //   light    → used on white/light background (dark text)
  const titleColor    = variant === 'light' ? 'text-teal-700'  : 'text-white';
  const subColor      = variant === 'light' ? 'text-amber-600' : 'text-amber-400';
  const taglineColor  = variant === 'light' ? 'text-teal-600'  : 'text-teal-400';
  const circleBorder  = variant === 'light' ? 'border-teal-500' : 'border-teal-400';
  const circleBg      = variant === 'light' ? 'bg-teal-50'      : 'bg-teal-800';

  // ── Custom logo image ─────────────────────────────────────────────────────
  if (logoConfig.customLogo) {
    // On dark/coloured backgrounds (sidebar variant) wrap in a white pill so
    // logos with white or transparent backgrounds always look crisp.
    const imgWrap = variant === 'sidebar'
      ? 'bg-white rounded-lg p-1 flex-shrink-0 shadow-sm'
      : 'flex-shrink-0';
    return (
      <div className={`flex items-center gap-2.5 ${className}`}>
        <div className={imgWrap}>
          <img
            src={logoConfig.customLogo}
            alt={logoConfig.companyName || 'ARIS Logo'}
            className={`${s.img} w-auto max-w-full object-contain`}
          />
        </div>
        {size !== 'small' && (
          <div className="flex flex-col leading-tight min-w-0">
            <span className={`font-bold truncate ${s.title} ${titleColor}`}>
              {(logoConfig.companyName || 'ARIS').split(' ')[0]}
            </span>
            {logoConfig.showTagline && (
              <span className={`${s.sub} ${taglineColor} truncate`}>
                {logoConfig.tagline || 'Diagnostic Centre'}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Default ARIS styled logo ──────────────────────────────────────────────
  // Mimics the real logo: teal circle border + amber person figure + "ARIS" + subtitle
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* Circle with person SVG — styled like the real ARIS logo */}
      <div
        className={`
          ${s.circle} flex-shrink-0 rounded-full border-2 ${circleBorder} ${circleBg}
          flex items-center justify-center
        `}
      >
        {/* Person / human figure in amber — matching the logo's orange person */}
        <svg
          className={`${s.icon} text-amber-400`}
          fill="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          {/* Head */}
          <circle cx="12" cy="6.5" r="3" />
          {/* Body */}
          <path d="M12 12c-4.418 0-7.5 2.015-7.5 3.5V17h15v-1.5C19.5 14.015 16.418 12 12 12z" />
        </svg>
      </div>

      {/* Text block — only shown when not in icon-only context */}
      {size !== 'small' && (
        <div className="flex flex-col leading-tight min-w-0">
          {/* "ARIS" in primary colour */}
          <span className={`font-bold tracking-tight truncate ${s.title} ${titleColor}`}>
            ARIS
          </span>
          {/* "Diagnostic Centre" — split colour like the logo */}
          <span className={`${s.sub} font-medium truncate`}>
            <span className={subColor}>Diagnostic</span>
            {' '}
            <span className={taglineColor}>Centre</span>
          </span>
          {/* Optional tagline */}
          {logoConfig.showTagline && size === 'xlarge' && (
            <span className={`text-xs mt-0.5 truncate ${taglineColor} opacity-80`}>
              {logoConfig.tagline || 'A Feenixtech Venture'}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default Logo;
