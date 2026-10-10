import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

import {
  HeartHandshake,
  ShieldCheck,
  Users,
  Building2,
  FileText,
  Activity,
  ArrowRight,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Menu,
  X,
  Info,
  Send,
  Award,
  Sparkles
} from 'lucide-react';

import ApiService from '../services/api';
import SetuLogo from '../components/SetuLogo';

// ----------------------------------------------------------------------------
// Recovered Google Forms URLs from Original Codebase (Section 7)
// ----------------------------------------------------------------------------
const GOOGLE_FORMS = {
  need: "https://docs.google.com/forms/d/e/1FAIpQLSfpOTtIUbv4g216ME419DG_BqF_PCS1chJ0es47HRbkznNA1g/viewform",
  volunteer: "https://docs.google.com/forms/d/e/1FAIpQLSclY6jrgE1n3PmEiBQuTwO8o5Ew9QuOrN3_zyTnDLEUbpladw/viewform",
  ngo: "https://docs.google.com/forms/d/e/1FAIpQLSeGRTbtKLqkpfPfiOwpugNvznyA8wNA6Hpkey8RxSYy9PKclA/viewform",
};

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [stats, setStats] = useState({
    total_volunteers: 0,
    total_needs: 0,
    total_ngos: 0,
  });
  const [statsMode, setStatsMode] = useState('loading'); // 'live' | 'mock' | 'unavailable' | 'loading'
  const [heroImgError, setHeroImgError] = useState(false);
  const [impactImgError, setImpactImgError] = useState(false);

  useEffect(() => {
    async function loadStats() {
      try {
        const res = await ApiService.getCommunityStats();
        if (res.ok && res.data) {
          setStats(res.data);
          setStatsMode(res.mode);
        } else {
          setStatsMode('unavailable');
        }
      } catch {
        setStatsMode('unavailable');
      }
    }
    loadStats();
  }, []);

  return (
    <div className="min-h-screen bg-[#F7F9FC] text-[#17324F] font-sans selection:bg-teal-100 selection:text-teal-900 flex flex-col">
      
      {/* ==================================================================== */}
      {/* 1. NAVBAR — Refined Spacing, Brand Lockup & Single-Row Desktop Flow  */}
      {/* ==================================================================== */}
      <header className="bg-white border-b border-[#E1E8F0] sticky top-0 z-50 shadow-xs">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 xl:px-12 h-20 flex items-center justify-between gap-4">
          
          {/* Brand Lockup: Bridge-and-Handshake Icon + SETU Wordmark (~200-240px wide) */}
          <div className="w-[210px] sm:w-[230px] shrink-0">
            <Link
              to="/"
              className="inline-block focus:outline-none focus:ring-2 focus:ring-[#16877F] rounded-lg"
              aria-label="SETU Home"
            >
              <SetuLogo variant="light" iconSize={42} />
            </Link>
          </div>

          {/* Desktop Navigation Links (Center Group, Natural Widths, 24-32px Gaps) */}
          <nav
            className="hidden lg:flex items-center justify-center gap-6 xl:gap-8 text-sm xl:text-base font-semibold text-[#526277]"
            aria-label="Primary Navigation"
          >
            <a
              href="#about"
              className="hover:text-[#16877F] transition whitespace-nowrap"
            >
              About
            </a>
            <a
              href="#how-it-works"
              className="hover:text-[#16877F] transition whitespace-nowrap"
            >
              How It Works
            </a>
            <a
              href="#participate"
              className="hover:text-[#16877F] transition whitespace-nowrap"
            >
              Participate
            </a>
            <a
              href="#impact"
              className="hover:text-[#16877F] transition whitespace-nowrap"
            >
              Impact
            </a>
            <a
              href="#contact"
              className="hover:text-[#16877F] transition whitespace-nowrap"
            >
              Contact
            </a>
          </nav>

          {/* Right Action CTAs: Report a Need, NGO Dashboard & Volunteer Dashboard */}
          <div className="hidden sm:flex items-center gap-2.5 shrink-0">
            <a
              href={GOOGLE_FORMS.need}
              target="_blank"
              rel="noopener noreferrer"
              className="h-10 px-3.5 bg-red-700 hover:bg-red-800 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition flex items-center gap-1.5 focus:ring-4 focus:ring-red-200 whitespace-nowrap"
            >
              <span>Report Need</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-85" />
            </a>

            <Link
              to="/ngo-dashboard"
              className="h-10 px-3.5 bg-[#17324F] hover:bg-[#0E2338] text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition flex items-center gap-1.5 border border-[#17324F] whitespace-nowrap"
            >
              <Building2 className="w-3.5 h-3.5 text-teal-400" />
              <span>NGO Depot</span>
            </Link>

            <Link
              to="/volunteer-dashboard"
              className="h-10 px-3.5 bg-[#16877F] hover:bg-teal-800 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition flex items-center gap-1.5 whitespace-nowrap"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Volunteer Hub</span>
            </Link>
          </div>

          {/* Mobile Hamburger Menu Toggle Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2.5 rounded-lg border border-[#E1E8F0] text-[#17324F] hover:bg-slate-100 transition"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>

        </div>

        {/* Responsive Mobile Drawer Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-white border-b border-[#E1E8F0] px-6 pt-3 pb-6 space-y-4 shadow-lg">
            <nav className="flex flex-col gap-1.5 text-base font-semibold text-[#17324F]">
              <a
                href="#about"
                onClick={() => setMobileMenuOpen(false)}
                className="py-2.5 px-3 rounded-lg hover:bg-slate-100 transition"
              >
                About
              </a>
              <a
                href="#how-it-works"
                onClick={() => setMobileMenuOpen(false)}
                className="py-2.5 px-3 rounded-lg hover:bg-slate-100 transition"
              >
                How It Works
              </a>
              <a
                href="#participate"
                onClick={() => setMobileMenuOpen(false)}
                className="py-2.5 px-3 rounded-lg hover:bg-slate-100 transition"
              >
                Participate
              </a>
              <a
                href="#impact"
                onClick={() => setMobileMenuOpen(false)}
                className="py-2.5 px-3 rounded-lg hover:bg-slate-100 transition"
              >
                Impact
              </a>
              <a
                href="#contact"
                onClick={() => setMobileMenuOpen(false)}
                className="py-2.5 px-3 rounded-lg hover:bg-slate-100 transition"
              >
                Contact
              </a>
            </nav>

            <div className="pt-3 border-t border-[#E1E8F0] flex flex-col gap-2.5">
              <a
                href={GOOGLE_FORMS.need}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full min-h-[44px] px-4 py-2.5 bg-red-700 hover:bg-red-800 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-xs transition"
              >
                <span>Report an Emergency</span>
                <ExternalLink className="w-4 h-4" />
              </a>

              <Link
                to="/ngo-dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full min-h-[44px] px-4 py-2.5 bg-[#17324F] hover:bg-[#0E2338] text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-xs transition"
              >
                <Building2 className="w-4 h-4 text-teal-400" />
                <span>NGO Dashboard</span>
              </Link>

              <Link
                to="/volunteer-dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full min-h-[44px] px-4 py-2.5 bg-[#16877F] hover:bg-teal-800 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-xs transition"
              >
                <Users className="w-4 h-4" />
                <span>Volunteer Dashboard</span>
              </Link>

              <Link
                to="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full min-h-[44px] px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-[#17324F] font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition"
              >
                <span>Coordinator Operations</span>
                <ArrowRight className="w-4 h-4 text-slate-500" />
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* ==================================================================== */}
      {/* 2. HERO SECTION — Natural Spacing (40-56px top padding) & Vertical Alignment */}
      {/* ==================================================================== */}
      <section
        id="hero"
        className="bg-white border-b border-[#E1E8F0] relative overflow-hidden scroll-mt-20"
      >
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 xl:px-12 pt-10 sm:pt-12 lg:pt-14 pb-12 sm:pb-16 lg:pb-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            
            {/* Left Column: Mission, Headline & Key CTAs */}
            <div className="lg:col-span-7 space-y-6">

              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold text-[#17324F] tracking-tight leading-[1.15]">
                When Help Is Needed, Every Connection Matters.
              </h1>

              <p className="text-lg sm:text-xl text-[#526277] leading-relaxed max-w-2xl font-normal">
                SETU brings emergency needs, relief organizations, and volunteers together through structured reporting, AI-assisted assessment, and coordinated disaster response.
              </p>

              {/* Three Primary Participation CTAs (>= 48px height) */}
              <div className="pt-1 flex flex-col sm:flex-row flex-wrap gap-3.5">
                
                {/* 1. Report a Need */}
                <a
                  href={GOOGLE_FORMS.need}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[48px] px-6 py-3.5 bg-red-700 hover:bg-red-800 text-white font-bold text-base rounded-xl shadow-xs hover:shadow-md transition flex items-center justify-center gap-2.5 focus:ring-4 focus:ring-red-200"
                >
                  <Send className="w-5 h-5" />
                  <span>Report a Need</span>
                  <ExternalLink className="w-4 h-4 opacity-75" />
                </a>

                {/* 2. Become a Volunteer */}
                <a
                  href={GOOGLE_FORMS.volunteer}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[48px] px-6 py-3.5 bg-[#16877F] hover:bg-teal-800 text-white font-bold text-base rounded-xl shadow-xs hover:shadow-md transition flex items-center justify-center gap-2.5 focus:ring-4 focus:ring-teal-200"
                >
                  <Users className="w-5 h-5" />
                  <span>Become a Volunteer</span>
                  <ExternalLink className="w-4 h-4 opacity-75" />
                </a>

                {/* 3. Register Your NGO */}
                <a
                  href={GOOGLE_FORMS.ngo}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[48px] px-6 py-3.5 bg-white hover:bg-slate-50 text-[#17324F] font-bold text-base rounded-xl border-2 border-slate-300 hover:border-slate-400 shadow-xs transition flex items-center justify-center gap-2.5 focus:ring-4 focus:ring-slate-200"
                >
                  <Building2 className="w-5 h-5 text-slate-700" />
                  <span>Register Your NGO</span>
                  <ExternalLink className="w-4 h-4 opacity-75" />
                </a>

              </div>

              {/* Role-Based Workspaces Quick Entry (Phase 2 Requirement) */}
              <div className="pt-2 bg-[#F7F9FC] border border-[#E1E8F0] p-4 rounded-2xl space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold uppercase tracking-wider text-[#16877F] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Role-Specific Operational Portals</span>
                  </span>
                  <span className="text-slate-500 font-medium hidden sm:inline">
                    Backend-Assigned Workflows
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-2.5">
                  <Link
                    to="/ngo-dashboard"
                    className="w-full sm:w-auto flex-1 min-h-[44px] px-4 py-2.5 bg-[#17324F] hover:bg-[#0E2338] text-white font-bold text-sm rounded-xl shadow-xs transition flex items-center justify-center gap-2"
                  >
                    <Building2 className="w-4 h-4 text-teal-400" />
                    <span>NGO Dashboard</span>
                  </Link>

                  <Link
                    to="/volunteer-dashboard"
                    className="w-full sm:w-auto flex-1 min-h-[44px] px-4 py-2.5 bg-[#16877F] hover:bg-teal-800 text-white font-bold text-sm rounded-xl shadow-xs transition flex items-center justify-center gap-2"
                  >
                    <Users className="w-4 h-4" />
                    <span>Volunteer Dashboard</span>
                  </Link>
                </div>

                <div className="text-xs text-[#526277] flex items-center justify-between pt-1 border-t border-slate-200/60">
                  <span>Coordinator triage and emergency intake:</span>
                  <Link
                    to="/dashboard"
                    className="text-[#16877F] hover:text-teal-900 underline font-bold flex items-center gap-1"
                  >
                    <span>Coordinator Dashboard</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>

            </div>

            {/* Right Column: Humanitarian Relief Photography (Vertically Centered) */}
            <div className="lg:col-span-5">
              <div className="rounded-2xl overflow-hidden border border-[#E1E8F0] shadow-lg bg-slate-100 relative group">
                {!heroImgError ? (
                  <img
                    src="https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?q=80&w=1200&auto=format&fit=crop"
                    alt="Volunteers and humanitarian workers distributing food and relief supplies to local families"
                    onError={() => setHeroImgError(true)}
                    className="w-full h-80 sm:h-96 object-cover object-center group-hover:scale-102 transition duration-500"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-80 sm:h-96 bg-slate-800 text-white flex flex-col items-center justify-center p-6 text-center">
                    <HeartHandshake className="w-16 h-16 text-teal-400 mb-3" />
                    <p className="text-lg font-bold">Community Relief in Action</p>
                    <p className="text-sm text-slate-300 max-w-xs mt-1">
                      Connecting on-ground volunteers with emergency needs across Bharat.
                    </p>
                  </div>
                )}
                
                {/* Photo Caption */}
                <div className="p-3.5 bg-slate-900/90 text-white text-xs sm:text-sm font-medium border-t border-slate-800">
                  <p className="leading-snug">
                    <strong>Relief In Action:</strong> Community responders delivering essential supplies and meals during regional emergency response.
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 3. ABOUT SETU SECTION                                                */}
      {/* ==================================================================== */}
      <section
        id="about"
        className="py-16 sm:py-20 border-b border-[#E1E8F0] bg-[#F7F9FC] scroll-mt-20"
      >
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 xl:px-12 space-y-12">
          
          <div className="max-w-3xl space-y-3">
            <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#16877F] bg-teal-50 px-3 py-1 rounded-full border border-teal-200 inline-block">
              Understanding the Problem
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#17324F] tracking-tight">
              Why Transparent Emergency Coordination Matters
            </h2>
            <p className="text-base sm:text-lg text-[#526277] leading-relaxed font-normal">
              During natural disasters and civil crises, emergency distress signals become scattered across phone hotlines, messaging channels, and social media. This fragmentation leads to overlooked remote hamlets, duplicated deliveries in easily reached zones, and exhausted ground volunteers.
            </p>
          </div>

          {/* Three Structural Pillars */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            <div className="bg-white p-6 sm:p-7 rounded-2xl border border-[#E1E8F0] shadow-xs space-y-3.5">
              <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center text-[#16877F] border border-teal-200">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-[#17324F]">
                1. Frictionless Intake
              </h3>
              <p className="text-sm sm:text-base text-[#526277] leading-relaxed">
                Affected citizens and village officers can report needs using standard Google Forms or web inputs, ensuring zero technological barriers for people of all ages.
              </p>
            </div>

            <div className="bg-white p-6 sm:p-7 rounded-2xl border border-[#E1E8F0] shadow-xs space-y-3.5">
              <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-[#B45309] border border-amber-200">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-[#17324F]">
                2. Transparent Verification
              </h3>
              <p className="text-sm sm:text-base text-[#526277] leading-relaxed">
                Raw descriptions are structured with category, quantity, and urgency. Trust checks detect duplicates and flag ambiguous reports for human coordinator review.
              </p>
            </div>

            <div className="bg-white p-6 sm:p-7 rounded-2xl border border-[#E1E8F0] shadow-xs space-y-3.5">
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-700 border border-blue-200">
                <Activity className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-[#17324F]">
                3. Coordinated Dispatch
              </h3>
              <p className="text-sm sm:text-base text-[#526277] leading-relaxed">
                Matches genuine needs with verified NGO capacity and certified volunteers within range, tracking every task until aid is delivered and verified on location.
              </p>
            </div>

          </div>

        </div>
      </section>

      {/* ==================================================================== */}
      {/* 4. HOW SETU WORKS (4 VISUAL STEPS)                                   */}
      {/* ==================================================================== */}
      <section
        id="how-it-works"
        className="py-16 sm:py-20 bg-white border-b border-[#E1E8F0] scroll-mt-20"
      >
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 xl:px-12 space-y-12">
          
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#16877F] bg-teal-50 px-3 py-1 rounded-full border border-teal-200 inline-block">
              Operational Workflow
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#17324F] tracking-tight">
              How SETU Works
            </h2>
            <p className="text-base sm:text-lg text-[#526277] leading-relaxed">
              From an incoming distress report to verified relief delivery on the ground in four clear steps.
            </p>
          </div>

          {/* Four Steps Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Step 1 */}
            <div className="bg-[#F7F9FC] rounded-2xl border border-[#E1E8F0] p-6 space-y-3 relative">
              <div className="w-10 h-10 rounded-full bg-[#17324F] text-white font-black text-lg flex items-center justify-center">
                1
              </div>
              <h3 className="text-lg font-bold text-[#17324F]">
                Report an Emergency Need
              </h3>
              <p className="text-sm text-[#526277] leading-relaxed">
                A citizen, family, or camp coordinator submits what supplies or medical assistance are needed via Google Forms or our web intake form.
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-[#F7F9FC] rounded-2xl border border-[#E1E8F0] p-6 space-y-3 relative">
              <div className="w-10 h-10 rounded-full bg-[#16877F] text-white font-black text-lg flex items-center justify-center">
                2
              </div>
              <h3 className="text-lg font-bold text-[#17324F]">
                Assess &amp; Verify Information
              </h3>
              <p className="text-sm text-[#526277] leading-relaxed">
                SETU structures the report with need type, volume, and urgency. It evaluates contact validity, checks for nearby duplicates, and calculates confidence.
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-[#F7F9FC] rounded-2xl border border-[#E1E8F0] p-6 space-y-3 relative">
              <div className="w-10 h-10 rounded-full bg-blue-700 text-white font-black text-lg flex items-center justify-center">
                3
              </div>
              <h3 className="text-lg font-bold text-[#17324F]">
                Match Help with Suitable Capacity
              </h3>
              <p className="text-sm text-[#526277] leading-relaxed">
                Coordinators match verified needs with available NGO relief inventories and dispatch nearby volunteers with matching skills.
              </p>
            </div>

            {/* Step 4 */}
            <div className="bg-[#F7F9FC] rounded-2xl border border-[#E1E8F0] p-6 space-y-3 relative">
              <div className="w-10 h-10 rounded-full bg-[#047857] text-white font-black text-lg flex items-center justify-center">
                4
              </div>
              <h3 className="text-lg font-bold text-[#17324F]">
                Track Response to Resolution
              </h3>
              <p className="text-sm text-[#526277] leading-relaxed">
                Responders accept assignments, confirm delivery on location, and mark tasks as resolved, keeping the entire team accountable.
              </p>
            </div>

          </div>

          {/* Caveat Banner (Mandatory Honesty Rule) */}
          <div className="bg-slate-50 rounded-xl p-4 border border-[#E1E8F0] text-xs sm:text-sm text-[#526277] flex items-start gap-3">
            <Info className="w-5 h-5 text-[#526277] shrink-0 mt-0.5" />
            <p>
              <strong>Important Public Service Note:</strong> AI-assisted classification organizes incoming information for human decision-makers. Emergency verification is an advisory score, and relief distribution is executed by human volunteers and registered NGOs based on available ground capacity.
            </p>
          </div>

        </div>
      </section>

      {/* ==================================================================== */}
      {/* 5. REDESIGNED "SETU IN NUMBERS" — Calm, Premium, Cohesive Light Look */}
      {/* ==================================================================== */}
      <section
        id="numbers"
        className="py-16 sm:py-20 bg-[#EEF4F6] border-b border-[#E1E8F0] scroll-mt-20"
      >
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 xl:px-12 space-y-10">
          
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#16877F] bg-white px-3 py-1 rounded-full border border-[#E1E8F0] inline-block shadow-2xs">
                Verified Metrics
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-[#17324F] tracking-tight mt-2">
                SETU in Numbers
              </h2>
              <p className="text-[#526277] text-base sm:text-lg mt-1 font-normal">
                Key participation metrics recorded across the SETU coordination backbone.
              </p>
            </div>

            {/* Small, Unobtrusive Telemetry Mode Indicator */}
            <div>
              {statsMode === 'live' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white text-emerald-800 border border-emerald-200 shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Live Database Telemetry</span>
                </span>
              ) : statsMode === 'mock' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white text-[#526277] border border-[#E1E8F0] shadow-2xs">
                  <Info className="w-3.5 h-3.5 text-[#16877F]" />
                  <span>Sample Demo Data (Offline Mode)</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white text-[#526277] border border-[#E1E8F0]">
                  <span>Telemetry Currently Unavailable</span>
                </span>
              )}
            </div>
          </div>

          {/* Three Metric Cards: Clean White, Equal Height, Uniform Navy Values & Teal Icons */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* 1. Registered Volunteers */}
            <div className="bg-white rounded-2xl border border-[#E1E8F0] p-6 sm:p-7 shadow-xs hover:shadow-sm transition flex flex-col justify-between h-full space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-4xl sm:text-5xl font-black text-[#17324F] tracking-tight">
                  {statsMode === 'unavailable' ? '—' : stats.total_volunteers}
                </span>
                <div className="w-12 h-12 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-[#16877F]">
                  <Users className="w-6 h-6" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#17324F]">
                  Registered Volunteers
                </h3>
                <p className="text-sm text-[#526277] leading-relaxed mt-1">
                  Trained citizens registered to assist with food distribution, first aid, and field logistics.
                </p>
              </div>
            </div>

            {/* 2. Reported Needs */}
            <div className="bg-white rounded-2xl border border-[#E1E8F0] p-6 sm:p-7 shadow-xs hover:shadow-sm transition flex flex-col justify-between h-full space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-4xl sm:text-5xl font-black text-[#17324F] tracking-tight">
                  {statsMode === 'unavailable' ? '—' : stats.total_needs}
                </span>
                <div className="w-12 h-12 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-[#16877F]">
                  <FileText className="w-6 h-6" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#17324F]">
                  Reported Needs
                </h3>
                <p className="text-sm text-[#526277] leading-relaxed mt-1">
                  Emergency supply and assistance requests processed through our intake and verification engine.
                </p>
              </div>
            </div>

            {/* 3. Registered NGOs */}
            <div className="bg-white rounded-2xl border border-[#E1E8F0] p-6 sm:p-7 shadow-xs hover:shadow-sm transition flex flex-col justify-between h-full space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-4xl sm:text-5xl font-black text-[#17324F] tracking-tight">
                  {statsMode === 'unavailable' ? '—' : stats.total_ngos}
                </span>
                <div className="w-12 h-12 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-[#16877F]">
                  <Building2 className="w-6 h-6" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#17324F]">
                  Registered NGOs
                </h3>
                <p className="text-sm text-[#526277] leading-relaxed mt-1">
                  Partner humanitarian organizations providing relief inventories and community shelter networks.
                </p>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* ==================================================================== */}
      {/* 6. PARTICIPATION SECTIONS (THE 3 RECOVERED GOOGLE FORMS)             */}
      {/* ==================================================================== */}
      <section
        id="participate"
        className="py-16 sm:py-20 bg-[#F7F9FC] border-b border-[#E1E8F0] scroll-mt-20"
      >
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 xl:px-12 space-y-12">
          
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#16877F] bg-teal-50 px-3 py-1 rounded-full border border-teal-200 inline-block">
              Get Involved
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#17324F] tracking-tight">
              How You Can Participate
            </h2>
            <p className="text-base sm:text-lg text-[#526277] leading-relaxed">
              Choose your path to submit an emergency report, offer volunteer assistance, or onboard your humanitarian organization.
            </p>
          </div>

          {/* Three Participation Action Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Card A: Report a Need */}
            <div className="bg-white rounded-2xl border border-red-200 hover:border-red-300 p-7 shadow-xs hover:shadow-sm transition space-y-5 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-xl bg-red-50 text-red-700 flex items-center justify-center border border-red-200">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-bold text-[#17324F]">
                  Someone Needs Help?
                </h3>
                <p className="text-base text-[#526277] leading-relaxed">
                  Tell us what support is needed, where it is needed, and how urgently help is required.
                </p>
              </div>

              <div>
                <a
                  href={GOOGLE_FORMS.need}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[48px] px-6 py-3 bg-red-700 hover:bg-red-800 text-white font-bold text-base rounded-xl transition shadow-xs flex items-center justify-center gap-2"
                >
                  <span>Report an Emergency</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
                <span className="text-xs text-slate-500 block text-center mt-2 font-medium">
                  Opens Verified Need Intake Google Form
                </span>
              </div>
            </div>

            {/* Card B: Become a Volunteer */}
            <div className="bg-white rounded-2xl border border-teal-200 hover:border-teal-300 p-7 shadow-xs hover:shadow-sm transition space-y-5 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-xl bg-teal-50 text-[#16877F] flex items-center justify-center border border-teal-200">
                  <Users className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-bold text-[#17324F]">
                  Be the Help Someone Needs
                </h3>
                <p className="text-base text-[#526277] leading-relaxed">
                  Register your skills and availability to help coordinate relief efforts in your district.
                </p>
              </div>

              <div>
                <a
                  href={GOOGLE_FORMS.volunteer}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[48px] px-6 py-3 bg-[#16877F] hover:bg-teal-800 text-white font-bold text-base rounded-xl transition shadow-xs flex items-center justify-center gap-2"
                >
                  <span>Register as a Volunteer</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
                <span className="text-xs text-slate-500 block text-center mt-2 font-medium">
                  Opens Volunteer Onboarding Google Form
                </span>
              </div>
            </div>

            {/* Card C: Register Your NGO */}
            <div className="bg-white rounded-2xl border border-[#E1E8F0] hover:border-slate-300 p-7 shadow-xs hover:shadow-sm transition space-y-5 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-xl bg-slate-100 text-[#17324F] flex items-center justify-center border border-[#E1E8F0]">
                  <Building2 className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-bold text-[#17324F]">
                  Bring Your Organization
                </h3>
                <p className="text-base text-[#526277] leading-relaxed">
                  Register your organization and share the relief resources and capacity you can provide.
                </p>
              </div>

              <div>
                <a
                  href={GOOGLE_FORMS.ngo}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[48px] px-6 py-3 bg-[#17324F] hover:bg-[#0E2338] text-white font-bold text-base rounded-xl transition shadow-xs flex items-center justify-center gap-2"
                >
                  <span>Register Your NGO</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
                <span className="text-xs text-slate-500 block text-center mt-2 font-medium">
                  Opens NGO Partner Google Form
                </span>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* ==================================================================== */}
      {/* 7. COMMUNITY IMPACT SECTION                                          */}
      {/* ==================================================================== */}
      <section
        id="impact"
        className="py-16 sm:py-20 bg-white border-b border-[#E1E8F0] scroll-mt-20"
      >
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 xl:px-12 space-y-12">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            
            {/* Left: Authentic Community Relief Photograph */}
            <div className="lg:col-span-5 order-2 lg:order-1">
              <div className="rounded-2xl overflow-hidden border border-[#E1E8F0] shadow-lg bg-slate-100 relative group">
                {!impactImgError ? (
                  <img
                    src="https://images.unsplash.com/photo-1593113598332-cd288d649433?q=80&w=1200&auto=format&fit=crop"
                    alt="Volunteers organizing emergency relief packages with non-perishable goods and drinking water"
                    onError={() => setImpactImgError(true)}
                    className="w-full h-80 sm:h-96 object-cover object-center group-hover:scale-102 transition duration-500"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-80 sm:h-96 bg-slate-800 text-white flex flex-col items-center justify-center p-6 text-center">
                    <Building2 className="w-16 h-16 text-teal-400 mb-3" />
                    <p className="text-lg font-bold">Relief Logistics Packaging</p>
                    <p className="text-sm text-slate-300 max-w-xs mt-1">
                      Coordinating warehouses and volunteers to deliver vital supplies.
                    </p>
                  </div>
                )}
                
                <div className="p-3.5 bg-slate-900/90 text-white text-xs sm:text-sm font-medium border-t border-slate-800">
                  <p className="leading-snug">
                    <strong>Coordinated Logistics:</strong> Humanitarian organizations packaging verified rations for targeted neighborhood distribution.
                  </p>
                </div>
              </div>
            </div>

            {/* Right: The Purpose and 3 Benefits */}
            <div className="lg:col-span-7 space-y-6 order-1 lg:order-2">
              <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#16877F] bg-teal-50 px-3 py-1 rounded-full border border-teal-200 inline-block">
                Social Impact
              </span>

              <h2 className="text-3xl sm:text-4xl font-extrabold text-[#17324F] tracking-tight">
                Better Coordination. More Meaningful Help.
              </h2>

              <p className="text-base sm:text-lg text-[#526277] leading-relaxed">
                When disaster strikes, goodwill is abundant—but coordination is scarce. SETU ensures that volunteer energy and NGO supplies are deployed where they make the most meaningful difference, eliminating waste and keeping responders focused.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="p-4 rounded-xl bg-[#F7F9FC] border border-[#E1E8F0] space-y-1">
                  <CheckCircle2 className="w-5 h-5 text-[#047857]" />
                  <h4 className="font-bold text-[#17324F] text-base">Easier Reporting</h4>
                  <p className="text-xs text-[#526277]">Accessible forms remove technical hurdles for all citizens.</p>
                </div>

                <div className="p-4 rounded-xl bg-[#F7F9FC] border border-[#E1E8F0] space-y-1">
                  <CheckCircle2 className="w-5 h-5 text-[#16877F]" />
                  <h4 className="font-bold text-[#17324F] text-base">Clearer Coordination</h4>
                  <p className="text-xs text-[#526277]">Eliminates double-dispatch and confusion across agencies.</p>
                </div>

                <div className="p-4 rounded-xl bg-[#F7F9FC] border border-[#E1E8F0] space-y-1">
                  <CheckCircle2 className="w-5 h-5 text-blue-700" />
                  <h4 className="font-bold text-[#17324F] text-base">Transparent Tracking</h4>
                  <p className="text-xs text-[#526277]">Verifiable status from initial distress call to resolution.</p>
                </div>
              </div>

            </div>

          </div>

        </div>
      </section>

      {/* ==================================================================== */}
      {/* 8. CALL TO ACTION BANNER FOR COORDINATORS                            */}
      {/* ==================================================================== */}
      <section className="bg-[#17324F] text-white py-12 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 xl:px-12 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-1 text-center sm:text-left">
            <h3 className="text-2xl font-bold text-white">
              Ready to coordinate active operations?
            </h3>
            <p className="text-slate-300 text-sm sm:text-base">
              Access the live emergency feed, assign responders, and mark fulfilled cases as resolved.
            </p>
          </div>

          <Link
            to="/dashboard"
            className="min-h-[48px] px-7 py-3 bg-[#16877F] hover:bg-teal-700 active:bg-teal-800 text-white font-bold text-base rounded-xl shadow-lg transition flex items-center gap-2 shrink-0"
          >
            <span>Open Coordinator Dashboard</span>
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 9. FOOTER — Featuring the Bridge-and-Handshake SETU Logo Mark        */}
      {/* ==================================================================== */}
      <footer
        id="contact"
        className="bg-[#0F2236] text-slate-300 py-12 text-sm border-t-4 border-[#16877F] scroll-mt-20"
      >
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 xl:px-12 space-y-8">
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            
            {/* Col 1: Brand & Mission */}
            <div className="space-y-3 md:col-span-2">
              <Link to="/" className="inline-block focus:outline-none focus:ring-2 focus:ring-[#16877F] rounded-lg">
                <SetuLogo variant="dark" iconSize={42} />
              </Link>
              <p className="text-sm text-slate-300 leading-relaxed max-w-md mt-2">
                An open-architecture disaster response platform connecting distress reports with verified relief organizations and responders across Bharat.
              </p>
              <div className="pt-1 flex items-center gap-2 text-xs text-teal-300 font-semibold">
                <Award className="w-4 h-4" />
                <span>Engineered for Built with Bharat 4.0 Hackathon Competition</span>
              </div>
            </div>

            {/* Col 2: Platform Sections */}
            <div className="space-y-2.5">
              <h4 className="font-bold text-white uppercase text-xs tracking-wider">
                Platform Sections
              </h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#hero" className="hover:text-white transition">Home</a></li>
                <li><a href="#about" className="hover:text-white transition">About</a></li>
                <li><a href="#how-it-works" className="hover:text-white transition">How It Works</a></li>
                <li><a href="#participate" className="hover:text-white transition">Participate</a></li>
                <li><a href="#numbers" className="hover:text-white transition">SETU in Numbers</a></li>
                <li><a href="#impact" className="hover:text-white transition">Impact</a></li>
                <li>
                  <Link
                    to="/ngo-dashboard"
                    className="text-teal-300 hover:text-white font-bold flex items-center gap-1 transition"
                  >
                    <span>NGO Dashboard</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </li>
                <li>
                  <Link
                    to="/volunteer-dashboard"
                    className="text-teal-300 hover:text-white font-bold flex items-center gap-1 transition"
                  >
                    <span>Volunteer Dashboard</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </li>
                <li>
                  <Link
                    to="/dashboard"
                    className="text-slate-400 hover:text-white font-semibold flex items-center gap-1 transition"
                  >
                    <span>Coordinator Dashboard</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </li>
              </ul>
            </div>

            {/* Col 3: Participation Forms */}
            <div className="space-y-2.5">
              <h4 className="font-bold text-white uppercase text-xs tracking-wider">
                Google Forms Participation
              </h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a
                    href={GOOGLE_FORMS.need}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-white transition flex items-center gap-1 text-red-300"
                  >
                    <span>Need Intake Form</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </li>
                <li>
                  <a
                    href={GOOGLE_FORMS.volunteer}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-white transition flex items-center gap-1 text-teal-300"
                  >
                    <span>Volunteer Registration</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </li>
                <li>
                  <a
                    href={GOOGLE_FORMS.ngo}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-white transition flex items-center gap-1"
                  >
                    <span>NGO Registration</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </li>
              </ul>
            </div>

          </div>

          {/* Copyright & Technical Subtext */}
          <div className="pt-6 border-t border-slate-700/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
            <p>
              © 2026 SETU Response Platform — Team Build 4.0. All participation links verified against official integration triggers.
            </p>
            <div className="flex items-center gap-3">
              <span className="font-mono">Branch: feature/abhijeet-frontend</span>
              <span>•</span>
              <span>React 18 + Vite</span>
            </div>
          </div>

        </div>
      </footer>

    </div>
  );
}
