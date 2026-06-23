import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import logoImg from '../assets/shipmate-logo.png';
import { Smartphone, Mail, CheckCircle2, ArrowLeft, Trash2 } from 'lucide-react';

export const DeleteAccount = () => {
  // SEO Optimization
  useEffect(() => {
    document.title = "Account & Data Deletion | Shipmate Delivery Services";
    window.scrollTo(0, 0);

    // Meta Description
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', 'Request account and data deletion for your Shipmate Customer or Driver profile. Read about our deletion options and data retention policies.');
  }, []);

  return (
    <div className="min-h-screen bg-[#F5F7FA] text-[#0B1F4D] font-sans antialiased selection:bg-[#2D5FE0]/25">
      
      {/* 1. HEADER */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-[#0B1F4D]/5 px-4 sm:px-8 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 cursor-pointer">
          <img src={logoImg} alt="Shipmate Logo" className="h-10 sm:h-12 w-auto object-contain" />
        </Link>
        <div>
          <Link 
            to="/"
            className="flex items-center gap-2 bg-[#2D5FE0]/10 hover:bg-[#2D5FE0]/15 text-[#2D5FE0] font-bold text-xs sm:text-sm px-5 py-2.5 rounded-full transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Home</span>
          </Link>
        </div>
      </header>

      {/* 2. DELETION CONTENT */}
      <main className="max-w-4xl mx-auto px-4 sm:px-8 py-16">
        <div className="bg-white rounded-[2.5rem] p-8 sm:p-12 shadow-xl border border-[#0B1F4D]/5 space-y-8">
          
          {/* Header Title */}
          <div className="border-b border-[#0B1F4D]/10 pb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-black text-[#0B1F4D] tracking-tight">Account & Data Deletion</h1>
              <p className="text-sm font-semibold text-slate-400 mt-2">Manage your personal profile and data storage</p>
            </div>
            <div className="bg-rose-50 border border-rose-100 p-3 rounded-2xl text-rose-500 shrink-0 self-start sm:self-center">
              <Trash2 className="w-8 h-8" />
            </div>
          </div>

          <p className="text-slate-650 leading-relaxed font-medium">
            At <strong>Shipmate</strong>, we value your privacy and give you full control over your data. If you wish to delete your account and all associated personal information, you can choose one of the options below.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
            
            {/* Option 1: App */}
            <div className="bg-[#F5F7FA] border border-[#0B1F4D]/5 p-8 rounded-3xl space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-[#2D5FE0]/10 flex items-center justify-center text-[#2D5FE0]">
                <Smartphone className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-[#0B1F4D]">Option 1: Delete via the App</h3>
              <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                You can instantly delete your account and wipe your data directly inside the mobile app (Recommended):
              </p>
              <ol className="list-decimal pl-5 space-y-1.5 text-xs text-slate-600 font-bold">
                <li>Open the ShipMate App and log in.</li>
                <li>Go to the <strong>Settings</strong> or <strong>Profile</strong> tab.</li>
                <li>Scroll down and tap <strong>Delete Account</strong>.</li>
                <li>Confirm your choice. Your account profile and personal data will be deleted immediately.</li>
              </ol>
            </div>

            {/* Option 2: Email */}
            <div className="bg-[#F5F7FA] border border-[#0B1F4D]/5 p-8 rounded-3xl space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-[#F2A33D]/10 flex items-center justify-center text-[#F2A33D]">
                <Mail className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-[#0B1F4D]">Option 2: Deletion via Email</h3>
              <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                If you no longer have the app installed or cannot log in, you can request data deletion by contacting our support team:
              </p>
              <div className="bg-white border border-[#0B1F4D]/10 p-4 rounded-xl space-y-2 text-xs">
                <p className="font-bold text-[#0B1F4D]">
                  Email: <a href="mailto:support@shipmate.co.zw" className="text-[#2D5FE0] hover:underline">support@shipmate.co.zw</a>
                </p>
                <p className="text-slate-500 font-semibold"><span className="font-extrabold text-[#0B1F4D]">Subject:</span> Account Deletion Request</p>
                <p className="text-slate-500 font-semibold"><span className="font-extrabold text-[#0B1F4D]">Body:</span> Please include the phone number or email address associated with your account so we can verify and process your request.</p>
              </div>
              <p className="text-[10px] text-slate-400 font-semibold">
                * Note: Email requests are processed manually within 7 business days after verifying your identity.
              </p>
            </div>

          </div>

          {/* Retention details */}
          <section className="space-y-4 pt-6 border-t border-[#0B1F4D]/10">
            <h2 className="text-xl font-bold text-[#0B1F4D]">What happens when your account is deleted?</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-extrabold text-sm text-[#0B1F4D]">Profile Erased</h4>
                  <p className="text-[11px] text-slate-500 font-semibold mt-1">Your name, phone number, profile photo, and email address are permanently purged from our database.</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-extrabold text-sm text-[#0B1F4D]">Sessions Cleared</h4>
                  <p className="text-[11px] text-slate-500 font-semibold mt-1">Active authorization tokens and database sessions are instantly revoked across all devices.</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-extrabold text-sm text-[#0B1F4D]">History Anonymized</h4>
                  <p className="text-[11px] text-slate-500 font-semibold mt-1">Order and delivery history are completely anonymized for legal audit compliance and can never be linked back to you.</p>
                </div>
              </div>
            </div>
          </section>

        </div>
      </main>

      {/* 3. FOOTER */}
      <footer className="bg-[#0B1F4D] text-white/70 py-16 px-4 sm:px-8 border-t border-white/5">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12">
          {/* Brand Info */}
          <div className="space-y-4">
            <div className="inline-flex bg-white rounded-3xl p-4 shadow-xl border border-white/10">
              <img src={logoImg} alt="Shipmate Logo" className="h-20 w-auto object-contain" />
            </div>
            <p className="text-xs leading-relaxed max-w-xs text-white/50">
              Your Mate for Parcels & Errands. A modern delivery network operating in Zimbabwe.
            </p>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <h4 className="text-sm font-black text-white tracking-wider uppercase">Legal & Help</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link to="/privacy" className="hover:text-white transition-colors font-bold">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/delete-account" className="hover:text-white transition-colors font-bold text-rose-400">
                  Delete Account
                </Link>
              </li>
              <li>
                <span className="text-white/40">Terms of Service</span>
              </li>
            </ul>
          </div>

          {/* Portals */}
          <div className="space-y-4">
            <h4 className="text-sm font-black text-white tracking-wider uppercase">Portals</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <a href="/admin/login" className="hover:text-white transition-colors font-bold text-brand-orange flex items-center gap-1.5">
                  <span>🔒</span> Admin Portal
                </a>
              </li>
            </ul>
          </div>

          {/* Contact Details */}
          <div className="space-y-4">
            <h4 className="text-sm font-black text-white tracking-wider uppercase">Contact Us</h4>
            <p className="text-xs text-white/60 leading-relaxed">
              Have questions or feedback? Email us at: <br/>
              <a href="mailto:support@shipmate.co.zw" className="text-white hover:text-[#F2A33D] font-bold transition-colors">
                support@shipmate.co.zw
              </a>
            </p>
            <div className="text-xs text-white/60 space-y-1.5 pt-2 border-t border-white/5">
              <p className="font-bold text-white uppercase text-[9px] tracking-wider opacity-60">Phone Support</p>
              <p className="flex items-center gap-1.5">
                <span>📞</span>
                <a href="tel:+263773257425" className="hover:text-white transition-colors font-semibold">+263 773 257 425</a>
              </p>
              <p className="flex items-center gap-1.5">
                <span>📞</span>
                <a href="tel:+263719257425" className="hover:text-white transition-colors font-semibold">+263 719 257 425</a>
              </p>
              <p className="flex items-center gap-1.5">
                <span>📞</span>
                <a href="tel:+263719671642" className="hover:text-white transition-colors font-semibold">+263 719 671 642</a>
              </p>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto h-px bg-white/5 my-10" />

        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-white/40">
          <p>© {new Date().getFullYear()} Shipmate. All rights reserved.</p>
          <div className="flex gap-4">
            <span>Made with ♥ in Zimbabwe</span>
          </div>
        </div>
      </footer>

    </div>
  );
};
