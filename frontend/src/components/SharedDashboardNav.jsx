import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  Users,
  User,
  ExternalLink,
  Menu,
  X
} from 'lucide-react';
import SetuLogo from './SetuLogo';

/**
 * SharedDashboardNav
 * Unified navigation header shared between:
 * - NGO Resource Depot (/ngo-dashboard)
 * - Volunteer Field Hub (/volunteer-dashboard)
 * - Volunteer Profile (/volunteer-profile)
 *
 * Ensures 100% identical dimensions (h-18 sm:h-20), max-w-7xl margin anchoring,
 * brand lockup, typography, mobile drawer behavior, and mode controls across operational portals.
 */
export default function SharedDashboardNav({
  currentRole = 'ngo', // 'ngo' | 'volunteer'
  systemMode = 'mock', // 'live' | 'mock'
  onToggleSystemMode,
  actors = [], // List of NGOs or Volunteers
  selectedActorId = '',
  onSelectActor = () => {},
  actorLabel = 'Select Profile',
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isVolunteer = currentRole === 'volunteer';

  return (
    <header className="bg-white border-b border-[#D5E0EB] sticky top-0 z-40 shadow-xs">
      {/* Primary Top Bar (Desktop 76-80px height: h-18 sm:h-20) */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 sm:h-20 flex items-center justify-between gap-4">
        
        {/* LEFT: Brand Lockup & Role Badge */}
        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
          <Link
            to="/"
            className="focus:outline-none focus:ring-2 focus:ring-[#16877F] rounded-lg inline-flex items-center"
            aria-label="SETU Home"
          >
            <SetuLogo variant="light" iconSize={38} showTagline={true} />
          </Link>

          <div className="hidden sm:block h-6 w-px bg-[#D5E0EB]" />

          {/* Compact Role Badge */}
          <span className="hidden sm:inline-flex px-2.5 py-1 bg-teal-50 text-[#16877F] text-xs font-bold uppercase tracking-wider rounded-md border border-teal-200 shrink-0">
            {isVolunteer ? 'FIELD RESPONDER' : 'NGO WORKSPACE'}
          </span>
        </div>

        {/* RIGHT: Desktop Controls */}
        <div className="hidden md:flex items-center gap-2.5 lg:gap-3">
          
          {/* Active Profile / Actor Selector Dropdown */}
          {actors.length > 0 && (
            <div className="flex items-center gap-2 bg-[#F8FAFC] border border-[#D5E0EB] rounded-xl px-3 py-1.5 text-xs sm:text-sm">
              {isVolunteer ? (
                <Users className="w-4 h-4 text-[#16877F] shrink-0" />
              ) : (
                <Building2 className="w-4 h-4 text-[#16877F] shrink-0" />
              )}
              <label htmlFor="shared-actor-select" className="sr-only">
                {actorLabel}
              </label>
              <select
                id="shared-actor-select"
                value={selectedActorId}
                onChange={(e) => onSelectActor(e.target.value)}
                className="bg-transparent font-semibold text-[#17324F] focus:outline-none cursor-pointer max-w-[150px] lg:max-w-none truncate"
              >
                {actors.map((actor) => (
                  <option key={actor.id} value={actor.id}>
                    {actor.name} ({actor.id})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Mode Switcher (Demo Sandbox vs Live API) */}
          {onToggleSystemMode && (
            <button
              type="button"
              onClick={onToggleSystemMode}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 border transition ${
                systemMode === 'mock'
                  ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                  : 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100'
              }`}
              title="Click to toggle between Demo Sandbox and Live API"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  systemMode === 'mock' ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'
                }`}
              />
              <span className="hidden lg:inline">
                {systemMode === 'mock' ? 'Demo Sandbox' : 'Live API'}
              </span>
              <span className="lg:hidden">
                {systemMode === 'mock' ? 'Demo' : 'Live'}
              </span>
            </button>
          )}

          {/* Dedicated My Profile Link for Volunteer */}
          {isVolunteer && (
            <Link
              to={selectedActorId ? `/volunteer-profile?id=${selectedActorId}` : '/volunteer-profile'}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-[#17324F] hover:bg-slate-100 rounded-lg transition"
            >
              <User className="w-3.5 h-3.5 text-teal-700" />
              <span>My Profile</span>
            </Link>
          )}

          {/* Counterpart Portal Navigation */}
          {isVolunteer ? (
            <Link
              to="/ngo-dashboard"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-[#17324F] hover:bg-slate-100 rounded-lg transition"
            >
              <Building2 className="w-3.5 h-3.5 text-slate-500" />
              <span>NGO View</span>
            </Link>
          ) : (
            <Link
              to="/volunteer-dashboard"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-[#17324F] hover:bg-slate-100 rounded-lg transition"
            >
              <Users className="w-3.5 h-3.5 text-slate-500" />
              <span>Volunteer View</span>
            </Link>
          )}

          {/* Public Website Link */}
          <Link
            to="/"
            className="text-xs font-semibold text-[#16877F] hover:underline hidden lg:inline"
          >
            Public Site
          </Link>
        </div>

        {/* Mobile Controls & Hamburger Menu */}
        <div className="flex md:hidden items-center gap-2">
          {actors.length > 0 && (
            <select
              value={selectedActorId}
              onChange={(e) => onSelectActor(e.target.value)}
              className="bg-[#F8FAFC] border border-[#D5E0EB] rounded-lg px-2 py-1 text-xs font-bold text-[#17324F] max-w-[125px] truncate focus:outline-none"
              aria-label={actorLabel}
            >
              {actors.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.name}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg text-slate-700 hover:bg-slate-100 transition border border-[#D5E0EB]"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

      </div>

      {/* Responsive Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-[#D5E0EB] bg-white px-4 py-4 space-y-3 shadow-xl animate-in slide-in-from-top duration-200">
          
          {/* Volunteer Profile Mobile Action */}
          {isVolunteer && (
            <Link
              to={selectedActorId ? `/volunteer-profile?id=${selectedActorId}` : '/volunteer-profile'}
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-between px-3.5 py-2.5 text-sm font-semibold text-[#17324F] bg-slate-50 rounded-xl border border-[#D5E0EB]"
            >
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-teal-700" />
                <span>My Responder Profile</span>
              </div>
              <span className="text-xs font-normal text-slate-400">View &rarr;</span>
            </Link>
          )}

          {/* Quick Portal Switcher */}
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#526277]">
              Switch Portal
            </span>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Link
                to="/ngo-dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold border transition ${
                  !isVolunteer
                    ? 'bg-[#17324F] text-white border-[#17324F]'
                    : 'bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>NGO Depot</span>
              </Link>

              <Link
                to="/volunteer-dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold border transition ${
                  isVolunteer
                    ? 'bg-[#17324F] text-white border-[#17324F]'
                    : 'bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Volunteer Hub</span>
              </Link>
            </div>
          </div>

          {/* Mode Switch in Mobile Menu */}
          {onToggleSystemMode && (
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-[#526277] font-medium">Backend Data Source</span>
              <button
                type="button"
                onClick={() => {
                  onToggleSystemMode();
                  setMobileMenuOpen(false);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 border ${
                  systemMode === 'mock'
                    ? 'bg-amber-50 text-amber-900 border-amber-300'
                    : 'bg-emerald-50 text-emerald-900 border-emerald-300'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    systemMode === 'mock' ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                />
                <span>{systemMode === 'mock' ? 'Demo Sandbox' : 'Live API'}</span>
              </button>
            </div>
          )}

          {/* Link to Public Website */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <Link
              to="/"
              onClick={() => setMobileMenuOpen(false)}
              className="text-xs font-bold text-[#16877F] hover:underline flex items-center gap-1 py-1"
            >
              <span>Public Site</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </Link>

            <Link
              to="/dashboard"
              onClick={() => setMobileMenuOpen(false)}
              className="text-xs font-semibold text-[#526277] hover:text-[#17324F]"
            >
              Coordinator Ops
            </Link>
          </div>

        </div>
      )}
    </header>
  );
}
