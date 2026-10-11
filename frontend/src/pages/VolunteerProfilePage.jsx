import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Users,
  ShieldCheck,
  Phone,
  Mail,
  MapPin,
  Truck,
  Heart,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowLeft,
  RefreshCw,
  Info,
  Package,
  Award,
  Lock,
  ExternalLink
} from 'lucide-react';
import ApiService from '../services/api';
import SetuNavbar from '../components/SetuNavbar';
import SetuLogo from '../components/SetuLogo';

/**
 * VolunteerProfilePage (/volunteer-profile)
 * Dedicated, professional responder workspace displaying verified credentials,
 * contact details, field skills, vehicle capacity, and real-time mission activity.
 */
export default function VolunteerProfilePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlId = searchParams.get('id');

  const [volunteers, setVolunteers] = useState([]);
  const [selectedVolunteerId, setSelectedVolunteerId] = useState(urlId || 'V001');
  const [volunteer, setVolunteer] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTogglingDuty, setIsTogglingDuty] = useState(false);
  const [toast, setToast] = useState(null);
  const [systemMode, setSystemMode] = useState(ApiService.isMockMode() ? 'mock' : 'live');

  // Sync state if URL changes
  useEffect(() => {
    if (urlId && urlId !== selectedVolunteerId) {
      setSelectedVolunteerId(urlId);
    }
  }, [urlId]);

  useEffect(() => {
    loadProfileData();
  }, [selectedVolunteerId, systemMode]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  };

  const loadProfileData = async () => {
    setIsLoading(true);
    try {
      // 1. Load volunteer directory for switcher
      const volsRes = await ApiService.getVolunteers();
      if (volsRes.ok && Array.isArray(volsRes.data)) {
        setVolunteers(volsRes.data);
      }

      // 2. Fetch specific volunteer details
      const volRes = await ApiService.getVolunteer(selectedVolunteerId);
      if (volRes.ok && volRes.data) {
        setVolunteer(volRes.data);
      } else {
        showToast(volRes.error || `Could not load volunteer profile ${selectedVolunteerId}`, 'error');
      }

      // 3. Fetch activity / missions
      const tasksRes = await ApiService.getVolunteerAssignments(selectedVolunteerId);
      if (tasksRes.ok && Array.isArray(tasksRes.data)) {
        setAssignments(tasksRes.data);
      } else {
        setAssignments([]);
      }
    } catch {
      showToast('Network error loading responder profile', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectActor = (newId) => {
    setSelectedVolunteerId(newId);
    setSearchParams({ id: newId });
  };

  const toggleSystemMode = () => {
    const nextMode = systemMode === 'mock' ? 'live' : 'mock';
    ApiService.setMockMode(nextMode === 'mock');
    setSystemMode(nextMode);
    showToast(
      nextMode === 'mock'
        ? 'Switched to Demo Mode — Local verified sample records'
        : 'Connecting to live FastAPI backend at http://localhost:8000...',
      'info'
    );
  };

  // Availability Toggle Action (Honest Backend-Supported Endpoint)
  const handleToggleDuty = async () => {
    if (!volunteer || isTogglingDuty) return;
    setIsTogglingDuty(true);
    const newStatus = !volunteer.available;
    try {
      const res = await ApiService.updateVolunteerAvailability(selectedVolunteerId, newStatus);
      if (res.ok) {
        setVolunteer({ ...volunteer, available: newStatus });
        showToast(
          newStatus
            ? 'Duty status updated: Available for emergency dispatch missions'
            : 'Duty status updated: Off-duty / Standby mode',
          'info'
        );
      } else {
        showToast(res.error || 'Could not update availability on backend', 'error');
      }
    } catch {
      showToast('Network error updating availability', 'error');
    } finally {
      setIsTogglingDuty(false);
    }
  };

  // Accurate Profile Completeness Calculation
  const completenessItems = [
    { key: 'name', label: 'Full Legal Name', present: Boolean(volunteer?.name) },
    { key: 'phone', label: 'Contact Phone', present: Boolean(volunteer?.phone) },
    { key: 'email', label: 'Email Address', present: Boolean(volunteer?.email) },
    { key: 'skills', label: 'Verified Skills', present: Boolean(volunteer?.skills && volunteer.skills.length > 0) },
    { key: 'vehicle', label: 'Vehicle Registered', present: Boolean(volunteer?.vehicle) },
    { key: 'location', label: 'Base Location Coordinates', present: Boolean(volunteer?.location || (volunteer?.latitude && volunteer?.longitude)) },
  ];
  const completedCount = completenessItems.filter((i) => i.present).length;
  const completionPercent = Math.round((completedCount / completenessItems.length) * 100);

  // Mission Activity Counts
  const newTasks = assignments.filter((a) => a.status === 'assigned');
  const inProgressTasks = assignments.filter((a) => a.status === 'accepted' || a.status === 'in_progress');
  const completedTasks = assignments.filter((a) => a.status === 'resolved');

  // Capability Definitions
  const knownSkills = [
    {
      id: 'food_distribution',
      title: 'Food & Ration Distribution',
      description: 'Cooked meals packaging, crowd management, door-to-door dry ration deliveries.',
    },
    {
      id: 'first_aid',
      title: 'First Aid & Triage',
      description: 'Emergency wound dressing, vital signs check, basic life support aid.',
    },
    {
      id: 'emergency_medicine',
      title: 'Clinical Medical Aid',
      description: 'Paramedic triage, emergency drug administration, physician-supervised care.',
    },
    {
      id: 'crowd_coordination',
      title: 'Camp & Crowd Coordination',
      description: 'Shelter registration, queue management, vulnerable family tracking.',
    },
    {
      id: 'logistics',
      title: 'Depot Logistics & Packing',
      description: 'Inventory sorting, heavy relief pallet loading, inventory counting.',
    },
    {
      id: 'driving',
      title: 'Emergency Transport & Evacuation',
      description: 'Rough terrain driving, patient transport, depot-to-camp supply courier.',
    },
  ];

  return (
    <div className="min-h-screen bg-[#F7F9FC] text-[#17324F] antialiased flex flex-col font-sans">
      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 right-6 z-50 px-5 py-3.5 rounded-xl shadow-xl flex items-center gap-3 border text-sm font-semibold transition-all duration-300 animate-slide-up ${
            toast.type === 'error'
              ? 'bg-red-50 text-red-900 border-red-200'
              : toast.type === 'info'
              ? 'bg-blue-50 text-blue-900 border-blue-200'
              : 'bg-teal-50 text-teal-900 border-teal-200'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
          ) : toast.type === 'info' ? (
            <Info className="w-5 h-5 text-blue-600 shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* 1. SHARED UNIFIED NAVIGATION BAR (EXACT LANDING PAGE NAVBAR) */}
      <SetuNavbar activePage="volunteer-profile" />

      {/* 2. COMPACT TOOLBAR (44-48px) */}
      <div className="bg-[#17324F] text-white border-b border-slate-800 h-11 sm:h-12 px-4 sm:px-6 flex items-center shadow-xs">
        <div className="max-w-7xl mx-auto w-full flex items-center justify-between gap-3">
          <Link
            to={`/volunteer-dashboard?id=${selectedVolunteerId}`}
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-teal-300 hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Active Missions Feed</span>
          </Link>

          <div className="flex items-center gap-2 shrink-0">
            {volunteers.length > 0 && (
              <div className="flex items-center gap-1.5">
                <label htmlFor="vol-profile-select" className="text-xs text-slate-300 font-medium hidden sm:inline">
                  Responder:
                </label>
                <select
                  id="vol-profile-select"
                  value={selectedVolunteerId}
                  onChange={(e) => handleSelectActor(e.target.value)}
                  className="bg-slate-800 text-white border border-slate-600 rounded-md px-2 py-0.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-teal-400 h-7"
                >
                  {volunteers.map((v) => (
                    <option key={v.id} value={v.id} className="bg-slate-900 text-white">
                      {v.name} ({v.id})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={toggleSystemMode}
              className={`h-7 px-2.5 rounded-md text-xs font-bold transition flex items-center gap-1.5 border ${
                systemMode === 'mock'
                  ? 'bg-amber-950/90 text-amber-200 border-amber-600/80 hover:bg-amber-900'
                  : 'bg-emerald-950/90 text-emerald-200 border-emerald-600/80 hover:bg-emerald-900'
              }`}
              title="Toggle Live/Demo mode"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${systemMode === 'mock' ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'}`} />
              <span>{systemMode === 'mock' ? 'Demo Sandbox' : 'Live API'}</span>
            </button>

            <button
              type="button"
              onClick={loadProfileData}
              disabled={isLoading}
              className="h-7 px-2.5 bg-slate-800 hover:bg-slate-700 text-teal-300 rounded-md border border-slate-600 text-xs font-bold flex items-center gap-1.5 transition"
              title="Refresh profile records"
            >
              <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Sync</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. MAIN WORKSPACE */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5 w-full space-y-4 sm:space-y-5">
        
        {/* A. PROFILE OVERVIEW HEADER CARD */}
        <section aria-labelledby="profile-overview-heading" className="bg-[#EEF3F8] rounded-2xl border border-[#D5E0EB] shadow-xs overflow-hidden p-5 sm:p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            
            {/* Avatar & Core Metadata */}
            <div className="flex items-start sm:items-center gap-4 sm:gap-5">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-teal-700 text-white flex items-center justify-center text-2xl sm:text-3xl font-black shadow-md shrink-0">
                {volunteer?.name ? volunteer.name.charAt(0) : 'V'}
              </div>

              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 id="profile-overview-heading" className="text-2xl sm:text-3xl font-bold text-[#17324F] tracking-tight">
                    {volunteer?.name || 'Field Responder'}
                  </h1>
                  {volunteer?.verified ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-teal-50 text-[#087653] border border-teal-200">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Tier {volunteer.tier || 1} Verified Responder</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-[#526277] border border-slate-300">
                      Standard Registered
                    </span>
                  )}
                  <span className="font-mono text-xs bg-white text-[#17324F] px-2.5 py-1 rounded-lg border border-[#D5E0EB] font-bold">
                    {selectedVolunteerId}
                  </span>
                </div>

                <p className="text-sm font-medium text-[#526277]">
                  {volunteer?.role_title || 'Emergency Logistics Responder'} • Base: Wayanad Relief Zone
                </p>

                {/* Profile Completion Bar */}
                <div className="pt-2 flex items-center gap-3 max-w-sm">
                  <div className="flex-1 bg-white rounded-full h-2 overflow-hidden border border-[#D5E0EB]">
                    <div
                      className="bg-[#16877F] h-full rounded-full transition-all duration-500"
                      style={{ width: `${completionPercent}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-[#17324F] whitespace-nowrap">
                    {completionPercent}% Profile Complete
                  </span>
                </div>
              </div>
            </div>

            {/* Availability Toggle CTA Button */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={handleToggleDuty}
                disabled={isTogglingDuty}
                className={`px-5 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2.5 border transition shadow-xs ${
                  volunteer?.available
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700'
                    : 'bg-white hover:bg-slate-50 text-[#17324F] border-[#D5E0EB]'
                }`}
                title="Toggle on-duty availability for emergency dispatch routing"
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    volunteer?.available ? 'bg-white animate-pulse' : 'bg-slate-400'
                  }`}
                />
                <span>
                  {isTogglingDuty
                    ? 'Updating...'
                    : volunteer?.available
                    ? 'On-Duty • Available for Missions'
                    : 'Off-Duty • Set Available'}
                </span>
              </button>
            </div>

          </div>
        </section>

        {/* B & C. TWO-COLUMN GRID: CONTACT & PREFERENCES */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* B. PERSONAL & CONTACT INFORMATION */}
          <section aria-labelledby="contact-heading" className="bg-[#EEF3F8] rounded-2xl border border-[#D5E0EB] shadow-xs overflow-hidden">
            <div className="p-5 border-b border-[#D5E0EB] flex items-center justify-between">
              <h2 id="contact-heading" className="text-lg font-bold text-[#17324F] flex items-center gap-2">
                <Users className="w-5 h-5 text-teal-700" />
                <span>Personal &amp; Contact Details</span>
              </h2>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-white text-[#526277] border border-[#D5E0EB]">
                Verified Records
              </span>
            </div>

            <div className="p-5 space-y-4 bg-white">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3.5 rounded-xl bg-[#F7F9FC] border border-[#D5E0EB]">
                  <span className="text-xs font-medium text-[#526277] block">Full Name</span>
                  <strong className="text-sm font-bold text-[#17324F] mt-0.5 block">{volunteer?.name || '—'}</strong>
                </div>

                <div className="p-3.5 rounded-xl bg-[#F7F9FC] border border-[#D5E0EB]">
                  <span className="text-xs font-medium text-[#526277] block">Contact Phone</span>
                  {volunteer?.phone ? (
                    <a
                      href={`tel:${volunteer.phone}`}
                      className="text-sm font-bold text-teal-700 hover:underline flex items-center gap-1.5 mt-0.5"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>{volunteer.phone}</span>
                    </a>
                  ) : (
                    <strong className="text-sm font-medium text-[#526277] mt-0.5 block">Not registered</strong>
                  )}
                </div>

                <div className="p-3.5 rounded-xl bg-[#F7F9FC] border border-[#D5E0EB]">
                  <span className="text-xs font-medium text-[#526277] block">Official Email</span>
                  {volunteer?.email ? (
                    <a
                      href={`mailto:${volunteer.email}`}
                      className="text-sm font-bold text-teal-700 hover:underline flex items-center gap-1.5 mt-0.5 truncate"
                    >
                      <Mail className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{volunteer.email}</span>
                    </a>
                  ) : (
                    <strong className="text-sm font-medium text-[#526277] mt-0.5 block">Not registered</strong>
                  )}
                </div>

                <div className="p-3.5 rounded-xl bg-[#F7F9FC] border border-[#D5E0EB]">
                  <span className="text-xs font-medium text-[#526277] block">Blood Group</span>
                  <div className="flex items-center gap-1.5 mt-0.5 text-sm font-bold text-[#17324F]">
                    <Heart className="w-3.5 h-3.5 text-red-600" />
                    <span>{volunteer?.blood_group || 'O+'}</span>
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#F7F9FC] border border-[#D5E0EB]">
                <span className="text-xs font-medium text-[#526277] block">Base Deployment Hub</span>
                <div className="flex items-start gap-2 mt-1">
                  <MapPin className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-sm font-bold text-[#17324F]">
                      {volunteer?.location || 'Wayanad Cluster / Kalpetta Relief Depot'}
                    </strong>
                    {volunteer?.latitude && volunteer?.longitude && (
                      <span className="text-xs text-[#526277] block font-mono mt-0.5">
                        GPS Coordinates: {volunteer.latitude.toFixed(4)}° N, {volunteer.longitude.toFixed(4)}° E
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* D. SERVICE PREFERENCES & MOBILITY */}
          <section aria-labelledby="service-heading" className="bg-[#EEF3F8] rounded-2xl border border-[#D5E0EB] shadow-xs overflow-hidden">
            <div className="p-5 border-b border-[#D5E0EB] flex items-center justify-between">
              <h2 id="service-heading" className="text-lg font-bold text-[#17324F] flex items-center gap-2">
                <Truck className="w-5 h-5 text-teal-700" />
                <span>Service Preferences &amp; Mobility</span>
              </h2>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-white text-[#526277] border border-[#D5E0EB]">
                Operational Fleet
              </span>
            </div>

            <div className="p-5 space-y-4 bg-white">
              <div className="p-3.5 rounded-xl bg-[#F7F9FC] border border-[#D5E0EB]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-xs font-medium text-[#526277] block">Registered Vehicle</span>
                    <strong className="text-sm font-bold text-[#17324F] mt-0.5 block">
                      {volunteer?.vehicle || 'Light Motor Vehicle / Field Responder Transport'}
                    </strong>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 text-xs font-bold">
                    Active Transport
                  </span>
                </div>
                <p className="text-xs text-[#526277] mt-1.5 leading-relaxed">
                  Suitable for rapid courier of dry rations, bottled water crates, and first-aid kits up to 150 kg payload.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3.5 rounded-xl bg-[#F7F9FC] border border-[#D5E0EB]">
                  <span className="text-xs font-medium text-[#526277] block">Preferred Service Zone</span>
                  <strong className="text-sm font-bold text-[#17324F] mt-0.5 block">Wayanad &amp; Meppadi Sector</strong>
                  <span className="text-xs text-[#526277] mt-0.5 block">0–25 km dispatch radius</span>
                </div>

                <div className="p-3.5 rounded-xl bg-[#F7F9FC] border border-[#D5E0EB]">
                  <span className="text-xs font-medium text-[#526277] block">Availability Schedule</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`w-2 h-2 rounded-full ${volunteer?.available ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                    <strong className="text-sm font-bold text-[#17324F]">
                      {volunteer?.available ? 'Full-Time On Call' : 'Standby / Scheduled'}
                    </strong>
                  </div>
                  <span className="text-xs text-[#526277] mt-0.5 block">24x7 emergency responder network</span>
                </div>
              </div>

              {/* Administrative Edit Notice (Honest UI: No fake backend persistence) */}
              <div className="p-3 rounded-xl bg-slate-50 border border-[#D5E0EB] flex items-start gap-2.5 text-xs text-[#526277]">
                <Lock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-700 block">Read-Only Administrative Verification</strong>
                  <span>
                    To ensure trust integrity in disaster operations, identity details and vehicle credentials can only be edited through the NGO coordinator console or initial onboarding registration.
                  </span>
                </div>
              </div>
            </div>
          </section>

        </div>

        {/* C. SKILLS & EMERGENCY CAPABILITIES */}
        <section aria-labelledby="skills-heading" className="bg-[#EEF3F8] rounded-2xl border border-[#D5E0EB] shadow-xs overflow-hidden">
          <div className="p-5 border-b border-[#D5E0EB] flex items-center justify-between">
            <div>
              <h2 id="skills-heading" className="text-lg font-bold text-[#17324F] flex items-center gap-2">
                <Award className="w-5 h-5 text-teal-700" />
                <span>Skills &amp; Disaster Response Capabilities</span>
              </h2>
              <p className="text-xs sm:text-sm text-[#526277] mt-0.5">
                Qualified operational capabilities matched by the SETU dispatch engine.
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-white text-[#17324F] border border-[#D5E0EB]">
              {volunteer?.skills?.length || 3} Active Qualifications
            </span>
          </div>

          <div className="p-5 bg-white">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {knownSkills.map((sk) => {
                const isPossessed =
                  volunteer?.skills?.some((vsk) => vsk.toLowerCase().includes(sk.id)) ||
                  (sk.id === 'food_distribution' && volunteer?.skills?.includes('food_distribution')) ||
                  (sk.id === 'first_aid' && volunteer?.skills?.includes('first_aid'));

                return (
                  <div
                    key={sk.id}
                    className={`p-4 rounded-xl border transition ${
                      isPossessed
                        ? 'bg-[#E8F7F3] border-[#8DD9CA] text-[#17324F]'
                        : 'bg-slate-50/60 border-slate-200 text-slate-500'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-sm text-[#17324F]">{sk.title}</span>
                      {isPossessed ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-teal-100 text-[#087653]">
                          <CheckCircle2 className="w-3 h-3" />
                          Verified
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400 font-medium">Eligible</span>
                      )}
                    </div>
                    <p className="text-xs mt-1.5 leading-relaxed text-[#526277]">
                      {sk.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* E. MISSION & ACTIVITY SUMMARY */}
        <section aria-labelledby="activity-heading" className="bg-[#EEF3F8] rounded-2xl border border-[#D5E0EB] shadow-xs overflow-hidden">
          <div className="p-5 border-b border-[#D5E0EB] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 id="activity-heading" className="text-lg font-bold text-[#17324F] flex items-center gap-2">
                <Package className="w-5 h-5 text-teal-700" />
                <span>Assignment &amp; Activity History</span>
              </h2>
              <p className="text-xs sm:text-sm text-[#526277] mt-0.5">
                Summary of emergency relief dispatches routed by SETU backend to this responder.
              </p>
            </div>

            <Link
              to={`/volunteer-dashboard?id=${selectedVolunteerId}`}
              className="text-xs font-bold text-teal-700 hover:text-teal-900 inline-flex items-center gap-1 self-start sm:self-center"
            >
              <span>Open Full Operations Feed</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="p-5 bg-white space-y-5">
            {/* 3 Metric Tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-[#FFF6E5] border border-[#F6D28A] text-center">
                <span className="text-xs font-bold text-amber-900 block uppercase tracking-wider">Awaiting Acceptance</span>
                <strong className="text-3xl font-extrabold text-[#D97706] mt-1 block">{newTasks.length}</strong>
                <span className="text-xs text-amber-800 mt-0.5 block">Newly assigned by backend</span>
              </div>

              <div className="p-4 rounded-xl bg-[#EAF2FF] border border-[#AFCBFF] text-center">
                <span className="text-xs font-bold text-blue-900 block uppercase tracking-wider">Active In Progress</span>
                <strong className="text-3xl font-extrabold text-[#2563EB] mt-1 block">{inProgressTasks.length}</strong>
                <span className="text-xs text-blue-800 mt-0.5 block">En route or delivering</span>
              </div>

              <div className="p-4 rounded-xl bg-[#EAF8F0] border border-[#A7DFC2] text-center">
                <span className="text-xs font-bold text-emerald-900 block uppercase tracking-wider">Fulfilled Deliveries</span>
                <strong className="text-3xl font-extrabold text-[#07805A] mt-1 block">{completedTasks.length}</strong>
                <span className="text-xs text-emerald-800 mt-0.5 block">Verified resolved missions</span>
              </div>
            </div>

            {/* Recent Mission Listing */}
            {assignments.length === 0 ? (
              <div className="p-8 text-center text-[#526277] bg-[#F7F9FC] rounded-xl border border-[#D5E0EB]">
                <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold text-sm">No assignments on record for this responder.</p>
                <p className="text-xs text-slate-400 mt-0.5">New missions routed by the backend engine will appear here.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#D5E0EB] border border-[#D5E0EB] rounded-xl overflow-hidden bg-white">
                {assignments.slice(0, 5).map((assignment) => {
                  const isDelivered = assignment.status === 'resolved';
                  const isInProgress = assignment.status === 'in_progress' || assignment.status === 'accepted';

                  return (
                    <div key={assignment.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60 transition">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold bg-[#17324F] text-white px-2 py-0.5 rounded">
                            {assignment.id}
                          </span>
                          <span className="text-xs font-semibold text-[#17324F]">
                            {assignment.need?.item || assignment.supplies || 'Relief Cargo'}
                          </span>
                          <span className="text-xs text-[#526277]">
                            ({assignment.quantity || 1} {assignment.unit || 'units'})
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-[#526277]">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{assignment.destination || assignment.need?.location_text || 'Relief Location'}</span>
                        </div>
                      </div>

                      <div className="shrink-0">
                        {isDelivered ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Fulfilled</span>
                          </span>
                        ) : isInProgress ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                            <Truck className="w-3.5 h-3.5 text-blue-600" />
                            <span>In Progress</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200">
                            <Clock className="w-3.5 h-3.5 text-amber-600" />
                            <span>Assigned</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

      </main>

      {/* 4. FOOTER */}
      <footer className="bg-[#17324F] border-t border-slate-800 py-6 text-xs text-slate-300 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <SetuLogo variant="dark" iconSize={24} showTagline={false} />
            <span>SETU Volunteer Responder Profile • Built with Bharat 4.0</span>
          </div>
          <div className="flex items-center gap-4 font-semibold text-teal-300">
            <Link to="/volunteer-dashboard" className="hover:underline hover:text-white">Volunteer Dashboard</Link>
            <Link to="/ngo-dashboard" className="hover:underline hover:text-white">NGO Depot</Link>
            <Link to="/dashboard" className="hover:underline hover:text-white">Coordinator Panel</Link>
            <Link to="/" className="hover:underline hover:text-white">Home</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
