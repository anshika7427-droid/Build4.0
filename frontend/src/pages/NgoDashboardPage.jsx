import React, { useState, useEffect } from 'react';
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
  FileText,
  Clock,
  TrendingDown,
  Info,
  X,
  Sparkles
} from 'lucide-react';
import ApiService from '../services/api';
import DashboardNavbar from '../components/DashboardNavbar';

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

  // Active View Tab: 'inventory' | 'needs' | 'dispatches'
  const [activeTab, setActiveTab] = useState('inventory');

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
  // Computed Metrics (Actual backend data)
  // --------------------------------------------------------------------------
  const totalAvailableStock = currentNgo?.capacity?.reduce((sum, c) => sum + (c.quantity || 0), 0) || 0;
  const totalReservedStock = currentNgo?.capacity?.reduce((sum, c) => sum + (c.reserved || 0), 0) || 0;
  const lowStockItems = currentNgo?.capacity?.filter((c) => c.quantity <= (c.threshold || 20)) || [];
  const activeDispatches = dispatches.filter((d) => d.status !== 'resolved' && d.dispatch_status !== 'delivered');
  const completedDispatches = dispatches.filter((d) => d.status === 'resolved' || d.dispatch_status === 'delivered');

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
        role="ngo"
        roleBadge="NGO WORKSPACE"
        selectorIcon={Building2}
        selectorLabel="Switch Demo NGO Depot"
        selectorValue={selectedNgoId}
        selectorOptions={ngos.map((n) => ({ id: n.id, label: `${n.name} (${n.id})` }))}
        onSelectorChange={setSelectedNgoId}
        systemMode={systemMode}
        onToggleMode={toggleSystemMode}
        otherDashboard={{
          to: '/volunteer-dashboard',
          label: 'Volunteer Hub',
          icon: Users,
        }}
      />

      {/* ==================================================================== */}
      {/* 2. COMPACT BACKEND MATCHING & DEMO DISCLAIMER NOTICE                 */}
      {/* ==================================================================== */}
      <div className="bg-[#17324F] text-slate-200 border-b border-slate-700/80 py-2 px-4 text-xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-teal-800 text-teal-200 font-bold uppercase text-[10px] tracking-wider shrink-0">
              Backend-Driven Matching
            </span>
            <span className="text-slate-300 truncate">
              The SETU backend engine coordinates needs allocation and volunteer pairing.
            </span>
          </div>
          {systemMode === 'mock' && (
            <span className="text-amber-300 font-medium shrink-0 flex items-center gap-1 text-[11px]">
              <Sparkles className="w-3 h-3" />
              <span>Simulated records active for evaluation</span>
            </span>
          )}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 3. COMPACT ORGANIZATION IDENTITY & ACTION BAR                        */}
      {/* ==================================================================== */}
      <section className="bg-white border-b border-[#E1E8F0] py-4 sm:py-5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* NGO Identity & Contact Meta */}
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black text-[#17324F] tracking-tight">
                  {currentNgo?.name || 'NGO Resource Depot'}
                </h1>
                {currentNgo?.verified && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-teal-50 text-[#16877F] border border-teal-200">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Verified Partner</span>
                  </span>
                )}
                <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                  {selectedNgoId}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-[#526277]">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#16877F] shrink-0" />
                  <span>{currentNgo?.location_text || 'Relief Hub Location'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{currentNgo?.phone || 'Phone'}</span>
                </div>
                {currentNgo?.coordinator_name && (
                  <div className="flex items-center gap-1.5 hidden sm:flex">
                    <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>Hub Lead: {currentNgo.coordinator_name}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions: Sync & Stock Adjustment */}
            <div className="flex items-center gap-2.5 shrink-0 self-start md:self-auto">
              <button
                type="button"
                onClick={loadDashboardData}
                disabled={isLoading}
                className="h-9 px-3 bg-white hover:bg-slate-50 text-[#17324F] font-bold text-xs rounded-xl border border-slate-300 shadow-xs transition flex items-center gap-1.5"
                title="Sync data with backend"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-[#16877F] ${isLoading ? 'animate-spin' : ''}`} />
                <span>Sync</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (currentNgo?.capacity?.[0]) {
                    openStockModal(currentNgo.capacity[0]);
                  }
                }}
                className="h-9 px-3.5 bg-[#16877F] hover:bg-teal-800 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Update Stock</span>
              </button>
            </div>
          </div>

          {/* Clean Section Navigation Tabs */}
          <div className="flex items-center gap-1 border-t border-slate-100 pt-3 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setActiveTab('inventory')}
              className={`py-2 px-3.5 text-xs sm:text-sm font-bold rounded-xl transition flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'inventory'
                  ? 'bg-[#17324F] text-white'
                  : 'text-[#526277] hover:text-[#17324F] hover:bg-slate-100'
              }`}
            >
              <Package className="w-4 h-4" />
              <span>Relief Inventory</span>
              {lowStockItems.length > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-xs font-bold ${
                  activeTab === 'inventory' ? 'bg-amber-400 text-amber-950' : 'bg-amber-100 text-amber-900'
                }`}>
                  {lowStockItems.length} low
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('needs')}
              className={`py-2 px-3.5 text-xs sm:text-sm font-bold rounded-xl transition flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'needs'
                  ? 'bg-[#17324F] text-white'
                  : 'text-[#526277] hover:text-[#17324F] hover:bg-slate-100'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Matched Needs</span>
              <span className={`px-1.5 py-0.2 rounded-full text-xs font-bold ${
                activeTab === 'needs' ? 'bg-teal-400 text-teal-950' : 'bg-slate-100 text-slate-700'
              }`}>
                {matchedNeeds.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('dispatches')}
              className={`py-2 px-3.5 text-xs sm:text-sm font-bold rounded-xl transition flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'dispatches'
                  ? 'bg-[#17324F] text-white'
                  : 'text-[#526277] hover:text-[#17324F] hover:bg-slate-100'
              }`}
            >
              <Truck className="w-4 h-4" />
              <span>Dispatch Missions</span>
              <span className={`px-1.5 py-0.2 rounded-full text-xs font-bold ${
                activeTab === 'dispatches' ? 'bg-blue-400 text-blue-950' : 'bg-slate-100 text-slate-700'
              }`}>
                {dispatches.length}
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 4. MAIN CONTENT AREA                                                 */}
      {/* ==================================================================== */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full space-y-6">
        
        {/* ================================================================== */}
        {/* CONCISE KPIS (Compact Strip across all views)                      */}
        {/* ================================================================== */}
        <section aria-label="Depot Summary Statistics" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* KPI 1: Available Units */}
          <div className="bg-white p-4 rounded-xl border border-[#E1E8F0] shadow-xs space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#526277] block">
              Available Units
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-[#17324F]">{totalAvailableStock}</span>
              <span className="text-xs text-slate-500 font-semibold">on shelf</span>
            </div>
          </div>

          {/* KPI 2: Reserved Units */}
          <div className="bg-white p-4 rounded-xl border border-[#E1E8F0] shadow-xs space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#526277] block">
              Committed to Dispatch
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-slate-700">{totalReservedStock}</span>
              <span className="text-xs text-slate-500 font-semibold">reserved units</span>
            </div>
          </div>

          {/* KPI 3: Matched Needs */}
          <div className="bg-white p-4 rounded-xl border border-[#E1E8F0] shadow-xs space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#526277] block">
              Matched Requests
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-[#16877F]">{matchedNeeds.length}</span>
              <span className="text-xs text-slate-500 font-semibold">routed by engine</span>
            </div>
          </div>

          {/* KPI 4: Active Dispatches */}
          <div className="bg-white p-4 rounded-xl border border-[#E1E8F0] shadow-xs space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#526277] block">
              Active Dispatches
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-amber-700">{activeDispatches.length}</span>
              <span className="text-xs text-slate-500 font-semibold">active ({completedDispatches.length} fulfilled)</span>
            </div>
          </div>
        </section>

        {/* ================================================================== */}
        {/* TAB 1: RELIEF INVENTORY & ACTUAL LOW-STOCK ALERTS (Primary View)    */}
        {/* ================================================================== */}
        {activeTab === 'inventory' && (
          <div className="space-y-4">
            
            {/* Visually Distinct Low-Stock Warning Area (Driven ONLY by actual stock <= threshold) */}
            {lowStockItems.length > 0 && (
              <div
                role="region"
                aria-label="Low Stock Alerts"
                className="bg-amber-50/90 border border-amber-300 rounded-xl p-4 shadow-xs space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                    <h2 className="text-xs sm:text-sm font-bold text-amber-950 uppercase tracking-wider">
                      Depot Replenishment Alert ({lowStockItems.length} items below safety threshold)
                    </h2>
                  </div>
                  <span className="text-xs text-amber-800 font-semibold hidden sm:inline">
                    Actual warehouse count at or below designated threshold
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
                  {lowStockItems.map((item) => (
                    <div
                      key={item.need_type}
                      className="bg-white/90 rounded-lg p-2.5 border border-amber-200 flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <strong className="text-slate-900 block font-bold">
                          {item.item_name}
                        </strong>
                        <span className="text-amber-800 font-semibold">
                          {item.quantity} {item.unit} available (Threshold: {item.threshold || 20})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => openStockModal(item)}
                        className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg shrink-0 transition"
                      >
                        Restock
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Primary Inventory Table Card */}
            <section aria-labelledby="inventory-table-heading" className="bg-white rounded-xl border border-[#E1E8F0] shadow-xs overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 id="inventory-table-heading" className="text-base sm:text-lg font-black text-[#17324F] flex items-center gap-2">
                    <Package className="w-5 h-5 text-[#16877F]" />
                    <span>Warehouse Relief Supplies &amp; Capacity</span>
                  </h2>
                  <p className="text-xs text-[#526277] mt-0.5">
                    Live shelf stock available for emergency dispatches. Adjustments sync with backend APIs.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (currentNgo?.capacity?.[0]) openStockModal(currentNgo.capacity[0]);
                  }}
                  className="px-3 py-1.5 bg-[#16877F] hover:bg-teal-800 text-white font-bold text-xs rounded-xl shadow-xs transition inline-flex items-center gap-1.5 self-start sm:self-auto"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add / Restock Item</span>
                </button>
              </div>

              {/* Responsive Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-[#F7F9FC] text-[#526277] text-xs font-bold uppercase tracking-wider border-b border-slate-200">
                      <th scope="col" className="py-3 px-4 sm:px-5">Supply Item &amp; Category</th>
                      <th scope="col" className="py-3 px-4 sm:px-5 text-right">Available</th>
                      <th scope="col" className="py-3 px-4 sm:px-5 text-right">Reserved</th>
                      <th scope="col" className="py-3 px-4 sm:px-5 text-right">Total Warehouse</th>
                      <th scope="col" className="py-3 px-4 sm:px-5">Stock Status</th>
                      <th scope="col" className="py-3 px-4 sm:px-5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {currentNgo?.capacity?.map((item) => {
                      const isLow = item.quantity <= (item.threshold || 20);
                      const isDepleted = item.quantity === 0;

                      return (
                        <tr key={item.need_type} className="hover:bg-slate-50/70 transition">
                          <td className="py-3.5 px-4 sm:px-5">
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

                          <td className="py-3.5 px-4 sm:px-5 text-right font-black text-base text-[#17324F]">
                            {item.quantity} <span className="text-xs font-normal text-slate-500">{item.unit}</span>
                          </td>

                          <td className="py-3.5 px-4 sm:px-5 text-right text-slate-600 font-semibold">
                            {item.reserved || 0} <span className="text-xs font-normal text-slate-500">{item.unit}</span>
                          </td>

                          <td className="py-3.5 px-4 sm:px-5 text-right font-bold text-slate-800">
                            {(item.quantity || 0) + (item.reserved || 0)} <span className="text-xs font-normal text-slate-500">{item.unit}</span>
                          </td>

                          <td className="py-3.5 px-4 sm:px-5">
                            {isDepleted ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-red-50 text-red-800 border border-red-200">
                                <AlertTriangle className="w-3 h-3 text-red-600" />
                                <span>Depleted</span>
                              </span>
                            ) : isLow ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-amber-50 text-amber-900 border border-amber-200">
                                <TrendingDown className="w-3 h-3 text-amber-600" />
                                <span>Low (&lt;{item.threshold || 20})</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>Sufficient</span>
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 sm:px-5 text-right">
                            <button
                              type="button"
                              onClick={() => openStockModal(item)}
                              className="px-3 py-1 bg-slate-100 hover:bg-teal-50 text-[#17324F] hover:text-[#16877F] font-bold text-xs rounded-lg border border-slate-200 hover:border-teal-200 transition"
                            >
                              Update
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* ================================================================== */}
        {/* TAB 2: BACKEND-MATCHED EMERGENCY NEEDS FEED                        */}
        {/* ================================================================== */}
        {activeTab === 'needs' && (
          <section aria-labelledby="matched-needs-heading" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 id="matched-needs-heading" className="text-base sm:text-lg font-black text-[#17324F] flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[#16877F]" />
                  <span>Incoming Backend-Matched Emergency Requests</span>
                </h2>
                <p className="text-xs text-[#526277] mt-0.5">
                  Distress reports routed to {currentNgo?.name} based on supply capacity and proximity.
                </p>
              </div>
            </div>

            {matchedNeeds.length === 0 ? (
              <div className="bg-white p-10 text-center rounded-xl border border-[#E1E8F0] space-y-2">
                <CheckCircle2 className="w-10 h-10 text-teal-600 mx-auto" />
                <h3 className="text-base font-bold text-[#17324F]">No Pending Matched Requests</h3>
                <p className="text-xs text-slate-500">
                  All requests routed to this organization have been addressed or fulfilled.
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
                      className="bg-white rounded-xl border border-[#E1E8F0] p-4 sm:p-5 shadow-xs space-y-3.5 flex flex-col justify-between hover:border-slate-300 transition"
                    >
                      <div className="space-y-2.5">
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
                              <span className="text-[11px] font-black uppercase px-2 py-0.5 rounded bg-red-100 text-red-900 border border-red-300">
                                Critical Urgency
                              </span>
                            ) : (
                              <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                                {need.severity} Priority
                              </span>
                            )}
                            <span className="text-[11px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                              Trust: {need.trust_score}%
                            </span>
                          </div>
                        </div>

                        {/* Description */}
                        <p className="text-sm font-semibold text-[#17324F] leading-snug">
                          {need.description}
                        </p>

                        {/* Destination & Required Aid */}
                        <div className="bg-[#F7F9FC] rounded-lg p-2.5 space-y-1 text-xs">
                          <div className="flex items-center gap-1.5 text-slate-700">
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

                      {/* Footer Actions */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                        <div>
                          {isDelivered ? (
                            <span className="text-emerald-700 font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Fulfilled &amp; Delivered</span>
                            </span>
                          ) : isAssigned ? (
                            <span className="text-slate-600">
                              Assigned to <strong className="text-[#17324F]">{need.volunteer?.name || 'Volunteer Courier'}</strong>
                            </span>
                          ) : (
                            <span className="text-amber-700 font-bold flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              <span>Awaiting Courier Pickup</span>
                            </span>
                          )}
                        </div>

                        {assignment && assignment.dispatch_status !== 'dispatched' && !isDelivered && (
                          <button
                            type="button"
                            onClick={() => handleConfirmDispatch(assignment.id)}
                            disabled={actionLoadingId === assignment.id}
                            className="px-3 py-1.5 bg-[#16877F] hover:bg-teal-800 text-white font-bold text-xs rounded-lg transition flex items-center gap-1.5 shadow-xs"
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
        {/* TAB 3: DISPATCH MISSIONS MANAGEMENT                                */}
        {/* ================================================================== */}
        {activeTab === 'dispatches' && (
          <section aria-labelledby="dispatch-table-heading" className="bg-white rounded-xl border border-[#E1E8F0] shadow-xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 id="dispatch-table-heading" className="text-base sm:text-lg font-black text-[#17324F] flex items-center gap-2">
                  <Truck className="w-5 h-5 text-[#16877F]" />
                  <span>Relief Dispatch &amp; Delivery Management</span>
                </h2>
                <p className="text-xs text-[#526277] mt-0.5">
                  Courier assignments linked to {currentNgo?.name} warehouse stock.
                </p>
              </div>

              <span className="text-xs font-bold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-200 self-start sm:self-auto">
                {activeDispatches.length} Active Missions
              </span>
            </div>

            {dispatches.length === 0 ? (
              <div className="p-10 text-center text-slate-500 text-xs sm:text-sm">
                <Truck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold">No dispatches logged for this organization yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-[#F7F9FC] text-[#526277] text-xs font-bold uppercase tracking-wider border-b border-slate-200">
                      <th scope="col" className="py-3 px-4 sm:px-5">Dispatch ID</th>
                      <th scope="col" className="py-3 px-4 sm:px-5">Destination</th>
                      <th scope="col" className="py-3 px-4 sm:px-5">Dispatched Aid</th>
                      <th scope="col" className="py-3 px-4 sm:px-5">Assigned Courier</th>
                      <th scope="col" className="py-3 px-4 sm:px-5">Status</th>
                      <th scope="col" className="py-3 px-4 sm:px-5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dispatches.map((dispatch) => {
                      const isDelivered = dispatch.status === 'resolved' || dispatch.dispatch_status === 'delivered';
                      const isInTransit = dispatch.dispatch_status === 'in_transit' || dispatch.status === 'in_progress';

                      return (
                        <tr key={dispatch.id} className="hover:bg-slate-50/70 transition">
                          <td className="py-3.5 px-4 sm:px-5 font-mono font-bold text-[#17324F]">
                            {dispatch.id}
                            <div className="text-[11px] text-slate-400 font-normal">Need: {dispatch.need_id}</div>
                          </td>

                          <td className="py-3.5 px-4 sm:px-5">
                            <div className="font-bold text-[#17324F] flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-[#16877F] shrink-0" />
                              <span>{dispatch.destination || dispatch.need?.location_text || 'Relief Location'}</span>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 sm:px-5 font-semibold text-[#17324F]">
                            {dispatch.supplies || `${dispatch.quantity} ${dispatch.unit}`}
                          </td>

                          <td className="py-3.5 px-4 sm:px-5">
                            <div className="font-bold text-[#17324F]">
                              {dispatch.volunteer?.name || `Volunteer ${dispatch.volunteer_id}`}
                            </div>
                            {dispatch.volunteer?.phone && (
                              <a
                                href={`tel:${dispatch.volunteer.phone}`}
                                className="text-xs text-[#16877F] hover:underline flex items-center gap-1"
                              >
                                <Phone className="w-3 h-3" />
                                <span>{dispatch.volunteer.phone}</span>
                              </a>
                            )}
                          </td>

                          <td className="py-3.5 px-4 sm:px-5">
                            {isDelivered ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>Delivered</span>
                              </span>
                            ) : isInTransit ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200">
                                <Truck className="w-3 h-3 text-blue-600 animate-pulse" />
                                <span>In Transit</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-amber-50 text-amber-900 border border-amber-200">
                                <Clock className="w-3 h-3 text-amber-600" />
                                <span>Ready for Pickup</span>
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 sm:px-5 text-right">
                            {!isDelivered && dispatch.dispatch_status !== 'dispatched' ? (
                              <button
                                type="button"
                                onClick={() => handleConfirmDispatch(dispatch.id)}
                                disabled={actionLoadingId === dispatch.id}
                                className="px-3 py-1 bg-[#16877F] hover:bg-teal-800 text-white font-bold text-xs rounded-lg transition"
                              >
                                {actionLoadingId === dispatch.id ? 'Updating...' : 'Confirm'}
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
            <div className="p-4 sm:p-5 bg-[#17324F] text-white flex items-center justify-between">
              <div>
                <h3 id="stock-modal-title" className="text-base sm:text-lg font-bold">
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

            <form onSubmit={handleSaveStock} className="p-5 space-y-4">
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
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Update</span>
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
          <span>SETU Disaster Response • NGO Resource &amp; Dispatch Console</span>
          <span className="font-semibold text-slate-400">Built with Bharat 4.0</span>
        </div>
      </footer>
    </div>
  );
}
