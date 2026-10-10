import React, { useState, useEffect, useRef } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
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
  Sparkles,
  Search,
  Layers,
  Activity,
  X
} from 'lucide-react';
import { Link } from 'react-router-dom';
import ApiService from '../services/api';
import SetuLogo from '../components/SetuLogo';

export default function DashboardPage() {
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

  // UI Filters, Search, Modals
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNeed, setSelectedNeed] = useState(null);
  const [feedbackToast, setFeedbackToast] = useState(null);

  // Accessible element references for guidance actions
  const reportFormRef = useRef(null);
  const prioritySectionRef = useRef(null);
  const reportInputRef = useRef(null);

  // --------------------------------------------------------------------------
  // Lifecycle & Health Monitoring
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
        showToast(needsRes.error || 'Failed to load emergency needs feed', 'error');
      }

      if (assignRes.ok) {
        setAssignments(assignRes.data || []);
      }
    } catch {
      showToast('Network error while fetching updates', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // Guidance Actions (Welcome Section CTAs)
  // --------------------------------------------------------------------------
  const scrollToReportForm = () => {
    if (reportFormRef.current) {
      reportFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => {
        if (reportInputRef.current) {
          reportInputRef.current.focus();
        }
      }, 500);
    }
  };

  const scrollToUrgentCases = () => {
    setStatusFilter('ATTENTION');
    if (prioritySectionRef.current) {
      prioritySectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // --------------------------------------------------------------------------
  // System Mode Controls
  // --------------------------------------------------------------------------
  const toggleSystemMode = () => {
    const nextMode = systemMode === 'mock' ? 'live' : 'mock';
    ApiService.setMockMode(nextMode === 'mock');
    setSystemMode(nextMode);
    showToast(
      nextMode === 'mock'
        ? 'Switched to DEMO MODE — Using sample emergency data'
        : 'Connecting to backend at http://localhost:8000...',
      'info'
    );
  };

  const handleResetDemoData = () => {
    if (window.confirm('Reset all demo emergency records to their initial state?')) {
      ApiService.resetDatabase();
      loadData();
      showToast('Sample emergency records have been reset', 'info');
    }
  };

  // --------------------------------------------------------------------------
  // Form Submission (Report an Emergency)
  // --------------------------------------------------------------------------
  const handleSubmitReport = async (e) => {
    e.preventDefault();
    if (!reportText.trim()) {
      showToast('Please enter what help or supplies are needed.', 'error');
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
        showToast(
          systemMode === 'mock'
            ? 'Emergency report recorded! (Processed locally with sample data)'
            : 'Emergency report successfully submitted to dispatch!',
          'success'
        );
        await loadData();
      } else {
        showToast(res.error || 'Could not submit emergency report.', 'error');
      }
    } catch {
      showToast('An unexpected network error occurred while submitting.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // --------------------------------------------------------------------------
  // Responder Action Handlers
  // --------------------------------------------------------------------------
  const handleAcceptAssignment = async (assignmentId) => {
    setActionLoadingId(assignmentId);
    try {
      const res = await ApiService.acceptAssignment(assignmentId, 'V001');
      if (res.ok) {
        showToast('Assignment accepted! Status updated to In Progress.', 'success');
        await loadData();
      } else {
        showToast(res.error || 'Could not accept assignment.', 'error');
      }
    } catch {
      showToast('Network error while accepting assignment.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleResolveAssignment = async (assignmentId) => {
    setActionLoadingId(assignmentId);
    try {
      const res = await ApiService.resolveAssignment(
        assignmentId,
        'Relief aid delivered and verified on site.'
      );
      if (res.ok) {
        showToast('Success! Case marked as Resolved.', 'success');
        await loadData();
      } else {
        showToast(res.error || 'Could not resolve assignment.', 'error');
      }
    } catch {
      showToast('Network error while marking case resolved.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // --------------------------------------------------------------------------
  // Plain-Language Helper Labels (Translations for Display Only)
  // --------------------------------------------------------------------------
  const getSeverityInfo = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'critical':
        return {
          label: 'Critical — Immediate attention',
          badgeClass: 'bg-red-100 text-red-900 border-red-400 font-bold',
          borderClass: 'border-l-8 border-l-red-600',
        };
      case 'high':
        return {
          label: 'High priority',
          badgeClass: 'bg-amber-100 text-amber-900 border-amber-400 font-bold',
          borderClass: 'border-l-8 border-l-amber-600',
        };
      case 'medium':
        return {
          label: 'Medium priority',
          badgeClass: 'bg-teal-50 text-teal-900 border-teal-300 font-semibold',
          borderClass: 'border-l-8 border-l-teal-600',
        };
      default:
        return {
          label: 'Standard priority',
          badgeClass: 'bg-slate-100 text-slate-800 border-slate-300 font-semibold',
          borderClass: 'border-l-8 border-l-slate-400',
        };
    }
  };

  const getStatusLabel = (status) => {
    switch (status?.toLowerCase()) {
      case 'open':
        return 'Awaiting responder';
      case 'assigned':
        return 'Assigned to responder';
      case 'accepted':
        return 'Assignment in progress';
      case 'under_review':
        return 'Needs verification';
      case 'secondary_review':
        return 'Secondary AI review (held for coordinator)';
      case 'resolved':
        return 'Resolved';
      default:
        return status ? status.replace('_', ' ') : 'Under review';
    }
  };

  const getVerificationLabel = (verification_status, trust_score) => {
    if (verification_status === 'review' || verification_status === 'pending') {
      return 'Needs verification';
    }
    return trust_score >= 80 ? 'Verified report' : 'Preliminary check';
  };

  // --------------------------------------------------------------------------
  // Derived Data & Filtering
  // --------------------------------------------------------------------------
  // Attention cases: Critical, High urgency, or needing verification, and not yet resolved
  const attentionNeeds = needs.filter(
    (n) =>
      n.status !== 'resolved' &&
      (n.severity === 'critical' || n.severity === 'high' || n.status === 'under_review' || n.status === 'secondary_review' || n.status === 'open')
  );

  // Summary counts
  const countTotal = needs.length;
  const countAttention = attentionNeeds.length;
  const countActiveAssignments = needs.filter(
    (n) => n.status === 'assigned' || n.status === 'accepted'
  ).length;
  const countResolved = needs.filter((n) => n.status === 'resolved').length;
  const countOpen = needs.filter((n) => n.status === 'open').length;
  const countReview = needs.filter((n) => n.status === 'under_review' || n.status === 'secondary_review').length;

  // Active responder tasks (Panel B)
  const activeResponderList = assignments.filter((a) => a.status !== 'resolved');

  // Filtered list for feed
  const filteredNeeds = needs.filter((item) => {
    let matchesFilter = true;
    if (statusFilter === 'ATTENTION') {
      matchesFilter =
        item.status !== 'resolved' &&
        (item.severity === 'critical' ||
          item.severity === 'high' ||
          item.status === 'under_review' ||
          item.status === 'secondary_review' ||
          item.status === 'open');
    } else if (statusFilter === 'OPEN') {
      matchesFilter = item.status === 'open';
    } else if (statusFilter === 'ASSIGNED') {
      matchesFilter = item.status === 'assigned' || item.status === 'accepted';
    } else if (statusFilter === 'REVIEW') {
      matchesFilter = item.status === 'under_review' || item.status === 'secondary_review';
    } else if (statusFilter === 'RESOLVED') {
      matchesFilter = item.status === 'resolved';
    }

    const matchesSearch =
      searchQuery.trim() === '' ||
      item.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.location_text?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.item?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.need_type?.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col font-sans selection:bg-teal-100 selection:text-teal-900">
      
      {/* -------------------------------------------------------------------- */}
      {/* 3A. HEADER                                                           */}
      {/* -------------------------------------------------------------------- */}
      <header className="bg-[#0F172A] text-white border-b-4 border-teal-600 shadow-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
          
          {/* Brand Identity & Explanation */}
          <div className="flex items-center space-x-2.5 sm:space-x-3.5 flex-wrap">
            <Link
              to="/"
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-teal-800 hover:bg-teal-700 text-teal-100 hover:text-white border border-teal-500 transition flex items-center gap-1 shadow-sm"
              title="Return to public homepage"
            >
              <span>← Public Site</span>
            </Link>
            <Link
              to="/ngo-dashboard"
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-teal-300 hover:text-white border border-slate-700 transition hidden sm:inline-flex items-center gap-1.5"
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>NGO Workspace</span>
            </Link>
            <Link
              to="/volunteer-dashboard"
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-teal-300 hover:text-white border border-slate-700 transition hidden sm:inline-flex items-center gap-1.5"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Volunteer Hub</span>
            </Link>
            <SetuLogo variant="dark" showTagline={false} iconSize={40} />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-slate-300 font-medium text-base sm:text-lg">
                  — Coordinator Dashboard
                </span>
              </div>
              <p className="text-slate-300 text-sm font-normal">
                Active incident management, verification &amp; responder dispatch operations.
              </p>
            </div>
          </div>

          {/* Mode Indicator & Connection Controls */}
          <div className="flex items-center flex-wrap gap-2.5">
            {systemMode === 'mock' ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold bg-amber-950/80 text-amber-200 border-2 border-amber-500 shadow-sm">
                  <Radio className="w-4 h-4 text-amber-400" />
                  <span>DEMO MODE — Using sample emergency data</span>
                </span>
                <button
                  type="button"
                  onClick={toggleSystemMode}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-200 hover:text-white hover:bg-slate-700 border border-slate-600 transition min-h-[36px]"
                  title="Switch to live backend mode"
                >
                  Connect to Backend
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {systemHealth?.ok ? (
                  <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold bg-emerald-950/80 text-emerald-200 border-2 border-emerald-500 shadow-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>CONNECTED — Backend Active</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold bg-red-950/80 text-red-200 border-2 border-red-500 shadow-sm">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <span>DISCONNECTED — Backend Unreachable</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={toggleSystemMode}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-200 hover:text-white hover:bg-slate-700 border border-slate-600 transition min-h-[36px]"
                  title="Switch back to sample demo mode"
                >
                  Switch to Demo Mode
                </button>
              </div>
            )}

            {/* Refresh Action */}
            <button
              type="button"
              onClick={loadData}
              disabled={isLoading}
              title="Refresh emergency data"
              className="p-2 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition"
              aria-label="Refresh emergency data"
            >
              <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin text-teal-400' : ''}`} />
            </button>

            {/* Reset Demo Option */}
            {systemMode === 'mock' && (
              <button
                type="button"
                onClick={handleResetDemoData}
                className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 font-mono transition"
                title="Reset sample records to default starting state"
              >
                Reset Demo
              </button>
            )}
          </div>

        </div>
      </header>

      {/* Toast Feedback */}
      {feedbackToast && (
        <div className="fixed bottom-6 right-6 z-50 animate-fade-in" role="alert">
          <div
            className={`px-5 py-4 rounded-xl shadow-2xl border-2 text-base font-semibold flex items-center gap-3.5 max-w-md ${
              feedbackToast.type === 'error'
                ? 'bg-red-50 text-red-950 border-red-500'
                : feedbackToast.type === 'info'
                ? 'bg-teal-50 text-teal-950 border-teal-600'
                : 'bg-emerald-50 text-emerald-950 border-emerald-600'
            }`}
          >
            {feedbackToast.type === 'error' ? (
              <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0" />
            ) : feedbackToast.type === 'info' ? (
              <AlertCircle className="w-6 h-6 text-teal-700 flex-shrink-0" />
            ) : (
              <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
            )}
            <span className="leading-snug">{feedbackToast.message}</span>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* 3B. WELCOME & GUIDANCE SECTION (FIRST-SCREEN HERO)                    */}
      {/* -------------------------------------------------------------------- */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            
            <div className="max-w-2xl space-y-2">
              <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-teal-800 bg-teal-50 px-3 py-1 rounded-full border border-teal-200 inline-block">
                Coordination Center
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] tracking-tight">
                Emergency Operations
              </h2>
              <p className="text-base sm:text-lg text-slate-700 leading-relaxed">
                Review urgent needs, check reports, and coordinate relief assignments from one place.
              </p>
            </div>

            {/* Two Visually Clear, Accessible Actions (>= 48px height) */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 flex-shrink-0">
              
              {/* Action 1: Submit Emergency Report */}
              <button
                type="button"
                onClick={scrollToReportForm}
                className="min-h-[48px] px-6 py-3 bg-[#0D9488] hover:bg-[#0F766E] active:bg-teal-900 text-white font-bold text-base rounded-xl shadow-md hover:shadow-lg transition flex items-center justify-center gap-2.5 border border-teal-700 focus:ring-4 focus:ring-teal-200 cursor-pointer"
              >
                <Send className="w-5 h-5 text-teal-100" />
                <span>Submit an Emergency Report</span>
              </button>

              {/* Action 2: Review Urgent Cases */}
              <button
                type="button"
                onClick={scrollToUrgentCases}
                className="min-h-[48px] px-6 py-3 bg-white hover:bg-slate-50 active:bg-slate-100 text-[#0F172A] font-bold text-base rounded-xl border-2 border-slate-300 hover:border-slate-400 shadow-sm transition flex items-center justify-center gap-2.5 focus:ring-4 focus:ring-slate-200 cursor-pointer"
              >
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <span>Review Urgent Cases ({countAttention})</span>
              </button>

            </div>

          </div>

          {/* ---------------------------------------------------------------- */}
          {/* 3C. SUMMARY METRIC CARDS (Calculated from Data, Clickable)       */}
          {/* ---------------------------------------------------------------- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 mt-8">
            
            {/* Card 1: Total Emergency Needs */}
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`p-5 rounded-xl border-2 text-left transition shadow-sm hover:shadow-md cursor-pointer ${
                statusFilter === 'ALL'
                  ? 'bg-slate-50 border-slate-900 ring-2 ring-slate-900/10'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-3xl sm:text-4xl font-extrabold text-[#0F172A] leading-none">
                  {countTotal}
                </span>
                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700">
                  <Layers className="w-5 h-5" />
                </div>
              </div>
              <h3 className="text-base font-bold text-[#0F172A] mt-2">
                Total Emergency Needs
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                All recorded cases in system
              </p>
            </button>

            {/* Card 2: Needs Requiring Attention */}
            <button
              type="button"
              onClick={() => {
                setStatusFilter('ATTENTION');
                if (prioritySectionRef.current) {
                  prioritySectionRef.current.scrollIntoView({ behavior: 'smooth' });
                }
              }}
              className={`p-5 rounded-xl border-2 text-left transition shadow-sm hover:shadow-md cursor-pointer ${
                statusFilter === 'ATTENTION'
                  ? 'bg-red-50 border-red-600 ring-2 ring-red-500/20'
                  : 'bg-white border-slate-200 hover:border-red-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-3xl sm:text-4xl font-extrabold text-red-600 leading-none">
                  {countAttention}
                </span>
                <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center text-red-700">
                  <AlertTriangle className="w-5 h-5" />
                </div>
              </div>
              <h3 className="text-base font-bold text-[#0F172A] mt-2">
                Needs Requiring Attention
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                Critical, unassigned, or unverified
              </p>
            </button>

            {/* Card 3: Active Assignments */}
            <button
              type="button"
              onClick={() => setStatusFilter('ASSIGNED')}
              className={`p-5 rounded-xl border-2 text-left transition shadow-sm hover:shadow-md cursor-pointer ${
                statusFilter === 'ASSIGNED'
                  ? 'bg-teal-50 border-teal-600 ring-2 ring-teal-500/20'
                  : 'bg-white border-slate-200 hover:border-teal-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-3xl sm:text-4xl font-extrabold text-[#0D9488] leading-none">
                  {countActiveAssignments}
                </span>
                <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center text-teal-800">
                  <Activity className="w-5 h-5" />
                </div>
              </div>
              <h3 className="text-base font-bold text-[#0F172A] mt-2">
                Active Assignments
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                Responders currently dispatched
              </p>
            </button>

            {/* Card 4: Resolved Cases */}
            <button
              type="button"
              onClick={() => setStatusFilter('RESOLVED')}
              className={`p-5 rounded-xl border-2 text-left transition shadow-sm hover:shadow-md cursor-pointer ${
                statusFilter === 'RESOLVED'
                  ? 'bg-emerald-50 border-emerald-600 ring-2 ring-emerald-500/20'
                  : 'bg-white border-slate-200 hover:border-emerald-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-3xl sm:text-4xl font-extrabold text-[#15803D] leading-none">
                  {countResolved}
                </span>
                <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-800">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              </div>
              <h3 className="text-base font-bold text-[#0F172A] mt-2">
                Resolved Cases
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                Relief completed successfully
              </p>
            </button>

          </div>

        </div>
      </section>

      {/* -------------------------------------------------------------------- */}
      {/* 3D. PRIORITY SECTION ("Needs Your Attention")                         */}
      {/* -------------------------------------------------------------------- */}
      <section ref={prioritySectionRef} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-4 w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-2xl font-extrabold text-[#0F172A] flex items-center gap-2.5">
              <AlertTriangle className="w-6 h-6 text-red-600" />
              <span>Needs Your Attention</span>
            </h2>
            <p className="text-sm sm:text-base text-slate-600 mt-0.5">
              High-urgency distress calls and unverified reports that require coordinator action.
            </p>
          </div>
          <span className="text-xs sm:text-sm font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-full border border-slate-300 self-start sm:self-auto">
            {attentionNeeds.length} {attentionNeeds.length === 1 ? 'case needs action' : 'cases need action'}
          </span>
        </div>

        {attentionNeeds.length === 0 ? (
          /* Reassuring Empty State */
          <div className="bg-white rounded-2xl border-2 border-emerald-200 p-8 text-center space-y-2 shadow-sm">
            <CheckCircle2 className="w-12 h-12 text-[#15803D] mx-auto" />
            <h3 className="text-lg font-bold text-slate-900">
              No Urgent Cases Pending
            </h3>
            <p className="text-base text-slate-600 max-w-md mx-auto">
              All high-urgency distress reports are currently assigned to responders or resolved.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {attentionNeeds.slice(0, 4).map((need) => {
              const sev = getSeverityInfo(need.severity);
              const statusText = getStatusLabel(need.status);
              const verificationText = getVerificationLabel(
                need.verification_status,
                need.trust_score || need.trust_result?.trust_score || 85
              );

              return (
                <div
                  key={need.id}
                  className={`bg-white rounded-xl border-2 border-slate-200 p-5 shadow-sm hover:shadow-md transition space-y-3.5 ${sev.borderClass}`}
                >
                  {/* Top Badges */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold bg-[#0F172A] text-white px-2.5 py-0.5 rounded">
                        #{need.id}
                      </span>
                      <span className={`text-xs px-2.5 py-1 rounded border ${sev.badgeClass}`}>
                        {sev.label}
                      </span>
                    </div>

                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-300">
                      {statusText}
                    </span>
                  </div>

                  {/* Description */}
                  <p className="text-base font-bold text-[#0F172A] leading-snug">
                    {need.description}
                  </p>

                  {/* Key Operational Details */}
                  <div className="grid grid-cols-2 gap-2 text-sm bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase block">Required Relief</span>
                      <span className="font-bold text-slate-900">
                        {need.quantity} {need.unit || 'units'} ({need.item || need.need_type})
                      </span>
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase block">Location</span>
                      <span className="font-bold text-slate-900 truncate block flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-teal-700 flex-shrink-0" />
                        <span className="truncate">{need.location_text || 'Coordinates available'}</span>
                      </span>
                    </div>
                  </div>

                  {/* Verification & Action */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-200">
                    <div className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-700">
                      <ShieldCheck className="w-4 h-4 text-emerald-700 flex-shrink-0" />
                      <span>{verificationText}</span>
                      <span className="text-slate-400">({need.trust_score || need.trust_result?.trust_score || 85}%)</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedNeed(need)}
                      className="min-h-[40px] px-4 py-2 bg-[#0F172A] hover:bg-slate-800 active:bg-black text-white font-bold text-xs sm:text-sm rounded-lg flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                    >
                      <Eye className="w-4 h-4 text-teal-400" />
                      <span>View Details</span>
                    </button>
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* -------------------------------------------------------------------- */}
      {/* MAIN TWO-COLUMN DASHBOARD WORKSPACE                                  */}
      {/* Left: Report Form + Active Responder Tasks                           */}
      {/* Right: Live Emergency Needs Feed                                     */}
      {/* -------------------------------------------------------------------- */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* ================================================================ */}
          {/* LEFT COLUMN: 4. Report Form & Active Responder Tasks              */}
          {/* ================================================================ */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* -------------------------------------------------------------- */}
            {/* 4. REPORT AN EMERGENCY FORM                                    */}
            {/* -------------------------------------------------------------- */}
            <section
              ref={reportFormRef}
              className="bg-white rounded-2xl border-2 border-slate-300 shadow-sm overflow-hidden"
            >
              <div className="bg-[#0F172A] text-white px-5 py-4 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <FileText className="w-5 h-5 text-teal-400" />
                  <h3 className="text-lg font-bold tracking-tight">Report an Emergency</h3>
                </div>
                <span className="text-xs bg-teal-900 text-teal-200 px-2.5 py-0.5 rounded font-mono font-semibold border border-teal-700">
                  Intake
                </span>
              </div>

              <form onSubmit={handleSubmitReport} className="p-5 space-y-4">
                
                <div>
                  <label htmlFor="report-textarea" className="block text-base font-bold text-[#0F172A] mb-1">
                    What help is needed? <span className="text-red-600">*</span>
                  </label>
                  <p className="text-sm text-slate-600 mb-2 leading-relaxed">
                    Please describe what supplies or assistance are needed, where, and for approximately how many people.
                  </p>
                  <textarea
                    id="report-textarea"
                    ref={reportInputRef}
                    rows={4}
                    value={reportText}
                    onChange={(e) => setReportText(e.target.value)}
                    placeholder="Example: 150 people at Meppadi Relief Camp urgently need drinking water and clean blankets."
                    required
                    className="w-full text-base p-3.5 bg-slate-50 border-2 border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:border-teal-600 focus:ring-2 focus:ring-teal-200 transition resize-y font-medium placeholder:text-slate-400"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label htmlFor="report-location" className="block text-sm font-bold text-[#0F172A] mb-1">
                      Location or Landmark
                    </label>
                    <div className="relative">
                      <MapPin className="w-5 h-5 absolute left-3 top-3 text-slate-400 pointer-events-none" />
                      <input
                        id="report-location"
                        type="text"
                        value={locationText}
                        onChange={(e) => setLocationText(e.target.value)}
                        placeholder="e.g. Meppadi High School"
                        className="w-full text-base pl-10 pr-3 py-2.5 bg-slate-50 border-2 border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:border-teal-600 font-medium"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="report-phone" className="block text-sm font-bold text-[#0F172A] mb-1">
                      Contact Phone (Optional)
                    </label>
                    <div className="relative">
                      <Phone className="w-5 h-5 absolute left-3 top-3 text-slate-400 pointer-events-none" />
                      <input
                        id="report-phone"
                        type="tel"
                        value={reporterPhone}
                        onChange={(e) => setReporterPhone(e.target.value)}
                        placeholder="e.g. +91 98765 43210"
                        className="w-full text-base pl-10 pr-3 py-2.5 bg-slate-50 border-2 border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:border-teal-600 font-medium"
                      />
                    </div>
                  </div>
                </div>

                {/* Tactile Submit Button (>= 48px Height) */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full min-h-[48px] px-6 py-3 bg-[#0D9488] hover:bg-[#0F766E] active:bg-teal-900 text-white font-bold text-base rounded-xl shadow-md transition flex items-center justify-center gap-2.5 border border-teal-800 focus:ring-4 focus:ring-teal-300 disabled:opacity-60 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      <span>Recording &amp; Analyzing Report...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      <span>Submit Emergency Report</span>
                    </>
                  )}
                </button>

                {systemMode === 'mock' && (
                  <p className="text-xs text-slate-500 text-center font-medium">
                    Notice: Operating in demo mode. This report will be processed locally using sample AI structuring and verification.
                  </p>
                )}
              </form>
            </section>

            {/* -------------------------------------------------------------- */}
            {/* ACTIVE RESPONDER TASKS (Panel B)                               */}
            {/* -------------------------------------------------------------- */}
            <section className="bg-white rounded-2xl border-2 border-slate-300 shadow-sm overflow-hidden">
              <div className="bg-[#0F172A] text-white px-5 py-4 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <HeartHandshake className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-lg font-bold tracking-tight">Active Responder Tasks</h3>
                </div>
                <span className="text-xs bg-emerald-900 text-emerald-200 px-2.5 py-0.5 rounded font-mono font-bold border border-emerald-700">
                  {activeResponderList.length} Active
                </span>
              </div>

              <div className="p-5 space-y-4">
                {activeResponderList.length === 0 ? (
                  <div className="text-center py-6 px-4 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                    <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
                    <p className="text-base font-bold text-slate-800">No Pending Tasks</p>
                    <p className="text-sm text-slate-600 mt-1">
                      All active assignments have been completed or resolved.
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
                        className="bg-slate-50 rounded-xl border-2 border-slate-300 p-4 space-y-3 hover:border-slate-400 transition"
                      >
                        {/* Task Header */}
                        <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-2.5">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold bg-[#0F172A] text-white px-2 py-0.5 rounded">
                                TASK #{assignment.id}
                              </span>
                              <span className="font-mono text-xs font-bold bg-teal-100 text-teal-900 px-2 py-0.5 rounded">
                                NEED #{assignment.need_id}
                              </span>
                            </div>
                            <h4 className="text-base font-bold text-slate-900 mt-1">
                              {need ? need.item : 'Relief Supply Distribution'}
                            </h4>
                          </div>

                          <span
                            className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider border ${
                              isAccepted
                                ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                : 'bg-amber-100 text-amber-900 border-amber-300'
                            }`}
                          >
                            {isAccepted ? 'Assignment in progress' : 'Awaiting acceptance'}
                          </span>
                        </div>

                        {/* Description & Location */}
                        <p className="text-sm font-medium text-slate-800 leading-relaxed">
                          {need ? need.description : 'Distress report'}
                        </p>

                        <div className="text-sm text-slate-700 flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-teal-700 flex-shrink-0" />
                          <span className="font-bold text-slate-900">Location:</span>{' '}
                          <span>{need ? need.location_text : 'Assigned Sector'}</span>
                        </div>

                        {/* Matched Entities */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-white p-2.5 rounded-lg border border-slate-200">
                          <div>
                            <span className="text-slate-500 font-bold block uppercase">Assigned Responder</span>
                            <span className="font-bold text-slate-900 text-sm">
                              {volunteer ? volunteer.name : 'Volunteer V001'}
                            </span>
                            <span className="text-slate-600 block">
                              Tier {volunteer ? volunteer.tier : 1} Verified Responder
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 font-bold block uppercase">Coordinating NGO</span>
                            <span className="font-bold text-slate-900 text-sm">
                              {ngo ? ngo.name : 'Relief Agency'}
                            </span>
                            <span className="text-slate-600 block">
                              {ngo ? ngo.location_text : 'Hub Depot'}
                            </span>
                          </div>
                        </div>

                        {/* Large, Tactile Buttons (>= 48px Height) */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                          {!isAccepted ? (
                            <button
                              type="button"
                              disabled={isProcessing}
                              onClick={() => handleAcceptAssignment(assignment.id)}
                              className="w-full min-h-[48px] px-4 py-2.5 bg-[#0D9488] hover:bg-[#0F766E] active:bg-teal-900 text-white font-bold text-sm sm:text-base rounded-xl transition shadow flex items-center justify-center gap-2 border border-teal-800 focus:ring-4 focus:ring-teal-200 disabled:opacity-50 cursor-pointer"
                            >
                              {isProcessing ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                              ) : (
                                <Check className="w-5 h-5 text-teal-200" />
                              )}
                              <span>Accept This Assignment</span>
                            </button>
                          ) : (
                            <div className="flex items-center justify-center gap-2 bg-emerald-50 border-2 border-emerald-300 text-emerald-900 text-sm font-bold rounded-xl px-3 py-2 min-h-[48px]">
                              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                              <span>Accepted by Responder</span>
                            </div>
                          )}

                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleResolveAssignment(assignment.id)}
                            className="w-full min-h-[48px] px-4 py-2.5 bg-[#15803D] hover:bg-emerald-800 active:bg-emerald-900 text-white font-bold text-sm sm:text-base rounded-xl transition shadow flex items-center justify-center gap-2 border border-emerald-800 focus:ring-4 focus:ring-emerald-200 disabled:opacity-50 cursor-pointer"
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
          {/* RIGHT COLUMN: Live Coordinator Emergency Needs Feed               */}
          {/* ================================================================ */}
          <div className="lg:col-span-7 space-y-4">
            
            {/* Filter and Search Bar */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border-2 border-slate-300 shadow-sm space-y-3.5">
              
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Activity className="w-5 h-5 text-teal-700" />
                  <h3 className="text-xl font-bold text-[#0F172A]">
                    Emergency Needs Feed
                  </h3>
                </div>

                {/* Search */}
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by need, place, or ID..."
                    className="w-full text-base pl-10 pr-3 py-2 bg-slate-50 border-2 border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:border-teal-600 font-medium"
                  />
                </div>
              </div>

              {/* Accessible Filter Tabs */}
              <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-200">
                {[
                  { key: 'ALL', label: `All Needs (${countTotal})` },
                  { key: 'ATTENTION', label: `Needs Attention (${countAttention})` },
                  { key: 'OPEN', label: `Awaiting Responder (${countOpen})` },
                  { key: 'ASSIGNED', label: `In Progress (${countActiveAssignments})` },
                  { key: 'REVIEW', label: `Needs Verification (${countReview})` },
                  { key: 'RESOLVED', label: `Resolved (${countResolved})` },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setStatusFilter(tab.key)}
                    className={`px-3.5 py-1.5 rounded-lg text-sm font-bold transition min-h-[38px] cursor-pointer ${
                      statusFilter === tab.key
                        ? 'bg-[#0F172A] text-white shadow'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

            </div>

            {/* List of Emergency Cards */}
            {isLoading ? (
              <div className="bg-white rounded-2xl border-2 border-slate-300 p-12 text-center">
                <RefreshCw className="w-8 h-8 text-teal-600 animate-spin mx-auto mb-3" />
                <p className="text-base font-bold text-slate-800">Updating emergency incidents...</p>
              </div>
            ) : filteredNeeds.length === 0 ? (
              <div className="bg-white rounded-2xl border-2 border-slate-300 p-12 text-center">
                <AlertCircle className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                <p className="text-base font-bold text-slate-800">No emergency records match this view</p>
                <p className="text-sm text-slate-500 mt-1">
                  Try clearing your search query or selecting a different filter tab above.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredNeeds.map((need) => {
                  const sev = getSeverityInfo(need.severity);
                  const isResolved = need.status === 'resolved';
                  const statusText = getStatusLabel(need.status);
                  const verificationText = getVerificationLabel(
                    need.verification_status,
                    need.trust_score || need.trust_result?.trust_score || 85
                  );

                  return (
                    <article
                      key={need.id}
                      className={`bg-white rounded-xl border-2 border-slate-300 shadow-sm hover:shadow-md transition p-5 ${
                        isResolved ? 'border-l-8 border-l-emerald-600' : sev.borderClass
                      }`}
                    >
                      {/* Card Header: Badges & ID */}
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-bold bg-[#0F172A] text-white px-2.5 py-0.5 rounded">
                            #{need.id}
                          </span>

                          <span className={`text-xs px-2.5 py-1 rounded border ${sev.badgeClass}`}>
                            {sev.label}
                          </span>

                          <span className="text-xs px-2.5 py-1 rounded bg-slate-100 text-slate-800 font-bold uppercase border border-slate-300">
                            {need.need_type || 'General'}
                          </span>
                        </div>

                        {/* Status Label */}
                        <span
                          className={`text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider border ${
                            isResolved
                              ? 'bg-emerald-100 text-emerald-900 border-emerald-400'
                              : need.status === 'assigned' || need.status === 'accepted'
                              ? 'bg-teal-100 text-teal-900 border-teal-400'
                              : need.status === 'under_review'
                              ? 'bg-amber-100 text-amber-900 border-amber-400'
                              : 'bg-red-50 text-red-900 border-red-300'
                          }`}
                        >
                          Status: {statusText}
                        </span>
                      </div>

                      {/* Main Emergency Description */}
                      <p className="text-base sm:text-lg font-bold text-[#0F172A] leading-snug mb-3">
                        {need.description}
                      </p>

                      {/* Structured Details Matrix */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 py-2.5 px-3 bg-slate-50 rounded-lg border border-slate-200 text-sm mb-3.5">
                        <div>
                          <span className="text-slate-500 font-bold text-xs block uppercase">Required Relief</span>
                          <span className="font-bold text-slate-900">
                            {need.quantity} {need.unit || 'units'} ({need.item || need.need_type})
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 font-bold text-xs block uppercase">Location</span>
                          <span className="font-bold text-slate-900 flex items-center gap-1 truncate">
                            <MapPin className="w-3.5 h-3.5 text-teal-700 flex-shrink-0" />
                            <span className="truncate">{need.location_text || 'Coordinates available'}</span>
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 font-bold text-xs block uppercase">
                            Report Verification
                          </span>
                          <span className="font-bold text-slate-900 flex items-center gap-1">
                            <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                            <span>{verificationText} ({need.trust_score || need.trust_result?.trust_score || 85}%)</span>
                          </span>
                        </div>
                      </div>

                      {/* Plain-Language Verification Reasons */}
                      {need.trust_result && need.trust_result.reasons && (
                        <div className="bg-teal-50/70 border border-teal-200 rounded-lg p-3 text-xs sm:text-sm text-teal-950 mb-3.5">
                          <div className="flex items-center gap-1.5 font-bold mb-1 text-teal-900">
                            <Sparkles className="w-4 h-4 text-teal-700" />
                            <span>Verification Explanation:</span>
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

                      {/* Matched NGO & Volunteer Details */}
                      {need.assignment && (
                        <div className="bg-slate-100 border border-slate-300 rounded-lg p-3 text-xs sm:text-sm text-slate-800 flex flex-wrap items-center justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-slate-700" />
                            <span>
                              <strong>Coordinating NGO:</strong> {need.ngo?.name || 'Kerala Relief Network'}
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
                          className="min-h-[40px] px-4 py-2 bg-[#0F172A] hover:bg-slate-800 text-white font-bold text-xs sm:text-sm rounded-lg flex items-center gap-1.5 transition cursor-pointer"
                        >
                          <Eye className="w-4 h-4 text-teal-400" />
                          <span>View Full Details</span>
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
      {/* NEED DETAIL MODAL                                                    */}
      {/* -------------------------------------------------------------------- */}
      {selectedNeed && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border-2 border-slate-300 max-w-2xl w-full p-6 shadow-2xl space-y-5 my-8">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="font-mono text-xs font-bold bg-[#0F172A] text-white px-2.5 py-1 rounded">
                  CASE FILE #{selectedNeed.id}
                </span>
                <h3 className="text-xl font-bold text-[#0F172A] mt-2">
                  Emergency Need Details
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedNeed(null)}
                className="text-slate-500 hover:text-slate-900 p-2 rounded-lg text-lg font-bold"
                aria-label="Close details dialog"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="space-y-4 text-base">
              <div>
                <span className="text-xs font-bold uppercase text-slate-500 block mb-1">
                  Report Description
                </span>
                <p className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-slate-900 font-medium">
                  {selectedNeed.description}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-xs font-bold uppercase text-slate-500 block">Requested Supplies</span>
                  <span className="font-bold text-slate-900 text-base">{selectedNeed.item}</span>
                  <span className="text-xs text-slate-600 block">Category: {selectedNeed.need_type}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-xs font-bold uppercase text-slate-500 block">Estimated Amount</span>
                  <span className="font-bold text-slate-900 text-base">
                    {selectedNeed.quantity} {selectedNeed.unit}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-xs font-bold uppercase text-slate-500 block">Location</span>
                  <span className="font-bold text-slate-900 text-base">{selectedNeed.location_text}</span>
                  <span className="text-xs text-slate-600 block">
                    Lat: {selectedNeed.latitude || '11.6854'}, Lng: {selectedNeed.longitude || '76.1320'}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-xs font-bold uppercase text-slate-500 block">Current Status</span>
                  <span className="font-bold text-teal-800 text-base">
                    {getStatusLabel(selectedNeed.status)}
                  </span>
                </div>
              </div>

              {/* Verification Assessment */}
              {selectedNeed.trust_result && (
                <div className="p-4 bg-teal-50 border border-teal-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-teal-900 text-sm flex items-center gap-1.5">
                      <ShieldCheck className="w-5 h-5 text-teal-700" />
                      Report Verification Assessment (Confidence: {selectedNeed.trust_result.trust_score}%)
                    </span>
                    <span className="text-xs font-bold uppercase bg-teal-200 text-teal-900 px-2 py-0.5 rounded">
                      {selectedNeed.trust_result.decision}
                    </span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-sm text-slate-800 font-medium">
                    {selectedNeed.trust_result.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Matched Entities */}
              {selectedNeed.assignment ? (
                <div className="p-4 bg-slate-100 border border-slate-300 rounded-xl space-y-2">
                  <h4 className="font-bold text-slate-900 text-sm uppercase tracking-wider">
                    Assigned Dispatch Details
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-xs text-slate-500 font-bold block uppercase">NGO Partner</span>
                      <span className="font-bold text-slate-900">{selectedNeed.ngo?.name || 'Kerala Relief Network'}</span>
                      <span className="text-xs text-slate-600 block">{selectedNeed.ngo?.location_text || 'Relief Hub'}</span>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500 font-bold block uppercase">Dispatched Responder</span>
                      <span className="font-bold text-slate-900">{selectedNeed.volunteer?.name || 'Rahul Sharma'}</span>
                      <span className="text-xs text-slate-600 block">Contact: {selectedNeed.volunteer?.phone || '+91 98765 43210'}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900">
                  <strong>Assignment Progress:</strong> No responder currently attached. Case is awaiting assignment.
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-slate-200 pt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedNeed(null)}
                className="min-h-[48px] px-6 py-2.5 bg-[#0F172A] hover:bg-slate-800 text-white font-bold text-base rounded-xl transition cursor-pointer"
              >
                Close Case Details
              </button>
            </div>

          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* FOOTER                                                               */}
      {/* -------------------------------------------------------------------- */}
      <footer className="bg-[#0F172A] text-slate-400 border-t border-slate-800 py-6 text-sm mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="font-bold text-slate-200 text-base">
              SETU — Disaster Response &amp; Emergency Coordination
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Helping teams coordinate emergency needs and relief responses with speed and clarity.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="bg-slate-800 px-3 py-1.5 rounded-lg text-slate-300 border border-slate-700">
              Branch: feature/abhijeet-frontend
            </span>
            <span className="bg-slate-800 px-3 py-1.5 rounded-lg text-slate-300 border border-slate-700">
              React 18 + Vite
            </span>
          </div>
        </div>
      </footer>

    </div>
  );
}
