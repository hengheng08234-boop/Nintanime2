import { useEffect, useRef, useState } from 'react';
import {
  X,
  Crown,
  CheckCircle2,
  Loader2,
  Sparkles,
  Download,
  ShieldCheck,
  Clock,
  ArrowLeft,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/supabaseClient';
import { useLang } from '@/lib/useLang';
import { appText } from '@/lib/appTranslations';

const LOGO_URL = '/assets/images/logo-transparent.png';

type PlanKey = '1m' | '2m' | '6m' | '1y';

const PLANS: {
  key: PlanKey;
  months: number;
  price: number;
  labelKey: 'sub1Month' | 'sub2Months' | 'sub6Months' | 'sub12Months';
  tagKey?: 'subPopular' | 'subBestValue';
}[] = [
  { key: '1m', months: 1, price: 2, labelKey: 'sub1Month' },
  { key: '2m', months: 2, price: 4, labelKey: 'sub2Months' },
  { key: '6m', months: 6, price: 7, labelKey: 'sub6Months', tagKey: 'subPopular' },
  { key: '1y', months: 12, price: 28, labelKey: 'sub12Months', tagKey: 'subBestValue' },
];

const PLAN_QR: Record<PlanKey, string> = {
  '1m': '/assets/images/subscription-1m.png',
  '2m': '/assets/images/subscription-2m.png',
  '6m': '/assets/images/subscription-6m.png',
  '1y': '/assets/images/subscription-1y.png',
};

const COUNTDOWN_SECONDS = 60;
const POLL_INTERVAL_MS = 3000;

interface Props {
  onClose: () => void;
}

type Step = 'summary' | 'qr' | 'success' | 'timeout';

export default function SubscriptionModal({ onClose }: Props) {
  const { lang } = useLang();
  const t = appText[lang];
  const km = lang === 'km';

  const [selected, setSelected] = useState<PlanKey>('6m');
  const [step, setStep] = useState<Step>('summary');
  const [error, setError] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const [paying, setPaying] = useState(false);
  const [qrLoaded, setQrLoaded] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedPlan = PLANS.find((p) => p.key === selected)!;

  const stopTimers = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  };

  useEffect(() => () => stopTimers(), []);

  useEffect(() => {
    setQrLoaded(false);
    setQrFailed(false);
  }, [selected]);

  const saveQr = async () => {
    try {
      const res = await fetch(PLAN_QR[selected]);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nint-anime-qr-${selected}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      const a = document.createElement('a');
      a.href = PLAN_QR[selected];
      a.download = `nint-anime-qr-${selected}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };

  const startListening = (requestId: string) => {
    setSecondsLeft(COUNTDOWN_SECONDS);
    setStep('qr');

    let remaining = COUNTDOWN_SECONDS;
    stopTimers();

    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        stopTimers();
        setStep('timeout');
      }
    }, 1000);

    pollRef.current = setInterval(async () => {
      const { data } = await supabase
        .from('subscription_requests')
        .select('status')
        .eq('id', requestId)
        .maybeSingle();
      if (data?.status === 'confirmed') {
        stopTimers();
        setStep('success');
      }
    }, POLL_INTERVAL_MS);
  };

  const createRequest = async () => {
    setError('');
    setPaying(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { setError(t.subNotSignedIn); return; }

      const { data, error: insertError } = await supabase
        .from('subscription_requests')
        .insert({
          user_id: userData.user.id,
          plan: selectedPlan.key,
          amount: selectedPlan.price,
          discount: 0,
          description: 'Awaiting Telegram auto-confirm',
        })
        .select('id')
        .single();

      if (insertError || !data) { setError(insertError?.message || t.subQrGenericError); return; }
      startListening(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.subQrGenericError);
    } finally {
      setPaying(false);
    }
  };

  const handleRetry = async () => {
    stopTimers();
    setError('');
    setPaying(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { setError(t.subNotSignedIn); return; }

      const { data, error: insertError } = await supabase
        .from('subscription_requests')
        .insert({
          user_id: userData.user.id,
          plan: selectedPlan.key,
          amount: selectedPlan.price,
          discount: 0,
          description: 'Awaiting Telegram auto-confirm (retry)',
        })
        .select('id')
        .single();

      if (insertError || !data) { setError(insertError?.message || t.subQrGenericError); return; }
      startListening(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.subQrGenericError);
    } finally {
      setPaying(false);
    }
  };

  const urgent = secondsLeft <= 10;
  const progress = secondsLeft / COUNTDOWN_SECONDS;
  const circumference = 2 * Math.PI * 12;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4"
      style={{ backgroundColor: 'rgba(6,6,10,0.88)', backdropFilter: 'blur(10px)' }}
      onClick={step !== 'qr' ? onClose : undefined}
    >
      <div
        className="relative w-full max-w-sm overflow-hidden text-white sm:rounded-[24px]"
        style={{
          background: '#111118',
          border: '1px solid rgba(255,255,255,0.08)',
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          boxShadow: '0 -12px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05)',
        }}
        onClick={(e) => e.stopPropagation()}
      >

        {/* ─── SUMMARY / PLAN SELECTION ─── */}
        {(step === 'summary' || step === 'timeout') && (
          <>
            {/* Header gradient */}
            <div
              className="relative overflow-hidden px-5 pb-4 pt-5 text-center"
              style={{ background: 'linear-gradient(180deg,#1c1c2c 0%,#111118 100%)' }}
            >
              <button
                onClick={onClose}
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.07] text-white/50 transition hover:bg-white/15 hover:text-white"
              >
                <X size={15} />
              </button>

              <div className="mx-auto mb-2.5 flex h-14 w-14 items-center justify-center">
                <img
                  src={LOGO_URL}
                  alt="NINT ANIME"
                  className="h-full w-full object-contain"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>
              <h2 className="flex items-center justify-center gap-1.5 text-[15px] font-bold text-white">
                <Crown size={14} fill="#E8A94A" strokeWidth={0} className="text-[#E8A94A]" />
                {t.subGoPremium}
              </h2>
              <p className="mt-0.5 flex items-center justify-center gap-1 text-[10px] text-white/40">
                <Sparkles size={9} className="text-[#E8A94A]" />
                {t.subTagline}
              </p>
            </div>

            <div className="max-h-[78vh] overflow-y-auto">
              <div className="px-4 pb-5 pt-2">

                {/* Timeout notice */}
                {step === 'timeout' && (
                  <div
                    className="mb-3 flex items-start gap-2 rounded-xl px-3 py-3"
                    style={{ border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.06)' }}
                  >
                    <Clock size={13} className="mt-0.5 flex-shrink-0 text-[#EF4444]" />
                    <p className="text-[10px] leading-relaxed text-[#EF4444]/80">{t.subTimeoutDesc}</p>
                  </div>
                )}

                {/* Plan grid */}
                <div className="mb-3 grid grid-cols-2 gap-2">
                  {PLANS.map((p) => {
                    const isSelected = selected === p.key;
                    return (
                      <button
                        key={p.key}
                        onClick={() => setSelected(p.key)}
                        className="relative rounded-2xl px-3 pb-3 pt-4 text-left transition-all duration-150"
                        style={{
                          border: isSelected ? '1.5px solid #E8A94A' : '1.5px solid rgba(255,255,255,0.07)',
                          background: isSelected
                            ? 'linear-gradient(145deg,rgba(35,28,12,1),rgba(28,22,8,1))'
                            : 'rgba(255,255,255,0.02)',
                          boxShadow: isSelected ? '0 0 0 3px rgba(232,169,74,0.1), 0 4px 16px rgba(0,0,0,0.3)' : 'none',
                        }}
                      >
                        {p.tagKey && (
                          <span
                            className="absolute -top-2.5 left-3 inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[8.5px] font-extrabold uppercase tracking-wide text-black"
                            style={{ background: 'linear-gradient(90deg,#E8A94A,#C97A2E)' }}
                          >
                            <Sparkles size={6} />
                            {t[p.tagKey]}
                          </span>
                        )}
                        <p className="text-[10px] font-medium text-white/50">{t[p.labelKey]}</p>
                        <p
                          className="mt-0.5 text-[28px] font-black leading-none tracking-tight"
                          style={{ color: isSelected ? '#E8A94A' : '#3FAE8A' }}
                        >
                          ${p.price}
                        </p>
                        <p className="mt-0.5 text-[9.5px] text-white/30">
                          ${(p.price / p.months).toFixed(2)}{t.subPerMonth}
                        </p>
                        {isSelected && (
                          <div className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-[#E8A94A]" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Total row */}
                <div
                  className="mb-3 flex items-center gap-3 rounded-2xl px-4 py-3"
                  style={{
                    border: '1px solid rgba(232,169,74,0.15)',
                    background: 'linear-gradient(135deg,rgba(30,22,5,1),rgba(20,16,4,1))',
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-white/50">{t.subTotalDue}</p>
                    <p className="text-[10px] text-white/30">{t[selectedPlan.labelKey]}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[26px] font-black leading-none text-[#E8A94A]">
                      ${selectedPlan.price}
                    </p>
                    <p className="text-[9px] text-white/30">USD</p>
                  </div>
                </div>

                {error && (
                  <p className="mb-2.5 rounded-xl bg-[#EF4444]/10 px-3 py-2 text-[10.5px] text-[#EF4444]">{error}</p>
                )}

                {/* Pay button */}
                <button
                  onClick={step === 'timeout' ? handleRetry : createRequest}
                  disabled={paying}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[13px] font-bold text-white transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg,#0F8F72 0%,#0B6E58 100%)' }}
                >
                  {paying ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="5" width="20" height="14" rx="2"/>
                      <line x1="2" y1="10" x2="22" y2="10"/>
                    </svg>
                  )}
                  {km ? (step === 'timeout' ? 'ចាប់ផ្ដើមម្ដងទៀត' : 'ទូទាត់ប្រាក់') : (step === 'timeout' ? 'Start New Session' : 'Pay Now')}
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-center gap-1.5 border-t border-white/[0.05] py-2.5">
              <ShieldCheck size={9} className="text-white/20" />
              <p className="text-[8.5px] text-white/20">{t.subSecFooter ?? 'Secured checkout · Powered by ABA PayWay KHQR'}</p>
            </div>
          </>
        )}

        {/* ─── QR STEP ─── */}
        {step === 'qr' && (
          <div className="flex flex-col overflow-hidden" style={{ borderRadius: 'inherit' }}>

            {/* Anime background area with card floating over it */}
            <div className="relative">
              {/* Anime poster background */}
              <div
                className="relative overflow-hidden"
                style={{ height: 200 }}
              >
                <img
                  src="/assets/images/image copy.png"
                  alt=""
                  className="h-full w-full object-cover object-top"
                />
                {/* Dark gradient overlay bottom */}
                <div
                  className="absolute inset-0"
                  style={{
                    background: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(17,17,24,0) 40%, rgba(17,17,24,0.6) 80%, rgba(17,17,24,1) 100%)',
                  }}
                />
                {/* Top bar: back + countdown + close */}
                <div className="absolute inset-x-0 top-0 flex items-center justify-between px-3 pt-3">
                  <button
                    onClick={() => { stopTimers(); setStep('summary'); }}
                    className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-medium text-white/80 backdrop-blur-sm transition hover:text-white"
                    style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)' }}
                  >
                    <ArrowLeft size={12} />
                    {km ? 'ថយក្រោយ' : 'Back'}
                  </button>

                  {/* Circular countdown */}
                  <div className="relative flex h-10 w-10 items-center justify-center">
                    <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 32 32">
                      <circle cx="16" cy="16" r="12" fill="rgba(0,0,0,0.4)" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
                      <circle
                        cx="16" cy="16" r="12"
                        fill="none"
                        stroke={urgent ? '#EF4444' : '#E8A94A'}
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeDasharray={`${circumference}`}
                        strokeDashoffset={`${circumference * (1 - progress)}`}
                        style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s ease' }}
                      />
                    </svg>
                    <span
                      className="relative text-[11px] font-black tabular-nums"
                      style={{ color: urgent ? '#EF4444' : '#E8A94A' }}
                    >
                      {secondsLeft}
                    </span>
                  </div>

                  <button
                    onClick={onClose}
                    className="flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-sm transition hover:brightness-125"
                    style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)' }}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* KHQR card — floats over the bottom of the poster */}
              <div className="relative z-10 -mt-10 flex justify-center px-10">
                <div
                  className="w-full overflow-hidden"
                  style={{
                    background: '#ffffff',
                    borderRadius: 18,
                    boxShadow: '0 8px 40px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.3)',
                  }}
                >
                  {/* Red header */}
                  <div
                    className="flex items-center justify-center py-2.5"
                    style={{ background: '#D0191C' }}
                  >
                    {/* KHQR logo — text + QR icon matching the official style */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[15px] font-black tracking-[0.18em] text-white" style={{ fontFamily: 'system-ui, sans-serif' }}>KH</span>
                      <svg width="16" height="16" viewBox="0 0 32 32" fill="none">
                        <rect x="1" y="1" width="11" height="11" rx="1.5" fill="white"/>
                        <rect x="20" y="1" width="11" height="11" rx="1.5" fill="white"/>
                        <rect x="1" y="20" width="11" height="11" rx="1.5" fill="white"/>
                        <rect x="3.5" y="3.5" width="6" height="6" rx="0.5" fill="#D0191C"/>
                        <rect x="22.5" y="3.5" width="6" height="6" rx="0.5" fill="#D0191C"/>
                        <rect x="3.5" y="22.5" width="6" height="6" rx="0.5" fill="#D0191C"/>
                        <rect x="20" y="20" width="3" height="3" rx="0.5" fill="white"/>
                        <rect x="25" y="20" width="3" height="3" rx="0.5" fill="white"/>
                        <rect x="20" y="25" width="3" height="3" rx="0.5" fill="white"/>
                        <rect x="26" y="26" width="5" height="5" rx="0.5" fill="white"/>
                      </svg>
                      <span className="text-[15px] font-black tracking-[0.18em] text-white" style={{ fontFamily: 'system-ui, sans-serif' }}>R</span>
                    </div>
                  </div>

                  {/* Card info */}
                  <div className="px-4 pt-3 pb-2">
                    <p className="text-[12px] font-bold text-gray-800 leading-tight">
                      PANG SOK HENG{' '}
                      <span className="font-normal text-gray-500">S2_Nint.Ani</span>
                    </p>
                    <p className="mt-1 text-[22px] font-black text-gray-900 leading-none tracking-tight">
                      $ {selectedPlan.price.toFixed(2)}
                    </p>
                    <div className="mt-2.5 mb-0" style={{ borderTop: '1.5px dashed #e5e7eb' }} />
                  </div>

                  {/* QR image — full width, no extra padding needed since image has its own whitespace */}
                  <div className="relative flex items-center justify-center px-4 pb-4">
                    {!qrLoaded && !qrFailed && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-[#D0191C]" />
                      </div>
                    )}
                    <img
                      src={PLAN_QR[selected]}
                      alt="KHQR code"
                      className={`w-full max-w-[200px] object-contain transition-opacity duration-300 ${qrLoaded ? 'opacity-100' : 'opacity-0'}`}
                      onLoad={() => setQrLoaded(true)}
                      onError={() => { setQrFailed(true); setQrLoaded(true); }}
                    />
                    {qrFailed && (
                      <div className="flex h-[160px] w-[160px] flex-col items-center justify-center rounded-xl bg-gray-100">
                        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="mb-2 opacity-30">
                          <rect x="2" y="2" width="18" height="18" rx="2" stroke="#374151" strokeWidth="2.5"/>
                          <rect x="5" y="5" width="12" height="12" rx="1" fill="#374151"/>
                          <rect x="28" y="2" width="18" height="18" rx="2" stroke="#374151" strokeWidth="2.5"/>
                          <rect x="31" y="5" width="12" height="12" rx="1" fill="#374151"/>
                          <rect x="2" y="28" width="18" height="18" rx="2" stroke="#374151" strokeWidth="2.5"/>
                          <rect x="5" y="31" width="12" height="12" rx="1" fill="#374151"/>
                        </svg>
                        <p className="text-[9px] text-gray-400">QR unavailable</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Actions + status below card */}
            <div className="px-4 pt-4 pb-2">
              {/* Save QR button */}
              <button
                onClick={saveQr}
                className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[12px] font-semibold transition hover:brightness-110 active:scale-[0.98]"
                style={{
                  border: '1.5px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.05)',
                  color: 'rgba(255,255,255,0.75)',
                }}
              >
                <Download size={13} />
                {km ? 'រក្សាទុក QR ទៅ Gallery' : 'Save QR to Gallery'}
              </button>

              {/* Waiting pill */}
              <div
                className="mt-2.5 flex items-center gap-2.5 rounded-xl px-3 py-2.5"
                style={{
                  border: '1px solid rgba(15,143,114,0.2)',
                  background: 'rgba(15,143,114,0.07)',
                }}
              >
                <Loader2 size={13} className="animate-spin shrink-0 text-[#0F8F72]" />
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold leading-tight text-white/70">
                    {km ? 'កំពុងរង់ចាំការទូទាត់…' : 'Waiting for payment…'}
                  </p>
                  <p className="text-[9px] text-white/35">
                    {km ? 'ដោះសោ VIP ស្វ័យប្រវត្តិពេល ABA បញ្ជាក់' : 'Auto-unlocks when ABA confirms'}
                  </p>
                </div>
              </div>

              {/* Instruction */}
              <p className="mt-2.5 text-center text-[9.5px] leading-relaxed text-white/35">
                {km
                  ? 'ស្វែង QR ដោយប្រើ ABA Mobile ឬ App ធនាគារណាដែលគាំទ្រ KHQR\nដើម្បីបង់ប្រាក់ និងដោះសោ VIP ភ្លាមៗ'
                  : 'Scan with ABA Mobile or any KHQR banking app\nto pay and unlock Premium instantly'}
              </p>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-center gap-1.5 border-t border-white/[0.04] py-2.5 mt-1">
              <ShieldCheck size={9} className="text-white/20" />
              <p className="text-[8px] text-white/20">{t.subSecFooter ?? 'Secured · Powered by ABA PayWay KHQR'}</p>
            </div>
          </div>
        )}

        {/* ─── SUCCESS ─── */}
        {step === 'success' && (
          <div className="flex flex-col items-center px-5 py-10 text-center">
            <div
              className="mb-5 flex h-20 w-20 items-center justify-center rounded-full"
              style={{ background: 'radial-gradient(circle,rgba(34,197,94,0.2),rgba(34,197,94,0.04))' }}
            >
              <CheckCircle2 size={42} className="text-[#22C55E]" />
            </div>
            <p className="flex items-center gap-1.5 text-[16px] font-bold text-white">
              <Crown size={15} fill="#E8A94A" strokeWidth={0} className="text-[#E8A94A]" />
              {t.subYourePremium}
            </p>
            <p className="mx-auto mt-2 max-w-[240px] text-[10.5px] leading-relaxed text-white/50">
              {t.subConfirmedDesc}
            </p>
            <button
              onClick={onClose}
              className="mt-6 rounded-2xl px-8 py-3 text-[13px] font-bold text-white transition hover:brightness-110 active:scale-[0.98]"
              style={{ background: 'linear-gradient(135deg,#0F8F72 0%,#0B6E58 100%)' }}
            >
              {t.subStartWatching}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
