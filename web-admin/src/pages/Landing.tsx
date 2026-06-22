import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import logoImg from '../assets/shipmate-logo.png';
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
  DollarSign
} from 'lucide-react';

export const Landing = () => {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // SEO Optimization
  useEffect(() => {
    document.title = "Shipmate | Your Mate for Parcels & Errands";
    
    // Meta Description
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', 'Fast, safe delivery — from parcels to packages, errands to shopping. Your trusted mate for reliable delivery services.');

    // Open Graph Tags
    const ogTags = [
      { property: 'og:title', content: 'Shipmate | Your Mate for Parcels & Errands' },
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

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setError('');

    try {
      // Formspree-style or custom endpoint post
      const endpoint = import.meta.env.VITE_EMAIL_CAPTURE_URL || 'https://formspree.io/f/placeholder_shipmate';
      
      // If it's a placeholder, we simulate success for premium UX
      if (endpoint.includes('placeholder_shipmate')) {
        await new Promise(resolve => setTimeout(resolve, 800));
      } else {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, source: 'shipmate_landing_beta' })
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

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA] text-[#0B1F4D] font-sans antialiased selection:bg-[#2D5FE0]/25">
      
      {/* 1. HEADER */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-[#0B1F4D]/5 px-4 sm:px-8 py-4 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <img src={logoImg} alt="Shipmate Logo" className="h-10 sm:h-12 w-auto object-contain" />
        </div>

        {/* Navigation */}
        <nav className="hidden md:flex items-center gap-8">
          <button onClick={() => scrollToSection('how-it-works')} className="text-sm font-semibold text-[#0B1F4D]/80 hover:text-[#2D5FE0] transition-colors cursor-pointer">
            How It Works
          </button>
          <button onClick={() => scrollToSection('couriers')} className="text-sm font-semibold text-[#0B1F4D]/80 hover:text-[#2D5FE0] transition-colors cursor-pointer">
            For Couriers
          </button>
          <button onClick={() => scrollToSection('customers')} className="text-sm font-semibold text-[#0B1F4D]/80 hover:text-[#2D5FE0] transition-colors cursor-pointer">
            For Customers
          </button>
          <button onClick={() => scrollToSection('download')} className="text-sm font-semibold text-[#0B1F4D]/80 hover:text-[#2D5FE0] transition-colors cursor-pointer">
            Contact
          </button>
        </nav>

        {/* Action Button */}
        <div>
          <button 
            onClick={() => scrollToSection('download')}
            className="bg-[#2D5FE0] hover:bg-[#2D5FE0]/90 text-white font-bold text-xs sm:text-sm px-5 py-2.5 rounded-full shadow-lg shadow-[#2D5FE0]/15 transition-all hover:-translate-y-0.5 cursor-pointer"
          >
            Get App
          </button>
        </div>
      </header>

      {/* 2. HERO */}
      <section className="relative pt-12 pb-20 px-4 sm:px-8 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center overflow-hidden">
        {/* Decorative background shape */}
        <div className="absolute top-1/4 right-0 w-80 h-80 bg-[#2D5FE0]/5 rounded-full blur-3xl -z-10" />

        <div className="lg:col-span-7 text-center lg:text-left space-y-6">
          <div className="inline-flex items-center gap-2 bg-[#2D5FE0]/10 border border-[#2D5FE0]/15 px-4 py-1.5 rounded-full text-[#2D5FE0] text-xs font-bold uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-[#F2A33D] animate-ping" />
            Your Modern Delivery Mate
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-[#0B1F4D] tracking-tight leading-tight">
            Your Mate for <br className="hidden sm:inline"/>
            <span className="text-[#2D5FE0]">Parcels & Errands</span>
          </h1>

          <p className="text-lg sm:text-xl text-[#0B1F4D]/80 font-normal leading-relaxed max-w-xl mx-auto lg:mx-0">
            Fast, safe delivery — from parcels to packages, errands to shopping.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-4">
            <button 
              onClick={() => scrollToSection('download')}
              className="w-full sm:w-auto bg-[#2D5FE0] hover:bg-[#2D5FE0]/90 text-white font-bold px-8 py-4 rounded-2xl shadow-xl shadow-[#2D5FE0]/20 transition-all hover:-translate-y-1 text-center cursor-pointer"
            >
              Download for Customers
            </button>
            <button 
              onClick={() => scrollToSection('couriers')}
              className="w-full sm:w-auto bg-white hover:bg-[#F5F7FA] text-[#2D5FE0] border-2 border-[#2D5FE0] font-bold px-8 py-4 rounded-2xl transition-all hover:-translate-y-1 text-center cursor-pointer"
            >
              Become a Courier
            </button>
          </div>
        </div>

        {/* Hero Visual: Brand Logo */}
        <div className="lg:col-span-5 flex justify-center">
          <div className="relative w-full max-w-sm sm:max-w-md aspect-square flex items-center justify-center">
            {/* Soft pulsing background glow */}
            <div className="absolute inset-0 bg-gradient-to-tr from-[#2D5FE0]/10 to-[#F2A33D]/10 rounded-[3rem] blur-2xl opacity-60 animate-pulse" />
            
            {/* White frame holding the official high-res logo */}
            <div className="relative z-10 w-full bg-white rounded-[2.5rem] p-6 sm:p-8 shadow-2xl border border-[#0B1F4D]/5 hover:scale-[1.02] transition-transform duration-300">
              <img 
                src={logoImg} 
                alt="Shipmate Logo - Your Mate for Parcels & Errands" 
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
              <p className="text-xs text-[#0B1F4D]/60">Nationwide coverage</p>
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
              <p className="font-extrabold text-sm text-[#0B1F4D]">👤 Trusted Mates</p>
              <p className="text-xs text-[#0B1F4D]/60">100% locally operated</p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. HOW IT WORKS */}
      <section id="how-it-works" className="py-20 px-4 sm:px-8 max-w-7xl mx-auto text-center space-y-12">
        <div className="space-y-4">
          <h2 className="text-3xl font-black tracking-tight text-[#0B1F4D]">How Shipmate Works</h2>
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
              Open the app, enter pickup and drop-off addresses, choose vehicle type, and see your transparent pricing instantly.
            </p>
          </div>

          {/* Step 2 */}
          <div className="bg-white p-8 rounded-3xl border border-[#0B1F4D]/5 shadow-sm space-y-4 relative">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#F2A33D] text-white rounded-full flex items-center justify-center font-bold shadow-md">
              2
            </div>
            <div className="pt-4 flex justify-center text-[#F2A33D]">
              <Users className="w-12 h-12" />
            </div>
            <h3 className="text-xl font-bold text-[#0B1F4D]">Get Matched with a Courier</h3>
            <p className="text-[#0B1F4D]/70 text-sm leading-relaxed">
              Our smart routing matches you with a nearby courier who immediately heads to the pickup point.
            </p>
          </div>

          {/* Step 3 */}
          <div className="bg-white p-8 rounded-3xl border border-[#0B1F4D]/5 shadow-sm space-y-4 relative">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#2D5FE0] text-white rounded-full flex items-center justify-center font-bold shadow-md">
              3
            </div>
            <div className="pt-4 flex justify-center text-[#2D5FE0]">
              <MapPin className="w-12 h-12" />
            </div>
            <h3 className="text-xl font-bold text-[#0B1F4D]">Track in Real Time</h3>
            <p className="text-[#0B1F4D]/70 text-sm leading-relaxed">
              Watch the driver on the map and receive live status notifications until the package is handed over securely.
            </p>
          </div>
        </div>
      </section>

      {/* 5. SERVICES STRIP (Navy full-width banner) */}
      <section className="bg-[#0B1F4D] text-white py-12 overflow-x-auto whitespace-nowrap scrollbar-none">
        <div className="max-w-7xl mx-auto px-8 flex items-center justify-between min-w-[900px] gap-8">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🏍️</span>
            <span className="font-extrabold text-base tracking-wide uppercase">Motorbike Delivery</span>
          </div>
          <div className="h-6 w-px bg-white/20" />
          <div className="flex items-center gap-3">
            <span className="text-3xl">🚐</span>
            <span className="font-extrabold text-base tracking-wide uppercase">Van Delivery</span>
          </div>
          <div className="h-6 w-px bg-white/20" />
          <div className="flex items-center gap-3">
            <span className="text-3xl">📦</span>
            <span className="font-extrabold text-base tracking-wide uppercase">Parcels & Packages</span>
          </div>
          <div className="h-6 w-px bg-white/20" />
          <div className="flex items-center gap-3">
            <span className="text-3xl">🛍️</span>
            <span className="font-extrabold text-base tracking-wide uppercase">Errands & Shopping</span>
          </div>
          <div className="h-6 w-px bg-white/20" />
          <div className="flex items-center gap-3">
            <span className="text-3xl">🕐</span>
            <span className="font-extrabold text-base tracking-wide uppercase">Smart Delivery, Honest Timeline</span>
          </div>
        </div>
      </section>

      {/* 6. FOR CUSTOMERS SECTION */}
      <section id="customers" className="py-20 px-4 sm:px-8 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        <div className="lg:col-span-7 space-y-6">
          <div className="inline-block bg-[#2D5FE0]/10 text-[#2D5FE0] text-xs font-bold uppercase tracking-wider px-4 py-1.5 rounded-full">
            FOR CUSTOMERS
          </div>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-[#0B1F4D]">Zimbabwe's delivery app built for convenience</h2>
          <p className="text-base text-[#0B1F4D]/80 leading-relaxed">
            Whether it's a forgotten key, a documents packet to dispatch, or groceries to purchase, Shipmate is the app that gets it done with total transparency.
          </p>

          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-[#2D5FE0] shrink-0 mt-0.5" />
              <span className="font-bold text-sm text-[#0B1F4D]">Same-Day & Instant Delivery</span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-[#2D5FE0] shrink-0 mt-0.5" />
              <span className="font-bold text-sm text-[#0B1F4D]">EcoCash & Cash Payments</span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-[#2D5FE0] shrink-0 mt-0.5" />
              <span className="font-bold text-sm text-[#0B1F4D]">Real-Time GPS Driver Tracking</span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-[#2D5FE0] shrink-0 mt-0.5" />
              <span className="font-bold text-sm text-[#0B1F4D]">Transparent, upfront pricing</span>
            </li>
          </ul>
        </div>

        {/* CSS Mockup of the Customer App */}
        <div className="lg:col-span-5 flex justify-center">
          <div className="relative w-72 h-[500px] bg-slate-950 rounded-[40px] p-3 shadow-2xl border-4 border-slate-850">
            {/* Top speaker notch */}
            <div className="absolute top-5 left-1/2 -translate-x-1/2 w-28 h-5 bg-slate-950 rounded-full flex items-center justify-center">
              <div className="w-10 h-1 bg-slate-800 rounded-full" />
            </div>

            {/* Screen Content */}
            <div className="w-full h-full bg-[#F5F7FA] rounded-[32px] overflow-hidden flex flex-col font-sans text-xs">
              {/* App status bar */}
              <div className="h-10 bg-white border-b border-[#0B1F4D]/5 pt-6 px-4 flex justify-between items-center text-[10px] font-bold text-[#0B1F4D]/60">
                <span>09:41</span>
                <span>📶 🔋</span>
              </div>

              {/* App Body */}
              <div className="flex-1 p-4 space-y-4 overflow-y-auto">
                <div className="flex items-center gap-1">
                  <span className="text-[#2D5FE0]">📍</span>
                  <span className="font-bold text-[#0B1F4D]">Harare CBD</span>
                </div>

                {/* Simulated Order Card */}
                <div className="bg-white p-3.5 rounded-2xl shadow-sm border border-[#0B1F4D]/5 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="font-extrabold text-[#0B1F4D]">Active Delivery</span>
                    <span className="bg-[#2D5FE0]/10 text-[#2D5FE0] font-extrabold text-[9px] px-2 py-0.5 rounded-full uppercase">En Route</span>
                  </div>
                  
                  {/* Address List */}
                  <div className="space-y-2 relative pl-4 border-l border-dashed border-slate-300">
                    <div className="relative">
                      <span className="absolute -left-[21px] top-0.5 text-[9px]">🟢</span>
                      <p className="text-[10px] text-slate-400">Pickup</p>
                      <p className="font-bold text-[#0B1F4D] truncate">Eastgate Mall, Harare</p>
                    </div>
                    <div className="relative">
                      <span className="absolute -left-[21px] top-0.5 text-[9px]">🔴</span>
                      <p className="text-[10px] text-slate-400">Drop-off</p>
                      <p className="font-bold text-[#0B1F4D] truncate">Avondale Shops, Harare</p>
                    </div>
                  </div>
                </div>

                {/* Simulated payment detail */}
                <div className="bg-white p-3 rounded-2xl shadow-sm border border-[#0B1F4D]/5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📱</span>
                    <div>
                      <p className="font-bold text-[#0B1F4D]">EcoCash Payment</p>
                      <p className="text-[9px] text-[#2D5FE0] font-bold">Connected • *151#</p>
                    </div>
                  </div>
                  <span className="font-extrabold text-[#0B1F4D] text-sm">$6.50</span>
                </div>

                {/* Mock Map Element */}
                <div className="bg-blue-100 h-28 rounded-2xl relative overflow-hidden border border-[#2D5FE0]/10">
                  {/* Map grids */}
                  <div className="absolute inset-0 opacity-20 bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:14px_24px]" />
                  {/* Route line */}
                  <svg className="absolute inset-0 w-full h-full">
                    <path d="M 40 80 Q 120 40 180 60" fill="none" stroke="#2D5FE0" strokeWidth="3" strokeDasharray="4 2" />
                  </svg>
                  {/* Pickup dot */}
                  <div className="absolute left-[34px] top-[74px] w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center text-[7px] text-white font-bold border-2 border-white">P</div>
                  {/* Dropoff dot */}
                  <div className="absolute left-[174px] top-[54px] w-4 h-4 bg-rose-500 rounded-full flex items-center justify-center text-[7px] text-white font-bold border-2 border-white">D</div>
                  {/* Driver motorcycle marker */}
                  <div className="absolute left-[100px] top-[46px] bg-white px-2 py-1 rounded-xl shadow-lg border border-[#2D5FE0]/20 flex items-center gap-1 text-[8px] font-bold text-[#0B1F4D]">
                    <span>🏍️</span>
                    <span>Tinashe</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. FOR COURIERS SECTION */}
      <section id="couriers" className="py-20 px-4 sm:px-8 bg-white border-y border-[#0B1F4D]/5">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="order-2 lg:order-1 flex justify-center">
            {/* Visual illustration of courier earnings card */}
            <div className="bg-[#0B1F4D] text-white p-8 rounded-[2.5rem] shadow-2xl max-w-sm w-full space-y-6 border border-[#2D5FE0]/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-[#F2A33D]">
                    <Award className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-extrabold text-sm text-white">Courier Partner</p>
                    <p className="text-xs text-white/60">Tinashe M.</p>
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
                  <p className="text-xs font-bold text-white">Weekly payout processed</p>
                </div>
                <ChevronRight className="w-4 h-4 text-white" />
              </div>
            </div>
          </div>

          <div className="order-1 lg:order-2 space-y-6">
            <div className="inline-block bg-[#F2A33D]/10 text-[#F2A33D] text-xs font-bold uppercase tracking-wider px-4 py-1.5 rounded-full">
              FOR COURIERS
            </div>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-[#0B1F4D]">Drive with Shipmate. <br/>Earn on your own terms.</h2>
            <p className="text-base text-[#0B1F4D]/80 leading-relaxed">
              Got a motorcycle or a delivery van? Partner with Shipmate to get a reliable stream of courier jobs, flexible hours, and weekly payouts direct to your EcoCash account.
            </p>

            <ul className="space-y-4">
              <li className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-[#F2A33D]/10 flex items-center justify-center text-[#F2A33D] shrink-0 text-sm font-bold">✓</span>
                <span className="font-bold text-sm text-[#0B1F4D]">Flexible earnings - Work when you want</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-[#F2A33D]/10 flex items-center justify-center text-[#F2A33D] shrink-0 text-sm font-bold">✓</span>
                <span className="font-bold text-sm text-[#0B1F4D]">Weekly direct payouts to your EcoCash or Wallet</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-[#F2A33D]/10 flex items-center justify-center text-[#F2A33D] shrink-0 text-sm font-bold">✓</span>
                <span className="font-bold text-sm text-[#0B1F4D]">Low, transparent commission rates</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-[#F2A33D]/10 flex items-center justify-center text-[#F2A33D] shrink-0 text-sm font-bold">✓</span>
                <span className="font-bold text-sm text-[#0B1F4D]">Intuitive companion app with built-in navigation</span>
              </li>
            </ul>

            <div className="pt-4">
              <button 
                onClick={() => scrollToSection('download')}
                className="w-full sm:w-auto bg-[#F2A33D] hover:bg-[#F2A33D]/90 text-white font-bold px-8 py-4 rounded-2xl shadow-xl shadow-[#F2A33D]/20 transition-all hover:-translate-y-1 text-center cursor-pointer"
              >
                Apply to be a Courier
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 8. DOWNLOAD & BETA SIGNUP */}
      <section id="download" className="py-20 px-4 sm:px-8 max-w-4xl mx-auto text-center space-y-10">
        <div className="space-y-4">
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-[#0B1F4D]">Join the Shipmate Beta</h2>
          <p className="text-base text-[#0B1F4D]/70 max-w-xl mx-auto">
            We are currently in private beta testing. Sign up below to get early access to our customer and driver apps as soon as we launch public testing.
          </p>
        </div>

        {/* Email Capture Form / Success Message */}
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
                {loading ? 'Submitting...' : 'Request Early Access'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <div className="space-y-4 py-4 text-center">
              <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-[#0B1F4D]">You're on the list!</h3>
              <p className="text-sm text-[#0B1F4D]/70 max-w-xs mx-auto">
                Thank you for your interest. We will notify you at your email address as soon as beta invites are released.
              </p>
            </div>
          )}
        </div>

        {/* Play Store Outlines */}
        <div className="flex flex-col sm:flex-row justify-center items-center gap-4 pt-6 text-sm text-[#0B1F4D]/60 font-semibold">
          <div className="flex items-center gap-2 bg-white/60 px-5 py-3 rounded-2xl border border-[#0B1F4D]/5">
            <span>🤖</span>
            <span>Google Play Beta: Joined via invitation</span>
          </div>
          <div className="flex items-center gap-2 bg-white/60 px-5 py-3 rounded-2xl border border-[#0B1F4D]/5">
            <span>🍎</span>
            <span>iOS TestFlight: Starting soon</span>
          </div>
        </div>
      </section>

      <footer className="bg-[#0B1F4D] text-white/70 py-16 px-4 sm:px-8 border-t border-white/5">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12">
          {/* Brand Info */}
          <div className="space-y-4">
            <div className="inline-flex bg-white rounded-3xl p-4 shadow-xl border border-white/10 hover:scale-[1.03] transition-transform duration-300">
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
