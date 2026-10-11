import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Package,
  Truck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Plus,
  ShieldCheck,
  MapPin,
  Users,
  Phone,
  Layers,
  X,
  FileText,
  Clock,
  TrendingDown,
  Info,
  UtensilsCrossed
} from 'lucide-react';
import ApiService from '../services/api';
import SetuLogo from '../components/SetuLogo';
import SetuNavbar from '../components/SetuNavbar';

// ============================================================================
// Semantic Color System & Classification Helpers
// Food Assistance: Main accent #087653, Soft surface #E6F7ED, Border #A8E3C2
// Transport: Main accent #2459B5, Soft surface #EAF2FF, Border #B7D0FF
// Legacy categories: Restrained semantic styling (Water, Medical, Rescue, etc.)
// Urgency: Critical (Red), High (Amber), Medium (Teal), Low (Slate)
// ============================================================================

/**
 * Resolves semantic category styling for relief items, distress needs, and dispatches.
 * Food Assistance: Emerald green (#087653 / #E6F7ED / #A8E3C2)
 * Transport & Logistics: Blue (#2459B5 / #EAF2FF / #B7D0FF)
 * Urgency remains strictly independent.
 */
function getRequestTypeMeta(itemOrNeed) {
  const rawType = (
    itemOrNeed?.need_type ||
    itemOrNeed?.resource_type ||
    itemOrNeed?.category ||
    ''
  ).toLowerCase();

  const textBlob = `${rawType} ${itemOrNeed?.item || ''} ${itemOrNeed?.item_name || ''} ${itemOrNeed?.supplies || ''} ${itemOrNeed?.disaster_type || ''} ${itemOrNeed?.description || ''} ${itemOrNeed?.help_needed || ''}`.toLowerCase();

  const isTransport =
    rawType === 'transport' ||
    rawType === 'logistics' ||
    itemOrNeed?.disaster_type === 'Emergency Transport' ||
    /\b(transport|vehicle|evacuat|ambulance|truck|cargo|passenger|bus|boat|van|pickup)\b/i.test(textBlob);

  const isFood =
    !isTransport && (
      rawType === 'food' ||
      itemOrNeed?.disaster_type === 'Emergency Food Assistance' ||
      /\b(food|meal|meals|ration|rations|grain|rice|groceries|nutrition|cooked meals)\b/i.test(textBlob)
    );

  if (isFood) {
    return {
      type: 'food',
      label: 'Food Assistance',
      accentColor: '#087653',
      textAccent: 'text-[#087653]',
      softSurface: '#EAF7F0',
      borderColor: '#A8E3C2',
      cardBg: 'bg-[#EAF7F0]',
      cardBorder: 'border-[#A8E3C2]',
      borderLClass: 'border-l-4 border-l-[#087653]',
      badgeClass: 'text-[#087653] bg-white/95 border border-[#A8E3C2]',
      iconContainerClass: 'bg-white text-[#087653] border border-[#A8E3C2]',
      IconComponent: UtensilsCrossed,
    };
  }

  if (isTransport) {
    return {
      type: 'transport',
      label: 'Emergency Transport',
      accentColor: '#2459B5',
      textAccent: 'text-[#2459B5]',
      softSurface: '#EAF2FF',
      borderColor: '#B7D0FF',
      cardBg: 'bg-[#EAF2FF]',
      cardBorder: 'border-[#B7D0FF]',
      borderLClass: 'border-l-4 border-l-[#2459B5]',
      badgeClass: 'text-[#2459B5] bg-white/95 border border-[#B7D0FF]',
      iconContainerClass: 'bg-white text-[#2459B5] border border-[#B7D0FF]',
      IconComponent: Truck,
    };
  }

  if (rawType === 'water' || /\b(water|drinking water|chlorine|purification)\b/i.test(textBlob)) {
    return {
      type: 'water',
      label: 'Water & Sanitation',
      accentColor: '#0284C7',
      textAccent: 'text-[#0284C7]',
      softSurface: '#E0F2FE',
      borderColor: '#BAE6FD',
      cardBg: 'bg-[#E0F2FE]',
      cardBorder: 'border-[#BAE6FD]',
      borderLClass: 'border-l-4 border-l-[#0284C7]',
      badgeClass: 'text-[#0369A1] bg-white/95 border border-[#BAE6FD]',
      iconContainerClass: 'bg-white text-[#0369A1] border border-[#BAE6FD]',
      IconComponent: Package,
    };
  }

  if (rawType === 'shelter' || /\b(shelter|tent|tarpaulin|blanket|bedding)\b/i.test(textBlob)) {
    return {
      type: 'shelter',
      label: 'Emergency Shelter',
      accentColor: '#7E22CE',
      textAccent: 'text-[#7E22CE]',
      softSurface: '#F3E8FF',
      borderColor: '#DDD6FE',
      cardBg: 'bg-[#F3E8FF]',
      cardBorder: 'border-[#DDD6FE]',
      borderLClass: 'border-l-4 border-l-[#7E22CE]',
      badgeClass: 'text-[#7E22CE] bg-white/95 border border-[#DDD6FE]',
      iconContainerClass: 'bg-white text-[#7E22CE] border border-[#DDD6FE]',
      IconComponent: Package,
    };
  }

  if (rawType === 'medical' || /\b(medical|first aid|medicine|pharma|triage)\b/i.test(textBlob)) {
    return {
      type: 'medical',
      label: 'Medical Relief',
      accentColor: '#7C3AED',
      textAccent: 'text-[#7C3AED]',
      softSurface: '#F3E8FF',
      borderColor: '#DDD6FE',
      cardBg: 'bg-[#F3E8FF]',
      cardBorder: 'border-[#DDD6FE]',
      borderLClass: 'border-l-4 border-l-[#7C3AED]',
      badgeClass: 'text-[#6D28D9] bg-white/95 border border-[#DDD6FE]',
      iconContainerClass: 'bg-white text-[#6D28D9] border border-[#DDD6FE]',
      IconComponent: Package,
    };
  }

  if (rawType === 'rescue' || /\b(rescue|boat|life vest|flotation)\b/i.test(textBlob)) {
    return {
      type: 'rescue',
      label: 'Search & Rescue',
      accentColor: '#D97706',
      textAccent: 'text-[#D97706]',
      softSurface: '#FEF3C7',
      borderColor: '#FDE68A',
      cardBg: 'bg-[#FEF3C7]',
      cardBorder: 'border-[#FDE68A]',
      borderLClass: 'border-l-4 border-l-[#D97706]',
      badgeClass: 'text-[#B45309] bg-white/95 border border-[#FDE68A]',
      iconContainerClass: 'bg-white text-[#B45309] border border-[#FDE68A]',
      IconComponent: Package,
    };
  }

  return {
    type: 'general',
    label: rawType ? rawType.charAt(0).toUpperCase() + rawType.slice(1) : 'General Relief',
    accentColor: '#475569',
    textAccent: 'text-[#475569]',
    softSurface: '#F1F5F9',
    borderColor: '#CBD5E1',
    cardBg: 'bg-[#F8FAFC] hover:bg-[#F1F5F9]/80',
    cardBorder: 'border-[#CBD5E1]',
    borderLClass: 'border-l-4 border-l-[#475569]',
    badgeClass: 'text-[#334155] bg-[#F1F5F9] border border-[#CBD5E1]',
    iconContainerClass: 'bg-[#F1F5F9] text-[#334155] border border-[#CBD5E1]',
    IconComponent: Package,
  };
}

