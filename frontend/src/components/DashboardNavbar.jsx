import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Menu,
  X,
  ExternalLink,
  ChevronDown
} from 'lucide-react';
import SetuLogo from './SetuLogo';

/**
 * Shared DashboardNavbar
 * Unified, polished light-theme navigation for both NGO and Volunteer Dashboards.
 * Follows SETU brand guidelines: Navy #17324F, Teal #16877F, Surface White #FFFFFF, Border #E1E8F0.
 */
export default function DashboardNavbar({
  roleBadge = 'NGO WORKSPACE', // 'NGO WORKSPACE' | 'FIELD RESPONDER'
  selectorIcon: SelectorIcon,
  selectorLabel = 'Switch Profile',
  selectorValue = '',
  selectorOptions = [],
  onSelectorChange = () => {},
  systemMode = 'mock',
  onToggleMode = () => {},
  otherDashboard = {
    to: '/volunteer-dashboard',
    label: 'Volunteer Hub',
    icon: null,
  },
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const OtherIcon = otherDashboard.icon;

  return (
    <header className="bg-white border-b border-[#E1E8F0] sticky top-0 z-40 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-3 sm:gap-4">
        
        {/* ================================================================== */}
        {/* LEFT: SETU Bridge Logo, Tagline & Role Badge                       */}
        {/* ================================================================== */}
        <div className="flex items-center gap-3 sm:gap-4 shrink-0 min-w-0">
          <Link
            to="/"
            className="focus:outline-none focus:ring-2 focus:ring-[#16877F] rounded-lg shrink-0"
            aria-label="SETU Public Home"
          >
            <SetuLogo variant="light" iconSize={40} showTagline={true} />
          </Link>

          <div className="hidden sm:block h-6 w-px bg-[#E1E8F0] shrink-0" />

          <div className="hidden sm:flex items-center shrink-0">
            <span className="px-2.5 py-1 bg-teal-50 text-[#16877F] text-[11px] font-extrabold uppercase tracking-wider rounded-md border border-teal-200 whitespace-nowrap">
              {roleBadge}
            </span>
          </div>
        </div>

        {/* ================================================================== */}
        {/* RIGHT (DESKTOP): Selector, Status, Cross-Link & Public Site        */}
        {/* ================================================================== */}
        <div className="hidden lg:flex items-center gap-3 shrink-0">
          {/* Profile Selector (NGO Depot / Volunteer) */}
          {selectorOptions.length > 0 && (
            <div className="flex items-center gap-2 bg-[#F7F9FC] border border-[#E1E8F0] hover:border-slate-300 rounded-xl px-3 py-1.5 text-xs sm:text-sm transition">
              {SelectorIcon && <SelectorIcon className="w-4 h-4 text-[#16877F] shrink-0" />}
              <label htmlFor="dashboard-profile-select" className="sr-only">
                {selectorLabel}
              </label>
              <div className="relative flex items-center">
                <select
                  id="dashboard-profile-select"
                  value={selectorValue}
                  onChange={(e) => onSelectorChange(e.target.value)}
                  className="bg-transparent font-bold text-[#17324F] focus:outline-none cursor-pointer pr-5 appearance-none text-xs sm:text-sm"
                >
                  {selectorOptions.map((opt) => (
                    <option key={opt.id} value={opt.id} className="text-[#17324F]">
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-0 pointer-events-none" />
              </div>
            </div>
          )}

          {/* Live vs Demo Mode Toggle */}
          <button
            type="button"
            onClick={onToggleMode}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 border transition shadow-xs ${
              systemMode === 'mock'
                ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                : 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100'
            }`}
            title="Toggle between Demo Mode and Live FastAPI Backend"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                systemMode === 'mock' ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
            />
            <span>{systemMode === 'mock' ? 'Demo Mode' : 'Live Mode'}</span>
          </button>

          {/* Cross-Link to Partner Dashboard */}
          {otherDashboard && otherDashboard.to && (
            <Link
              to={otherDashboard.to}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#526277] hover:text-[#17324F] hover:bg-slate-100 rounded-xl transition border border-transparent hover:border-[#E1E8F0]"
            >
              {OtherIcon && <OtherIcon className="w-3.5 h-3.5 text-[#16877F]" />}
              <span>{otherDashboard.label}</span>
            </Link>
          )}

          {/* Public Site Link */}
          <Link
            to="/"
            className="text-xs font-bold text-[#16877F] hover:text-teal-900 hover:bg-teal-50 px-2.5 py-1.5 rounded-lg transition"
          >
            Public Site
          </Link>
        </div>

        {/* ================================================================== */}
        {/* MOBILE HAMBURGER BUTTON (Below lg breakpoint)                      */}
        {/* ================================================================== */}
        <div className="flex items-center gap-2 lg:hidden">
          {/* Quick compact mode indicator on mobile */}
          <button
            type="button"
            onClick={onToggleMode}
            className={`px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 border ${
              systemMode === 'mock'
                ? 'bg-amber-50 text-amber-900 border-amber-300'
                : 'bg-emerald-50 text-emerald-900 border-emerald-300'
            }`}
            title="Toggle system mode"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                systemMode === 'mock' ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
            />
            <span>{systemMode === 'mock' ? 'Demo' : 'Live'}</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-xl border border-[#E1E8F0] text-[#17324F] hover:bg-slate-100 transition"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

      </div>

      {/* ==================================================================== */}
      {/* MOBILE COLLAPSIBLE DRAWER                                            */}
      {/* ==================================================================== */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white border-b border-[#E1E8F0] px-4 py-4 space-y-3.5 shadow-lg animate-slide-down">
          {/* Role Badge in Mobile Menu */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <span className="text-xs text-[#526277] font-semibold">Active Workspace</span>
            <span className="px-2.5 py-0.5 bg-teal-50 text-[#16877F] text-xs font-bold uppercase tracking-wider rounded border border-teal-200">
              {roleBadge}
            </span>
          </div>

          {/* Profile Switcher */}
          {selectorOptions.length > 0 && (
            <div className="space-y-1">
              <label htmlFor="mobile-profile-select" className="text-xs font-bold text-slate-600 block">
                {selectorLabel}
              </label>
              <div className="flex items-center gap-2 bg-[#F7F9FC] border border-[#E1E8F0] rounded-xl px-3 py-2 text-sm">
                {SelectorIcon && <SelectorIcon className="w-4 h-4 text-[#16877F] shrink-0" />}
                <select
                  id="mobile-profile-select"
                  value={selectorValue}
                  onChange={(e) => {
                    onSelectorChange(e.target.value);
                    setMobileMenuOpen(false);
                  }}
                  className="bg-transparent font-bold text-[#17324F] w-full focus:outline-none cursor-pointer text-sm"
                >
                  {selectorOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Actions & Links */}
          <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
            {otherDashboard && otherDashboard.to && (
              <Link
                to={otherDashboard.to}
                onClick={() => setMobileMenuOpen(false)}
                className="w-full py-2.5 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-[#17324F] font-bold text-sm flex items-center justify-between transition border border-[#E1E8F0]"
              >
                <div className="flex items-center gap-2">
                  {OtherIcon && <OtherIcon className="w-4 h-4 text-[#16877F]" />}
                  <span>Switch to {otherDashboard.label}</span>
                </div>
                <span className="text-xs text-slate-400">→</span>
              </Link>
            )}

            <Link
              to="/dashboard"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full py-2.5 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-[#17324F] font-bold text-sm flex items-center justify-between transition border border-[#E1E8F0]"
            >
              <span>Coordinator Operations</span>
              <span className="text-xs text-slate-400">→</span>
            </Link>

            <Link
              to="/"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full py-2.5 px-3 rounded-xl bg-teal-50 hover:bg-teal-100 text-[#16877F] font-bold text-sm flex items-center justify-between transition border border-teal-200"
            >
              <span>Return to Public Website</span>
              <ExternalLink className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
