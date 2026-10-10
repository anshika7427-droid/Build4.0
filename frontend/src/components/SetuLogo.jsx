import React from 'react';

/**
 * SetuLogo
 * Professional bridge-and-handshake-inspired brand mark and lockup for SETU.
 * Visually communicates two hands joining/clasping across an arched bridge,
 * symbolizing connection, trust, and bridging the gap between affected citizens and responders.
 */
export default function SetuLogo({
  variant = 'light', // 'light' | 'dark' | 'minimal'
  showTagline = true,
  iconSize = 42,
  className = '',
}) {
  const isDark = variant === 'dark';

  return (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      {/* Bridge & Handshake Vector Mark */}
      <div
        className={`relative flex items-center justify-center shrink-0 rounded-xl transition duration-200 ${
          isDark
            ? 'bg-[#1E3E61] border border-[#2D5A88] text-white shadow-sm'
            : 'bg-[#F0FDFA] border border-[#CCFBF1] shadow-sm hover:border-teal-300'
        }`}
        style={{ width: iconSize, height: iconSize }}
      >
        <svg
          viewBox="0 0 48 48"
          width={iconSize - 6}
          height={iconSize - 6}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label="SETU bridge and handshake mark"
          className="shrink-0"
        >
          <title>SETU: Two hands connecting across a bridge</title>

          {/* Bridge Roadway / Base Deck */}
          <path
            d="M 6 39.5 L 42 39.5"
            stroke={isDark ? '#64748B' : '#94A3B8'}
            strokeWidth="2"
            strokeLinecap="round"
          />

          {/* Bridge Under-Arch Spanning Across the Divide */}
          <path
            d="M 8 39.5 C 14 28, 34 28, 40 39.5"
            stroke={isDark ? '#2DD4BF' : '#0D9488'}
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />

          {/* Bridge Vertical Suspension Stays */}
          <path
            d="M 15 34.5 V 39.5 M 24 30 V 39.5 M 33 34.5 V 39.5"
            stroke={isDark ? '#475569' : '#CBD5E1'}
            strokeWidth="1.5"
            strokeLinecap="round"
          />

          {/* Left Arm / Hand reaching from left bank (Navy) */}
          <path
            d="M 8 28.5 C 10.5 22.5, 15 17.5, 20.5 15.5 C 22 15, 23.5 16, 23 17.5 L 20.5 21.5 L 13 28 Z"
            fill={isDark ? '#FFFFFF' : '#17324F'}
          />
          <path
            d="M 19 16.5 C 21 15, 24 16, 24.5 18 L 22.5 21.5 Z"
            fill={isDark ? '#CBD5E1' : '#1E3E61'}
          />

          {/* Right Arm / Hand reaching from right bank (Teal) */}
          <path
            d="M 40 28.5 C 37.5 22.5, 33 17.5, 27.5 15.5 C 26 15, 24.5 16, 25 17.5 L 27.5 21.5 L 35 28 Z"
            fill={isDark ? '#2DD4BF' : '#16877F'}
          />
          <path
            d="M 29 16.5 C 27 15, 24 16, 23.5 18 L 25.5 21.5 Z"
            fill={isDark ? '#5EEAD4' : '#14B8A6'}
          />

          {/* Center Interlocking Clasp Knot */}
          <circle
            cx="24"
            cy="18"
            r="2.2"
            fill={isDark ? '#2DD4BF' : '#0D9488'}
          />
          <circle
            cx="24"
            cy="18"
            r="1.1"
            fill={isDark ? '#17324F' : '#FFFFFF'}
          />
        </svg>
      </div>

      {/* Brand Wordmark & Tagline Lockup */}
      <div className="flex flex-col justify-center min-w-0">
        <span
          className={`text-xl sm:text-2xl font-black tracking-tight leading-none ${
            isDark ? 'text-white' : 'text-[#17324F]'
          }`}
        >
          SETU
        </span>
        {showTagline && (
          <span
            className={`text-xs sm:text-xs font-semibold leading-tight tracking-normal truncate mt-0.5 ${
              isDark ? 'text-slate-300' : 'text-[#526277]'
            }`}
          >
            Smart Emergency Response System
          </span>
        )}
      </div>
    </div>
  );
}
