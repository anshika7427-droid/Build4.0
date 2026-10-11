import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

import {
  HeartHandshake,
  ShieldCheck,
  Users,
  Building2,
  FileText,
  ArrowRight,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  X,
  Info,
  Send,
  Award,
  Sparkles,
  Loader2,
  ClipboardList,
  Route,
  Utensils,
  Truck,
  Check
} from 'lucide-react';

import ApiService from '../services/api';
import SetuLogo from '../components/SetuLogo';
import SetuNavbar from '../components/SetuNavbar';

// ----------------------------------------------------------------------------
// Recovered Google Forms URLs from Original Codebase (Section 7)
// ----------------------------------------------------------------------------
const GOOGLE_FORMS = {
  need: "https://docs.google.com/forms/d/e/1FAIpQLSfpOTtIUbv4g216ME419DG_BqF_PCS1chJ0es47HRbkznNA1g/viewform",
  volunteer: "https://docs.google.com/forms/d/e/1FAIpQLSclY6jrgE1n3PmEiBQuTwO8o5Ew9QuOrN3_zyTnDLEUbpladw/viewform",
  ngo: "https://docs.google.com/forms/d/e/1FAIpQLSeGRTbtKLqkpfPfiOwpugNvznyA8wNA6Hpkey8RxSYy9PKclA/viewform",
};