/**
 * Resolves independent urgency badge styling.
 * Critical: Red
 * High: Amber
 * Medium: Teal
 * Low: Slate
 */
function getUrgencyBadge(severity) {
  const sev = (severity || 'medium').toLowerCase();
  switch (sev) {
    case 'critical':
      return {
        label: 'Critical',
        className: 'bg-red-50 text-red-700 border border-red-200 font-semibold',
        dotColor: 'bg-red-500',
      };
    case 'high':
      return {
        label: 'High Priority',
        className: 'bg-amber-50 text-amber-800 border border-amber-200 font-semibold',
        dotColor: 'bg-amber-500',
      };
    case 'medium':
      return {
        label: 'Medium Priority',
        className: 'bg-teal-50 text-teal-800 border border-teal-200 font-medium',
        dotColor: 'bg-teal-500',
      };
    case 'low':
    default:
      return {
        label: 'Low Priority',
        className: 'bg-slate-100 text-slate-700 border border-slate-200 font-medium',
        dotColor: 'bg-slate-400',
      };
  }
}

export default function NgoDashboardPage() {
  // --------------------------------------------------------------------------
  // State
  // --------------------------------------------------------------------------
  const [ngos, setNgos] = useState([]);
  const [selectedNgoId, setSelectedNgoId] = useState('NGO001');
  const [currentNgo, setCurrentNgo] = useState(null);
  const [matchedNeeds, setMatchedNeeds] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [toast, setToast] = useState(null);
  const [systemMode, setSystemMode] = useState(ApiService.isMockMode() ? 'mock' : 'live');

  // Stock Update Modal State
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [updateQuantity, setUpdateQuantity] = useState('');
  const [updateNotes, setUpdateNotes] = useState('');
  const [isSavingStock, setIsSavingStock] = useState(false);

  // Active Tab: 'overview' | 'inventory' | 'needs' | 'dispatches'
  const [activeTab, setActiveTab] = useState('overview');

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------
  useEffect(() => {
    loadDashboardData();
  }, [selectedNgoId, systemMode]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      // 1. Load NGOs list
      const ngosRes = await ApiService.getNGOs();
      if (ngosRes.ok && Array.isArray(ngosRes.data)) {
        setNgos(ngosRes.data);
      }

      // 2. Load Selected NGO
      const ngoRes = await ApiService.getNGO(selectedNgoId);
      if (ngoRes.ok && ngoRes.data) {
        setCurrentNgo(ngoRes.data);
      } else {
        showToast(ngoRes.error || `Could not load NGO ${selectedNgoId}`, 'error');
      }

      // 3. Load Matched Needs & Dispatches for this NGO
      const [needsRes, dispatchesRes] = await Promise.all([
        ApiService.getNGONeeds(selectedNgoId),
        ApiService.getNGODispatches(selectedNgoId),
      ]);

      if (needsRes.ok && Array.isArray(needsRes.data)) {
        setMatchedNeeds(needsRes.data);
      }
      if (dispatchesRes.ok && Array.isArray(dispatchesRes.data)) {
        setDispatches(dispatchesRes.data);
      }
    } catch {
      showToast('Error loading NGO workspace data', 'error');
    } finally {
      setIsLoading(false);
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
        ? 'Switched to DEMO MODE — Operating with local verified mock data'
        : 'Connecting to live FastAPI backend at http://localhost:8000...',
      'info'
    );
  };

  // --------------------------------------------------------------------------
  // Inventory Stock Adjustment
  // --------------------------------------------------------------------------
  const openStockModal = (item) => {
    setEditingItem(item);
    setUpdateQuantity(item.quantity.toString());
    setUpdateNotes('');
    setIsUpdateModalOpen(true);
  };

  const handleSaveStock = async (e) => {
    e.preventDefault();
    if (!editingItem) return;

    const parsedQty = parseInt(updateQuantity, 10);
    if (isNaN(parsedQty) || parsedQty < 0) {
      showToast('Please enter a valid non-negative quantity.', 'error');
      return;
    }

    setIsSavingStock(true);
    try {
      const res = await ApiService.updateNGOInventory(
        selectedNgoId,
        editingItem.need_type,
        parsedQty,
        updateNotes.trim()
      );

      if (res.ok) {
        showToast(res.message || `Inventory for ${editingItem.item_name} updated to ${parsedQty}`, 'success');
        setIsUpdateModalOpen(false);
        setEditingItem(null);
        await loadDashboardData();
      } else {
        showToast(res.error || 'Failed to update inventory.', 'error');
      }
    } catch {
      showToast('Network error while updating stock.', 'error');
    } finally {
      setIsSavingStock(false);
    }
  };

  // --------------------------------------------------------------------------
  // Dispatch Actions
  // --------------------------------------------------------------------------
  const handleConfirmDispatch = async (assignmentId) => {
    setActionLoadingId(assignmentId);
    try {
      const res = await ApiService.confirmNGODispatch(assignmentId);
      if (res.ok) {
        showToast('Dispatch confirmed! Status marked as Dispatched & In Transit.', 'success');
        await loadDashboardData();
      } else {
        showToast(res.error || 'Could not update dispatch status.', 'error');
      }
    } catch {
      showToast('Network error confirming dispatch.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // --------------------------------------------------------------------------
  // Computed Metrics
  // --------------------------------------------------------------------------
  const totalAvailableStock = currentNgo?.capacity?.reduce((sum, c) => sum + (c.quantity || 0), 0) || 0;
  const totalReservedStock = currentNgo?.capacity?.reduce((sum, c) => sum + (c.reserved || 0), 0) || 0;
  const lowStockCount = currentNgo?.capacity?.filter((c) => c.quantity <= (c.threshold || 20)).length || 0;
  const activeDispatches = dispatches.filter((d) => d.status !== 'resolved' && d.dispatch_status !== 'delivered');
  const completedDispatches = dispatches.filter((d) => d.status === 'resolved' || d.dispatch_status === 'delivered');

  return (
    <div
      className="min-h-screen bg-[#F7F9FC] text-[#17324F] antialiased flex flex-col"
      style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
    >
      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 right-6 z-50 px-5 py-3.5 rounded-xl shadow-xl flex items-center gap-3 border text-sm font-medium transition-all duration-300 animate-slide-up ${
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

      {/* ==================================================================== */}
      {/* 1. TOP HEADER (EXACT SHARED LANDING PAGE NAVBAR)                     */}
      {/* ==================================================================== */}
      <SetuNavbar activePage="ngo" />

      {/* ==================================================================== */}
      {/* 2. COMPACT NGO WORKSPACE TOOLBAR IMMEDIATELY BELOW NAVBAR (44-48px)  */}
      {/* ==================================================================== */}
      <div className="bg-[#17324F] text-white border-b border-slate-800 h-11 sm:h-12 px-4 sm:px-6 flex items-center shadow-xs">
        <div className="max-w-7xl mx-auto w-full flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
          
          {/* Workspace Badge & Organization Selector */}
          <div className="flex items-center gap-2.5 shrink-0">
            <span className="px-2 py-0.5 bg-teal-900/90 text-teal-200 border border-teal-700 text-[11px] font-bold uppercase tracking-wider rounded">
              NGO Workspace
            </span>
            <div className="flex items-center gap-1.5">
              <label htmlFor="ngo-select" className="text-xs text-slate-300 font-medium hidden sm:inline">
                Org:
              </label>
              <select
                id="ngo-select"
                value={selectedNgoId}
                onChange={(e) => setSelectedNgoId(e.target.value)}
                className="bg-slate-800 text-white border border-slate-600 rounded-md px-2 py-0.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-teal-400 h-7"
              >
                {ngos.map((org) => (
                  <option key={org.id} value={org.id} className="bg-slate-900 text-white">
                    {org.name} ({org.id})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Controls: Mode Sandbox, Sync Data */}
          <div className="flex items-center gap-2 shrink-0">
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
              onClick={loadDashboardData}
              disabled={isLoading}
              className="h-7 px-2.5 bg-slate-800 hover:bg-slate-700 text-teal-300 rounded-md border border-slate-600 text-xs font-bold flex items-center gap-1.5 transition"
              title="Sync Data"
            >
              <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Sync</span>
            </button>
          </div>

        </div>
      </div>

      {/* ==================================================================== */}
      {/* 3. NGO PROFILE HEADER HERO                                           */}
      {/* ==================================================================== */}
      <section className="bg-white border-b border-[#D5E0EB] py-3.5 sm:py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-bold text-[#17324F] tracking-tight">
                  {currentNgo?.name || 'NGO Resource Depot'}
                </h1>
                {currentNgo?.verified && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-800 border border-teal-200">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Verified Partner</span>
                  </span>
                )}
                <span className="text-xs font-mono bg-slate-100 text-[#526277] px-2 py-0.5 rounded">
                  ID: {selectedNgoId}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm text-[#526277] pt-0.5">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-teal-700 shrink-0" />
                  <span>{currentNgo?.location_text || 'Relief Hub Location'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>{currentNgo?.phone || 'Contact Phone'}</span>
                </div>
                {currentNgo?.coordinator_name && (
                  <div className="flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>Lead: {currentNgo.coordinator_name}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions: Refresh & Manual Stock Adjustment */}
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={loadDashboardData}
                disabled={isLoading}
                className="h-9 px-3.5 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs sm:text-sm rounded-xl border border-[#D5E0EB] shadow-2xs transition flex items-center gap-2"
                title="Refresh latest backend data"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-teal-700 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Sync Data</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (currentNgo?.capacity?.[0]) {
                    openStockModal(currentNgo.capacity[0]);
                  }
                }}
                className="h-9 px-4 bg-teal-700 hover:bg-teal-800 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-xs transition flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Adjust Stock</span>
              </button>
            </div>
          </div>

          {/* Navigation Sub-Tabs */}
          <div className="flex items-center gap-2 mt-3 border-b border-[#D5E0EB] overflow-x-auto">
            <button
              onClick={() => setActiveTab('overview')}
              className={`pb-2.5 px-3 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
                activeTab === 'overview'
                  ? 'border-teal-700 text-teal-800 font-semibold'
                  : 'border-transparent text-[#526277] hover:text-[#17324F] font-medium'
              }`}
            >
              Overview &amp; Metrics
            </button>
            <button
              onClick={() => setActiveTab('inventory')}
              className={`pb-2.5 px-3 text-sm font-semibold border-b-2 transition whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'inventory'
                  ? 'border-teal-700 text-teal-800 font-semibold'
                  : 'border-transparent text-[#526277] hover:text-[#17324F] font-medium'
              }`}
            >
              <span>Relief Inventory</span>
              {lowStockCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 text-xs flex items-center justify-center font-bold">
                  {lowStockCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('needs')}
              className={`pb-2.5 px-3 text-sm font-semibold border-b-2 transition whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'needs'
                  ? 'border-teal-700 text-teal-800 font-semibold'
                  : 'border-transparent text-[#526277] hover:text-[#17324F] font-medium'
              }`}
            >
              <span>Matched Needs</span>
              <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
                {matchedNeeds.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('dispatches')}
              className={`pb-2.5 px-3 text-sm font-semibold border-b-2 transition whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'dispatches'
                  ? 'border-teal-700 text-teal-800 font-semibold'
                  : 'border-transparent text-[#526277] hover:text-[#17324F] font-medium'
              }`}
            >
              <span>Dispatch Management</span>
              <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
                {dispatches.length}
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 4. MAIN CONTENT AREA                                                 */}
      {/* ==================================================================== */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5 w-full space-y-5">
        
        {/* ================================================================== */}
        {/* SECTION A: OPERATIONAL OVERVIEW METRIC CARDS                       */}
        {/* ================================================================== */}
        {(activeTab === 'overview' || activeTab === 'inventory') && (
          <section
            aria-labelledby="overview-heading"
            className="relative rounded-2xl border border-[#D5E0EB] shadow-xs overflow-hidden p-4 sm:p-5"
          >
            {/* Layer 1 — Subtle Humanitarian Background Layer */}
            <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none z-0" aria-hidden="true">
              <img
                src="https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?q=80&w=1600&auto=format&fit=crop"
                alt=""
                className="w-full h-full object-cover object-center blur-[2px] scale-105"
                loading="lazy"
              />
              {/* Layer 2 — Soft Translucent Overlay */}
              <div className="absolute inset-0 bg-white/88 sm:bg-white/85" />
            </div>

            {/* Foreground Content (Layers 3 & 4) */}
            <div className="relative z-10 space-y-3.5">
              <h2 id="overview-heading" className="text-xl font-semibold text-[#17324F] flex items-center gap-2">
                <Layers className="w-5 h-5 text-teal-700" />
                <span>Operational Depot Status</span>
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
                {/* Card 1: Available Stock */}
                <div
                  onClick={() => setActiveTab('inventory')}
                  className="bg-[#E8F7F3] p-4 sm:p-4.5 rounded-xl border border-[#8DD9CA] border-t-4 border-t-[#138A78] shadow-2xs hover:shadow-xs cursor-pointer transition flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between text-slate-600">
                    <span className="text-xs font-semibold uppercase tracking-wider">Available Stock</span>
                    <div className="w-8 h-8 rounded-lg bg-[#CDEEE5] text-[#138A78] flex items-center justify-center shrink-0">
                      <Package className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-2.5">
                    <div className="flex items-baseline">
                      <span className="text-3xl font-bold text-[#17324F] tracking-tight">{totalAvailableStock}</span>
                      <span className="text-xs text-slate-600 font-medium ml-2">units in depot</span>
                    </div>
                  </div>
                  <div className="text-xs text-slate-600 flex items-center justify-between pt-2.5 mt-2.5 border-t border-[#8DD9CA]/50">
                    <span>Reserved for dispatches:</span>
                    <span className="font-semibold text-slate-800">{totalReservedStock} units</span>
                  </div>
                </div>

                {/* Card 2: Incoming Matched Requests */}
                <div
                  onClick={() => setActiveTab('needs')}
                  className="bg-[#EAF2FF] p-4 sm:p-4.5 rounded-xl border border-[#AFCBFF] border-t-4 border-t-[#2563EB] shadow-2xs hover:shadow-xs cursor-pointer transition flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between text-slate-600">
                    <span className="text-xs font-semibold uppercase tracking-wider">Incoming Requests</span>
                    <div className="w-8 h-8 rounded-lg bg-[#D4E4FC] text-[#2563EB] flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-2.5">
                    <div className="flex items-baseline">
                      <span className="text-3xl font-bold text-[#17324F] tracking-tight">{matchedNeeds.length}</span>
                      <span className="text-xs text-slate-600 font-medium ml-2">assigned to hub</span>
                    </div>
                  </div>
                  <div className="text-xs text-slate-600 flex items-center justify-between pt-2.5 mt-2.5 border-t border-[#AFCBFF]/50">
                    <span>Backend routing:</span>
                    <span className="font-semibold text-slate-800">Verified Distress</span>
                  </div>
                </div>

                {/* Card 3: Active Dispatches */}
                <div
                  onClick={() => setActiveTab('dispatches')}
                  className="bg-[#FFF6E5] p-4 sm:p-4.5 rounded-xl border border-[#F6D28A] border-t-4 border-t-[#D97706] shadow-2xs hover:shadow-xs cursor-pointer transition flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between text-slate-600">
                    <span className="text-xs font-semibold uppercase tracking-wider">Active Missions</span>
                    <div className="w-8 h-8 rounded-lg bg-[#FFE7B8] text-[#D97706] flex items-center justify-center shrink-0">
                      <Truck className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-2.5">
                    <div className="flex items-baseline">
                      <span className="text-3xl font-bold text-[#17324F] tracking-tight">{activeDispatches.length}</span>
                      <span className="text-xs text-slate-600 font-medium ml-2">in transit / en route</span>
                    </div>
                  </div>
                  <div className="text-xs text-slate-600 flex items-center justify-between pt-2.5 mt-2.5 border-t border-[#F6D28A]/50">
                    <span>Field responders:</span>
                    <span className="font-semibold text-slate-800">Couriers Active</span>
                  </div>
                </div>

                {/* Card 4: Fulfilled Deliveries */}
                <div
                  onClick={() => setActiveTab('dispatches')}
                  className="bg-[#EAF8F0] p-4 sm:p-4.5 rounded-xl border border-[#A7DFC2] border-t-4 border-t-[#07805A] shadow-2xs hover:shadow-xs cursor-pointer transition flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between text-slate-600">
                    <span className="text-xs font-semibold uppercase tracking-wider">Fulfilled Deliveries</span>
                    <div className="w-8 h-8 rounded-lg bg-[#CEF2DE] text-[#07805A] flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-2.5">
                    <div className="flex items-baseline">
                      <span className="text-3xl font-bold text-[#17324F] tracking-tight">{completedDispatches.length}</span>
                      <span className="text-xs text-slate-600 font-medium ml-2">verified on site</span>
                    </div>
                  </div>
                  <div className="text-xs text-slate-600 flex items-center justify-between pt-2.5 mt-2.5 border-t border-[#A7DFC2]/50">
                    <span>Audit status:</span>
                    <span className="font-semibold text-[#07805A]">Confirmed Handovers</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ================================================================== */}
        {/* SECTION B: INVENTORY MANAGEMENT                                    */}
        {/* ================================================================== */}
        {(activeTab === 'overview' || activeTab === 'inventory') && (
          <section aria-labelledby="inventory-heading" className="bg-[#EEF3F8] rounded-2xl border border-[#D5E0EB] shadow-xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-[#D5E0EB] flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div>
                <h2 id="inventory-heading" className="text-[22px] sm:text-2xl font-bold text-[#17324F] flex items-center gap-2.5 tracking-tight leading-snug">
                  <Package className="w-6 h-6 text-teal-700 shrink-0" />
                  <span>Depot Inventory &amp; Stock Levels</span>
                </h2>
                <p className="text-[13px] sm:text-sm font-normal text-[#526277] mt-1">
                  Real-time warehouse supplies available for emergency dispatch missions. Color-coded by relief category.
                </p>
              </div>

              {lowStockCount > 0 ? (
                <div className="shrink-0 self-start sm:self-center">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-900 border border-amber-200 text-xs font-semibold shadow-2xs">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>{lowStockCount} items below threshold</span>
                  </span>
                </div>
              ) : (
                <div className="shrink-0 self-start sm:self-center">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-[#17324F] border border-[#D5E0EB] text-xs font-semibold shadow-2xs">
                    <span>{currentNgo?.capacity?.length || 0} Supplies Stocked</span>
                  </span>
                </div>
              )}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse table-fixed min-w-[780px]">
                <colgroup>
                  <col className="w-auto min-w-[280px]" />
                  <col className="w-32" />
                  <col className="w-32" />
                  <col className="w-32" />
                  <col className="w-44" />
                  <col className="w-36" />
                </colgroup>
                <thead>
                  <tr className="bg-[#E3EAF2] text-[#526277] text-xs font-semibold uppercase tracking-wider border-b border-[#D5E0EB]">
                    <th scope="col" className="py-3 px-4 sm:px-5">Supply Item &amp; Category</th>
                    <th scope="col" className="py-3 px-4 text-right">Available Qty</th>
                    <th scope="col" className="py-3 px-4 text-right">Reserved Qty</th>
                    <th scope="col" className="py-3 px-4 text-right">Total Stock</th>
                    <th scope="col" className="py-3 px-4">Stock Status</th>
                    <th scope="col" className="py-3 px-4 sm:px-5 text-right">Stock Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D5E0EB]">
                  {currentNgo?.capacity?.map((item) => {
                    const isLow = item.quantity <= (item.threshold || 20);
                    const isDepleted = item.quantity === 0;
                    const typeMeta = getRequestTypeMeta(item);

                    return (
                      <tr key={item.need_type} className={`bg-white hover:bg-[#F7F9FC] transition ${typeMeta.borderLClass}`}>
                        <td className="py-3 px-4 sm:px-5">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${typeMeta.iconContainerClass}`}>
                              <typeMeta.IconComponent className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-[#17324F] text-[15px] sm:text-base leading-snug truncate">
                                {item.item_name || `${item.need_type.toUpperCase()} Supplies`}
                              </div>
                              <div className="flex items-center gap-2 text-xs mt-1">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium text-xs ${typeMeta.badgeClass}`}>
                                  {typeMeta.label}
                                </span>
                                <span className="text-[#526277] font-normal">
                                  Threshold: {item.threshold || 20} {item.unit}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <span className="text-[16px] sm:text-[17px] font-semibold text-[#17324F] tabular-nums">{item.quantity}</span>
                          <span className="text-xs font-normal text-[#526277] ml-1.5">{item.unit}</span>
                        </td>

                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <span className="text-[14px] sm:text-[15px] font-medium text-[#526277] tabular-nums">{item.reserved || 0}</span>
                          <span className="text-xs font-normal text-[#526277] ml-1.5">{item.unit}</span>
                        </td>

                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <span className="text-[14px] sm:text-[15px] font-medium text-[#17324F] tabular-nums">{(item.quantity || 0) + (item.reserved || 0)}</span>
                          <span className="text-xs font-normal text-[#526277] ml-1.5">{item.unit}</span>
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap">
                          {isDepleted ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
                              <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                              <span>Depleted</span>
                            </span>
                          ) : isLow ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                              <TrendingDown className="w-3.5 h-3.5 text-amber-600" />
                              <span>Low Stock (&lt;{item.threshold || 20})</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Sufficient</span>
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 sm:px-5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openStockModal(item)}
                            className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-[#17324F] font-medium text-xs sm:text-sm rounded-lg border border-[#D5E0EB] shadow-2xs transition inline-flex items-center gap-1.5"
                          >
                            <span>Update Stock</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="md:hidden divide-y divide-[#D5E0EB]">
              {currentNgo?.capacity?.map((item) => {
                const isLow = item.quantity <= (item.threshold || 20);
                const isDepleted = item.quantity === 0;
                const typeMeta = getRequestTypeMeta(item);

                return (
                  <div key={item.need_type} className={`p-4 space-y-3 ${typeMeta.borderLClass} bg-white`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${typeMeta.iconContainerClass}`}>
                          <typeMeta.IconComponent className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-semibold text-[15px] text-[#17324F] leading-snug">
                            {item.item_name || `${item.need_type.toUpperCase()} Supplies`}
                          </div>
                          <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-md mt-1 ${typeMeta.badgeClass}`}>
                            {typeMeta.label}
                          </span>
                        </div>
                      </div>
                      {isDepleted ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200 whitespace-nowrap">Depleted</span>
                      ) : isLow ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">Low Stock</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap">Sufficient</span>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 bg-[#F7F9FC] border border-[#D5E0EB] rounded-lg p-2.5 text-center text-xs">
                      <div>
                        <div className="text-[#526277] font-normal text-xs">Available</div>
                        <div className="font-semibold text-[#17324F] text-[16px] sm:text-[17px] mt-0.5 tabular-nums">
                          {item.quantity} <span className="text-xs font-normal text-[#526277]">{item.unit}</span>
                        </div>
                      </div>
                      <div>
                        <div className="text-[#526277] font-normal text-xs">Reserved</div>
                        <div className="font-medium text-[#526277] text-sm mt-0.5 tabular-nums">
                          {item.reserved || 0} <span className="text-xs font-normal text-[#526277]">{item.unit}</span>
                        </div>
                      </div>
                      <div>
                        <div className="text-[#526277] font-normal text-xs">Total</div>
                        <div className="font-medium text-[#17324F] text-sm mt-0.5 tabular-nums">
                          {(item.quantity || 0) + (item.reserved || 0)} <span className="text-xs font-normal text-[#526277]">{item.unit}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs font-normal text-[#526277]">Threshold: {item.threshold || 20} {item.unit}</span>
                      <button
                        type="button"
                        onClick={() => openStockModal(item)}
                        className="px-3 py-1.5 bg-white hover:bg-slate-50 text-[#17324F] font-medium text-xs sm:text-sm rounded-lg border border-[#D5E0EB] shadow-2xs"
                      >
                        Update Stock
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ================================================================== */}
        {/* SECTION C: MATCHED NEEDS FROM BACKEND                              */}
        {/* ================================================================== */}
        {(activeTab === 'overview' || activeTab === 'needs') && (
          <section aria-labelledby="needs-heading" className="space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#D5E0EB]">
              <div>
                <h2 id="needs-heading" className="text-[22px] sm:text-2xl font-bold text-[#17324F] flex items-center gap-2.5 tracking-tight leading-snug">
                  <FileText className="w-6 h-6 text-teal-700 shrink-0" />
                  <span>Incoming Backend-Matched Emergency Requests</span>
                </h2>
                <p className="text-[13px] sm:text-sm font-normal text-[#526277] mt-1">
                  Verified emergency distress reports routed to {currentNgo?.name} by the SETU matching engine.
                </p>
              </div>
              <div className="shrink-0 self-start sm:self-center">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-[#17324F] border border-[#D5E0EB] text-xs font-semibold shadow-2xs">
                  <FileText className="w-4 h-4 text-teal-700 shrink-0" />
                  <span>{matchedNeeds.length} Requests Assigned</span>
                </span>
              </div>
            </div>

            {matchedNeeds.length === 0 ? (
              <div className="bg-[#EEF3F8] p-10 text-center rounded-2xl border border-[#D5E0EB] shadow-xs space-y-3">
                <CheckCircle2 className="w-12 h-12 text-teal-600 mx-auto" />
                <h3 className="text-lg font-semibold text-[#17324F]">No Pending Matched Requests</h3>
                <p className="text-sm text-[#526277] max-w-md mx-auto">
                  All emergency needs routed to this organization have been addressed or fulfilled.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
                {matchedNeeds.map((need) => {
                  const assignment = need.assignment;
                  const isAssigned = Boolean(assignment);
                  const isDelivered = need.status === 'resolved' || assignment?.status === 'resolved';
                  const typeMeta = getRequestTypeMeta(need);
                  const urgencyMeta = getUrgencyBadge(need.severity);

                  return (
                    <div
                      key={need.id}
                      className={`rounded-2xl border ${typeMeta.cardBorder} ${typeMeta.cardBg} ${typeMeta.borderLClass} p-4 sm:p-5 shadow-xs transition hover:shadow-md flex flex-col justify-between space-y-3.5`}
                    >
                      <div className="space-y-3">
                        {/* 1. Compact Header: Request ID + Category Badge on left, Urgency + Trust on right */}
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-semibold bg-[#17324F] text-white px-2.5 py-0.5 rounded-md">
                              {need.id}
                            </span>
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium ${typeMeta.badgeClass}`}>
                              <typeMeta.IconComponent className="w-3.5 h-3.5 shrink-0" />
                              <span>{typeMeta.label}</span>
                            </span>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Urgency Badge (Independent: Red for Critical, Amber for High, etc.) */}
                            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full ${urgencyMeta.className}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${urgencyMeta.dotColor}`} />
                              <span>{urgencyMeta.label}</span>
                            </span>
                            <span className="text-xs font-medium text-[#526277] bg-white/90 px-2 py-0.5 rounded-md border border-[#D5E0EB]">
                              Trust: {need.trust_score}%
                            </span>
                          </div>
                        </div>

                        {/* 2. Prominent Requested Quantity & Item Callout */}
                        <div className="flex items-baseline justify-between gap-3 pt-0.5">
                          <div>
                            <span className={`text-2xl sm:text-[26px] font-bold tracking-tight ${typeMeta.textAccent}`}>
                              {need.quantity} {need.unit}
                            </span>
                            <span className="text-base font-semibold text-[#17324F] ml-2">
                              of {need.item}
                            </span>
                          </div>
                          <span className="text-xs font-medium text-[#526277] uppercase tracking-wider shrink-0 hidden sm:inline">
                            Emergency Need
                          </span>
                        </div>

                        {/* 3. Request Description: Readable Body Text */}
                        <p className="text-[14px] sm:text-[15px] font-normal text-slate-700 leading-relaxed line-clamp-2">
                          {need.description}
                        </p>

                        {/* 4. Dedicated Location Row with MapPin Icon */}
                        <div className="flex items-center gap-2 text-[13px] sm:text-sm font-medium text-[#526277] pt-0.5">
                          <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                          <span className="truncate">{need.location_text}</span>
                        </div>
                      </div>

                      {/* 5. Footer: Assignment Status & Dispatch Actions with subtle divider */}
                      <div className="pt-3 border-t border-[#D5E0EB] flex items-center justify-between gap-3 flex-wrap">
                        <div className="text-[13px] sm:text-sm font-normal text-slate-600">
                          {isDelivered ? (
                            <span className="text-emerald-700 font-semibold flex items-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                              <span>Delivered &amp; Resolved</span>
                            </span>
                          ) : isAssigned ? (
                            <div className="text-slate-600 flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>Dispatched: <strong className="font-semibold text-[#17324F]">{need.volunteer?.name || 'Volunteer Responder'}</strong></span>
                            </div>
                          ) : (
                            <span className="text-amber-800 font-semibold flex items-center gap-1.5">
                              <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                              <span>Awaiting Volunteer Pickup</span>
                            </span>
                          )}
                        </div>

                        {assignment && assignment.dispatch_status !== 'dispatched' && !isDelivered && (
                          <button
                            type="button"
                            onClick={() => handleConfirmDispatch(assignment.id)}
                            disabled={actionLoadingId === assignment.id}
                            className="px-4 py-2 bg-[#17324F] hover:bg-[#1f4065] text-white font-semibold text-xs sm:text-sm rounded-xl shadow-xs transition flex items-center gap-1.5 shrink-0"
                          >
                            <Truck className="w-3.5 h-3.5" />
                            <span>{actionLoadingId === assignment.id ? 'Updating...' : 'Confirm Dispatch'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ================================================================== */}
        {/* SECTION D: DISPATCH & DELIVERY MANAGEMENT                          */}
        {/* ================================================================== */}
        {(activeTab === 'overview' || activeTab === 'dispatches') && (
          <section aria-labelledby="dispatch-heading" className="bg-[#EEF3F8] rounded-2xl border border-[#D5E0EB] shadow-xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-[#D5E0EB] flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div>
                <h2 id="dispatch-heading" className="text-[22px] sm:text-2xl font-bold text-[#17324F] flex items-center gap-2.5 tracking-tight leading-snug">
                  <Truck className="w-6 h-6 text-teal-700 shrink-0" />
                  <span>Relief Dispatch &amp; Delivery Management</span>
                </h2>
                <p className="text-[13px] sm:text-sm font-normal text-[#526277] mt-1">
                  Track field dispatches assigned from {currentNgo?.name} depot to volunteer couriers.
                </p>
              </div>

              <div className="shrink-0 self-start sm:self-center">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-[#17324F] border border-[#D5E0EB] text-xs font-semibold shadow-2xs">
                  <Truck className="w-4 h-4 text-teal-700 shrink-0" />
                  <span>{activeDispatches.length} Active Missions</span>
                </span>
              </div>
            </div>

            {dispatches.length === 0 ? (
              <div className="p-10 text-center text-[#526277]">
                <Truck className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold">No dispatches logged for this organization yet.</p>
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse table-fixed min-w-[840px]">
                    <colgroup>
                      <col className="w-32" />                  {/* Dispatch ID / Need */}
                      <col className="w-auto min-w-[210px]" /> {/* Destination */}
                      <col className="w-auto min-w-[210px]" /> {/* Supplies & Category */}
                      <col className="w-48" />                  {/* Assigned Volunteer */}
                      <col className="w-40" />                  {/* Mission Status */}
                      <col className="w-36" />                  {/* Action */}
                    </colgroup>
                    <thead>
                      <tr className="bg-[#E3EAF2] text-[#526277] text-xs font-semibold uppercase tracking-wider border-b border-[#D5E0EB]">
                        <th scope="col" className="py-3 px-4 sm:px-5">Dispatch ID / Need</th>
                        <th scope="col" className="py-3 px-4">Destination</th>
                        <th scope="col" className="py-3 px-4">Supplies &amp; Category</th>
                        <th scope="col" className="py-3 px-4">Assigned Volunteer</th>
                        <th scope="col" className="py-3 px-4">Mission Status</th>
                        <th scope="col" className="py-3 px-4 sm:px-5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#D5E0EB]">
                      {dispatches.map((dispatch) => {
                        const isDelivered = dispatch.status === 'resolved' || dispatch.dispatch_status === 'delivered';
                        const isInTransit = dispatch.dispatch_status === 'in_transit' || dispatch.status === 'in_progress';
                        const typeMeta = getRequestTypeMeta(dispatch.need || dispatch);

                        return (
                          <tr key={dispatch.id} className={`bg-white hover:bg-[#F7F9FC] transition ${typeMeta.borderLClass}`}>
                            <td className="py-3 px-4 sm:px-5">
                              <span className="font-mono font-bold text-[#17324F] text-[13px] tracking-tight">{dispatch.id}</span>
                              <div className="text-[11px] text-[#526277] font-mono mt-0.5">Need: {dispatch.need_id}</div>
                            </td>

                            <td className="py-3 px-4">
                              <div className="font-medium text-[#17324F] text-[14px] sm:text-[15px] flex items-center gap-1.5 leading-snug">
                                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span className="truncate">{dispatch.destination || dispatch.need?.location_text || 'Relief Location'}</span>
                              </div>
                              <span className="text-xs text-[#526277] font-normal mt-1 block">
                                Assigned {new Date(dispatch.assigned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </td>

                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2.5">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${typeMeta.iconContainerClass}`}>
                                  <typeMeta.IconComponent className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                  <div className="font-semibold text-[#17324F] text-[15px] leading-snug truncate">
                                    {dispatch.supplies || `${dispatch.quantity} ${dispatch.unit}`}
                                  </div>
                                  <div className="mt-1">
                                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md ${typeMeta.badgeClass}`}>
                                      {typeMeta.label}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <div className="font-medium text-[#17324F] text-[14px] sm:text-[15px] flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span className="truncate">{dispatch.volunteer?.name || `Volunteer ${dispatch.volunteer_id}`}</span>
                              </div>
                              {dispatch.volunteer?.phone ? (
                                <a
                                  href={`tel:${dispatch.volunteer.phone}`}
                                  className="text-xs text-teal-700 hover:underline flex items-center gap-1 mt-0.5"
                                >
                                  <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                                  <span>{dispatch.volunteer.phone}</span>
                                </a>
                              ) : (
                                <span className="text-xs text-[#526277] font-normal mt-0.5 block">No phone logged</span>
                              )}
                            </td>

                            <td className="py-3 px-4 whitespace-nowrap">
                              {isDelivered ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  <span>Delivered</span>
                                </span>
                              ) : isInTransit ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                                  <Truck className="w-3.5 h-3.5 text-blue-600 animate-pulse shrink-0" />
                                  <span>In Transit</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200">
                                  <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                  <span>Ready for Pickup</span>
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-4 sm:px-5 text-right whitespace-nowrap">
                              {!isDelivered && dispatch.dispatch_status !== 'dispatched' ? (
                                <button
                                  type="button"
                                  onClick={() => handleConfirmDispatch(dispatch.id)}
                                  disabled={actionLoadingId === dispatch.id}
                                  className="px-3.5 py-1.5 bg-[#17324F] hover:bg-[#1f4065] text-white font-semibold text-xs sm:text-sm rounded-lg shadow-2xs transition inline-flex items-center gap-1.5"
                                >
                                  <Truck className="w-3.5 h-3.5" />
                                  <span>{actionLoadingId === dispatch.id ? 'Saving...' : 'Confirm'}</span>
                                </button>
                              ) : (
                                <span className="text-xs text-slate-400 font-semibold">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden divide-y divide-[#D5E0EB]">
                  {dispatches.map((dispatch) => {
                    const isDelivered = dispatch.status === 'resolved' || dispatch.dispatch_status === 'delivered';
                    const isInTransit = dispatch.dispatch_status === 'in_transit' || dispatch.status === 'in_progress';
                    const typeMeta = getRequestTypeMeta(dispatch.need || dispatch);

                    return (
                      <div key={dispatch.id} className={`p-4 space-y-3 ${typeMeta.borderLClass} bg-white`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sm text-[#17324F]">{dispatch.id}</span>
                            <span className="text-xs text-[#526277] font-mono">Need: {dispatch.need_id}</span>
                          </div>
                          {isDelivered ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Delivered
                            </span>
                          ) : isInTransit ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                              <Truck className="w-3 h-3 text-blue-600" />
                              In Transit
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200">
                              <Clock className="w-3 h-3 text-amber-600" />
                              Ready for Pickup
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${typeMeta.iconContainerClass}`}>
                            <typeMeta.IconComponent className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-semibold text-[15px] text-[#17324F] leading-snug">
                              {dispatch.supplies || `${dispatch.quantity} ${dispatch.unit}`}
                            </div>
                            <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-md mt-1 ${typeMeta.badgeClass}`}>
                              {typeMeta.label}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 text-[13px] text-slate-600">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{dispatch.destination || dispatch.need?.location_text || 'Relief Location'}</span>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-[#D5E0EB] text-xs">
                          <div className="text-slate-600">
                            Volunteer: <strong className="font-semibold text-[#17324F]">{dispatch.volunteer?.name || `Volunteer ${dispatch.volunteer_id}`}</strong>
                          </div>
                          {!isDelivered && dispatch.dispatch_status !== 'dispatched' && (
                            <button
                              type="button"
                              onClick={() => handleConfirmDispatch(dispatch.id)}
                              disabled={actionLoadingId === dispatch.id}
                              className="px-3 py-1.5 bg-[#17324F] hover:bg-[#1f4065] text-white font-semibold text-xs rounded-lg transition"
                            >
                              {actionLoadingId === dispatch.id ? 'Saving...' : 'Confirm'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        )}
      </main>

      {/* ==================================================================== */}
      {/* 5. STOCK ADJUSTMENT MODAL                                            */}
      {/* ==================================================================== */}
      {isUpdateModalOpen && editingItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="stock-modal-title"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-[#E1E8F0] overflow-hidden animate-scale-up">
            <div className="p-5 bg-[#17324F] text-white flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 id="stock-modal-title" className="text-lg font-bold">
                    Update Relief Stock
                  </h3>
                  {(() => {
                    const itemTypeMeta = getRequestTypeMeta(editingItem);
                    return (
                      <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded ${itemTypeMeta.badgeClass}`}>
                        <itemTypeMeta.IconComponent className="w-3 h-3" />
                        <span>{itemTypeMeta.label}</span>
                      </span>
                    );
                  })()}
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  {editingItem.item_name} ({selectedNgoId})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsUpdateModalOpen(false)}
                className="text-slate-300 hover:text-white p-1 rounded-lg"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStock} className="p-6 space-y-5">
              <div>
                <label
                  htmlFor="stock-update-quantity"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
                >
                  Available Quantity ({editingItem.unit}) <span className="text-red-500">*</span>
                </label>
                <input
                  id="stock-update-quantity"
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={updateQuantity}
                  onChange={(e) => setUpdateQuantity(e.target.value)}
                  placeholder="0"
                  style={{ backgroundColor: '#FFFFFF', color: '#17324F' }}
                  className="w-full px-4 py-3 bg-white text-[#17324F] placeholder-[#64748B] border border-[#CBD5E1] rounded-xl text-base font-semibold focus:outline-none focus:border-[#16877F] focus:ring-2 focus:ring-[#16877F]/25 transition"
                />
                <div className="text-xs text-slate-500 mt-1.5 flex items-center justify-between">
                  <span>Current in depot: <strong className="font-semibold text-slate-700">{editingItem.quantity} {editingItem.unit}</strong></span>
                  <span>Reserved: <strong className="font-semibold text-slate-700">{editingItem.reserved || 0} {editingItem.unit}</strong></span>
                </div>
              </div>

              <div>
                <label
                  htmlFor="stock-update-reason"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
                >
                  Intake / Adjustment Reason <span className="text-slate-400 font-normal lowercase">(optional)</span>
                </label>
                <input
                  id="stock-update-reason"
                  type="text"
                  placeholder="e.g. Received shipment from District Collectorate"
                  value={updateNotes}
                  onChange={(e) => setUpdateNotes(e.target.value)}
                  style={{ backgroundColor: '#FFFFFF', color: '#17324F' }}
                  className="w-full px-4 py-3 bg-white text-[#17324F] placeholder-[#64748B] border border-[#CBD5E1] rounded-xl text-base focus:outline-none focus:border-[#16877F] focus:ring-2 focus:ring-[#16877F]/25 transition"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsUpdateModalOpen(false)}
                  className="px-4 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingStock}
                  className="px-5 py-2.5 text-sm font-bold bg-[#16877F] hover:bg-teal-800 text-white rounded-xl shadow-xs transition flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-[#16877F]/30 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isSavingStock ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Saving to API...</span>
                    </>
                  ) : (
                    <span>Save Stock Update</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 6. FOOTER                                                            */}
      {/* ==================================================================== */}
      <footer className="bg-[#17324F] border-t border-slate-800 py-6 text-xs text-slate-300 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <SetuLogo variant="dark" iconSize={24} showTagline={false} />
            <span>SETU NGO Resource &amp; Dispatch Console • Built with Bharat 4.0</span>
          </div>
          <div className="flex items-center gap-4 font-semibold text-teal-300">
            <Link to="/volunteer-dashboard" className="hover:underline hover:text-white">Volunteer Dashboard</Link>
            <Link to="/dashboard" className="hover:underline hover:text-white">Coordinator Operations</Link>
            <Link to="/" className="hover:underline hover:text-white">Public Homepage</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
