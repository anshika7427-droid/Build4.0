import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Building2,
  Users,
  ShieldAlert,
  Menu,
  X
} from 'lucide-react';
import SetuLogo from './SetuLogo';

/**
 * SetuNavbar
 * Unified, compact dark-navy header (height ~72-76px) used across all pages:
 * - Public Landing Page (/)
 * - Coordinator Dashboard (/dashboard)
 * - NGO Dashboard (/ngo-dashboard)
 * - Volunteer Dashboard (/volunteer-dashboard)
 * - Volunteer Profile (/volunteer-profile)
 * - Login Page (/login)
 *
 * Uses the canonical dark navy #17324F, high-contrast readable typography,
 * exactly 8 primary navigation destinations (About, How It Works, Participate,
 * Impact, Contact, NGO Depot, Volunteer Hub, Coordinator), and a clean responsive menu.
 */
export default function SetuNavbar({ activePage: _activePage = '' }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const currentPath = location.pathname;
  const isLanding = currentPath === '/';

  const getSectionHref = (anchor) => {
    return isLanding ? `#${anchor}` : `/#${anchor}`;
  };

  // Route-aware active item detection using exact matches and deliberate path prefixes.
  // Never uses substring matching to avoid false positives (e.g., '/dashboard' vs '/ngo-dashboard').
  const isNgoActive =
    currentPath === '/ngo-dashboard' ||
    currentPath.startsWith('/ngo-dashboard/');

  const isVolunteerDashboard =
    currentPath === '/volunteer-dashboard' ||
    currentPath.startsWith('/volunteer-dashboard/');

  const isVolunteerProfile =
    currentPath === '/volunteer-profile' ||
    currentPath.startsWith('/volunteer-profile/');

  const isVolunteerActive = isVolunteerDashboard || isVolunteerProfile;

  const isCoordinatorActive =
    currentPath === '/dashboard' ||
    currentPath.startsWith('/dashboard/');

  // Desktop action button styles:
  // - Active: Solid teal (#16877F), contrasting white text, subtle border
  // - Inactive: Subtle, slightly lighter navy background (bg-white/[0.04]) with thin, low-contrast border (border-white/10)
  // - Hover (inactive only): Soft translucent background (rgba(255, 255, 255, 0.08)), slightly brighter border (border-white/20), readable white text
  // - Keyboard Focus: Distinct, accessible focus outline without changing active route state
  const getButtonClass = (isActive) =>
    `h-9 px-3 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap border focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#17324F] ${
      isActive
        ? 'bg-[#16877F] text-white border-teal-400 font-bold shadow-xs hover:bg-[#147a73]'
        : 'bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 hover:text-white border-white/10 hover:border-white/20'
    }`;

  const getMobileButtonClass = (isActive) =>
    `w-full min-h-[40px] px-3.5 py-2 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
      isActive
        ? 'bg-[#16877F] text-white border-teal-400 font-bold shadow-xs hover:bg-[#147a73]'
        : 'bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 hover:text-white border-white/10 hover:border-white/20'
    }`;

  return (
    <header className="bg-[#17324F] text-white border-b border-slate-700/80 sticky top-0 z-50 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-[72px] sm:h-[76px] flex items-center justify-between gap-3 sm:gap-4 lg:gap-6">
        
        {/* Brand Lockup: Compact Bridge-and-Handshake Icon + SETU Wordmark */}
        <div className="shrink-0 flex items-center">
          <Link
            to="/"
            className="inline-flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 rounded-lg p-0.5"
            aria-label="SETU Home"
          >
            <SetuLogo variant="dark" iconSize={34} showTagline={true} />
          </Link>
        </div>

        {/* Desktop Center Navigation Links: About, How It Works, Participate, Impact, Contact */}
        <nav
          className="hidden lg:flex items-center justify-center gap-4 xl:gap-6 text-sm font-semibold text-slate-200"
          aria-label="Primary Navigation"
        >
          <a
            href={getSectionHref('about')}
            className="hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 rounded px-1 py-1 transition-colors whitespace-nowrap"
          >
            About
          </a>
          <a
            href={getSectionHref('how-it-works')}
            className="hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 rounded px-1 py-1 transition-colors whitespace-nowrap"
          >
            How It Works
          </a>
          <a
            href={getSectionHref('participate')}
            className="hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 rounded px-1 py-1 transition-colors whitespace-nowrap"
          >
            Participate
          </a>
          <a
            href={getSectionHref('impact')}
            className="hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 rounded px-1 py-1 transition-colors whitespace-nowrap"
          >
            Impact
          </a>
          <a
            href={getSectionHref('contact')}
            className="hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 rounded px-1 py-1 transition-colors whitespace-nowrap"
          >
            Contact
          </a>
        </nav>

        {/* Desktop Operational Action Buttons: NGO Depot, Volunteer Hub, Coordinator */}
        <div className="hidden sm:flex items-center gap-2 lg:gap-2.5 shrink-0">
          {/* NGO Depot */}
          <Link
            to="/ngo-dashboard"
            className={getButtonClass(isNgoActive)}
            aria-current={isNgoActive ? 'page' : undefined}
            title="NGO Depot Dashboard"
          >
            <Building2 className={`w-3.5 h-3.5 ${isNgoActive ? 'text-white' : 'text-slate-300'}`} />
            <span>NGO Depot</span>
          </Link>

          {/* Volunteer Hub */}
          <Link
            to="/volunteer-dashboard"
            className={getButtonClass(isVolunteerActive)}
            aria-current={isVolunteerActive ? 'page' : undefined}
            title={isVolunteerProfile ? 'Volunteer Hub (Profile View)' : 'Volunteer Hub'}
          >
            <Users className={`w-3.5 h-3.5 ${isVolunteerActive ? 'text-white' : 'text-slate-300'}`} />
            <span>Volunteer Hub</span>
            {isVolunteerProfile && (
              <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 text-white px-1.5 py-0.5 rounded ml-0.5">
                Profile
              </span>
            )}
          </Link>

          {/* Coordinator */}
          <Link
            to="/dashboard"
            className={getButtonClass(isCoordinatorActive)}
            aria-current={isCoordinatorActive ? 'page' : undefined}
            title="Coordinator Dashboard"
          >
            <ShieldAlert className={`w-3.5 h-3.5 ${isCoordinatorActive ? 'text-white' : 'text-slate-300'}`} />
            <span>Coordinator</span>
          </Link>
        </div>

        {/* Mobile Hamburger Menu Toggle Button */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="lg:hidden p-2 rounded-lg border border-slate-600 text-slate-200 hover:text-white hover:bg-white/[0.08] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          aria-label="Toggle navigation menu"
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>

      </div>

      {/* Responsive Mobile Drawer Menu (Dark Navy, High-Contrast) */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-[#17324F] border-b border-slate-700/80 px-4 sm:px-6 py-4 space-y-3 shadow-xl">
          <nav className="flex flex-col gap-1 text-sm font-semibold text-slate-200">
            <a
              href={getSectionHref('about')}
              onClick={() => setMobileMenuOpen(false)}
              className="py-2 px-3 rounded-lg hover:bg-white/[0.08] hover:text-white transition-colors"
            >
              About
            </a>
            <a
              href={getSectionHref('how-it-works')}
              onClick={() => setMobileMenuOpen(false)}
              className="py-2 px-3 rounded-lg hover:bg-white/[0.08] hover:text-white transition-colors"
            >
              How It Works
            </a>
            <a
              href={getSectionHref('participate')}
              onClick={() => setMobileMenuOpen(false)}
              className="py-2 px-3 rounded-lg hover:bg-white/[0.08] hover:text-white transition-colors"
            >
              Participate
            </a>
            <a
              href={getSectionHref('impact')}
              onClick={() => setMobileMenuOpen(false)}
              className="py-2 px-3 rounded-lg hover:bg-white/[0.08] hover:text-white transition-colors"
            >
              Impact
            </a>
            <a
              href={getSectionHref('contact')}
              onClick={() => setMobileMenuOpen(false)}
              className="py-2 px-3 rounded-lg hover:bg-white/[0.08] hover:text-white transition-colors"
            >
              Contact
            </a>
          </nav>

          <div className="pt-2.5 border-t border-slate-700 flex flex-col gap-2">
            <Link
              to="/ngo-dashboard"
              onClick={() => setMobileMenuOpen(false)}
              className={getMobileButtonClass(isNgoActive)}
              aria-current={isNgoActive ? 'page' : undefined}
            >
              <Building2 className={`w-4 h-4 ${isNgoActive ? 'text-white' : 'text-slate-300'}`} />
              <span>NGO Depot</span>
            </Link>

            <Link
              to="/volunteer-dashboard"
              onClick={() => setMobileMenuOpen(false)}
              className={getMobileButtonClass(isVolunteerActive)}
              aria-current={isVolunteerActive ? 'page' : undefined}
            >
              <Users className={`w-4 h-4 ${isVolunteerActive ? 'text-white' : 'text-slate-300'}`} />
              <span>Volunteer Hub</span>
              {isVolunteerProfile && (
                <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 text-white px-1.5 py-0.5 rounded ml-1">
                  Profile
                </span>
              )}
            </Link>

            <Link
              to="/dashboard"
              onClick={() => setMobileMenuOpen(false)}
              className={getMobileButtonClass(isCoordinatorActive)}
              aria-current={isCoordinatorActive ? 'page' : undefined}
            >
              <ShieldAlert className={`w-4 h-4 ${isCoordinatorActive ? 'text-white' : 'text-slate-300'}`} />
              <span>Coordinator Dashboard</span>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
