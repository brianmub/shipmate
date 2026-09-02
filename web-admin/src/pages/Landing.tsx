import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import logoImg from '../assets/shipmate-logo.png';
import { supabase } from '../utils/supabase';
import { 
  Smartphone, 
  CheckCircle2, 
  Zap, 
  ShieldCheck, 
  MapPin, 
  Users, 
  ArrowRight, 
  Mail, 
  ChevronRight,
  Package,
  Award, 
  DollarSign,
  Bike,
  Car,
  Truck,
  Phone,
  X,
  AlertCircle,
  Download,
  MessageSquare,
  FileCheck
} from 'lucide-react';

const DRIVER_APK_DOWNLOAD_URL = "https://expo.dev/artifacts/eas/H65KbFcBGcyQvb8r_psjVp_hhU9V7iEOZJtPOOcQN9o.apk";

export const Landing = () => {
  // Customer Early Access / Waitlist state
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Courier Application Modal state
  const [isCourierModalOpen, setIsCourierModalOpen] = useState(false);
  const [courierForm, setCourierForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    city: 'Harare',
    vehicleType: 'motorcycle',
    hasLicense: true,
    experienceYears: '1-3 years',
    notes: ''
  });
  const [courierSubmitting, setCourierSubmitting] = useState(false);
  const [courierSubmitted, setCourierSubmitted] = useState(false);
  const [courierError, setCourierError] = useState('');

  // SEO Optimization
  useEffect(() => {
    document.title = "ShipMate | Your Mate for Parcels & Errands";
    
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', 'Fast, safe delivery — from parcels to packages, errands to shopping. Send parcels or earn as a delivery driver with ShipMate.');

    const ogTags = [
      { property: 'og:title', content: 'ShipMate | Your Mate for Parcels & Errands' },
      { property: 'og:description', content: 'Fast, safe delivery — from parcels to packages, errands to shopping.' },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: window.location.origin },
      { property: 'og:image', content: `${window.location.origin}/logo.png` }
    ];

    ogTags.forEach(tag => {
      let el = document.querySelector(`meta[property="${tag.property}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('property', tag.property);
        document.head.appendChild(el);
      }
      el.setAttribute('content', tag.content);
    });
  }, []);

  // Customer Waitlist Submission
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setError('');

    try {
      const endpoint = import.meta.env.VITE_EMAIL_CAPTURE_URL || 'https://formspree.io/f/placeholder_shipmate';
      if (endpoint.includes('placeholder_shipmate')) {
        await new Promise(resolve => setTimeout(resolve, 800));
      } else {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, source: 'shipmate_customer_waitlist' })
        });
        if (!response.ok) throw new Error('Form submission failed');
      }

      setSubmitted(true);
      setEmail('');
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Courier Application Submission (Saves to Supabase & triggers connected flow)
  const handleCourierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courierForm.fullName || !courierForm.phone || !courierForm.email) {
      setCourierError('Please fill in your full name, email, and mobile phone number.');
      return;
    }

    setCourierSubmitting(true);
    setCourierError('');

    try {
      const { error: insertError } = await supabase
        .from('courier_applications')
        .insert([{
          full_name: courierForm.fullName.trim(),
          email: courierForm.email.trim().toLowerCase(),
          phone: courierForm.phone.trim(),
          city: courierForm.city,
          vehicle_type: courierForm.vehicleType,
          has_license: courierForm.hasLicense,
          experience_years: courierForm.experienceYears,
          notes: courierForm.notes.trim() || null,
          status: 'pending'
        }]);

      if (insertError) throw insertError;
      setCourierSubmitted(true);
    } catch (err: any) {
      console.error('Error submitting application:', err);
      setCourierError(err.message || 'Unable to submit application. Please check your connection.');
    } finally {
      setCourierSubmitting(false);
    }
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const resetCourierModal = () => {
    setIsCourierModalOpen(false);
    setCourierSubmitted(false);
    setCourierError('');
    setCourierForm({
      fullName: '',
      email: '',
      phone: '',
      city: 'Harare',
      vehicleType: 'motorcycle',
      hasLicense: true,
      experienceYears: '1-3 years',
      notes: ''
    });
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA] text-[#0B1F4D] font-sans antialiased selection:bg-[#2D5FE0]/25">
      
      {/* 1. HEADER */}
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-md border-b border-[#0B1F4D]/5 px-4 sm:px-8 py-4 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <img src={logoImg} alt="ShipMate Logo" className="h-10 sm:h-12 w-auto object-contain" />
        </div>

        {/* Navigation */}
        <nav className="hidden md:flex items-center gap-8">
          <button onClick={() => scrollToSection('how-it-works')} className="text-sm font-semibold text-[#0B1F4D]/80 hover:text-[#2D5FE0] transition-colors cursor-pointer">
            How It Works
          </button>
          <button onClick={() => scrollToSection('couriers')} className="text-sm font-semibold text-[#0B1F4D]/80 hover:text-[#2D5FE0] transition-colors cursor-pointer">
            Deliver & Earn (Couriers)
          </button>
          <button onClick={() => scrollToSection('customers')} className="text-sm font-semibold text-[#0B1F4D]/80 hover:text-[#2D5FE0] transition-colors cursor-pointer">
            Send Parcels (Customers)
          </button>
          <button onClick={() => scrollToSection('download')} className="text-sm font-semibold text-[#0B1F4D]/80 hover:text-[#2D5FE0] transition-colors cursor-pointer">
            Contact
          </button>
        </nav>

        {/* Action Button */}
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsCourierModalOpen(true)}
            className="hidden sm:inline-flex bg-slate-100 hover:bg-slate-200 text-[#0B1F4D] font-bold text-xs px-4 py-2.5 rounded-full transition-colors cursor-pointer border border-slate-200"
          >
            Driver Signup
          </button>
          <button 
            onClick={() => scrollToSection('download')}
            className="bg-[#2D5FE0] hover:bg-[#2D5FE0]/90 text-white font-bold text-xs sm:text-sm px-5 py-2.5 rounded-full shadow-lg shadow-[#2D5FE0]/15 transition-all hover:-translate-y-0.5 cursor-pointer"
          >
            Send a Parcel
          </button>
        </div>
      </header>

      {/* 2. HERO */}
      <section className="relative pt-12 pb-20 px-4 sm:px-8 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center overflow-hidden">
        <div className="absolute top-1/4 right-0 w-80 h-80 bg-[#2D5FE0]/5 rounded-full blur-3xl -z-10" />

        <div className="lg:col-span-7 text-center lg:text-left space-y-6">
          <div className="inline-flex items-center gap-2 bg-[#2D5FE0]/10 border border-[#2D5FE0]/15 px-4 py-1.5 rounded-full text-[#2D5FE0] text-xs font-bold uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-[#F2A33D] animate-ping" />
            Your Modern Delivery Network
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-[#0B1F4D] tracking-tight leading-tight">
            Your Mate for <br className="hidden sm:inline"/>
            <span className="text-[#2D5FE0]">Parcels & Errands</span>
          </h1>

          <p className="text-lg sm:text-xl text-[#0B1F4D]/80 font-normal leading-relaxed max-w-xl mx-auto lg:mx-0">
            Fast, safe delivery — from packages and documents to store shopping. Send a parcel across town or earn flexible income delivering as a verified driver.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-4">
            <button 
              onClick={() => scrollToSection('download')}
              className="w-full sm:w-auto bg-[#2D5FE0] hover:bg-[#2D5FE0]/90 text-white font-bold px-8 py-4 rounded-2xl shadow-xl shadow-[#2D5FE0]/20 transition-all hover:-translate-y-1 text-center cursor-pointer flex flex-col items-center sm:items-start"
            >
              <span>Send a Parcel</span>
              <span className="text-[11px] font-normal text-white/80">For Customers & Senders</span>
            </button>
            <button 
              onClick={() => setIsCourierModalOpen(true)}
              className="w-full sm:w-auto bg-white hover:bg-[#F5F7FA] text-[#0B1F4D] border-2 border-[#2D5FE0]/30 hover:border-[#2D5FE0] font-bold px-8 py-4 rounded-2xl transition-all hover:-translate-y-1 text-center cursor-pointer flex flex-col items-center sm:items-start shadow-sm"
            >
              <span className="text-[#2D5FE0]">Deliver & Earn</span>
              <span className="text-[11px] font-normal text-slate-500">For Drivers & Couriers</span>
            </button>
          </div>
        </div>

        {/* Hero Visual: Brand Logo */}
        <div className="lg:col-span-5 flex justify-center">
          <div className="relative w-full max-w-sm sm:max-w-md aspect-square flex items-center justify-center">
            <div className="absolute inset-0 bg-gradient-to-tr from-[#2D5FE0]/10 to-[#F2A33D]/10 rounded-[3rem] blur-2xl opacity-60 animate-pulse" />
            
            <div className="relative z-10 w-full bg-white rounded-[2.5rem] p-6 sm:p-8 shadow-2xl border border-[#0B1F4D]/5 hover:scale-[1.02] transition-transform duration-300">
              <img 
                src={logoImg} 
                alt="ShipMate Logo - Your Mate for Parcels & Errands" 
                className="w-full h-auto object-contain" 
              />
            </div>
          </div>
        </div>
      </section>

      {/* 3. TRUST BADGES STRIP */}
      <section className="bg-white border-y border-[#0B1F4D]/5 py-8 px-4 sm:px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="flex items-center gap-3 justify-center text-center md:text-left">
            <div className="w-10 h-10 rounded-full bg-[#2D5FE0]/10 flex items-center justify-center text-[#2D5FE0]">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div>
              <p className="font-extrabold text-sm text-[#0B1F4D]">⚡ Fast & Reliable</p>
              <p className="text-xs text-[#0B1F4D]/60">Citywide coverage</p>
            </div>
          </div>

          <div className="flex items-center gap-3 justify-center text-center md:text-left">
            <div className="w-10 h-10 rounded-full bg-[#2D5FE0]/10 flex items-center justify-center text-[#2D5FE0]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="font-extrabold text-sm text-[#0B1F4D]">🛡️ Safe & Secure</p>
              <p className="text-xs text-[#0B1F4D]/60">Vetted professional drivers</p>
            </div>
          </div>

          <div className="flex items-center gap-3 justify-center text-center md:text-left">
            <div className="w-10 h-10 rounded-full bg-[#2D5FE0]/10 flex items-center justify-center text-[#2D5FE0]">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <p className="font-extrabold text-sm text-[#0B1F4D]">📍 Real-Time Tracking</p>
              <p className="text-xs text-[#0B1F4D]/60">Watch delivery live on map</p>
            </div>
          </div>

          <div className="flex items-center gap-3 justify-center text-center md:text-left">
            <div className="w-10 h-10 rounded-full bg-[#2D5FE0]/10 flex items-center justify-center text-[#2D5FE0]">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="font-extrabold text-sm text-[#0B1F4D]">👤 Local Couriers</p>
              <p className="text-xs text-[#0B1F4D]/60">100% locally operated</p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. HOW IT WORKS */}
      <section id="how-it-works" className="py-20 px-4 sm:px-8 max-w-7xl mx-auto text-center space-y-12">
        <div className="space-y-4">
          <h2 className="text-3xl font-black tracking-tight text-[#0B1F4D]">How ShipMate Works</h2>
          <p className="text-[#0B1F4D]/70 max-w-xl mx-auto">Get your delivery completed in three simple steps.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Step 1 */}
          <div className="bg-white p-8 rounded-3xl border border-[#0B1F4D]/5 shadow-sm space-y-4 relative">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#2D5FE0] text-white rounded-full flex items-center justify-center font-bold shadow-md">
              1
            </div>
            <div className="pt-4 flex justify-center text-[#2D5FE0]">
              <Smartphone className="w-12 h-12" />
            </div>
            <h3 className="text-xl font-bold text-[#0B1F4D]">Request a Delivery</h3>
            <p className="text-[#0B1F4D]/70 text-sm leading-relaxed">
              Open the app, enter pickup and drop-off addresses, select your delivery vehicle type, and see your transparent pricing instantly.
            </p>
          </div>

          {/* Step 2 */}
          <div className="bg-white p-8 rounded-3xl border border-[#0B1F4D]/5 shadow-sm space-y-4 relative">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#2D5FE0] text-white rounded-full flex items-center justify-center font-bold shadow-md">
              2
            </div>
            <div className="pt-4 flex justify-center text-[#2D5FE0]">
              <MapPin className="w-12 h-12" />
            </div>
            <h3 className="text-xl font-bold text-[#0B1F4D]">Driver Dispatched</h3>
            <p className="text-[#0B1F4D]/70 text-sm leading-relaxed">
              A nearby verified courier accepts your order. Track their live GPS route in real-time as they collect your package.
            </p>
          </div>

          {/* Step 3 */}
          <div className="bg-white p-8 rounded-3xl border border-[#0B1F4D]/5 shadow-sm space-y-4 relative">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#2D5FE0] text-white rounded-full flex items-center justify-center font-bold shadow-md">
              3
            </div>
            <div className="pt-4 flex justify-center text-[#2D5FE0]">
              <CheckCircle2 className="w-12 h-12" />
            </div>
            <h3 className="text-xl font-bold text-[#0B1F4D]">Delivered with Proof</h3>
            <p className="text-[#0B1F4D]/70 text-sm leading-relaxed">
              The recipient signs with secure OTP acknowledgment and photo proof of delivery. Direct, safe, and recorded.
            </p>
          </div>
        </div>
      </section>

      {/* 5. FOR COURIERS & DRIVERS SECTION */}
      <section id="couriers" className="py-20 px-4 sm:px-8 bg-white border-y border-[#0B1F4D]/5">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="order-2 lg:order-1 flex justify-center">
            {/* Courier Earnings Visual Card */}
            <div className="bg-[#0B1F4D] text-white p-8 rounded-[2.5rem] shadow-2xl max-w-sm w-full space-y-6 border border-[#2D5FE0]/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-[#F2A33D]">
                    <Award className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-extrabold text-sm text-white">Courier Partner</p>
                    <p className="text-xs text-white/60">Tinashe M. (Motorcycle)</p>
                  </div>
                </div>
                <span className="bg-emerald-500 text-white font-bold text-[10px] px-2.5 py-1 rounded-full">ACTIVE</span>
              </div>

              <div className="h-px bg-white/10" />

              <div className="space-y-1">
                <p className="text-xs text-white/50 uppercase tracking-wider font-bold">This Week's Earnings</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-[#F2A33D]">$184.50</span>
                  <span className="text-xs text-emerald-400 font-bold">+$24.00 today</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                  <p className="text-[10px] text-white/60 font-semibold uppercase">Deliveries</p>
                  <p className="text-lg font-black text-white">32 Jobs</p>
                </div>
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                  <p className="text-[10px] text-white/60 font-semibold uppercase">Rating</p>
                  <p className="text-lg font-black text-white">4.92 ⭐</p>
                </div>
              </div>

              <div className="bg-[#2D5FE0] p-4 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-white animate-pulse" />
                  <p className="text-xs font-bold text-white">Weekly EcoCash Payout</p>
                </div>
                <ChevronRight className="w-4 h-4 text-white" />
              </div>
            </div>
          </div>

          <div className="order-1 lg:order-2 space-y-6">
            <div className="inline-block bg-[#F2A33D]/10 text-[#F2A33D] text-xs font-bold uppercase tracking-wider px-4 py-1.5 rounded-full">
              FOR DRIVERS & COURIERS
            </div>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-[#0B1F4D]">
              Deliver with ShipMate. <br/>Earn on your own schedule.
            </h2>
            <p className="text-base text-[#0B1F4D]/80 leading-relaxed">
              Have a motorcycle, car, pickup bakkie, or delivery van? Partner with ShipMate to get a steady stream of delivery jobs, flexible hours, and weekly payouts direct to your EcoCash account or driver wallet.
            </p>

            <ul className="space-y-4">
              <li className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-[#F2A33D]/10 flex items-center justify-center text-[#F2A33D] shrink-0 text-sm font-bold">✓</span>
                <span className="font-bold text-sm text-[#0B1F4D]">Flexible earnings — Work whenever you are ready</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-[#F2A33D]/10 flex items-center justify-center text-[#F2A33D] shrink-0 text-sm font-bold">✓</span>
                <span className="font-bold text-sm text-[#0B1F4D]">Weekly payouts straight to your EcoCash or in-app wallet</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-[#F2A33D]/10 flex items-center justify-center text-[#F2A33D] shrink-0 text-sm font-bold">✓</span>
                <span className="font-bold text-sm text-[#0B1F4D]">Low, transparent platform commission rates</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-[#F2A33D]/10 flex items-center justify-center text-[#F2A33D] shrink-0 text-sm font-bold">✓</span>
                <span className="font-bold text-sm text-[#0B1F4D]">Driver companion app with live turn-by-turn GPS</span>
              </li>
            </ul>

            <div className="pt-4 flex flex-col sm:flex-row items-center gap-4">
              <button 
                onClick={() => setIsCourierModalOpen(true)}
                className="w-full sm:w-auto bg-[#F2A33D] hover:bg-[#F2A33D]/90 text-white font-bold px-8 py-4 rounded-2xl shadow-xl shadow-[#F2A33D]/20 transition-all hover:-translate-y-1 text-center cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Apply to Deliver (Courier Signup)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 6. FOR CUSTOMERS / SENDERS WAITLIST */}
      <section id="download" className="py-20 px-4 sm:px-8 max-w-4xl mx-auto text-center space-y-10">
        <div className="space-y-4">
          <div className="inline-block bg-[#2D5FE0]/10 text-[#2D5FE0] text-xs font-bold uppercase tracking-wider px-4 py-1.5 rounded-full">
            FOR SENDERS & BUSINESSES
          </div>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-[#0B1F4D]">Send Anything Across Town with ShipMate</h2>
          <p className="text-base text-[#0B1F4D]/70 max-w-xl mx-auto">
            From urgent business paperwork to online store purchases and personal errands. Join the early access waitlist for special launch delivery discounts.
          </p>
        </div>

        {/* Email Capture Form */}
        <div className="max-w-md mx-auto bg-white border border-[#0B1F4D]/5 p-8 rounded-[2.5rem] shadow-xl">
          {!submitted ? (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div className="text-left space-y-2">
                <label className="text-xs font-extrabold text-[#0B1F4D]/60 uppercase tracking-wider ml-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input 
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-[#F5F7FA] border border-[#0B1F4D]/10 rounded-2xl py-4 pl-12 pr-4 text-[#0B1F4D] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2D5FE0]/50 transition-all text-sm font-semibold"
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="text-xs text-rose-500 font-bold bg-rose-50 border border-rose-100 p-3 rounded-xl">
                  {error}
                </div>
              )}

              <button 
                type="submit"
                disabled={loading}
                className="w-full bg-[#2D5FE0] hover:bg-[#2D5FE0]/90 disabled:bg-[#2D5FE0]/50 text-white font-bold py-4 rounded-2xl shadow-lg shadow-[#2D5FE0]/15 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? 'Submitting...' : 'Get Early Customer Access'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <div className="space-y-4 py-4 text-center">
              <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-[#0B1F4D]">You're on the customer list!</h3>
              <p className="text-sm text-[#0B1F4D]/70 max-w-xs mx-auto">
                Thank you for signing up. We will notify you with early delivery credits as soon as customer slots go live.
              </p>
            </div>
          )}
        </div>

        {/* Play Store Beta Status */}
        <div className="flex flex-col sm:flex-row justify-center items-center gap-4 pt-6 text-sm text-[#0B1F4D]/60 font-semibold">
          <div className="flex items-center gap-2 bg-white/60 px-5 py-3 rounded-2xl border border-[#0B1F4D]/5">
            <span>🤖</span>
            <span>Android: Google Play Closed Beta & Standalone APK</span>
          </div>
          <div className="flex items-center gap-2 bg-white/60 px-5 py-3 rounded-2xl border border-[#0B1F4D]/5">
            <span>🍎</span>
            <span>iOS TestFlight: Starting soon</span>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#0B1F4D] text-white/70 py-16 px-4 sm:px-8 border-t border-white/5">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12">
          <div className="space-y-4">
            <div className="inline-flex bg-white rounded-3xl p-4 shadow-xl border border-white/10 hover:scale-[1.03] transition-transform duration-300">
              <img src={logoImg} alt="ShipMate Logo" className="h-20 w-auto object-contain" />
            </div>
            <p className="text-xs leading-relaxed max-w-xs text-white/50">
              Your Mate for Parcels & Errands. A modern delivery network operating in Zimbabwe.
            </p>
          </div>

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

          <div className="space-y-4">
            <h4 className="text-sm font-black text-white tracking-wider uppercase">Portals</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link to="/admin" className="hover:text-white transition-colors font-bold flex items-center gap-1">
                  <span>Web Admin Portal</span>
                  <ChevronRight className="w-3 h-3 text-[#2D5FE0]" />
                </Link>
              </li>
              <li>
                <button onClick={() => setIsCourierModalOpen(true)} className="hover:text-white transition-colors font-bold flex items-center gap-1 cursor-pointer">
                  <span>Courier Signup Portal</span>
                  <ChevronRight className="w-3 h-3 text-[#F2A33D]" />
                </button>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-black text-white tracking-wider uppercase">Operating Cities</h4>
            <p className="text-xs text-white/50 leading-relaxed">
              Harare • Bulawayo • Chitungwiza • Mutare • Gweru
            </p>
            <div className="pt-2">
              <p className="text-[11px] text-white/40">© {new Date().getFullYear()} ShipMate Zimbabwe. All rights reserved.</p>
            </div>
          </div>
        </div>
      </footer>

      {/* ========================================================================= */}
      {/* 7. INTERACTIVE COURIER APPLICATION & ONBOARDING MODAL */}
      {/* ========================================================================= */}
      {isCourierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B1F4D]/75 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
          <div className="relative w-full max-w-xl bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden my-8">
            
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-[#0B1F4D] to-[#18387A] text-white p-6 sm:p-8 flex items-start justify-between relative">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 bg-[#F2A33D]/20 text-[#F2A33D] px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider">
                  <Award className="w-3 h-3" />
                  <span>Courier Onboarding</span>
                </div>
                <h3 className="text-2xl font-black text-white">Delivery Partner Application</h3>
                <p className="text-xs text-white/70">
                  {courierSubmitted 
                    ? 'Application received! Follow the next step below.' 
                    : 'Join our fleet of verified delivery drivers across Zimbabwe.'}
                </p>
              </div>

              <button 
                onClick={resetCourierModal}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 sm:p-8 max-h-[80vh] overflow-y-auto">
              {!courierSubmitted ? (
                /* STAGE 1: APPLICATION FORM */
                <form onSubmit={handleCourierSubmit} className="space-y-6">
                  {courierError && (
                    <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 text-xs font-bold flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{courierError}</span>
                    </div>
                  )}

                  {/* Personal Contact */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-extrabold text-[#0B1F4D]/70 uppercase tracking-wider">Full Name *</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Tinashe Moyo"
                        value={courierForm.fullName}
                        onChange={(e) => setCourierForm({ ...courierForm, fullName: e.target.value })}
                        required
                        className="w-full bg-[#F5F7FA] border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold text-[#0B1F4D] focus:outline-none focus:ring-2 focus:ring-[#2D5FE0]/40"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-extrabold text-[#0B1F4D]/70 uppercase tracking-wider">Mobile / WhatsApp *</label>
                      <input 
                        type="tel" 
                        placeholder="e.g. 077 123 4567"
                        value={courierForm.phone}
                        onChange={(e) => setCourierForm({ ...courierForm, phone: e.target.value })}
                        required
                        className="w-full bg-[#F5F7FA] border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold text-[#0B1F4D] focus:outline-none focus:ring-2 focus:ring-[#2D5FE0]/40"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-extrabold text-[#0B1F4D]/70 uppercase tracking-wider">Email Address *</label>
                      <input 
                        type="email" 
                        placeholder="name@example.com"
                        value={courierForm.email}
                        onChange={(e) => setCourierForm({ ...courierForm, email: e.target.value })}
                        required
                        className="w-full bg-[#F5F7FA] border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold text-[#0B1F4D] focus:outline-none focus:ring-2 focus:ring-[#2D5FE0]/40"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-extrabold text-[#0B1F4D]/70 uppercase tracking-wider">Primary City *</label>
                      <select 
                        value={courierForm.city}
                        onChange={(e) => setCourierForm({ ...courierForm, city: e.target.value })}
                        className="w-full bg-[#F5F7FA] border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold text-[#0B1F4D] focus:outline-none focus:ring-2 focus:ring-[#2D5FE0]/40"
                      >
                        <option value="Harare">Harare</option>
                        <option value="Bulawayo">Bulawayo</option>
                        <option value="Chitungwiza">Chitungwiza</option>
                        <option value="Mutare">Mutare</option>
                        <option value="Gweru">Gweru</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>

                  {/* Vehicle Type Cards */}
                  <div className="space-y-2">
                    <label className="text-xs font-extrabold text-[#0B1F4D]/70 uppercase tracking-wider">
                      What delivery vehicle do you have? *
                    </label>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
                      {[
                        { id: 'motorcycle', label: 'Motorbike', icon: '🏍️' },
                        { id: 'sedan', label: 'Car / Sedan', icon: '🚗' },
                        { id: 'bakkie', label: 'Bakkie / Truck', icon: '🛻' },
                        { id: 'van', label: 'Delivery Van', icon: '🚐' },
                        { id: 'bicycle', label: 'Bicycle / Foot', icon: '🚴' },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setCourierForm({ ...courierForm, vehicleType: item.id })}
                          className={`p-3 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                            courierForm.vehicleType === item.id
                              ? 'bg-[#2D5FE0]/10 border-[#2D5FE0] text-[#2D5FE0] shadow-sm font-bold'
                              : 'bg-[#F5F7FA] border-slate-200 text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          <span className="text-2xl">{item.icon}</span>
                          <span className="text-[11px] leading-tight">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* License & Experience */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div className="flex items-center justify-between p-3.5 bg-[#F5F7FA] rounded-2xl border border-slate-200">
                      <div>
                        <p className="text-xs font-bold text-[#0B1F4D]">Valid Driver's License?</p>
                        <p className="text-[11px] text-slate-500">Do you hold a current license?</p>
                      </div>
                      <input 
                        type="checkbox"
                        checked={courierForm.hasLicense}
                        onChange={(e) => setCourierForm({ ...courierForm, hasLicense: e.target.checked })}
                        className="w-5 h-5 accent-[#2D5FE0] cursor-pointer rounded"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-extrabold text-[#0B1F4D]/70 uppercase tracking-wider">Experience</label>
                      <select 
                        value={courierForm.experienceYears}
                        onChange={(e) => setCourierForm({ ...courierForm, experienceYears: e.target.value })}
                        className="w-full bg-[#F5F7FA] border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold text-[#0B1F4D] focus:outline-none focus:ring-2 focus:ring-[#2D5FE0]/40"
                      >
                        <option value="New driver (<1 yr)">New driver (&lt;1 year)</option>
                        <option value="1-3 years">1-3 years experience</option>
                        <option value="3+ years">3+ years professional</option>
                      </select>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={courierSubmitting}
                    className="w-full bg-[#2D5FE0] hover:bg-[#2D5FE0]/90 disabled:bg-[#2D5FE0]/50 text-white font-bold py-4 rounded-2xl shadow-xl shadow-[#2D5FE0]/20 transition-all flex items-center justify-center gap-2 cursor-pointer text-base"
                  >
                    {courierSubmitting ? 'Submitting Application...' : 'Submit Courier Application'}
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </form>
              ) : (
                /* STAGE 2: CONNECTED HANDOFF & APP DOWNLOAD SCREEN */
                <div className="space-y-6 py-2">
                  <div className="text-center space-y-2">
                    <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <h4 className="text-2xl font-black text-[#0B1F4D]">
                      Application Received, {courierForm.fullName}! 🎉
                    </h4>
                    <p className="text-sm text-slate-600 max-w-md mx-auto">
                      Your profile has been queued for <strong className="text-[#0B1F4D]">{courierForm.city}</strong> dispatch with your <strong className="text-[#0B1F4D]">{courierForm.vehicleType}</strong>.
                    </p>
                  </div>

                  {/* STEP-BY-STEP HANDOFF GUIDE */}
                  <div className="bg-[#F5F7FA] p-5 rounded-3xl border border-slate-200 space-y-4">
                    <p className="text-xs font-black uppercase tracking-wider text-[#0B1F4D]/70 flex items-center gap-2">
                      <FileCheck className="w-4 h-4 text-[#2D5FE0]" />
                      <span>Next Steps to Start Delivering</span>
                    </p>

                    <div className="space-y-3 text-xs text-slate-700">
                      <div className="flex items-start gap-3 bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
                        <span className="w-6 h-6 rounded-full bg-[#2D5FE0] text-white flex items-center justify-center font-bold text-xs shrink-0">1</span>
                        <div>
                          <p className="font-bold text-[#0B1F4D] text-sm">Download the ShipMate Driver App</p>
                          <p className="text-slate-500">Install the app directly on your Android phone using the download button below.</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3 bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
                        <span className="w-6 h-6 rounded-full bg-[#2D5FE0] text-white flex items-center justify-center font-bold text-xs shrink-0">2</span>
                        <div>
                          <p className="font-bold text-[#0B1F4D] text-sm">Log in with your Email</p>
                          <p className="text-slate-500">Sign in with <strong className="text-[#0B1F4D]">{courierForm.email}</strong> to begin in-app onboarding.</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3 bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
                        <span className="w-6 h-6 rounded-full bg-[#2D5FE0] text-white flex items-center justify-center font-bold text-xs shrink-0">3</span>
                        <div>
                          <p className="font-bold text-[#0B1F4D] text-sm">Complete 4-Sided Vehicle Photos</p>
                          <p className="text-slate-500">Snap quick photos of your vehicle in the app to fast-track administrative activation.</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ACTION BUTTONS */}
                  <div className="space-y-3">
                    <a 
                      href={DRIVER_APK_DOWNLOAD_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer text-base"
                    >
                      <Download className="w-5 h-5" />
                      <span>Download Mate Driver App (APK)</span>
                    </a>

                    <a 
                      href={`https://wa.me/263771000000?text=Hello%20ShipMate%20Team%2C%20I%20just%20applied%20to%20deliver%20in%20${encodeURIComponent(courierForm.city)}%20with%20a%20${encodeURIComponent(courierForm.vehicleType)}.%20My%20name%20is%20${encodeURIComponent(courierForm.fullName)}.`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#128C7E] font-bold py-3.5 rounded-2xl border border-[#25D366]/30 transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>Chat with Dispatch on WhatsApp</span>
                    </a>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
