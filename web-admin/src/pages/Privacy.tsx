import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import logoImg from '../assets/shipmate-logo.png';
import { ShieldCheck, ArrowLeft, Mail } from 'lucide-react';

export const Privacy = () => {
  // SEO Optimization
  useEffect(() => {
    document.title = "Privacy Policy | Shipmate Delivery Services";
    window.scrollTo(0, 0);

    // Meta Description
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', 'Privacy Policy for the Shipmate delivery platform. Understand how we secure location, identity verification documents, and delivery data.');
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

      {/* 2. PRIVACY CONTENT */}
      <main className="max-w-4xl mx-auto px-4 sm:px-8 py-16">
        <div className="bg-white rounded-[2.5rem] p-8 sm:p-12 shadow-xl border border-[#0B1F4D]/5 space-y-8">
          
          {/* Header Title */}
          <div className="border-b border-[#0B1F4D]/10 pb-6">
            <h1 className="text-3xl sm:text-4xl font-black text-[#0B1F4D] tracking-tight">Privacy Policy</h1>
            <p className="text-sm font-semibold text-slate-400 mt-2">Last Updated: June 15, 2026</p>
          </div>

          <p className="text-slate-650 leading-relaxed">
            At <strong>Shipmate</strong>, we value your privacy and are committed to protecting your personal data. This Privacy Policy describes how Shipmate collects, uses, processes, and shares your information when you use our mobile applications (Customer App and Driver App) and our web administration panel.
          </p>

          {/* Highlight Notice */}
          <div className="bg-[#F2A33D]/10 border-l-4 border-[#F2A33D] p-5 rounded-r-2xl space-y-2">
            <h4 className="font-extrabold text-sm text-[#0B1F4D] flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#F2A33D]" />
              Important Notice for Device Permissions:
            </h4>
            <p className="text-xs text-slate-700 leading-relaxed font-semibold">
              Shipmate requires access to device location services (including background location for couriers/drivers) and camera features to perform core courier match-making, real-time tracking, and identity verification tasks.
            </p>
          </div>

          {/* Policy Sections */}
          <div className="space-y-8 pt-4">
            
            <section className="space-y-3">
              <h2 className="text-xl font-bold text-[#0B1F4D] border-b border-[#0B1F4D]/5 pb-2">1. Information We Collect</h2>
              
              <div className="space-y-4">
                <div>
                  <h3 className="font-extrabold text-sm text-[#2D5FE0]">a. Information You Provide Directly</h3>
                  <ul className="list-disc pl-5 mt-2 space-y-1.5 text-xs text-slate-600 font-semibold">
                    <li><strong>Account Registration Details:</strong> When you register as a Customer or Driver, we collect your name, email address, password, emergency contact details, and phone number.</li>
                    <li><strong>Driver Verification Documents:</strong> For drivers, we collect sensitive identity verification details including Date of Birth, National Identity Card photos (front and back), Driver’s License photos (front and back), vehicle make, model, year, and registration numbers.</li>
                    <li><strong>Proof of Delivery:</strong> We collect signatures and delivery verification photos upon completion of courier runs to ensure package security.</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-extrabold text-sm text-[#2D5FE0]">b. Information Collected Automatically</h3>
                  <ul className="list-disc pl-5 mt-2 space-y-1.5 text-xs text-slate-600 font-semibold">
                    <li><strong>Location Data (Drivers & Couriers):</strong> We collect precise GPS coordinates in the foreground and background to calculate trip prices, display distance to package pickups, suggest relevant bids, and provide real-time order tracking to customers. Background location tracking is only active when a driver is online or fulfilling a delivery.</li>
                    <li><strong>Location Data (Customers):</strong> We collect location data when setting up pickup, dropoff, or errand coordinates on our interactive map.</li>
                    <li><strong>Camera Access:</strong> We request camera access to allow document scanning during driver onboarding, package photos scanning (for package size estimation), daily facial identity verification checks, and capturing delivery verification photos.</li>
                  </ul>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-[#0B1F4D] border-b border-[#0B1F4D]/5 pb-2">2. How We Use Your Information</h2>
              <p className="text-xs text-slate-600 font-semibold leading-relaxed">
                We use the collected information for the following core purposes:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-600 font-semibold">
                <li>To connect customers with local drivers and coordinate package deliveries or errands.</li>
                <li>To calculate routing paths, distances, ETAs, and trip pricing.</li>
                <li>To verify driver eligibility, vehicle compliance, and protect our community from fraud.</li>
                <li>To process platform commission rates, calculate wallet balances, and issue withdrawal payouts.</li>
                <li>To send transactional push notifications regarding order status updates.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-[#0B1F4D] border-b border-[#0B1F4D]/5 pb-2">3. Location and Data Sharing</h2>
              <p className="text-xs text-slate-600 font-semibold leading-relaxed">
                Your trust is critical to us. We share information only as required to run our services:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-600 font-semibold">
                <li><strong>Customer-Driver Sharing:</strong> Drivers assigned to your delivery will see your pickup/dropoff coordinates, package details, and contact phone number. Customers will see their assigned driver's real-time map location, name, and vehicle details.</li>
                <li><strong>Legal Requirements:</strong> We may share data if required by law or in response to valid legal requests by public authorities.</li>
                <li>We <strong>do not sell</strong> your personal data or location histories to third-party advertisers or marketers.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-[#0B1F4D] border-b border-[#0B1F4D]/5 pb-2">4. Data Security and Retention</h2>
              <p className="text-xs text-slate-600 font-semibold leading-relaxed">
                All personal details, photos, and signatures are securely transferred using HTTPS and stored in encrypted Supabase database instances and secure cloud storage buckets. We retain your information as long as your account remains active or as required by regulatory compliance rules.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-[#0B1F4D] border-b border-[#0B1F4D]/5 pb-2">5. Your Rights and Controls</h2>
              <p className="text-xs text-slate-600 font-semibold leading-relaxed">
                You can manage data access in the following ways:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-600 font-semibold">
                <li><strong>Device Permissions:</strong> You can grant or revoke location access and camera permissions in your mobile device's settings menu at any time.</li>
                <li><strong>Account Deletion:</strong> You can request the deletion of your account and personal data by contacting us directly at support@shipmate.co.zw.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-[#0B1F4D] border-b border-[#0B1F4D]/5 pb-2">6. Contact Us</h2>
              <p className="text-xs text-slate-600 font-semibold leading-relaxed">
                If you have any questions or concerns about this Privacy Policy, please reach out to us:
              </p>
              <p className="text-xs font-bold text-[#0B1F4D]">
                Email: <a href="mailto:support@shipmate.co.zw" className="text-[#2D5FE0] hover:underline">support@shipmate.co.zw</a>
              </p>
            </section>
            
          </div>

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
