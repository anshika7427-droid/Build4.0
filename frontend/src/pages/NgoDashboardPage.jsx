import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
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
  Sparkles,
  X,
  FileText,
  Clock,
  TrendingDown,
  Info
} from 'lucide-react';
import ApiService from '../services/api';
import SetuLogo from '../components/SetuLogo';

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
    <div className="min-h-screen bg-[#F7F9FC] text-[#17324F] font-sans selection:bg-teal-100 selection:text-teal-900 flex flex-col">
      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 right-6 z-50 px-5 py-3.5 rounded-xl shadow-xl flex items-center gap-3 border text-sm font-semibold transition-all duration-300 animate-slide-up ${
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
      {/* 1. TOP HEADER & BRAND LOCKUP                                         */}
      {/* ==================================================================== */}
      <header className="bg-white border-b border-[#E1E8F0] sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          {/* Logo & Portal Label */}
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="focus:outline-none focus:ring-2 focus:ring-[#16877F] rounded-lg"
              aria-label="SETU Home"
            >
              <SetuLogo variant="light" iconSize={38} />
            </Link>
            <div className="hidden sm:block h-6 w-px bg-slate-200" />
            <div className="hidden sm:flex items-center gap-2">
              <span className="px-2.5 py-1 bg-teal-50 text-[#16877F] text-xs font-bold uppercase tracking-wider rounded-md border border-teal-200">
                NGO Workspace
              </span>
            </div>
          </div>

          {/* Center/Right Controls: NGO Switcher & System Mode */}
          <div className="flex items-center gap-3">
            {/* Demo NGO Switcher */}
            <div className="flex items-center gap-2 bg-[#F7F9FC] border border-[#E1E8F0] rounded-xl px-3 py-1.5 text-xs sm:text-sm">
              <Building2 className="w-4 h-4 text-[#16877F] shrink-0" />
              <label htmlFor="ngo-select" className="sr-only">Switch Demo NGO</label>
              <select
                id="ngo-select"
                value={selectedNgoId}
                onChange={(e) => setSelectedNgoId(e.target.value)}
                className="bg-transparent font-bold text-[#17324F] focus:outline-none cursor-pointer"
              >
                {ngos.map((ngo) => (
                  <option key={ngo.id} value={ngo.id}>
                    {ngo.name} ({ngo.id})
                  </option>
                ))}
              </select>
            </div>

            {/* Live vs Demo Toggle */}
            <button
              onClick={toggleSystemMode}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 border transition ${
                systemMode === 'mock'
                  ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                  : 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100'
              }`}
              title="Click to toggle between Demo Mode and Live Backend"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  systemMode === 'mock' ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
              />
              <span className="hidden sm:inline">
                {systemMode === 'mock' ? 'Demo Mode' : 'Live Mode'}
              </span>
            </button>

            {/* Quick Navigation to Volunteer Dashboard & Home */}
            <Link
              to="/volunteer-dashboard"
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#526277] hover:text-[#17324F] hover:bg-slate-100 rounded-lg transition"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Volunteer View</span>
            </Link>

            <Link
              to="/"
              className="text-xs font-bold text-[#16877F] hover:underline hidden lg:inline"
            >
              Public Site
            </Link>
          </div>
        </div>
      </header>

      {/* ==================================================================== */}
      {/* 2. DEMO / SIMULATION BANNER & BACKEND HONESTY NOTICE                  */}
      {/* ==================================================================== */}
      <div className="bg-[#17324F] text-slate-200 border-b border-slate-700 py-2.5 px-4 text-xs sm:text-sm">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-teal-800 text-teal-200 font-bold uppercase text-[10px] tracking-wider shrink-0">
              Backend-Driven Matching
            </span>
            <span className="text-slate-300">
              The SETU backend matching engine determines needs allocation and dispatches. The frontend executes verified inventory and dispatch updates.
            </span>
          </div>
          {systemMode === 'mock' && (
            <span className="text-amber-300 font-medium shrink-0 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Operating with verified sample data for hackathon evaluation</span>
            </span>
          )}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 3. NGO PROFILE HEADER HERO                                           */}
      {/* ==================================================================== */}
      <section className="bg-white border-b border-[#E1E8F0] py-6 sm:py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1.5">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-[#17324F] tracking-tight">
                  {currentNgo?.name || 'NGO Resource Depot'}
                </h1>
                {currentNgo?.verified && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-50 text-[#16877F] border border-teal-200">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Verified Relief Partner</span>
                  </span>
                )}
                <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                  ID: {selectedNgoId}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm text-[#526277]">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-[#16877F]" />
                  <span>{currentNgo?.location_text || 'Relief Hub Location'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Phone className="w-4 h-4 text-slate-400" />
                  <span>{currentNgo?.phone || 'Contact Phone'}</span>
                </div>
                {currentNgo?.coordinator_name && (
                  <div className="flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-slate-400" />
                    <span>Hub Lead: {currentNgo.coordinator_name}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions: Refresh & Manual Stock Adjustment */}
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={loadDashboardData}
                disabled={isLoading}
                className="h-10 px-3.5 bg-white hover:bg-slate-50 text-[#17324F] font-bold text-xs sm:text-sm rounded-xl border border-slate-300 shadow-xs transition flex items-center gap-2"
                title="Refresh latest backend data"
              >
                <RefreshCw className={`w-4 h-4 text-[#16877F] ${isLoading ? 'animate-spin' : ''}`} />
                <span>Sync Data</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (currentNgo?.capacity?.[0]) {
                    openStockModal(currentNgo.capacity[0]);
                  }
                }}
                className="h-10 px-4 bg-[#16877F] hover:bg-teal-800 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Adjust Stock</span>
              </button>
            </div>
          </div>

          {/* Navigation Sub-Tabs */}
          <div className="flex items-center gap-2 mt-6 border-b border-slate-200 overflow-x-auto">
            <button
              onClick={() => setActiveTab('overview')}
              className={`pb-3 px-3 text-sm font-bold border-b-2 transition whitespace-nowrap ${
                activeTab === 'overview'
                  ? 'border-[#16877F] text-[#16877F]'
                  : 'border-transparent text-[#526277] hover:text-[#17324F]'
              }`}
            >
              Overview &amp; Metrics
            </button>
            <button
              onClick={() => setActiveTab('inventory')}
              className={`pb-3 px-3 text-sm font-bold border-b-2 transition whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'inventory'
                  ? 'border-[#16877F] text-[#16877F]'
                  : 'border-transparent text-[#526277] hover:text-[#17324F]'
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
              className={`pb-3 px-3 text-sm font-bold border-b-2 transition whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'needs'
                  ? 'border-[#16877F] text-[#16877F]'
                  : 'border-transparent text-[#526277] hover:text-[#17324F]'
              }`}
            >
              <span>Matched Needs</span>
              <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">
                {matchedNeeds.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('dispatches')}
              className={`pb-3 px-3 text-sm font-bold border-b-2 transition whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'dispatches'
                  ? 'border-[#16877F] text-[#16877F]'
                  : 'border-transparent text-[#526277] hover:text-[#17324F]'
              }`}
            >
              <span>Dispatch Management</span>
              <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">
                {dispatches.length}
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 4. MAIN CONTENT AREA                                                 */}
      {/* ==================================================================== */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
        {/* ================================================================== */}
        {/* SECTION A: OPERATIONAL OVERVIEW METRIC CARDS                       */}
        {/* ================================================================== */}
        {(activeTab === 'overview' || activeTab === 'inventory') && (
          <section aria-labelledby="overview-heading" className="space-y-4">
            <h2 id="overview-heading" className="text-lg font-bold text-[#17324F] flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#16877F]" />
              <span>Operational Depot Status</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Available Inventory */}
              <div
                onClick={() => setActiveTab('inventory')}
                className="bg-white p-5 rounded-2xl border border-[#E1E8F0] shadow-xs hover:border-teal-300 cursor-pointer transition space-y-2"
              >
                <div className="flex items-center justify-between text-[#526277]">
                  <span className="text-xs font-bold uppercase tracking-wider">Available Stock</span>
                  <div className="w-8 h-8 rounded-lg bg-teal-50 text-[#16877F] flex items-center justify-center">
                    <Package className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-[#17324F]">{totalAvailableStock}</span>
                  <span className="text-xs text-slate-500 font-semibold">units on shelf</span>
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-1 pt-1 border-t border-slate-100">
                  <span>Reserved for dispatch:</span>
                  <strong className="text-slate-800">{totalReservedStock} units</strong>
                </div>
              </div>

              {/* Card 2: Incoming Matched Requests */}
              <div
                onClick={() => setActiveTab('needs')}
                className="bg-white p-5 rounded-2xl border border-[#E1E8F0] shadow-xs hover:border-blue-300 cursor-pointer transition space-y-2"
              >
                <div className="flex items-center justify-between text-[#526277]">
                  <span className="text-xs font-bold uppercase tracking-wider">Matched Requests</span>
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                    <FileText className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-[#17324F]">{matchedNeeds.length}</span>
                  <span className="text-xs text-slate-500 font-semibold">needs routed by backend</span>
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-1 pt-1 border-t border-slate-100">
                  <span>Pending readiness check</span>
                </div>
              </div>

              {/* Card 3: Active Dispatches */}
              <div
                onClick={() => setActiveTab('dispatches')}
                className="bg-white p-5 rounded-2xl border border-[#E1E8F0] shadow-xs hover:border-amber-300 cursor-pointer transition space-y-2"
              >
                <div className="flex items-center justify-between text-[#526277]">
                  <span className="text-xs font-bold uppercase tracking-wider">Active Dispatches</span>
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
                    <Truck className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-[#17324F]">{activeDispatches.length}</span>
                  <span className="text-xs text-slate-500 font-semibold">in transit / en route</span>
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-1 pt-1 border-t border-slate-100">
                  <span>Assigned to field responders</span>
                </div>
              </div>

              {/* Card 4: Completed Deliveries */}
              <div
                onClick={() => setActiveTab('dispatches')}
                className="bg-white p-5 rounded-2xl border border-[#E1E8F0] shadow-xs hover:border-emerald-300 cursor-pointer transition space-y-2"
              >
                <div className="flex items-center justify-between text-[#526277]">
                  <span className="text-xs font-bold uppercase tracking-wider">Fulfilled Deliveries</span>
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-[#17324F]">{completedDispatches.length}</span>
                  <span className="text-xs text-slate-500 font-semibold">verified on site</span>
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-1 pt-1 border-t border-slate-100">
                  <span>All signatures recorded</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ================================================================== */}
        {/* SECTION B: INVENTORY MANAGEMENT                                    */}
        {/* ================================================================== */}
        {(activeTab === 'overview' || activeTab === 'inventory') && (
          <section aria-labelledby="inventory-heading" className="bg-white rounded-2xl border border-[#E1E8F0] shadow-xs overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 id="inventory-heading" className="text-xl font-bold text-[#17324F] flex items-center gap-2">
                  <Package className="w-5 h-5 text-[#16877F]" />
                  <span>Depot Inventory &amp; Stock Levels</span>
                </h2>
                <p className="text-xs sm:text-sm text-[#526277] mt-0.5">
                  Real-time warehouse supplies available for emergency dispatch missions. Updates persist to backend API.
                </p>
              </div>

              {lowStockCount > 0 && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-900 border border-amber-200 text-xs font-bold self-start sm:self-auto">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>{lowStockCount} items below replenishment threshold</span>
                </div>
              )}
            </div>

            {/* Inventory Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-[#F7F9FC] text-[#526277] text-xs font-bold uppercase tracking-wider border-b border-slate-200">
                    <th scope="col" className="py-3 px-5">Supply Item &amp; Category</th>
                    <th scope="col" className="py-3 px-5 text-right">Available Qty</th>
                    <th scope="col" className="py-3 px-5 text-right">Reserved Qty</th>
                    <th scope="col" className="py-3 px-5 text-right">Total Warehouse</th>
                    <th scope="col" className="py-3 px-5">Stock Status</th>
                    <th scope="col" className="py-3 px-5 text-right">Stock Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentNgo?.capacity?.map((item) => {
                    const isLow = item.quantity <= (item.threshold || 20);
                    const isDepleted = item.quantity === 0;

                    return (
                      <tr key={item.need_type} className="hover:bg-slate-50/75 transition">
                        <td className="py-4 px-5">
                          <div className="font-bold text-[#17324F]">
                            {item.item_name || `${item.need_type.toUpperCase()} Supplies`}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                            <span className="capitalize font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-100">
                              {item.need_type}
                            </span>
                            <span>Threshold: {item.threshold || 20} {item.unit}</span>
                          </div>
                        </td>

                        <td className="py-4 px-5 text-right font-black text-base text-[#17324F]">
                          {item.quantity} <span className="text-xs font-normal text-slate-500">{item.unit}</span>
                        </td>

                        <td className="py-4 px-5 text-right text-slate-600 font-semibold">
                          {item.reserved || 0} <span className="text-xs font-normal text-slate-500">{item.unit}</span>
                        </td>

                        <td className="py-4 px-5 text-right font-bold text-slate-800">
                          {(item.quantity || 0) + (item.reserved || 0)} <span className="text-xs font-normal text-slate-500">{item.unit}</span>
                        </td>

                        <td className="py-4 px-5">
                          {isDepleted ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-red-50 text-red-800 border border-red-200">
                              <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                              <span>Depleted</span>
                            </span>
                          ) : isLow ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-50 text-amber-900 border border-amber-200">
                              <TrendingDown className="w-3.5 h-3.5 text-amber-600" />
                              <span>Low Stock (&lt;{item.threshold || 20})</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Sufficient</span>
                            </span>
                          )}
                        </td>

                        <td className="py-4 px-5 text-right">
                          <button
                            type="button"
                            onClick={() => openStockModal(item)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-teal-50 text-[#17324F] hover:text-[#16877F] font-bold text-xs rounded-lg border border-slate-200 hover:border-teal-200 transition inline-flex items-center gap-1.5"
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
          </section>
        )}

        {/* ================================================================== */}
        {/* SECTION C: MATCHED NEEDS FROM BACKEND                              */}
        {/* ================================================================== */}
        {(activeTab === 'overview' || activeTab === 'needs') && (
          <section aria-labelledby="needs-heading" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 id="needs-heading" className="text-xl font-bold text-[#17324F] flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[#16877F]" />
                  <span>Incoming Backend-Matched Emergency Requests</span>
                </h2>
                <p className="text-xs sm:text-sm text-[#526277] mt-0.5">
                  Verified emergency distress reports routed to {currentNgo?.name} by the SETU matching engine.
                </p>
              </div>
              <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-lg self-start sm:self-auto">
                {matchedNeeds.length} Requests Assigned
              </span>
            </div>

            {matchedNeeds.length === 0 ? (
              <div className="bg-white p-12 text-center rounded-2xl border border-[#E1E8F0] space-y-3">
                <CheckCircle2 className="w-12 h-12 text-teal-600 mx-auto" />
                <h3 className="text-lg font-bold text-[#17324F]">No Pending Matched Requests</h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  All emergency needs routed to this organization have been addressed or fulfilled.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {matchedNeeds.map((need) => {
                  const assignment = need.assignment;
                  const isAssigned = Boolean(assignment);
                  const isDelivered = need.status === 'resolved' || assignment?.status === 'resolved';

                  return (
                    <div
                      key={need.id}
                      className="bg-white rounded-2xl border border-[#E1E8F0] p-5 shadow-xs space-y-4 flex flex-col justify-between hover:border-slate-300 transition"
                    >
                      <div className="space-y-3">
                        {/* Header: ID, Severity, Trust */}
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold bg-[#17324F] text-white px-2 py-0.5 rounded">
                              {need.id}
                            </span>
                            <span className="capitalize text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                              {need.need_type}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {need.severity === 'critical' ? (
                              <span className="text-xs font-black uppercase px-2 py-0.5 rounded bg-red-100 text-red-900 border border-red-300">
                                Critical Urgency
                              </span>
                            ) : (
                              <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                                {need.severity} Priority
                              </span>
                            )}
                            <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                              Trust: {need.trust_score}%
                            </span>
                          </div>
                        </div>

                        {/* Description */}
                        <p className="text-sm font-medium text-[#17324F] leading-snug">
                          {need.description}
                        </p>

                        {/* Destination & Requested Quantity */}
                        <div className="bg-[#F7F9FC] rounded-xl p-3 space-y-1.5 text-xs">
                          <div className="flex items-center gap-2 text-slate-700">
                            <MapPin className="w-3.5 h-3.5 text-[#16877F] shrink-0" />
                            <span className="font-semibold">{need.location_text}</span>
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                            <span className="text-slate-500">Required Aid:</span>
                            <strong className="text-[#17324F]">
                              {need.quantity} {need.unit} of {need.item}
                            </strong>
                          </div>
                        </div>
                      </div>

                      {/* Footer: Assignment Status & Actions */}
                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                        <div className="text-xs">
                          {isDelivered ? (
                            <span className="text-emerald-700 font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Delivered &amp; Resolved</span>
                            </span>
                          ) : isAssigned ? (
                            <div className="text-slate-600">
                              <span>Dispatched to </span>
                              <strong className="text-[#17324F]">
                                {need.volunteer?.name || 'Volunteer Responder'}
                              </strong>
                            </div>
                          ) : (
                            <span className="text-amber-700 font-bold flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              <span>Awaiting Volunteer Pickup</span>
                            </span>
                          )}
                        </div>

                        {assignment && assignment.dispatch_status !== 'dispatched' && !isDelivered && (
                          <button
                            type="button"
                            onClick={() => handleConfirmDispatch(assignment.id)}
                            disabled={actionLoadingId === assignment.id}
                            className="px-3 py-1.5 bg-[#16877F] hover:bg-teal-800 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5"
                          >
                            <Truck className="w-3.5 h-3.5" />
                            <span>
                              {actionLoadingId === assignment.id ? 'Updating...' : 'Confirm Dispatch'}
                            </span>
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
          <section aria-labelledby="dispatch-heading" className="bg-white rounded-2xl border border-[#E1E8F0] shadow-xs overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 id="dispatch-heading" className="text-xl font-bold text-[#17324F] flex items-center gap-2">
                  <Truck className="w-5 h-5 text-[#16877F]" />
                  <span>Relief Dispatch &amp; Delivery Management</span>
                </h2>
                <p className="text-xs sm:text-sm text-[#526277] mt-0.5">
                  Track field dispatches assigned from {currentNgo?.name} depot to volunteer couriers.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-teal-50 text-teal-800 text-xs font-bold rounded-lg border border-teal-200">
                  {activeDispatches.length} Active Missions
                </span>
              </div>
            </div>

            {dispatches.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <Truck className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold">No dispatches logged for this organization yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-[#F7F9FC] text-[#526277] text-xs font-bold uppercase tracking-wider border-b border-slate-200">
                      <th scope="col" className="py-3 px-5">Dispatch ID / Need</th>
                      <th scope="col" className="py-3 px-5">Destination</th>
                      <th scope="col" className="py-3 px-5">Dispatched Supplies</th>
                      <th scope="col" className="py-3 px-5">Assigned Volunteer</th>
                      <th scope="col" className="py-3 px-5">Status</th>
                      <th scope="col" className="py-3 px-5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dispatches.map((dispatch) => {
                      const isDelivered = dispatch.status === 'resolved' || dispatch.dispatch_status === 'delivered';
                      const isInTransit = dispatch.dispatch_status === 'in_transit' || dispatch.status === 'in_progress';

                      return (
                        <tr key={dispatch.id} className="hover:bg-slate-50/75 transition">
                          <td className="py-4 px-5">
                            <span className="font-mono font-bold text-[#17324F]">{dispatch.id}</span>
                            <div className="text-xs text-slate-500 font-mono">Need: {dispatch.need_id}</div>
                          </td>

                          <td className="py-4 px-5">
                            <div className="font-bold text-[#17324F] flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-[#16877F] shrink-0" />
                              <span>{dispatch.destination || dispatch.need?.location_text || 'Relief Location'}</span>
                            </div>
                            <span className="text-xs text-slate-400">
                              Assigned {new Date(dispatch.assigned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </td>

                          <td className="py-4 px-5">
                            <div className="font-bold text-[#17324F]">
                              {dispatch.supplies || `${dispatch.quantity} ${dispatch.unit}`}
                            </div>
                          </td>

                          <td className="py-4 px-5">
                            <div className="font-bold text-[#17324F]">
                              {dispatch.volunteer?.name || `Volunteer ${dispatch.volunteer_id}`}
                            </div>
                            {dispatch.volunteer?.phone && (
                              <a
                                href={`tel:${dispatch.volunteer.phone}`}
                                className="text-xs text-[#16877F] hover:underline flex items-center gap-1 mt-0.5"
                              >
                                <Phone className="w-3 h-3" />
                                <span>{dispatch.volunteer.phone}</span>
                              </a>
                            )}
                          </td>

                          <td className="py-4 px-5">
                            {isDelivered ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Delivered</span>
                              </span>
                            ) : isInTransit ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200">
                                <Truck className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
                                <span>In Transit</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-50 text-amber-900 border border-amber-200">
                                <Clock className="w-3.5 h-3.5 text-amber-600" />
                                <span>Ready for Pickup</span>
                              </span>
                            )}
                          </td>

                          <td className="py-4 px-5 text-right">
                            {!isDelivered && dispatch.dispatch_status !== 'dispatched' ? (
                              <button
                                type="button"
                                onClick={() => handleConfirmDispatch(dispatch.id)}
                                disabled={actionLoadingId === dispatch.id}
                                className="px-3 py-1.5 bg-[#16877F] hover:bg-teal-800 text-white font-bold text-xs rounded-lg transition"
                              >
                                {actionLoadingId === dispatch.id ? 'Saving...' : 'Confirm Dispatch'}
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
                <h3 id="stock-modal-title" className="text-lg font-bold">
                  Update Relief Stock
                </h3>
                <p className="text-xs text-slate-300">
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

            <form onSubmit={handleSaveStock} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Available Quantity ({editingItem.unit})
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={updateQuantity}
                  onChange={(e) => setUpdateQuantity(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#16877F] text-base font-bold text-[#17324F]"
                />
                <span className="text-xs text-slate-500 mt-1 block">
                  Current: {editingItem.quantity} {editingItem.unit} | Reserved: {editingItem.reserved || 0} {editingItem.unit}
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Intake / Adjustment Reason (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Received shipment from District Collectorate"
                  value={updateNotes}
                  onChange={(e) => setUpdateNotes(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#16877F] text-sm text-[#17324F]"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsUpdateModalOpen(false)}
                  className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingStock}
                  className="px-5 py-2 text-sm font-bold bg-[#16877F] hover:bg-teal-800 text-white rounded-xl shadow-xs transition flex items-center gap-2"
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
      <footer className="bg-white border-t border-[#E1E8F0] py-6 text-xs text-slate-500 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <SetuLogo variant="light" iconSize={28} showTagline={false} />
            <span>SETU NGO Resource &amp; Dispatch Console • Built with Bharat 4.0</span>
          </div>
          <div className="flex items-center gap-4 font-semibold text-[#16877F]">
            <Link to="/volunteer-dashboard" className="hover:underline">Volunteer Dashboard</Link>
            <Link to="/dashboard" className="hover:underline">Coordinator Operations</Link>
            <Link to="/" className="hover:underline">Public Homepage</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
