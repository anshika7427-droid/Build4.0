import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ShieldAlert,
  Building2,
  Users,
  ArrowRight,
  Sparkles,
  Info
} from 'lucide-react';
import SetuNavbar from '../components/SetuNavbar';
import SetuLogo from '../components/SetuLogo';

export default function LoginPage() {
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState('coordinator'); // 'coordinator' | 'ngo' | 'volunteer'

  const handleDemoSignIn = (e) => {
    e.preventDefault();
    if (selectedRole === 'coordinator') {
      navigate('/dashboard');
    } else if (selectedRole === 'ngo') {
      navigate('/ngo-dashboard');
    } else {
      navigate('/volunteer-dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F7FB] text-[#17324F] font-sans flex flex-col">
      {/* 1. Shared Unified Navbar */}
      <SetuNavbar activePage="login" />

      {/* 2. Main Login Workspace */}
      <main className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8 bg-white p-8 sm:p-10 rounded-2xl border border-[#D7E0EA] shadow-sm">
          
          <div className="text-center space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#16877F] bg-teal-50 px-3 py-1 rounded-full border border-teal-200 inline-block">
              Operational Access
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#17324F] tracking-tight">
              Sign in to SETU
            </h1>
            <p className="text-sm text-[#53657B] leading-relaxed">
              Access your workspace to coordinate relief resources and respond to assigned emergency needs.
            </p>
          </div>

          {/* Hackathon Demo Access Notice */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-amber-900">
            <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong>Built with Bharat 4.0 Demo Access:</strong> Select your role below for instant workspace entry without production credentials.
            </div>
          </div>

          <form onSubmit={handleDemoSignIn} className="space-y-6">
            {/* Role Selection Tabs */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#17324F] uppercase tracking-wider block">
                Select Your Role &amp; Workspace
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedRole('coordinator')}
                  className={`p-3 rounded-xl border text-center transition flex flex-col items-center gap-1.5 cursor-pointer ${
                    selectedRole === 'coordinator'
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-white text-[#53657B] border-[#D7E0EA] hover:bg-slate-50'
                  }`}
                >
                  <ShieldAlert className="w-5 h-5" />
                  <span className="text-xs font-bold">Coordinator</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedRole('ngo')}
                  className={`p-3 rounded-xl border text-center transition flex flex-col items-center gap-1.5 cursor-pointer ${
                    selectedRole === 'ngo'
                      ? 'bg-[#17324F] text-white border-[#17324F] shadow-xs'
                      : 'bg-white text-[#53657B] border-[#D7E0EA] hover:bg-slate-50'
                  }`}
                >
                  <Building2 className="w-5 h-5 text-teal-400" />
                  <span className="text-xs font-bold">NGO Depot</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedRole('volunteer')}
                  className={`p-3 rounded-xl border text-center transition flex flex-col items-center gap-1.5 cursor-pointer ${
                    selectedRole === 'volunteer'
                      ? 'bg-[#16877F] text-white border-[#16877F] shadow-xs'
                      : 'bg-white text-[#53657B] border-[#D7E0EA] hover:bg-slate-50'
                  }`}
                >
                  <Users className="w-5 h-5" />
                  <span className="text-xs font-bold">Volunteer</span>
                </button>
              </div>
            </div>

            {/* Target Workspace Info */}
            <div className="bg-[#EEF3F8] rounded-xl p-3.5 border border-[#D7E0EA] text-xs text-[#53657B] flex items-center justify-between">
              <div>
                <span className="font-semibold block text-[#17324F]">Target Workspace:</span>
                <span>
                  {selectedRole === 'coordinator' && 'Coordinator Emergency Incident Management (/dashboard)'}
                  {selectedRole === 'ngo' && 'NGO Resource & Dispatch Workspace (/ngo-dashboard)'}
                  {selectedRole === 'volunteer' && 'Volunteer Response Workspace (/volunteer-dashboard)'}
                </span>
              </div>
              <Info className="w-4 h-4 text-[#16877F] shrink-0" />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full min-h-[48px] px-6 py-3 bg-[#16877F] hover:bg-teal-800 text-white font-bold text-sm sm:text-base rounded-xl shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Access {selectedRole.toUpperCase()} Workspace</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Links back to public site */}
          <div className="pt-4 border-t border-[#D7E0EA] text-center text-xs text-[#53657B]">
            <Link to="/" className="text-[#16877F] font-bold hover:underline">
              ← Return to SETU Public Landing Page
            </Link>
          </div>

        </div>
      </main>

      {/* 3. Unified Dark Navy Footer */}
      <footer className="bg-[#17324F] border-t border-slate-800 py-6 text-xs text-slate-300 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <SetuLogo variant="dark" iconSize={24} showTagline={false} />
            <span>SETU Disaster Response System • Built with Bharat 4.0</span>
          </div>
          <div className="flex items-center gap-4 font-semibold text-teal-300">
            <Link to="/ngo-dashboard" className="hover:underline hover:text-white">NGO Depot</Link>
            <Link to="/volunteer-dashboard" className="hover:underline hover:text-white">Volunteer Hub</Link>
            <Link to="/dashboard" className="hover:underline hover:text-white">Coordinator Panel</Link>
            <Link to="/" className="hover:underline hover:text-white">Public Homepage</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
