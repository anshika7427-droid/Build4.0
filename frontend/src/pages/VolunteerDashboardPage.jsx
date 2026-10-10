import React, { useState, useEffect } from 'react';
import {
  Users,
  Building2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  MapPin,
  Navigation,
  Phone,
  RefreshCw,
  Check,
  ShieldCheck,
  Info,
  X,
  ExternalLink,
  AlertOctagon
} from 'lucide-react';
import ApiService from '../services/api';
import DashboardNavbar from '../components/DashboardNavbar';

export default function VolunteerDashboardPage() {
  // --------------------------------------------------------------------------
  // State
  // --------------------------------------------------------------------------
  const [volunteers, setVolunteers] = useState([]);
  const [selectedVolunteerId, setSelectedVolunteerId] = useState('V001');
  const [volunteer, setVolunteer] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [toast, setToast] = useState(null);
  const [systemMode, setSystemMode] = useState(ApiService.isMockMode() ? 'mock' : 'live');

  // Filter Tabs: 'ALL' | 'NEW' | 'IN_PROGRESS' | 'COMPLETED'
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Completion Modal State
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [activeTaskToResolve, setActiveTaskToResolve] = useState(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [isResolving, setIsResolving] = useState(false);

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------
  useEffect(() => {
    loadVolunteerData();
  }, [selectedVolunteerId, systemMode]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const loadVolunteerData = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch volunteers list for role switcher
      const volsRes = await ApiService.getVolunteers();
      if (volsRes.ok && Array.isArray(volsRes.data)) {
        setVolunteers(volsRes.data);
      }

      // 2. Fetch selected volunteer profile
      const volRes = await ApiService.getVolunteer(selectedVolunteerId);
      if (volRes.ok && volRes.data) {
        setVolunteer(volRes.data);
      } else {
        showToast(volRes.error || `Could not load volunteer ${selectedVolunteerId}`, 'error');
      }

      // 3. Fetch assignments specific to this volunteer
      const tasksRes = await ApiService.getVolunteerAssignments(selectedVolunteerId);
      if (tasksRes.ok && Array.isArray(tasksRes.data)) {
        setTasks(tasksRes.data);
      } else {
        showToast(tasksRes.error || 'Failed to load assigned tasks', 'error');
      }
    } catch {
      showToast('Network error loading volunteer assignments', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // Availability Toggle
  // --------------------------------------------------------------------------
  const handleToggleAvailability = async () => {
    if (!volunteer) return;
    const newStatus = !volunteer.available;
    try {
      const res = await ApiService.updateVolunteerAvailability(selectedVolunteerId, newStatus);
      if (res.ok) {
        setVolunteer({ ...volunteer, available: newStatus });
        showToast(
          newStatus
            ? 'Status updated: Available for emergency dispatch'
            : 'Status updated: Off-duty / Unavailable for dispatch',
          'info'
        );
      } else {
        showToast(res.error || 'Could not update availability', 'error');
      }
    } catch {
      showToast('Error saving availability status', 'error');
    }
  };

  // --------------------------------------------------------------------------
  // Mode Controls
  // --------------------------------------------------------------------------
  const toggleSystemMode = () => {
    const nextMode = systemMode === 'mock' ? 'live' : 'mock';
    ApiService.setMockMode(nextMode === 'mock');
    setSystemMode(nextMode);
    showToast(
      nextMode === 'mock'
        ? 'Switched to DEMO MODE — Using verified local sample responder records'
        : 'Connecting to live FastAPI backend at http://localhost:8000...',
      'info'
    );
  };

  // --------------------------------------------------------------------------
  // Field Actions
  // --------------------------------------------------------------------------
  const handleAcceptTask = async (taskId) => {
    setActionLoadingId(taskId);
    try {
      const res = await ApiService.acceptAssignment(taskId, selectedVolunteerId);
      if (res.ok) {
        showToast('Assignment accepted! Proceed with relief pickup.', 'success');
        await loadVolunteerData();
      } else {
        showToast(res.error || 'Could not accept assignment.', 'error');
      }
    } catch {
      showToast('Network error accepting assignment.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleStartTask = async (taskId) => {
    setActionLoadingId(taskId);
    try {
      const res = await ApiService.updateAssignmentProgress(taskId, 'En route with relief supplies');
      if (res.ok) {
        showToast('Mission marked In Progress (En Route). Travel safely!', 'success');
        await loadVolunteerData();
      } else {
        showToast(res.error || 'Could not update progress.', 'error');
      }
    } catch {
      showToast('Network error updating task progress.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const openResolveModal = (task) => {
    setActiveTaskToResolve(task);
    setResolutionNotes('Supplies successfully handed over to verified on-site lead.');
    setIsResolveModalOpen(true);
  };

  const handleConfirmResolve = async (e) => {
    e.preventDefault();
    if (!activeTaskToResolve) return;

    setIsResolving(true);
    try {
      const res = await ApiService.resolveAssignment(
        activeTaskToResolve.id,
        resolutionNotes.trim()
      );
      if (res.ok) {
        showToast('Success! Relief delivery confirmed and closed.', 'success');
        setIsResolveModalOpen(false);
        setActiveTaskToResolve(null);
        await loadVolunteerData();
      } else {
        showToast(res.error || 'Could not mark mission resolved.', 'error');
      }
    } catch {
      showToast('Network error reporting delivery completion.', 'error');
    } finally {
      setIsResolving(false);
    }
  };

  // --------------------------------------------------------------------------
  // Filtered Tasks
  // --------------------------------------------------------------------------
  const filteredTasks = tasks.filter((task) => {
    if (statusFilter === 'NEW') return task.status === 'assigned';
    if (statusFilter === 'IN_PROGRESS') return task.status === 'accepted' || task.status === 'in_progress';
    if (statusFilter === 'COMPLETED') return task.status === 'resolved';
    return true;
  });

  const newCount = tasks.filter((t) => t.status === 'assigned').length;
  const inProgressCount = tasks.filter((t) => t.status === 'accepted' || t.status === 'in_progress').length;
  const completedCount = tasks.filter((t) => t.status === 'resolved').length;

  return (
    <div className="min-h-screen bg-[#F7F9FC] text-[#17324F] font-sans selection:bg-teal-100 selection:text-teal-900 flex flex-col">
      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 border text-sm font-semibold transition-all duration-300 animate-slide-up ${
            toast.type === 'error'
              ? 'bg-red-50 text-red-900 border-red-300'
              : toast.type === 'info'
              ? 'bg-blue-50 text-blue-900 border-blue-300'
              : 'bg-teal-50 text-teal-900 border-teal-300'
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

      {/* ==================================================================== */}
      {/* 1. SHARED UNIFIED NAVBAR                                             */}
      {/* ==================================================================== */}
      <DashboardNavbar
        role="volunteer"
        roleBadge="FIELD RESPONDER"
        selectorIcon={Users}
        selectorLabel="Switch Demo Volunteer"
        selectorValue={selectedVolunteerId}
        selectorOptions={volunteers.map((v) => ({ id: v.id, label: `${v.name} (${v.id})` }))}
        onSelectorChange={setSelectedVolunteerId}
        systemMode={systemMode}
        onToggleMode={toggleSystemMode}
        otherDashboard={{
          to: '/ngo-dashboard',
          label: 'NGO Depot',
          icon: Building2,
        }}
      />

      {/* ==================================================================== */}
      {/* 2. BACKEND MATCHING & HACKATHON DISCLAIMER NOTICE                    */}
      {/* ==================================================================== */}
      <div className="bg-[#17324F] text-slate-200 border-b border-slate-700/80 py-2 px-4 text-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.2 rounded bg-teal-800 text-teal-200 font-bold uppercase text-[10px] shrink-0">
              Backend Assigned
            </span>
            <span className="text-slate-300 truncate">
              Showing assignments routed by the SETU backend matching engine for this responder.
            </span>
          </div>
          <span className="text-amber-300 font-medium shrink-0 hidden sm:inline text-[11px]">
            Demo Responder Workspace
          </span>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 3. VOLUNTEER IDENTITY & AVAILABILITY STATUS BAR                      */}
      {/* ==================================================================== */}
      <section className="bg-white border-b border-[#E1E8F0] py-4 sm:py-5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Profile Info */}
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black text-[#17324F] tracking-tight">
                  {volunteer?.name || 'Field Responder'}
                </h1>
                {volunteer?.verified && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-teal-50 text-[#16877F] border border-teal-200">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Tier {volunteer.tier} Responder</span>
                  </span>
                )}
                <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                  {selectedVolunteerId}
                </span>
              </div>
              <p className="text-xs text-[#526277] font-medium">
                {volunteer?.role_title || 'Emergency Logistics Responder'} • Skills: {volunteer?.skills?.join(', ').replace(/_/g, ' ') || 'field aid'}
              </p>
            </div>

            {/* Availability Toggle CTA */}
            <div className="flex items-center gap-2.5 self-start sm:self-auto shrink-0">
              <button
                type="button"
                onClick={handleToggleAvailability}
                className={`min-h-[40px] px-3.5 py-1.5 rounded-xl font-bold text-xs flex items-center gap-2 border transition shadow-xs ${
                  volunteer?.available
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100'
                    : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                }`}
                title="Toggle availability status in backend"
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    volunteer?.available ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                  }`}
                />
                <span>
                  {volunteer?.available ? 'Available on Duty' : 'Off Duty / Inactive'}
                </span>
              </button>

              <button
                type="button"
                onClick={loadVolunteerData}
                disabled={isLoading}
                className="h-10 w-10 flex items-center justify-center bg-white hover:bg-slate-50 text-slate-700 rounded-xl border border-slate-300 shadow-xs transition"
                title="Refresh tasks"
                aria-label="Refresh tasks"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-[#16877F] ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Quick Metrics Strip */}
          <div className="grid grid-cols-3 gap-2.5 pt-2 border-t border-slate-100">
            <div className="bg-[#F7F9FC] p-3 rounded-xl text-center border border-slate-200/70">
              <span className="text-[11px] text-slate-500 block font-bold uppercase tracking-wider">New Assigned</span>
              <strong className="text-xl font-black text-amber-600">{newCount}</strong>
            </div>
            <div className="bg-[#F7F9FC] p-3 rounded-xl text-center border border-slate-200/70">
              <span className="text-[11px] text-slate-500 block font-bold uppercase tracking-wider">In Progress</span>
              <strong className="text-xl font-black text-blue-600">{inProgressCount}</strong>
            </div>
            <div className="bg-[#F7F9FC] p-3 rounded-xl text-center border border-slate-200/70">
              <span className="text-[11px] text-slate-500 block font-bold uppercase tracking-wider">Completed</span>
              <strong className="text-xl font-black text-emerald-600">{completedCount}</strong>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 4. MAIN TASK FEED & FILTER TABS                                      */}
      {/* ==================================================================== */}
      <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 py-6 w-full space-y-5">
        {/* Status Filter Tabs (Large Touch Friendly for Mobile) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition border ${
              statusFilter === 'ALL'
                ? 'bg-[#17324F] text-white border-[#17324F]'
                : 'bg-white text-[#526277] border-slate-200 hover:border-slate-300'
            }`}
          >
            All Tasks ({tasks.length})
          </button>
          <button
            onClick={() => setStatusFilter('NEW')}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition border flex items-center gap-1.5 ${
              statusFilter === 'NEW'
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-white text-amber-800 border-amber-200 hover:bg-amber-50'
            }`}
          >
            <span>Needs Acceptance</span>
            <span className="px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-900 text-xs">
              {newCount}
            </span>
          </button>
          <button
            onClick={() => setStatusFilter('IN_PROGRESS')}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition border flex items-center gap-1.5 ${
              statusFilter === 'IN_PROGRESS'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-blue-800 border-blue-200 hover:bg-blue-50'
            }`}
          >
            <span>In Progress</span>
            <span className="px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-900 text-xs">
              {inProgressCount}
            </span>
          </button>
          <button
            onClick={() => setStatusFilter('COMPLETED')}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition border flex items-center gap-1.5 ${
              statusFilter === 'COMPLETED'
                ? 'bg-emerald-700 text-white border-emerald-700'
                : 'bg-white text-emerald-800 border-emerald-200 hover:bg-emerald-50'
            }`}
          >
            <span>Completed</span>
            <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-900 text-xs">
              {completedCount}
            </span>
          </button>
        </div>

        {/* Task Cards Feed */}
        {filteredTasks.length === 0 ? (
          <div className="bg-white rounded-xl border border-[#E1E8F0] p-8 text-center space-y-2.5">
            <CheckCircle2 className="w-10 h-10 text-teal-600 mx-auto" />
            <h3 className="text-base font-bold text-[#17324F]">No Active Tasks in this Category</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              When the SETU dispatch engine assigns an emergency mission in your area, it will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTasks.map((task) => {
              const isAssigned = task.status === 'assigned';
              const isAccepted = task.status === 'accepted';
              const isInProgress = task.status === 'in_progress';
              const isResolved = task.status === 'resolved';

              // Navigation Link to Google Maps turn-by-turn directions
              const mapsUrl = task.latitude && task.longitude
                ? `https://www.google.com/maps/dir/?api=1&destination=${task.latitude},${task.longitude}`
                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(task.destination || task.need?.location_text || 'Wayanad')}`;

              return (
                <div
                  key={task.id}
                  className={`bg-white rounded-xl border shadow-xs transition overflow-hidden ${
                    isAssigned
                      ? 'border-amber-300 ring-1 ring-amber-100'
                      : isInProgress
                      ? 'border-blue-300 ring-1 ring-blue-100'
                      : isResolved
                      ? 'border-slate-200 opacity-90'
                      : 'border-[#E1E8F0]'
                  }`}
                >
                  {/* Task Card Header Banner */}
                  <div
                    className={`px-4 sm:px-5 py-2.5 border-b flex items-center justify-between gap-2 text-xs font-bold ${
                      isAssigned
                        ? 'bg-amber-50/80 text-amber-900 border-amber-200'
                        : isInProgress
                        ? 'bg-blue-50/80 text-blue-900 border-blue-200'
                        : isResolved
                        ? 'bg-emerald-50/80 text-emerald-900 border-emerald-200'
                        : 'bg-slate-50 text-slate-800 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono">{task.id}</span>
                      <span>•</span>
                      <span>Need Ref: {task.need_id}</span>
                    </div>

                    <div>
                      {isAssigned && (
                        <span className="inline-flex items-center gap-1 text-amber-800 uppercase tracking-wider text-[11px]">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Action Required: Accept</span>
                        </span>
                      )}
                      {isAccepted && (
                        <span className="inline-flex items-center gap-1 text-teal-800 uppercase tracking-wider text-[11px]">
                          <Check className="w-3.5 h-3.5" />
                          <span>Accepted — Ready</span>
                        </span>
                      )}
                      {isInProgress && (
                        <span className="inline-flex items-center gap-1 text-blue-800 uppercase tracking-wider text-[11px]">
                          <Navigation className="w-3.5 h-3.5 animate-pulse" />
                          <span>En Route</span>
                        </span>
                      )}
                      {isResolved && (
                        <span className="inline-flex items-center gap-1 text-emerald-800 uppercase tracking-wider text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Delivered</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Task Card Body */}
                  <div className="p-4 sm:p-5 space-y-3.5">
                    {/* Supplies & Title */}
                    <div className="space-y-1">
                      <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500 block">
                        Mission Payload
                      </span>
                      <h2 className="text-base sm:text-lg font-black text-[#17324F] leading-snug">
                        {task.supplies || `${task.quantity} ${task.unit} of emergency relief`}
                      </h2>
                    </div>

                    {/* Destination & Map Navigation CTA */}
                    <div className="bg-[#F7F9FC] rounded-xl p-3.5 border border-slate-200/80 space-y-2.5">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="space-y-0.5">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                            Drop-off Destination
                          </span>
                          <div className="flex items-center gap-1.5 text-sm font-bold text-[#17324F]">
                            <MapPin className="w-4 h-4 text-red-600 shrink-0" />
                            <span>{task.destination || task.need?.location_text || 'Relief Location'}</span>
                          </div>
                        </div>

                        {/* Direct Turn-by-Turn GPS Button */}
                        <a
                          href={mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-[36px] px-3 py-1.5 bg-white hover:bg-slate-50 text-[#17324F] font-bold text-xs rounded-xl border border-slate-300 shadow-xs flex items-center gap-1.5 transition"
                        >
                          <Navigation className="w-3.5 h-3.5 text-[#16877F]" />
                          <span>Open Maps</span>
                          <ExternalLink className="w-3 h-3 text-slate-400" />
                        </a>
                      </div>

                      {/* Sponsoring NGO Contact Details */}
                      {task.ngo && (
                        <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between gap-2 text-xs text-slate-600 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>Depot: <strong>{task.ngo.name}</strong></span>
                          </div>
                          {task.ngo.phone && (
                            <a
                              href={`tel:${task.ngo.phone}`}
                              className="font-bold text-[#16877F] hover:underline flex items-center gap-1"
                            >
                              <Phone className="w-3 h-3" />
                              <span>{task.ngo.phone}</span>
                            </a>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Instructions & Practical Safety Guidance */}
                    {task.instructions && (
                      <div className="text-xs text-slate-700 bg-teal-50/60 border border-teal-100 rounded-xl p-3 space-y-1">
                        <strong className="text-teal-900 block font-bold">
                          Field Instructions &amp; Safety Note:
                        </strong>
                        <p className="leading-relaxed font-medium">
                          {task.instructions}
                        </p>
                      </div>
                    )}

                    {/* Resolution Details if Completed */}
                    {isResolved && task.resolved_at && (
                      <div className="text-xs text-slate-500 bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-1">
                        <div className="font-bold text-emerald-800 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Delivered on {new Date(task.resolved_at).toLocaleString()}</span>
                        </div>
                        {task.resolution_notes && (
                          <p className="italic text-slate-600">"{task.resolution_notes}"</p>
                        )}
                      </div>
                    )}

                    {/* Action Buttons (Touch-Friendly for Mobile Responders) */}
                    <div className="pt-1 flex items-center gap-2.5 flex-wrap">
                      {isAssigned && (
                        <button
                          type="button"
                          onClick={() => handleAcceptTask(task.id)}
                          disabled={actionLoadingId === task.id}
                          className="flex-1 min-h-[44px] px-5 py-2.5 bg-[#16877F] hover:bg-teal-800 text-white font-bold text-sm rounded-xl shadow-xs transition flex items-center justify-center gap-2"
                        >
                          <Check className="w-4 h-4" />
                          <span>
                            {actionLoadingId === task.id ? 'Accepting...' : 'Accept Assignment'}
                          </span>
                        </button>
                      )}

                      {isAccepted && (
                        <button
                          type="button"
                          onClick={() => handleStartTask(task.id)}
                          disabled={actionLoadingId === task.id}
                          className="flex-1 min-h-[44px] px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-xs transition flex items-center justify-center gap-2"
                        >
                          <Navigation className="w-4 h-4" />
                          <span>
                            {actionLoadingId === task.id ? 'Updating...' : 'Start Delivery (En Route)'}
                          </span>
                        </button>
                      )}

                      {isInProgress && (
                        <button
                          type="button"
                          onClick={() => openResolveModal(task)}
                          className="flex-1 min-h-[44px] px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm rounded-xl shadow-xs transition flex items-center justify-center gap-2"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Confirm Delivery &amp; Close</span>
                        </button>
                      )}

                      {/* Emergency Helpline Link */}
                      <a
                        href="tel:112"
                        className="min-h-[44px] px-3.5 py-2.5 bg-white hover:bg-red-50 text-red-700 font-bold text-xs rounded-xl border border-red-200 transition flex items-center gap-1.5"
                        title="Emergency SOS Contact"
                      >
                        <AlertOctagon className="w-4 h-4 text-red-600" />
                        <span>SOS (112)</span>
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ==================================================================== */}
      {/* 5. DELIVERY RESOLUTION MODAL                                         */}
      {/* ==================================================================== */}
      {isResolveModalOpen && activeTaskToResolve && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="resolve-modal-title"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-[#E1E8F0] overflow-hidden animate-scale-up">
            <div className="p-4 sm:p-5 bg-emerald-800 text-white flex items-center justify-between">
              <div>
                <h3 id="resolve-modal-title" className="text-base sm:text-lg font-bold">
                  Confirm Aid Delivery
                </h3>
                <p className="text-xs text-emerald-100">
                  Task #{activeTaskToResolve.id} • {activeTaskToResolve.supplies}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsResolveModalOpen(false)}
                className="text-emerald-100 hover:text-white p-1 rounded-lg"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmResolve} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Delivery Confirmation Notes
                </label>
                <textarea
                  rows={3}
                  required
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="e.g. Handed over to camp warden Sreedharan; verified recipient manifest."
                  className="w-full px-4 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-700 text-sm text-[#17324F]"
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600">
                Marking this assignment as resolved notifies the depot and marks the need as fulfilled.
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsResolveModalOpen(false)}
                  className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isResolving}
                  className="px-5 py-2 text-sm font-bold bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl shadow-xs transition flex items-center gap-2"
                >
                  {isResolving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <span>Confirm Fulfilled</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 6. COMPACT UNIFIED FOOTER                                            */}
      {/* ==================================================================== */}
      <footer className="bg-white border-t border-[#E1E8F0] py-4 text-xs text-slate-500 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>SETU Disaster Response • Volunteer Field Workspace</span>
          <span className="font-semibold text-slate-400">Built with Bharat 4.0</span>
        </div>
      </footer>
    </div>
  );
}
