import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Check, 
  Sparkles, 
  Zap, 
  ShieldCheck, 
  Building2, 
  ChevronRight, 
  Lock, 
  Loader2, 
  AlertCircle 
} from 'lucide-react';
import { useProjectStore } from '../lib/core/store';

export default function PricingModal() {
  const { 
    isPricingModalOpen, 
    setPricingModalOpen, 
    user, 
    userProfile, 
    setMockProState,
    signIn
  } = useProjectStore();

  const [isAnnual, setIsAnnual] = useState(false);
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [successTier, setSuccessTier] = useState<string | null>(null);

  if (!isPricingModalOpen) return null;

  const handleUpgrade = async (tierName: string) => {
    if (!user) {
      // Prompt sign in first
      try {
        await signIn();
      } catch (err) {
        console.error("Auth flow failed for checkouts", err);
      }
      return;
    }

    setLoadingTier(tierName);
    // Simulate real Stripe payment redirection and confirmation webhook
    await new Promise(r => setTimeout(r, 1200));
    
    try {
      await setMockProState(true);
      setSuccessTier(tierName);
      await new Promise(r => setTimeout(r, 1500));
      setPricingModalOpen(false);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingTier(null);
      setSuccessTier(null);
    }
  };

  const handleDowngradeMock = async () => {
    setLoadingTier('downgrade');
    await new Promise(r => setTimeout(r, 800));
    await setMockProState(false);
    setLoadingTier(null);
  };

  const featuresFree = [
    "20 AI copilot actions / month",
    "Max 2 project boards",
    "Basic EDA symbol catalog",
    "Manual routing canvas",
    "Standard Gerber files export"
  ];

  const featuresPro = [
    "Unlimited AI trace copilot actions",
    "Unlimited design project boards",
    "Advanced Hierarchical macros (ESP32, buck converter etc)",
    "Full constraint-driven auto-router",
    "Interactive Real-time electromagnetic simulation",
    "Guaranteed trace-match DRC validation",
    "Direct fab orders & Gerber downloads",
    "Priority server thread queue"
  ];

  const featuresEnterprise = [
    "Everything in Professional class",
    "Private deployment models",
    "Single Sign On (SOML/OIDC)",
    "Dedicated custom symbol validation team",
    "99.9% simulation SLA guarantee",
    "On-premise secure collaboration servers"
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop overlay */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setPricingModalOpen(false)}
          className="absolute inset-0 bg-black/80 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-5xl bg-[#09090b] border border-white/10 rounded-2xl shadow-2xl overflow-hidden text-gray-200 flex flex-col max-h-[90vh]"
        >
          {/* Subtle glowing lines */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-500 to-transparent" />

          {/* Close button */}
          <button 
            type="button"
            onClick={() => setPricingModalOpen(false)}
            className="absolute top-4 right-4 p-2 text-gray-500 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-all cursor-pointer z-10"
          >
            <X size={16} />
          </button>

          {/* Header */}
          <div className="p-8 text-center bg-gradient-to-b from-indigo-950/25 to-transparent shrink-0">
            {userProfile?.isAdmin && (
              <div className="mb-4 inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-500/10 border border-indigo-500/40 rounded-full text-indigo-400 font-mono text-[9.5px] uppercase tracking-widest font-black animate-pulse">
                <ShieldCheck size={12} className="text-indigo-400" />
                Developer Unlimited Bypass Active
              </div>
            )}
            <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight text-white font-sans flex items-center justify-center gap-2">
              <Sparkles className="text-indigo-400 animate-pulse" size={24} />
              Professional EDA Runtime Gating
            </h2>
            <p className="mt-2 text-xs md:text-sm text-gray-400 max-w-xl mx-auto font-sans">
              Sign up or upgrade your hardware workstation to unlock deterministic AI layout builders, auto-routing layers, and direct physical fab integrations.
            </p>

            {/* Toggle Switch */}
            <div className="mt-6 inline-flex items-center gap-3 bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
              <button 
                type="button"
                onClick={() => setIsAnnual(false)}
                className={`text-[10px] uppercase font-black tracking-wider px-3 py-1 rounded-full text-nowrap transition-all ${!isAnnual ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
              >
                Monthly
              </button>
              <button 
                type="button"
                onClick={() => setIsAnnual(true)}
                className={`text-[10px] uppercase font-black tracking-wider px-3 py-1 rounded-full text-nowrap transition-all flex items-center gap-1.5 ${isAnnual ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
              >
                Annually
                <span className="text-[8px] px-1 py-0.5 bg-emerald-500/15 text-emerald-400 rounded-full font-bold">
                  Save 20%
                </span>
              </button>
            </div>
          </div>

          {/* Scrolling Grid Area */}
          <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 md:space-y-0 md:grid md:grid-cols-3 md:gap-6 pr-6 md:pr-8">
            
            {/* 1. Free Workstation Card */}
            <div className="relative flex flex-col justify-between p-6 bg-white/[0.01] border border-white/5 rounded-xl transition-all hover:bg-white/[0.02] hover:border-white/10 group">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Free Workstation</span>
                  {userProfile && !userProfile.isPro && !userProfile.isAdmin && (
                    <span className="text-[8px] py-0.5 px-1.5 bg-indigo-500/10 text-indigo-400 font-extrabold uppercase rounded border border-indigo-500/20">
                      Active
                    </span>
                  )}
                </div>
                <div className="mt-4 flex items-baseline text-white">
                  <span className="text-3xl font-extrabold tracking-tight font-sans">$0</span>
                  <span className="ml-1 text-xs text-gray-500">/ forever</span>
                </div>
                <p className="mt-2 text-[10px] text-gray-400 italic">Excellent sandbox to dry-run small hobby projects and custom symbols manually.</p>

                {/* Separator */}
                <div className="my-5 border-t border-white/5" />

                <ul className="space-y-3">
                  {featuresFree.map((feat, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-[11px] text-gray-400 font-sans">
                      <Check size={12} className="text-gray-600 mt-0.5 shrink-0" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-8">
                {userProfile && userProfile.isPro ? (
                  <button 
                    type="button"
                    onClick={handleDowngradeMock}
                    disabled={loadingTier !== null}
                    className="w-full py-3 bg-white/5 hover:bg-rose-500/10 hover:text-rose-400 border border-white/5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {loadingTier === 'downgrade' ? (
                      <>
                        <Loader2 size={12} className="animate-spin" />
                        Downgrading...
                      </>
                    ) : (
                      "Downgrade to Free"
                    )}
                  </button>
                ) : (
                  <button 
                    type="button"
                    disabled
                    className="w-full py-3 bg-white/5 text-gray-500 border border-white/5 text-[10px] font-bold uppercase tracking-wider rounded-lg cursor-not-allowed text-center"
                  >
                    Active Workstation
                  </button>
                )}
              </div>
            </div>

            {/* 2. Professional Hardware Workstation Card */}
            <div className="relative flex flex-col justify-between p-6 bg-indigo-950/10 border-2 border-indigo-500/40 rounded-xl transition-all shadow-indigo-500/5 shadow-[0_0_30px_rgba(79,70,229,0.05)] hover:border-indigo-500 group">
              {/* Popular tag accent */}
              <div className="absolute -top-3 right-4 px-2.5 py-0.5 bg-indigo-600 text-white text-[8px] font-black uppercase tracking-wider rounded-full shadow-md animate-pulse">
                Recommended
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 flex items-center gap-1">
                    <Zap size={11} className="fill-indigo-400/20" />
                    Professional EDA
                  </span>
                  {(userProfile?.isPro || userProfile?.isAdmin) && (
                    <span className="text-[8px] py-0.5 px-1.5 bg-indigo-500/20 text-indigo-400 font-extrabold uppercase rounded border border-indigo-500/40 animate-pulse">
                      {userProfile?.isAdmin ? "DEV UNLIMITED" : "Active"}
                    </span>
                  )}
                </div>
                <div className="mt-4 flex items-baseline text-white">
                  <span className="text-3xl font-extrabold tracking-tight font-sans">
                    ${isAnnual ? '23' : '29'}
                  </span>
                  <span className="ml-1 text-xs text-indigo-300">/ month</span>
                </div>
                <p className="mt-2 text-[10px] text-gray-400 italic">Advanced multi-layer schematics, high intensity auto-router runs, and instant offline Gerber output packages.</p>

                {/* Separator */}
                <div className="my-5 border-t border-white/5" />

                <ul className="space-y-3">
                  {featuresPro.map((feat, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-[11px] text-gray-300 font-sans">
                      <Check size={12} className="text-indigo-400 mt-0.5 shrink-0" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-8">
                {userProfile?.isAdmin ? (
                  <div className="text-center text-[10px] text-indigo-400 font-bold bg-indigo-500/5 py-3 border border-indigo-500/10 rounded-lg flex items-center justify-center gap-1.5">
                    <ShieldCheck size={13} className="text-indigo-400" />
                    Developer Bypass Active
                  </div>
                ) : userProfile?.isPro ? (
                  <div className="text-center text-[10px] text-emerald-400 font-bold bg-emerald-500/5 py-3 border border-emerald-500/10 rounded-lg flex items-center justify-center gap-1.5">
                    <ShieldCheck size={13} />
                    Tier Subscribed Successfully
                  </div>
                ) : (
                  <button 
                    type="button"
                    onClick={() => handleUpgrade('pro')}
                    disabled={loadingTier !== null}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-600/20 group-hover:scale-[1.01]"
                  >
                    {loadingTier === 'pro' ? (
                      <>
                        <Loader2 size={12} className="animate-spin" />
                        Redirecting to Stripe...
                      </>
                    ) : successTier === 'pro' ? (
                      <>
                        <ShieldCheck size={12} className="animate-ping" />
                        Verification Passed!
                      </>
                    ) : (
                      <>
                        Unlock Professional class
                        <ChevronRight size={12} />
                      </>
                    )}
                  </button>
                )}
                <div className="mt-2 flex items-center justify-center gap-1 text-[8px] text-gray-600 font-mono uppercase">
                  <Lock size={8} /> Secure transaction via standard Stripe Checkout
                </div>
              </div>
            </div>

            {/* 3. Enterprise Integration Card */}
            <div className="relative flex flex-col justify-between p-6 bg-white/[0.01] border border-white/5 rounded-xl transition-all hover:bg-white/[0.02] hover:border-white/10 group">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Secure Enterprise</span>
                </div>
                <div className="mt-4 flex items-baseline text-white">
                  <span className="text-2xl font-extrabold tracking-tight font-sans">Custom</span>
                  <span className="ml-1 text-xs text-gray-500">/ volume base</span>
                </div>
                <p className="mt-2 text-[10px] text-gray-400 italic">For teams requiring aerospace/defense compliance constraints, on-prem hardware engines, or rigid internal symbol audits.</p>

                {/* Separator */}
                <div className="my-5 border-t border-white/5" />

                <ul className="space-y-3">
                  {featuresEnterprise.map((feat, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-[11px] text-gray-400 font-sans">
                      <Building2 size={12} className="text-gray-600 mt-0.5 shrink-0" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-8">
                <button 
                  type="button"
                  onClick={() => handleUpgrade('enterprise')}
                  disabled={loadingTier !== null}
                  className="w-full py-3 bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {loadingTier === 'enterprise' ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : successTier === 'enterprise' ? (
                    <ShieldCheck size={12} />
                  ) : (
                    "Contact Hardware Execs"
                  )}
                </button>
              </div>
            </div>

          </div>

          {/* Footer stats / information tracker */}
          <div className="p-4 bg-black/60 border-t border-white/5 text-[9px] text-gray-500 text-center uppercase tracking-widest font-mono shrink-0 flex items-center justify-center gap-4">
            <span>Free Limits Reset Monthly on the 1st</span>
            <span className="text-white/20">|</span>
            {userProfile ? (
              userProfile.isAdmin ? (
                <span className="text-indigo-400 font-bold">
                  Bypass Active: <strong className="text-indigo-300">Jordan / NovaCircuit</strong> Developer Profile with Unlimited Access
                </span>
              ) : (
                <span className="text-gray-400">
                  You used <strong className="text-white">{userProfile.aiActionsThisMonth} / 20</strong> AI actions & <strong className="text-white">{userProfile.boardsThisMonth} / 2</strong> boards this month
                </span>
              )
            ) : (
              <span>Authentication required to display usage limits</span>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
