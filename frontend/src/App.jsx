<<<<<<< HEAD
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import DashboardPage from './pages/DashboardPage';
import NgoDashboardPage from './pages/NgoDashboardPage';
import VolunteerDashboardPage from './pages/VolunteerDashboardPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Project Landing Page as the Root Route */}
        <Route path="/" element={<LandingPage />} />

        {/* Dedicated Role-Specific NGO Dashboard */}
        <Route path="/ngo-dashboard" element={<NgoDashboardPage />} />

        {/* Dedicated Role-Specific Volunteer Dashboard */}
        <Route path="/volunteer-dashboard" element={<VolunteerDashboardPage />} />

        {/* Operational Coordinator Operations Dashboard */}
        <Route path="/dashboard" element={<DashboardPage />} />

        {/* Catch-all redirect to public landing page */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
=======
import React, { useState, useEffect, useId } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldCheck,
  MapPin,
  Users,
  HeartHandshake,
  RefreshCw,
  Send,
  Radio,
  FileText,
  Building2,
  Phone,
  Eye,
  Check,
  AlertCircle,
  HelpCircle,
  Sparkles,
  Search,
  Filter
} from 'lucide-react';
import ApiService from './services/api';

export default function App() {
  const intakeTextareaId = useId();
  const intakeLocationId = useId();
  // --------------------------------------------------------------------------
  // Application State
  // --------------------------------------------------------------------------
  const [needs, setNeeds] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [systemMode, setSystemMode] = useState(ApiService.isMockMode() ? 'mock' : 'live');
  const [systemHealth, setSystemHealth] = useState(null);

  // Form Inputs
  const [reportText, setReportText] = useState('');
  const [locationText, setLocationText] = useState('');
  const [reporterPhone, setReporterPhone] = useState('');

  // UI Filters & Modals
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNeed, setSelectedNeed] = useState(null);
  const [feedbackToast, setFeedbackToast] = useState(null);

  // --------------------------------------------------------------------------
  // Lifecycle & Polling
  // --------------------------------------------------------------------------
  useEffect(() => {
    loadData();
    checkHealth();
  }, [systemMode]);

  const showToast = (message, type = 'success') => {
    setFeedbackToast({ message, type });
    setTimeout(() => {
      setFeedbackToast(null);
    }, 5000);
  };

  const checkHealth = async () => {
    const health = await ApiService.getHealth();
    setSystemHealth(health);
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [needsRes, assignRes] = await Promise.all([
        ApiService.getNeeds(),
        ApiService.getActiveAssignments(),
      ]);

      if (needsRes.ok) {
        setNeeds(needsRes.data || []);
      } else {
        showToast(needsRes.error || 'Failed to load needs feed', 'error');
      }

      if (assignRes.ok) {
        setAssignments(assignRes.data || []);
      }
    } catch (err) {
      showToast('Network error while fetching updates', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // Handler: Switch System Mode (Mock vs Live FastAPI)
  // --------------------------------------------------------------------------
  const toggleSystemMode = () => {
    const nextMode = systemMode === 'mock' ? 'live' : 'mock';
    ApiService.setMockMode(nextMode === 'mock');
    setSystemMode(nextMode);
    showToast(
      nextMode === 'mock'
        ? 'Switched to Simulated Mock Mode (Offline-Ready)'
        : 'Connecting to Live FastAPI Backend at http://localhost:8000',
      'info'
    );
  };

  const handleResetDemoData = () => {
    if (window.confirm('Reset all demo records back to the initial Golden Path state?')) {
      ApiService.resetDatabase();
      loadData();
      showToast('Demo records reset to default scenario', 'info');
    }
  };

  // --------------------------------------------------------------------------
  // Handler: Submit Emergency Report (Panel A)
  // --------------------------------------------------------------------------
  const handleSubmitReport = async (e) => {
    e.preventDefault();
    if (!reportText.trim()) {
      showToast('Please describe the emergency situation in detail.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await ApiService.submitEmergencyReport({
        description: reportText.trim(),
        location_text: locationText.trim(),
        reporter_phone: reporterPhone.trim(),
      });

      if (res.ok) {
        setReportText('');
        setLocationText('');
        setReporterPhone('');
        showToast('Emergency report received! AI extraction & trust assessment completed.', 'success');
        await loadData();
      } else {
        showToast(res.error || 'Could not submit report to server.', 'error');
      }
    } catch (err) {
      showToast('Encountered an unexpected error during submission.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // --------------------------------------------------------------------------
  // Handlers: Responder Dispatch Actions (Panel B)
  // --------------------------------------------------------------------------
  const handleAcceptAssignment = async (assignmentId) => {
    setActionLoadingId(assignmentId);
    try {
      const res = await ApiService.acceptAssignment(assignmentId, 'V001');
      if (res.ok) {
        showToast('Assignment accepted! Status updated to in-progress.', 'success');
        await loadData();
      } else {
        showToast(res.error || 'Could not accept assignment.', 'error');
      }
    } catch (err) {
      showToast('Network error during assignment acceptance.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleResolveAssignment = async (assignmentId) => {
    setActionLoadingId(assignmentId);
    try {
      const res = await ApiService.resolveAssignment(
        assignmentId,
        'Relief goods delivered and verified on location.'
      );
      if (res.ok) {
        showToast('Success! Case marked as RESOLVED and finalized.', 'success');
        await loadData();
      } else {
        showToast(res.error || 'Could not mark assignment as resolved.', 'error');
      }
    } catch (err) {
      showToast('Network error while marking resolved.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // --------------------------------------------------------------------------
  // Filter Logic
  // --------------------------------------------------------------------------
  const filteredNeeds = needs.filter((item) => {
    const matchesFilter =
      statusFilter === 'ALL' ||
      (statusFilter === 'OPEN' && item.status === 'open') ||
      (statusFilter === 'ASSIGNED' && (item.status === 'assigned' || item.status === 'accepted')) ||
      (statusFilter === 'REVIEW' && item.status === 'under_review') ||
      (statusFilter === 'RESOLVED' && item.status === 'resolved');

    const matchesSearch =
      searchQuery.trim() === '' ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.location_text && item.location_text.toLowerCase().includes(searchQuery.toLowerCase())) ||
      item.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.need_type.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  // Derived counts for Top Header
  const countTotal = needs.length;
  const countOpen = needs.filter((n) => n.status === 'open').length;
  const countAssigned = needs.filter((n) => n.status === 'assigned' || n.status === 'accepted').length;
  const countResolved = needs.filter((n) => n.status === 'resolved').length;
  const countReview = needs.filter((n) => n.status === 'under_review').length;

  // Active responder assignments (assigned or accepted)
  const activeResponderList = assignments.filter((a) => a.status !== 'resolved');

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col selection:bg-teal-100">
      
      {/* -------------------------------------------------------------------- */}
      {/* 1. TOP HEADER - High Contrast, Accessible, Tactile Controls           */}
      {/* -------------------------------------------------------------------- */}
      <header className="bg-[#0F172A] text-white border-b-4 border-teal-600 shadow-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
          
          {/* Brand Identity & Title */}
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-lg bg-teal-600 flex items-center justify-center shadow-inner text-white font-black text-2xl tracking-wider border border-teal-400">
              SETU
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                  Disaster Response &amp; Emergency Hub
                </h1>
                <span className="hidden sm:inline-block bg-teal-900 text-teal-300 text-xs px-2.5 py-0.5 rounded font-mono font-semibold border border-teal-700">
                  BUILD 4.0
                </span>
              </div>
              <p className="text-slate-300 text-sm font-normal">
                Autonomous Need Intelligence, Verification &amp; Rapid Dispatch
              </p>
            </div>
          </div>

          {/* Quick Incident Metrics */}
          <div className="flex items-center gap-2 sm:gap-4 bg-slate-800/90 px-3.5 py-1.5 rounded-lg border border-slate-700">
            <div className="text-center px-2">
              <span className="block text-xl font-bold text-white leading-none">{countTotal}</span>
              <span className="text-xs uppercase tracking-wider text-slate-300 font-medium">Total</span>
            </div>
            <div className="h-7 w-px bg-slate-700"></div>
            <div className="text-center px-2">
              <span className="block text-xl font-bold text-red-400 leading-none">{countOpen}</span>
              <span className="text-xs uppercase tracking-wider text-red-300 font-medium">Unassigned</span>
            </div>
            <div className="h-7 w-px bg-slate-700"></div>
            <div className="text-center px-2">
              <span className="block text-xl font-bold text-teal-400 leading-none">{countAssigned}</span>
              <span className="text-xs uppercase tracking-wider text-teal-300 font-medium">Active</span>
            </div>
            <div className="h-7 w-px bg-slate-700"></div>
            <div className="text-center px-2">
              <span className="block text-xl font-bold text-green-400 leading-none">{countResolved}</span>
              <span className="text-xs uppercase tracking-wider text-green-300 font-medium">Resolved</span>
            </div>
          </div>

          {/* System Mode Switcher & Reload Action */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={toggleSystemMode}
              title="Click to toggle between local mock data and live FastAPI backend"
              className={`px-3 py-1.5 rounded-md text-sm font-semibold flex items-center gap-2 border transition-colors ${
                systemMode === 'mock'
                  ? 'bg-amber-900/40 text-amber-200 border-amber-600 hover:bg-amber-800/50'
                  : 'bg-emerald-900/40 text-emerald-200 border-emerald-500 hover:bg-emerald-800/50'
              }`}
            >
              <Radio className={`w-4 h-4 ${systemMode === 'mock' ? 'text-amber-400' : 'text-emerald-400 animate-pulse'}`} />
              <span>{systemMode === 'mock' ? 'Simulated Mock Mode' : 'Live FastAPI Backend'}</span>
            </button>

            <button
              onClick={loadData}
              disabled={isLoading}
              title="Refresh feeds"
              className="p-2 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md border border-slate-700 transition"
              aria-label="Refresh Data"
            >
              <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin text-teal-400' : ''}`} />
            </button>

            {systemMode === 'mock' && (
              <button
                onClick={handleResetDemoData}
                className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 font-mono"
                title="Reset mock data to initial Golden Path test scenario"
              >
                Reset Demo
              </button>
            )}
          </div>

        </div>
      </header>

      {/* -------------------------------------------------------------------- */}
      {/* Simulated Mode Banner Warning (Mandatory Hackathon Honesty Rule)      */}
      {/* -------------------------------------------------------------------- */}
      {systemMode === 'mock' && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2 text-sm font-medium flex items-center justify-between">
          <div className="max-w-7xl mx-auto w-full flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-700 flex-shrink-0" />
            <span>
              <strong>[DEMO DATA ACTIVE]:</strong> Operating with Section 5 simulated mock storage. Emergency AI structuring, trust scoring, and assignment transitions are currently running locally.
            </span>
          </div>
        </div>
      )}

      {/* Toast Feedback */}
      {feedbackToast && (
        <div className="fixed bottom-6 right-6 z-50 animate-bounce">
          <div
            className={`px-5 py-3.5 rounded-lg shadow-xl border-2 text-base font-semibold flex items-center gap-3 ${
              feedbackToast.type === 'error'
                ? 'bg-red-50 text-red-950 border-red-500'
                : feedbackToast.type === 'info'
                ? 'bg-teal-50 text-teal-950 border-teal-500'
                : 'bg-emerald-50 text-emerald-950 border-emerald-600'
            }`}
          >
            {feedbackToast.type === 'error' ? (
              <AlertTriangle className="w-6 h-6 text-red-600" />
            ) : (
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            )}
            <span>{feedbackToast.message}</span>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* MAIN TWO-COLUMN DASHBOARD LAYOUT                                     */}
      {/* Left Column: Intake & Dispatch Controls                              */}
      {/* Right Column: Live Coordinator Emergency Feed                         */}
      {/* -------------------------------------------------------------------- */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* ================================================================ */}
          {/* LEFT COLUMN: Panel A (Intake) & Panel B (Responder Dispatch)      */}
          {/* ================================================================ */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* -------------------------------------------------------------- */}
            {/* PANEL A: EMERGENCY REPORT INTAKE FORM (POST /needs)            */}
            {/* -------------------------------------------------------------- */}
            <section className="bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden">
              <div className="bg-slate-900 text-white px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <FileText className="w-5 h-5 text-teal-400" />
                  <h2 className="text-lg font-bold tracking-tight">Report Emergency (Intake)</h2>
                </div>
                <span className="text-xs bg-teal-800 text-teal-100 px-2 py-0.5 rounded font-mono">
                  POST /needs
                </span>
              </div>

              <form onSubmit={handleSubmitReport} className="p-5 space-y-4">
                <div>
                  <label htmlFor={intakeTextareaId} className="block text-base font-semibold text-slate-900 mb-1">
                    Describe Emergency Distress <span className="text-red-600">*</span>
                  </label>
                  <p className="text-sm text-slate-600 mb-2">
                    Enter raw description (e.g., people count, required food, medical aid, or boat rescue).
                  </p>
                  <textarea
                    id={intakeTextareaId}
                    rows={4}
                    value={reportText}
                    onChange={(e) => setReportText(e.target.value)}
                    placeholder="Example: 150 people at Meppadi Relief Camp need clean drinking water and medical dressings urgently."
                    required
                    className="w-full text-base p-3.5 bg-slate-50 border-2 border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:border-teal-600 focus:ring-2 focus:ring-teal-200 transition resize-y font-medium placeholder:text-slate-400"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor={intakeLocationId} className="block text-sm font-semibold text-slate-900 mb-1">
                      Location / Landmark
                    </label>
                    <div className="relative">
                      <MapPin className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                      <input
                        id={intakeLocationId}
                        type="text"
                        value={locationText}
                        onChange={(e) => setLocationText(e.target.value)}
                        placeholder="e.g. Wayanad Sector 4"
                        className="w-full text-base pl-10 pr-3 py-2.5 bg-slate-50 border-2 border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:border-teal-600 font-medium"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-1">
                      Contact Phone (Optional)
                    </label>
                    <div className="relative">
                      <Phone className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                      <input
                        type="tel"
                        value={reporterPhone}
                        onChange={(e) => setReporterPhone(e.target.value)}
                        placeholder="e.g. +91 98765 43210"
                        className="w-full text-base pl-10 pr-3 py-2.5 bg-slate-50 border-2 border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:border-teal-600 font-medium"
                      />
                    </div>
                  </div>
                </div>

                {/* Tactile 48px Minimum Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full min-h-[48px] px-6 py-3 bg-teal-700 hover:bg-teal-800 active:bg-teal-900 text-white font-bold text-base rounded-lg shadow transition flex items-center justify-center gap-2 border border-teal-800 focus:ring-4 focus:ring-teal-300 disabled:opacity-60 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      <span>Processing &amp; Structuring with AI...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      <span>Submit Emergency Report</span>
                    </>
                  )}
                </button>
              </form>
            </section>

            {/* -------------------------------------------------------------- */}
            {/* PANEL B: ACTIVE RESPONDER TASK & DISPATCH ACTIONS              */}
            {/* -------------------------------------------------------------- */}
            <section className="bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden">
              <div className="bg-slate-900 text-white px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <HeartHandshake className="w-5 h-5 text-emerald-400" />
                  <h2 className="text-lg font-bold tracking-tight">Active Responder Tasks</h2>
                </div>
                <span className="text-xs bg-emerald-800 text-emerald-100 px-2.5 py-0.5 rounded font-mono font-bold">
                  {activeResponderList.length} Active
                </span>
              </div>

              <div className="p-5 space-y-4">
                {activeResponderList.length === 0 ? (
                  <div className="text-center py-6 px-4 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                    <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
                    <p className="text-base font-semibold text-slate-800">No Pending Responder Tasks</p>
                    <p className="text-sm text-slate-500 mt-1">
                      All active assignments have been fulfilled or resolved.
                    </p>
                  </div>
                ) : (
                  activeResponderList.map((assignment) => {
                    const need = assignment.need;
                    const volunteer = assignment.volunteer;
                    const ngo = assignment.ngo;
                    const isAccepted = assignment.status === 'accepted';
                    const isProcessing = actionLoadingId === assignment.id;

                    return (
                      <div
                        key={assignment.id}
                        className="bg-slate-50 rounded-xl border-2 border-slate-300 p-4 space-y-3.5 hover:border-slate-400 transition"
                      >
                        {/* Task Card Header */}
                        <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-2.5">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold bg-slate-800 text-white px-2 py-0.5 rounded">
                                TASK #{assignment.id}
                              </span>
                              <span className="font-mono text-xs font-bold bg-teal-100 text-teal-800 px-2 py-0.5 rounded">
                                NEED #{assignment.need_id}
                              </span>
                            </div>
                            <h3 className="text-base font-bold text-slate-900 mt-1">
                              {need ? need.item : 'Relief Supply Item'}
                            </h3>
                          </div>

                          <span
                            className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider border ${
                              isAccepted
                                ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                : 'bg-amber-100 text-amber-900 border-amber-300'
                            }`}
                          >
                            {isAccepted ? 'In Progress' : 'Awaiting Acceptance'}
                          </span>
                        </div>

                        {/* Description & Location */}
                        <p className="text-sm font-medium text-slate-800 leading-relaxed">
                          {need ? need.description : 'Distress report details'}
                        </p>

                        <div className="text-sm text-slate-700 flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-teal-700 flex-shrink-0" />
                          <span className="font-semibold text-slate-900">Location:</span>{' '}
                          <span>{need ? need.location_text : 'Designated Sector'}</span>
                        </div>

                        {/* Matched Entities */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-white p-2.5 rounded-lg border border-slate-200">
                          <div>
                            <span className="text-slate-500 font-semibold block">ASSIGNED VOLUNTEER</span>
                            <span className="font-bold text-slate-900 text-sm">
                              {volunteer ? volunteer.name : 'Responder V001'}
                            </span>
                            <span className="text-slate-600 block">
                              Tier {volunteer ? volunteer.tier : 1} Verified Responder
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 font-semibold block">COORDINATING NGO</span>
                            <span className="font-bold text-slate-900 text-sm">
                              {ngo ? ngo.name : 'District Relief Agency'}
                            </span>
                            <span className="text-slate-600 block">
                              {ngo ? ngo.location_text : 'Relief Depot'}
                            </span>
                          </div>
                        </div>

                        {/* Large, Plain-Language Action Verbs (Tactile Minimum 48px) */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                          {!isAccepted ? (
                            <button
                              type="button"
                              disabled={isProcessing}
                              onClick={() => handleAcceptAssignment(assignment.id)}
                              className="w-full min-h-[48px] px-4 py-2.5 bg-teal-700 hover:bg-teal-800 active:bg-teal-900 text-white font-bold text-sm sm:text-base rounded-lg transition shadow flex items-center justify-center gap-2 border border-teal-800 focus:ring-4 focus:ring-teal-300 disabled:opacity-50 cursor-pointer"
                            >
                              {isProcessing ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                              ) : (
                                <Check className="w-5 h-5 text-teal-200" />
                              )}
                              <span>Accept This Assignment</span>
                            </button>
                          ) : (
                            <div className="flex items-center justify-center gap-2 bg-emerald-50 border border-emerald-300 text-emerald-800 text-sm font-bold rounded-lg px-3 py-2 min-h-[48px]">
                              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                              <span>Accepted by Responder</span>
                            </div>
                          )}

                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleResolveAssignment(assignment.id)}
                            className="w-full min-h-[48px] px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white font-bold text-sm sm:text-base rounded-lg transition shadow flex items-center justify-center gap-2 border border-emerald-800 focus:ring-4 focus:ring-emerald-300 disabled:opacity-50 cursor-pointer"
                          >
                            {isProcessing ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-5 h-5 text-emerald-200" />
                            )}
                            <span>Mark Task as Resolved</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

          </div>

          {/* ================================================================ */}
          {/* RIGHT COLUMN: Panel C (Coordinator Live Emergency Needs Feed)     */}
          {/* ================================================================ */}
          <div className="lg:col-span-7 space-y-4">
            
            {/* Feed Control Bar: Search & Status Filter Tabs */}
            <div className="bg-white p-4 rounded-xl border border-slate-300 shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Radio className="w-5 h-5 text-teal-700" />
                  <h2 className="text-xl font-bold text-slate-900">
                    Live Needs Coordination Feed
                  </h2>
                </div>

                {/* Search Bar */}
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by need or place..."
                    className="w-full text-sm pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:border-teal-600 font-medium"
                  />
                </div>
              </div>

              {/* Accessible Filter Tabs with High Contrast */}
              <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-200">
                {[
                  { key: 'ALL', label: `All (${countTotal})` },
                  { key: 'OPEN', label: `Unassigned (${countOpen})` },
                  { key: 'ASSIGNED', label: `Active (${countAssigned})` },
                  { key: 'REVIEW', label: `Under Review (${countReview})` },
                  { key: 'RESOLVED', label: `Resolved (${countResolved})` },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setStatusFilter(tab.key)}
                    className={`px-3.5 py-1.5 rounded-lg text-sm font-bold transition min-h-[38px] ${
                      statusFilter === tab.key
                        ? 'bg-slate-900 text-white shadow'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* List of Emergency Cards */}
            {isLoading ? (
              <div className="bg-white rounded-xl border border-slate-300 p-12 text-center">
                <RefreshCw className="w-8 h-8 text-teal-600 animate-spin mx-auto mb-3" />
                <p className="text-base font-bold text-slate-800">Updating Emergency Incident Feed...</p>
              </div>
            ) : filteredNeeds.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-300 p-12 text-center">
                <AlertCircle className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                <p className="text-base font-bold text-slate-800">No emergency records match this filter</p>
                <p className="text-sm text-slate-500 mt-1">
                  Try clearing your search query or selecting a different status filter.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredNeeds.map((need) => {
                  const isCritical = need.severity === 'critical';
                  const isHigh = need.severity === 'high';
                  const isMedium = need.severity === 'medium';
                  const isResolved = need.status === 'resolved';

                  // Dynamic high-contrast border indicator on left edge
                  const borderHighlight = isResolved
                    ? 'border-l-8 border-l-emerald-600'
                    : isCritical
                    ? 'border-l-8 border-l-red-600'
                    : isHigh
                    ? 'border-l-8 border-l-amber-600'
                    : 'border-l-8 border-l-teal-600';

                  return (
                    <article
                      key={need.id}
                      className={`bg-white rounded-xl border border-slate-300 shadow-sm hover:shadow-md transition p-5 ${borderHighlight}`}
                    >
                      {/* Card Header: Badges & ID */}
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-bold bg-slate-900 text-white px-2.5 py-0.5 rounded">
                            {need.id}
                          </span>

                          {/* Severity Badge */}
                          <span
                            className={`text-xs px-2.5 py-1 rounded font-bold uppercase tracking-wider border ${
                              isCritical
                                ? 'bg-red-100 text-red-900 border-red-400'
                                : isHigh
                                ? 'bg-amber-100 text-amber-900 border-amber-400'
                                : 'bg-teal-100 text-teal-900 border-teal-300'
                            }`}
                          >
                            Severity: {need.severity || 'Medium'}
                          </span>

                          {/* Category Badge */}
                          <span className="text-xs px-2.5 py-1 rounded bg-slate-100 text-slate-800 font-bold uppercase border border-slate-300">
                            {need.need_type || 'General'}
                          </span>
                        </div>

                        {/* Status Badge */}
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider border ${
                              need.status === 'resolved'
                                ? 'bg-emerald-100 text-emerald-900 border-emerald-400'
                                : need.status === 'assigned' || need.status === 'accepted'
                                ? 'bg-teal-100 text-teal-900 border-teal-400'
                                : need.status === 'under_review'
                                ? 'bg-amber-100 text-amber-900 border-amber-400'
                                : 'bg-red-50 text-red-900 border-red-300'
                            }`}
                          >
                            Status: {need.status.replace('_', ' ')}
                          </span>
                        </div>
                      </div>

                      {/* Main Emergency Description */}
                      <p className="text-base sm:text-lg font-bold text-slate-900 leading-snug mb-3">
                        {need.description}
                      </p>

                      {/* Structured Details Matrix */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 py-2.5 px-3 bg-slate-50 rounded-lg border border-slate-200 text-sm mb-3.5">
                        <div>
                          <span className="text-slate-500 font-semibold text-xs block uppercase">Required Relief</span>
                          <span className="font-bold text-slate-900">
                            {need.quantity} {need.unit || 'units'} ({need.item || need.need_type})
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 font-semibold text-xs block uppercase">Location</span>
                          <span className="font-bold text-slate-900 flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-teal-700 inline" />
                            {need.location_text || 'Coordinates available'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 font-semibold text-xs block uppercase">
                            Verification Confidence
                          </span>
                          <span className="font-bold text-slate-900 flex items-center gap-1">
                            <ShieldCheck className="w-4 h-4 text-emerald-600 inline" />
                            {need.trust_score || need.trust_result?.trust_score || 85}% Score
                          </span>
                        </div>
                      </div>

                      {/* Human-Readable Trust Factors / Explainability */}
                      {need.trust_result && need.trust_result.reasons && (
                        <div className="bg-teal-50/70 border border-teal-200 rounded-lg p-3 text-xs sm:text-sm text-teal-950 mb-3.5">
                          <div className="flex items-center gap-1.5 font-bold mb-1 text-teal-900">
                            <Sparkles className="w-4 h-4 text-teal-700" />
                            <span>Trust &amp; Verification Assessment:</span>
                            {need.trust_result.duplicate_suspected && (
                              <span className="bg-amber-200 text-amber-900 text-xs px-2 py-0.5 rounded font-bold ml-auto">
                                Duplicate Suspected
                              </span>
                            )}
                          </div>
                          <ul className="list-disc list-inside space-y-0.5 font-medium text-slate-800">
                            {need.trust_result.reasons.map((reason, idx) => (
                              <li key={idx}>{reason}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Assignment & NGO Details Banner */}
                      {need.assignment && (
                        <div className="bg-slate-100 border border-slate-300 rounded-lg p-3 text-xs sm:text-sm text-slate-800 flex flex-wrap items-center justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-slate-700" />
                            <span>
                              <strong>NGO Partner:</strong> {need.ngo?.name || 'Kerala Relief Network'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-teal-700" />
                            <span>
                              <strong>Assigned Responder:</strong> {need.volunteer?.name || 'Volunteer V001'}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Card Action Row */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                        <span className="text-xs text-slate-500 font-medium">
                          Reported: {need.created_at ? new Date(need.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently'}
                        </span>

                        <button
                          type="button"
                          onClick={() => setSelectedNeed(need)}
                          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm rounded-lg flex items-center gap-1.5 transition min-h-[38px] cursor-pointer"
                        >
                          <Eye className="w-4 h-4 text-teal-400" />
                          <span>View Full Need Details</span>
                        </button>
                      </div>

                    </article>
                  );
                })}
              </div>
            )}

          </div>

        </div>
      </main>

      {/* -------------------------------------------------------------------- */}
      {/* NEED DETAIL MODAL (Item Details & Verification Inspection)            */}
      {/* -------------------------------------------------------------------- */}
      {selectedNeed && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl border-2 border-slate-300 max-w-2xl w-full p-6 shadow-2xl space-y-5 my-8">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="font-mono text-xs font-bold bg-slate-900 text-white px-2.5 py-1 rounded">
                  CASE FILE #{selectedNeed.id}
                </span>
                <h3 className="text-xl font-bold text-slate-900 mt-2">
                  Emergency Need Specification
                </h3>
              </div>
              <button
                onClick={() => setSelectedNeed(null)}
                className="text-slate-500 hover:text-slate-900 p-2 rounded-lg text-lg font-bold"
                aria-label="Close Case File"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="space-y-4 text-base">
              <div>
                <span className="text-xs font-bold uppercase text-slate-500 block mb-1">Raw Report Narrative</span>
                <p className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-slate-900 font-medium">
                  {selectedNeed.description}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-xs font-bold uppercase text-slate-500 block">Identified Need</span>
                  <span className="font-bold text-slate-900 text-base">{selectedNeed.item}</span>
                  <span className="text-xs text-slate-600 block">Category: {selectedNeed.need_type}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-xs font-bold uppercase text-slate-500 block">Requested Volume</span>
                  <span className="font-bold text-slate-900 text-base">
                    {selectedNeed.quantity} {selectedNeed.unit}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-xs font-bold uppercase text-slate-500 block">Incident Location</span>
                  <span className="font-bold text-slate-900 text-base">{selectedNeed.location_text}</span>
                  <span className="text-xs text-slate-600 block">
                    Lat: {selectedNeed.latitude || '11.6854'}, Lng: {selectedNeed.longitude || '76.1320'}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-xs font-bold uppercase text-slate-500 block">Operational Status</span>
                  <span className="font-bold text-teal-800 text-base uppercase">
                    {selectedNeed.status.replace('_', ' ')}
                  </span>
                </div>
              </div>

              {/* Trust Reasons Inspection */}
              {selectedNeed.trust_result && (
                <div className="p-4 bg-teal-50 border border-teal-200 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-teal-900 text-sm flex items-center gap-1.5">
                      <ShieldCheck className="w-5 h-5 text-teal-700" />
                      Trust Assessment Factors (Score: {selectedNeed.trust_result.trust_score}%)
                    </span>
                    <span className="text-xs font-bold uppercase bg-teal-200 text-teal-900 px-2 py-0.5 rounded">
                      Decision: {selectedNeed.trust_result.decision}
                    </span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-sm text-slate-800 font-medium">
                    {selectedNeed.trust_result.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Matched NGO & Volunteer Details */}
              {selectedNeed.assignment ? (
                <div className="p-4 bg-slate-100 border border-slate-300 rounded-lg space-y-2">
                  <h4 className="font-bold text-slate-900 text-sm uppercase tracking-wider">
                    Matched Dispatch Logistics
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-xs text-slate-500 font-semibold block">NGO ALLOCATION</span>
                      <span className="font-bold text-slate-900">{selectedNeed.ngo?.name || 'Kerala Relief Network'}</span>
                      <span className="text-xs text-slate-600 block">{selectedNeed.ngo?.location_text || 'Central Hub'}</span>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500 font-semibold block">DISPATCHED RESPONDER</span>
                      <span className="font-bold text-slate-900">{selectedNeed.volunteer?.name || 'Rahul Sharma'}</span>
                      <span className="text-xs text-slate-600 block">Phone: {selectedNeed.volunteer?.phone || '+91 98765 43210'}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
                  <strong>Dispatch Status:</strong> No responder currently attached. Case is awaiting assignment.
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-slate-200 pt-3 flex justify-end">
              <button
                onClick={() => setSelectedNeed(null)}
                className="min-h-[48px] px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-base rounded-lg transition"
              >
                Close Case Details
              </button>
            </div>

          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* FOOTER - Accessible Hackathon Documentation & Integrity              */}
      {/* -------------------------------------------------------------------- */}
      <footer className="bg-slate-900 text-slate-400 border-t border-slate-800 py-6 text-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="font-medium text-slate-300">
              SETU — Smart Emergency Coordination Platform (Team Build 4.0)
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Strictly adheres to summary.md Section 5 schema &amp; Section 6 API routes.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="bg-slate-800 px-3 py-1 rounded text-slate-300 border border-slate-700">
              Branch: feature/abhijeet-frontend
            </span>
            <span className="bg-slate-800 px-3 py-1 rounded text-slate-300 border border-slate-700">
              Engine: React 18 + Vite
            </span>
          </div>
        </div>
      </footer>

    </div>
>>>>>>> fb6763c (feat(frontend): deliver Hour-10 golden-path accessible emergency dashboard)
  );
}