export default function LandingPage() {
  const [stats, setStats] = useState({
    total_volunteers: 0,
    total_needs: 0,
    total_ngos: 0,
  });
  const [statsMode, setStatsMode] = useState('loading'); // 'live' | 'mock' | 'unavailable' | 'loading'
  const [heroImgError, setHeroImgError] = useState(false);
  const [impactImgError, setImpactImgError] = useState(false);

  // ==========================================================================
  // 1. IN-APP EMERGENCY INTAKE STATE (Food Assistance & Emergency Transport)
  // ==========================================================================
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportResult, setReportResult] = useState(null);
  const [reportError, setReportError] = useState(null);
  const [activeCategory, setActiveCategory] = useState('food'); // 'food' | 'transport'

  const [foodForm, setFoodForm] = useState({
    reporter_name: '',
    reporter_phone: '',
    food_type: 'Cooked Meals',
    required_quantity: '150',
    unit: 'meals',
    people_count: '',
    urgency: 'high',
    location_text: '',
    notes: '',
    description: '',
  });

  const [transportForm, setTransportForm] = useState({
    reporter_name: '',
    reporter_phone: '',
    transport_purpose: 'Evacuation of stranded persons',
    pickup_location: '',
    dropoff_location: '',
    transport_type: 'people', // 'people' | 'cargo'
    people_count: '',
    cargo_description: '',
    cargo_quantity: '',
    cargo_unit: 'boxes',
    vehicle_needed: '4x4 / Off-road Jeep',
    route_condition: '4WD accessible only',
    urgency: 'critical',
    special_requirements: '',
    description: '',
  });

  const resetReportModal = () => {
    setReportResult(null);
    setReportError(null);
    setActiveCategory('food');
    setFoodForm({
      reporter_name: '',
      reporter_phone: '',
      food_type: 'Cooked Meals',
      required_quantity: '150',
      unit: 'meals',
      people_count: '',
      urgency: 'high',
      location_text: '',
      notes: '',
      description: '',
    });
    setTransportForm({
      reporter_name: '',
      reporter_phone: '',
      transport_purpose: 'Evacuation of stranded persons',
      pickup_location: '',
      dropoff_location: '',
      transport_type: 'people',
      people_count: '',
      cargo_description: '',
      cargo_quantity: '',
      cargo_unit: 'boxes',
      vehicle_needed: '4x4 / Off-road Jeep',
      route_condition: '4WD accessible only',
      urgency: 'critical',
      special_requirements: '',
      description: '',
    });
  };

  const handleEmergencyReportSubmit = async (e) => {
    e.preventDefault();
    setReportError(null);

    if (activeCategory === 'food') {
      if (!foodForm.location_text.trim()) {
        setReportError('Please enter the delivery or camp location where food is needed.');
        return;
      }
      if (!foodForm.description.trim()) {
        setReportError('Please provide a description of the emergency food need and situation.');
        return;
      }
    } else {
      if (!transportForm.pickup_location.trim()) {
        setReportError('Please specify the exact pickup location where evacuation or transit is needed.');
        return;
      }
      if (!transportForm.dropoff_location.trim()) {
        setReportError('Please specify the drop-off destination.');
        return;
      }
      if (!transportForm.description.trim()) {
        setReportError('Please provide route condition details or reason for emergency transport.');
        return;
      }
    }

    setIsSubmittingReport(true);
    try {
      let payload;
      if (activeCategory === 'food') {
        const descParts = [`[Food Assistance - ${foodForm.food_type}] ${foodForm.description.trim()}`];
        if (foodForm.people_count.trim()) {
          descParts.push(`Beneficiaries: ~${foodForm.people_count.trim()} people`);
        }
        if (foodForm.notes.trim()) {
          descParts.push(`Dietary / access notes: ${foodForm.notes.trim()}`);
        }

        payload = {
          reporter_name: foodForm.reporter_name.trim() || 'Citizen Reporter',
          reporter_phone: foodForm.reporter_phone.trim() || '9876543210',
          location_text: foodForm.location_text.trim(),
          description: descParts.join(' | '),
          disaster_type: 'Food Emergency',
          resource_type: 'food',
          required_quantity: parseInt(foodForm.required_quantity, 10) || 50,
          unit: foodForm.unit || 'meals',
          urgency: foodForm.urgency,
        };
      } else {
        const descParts = [
          `[Emergency Transport - ${transportForm.transport_purpose}]`,
          `Route: ${transportForm.pickup_location.trim()} -> ${transportForm.dropoff_location.trim()}`,
          transportForm.transport_type === 'people'
            ? `Passengers: ${transportForm.people_count.trim() || 'Stranded individuals'}`
            : `Cargo: ${transportForm.cargo_description.trim() || 'Relief goods'} (${transportForm.cargo_quantity || '1'} ${transportForm.cargo_unit || 'units'})`,
          `Vehicle: ${transportForm.vehicle_needed}`,
          `Route Condition: ${transportForm.route_condition}`,
        ];
        if (transportForm.special_requirements.trim()) {
          descParts.push(`Special Reqs: ${transportForm.special_requirements.trim()}`);
        }
        descParts.push(`Notes: ${transportForm.description.trim()}`);

        const qty = transportForm.transport_type === 'people'
          ? (parseInt(transportForm.people_count, 10) || 1)
          : (parseInt(transportForm.cargo_quantity, 10) || 1);

        payload = {
          reporter_name: transportForm.reporter_name.trim() || 'Citizen Reporter',
          reporter_phone: transportForm.reporter_phone.trim() || '9876543210',
          location_text: `${transportForm.pickup_location.trim()} to ${transportForm.dropoff_location.trim()}`,
          description: descParts.join(' | '),
          disaster_type: 'Transport Evacuation',
          resource_type: 'transport',
          required_quantity: qty,
          unit: transportForm.transport_type === 'people' ? 'passengers' : (transportForm.cargo_unit || 'units'),
          urgency: transportForm.urgency,
        };
      }

      const res = await ApiService.submitEmergencyReport(payload);
      if (res.ok && res.data) {
        setReportResult(res.data);
      } else {
        setReportError(res.error || 'Failed to submit emergency report to SETU dispatch.');
      }
    } catch (err) {
      setReportError(`Network error: ${err.message || 'Could not connect to SETU intake server.'}`);
    } finally {
      setIsSubmittingReport(false);
    }
  };

  // ==========================================================================
  // 2. IN-APP VOLUNTEER REGISTRATION STATE
  // ==========================================================================
  const [isVolunteerModalOpen, setIsVolunteerModalOpen] = useState(false);
  const [isSubmittingVolunteer, setIsSubmittingVolunteer] = useState(false);
  const [volunteerResult, setVolunteerResult] = useState(null);
  const [volunteerError, setVolunteerError] = useState(null);
  const [volunteerForm, setVolunteerForm] = useState({
    name: '',
    phone: '',
    email: '',
    location: '',
    service_radius: '25 km',
    skills: ['Food Distribution', 'Driving / Transport'],
    availability: 'Immediate / Full-time',
    vehicle_access: 'None / On Foot',
    vehicle_capacity: '',
  });

  const resetVolunteerModal = () => {
    setVolunteerResult(null);
    setVolunteerError(null);
    setVolunteerForm({
      name: '',
      phone: '',
      email: '',
      location: '',
      service_radius: '25 km',
      skills: ['Food Distribution', 'Driving / Transport'],
      availability: 'Immediate / Full-time',
      vehicle_access: 'None / On Foot',
      vehicle_capacity: '',
    });
  };

  const handleVolunteerSubmit = async (e) => {
    e.preventDefault();
    if (!volunteerForm.name.trim()) {
      setVolunteerError('Please enter your full name.');
      return;
    }
    if (!volunteerForm.phone.trim()) {
      setVolunteerError('Please provide a contact phone number.');
      return;
    }
    if (!volunteerForm.location.trim()) {
      setVolunteerError('Please specify your base location or district.');
      return;
    }
    if (volunteerForm.skills.length === 0) {
      setVolunteerError('Please select at least one skill or capability.');
      return;
    }

    setVolunteerError(null);
    setIsSubmittingVolunteer(true);
    try {
      const payload = {
        name: volunteerForm.name.trim(),
        phone: volunteerForm.phone.trim(),
        email: volunteerForm.email.trim() || undefined,
        location: volunteerForm.location.trim(),
        radius_km: parseInt(volunteerForm.service_radius, 10) || 25,
        skills: volunteerForm.skills,
        availability: volunteerForm.availability,
        vehicle: volunteerForm.vehicle_access,
        vehicle_capacity: volunteerForm.vehicle_capacity.trim() || undefined,
        role_title: volunteerForm.skills.includes('First Aid / Medical')
          ? 'Emergency Medical Responder'
          : (volunteerForm.skills.includes('Rescue / Evacuation')
            ? 'Rescue Ground Responder'
            : (volunteerForm.skills.includes('Driving / Transport')
              ? 'Transport Logistics Volunteer'
              : 'Field Aid Volunteer')),
      };

      const res = await ApiService.registerVolunteer(payload);
      if (res.ok && res.data) {
        setVolunteerResult(res.data);
      } else {
        setVolunteerError(res.error || 'Failed to register volunteer. Please try again.');
      }
    } catch (err) {
      setVolunteerError(`Network error: ${err.message || 'Could not reach SETU server.'}`);
    } finally {
      setIsSubmittingVolunteer(false);
    }
  };

  // ==========================================================================
  // 3. IN-APP NGO REGISTRATION STATE
  // ==========================================================================
  const [isNgoModalOpen, setIsNgoModalOpen] = useState(false);
  const [isSubmittingNgo, setIsSubmittingNgo] = useState(false);
  const [ngoResult, setNgoResult] = useState(null);
  const [ngoError, setNgoError] = useState(null);
  const [ngoForm, setNgoForm] = useState({
    ngo_name: '',
    coordinator_name: '',
    phone: '',
    email: '',
    location: '',
    coverage_radius: '35 km',
    assistance_types: ['Food / Rations', 'Emergency Transport'],
    capacity_notes: '',
  });

  const resetNgoModal = () => {
    setNgoResult(null);
    setNgoError(null);
    setNgoForm({
      ngo_name: '',
      coordinator_name: '',
      phone: '',
      email: '',
      location: '',
      coverage_radius: '35 km',
      assistance_types: ['Food / Rations', 'Emergency Transport'],
      capacity_notes: '',
    });
  };

  const handleNgoSubmit = async (e) => {
    e.preventDefault();
    if (!ngoForm.ngo_name.trim()) {
      setNgoError('Please enter your organization name.');
      return;
    }
    if (!ngoForm.coordinator_name.trim()) {
      setNgoError('Please enter the coordinator / contact person name.');
      return;
    }
    if (!ngoForm.phone.trim()) {
      setNgoError('Please provide a contact phone number.');
      return;
    }
    if (!ngoForm.email.trim()) {
      setNgoError('Please provide an official email address.');
      return;
    }
    if (!ngoForm.location.trim()) {
      setNgoError('Please specify the base depot or headquarters location.');
      return;
    }
    if (ngoForm.assistance_types.length === 0) {
      setNgoError('Please select at least one relief assistance type.');
      return;
    }

    setNgoError(null);
    setIsSubmittingNgo(true);
    try {
      const payload = {
        ngo_name: ngoForm.ngo_name.trim(),
        coordinator_name: ngoForm.coordinator_name.trim(),
        phone: ngoForm.phone.trim(),
        email: ngoForm.email.trim(),
        location: ngoForm.location.trim(),
        radius: parseInt(ngoForm.coverage_radius, 10) || 35,
        assistance_types: ngoForm.assistance_types,
        capacity_notes: ngoForm.capacity_notes.trim() || undefined,
      };

      const res = await ApiService.registerNGO(payload);
      if (res.ok && res.data) {
        setNgoResult(res.data);
      } else {
        setNgoError(res.error || 'Failed to register organization. Please try again.');
      }
    } catch (err) {
      setNgoError(`Network error: ${err.message || 'Could not reach SETU server.'}`);
    } finally {
      setIsSubmittingNgo(false);
    }
  };

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
      {/* 1. NAVBAR — Shared SetuNavbar Component (Exact Landing Page Design)  */}
      {/* ==================================================================== */}
      <SetuNavbar
        onReportNeedClick={() => { resetReportModal(); setIsReportModalOpen(true); }}
        activePage="landing"
      />

      {/* ==================================================================== */}
      {/* 2. HERO SECTION — Natural Spacing (24-32px top padding) & Vertical Alignment */}
      {/* ==================================================================== */}
      <section
        id="hero"
        className="bg-white border-b border-[#E1E8F0] relative overflow-hidden scroll-mt-20"
      >
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 xl:px-12 pt-5 sm:pt-6 lg:pt-7 pb-10 sm:pb-12 lg:pb-14">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-center">
            
            {/* Left Column: Mission, Headline & Key CTAs */}
            <div className="lg:col-span-7 space-y-4 sm:space-y-5">

              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold text-[#17324F] tracking-tight leading-[1.15]">
                When Help Is Needed, Every Connection Matters.
              </h1>

              <p className="text-lg sm:text-xl text-[#526277] leading-relaxed max-w-2xl font-normal">
                SETU brings emergency needs, relief organizations, and volunteers together through structured reporting, AI-assisted assessment, and coordinated disaster response.
              </p>

              {/* Three Primary Participation CTAs (>= 48px height) */}
              <div className="flex flex-col sm:flex-row flex-wrap gap-3">
                
                {/* 1. Report an Emergency (In-App Direct Dispatch) */}
                <button
                  type="button"
                  onClick={() => { resetReportModal(); setIsReportModalOpen(true); }}
                  className="min-h-[48px] px-6 py-3 bg-red-700 hover:bg-red-800 text-white font-bold text-base rounded-xl shadow-xs hover:shadow-md transition flex items-center justify-center gap-2 focus:ring-4 focus:ring-red-200 cursor-pointer"
                >
                  <Send className="w-5 h-5" />
                  <span>Report an Emergency (In-App)</span>
                </button>

                {/* 1b. Google Form Intake Link */}
                <a
                  href={GOOGLE_FORMS.need}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[48px] px-4 py-3 bg-red-50 hover:bg-red-100 text-red-800 font-semibold text-sm rounded-xl border border-red-200 transition flex items-center justify-center gap-2"
                  title="Submit via official Google Form"
                >
                  <span>Google Form</span>
                  <ExternalLink className="w-4 h-4 opacity-75" />
                </a>

                {/* 2. Become a Volunteer */}
                <button
                  type="button"
                  onClick={() => { resetVolunteerModal(); setIsVolunteerModalOpen(true); }}
                  className="min-h-[48px] px-6 py-3 bg-[#16877F] hover:bg-teal-800 text-white font-bold text-base rounded-xl shadow-xs hover:shadow-md transition flex items-center justify-center gap-2 focus:ring-4 focus:ring-teal-200 cursor-pointer"
                >
                  <Users className="w-5 h-5" />
                  <span>Become a Volunteer</span>
                </button>

                {/* 3. Register Your NGO */}
                <button
                  type="button"
                  onClick={() => { resetNgoModal(); setIsNgoModalOpen(true); }}
                  className="min-h-[48px] px-6 py-3 bg-white hover:bg-slate-50 text-[#17324F] font-bold text-base rounded-xl border-2 border-slate-300 hover:border-slate-400 shadow-xs transition flex items-center justify-center gap-2 focus:ring-4 focus:ring-slate-200 cursor-pointer"
                >
                  <Building2 className="w-5 h-5 text-slate-700" />
                  <span>Register Your NGO</span>
                </button>

              </div>

              {/* Role-Based Workspaces Quick Entry */}
              <div className="bg-[#F7F9FC] border border-[#E1E8F0] p-3.5 sm:p-4 rounded-2xl space-y-2.5">
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
                    className="w-full sm:w-auto flex-1 min-h-[44px] px-4 py-2 bg-[#17324F] hover:bg-[#0E2338] text-white font-bold text-sm rounded-xl shadow-xs transition flex items-center justify-center gap-2"
                  >
                    <Building2 className="w-4 h-4 text-teal-400" />
                    <span>NGO Dashboard</span>
                  </Link>

                  <Link
                    to="/volunteer-dashboard"
                    className="w-full sm:w-auto flex-1 min-h-[44px] px-4 py-2 bg-[#16877F] hover:bg-teal-800 text-white font-bold text-sm rounded-xl shadow-xs transition flex items-center justify-center gap-2"
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
            <div className="lg:col-span-5 lg:-translate-y-6">
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
                <div className="p-3 bg-slate-900/90 text-white text-xs sm:text-sm font-medium border-t border-slate-800">
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
      {/* 3. ABOUT SETU / UNDERSTANDING THE PROBLEM (INSET IMAGE-BACKED PANEL) */}
      {/* ==================================================================== */}
      {/* ==================================================================== */}
      {/* 3. ABOUT SETU / UNDERSTANDING THE PROBLEM (EDGE-TO-EDGE IMAGE-BACKED) */}
      {/* ==================================================================== */}
      <section
        id="about"
        className="relative w-full py-7 sm:py-8 lg:py-9 border-b border-[#E1E8F0] scroll-mt-20 overflow-hidden"
      >
        {/* Layer 1 — Soft Blurred Humanitarian Background (Spans 100% of Viewport, Zero Gutters) */}
        <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none select-none z-0" aria-hidden="true">
          <img
            src="/images/setu-relief-warehouse.png"
            alt="Volunteers organizing emergency relief supplies in a humanitarian warehouse"
            className="w-full h-full object-cover scale-[1.04] filter blur-[7px]"
            style={{ objectPosition: 'center 0%' }}
            loading="eager"
          />
          {/* Pale translucent overlay: 40% soft white preserves warehouse recognition while calming the background */}
          <div className="absolute inset-0 bg-white/40" />
        </div>

        {/* Foreground Content (Layers 2 & 3) — Completely Sharp, Centered, 24px-32px Inner Padding */}
        <div className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-8 lg:px-8">
          
          {/* Layer 2 — Centered Section Introduction with 80% translucent surface for pristine contrast */}
          <div className="text-center max-w-3xl mx-auto mb-6 sm:mb-7 py-3 sm:py-3.5 px-4 sm:px-8 rounded-2xl bg-white/80 backdrop-blur-xs shadow-2xs">
            <div className="mb-3 sm:mb-3.5">
              <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#16877F] bg-white border border-teal-200/90 px-3.5 py-1 rounded-full inline-block shadow-2xs">
                UNDERSTANDING THE PROBLEM
              </span>
            </div>
            <h2 className="text-xl sm:text-3xl lg:text-[34px] font-extrabold text-[#17324F] tracking-tight leading-snug sm:leading-tight">
              Why Transparent Emergency Coordination Matters
            </h2>
            <p className="text-sm sm:text-base text-[#526277] leading-relaxed max-w-2xl sm:max-w-3xl mx-auto font-medium mt-2.5 sm:mt-3">
              During emergencies, needs, relief supplies, and willing volunteers can exist at the same time—but fragmented information makes it difficult to connect them efficiently.
            </p>
          </div>

          {/* Layer 3 — Three White Foreground Cards (Evenly Distributed & Equal Width) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            
            {/* Card 1: Frictionless Intake */}
            <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#E1E8F0] shadow-xs hover:shadow-sm transition-shadow flex flex-col items-center text-center h-full">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-[#16877F] mb-3 shrink-0 shadow-2xs">
                <ClipboardList className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-[#17324F]">
                Frictionless Intake
              </h3>
              <p className="text-sm sm:text-[15px] text-[#526277] leading-relaxed mt-2">
                Make emergency needs easier to report through simple, accessible channels.
              </p>
            </div>

            {/* Card 2: Transparent Verification */}
            <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#E1E8F0] shadow-xs hover:shadow-sm transition-shadow flex flex-col items-center text-center h-full">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-[#D97706] mb-3 shrink-0 shadow-2xs">
                <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-[#17324F]">
                Transparent Verification
              </h3>
              <p className="text-sm sm:text-[15px] text-[#526277] leading-relaxed mt-2">
                Check reports for consistency and possible duplicates, with uncertain cases flagged for review.
              </p>
            </div>

            {/* Card 3: Coordinated Dispatch */}
            <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#E1E8F0] shadow-xs hover:shadow-sm transition-shadow flex flex-col items-center text-center h-full md:col-span-2 lg:col-span-1 md:max-w-md md:mx-auto lg:max-w-none w-full">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mb-3 shrink-0 shadow-2xs">
                <Route className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-[#17324F]">
                Coordinated Dispatch
              </h3>
              <p className="text-sm sm:text-[15px] text-[#526277] leading-relaxed mt-2">
                Connect assessed needs with available NGO resources and suitable volunteers.
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
        className="py-10 sm:py-12 lg:py-14 bg-white border-b border-[#E1E8F0] scroll-mt-20"
      >
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 xl:px-12 space-y-6 sm:space-y-8">
          
          <div className="text-center max-w-2xl mx-auto space-y-2">
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            
            {/* Step 1 */}
            <div className="bg-[#F7F9FC] rounded-2xl border border-[#E1E8F0] p-5 space-y-2.5 relative">
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
            <div className="bg-[#F7F9FC] rounded-2xl border border-[#E1E8F0] p-5 space-y-2.5 relative">
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
            <div className="bg-[#F7F9FC] rounded-2xl border border-[#E1E8F0] p-5 space-y-2.5 relative">
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
            <div className="bg-[#F7F9FC] rounded-2xl border border-[#E1E8F0] p-5 space-y-2.5 relative">
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
          <div className="bg-slate-50 rounded-xl p-3.5 border border-[#E1E8F0] text-xs sm:text-sm text-[#526277] flex items-start gap-3">
            <Info className="w-5 h-5 text-[#526277] shrink-0 mt-0.5" />
            <p>
              <strong>Important Public Service Note:</strong> AI-assisted classification organizes incoming information for human decision-makers. Emergency verification is an advisory score, and relief distribution is executed by human volunteers and registered NGOs based on available ground capacity.
            </p>
          </div>

        </div>
      </section>

      {/* ==================================================================== */}
      {/* 5. "SETU IN NUMBERS" — Soft Blurred Background with Pale Overlay     */}
      {/* ==================================================================== */}
      <section
        id="numbers"
        className="relative w-full py-7 sm:py-8 lg:py-9 overflow-hidden border-b border-[#E1E8F0] scroll-mt-20"
      >
        {/* Layer 1 — Soft Blurred Humanitarian Background */}
        <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none select-none z-0" aria-hidden="true">
          <img
            src="/images/setu-relief-warehouse.png"
            alt="Volunteers organizing emergency relief supplies in a humanitarian warehouse"
            className="w-full h-full object-cover scale-[1.04] filter blur-[7px]"
            style={{ objectPosition: 'center 0%' }}
            loading="eager"
          />
          {/* Pale translucent overlay: 40% soft white preserves warehouse recognition while ensuring high contrast */}
          <div className="absolute inset-0 bg-white/40" />
        </div>

        {/* Foreground Content (Layers 2 & 3) */}
        <div className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-8 lg:px-8">
          
          {/* Layer 2 — Centered Frosted White Introduction Panel */}
          <div className="text-center max-w-3xl mx-auto mb-6 sm:mb-7 py-4 sm:py-5 px-6 sm:px-8 rounded-[24px] bg-white/[0.82] backdrop-blur-md border border-white/60 shadow-2xs">
            <div className="mb-3 sm:mb-3.5">
              <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#16877F] bg-white border border-teal-200/90 px-3.5 py-1 rounded-full inline-block shadow-2xs">
                VERIFIED METRICS
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-[34px] font-extrabold text-[#17324F] tracking-tight leading-snug sm:leading-tight">
              SETU in Numbers
            </h2>
            <p className="text-sm sm:text-base text-[#526277] leading-relaxed max-w-2xl sm:max-w-3xl mx-auto font-medium mt-2.5 sm:mt-3">
              Key participation metrics recorded across the SETU coordination backbone.
            </p>

            {/* Telemetry Mode Indicator */}
            <div className="mt-3.5 sm:mt-4 flex justify-center">
              {statsMode === 'live' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Live Database Telemetry</span>
                </span>
              ) : statsMode === 'mock' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white/90 text-[#526277] border border-[#E1E8F0] shadow-2xs">
                  <Info className="w-3.5 h-3.5 text-[#16877F]" />
                  <span>Sample Demo Data (Offline Mode)</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white/90 text-[#526277] border border-[#E1E8F0]">
                  <span>Telemetry Currently Unavailable</span>
                </span>
              )}
            </div>
          </div>

          {/* Three Metric Cards: Clean White, Equal Height, Uniform Navy Values & Teal Icons */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
            
            {/* 1. Registered Volunteers */}
            <div className="bg-white rounded-2xl border border-[#E1E8F0] p-5 sm:p-6 shadow-xs hover:shadow-sm transition flex flex-col justify-between h-full space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-4xl sm:text-5xl font-black text-[#17324F] tracking-tight">
                  {statsMode === 'unavailable' ? '—' : stats.total_volunteers}
                </span>
                <div className="w-12 h-12 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-[#16877F] shrink-0">
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
            <div className="bg-white rounded-2xl border border-[#E1E8F0] p-5 sm:p-6 shadow-xs hover:shadow-sm transition flex flex-col justify-between h-full space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-4xl sm:text-5xl font-black text-[#17324F] tracking-tight">
                  {statsMode === 'unavailable' ? '—' : stats.total_needs}
                </span>
                <div className="w-12 h-12 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-[#16877F] shrink-0">
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
            <div className="bg-white rounded-2xl border border-[#E1E8F0] p-5 sm:p-6 shadow-xs hover:shadow-sm transition flex flex-col justify-between h-full space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-4xl sm:text-5xl font-black text-[#17324F] tracking-tight">
                  {statsMode === 'unavailable' ? '—' : stats.total_ngos}
                </span>
                <div className="w-12 h-12 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-[#16877F] shrink-0">
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
      {/* 6. PARTICIPATION SECTIONS (IN-APP MODALS & RECOVERED GOOGLE FORMS)   */}
      {/* ==================================================================== */}
      <section
        id="participate"
        className="py-10 sm:py-12 lg:py-14 bg-[#F7F9FC] border-b border-[#E1E8F0] scroll-mt-20"
      >
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 xl:px-12 space-y-6 sm:space-y-8">
          
          <div className="text-center max-w-2xl mx-auto space-y-2">
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
            
            {/* Card A: Report a Need */}
            <div className="bg-white rounded-2xl border border-red-200 hover:border-red-300 p-5 sm:p-6 shadow-xs hover:shadow-sm transition space-y-4 flex flex-col justify-between">
              <div className="space-y-2.5">
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

              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => { resetReportModal(); setIsReportModalOpen(true); }}
                  className="w-full min-h-[48px] px-6 py-3 bg-red-700 hover:bg-red-800 text-white font-bold text-base rounded-xl transition shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>Submit Distress Call (In-App)</span>
                </button>
                <a
                  href={GOOGLE_FORMS.need}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[38px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-[#17324F] font-semibold text-xs sm:text-sm rounded-xl border border-slate-200 transition flex items-center justify-center gap-1.5"
                >
                  <span>Use Google Form</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            {/* Card B: Become a Volunteer */}
            <div className="bg-white rounded-2xl border border-teal-200 hover:border-teal-300 p-5 sm:p-6 shadow-xs hover:shadow-sm transition space-y-4 flex flex-col justify-between">
              <div className="space-y-2.5">
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

              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => { resetVolunteerModal(); setIsVolunteerModalOpen(true); }}
                  className="w-full min-h-[48px] px-6 py-3 bg-[#16877F] hover:bg-teal-800 text-white font-bold text-base rounded-xl transition shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Users className="w-4 h-4" />
                  <span>Register as a Volunteer</span>
                </button>
                <a
                  href={GOOGLE_FORMS.volunteer}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[38px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-[#17324F] font-semibold text-xs sm:text-sm rounded-xl border border-slate-200 transition flex items-center justify-center gap-1.5"
                >
                  <span>Use Google Form</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            {/* Card C: Register Your NGO */}
            <div className="bg-white rounded-2xl border border-[#E1E8F0] hover:border-slate-300 p-5 sm:p-6 shadow-xs hover:shadow-sm transition space-y-4 flex flex-col justify-between">
              <div className="space-y-2.5">
                <div className="w-12 h-12 rounded-xl bg-slate-100 text-[#17324F] flex items-center justify-center border border-[#E1E8F0]">
                  <Building2 className="w-4 h-4" />
                </div>
                <h3 className="text-2xl font-bold text-[#17324F]">
                  Bring Your Organization
                </h3>
                <p className="text-base text-[#526277] leading-relaxed">
                  Register your organization and share the relief resources and capacity you can provide.
                </p>
              </div>

              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => { resetNgoModal(); setIsNgoModalOpen(true); }}
                  className="w-full min-h-[48px] px-6 py-3 bg-[#17324F] hover:bg-[#0E2338] text-white font-bold text-base rounded-xl transition shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Building2 className="w-4 h-4 text-teal-400" />
                  <span>Register Your NGO</span>
                </button>
                <a
                  href={GOOGLE_FORMS.ngo}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[38px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-[#17324F] font-semibold text-xs sm:text-sm rounded-xl border border-slate-200 transition flex items-center justify-center gap-1.5"
                >
                  <span>Use Google Form</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
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
        className="py-10 sm:py-12 lg:py-14 bg-white border-b border-[#E1E8F0] scroll-mt-20"
      >
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 xl:px-12 space-y-6 sm:space-y-8">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-center">
            
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
                
                <div className="p-3 bg-slate-900/90 text-white text-xs sm:text-sm font-medium border-t border-slate-800">
                  <p className="leading-snug">
                    <strong>Coordinated Logistics:</strong> Humanitarian organizations packaging verified rations for targeted neighborhood distribution.
                  </p>
                </div>
              </div>
            </div>

            {/* Right: The Purpose and 3 Benefits */}
            <div className="lg:col-span-7 space-y-4 sm:space-y-5 order-1 lg:order-2">
              <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#16877F] bg-teal-50 px-3 py-1 rounded-full border border-teal-200 inline-block">
                Social Impact
              </span>

              <h2 className="text-3xl sm:text-4xl font-extrabold text-[#17324F] tracking-tight">
                Better Coordination. More Meaningful Help.
              </h2>

              <p className="text-base sm:text-lg text-[#526277] leading-relaxed">
                When disaster strikes, goodwill is abundant—but coordination is scarce. SETU ensures that volunteer energy and NGO supplies are deployed where they make the most meaningful difference, eliminating waste and keeping responders focused.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1.5">
                <div className="p-3.5 rounded-xl bg-[#F7F9FC] border border-[#E1E8F0] space-y-1">
                  <CheckCircle2 className="w-5 h-5 text-[#047857]" />
                  <h4 className="font-bold text-[#17324F] text-base">Easier Reporting</h4>
                  <p className="text-xs text-[#526277]">Accessible forms remove technical hurdles for all citizens.</p>
                </div>

                <div className="p-3.5 rounded-xl bg-[#F7F9FC] border border-[#E1E8F0] space-y-1">
                  <CheckCircle2 className="w-5 h-5 text-[#16877F]" />
                  <h4 className="font-bold text-[#17324F] text-base">Clearer Coordination</h4>
                  <p className="text-xs text-[#526277]">Eliminates double-dispatch and confusion across agencies.</p>
                </div>

                <div className="p-3.5 rounded-xl bg-[#F7F9FC] border border-[#E1E8F0] space-y-1">
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
      <section className="bg-[#17324F] text-white py-8 sm:py-10 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 xl:px-12 flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-6">
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
            className="min-h-[48px] px-6 py-2.5 bg-[#16877F] hover:bg-teal-700 active:bg-teal-800 text-white font-bold text-base rounded-xl shadow-lg transition flex items-center gap-2 shrink-0"
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
        className="bg-[#17324F] text-slate-300 py-8 sm:py-10 text-sm border-t-4 border-[#16877F] scroll-mt-20"
      >
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 xl:px-12 space-y-6 sm:space-y-7">
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 sm:gap-8">
            
            {/* Col 1: Brand & Mission */}
            <div className="space-y-3 md:col-span-2">
              <Link to="/" className="inline-block focus:outline-none focus:ring-2 focus:ring-[#16877F] rounded-lg">
                <SetuLogo variant="dark" iconSize={42} />
              </Link>
              <p className="text-sm text-slate-300 leading-relaxed max-w-md mt-1.5">
                An open-architecture disaster response platform connecting distress reports with verified relief organizations and responders across Bharat.
              </p>
              <div className="pt-0.5 flex items-center gap-2 text-xs text-teal-300 font-semibold">
                <Award className="w-4 h-4" />
                <span>Engineered for Built with Bharat 4.0 Hackathon Competition</span>
              </div>
            </div>

            {/* Col 2: Platform Sections */}
            <div className="space-y-2">
              <h4 className="font-bold text-white uppercase text-xs tracking-wider">
                Platform Sections
              </h4>
              <ul className="space-y-1.5 text-sm">
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
            <div className="space-y-2">
              <h4 className="font-bold text-white uppercase text-xs tracking-wider">
                Google Forms Participation
              </h4>
              <ul className="space-y-1.5 text-sm">
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
          <div className="pt-4 sm:pt-5 border-t border-slate-700/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
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

      {/* ==================================================================== */}
      {/* 1. IN-APP EMERGENCY INTAKE MODAL (Food Assistance & Transport Only)   */}
      {/* ==================================================================== */}
      {isReportModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="emergency-modal-title"
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-fade-in"
        >
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden transform transition-all">
            
            {/* Modal Header */}
            <div className="bg-[#17324F] px-6 py-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-inner ${
                  activeCategory === 'food' ? 'bg-emerald-600' : 'bg-blue-600'
                }`}>
                  {activeCategory === 'food' ? (
                    <Utensils className="w-5 h-5 text-white" />
                  ) : (
                    <Truck className="w-5 h-5 text-white" />
                  )}
                </div>
                <div>
                  <h3 id="emergency-modal-title" className="text-xl font-bold leading-tight">
                    Emergency Relief Request
                  </h3>
                  <p className="text-xs text-slate-300">
                    Direct intake into SETU AI triage &amp; dispatch coordinator
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setIsReportModalOpen(false); resetReportModal(); }}
                className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto bg-white text-[#17324F]">
              
              {/* SUCCESS STATE */}
              {reportResult ? (
                <div className="space-y-6">
                  <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-3">
                    <div className="flex items-center gap-2.5 text-emerald-800 font-bold text-lg">
                      <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                      <span>Distress Report Recorded Successfully</span>
                    </div>
                    <p className="text-sm text-emerald-900 leading-relaxed">
                      Your emergency request has been analyzed by SETU AI triage and saved to the live coordination database.
                    </p>
                  </div>

                  {/* Extraction & Triage Summary */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs sm:text-sm">
                    <div className="p-3.5 bg-slate-50 border border-[#CBD5E1] rounded-xl space-y-1">
                      <span className="text-[#526277] font-semibold block">Need Reference ID</span>
                      <span className="font-mono font-bold text-[#17324F] break-all">
                        {reportResult.id || reportResult.need_id || 'SETU-EMERGENCY'}
                      </span>
                    </div>

                    <div className="p-3.5 bg-slate-50 border border-[#CBD5E1] rounded-xl space-y-1">
                      <span className="text-[#526277] font-semibold block">Trust Score &amp; Flag</span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-base text-[#17324F]">
                          {reportResult.trust_score !== undefined ? `${reportResult.trust_score}/100` : 'Assessed'}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${
                          (reportResult.trust_score || 0) >= 80 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {reportResult.flag || ((reportResult.trust_score || 0) >= 80 ? 'Verified' : 'Under Review')}
                        </span>
                      </div>
                    </div>

                    <div className="p-3.5 bg-slate-50 border border-[#CBD5E1] rounded-xl space-y-1">
                      <span className="text-[#526277] font-semibold block">Extracted Need</span>
                      <span className="font-bold text-[#17324F] capitalize">
                        {reportResult.required_quantity || reportResult.quantity || '50'} {reportResult.unit || 'units'} of {reportResult.resource_type || reportResult.need_type || 'Relief'}
                      </span>
                    </div>

                    <div className="p-3.5 bg-slate-50 border border-[#CBD5E1] rounded-xl space-y-1">
                      <span className="text-[#526277] font-semibold block">Triage Status</span>
                      <span className="font-bold text-teal-800 uppercase">
                        {reportResult.dispatch_action === 'secondary_review' || reportResult.status === 'secondary_review'
                          ? 'Secondary AI Review'
                          : (reportResult.dispatch_action || reportResult.status || 'Active Dispatch')}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-2 flex flex-col sm:flex-row gap-3">
                    <Link
                      to="/dashboard"
                      className="flex-1 min-h-[44px] px-5 py-2.5 bg-[#16877F] hover:bg-teal-800 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-xs transition"
                    >
                      <span>View in Coordinator Feed</span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                    <button
                      type="button"
                      onClick={resetReportModal}
                      className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-[#17324F] font-bold text-sm rounded-xl transition cursor-pointer"
                    >
                      Submit Another Report
                    </button>
                  </div>
                </div>
              ) : (
                /* FORM INPUT STATE */
                <form onSubmit={handleEmergencyReportSubmit} className="space-y-4">
                  {reportError && (
                    <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                      <span>{reportError}</span>
                    </div>
                  )}

                  {/* Prominent Two-Category Selector (Food vs Transport ONLY) */}
                  <div>
                    <label className="block text-xs font-bold text-[#17324F] uppercase tracking-wider mb-2">
                      Select Emergency Category <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => { setActiveCategory('food'); setReportError(null); }}
                        className={`p-3.5 rounded-2xl border-2 flex items-center gap-3 transition cursor-pointer text-left ${
                          activeCategory === 'food'
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-500/20'
                            : 'border-[#CBD5E1] bg-white text-[#526277] hover:border-slate-400'
                        }`}
                      >
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          activeCategory === 'food' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-[#526277]'
                        }`}>
                          <Utensils className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="font-bold text-base text-[#17324F]">Food Assistance</div>
                          <div className="text-xs text-[#526277]">Meals, rations &amp; clean water</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => { setActiveCategory('transport'); setReportError(null); }}
                        className={`p-3.5 rounded-2xl border-2 flex items-center gap-3 transition cursor-pointer text-left ${
                          activeCategory === 'transport'
                            ? 'border-blue-600 bg-blue-50 text-blue-950 ring-2 ring-blue-500/20'
                            : 'border-[#CBD5E1] bg-white text-[#526277] hover:border-slate-400'
                        }`}
                      >
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          activeCategory === 'transport' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-[#526277]'
                        }`}>
                          <Truck className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="font-bold text-base text-[#17324F]">Emergency Transport</div>
                          <div className="text-xs text-[#526277]">Evacuation &amp; relief transit</div>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Common Reporter Information Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                    <div>
                      <label className="block text-xs font-bold text-[#17324F] uppercase tracking-wider mb-1">
                        Reporter Name
                      </label>
                      <input
                        type="text"
                        value={activeCategory === 'food' ? foodForm.reporter_name : transportForm.reporter_name}
                        onChange={(e) => {
                          if (activeCategory === 'food') {
                            setFoodForm({ ...foodForm, reporter_name: e.target.value });
                          } else {
                            setTransportForm({ ...transportForm, reporter_name: e.target.value });
                          }
                        }}
                        placeholder="e.g. Ramesh Kumar"
                        className="w-full px-3.5 py-2.5 bg-white text-[#17324F] placeholder-[#64748B] border border-[#CBD5E1] rounded-xl text-base focus:border-[#16877F] focus:ring-2 focus:ring-[#16877F]/30 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#17324F] uppercase tracking-wider mb-1">
                        Contact Phone Number
                      </label>
                      <input
                        type="tel"
                        value={activeCategory === 'food' ? foodForm.reporter_phone : transportForm.reporter_phone}
                        onChange={(e) => {
                          if (activeCategory === 'food') {
                            setFoodForm({ ...foodForm, reporter_phone: e.target.value });
                          } else {
                            setTransportForm({ ...transportForm, reporter_phone: e.target.value });
                          }
                        }}
                        placeholder="e.g. +91 98765 43210"
                        className="w-full px-3.5 py-2.5 bg-white text-[#17324F] placeholder-[#64748B] border border-[#CBD5E1] rounded-xl text-base focus:border-[#16877F] focus:ring-2 focus:ring-[#16877F]/30 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* CATEGORY 1: FOOD ASSISTANCE FIELDS */}
                  {activeCategory === 'food' && (
                    <div className="space-y-4 pt-1 animate-fade-in">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                        <div>
                          <label className="block text-xs font-bold text-[#17324F] uppercase tracking-wider mb-1">
                            Food Type <span className="text-red-500">*</span>
                          </label>
                          <select
                            value={foodForm.food_type}
                            onChange={(e) => setFoodForm({ ...foodForm, food_type: e.target.value })}
                            className="w-full px-3 py-2.5 bg-white text-[#17324F] border border-[#CBD5E1] rounded-xl text-base focus:border-[#16877F] focus:ring-2 focus:ring-[#16877F]/30 focus:outline-none"
                          >
                            <option value="Cooked Meals">Cooked Meals</option>
                            <option value="Dry Ration Kits">Dry Ration Kits</option>
                            <option value="Baby Food / Infant Nutrition">Baby Food / Infant Formula</option>
                            <option value="Clean Drinking Water Cans">Clean Drinking Water Cans</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-[#17324F] uppercase tracking-wider mb-1">
                            Quantity Needed <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={foodForm.required_quantity}
                            onChange={(e) => setFoodForm({ ...foodForm, required_quantity: e.target.value })}
                            placeholder="150"
                            className="w-full px-3.5 py-2.5 bg-white text-[#17324F] placeholder-[#64748B] border border-[#CBD5E1] rounded-xl text-base focus:border-[#16877F] focus:ring-2 focus:ring-[#16877F]/30 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-[#17324F] uppercase tracking-wider mb-1">
                            Unit
                          </label>
                          <select
                            value={foodForm.unit}
                            onChange={(e) => setFoodForm({ ...foodForm, unit: e.target.value })}
                            className="w-full px-3 py-2.5 bg-white text-[#17324F] border border-[#CBD5E1] rounded-xl text-base focus:border-[#16877F] focus:ring-2 focus:ring-[#16877F]/30 focus:outline-none"
                          >
                            <option value="meals">meals</option>
                            <option value="ration kits">ration kits</option>
                            <option value="packs">packs</option>
                            <option value="liters">liters</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div>
                          <label className="block text-xs font-bold text-[#17324F] uppercase tracking-wider mb-1">
                            Beneficiaries Count (Optional)
                          </label>
                          <input
                            type="text"
                            value={foodForm.people_count}
                            onChange={(e) => setFoodForm({ ...foodForm, people_count: e.target.value })}
                            placeholder="e.g. 150 people / 35 families"
                            className="w-full px-3.5 py-2.5 bg-white text-[#17324F] placeholder-[#64748B] border border-[#CBD5E1] rounded-xl text-base focus:border-[#16877F] focus:ring-2 focus:ring-[#16877F]/30 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-[#17324F] uppercase tracking-wider mb-1">
                            Delivery / Camp Location <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={foodForm.location_text}
                            onChange={(e) => setFoodForm({ ...foodForm, location_text: e.target.value })}
                            placeholder="e.g. Meppadi Panchayat Community Hall, Wayanad"
                            className="w-full px-3.5 py-2.5 bg-white text-[#17324F] placeholder-[#64748B] border border-[#CBD5E1] rounded-xl text-base focus:border-[#16877F] focus:ring-2 focus:ring-[#16877F]/30 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[#17324F] uppercase tracking-wider mb-1">
                          Urgency Level
                        </label>
                        <div className="grid grid-cols-4 gap-2">
                          {[
                            { id: 'critical', label: 'Critical (Immediate)', bg: 'hover:bg-red-50 text-red-700 border-red-300', active: 'bg-red-700 text-white border-red-700' },
                            { id: 'high', label: 'High (< 4h)', bg: 'hover:bg-amber-50 text-amber-700 border-amber-300', active: 'bg-amber-600 text-white border-amber-600' },
                            { id: 'medium', label: 'Medium (Today)', bg: 'hover:bg-teal-50 text-teal-700 border-teal-300', active: 'bg-teal-600 text-white border-teal-600' },
                            { id: 'low', label: 'Low (Planned)', bg: 'hover:bg-slate-100 text-[#526277] border-slate-300', active: 'bg-slate-700 text-white border-slate-700' },
                          ].map((lvl) => (
                            <button
                              key={lvl.id}
                              type="button"
                              onClick={() => setFoodForm({ ...foodForm, urgency: lvl.id })}
                              className={`py-2 px-1 text-center rounded-xl text-xs font-bold border transition cursor-pointer ${
                                foodForm.urgency === lvl.id ? lvl.active : lvl.bg
                              }`}
                            >
                              {lvl.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[#17324F] uppercase tracking-wider mb-1">
                          Dietary / Spoilage Notes (Optional)
                        </label>
                        <input
                          type="text"
                          value={foodForm.notes}
                          onChange={(e) => setFoodForm({ ...foodForm, notes: e.target.value })}
                          placeholder="e.g. Vegetarian preferred, infant formula needed, no refrigeration"
                          className="w-full px-3.5 py-2.5 bg-white text-[#17324F] placeholder-[#64748B] border border-[#CBD5E1] rounded-xl text-base focus:border-[#16877F] focus:ring-2 focus:ring-[#16877F]/30 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[#17324F] uppercase tracking-wider mb-1">
                          Situation &amp; Access Details <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          rows={3}
                          required
                          value={foodForm.description}
                          onChange={(e) => setFoodForm({ ...foodForm, description: e.target.value })}
                          placeholder="Describe the stranded situation, access bottlenecks, or immediate needs..."
                          className="w-full px-3.5 py-2.5 bg-white text-[#17324F] placeholder-[#64748B] border border-[#CBD5E1] rounded-xl text-base focus:border-[#16877F] focus:ring-2 focus:ring-[#16877F]/30 focus:outline-none resize-none"
                        />
                      </div>
                    </div>
                  )}

                  {/* CATEGORY 2: EMERGENCY TRANSPORT FIELDS */}
                  {activeCategory === 'transport' && (
                    <div className="space-y-4 pt-1 animate-fade-in">
                      <div>
                        <label className="block text-xs font-bold text-[#17324F] uppercase tracking-wider mb-1">
                          Transport Purpose <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={transportForm.transport_purpose}
                          onChange={(e) => setTransportForm({ ...transportForm, transport_purpose: e.target.value })}
                          className="w-full px-3 py-2.5 bg-white text-[#17324F] border border-[#CBD5E1] rounded-xl text-base focus:border-[#16877F] focus:ring-2 focus:ring-[#16877F]/30 focus:outline-none"
                        >
                          <option value="Evacuation of stranded persons">Evacuation of stranded persons</option>
                          <option value="Moving medical patients">Moving medical patients / Emergency medical transit</option>
                          <option value="Transporting relief cargo">Transporting relief cargo / rations</option>
                          <option value="Personnel / Volunteer transit">Personnel / Responder field transit</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div>
                          <label className="block text-xs font-bold text-[#17324F] uppercase tracking-wider mb-1">
                            Pickup Location <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={transportForm.pickup_location}
                            onChange={(e) => setTransportForm({ ...transportForm, pickup_location: e.target.value })}
                            placeholder="e.g. Near St. Joseph Church, Chooralmala"
                            className="w-full px-3.5 py-2.5 bg-white text-[#17324F] placeholder-[#64748B] border border-[#CBD5E1] rounded-xl text-base focus:border-[#16877F] focus:ring-2 focus:ring-[#16877F]/30 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-[#17324F] uppercase tracking-wider mb-1">
                            Drop-off Destination <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={transportForm.dropoff_location}
                            onChange={(e) => setTransportForm({ ...transportForm, dropoff_location: e.target.value })}
                            placeholder="e.g. Meppadi Primary Health Centre or Wayanad Relief Hub"
                            className="w-full px-3.5 py-2.5 bg-white text-[#17324F] placeholder-[#64748B] border border-[#CBD5E1] rounded-xl text-base focus:border-[#16877F] focus:ring-2 focus:ring-[#16877F]/30 focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Transport Payload Type: People vs Cargo */}
                      <div className="p-3 bg-slate-50 border border-[#CBD5E1] rounded-xl space-y-3">
                        <div className="flex items-center gap-4">
                          <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="transport_type"
                              checked={transportForm.transport_type === 'people'}
                              onChange={() => setTransportForm({ ...transportForm, transport_type: 'people' })}
                              className="text-[#16877F] focus:ring-[#16877F]"
                            />
                            <span className="text-sm font-bold text-[#17324F]">Evacuating People</span>
                          </label>
                          <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="transport_type"
                              checked={transportForm.transport_type === 'cargo'}
                              onChange={() => setTransportForm({ ...transportForm, transport_type: 'cargo' })}
                              className="text-[#16877F] focus:ring-[#16877F]"
                            />
                            <span className="text-sm font-bold text-[#17324F]">Moving Supplies / Cargo</span>
                          </label>
                        </div>

                        {transportForm.transport_type === 'people' ? (
                          <div>
                            <label className="block text-xs font-semibold text-[#526277] mb-1">
                              Number of People (Passengers)
                            </label>
                            <input
                              type="text"
                              value={transportForm.people_count}
                              onChange={(e) => setTransportForm({ ...transportForm, people_count: e.target.value })}
                              placeholder="e.g. 18 people (including 3 elderly and 2 infants)"
                              className="w-full px-3.5 py-2 bg-white text-[#17324F] placeholder-[#64748B] border border-[#CBD5E1] rounded-lg text-sm focus:border-[#16877F] focus:ring-1 focus:ring-[#16877F] focus:outline-none"
                            />
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <div className="sm:col-span-2">
                              <label className="block text-xs font-semibold text-[#526277] mb-1">
                                Cargo Description
                              </label>
                              <input
                                type="text"
                                value={transportForm.cargo_description}
                                onChange={(e) => setTransportForm({ ...transportForm, cargo_description: e.target.value })}
                                placeholder="e.g. 80 carton boxes of medicines & water cans"
                                className="w-full px-3.5 py-2 bg-white text-[#17324F] placeholder-[#64748B] border border-[#CBD5E1] rounded-lg text-sm focus:border-[#16877F] focus:ring-1 focus:ring-[#16877F] focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-[#526277] mb-1">
                                Quantity / Units
                              </label>
                              <input
                                type="text"
                                value={transportForm.cargo_quantity}
                                onChange={(e) => setTransportForm({ ...transportForm, cargo_quantity: e.target.value })}
                                placeholder="80 boxes"
                                className="w-full px-3.5 py-2 bg-white text-[#17324F] placeholder-[#64748B] border border-[#CBD5E1] rounded-lg text-sm focus:border-[#16877F] focus:ring-1 focus:ring-[#16877F] focus:outline-none"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div>
                          <label className="block text-xs font-bold text-[#17324F] uppercase tracking-wider mb-1">
                            Vehicle Type Required
                          </label>
                          <select
                            value={transportForm.vehicle_needed}
                            onChange={(e) => setTransportForm({ ...transportForm, vehicle_needed: e.target.value })}
                            className="w-full px-3 py-2.5 bg-white text-[#17324F] border border-[#CBD5E1] rounded-xl text-base focus:border-[#16877F] focus:ring-2 focus:ring-[#16877F]/30 focus:outline-none"
                          >
                            <option value="4x4 / Off-road Jeep">4x4 / Off-road Jeep</option>
                            <option value="Ambulance / Patient Van">Ambulance / Patient Transit Van</option>
                            <option value="Light Commercial Van / Tempo">Light Commercial Van / Tempo</option>
                            <option value="Heavy Truck (5+ Ton)">Heavy Truck (5+ Ton)</option>
                            <option value="Rescue Inflatable Boat">Rescue Inflatable Boat</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-[#17324F] uppercase tracking-wider mb-1">
                            Route Accessibility
                          </label>
                          <select
                            value={transportForm.route_condition}
                            onChange={(e) => setTransportForm({ ...transportForm, route_condition: e.target.value })}
                            className="w-full px-3 py-2.5 bg-white text-[#17324F] border border-[#CBD5E1] rounded-xl text-base focus:border-[#16877F] focus:ring-2 focus:ring-[#16877F]/30 focus:outline-none"
                          >
                            <option value="4WD accessible only">4WD accessible only</option>
                            <option value="Road flooded / mudslide risk">Road flooded / mudslide risk</option>
                            <option value="Bridge damaged / alternate route required">Bridge damaged / alternate route</option>
                            <option value="Normal paved road access">Normal paved road access</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[#17324F] uppercase tracking-wider mb-1">
                          Urgency Level
                        </label>
                        <div className="grid grid-cols-4 gap-2">
                          {[
                            { id: 'critical', label: 'Critical (Rescue)', bg: 'hover:bg-red-50 text-red-700 border-red-300', active: 'bg-red-700 text-white border-red-700' },
                            { id: 'high', label: 'High (< 3h)', bg: 'hover:bg-amber-50 text-amber-700 border-amber-300', active: 'bg-amber-600 text-white border-amber-600' },
                            { id: 'medium', label: 'Medium (Today)', bg: 'hover:bg-teal-50 text-teal-700 border-teal-300', active: 'bg-teal-600 text-white border-teal-600' },
                            { id: 'low', label: 'Low (Scheduled)', bg: 'hover:bg-slate-100 text-[#526277] border-slate-300', active: 'bg-slate-700 text-white border-slate-700' },
                          ].map((lvl) => (
                            <button
                              key={lvl.id}
                              type="button"
                              onClick={() => setTransportForm({ ...transportForm, urgency: lvl.id })}
                              className={`py-2 px-1 text-center rounded-xl text-xs font-bold border transition cursor-pointer ${
                                transportForm.urgency === lvl.id ? lvl.active : lvl.bg
                              }`}
                            >
                              {lvl.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[#17324F] uppercase tracking-wider mb-1">
                          Special Requirements (Optional)
                        </label>
                        <input
                          type="text"
                          value={transportForm.special_requirements}
                          onChange={(e) => setTransportForm({ ...transportForm, special_requirements: e.target.value })}
                          placeholder="e.g. Stretcher required, oxygen support on board, refrigerated transit"
                          className="w-full px-3.5 py-2.5 bg-white text-[#17324F] placeholder-[#64748B] border border-[#CBD5E1] rounded-xl text-base focus:border-[#16877F] focus:ring-2 focus:ring-[#16877F]/30 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[#17324F] uppercase tracking-wider mb-1">
                          Route Notes &amp; Transit Details <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          rows={3}
                          required
                          value={transportForm.description}
                          onChange={(e) => setTransportForm({ ...transportForm, description: e.target.value })}
                          placeholder="Describe terrain conditions, landmark directions, or patient conditions..."
                          className="w-full px-3.5 py-2.5 bg-white text-[#17324F] placeholder-[#64748B] border border-[#CBD5E1] rounded-xl text-base focus:border-[#16877F] focus:ring-2 focus:ring-[#16877F]/30 focus:outline-none resize-none"
                        />
                      </div>
                    </div>
                  )}

                  {/* Modal Action Buttons */}
                  <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#CBD5E1]">
                    <button
                      type="button"
                      onClick={() => setIsReportModalOpen(false)}
                      className="px-5 py-2.5 rounded-xl border border-[#CBD5E1] text-[#526277] hover:bg-slate-50 font-semibold text-sm transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingReport}
                      className="px-6 py-2.5 rounded-xl bg-red-700 hover:bg-red-800 disabled:bg-red-400 text-white font-bold text-sm shadow-xs transition flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                    >
                      {isSubmittingReport ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Routing to AI Engine...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          <span>Submit Emergency Report</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 2. IN-APP VOLUNTEER REGISTRATION MODAL                               */}
      {/* ==================================================================== */}
      {isVolunteerModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="volunteer-modal-title"
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-fade-in"
        >
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden transform transition-all">
            
            {/* Modal Header */}
            <div className="bg-[#17324F] px-6 py-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#16877F] text-white flex items-center justify-center shadow-inner">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="volunteer-modal-title" className="text-xl font-bold leading-tight">
                    Volunteer Registration
                  </h3>
                  <p className="text-xs text-slate-300">
                    Join the SETU on-ground disaster response network
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setIsVolunteerModalOpen(false); resetVolunteerModal(); }}
                className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto bg-white text-[#17324F]">
              
              {/* SUCCESS STATE */}
              {volunteerResult ? (
                <div className="space-y-6">
                  <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-3">
                    <div className="flex items-center gap-2.5 text-emerald-800 font-bold text-lg">
                      <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                      <span>Volunteer Successfully Registered</span>
                    </div>
                    <p className="text-sm text-emerald-900 leading-relaxed">
                      Your responder profile has been created and synced with the active SETU dispatch system.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs sm:text-sm">
                    <div className="p-3.5 bg-slate-50 border border-[#CBD5E1] rounded-xl space-y-1">
                      <span className="text-[#526277] font-semibold block">Volunteer ID</span>
                      <span className="font-mono font-bold text-[#17324F]">
                        {volunteerResult.id || 'VOL-REG'}
                      </span>
                    </div>

                    <div className="p-3.5 bg-slate-50 border border-[#CBD5E1] rounded-xl space-y-1">
                      <span className="text-[#526277] font-semibold block">Role Assignment</span>
                      <span className="font-bold text-[#16877F]">
                        {volunteerResult.role_title || 'Field Aid Volunteer'}
                      </span>
                    </div>

                    <div className="p-3.5 bg-slate-50 border border-[#CBD5E1] rounded-xl space-y-1 sm:col-span-2">
                      <span className="text-[#526277] font-semibold block">Registered Name &amp; Base</span>
                      <span className="font-bold text-[#17324F]">
                        {volunteerResult.name} • {volunteerResult.location || 'Wayanad'}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-2 flex flex-col sm:flex-row gap-3">
                    <Link
                      to="/volunteer-dashboard"
                      className="flex-1 min-h-[44px] px-5 py-2.5 bg-[#16877F] hover:bg-teal-800 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-xs transition"
                    >
                      <Users className="w-4 h-4" />
                      <span>Open Volunteer Dashboard</span>
                    </Link>
                    <button
                      type="button"
                      onClick={resetVolunteerModal}
                      className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-[#17324F] font-bold text-sm rounded-xl transition cursor-pointer"
                    >
                      Register Another Volunteer
                    </button>
                  </div>
                </div>
              ) : (
                /* FORM INPUT STATE */
                <form onSubmit={handleVolunteerSubmit} className="space-y-4">
                  {volunteerError && (
                    <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                      <span>{volunteerError}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-xs font-bold text-[#17324F] uppercase tracking-wider mb-1">
                        Full Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={volunteerForm.name}
                        onChange={(e) => setVolunteerForm({ ...volunteerForm, name: e.target.value })}
                        placeholder="e.g. Rahul Sharma"
                        className="w-full px-3.5 py-2.5 bg-white text-[#17324F] placeholder-[#64748B] border border-[#CBD5E1] rounded-xl text-base focus:border-[#16877F] focus:ring-2 focus:ring-[#16877F]/30 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#17324F] uppercase tracking-wider mb-1">
                        Phone Number <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        required
                        value={volunteerForm.phone}
                        onChange={(e) => setVolunteerForm({ ...volunteerForm, phone: e.target.value })}
                        placeholder="e.g. +91 98765 43210"
                        className="w-full px-3.5 py-2.5 bg-white text-[#17324F] placeholder-[#64748B] border border-[#CBD5E1] rounded-xl text-base focus:border-[#16877F] focus:ring-2 focus:ring-[#16877F]/30 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-xs font-bold text-[#17324F] uppercase tracking-wider mb-1">
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={volunteerForm.email}
                        onChange={(e) => setVolunteerForm({ ...volunteerForm, email: e.target.value })}
                        placeholder="e.g. rahul@responder.org"
                        className="w-full px-3.5 py-2.5 bg-white text-[#17324F] placeholder-[#64748B] border border-[#CBD5E1] rounded-xl text-base focus:border-[#16877F] focus:ring-2 focus:ring-[#16877F]/30 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#17324F] uppercase tracking-wider mb-1">
                        Base Location / District <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={volunteerForm.location}
                        onChange={(e) => setVolunteerForm({ ...volunteerForm, location: e.target.value })}
                        placeholder="e.g. Kalpetta, Wayanad"
                        className="w-full px-3.5 py-2.5 bg-white text-[#17324F] placeholder-[#64748B] border border-[#CBD5E1] rounded-xl text-base focus:border-[#16877F] focus:ring-2 focus:ring-[#16877F]/30 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-xs font-bold text-[#17324F] uppercase tracking-wider mb-1">
                        Operational Service Radius
                      </label>
                      <select
                        value={volunteerForm.service_radius}
                        onChange={(e) => setVolunteerForm({ ...volunteerForm, service_radius: e.target.value })}
                        className="w-full px-3 py-2.5 bg-white text-[#17324F] border border-[#CBD5E1] rounded-xl text-base focus:border-[#16877F] focus:ring-2 focus:ring-[#16877F]/30 focus:outline-none"
                      >
                        <option value="10 km">10 km radius</option>
                        <option value="25 km">25 km radius</option>
                        <option value="50 km">50 km radius</option>
                        <option value="Entire District">Entire District / Region</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#17324F] uppercase tracking-wider mb-1">
                        Availability
                      </label>
                      <select
                        value={volunteerForm.availability}
                        onChange={(e) => setVolunteerForm({ ...volunteerForm, availability: e.target.value })}
                        className="w-full px-3 py-2.5 bg-white text-[#17324F] border border-[#CBD5E1] rounded-xl text-base focus:border-[#16877F] focus:ring-2 focus:ring-[#16877F]/30 focus:outline-none"
                      >
                        <option value="Immediate / Full-time">Immediate / Full-time</option>
                        <option value="Weekends Only">Weekends Only</option>
                        <option value="On-call / Evenings">On-call / Evenings</option>
                        <option value="Flexible">Flexible Deployment</option>
                      </select>
                    </div>
                  </div>

                  {/* Skills Multi-Select Checkboxes */}
                  <div>
                    <label className="block text-xs font-bold text-[#17324F] uppercase tracking-wider mb-2">
                      Skills &amp; Capabilities <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {[
                        'First Aid / Medical',
                        'Food Distribution',
                        'Rescue / Evacuation',
                        'Driving / Transport',
                        'Camp Management',
                        'Translation / Communications',
                        'General Volunteer',
                      ].map((skill) => {
                        const isChecked = volunteerForm.skills.includes(skill);
                        return (
                          <button
                            key={skill}
                            type="button"
                            onClick={() => {
                              if (isChecked) {
                                setVolunteerForm({ ...volunteerForm, skills: volunteerForm.skills.filter((s) => s !== skill) });
                              } else {
                                setVolunteerForm({ ...volunteerForm, skills: [...volunteerForm.skills, skill] });
                              }
                            }}
                            className={`p-2.5 text-left rounded-xl text-xs sm:text-sm font-semibold border transition cursor-pointer flex items-center justify-between ${
                              isChecked
                                ? 'bg-teal-50 border-[#16877F] text-teal-950 font-bold'
                                : 'bg-white border-[#CBD5E1] text-[#526277] hover:border-slate-400'
                            }`}
                          >
                            <span>{skill}</span>
                            {isChecked && <Check className="w-3.5 h-3.5 text-[#16877F] shrink-0 ml-1" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Vehicle Access */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-xs font-bold text-[#17324F] uppercase tracking-wider mb-1">
                        Vehicle Access
                      </label>
                      <select
                        value={volunteerForm.vehicle_access}
                        onChange={(e) => setVolunteerForm({ ...volunteerForm, vehicle_access: e.target.value })}
                        className="w-full px-3 py-2.5 bg-white text-[#17324F] border border-[#CBD5E1] rounded-xl text-base focus:border-[#16877F] focus:ring-2 focus:ring-[#16877F]/30 focus:outline-none"
                      >
                        <option value="None / On Foot">None / On Foot</option>
                        <option value="Two-wheeler (Bike/Scooter)">Two-wheeler (Bike/Scooter)</option>
                        <option value="Four-wheeler (Car/SUV)">Four-wheeler (Car/SUV)</option>
                        <option value="Commercial (Truck/Tempo)">Commercial (Truck/Tempo)</option>
                        <option value="Rescue Boat">Rescue Boat</option>
                      </select>
                    </div>

                    {volunteerForm.vehicle_access !== 'None / On Foot' ? (
                      <div>
                        <label className="block text-xs font-bold text-[#17324F] uppercase tracking-wider mb-1">
                          Vehicle Capacity
                        </label>
                        <input
                          type="text"
                          value={volunteerForm.vehicle_capacity}
                          onChange={(e) => setVolunteerForm({ ...volunteerForm, vehicle_capacity: e.target.value })}
                          placeholder="e.g. 4 passengers or 400 kg cargo"
                          className="w-full px-3.5 py-2.5 bg-white text-[#17324F] placeholder-[#64748B] border border-[#CBD5E1] rounded-xl text-base focus:border-[#16877F] focus:ring-2 focus:ring-[#16877F]/30 focus:outline-none"
                        />
                      </div>
                    ) : (
                      <div className="flex items-center text-xs text-[#526277] pt-6">
                        <span>Deployable on-foot at neighborhood relief centers.</span>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-3 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[#CBD5E1]">
                    <a
                      href={GOOGLE_FORMS.volunteer}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs sm:text-sm text-[#16877F] hover:underline font-semibold flex items-center gap-1 order-2 sm:order-1"
                    >
                      <span>Use Google Form Instead</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>

                    <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end order-1 sm:order-2">
                      <button
                        type="button"
                        onClick={() => setIsVolunteerModalOpen(false)}
                        className="px-5 py-2.5 rounded-xl border border-[#CBD5E1] text-[#526277] hover:bg-slate-50 font-semibold text-sm transition cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingVolunteer}
                        className="px-6 py-2.5 rounded-xl bg-[#16877F] hover:bg-teal-800 disabled:bg-teal-400 text-white font-bold text-sm shadow-xs transition flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                      >
                        {isSubmittingVolunteer ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Registering Volunteer...</span>
                          </>
                        ) : (
                          <>
                            <Users className="w-4 h-4" />
                            <span>Register as Volunteer</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 3. IN-APP NGO REGISTRATION MODAL                                     */}
      {/* ==================================================================== */}
      {isNgoModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ngo-modal-title"
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-fade-in"
        >
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden transform transition-all">
            
            {/* Modal Header */}
            <div className="bg-[#17324F] px-6 py-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-800 text-teal-400 flex items-center justify-center shadow-inner border border-slate-700">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="ngo-modal-title" className="text-xl font-bold leading-tight">
                    Register Humanitarian Organization
                  </h3>
                  <p className="text-xs text-slate-300">
                    Connect your relief inventory &amp; depot to SETU coordination
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setIsNgoModalOpen(false); resetNgoModal(); }}
                className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto bg-white text-[#17324F]">
              
              {/* SUCCESS STATE */}
              {ngoResult ? (
                <div className="space-y-6">
                  <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-3">
                    <div className="flex items-center gap-2.5 text-emerald-800 font-bold text-lg">
                      <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                      <span>Organization Registered with SETU Registry</span>
                    </div>
                    <p className="text-sm text-emerald-900 leading-relaxed">
                      Your relief organization has been onboarded to SETU coordination network.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs sm:text-sm">
                    <div className="p-3.5 bg-slate-50 border border-[#CBD5E1] rounded-xl space-y-1">
                      <span className="text-[#526277] font-semibold block">Organization ID</span>
                      <span className="font-mono font-bold text-[#17324F]">
                        {ngoResult.id || 'NGO-REG'}
                      </span>
                    </div>

                    <div className="p-3.5 bg-slate-50 border border-[#CBD5E1] rounded-xl space-y-1">
                      <span className="text-[#526277] font-semibold block">Coordinator</span>
                      <span className="font-bold text-[#17324F]">
                        {ngoResult.coordinator_name || 'Designated Lead'}
                      </span>
                    </div>

                    <div className="p-3.5 bg-slate-50 border border-[#CBD5E1] rounded-xl space-y-1 sm:col-span-2">
                      <span className="text-[#526277] font-semibold block">Organization &amp; Depot</span>
                      <span className="font-bold text-[#17324F]">
                        {ngoResult.name} • {ngoResult.location_text || 'Relief Depot'}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-2 flex flex-col sm:flex-row gap-3">
                    <Link
                      to="/ngo-dashboard"
                      className="flex-1 min-h-[44px] px-5 py-2.5 bg-[#17324F] hover:bg-[#0E2338] text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-xs transition"
                    >
                      <Building2 className="w-4 h-4 text-teal-400" />
                      <span>Open NGO Depot Dashboard</span>
                    </Link>
                    <button
                      type="button"
                      onClick={resetNgoModal}
                      className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-[#17324F] font-bold text-sm rounded-xl transition cursor-pointer"
                    >
                      Register Another Organization
                    </button>
                  </div>
                </div>
              ) : (
                /* FORM INPUT STATE */
                <form onSubmit={handleNgoSubmit} className="space-y-4">
                  {ngoError && (
                    <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                      <span>{ngoError}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-xs font-bold text-[#17324F] uppercase tracking-wider mb-1">
                        Organization Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={ngoForm.ngo_name}
                        onChange={(e) => setNgoForm({ ...ngoForm, ngo_name: e.target.value })}
                        placeholder="e.g. Kerala Relief Trust"
                        className="w-full px-3.5 py-2.5 bg-white text-[#17324F] placeholder-[#64748B] border border-[#CBD5E1] rounded-xl text-base focus:border-[#16877F] focus:ring-2 focus:ring-[#16877F]/30 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#17324F] uppercase tracking-wider mb-1">
                        Coordinator / Contact Person <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={ngoForm.coordinator_name}
                        onChange={(e) => setNgoForm({ ...ngoForm, coordinator_name: e.target.value })}
                        placeholder="e.g. S. Radhakrishnan"
                        className="w-full px-3.5 py-2.5 bg-white text-[#17324F] placeholder-[#64748B] border border-[#CBD5E1] rounded-xl text-base focus:border-[#16877F] focus:ring-2 focus:ring-[#16877F]/30 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-xs font-bold text-[#17324F] uppercase tracking-wider mb-1">
                        Phone Number <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        required
                        value={ngoForm.phone}
                        onChange={(e) => setNgoForm({ ...ngoForm, phone: e.target.value })}
                        placeholder="e.g. +91 4936 200333"
                        className="w-full px-3.5 py-2.5 bg-white text-[#17324F] placeholder-[#64748B] border border-[#CBD5E1] rounded-xl text-base focus:border-[#16877F] focus:ring-2 focus:ring-[#16877F]/30 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#17324F] uppercase tracking-wider mb-1">
                        Official Email <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        value={ngoForm.email}
                        onChange={(e) => setNgoForm({ ...ngoForm, email: e.target.value })}
                        placeholder="e.g. coordinator@keralatrust.org"
                        className="w-full px-3.5 py-2.5 bg-white text-[#17324F] placeholder-[#64748B] border border-[#CBD5E1] rounded-xl text-base focus:border-[#16877F] focus:ring-2 focus:ring-[#16877F]/30 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-xs font-bold text-[#17324F] uppercase tracking-wider mb-1">
                        Base Depot / HQ Location <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={ngoForm.location}
                        onChange={(e) => setNgoForm({ ...ngoForm, location: e.target.value })}
                        placeholder="e.g. Central Relief Depot, Sultan Bathery"
                        className="w-full px-3.5 py-2.5 bg-white text-[#17324F] placeholder-[#64748B] border border-[#CBD5E1] rounded-xl text-base focus:border-[#16877F] focus:ring-2 focus:ring-[#16877F]/30 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#17324F] uppercase tracking-wider mb-1">
                        Service Coverage Radius
                      </label>
                      <select
                        value={ngoForm.coverage_radius}
                        onChange={(e) => setNgoForm({ ...ngoForm, coverage_radius: e.target.value })}
                        className="w-full px-3 py-2.5 bg-white text-[#17324F] border border-[#CBD5E1] rounded-xl text-base focus:border-[#16877F] focus:ring-2 focus:ring-[#16877F]/30 focus:outline-none"
                      >
                        <option value="15 km">15 km radius</option>
                        <option value="25 km">25 km radius</option>
                        <option value="35 km">35 km radius</option>
                        <option value="50 km">50 km radius</option>
                        <option value="100 km">100 km radius / State-wide</option>
                      </select>
                    </div>
                  </div>

                  {/* Relief Assistance Types Offered */}
                  <div>
                    <label className="block text-xs font-bold text-[#17324F] uppercase tracking-wider mb-2">
                      Relief Assistance Types Offered <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {[
                        'Food / Rations',
                        'Drinking Water',
                        'Medical Supplies',
                        'Emergency Transport',
                        'Temporary Shelter',
                        'Sanitation / Hygiene',
                      ].map((type) => {
                        const isChecked = ngoForm.assistance_types.includes(type);
                        return (
                          <button
                            key={type}
                            type="button"
                            onClick={() => {
                              if (isChecked) {
                                setNgoForm({ ...ngoForm, assistance_types: ngoForm.assistance_types.filter((t) => t !== type) });
                              } else {
                                setNgoForm({ ...ngoForm, assistance_types: [...ngoForm.assistance_types, type] });
                              }
                            }}
                            className={`p-2.5 text-left rounded-xl text-xs sm:text-sm font-semibold border transition cursor-pointer flex items-center justify-between ${
                              isChecked
                                ? 'bg-slate-100 border-[#17324F] text-[#17324F] font-bold ring-1 ring-[#17324F]'
                                : 'bg-white border-[#CBD5E1] text-[#526277] hover:border-slate-400'
                            }`}
                          >
                            <span>{type}</span>
                            {isChecked && <Check className="w-3.5 h-3.5 text-[#17324F] shrink-0 ml-1" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#17324F] uppercase tracking-wider mb-1">
                      Warehouse Capacity &amp; Logistics Notes (Optional)
                    </label>
                    <textarea
                      rows={2}
                      value={ngoForm.capacity_notes}
                      onChange={(e) => setNgoForm({ ...ngoForm, capacity_notes: e.target.value })}
                      placeholder="e.g. 500 ration kits ready for distribution, 2 transport vans on standby..."
                      className="w-full px-3.5 py-2.5 bg-white text-[#17324F] placeholder-[#64748B] border border-[#CBD5E1] rounded-xl text-base focus:border-[#16877F] focus:ring-2 focus:ring-[#16877F]/30 focus:outline-none resize-none"
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-3 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[#CBD5E1]">
                    <a
                      href={GOOGLE_FORMS.ngo}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs sm:text-sm text-[#16877F] hover:underline font-semibold flex items-center gap-1 order-2 sm:order-1"
                    >
                      <span>Use Google Form Instead</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>

                    <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end order-1 sm:order-2">
                      <button
                        type="button"
                        onClick={() => setIsNgoModalOpen(false)}
                        className="px-5 py-2.5 rounded-xl border border-[#CBD5E1] text-[#526277] hover:bg-slate-50 font-semibold text-sm transition cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingNgo}
                        className="px-6 py-2.5 rounded-xl bg-[#17324F] hover:bg-[#0E2338] disabled:bg-slate-500 text-white font-bold text-sm shadow-xs transition flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                      >
                        {isSubmittingNgo ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Registering NGO...</span>
                          </>
                        ) : (
                          <>
                            <Building2 className="w-4 h-4 text-teal-400" />
                            <span>Register Organization</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
