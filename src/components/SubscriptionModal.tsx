import { useEffect, useRef, useState } from 'react';
import {
  X,
  Crown,
  CheckCircle2,
  Loader2,
  Sparkles,
  RefreshCw,
  Download,
  Check,
  DollarSign,
  QrCode,
  ArrowLeft,
  Share2,
  ShieldCheck,
  Clock,
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

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedPlan = PLANS.find((p) => p.key === selected)!;

  const stopTimers = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  };

  useEffect(() => () => stopTimers(), []);

  const saveQr = () => {
    const a = document.createElement('a');
    a.href = PLAN_QR[selected];
    a.download = `nint-anime-qr-${selected}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
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
      style={{ backgroundColor: 'rgba(6,6,10,0.85)', backdropFilter: 'blur(8px)' }}
      onClick={step !== 'qr' ? onClose : undefined}
    >
      <div
        className="relative w-full max-w-sm overflow-hidden text-white sm:rounded-[24px]"
        style={{
          background: '#121218',
          border: '1px solid rgba(255,255,255,0.07)',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          boxShadow: '0 -8px 40px rgba(0,0,0,0.6)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── SUMMARY / PLAN SELECTION ─── */}
        {(step === 'summary' || step === 'timeout') && (
          <>
            {/* Header */}
            <div
              className="relative overflow-hidden px-5 pb-4 pt-5 text-center"
              style={{ background: 'linear-gradient(180deg,#1d1d2e 0%,#121218 100%)' }}
            >
              <button
                onClick={onClose}
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/8 text-white/60 transition hover:bg-white/15"
              >
                <X size={16} />
              </button>
              <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center">
                <img
                  src={LOGO_URL}
                  alt="NINT ANIME"
                  className="h-full w-full object-contain"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>
              <h2 className="flex items-center justify-center gap-1.5 text-base font-bold text-white">
                <Crown size={15} fill="#E8A94A" strokeWidth={0} className="text-[#E8A94A]" />
                {t.subGoPremium}
              </h2>
              <p className="mt-0.5 flex items-center justify-center gap-1 text-[10.5px] text-white/45">
                <Sparkles size={10} className="text-[#E8A94A]" />
                {t.subTagline}
              </p>
            </div>

            <div className="max-h-[75vh] overflow-y-auto">
              <div className="px-4 pb-5 pt-2">

                {/* Plan grid */}
                <div className="mb-3 grid grid-cols-2 gap-2">
                  {PLANS.map((p) => {
                    const isSelected = selected === p.key;
                    return (
                      <button
                        key={p.key}
                        onClick={() => setSelected(p.key)}
                        className="relative rounded-xl px-3 pb-3 pt-4 text-left transition-all duration-150"
                        style={{
                          border: isSelected ? '1.5px solid #E8A94A' : '1.5px solid rgba(255,255,255,0.08)',
                          background: isSelected ? 'rgba(30,26,18,1)' : 'rgba(255,255,255,0.02)',
                          boxShadow: isSelected ? '0 0 0 1px #E8A94A22' : 'none',
                        }}
                      >
                        {p.tagKey && (
                          <span
                            className="absolute -top-2.5 left-3 inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[9px] font-extrabold text-black"
                            style={{ background: 'linear-gradient(90deg,#E8A94A,#C97A2E)' }}
                          >
                            <Sparkles size={7} />
                            {t[p.tagKey]}
                          </span>
                        )}
                        <p className="text-[10.5px] font-medium text-white/60">{t[p.labelKey]}</p>
                        <p
                          className="mt-0.5 text-[26px] font-black leading-none"
                          style={{ color: isSelected ? '#E8A94A' : '#0F8F72' }}
                        >
                          ${p.price}
                        </p>
                        <p className="mt-0.5 text-[10px] text-white/30">
                          ${(p.price / p.months).toFixed(2)}{t.subPerMonth}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {/* Total row */}
                <div
                  className="mb-3 flex items-center gap-3 rounded-xl px-4 py-3"
                  style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)' }}
                >
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#0F8F72]">
                    <DollarSign size={16} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-white/70">{t.subTotalDue}</p>
                    <p className="text-[10px] text-white/40">{t[selectedPlan.labelKey]}</p>
                  </div>
                  <p className="text-2xl font-black text-white">${selectedPlan.price}</p>
                </div>

                {/* Payment info section */}
                <div
                  className="mb-3 rounded-xl p-4"
                  style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}
                >
                  <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-white/80">
                    <QrCode size={13} className="text-[#E8A94A]" />
                    {t.subStep2Title}
                  </p>
                  <p className="text-[10px] leading-relaxed text-white/45">{t.subStep2Desc}</p>
                </div>

                {step === 'timeout' && (
                  <div
                    className="mb-3 flex items-start gap-2 rounded-xl px-3 py-3"
                    style={{ border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.05)' }}
                  >
                    <Clock size={14} className="mt-0.5 flex-shrink-0 text-[#EF4444]" />
                    <p className="text-[10.5px] text-[#EF4444]/80">{t.subTimeoutDesc}</p>
                  </div>
                )}

                {error && <p className="mb-2 text-[10.5px] text-[#EF4444]">{error}</p>}

                <button
                  onClick={createRequest}
                  disabled={paying}
                  className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[13px] font-bold text-white transition hover:brightness-110 disabled:opacity-60"
                  style={{ background: 'linear-gradient(90deg,#0F8F72,#0B6E58)' }}
                >
                  {paying ? <Loader2 size={15} className="animate-spin" /> : <DollarSign size={15} />}
                  {km ? 'ទូទាត់' : 'Pay Now'}
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-center gap-1.5 border-t border-white/5 py-3">
              <ShieldCheck size={10} className="text-white/25" />
              <p className="text-[9px] text-white/25">{t.subSecFooter ?? 'Secured checkout · Powered by ABA PayWay KHQR'}</p>
            </div>
          </>
        )}

        {/* ─── QR STEP ─── */}
        {step === 'qr' && (
          <>
            <div className="px-4 pb-2 pt-4">
              {/* QR section header */}
              <div className="mb-3 text-center">
                <p className="flex items-center justify-center gap-1.5 text-[12px] font-bold text-white">
                  <QrCode size={14} className="text-[#E8A94A]" />
                  {km ? 'ស្វែង និង គ្រូទុក QR' : 'Scan or Save QR'}
                </p>
                <p className="mx-auto mt-1 max-w-[280px] text-[10px] leading-relaxed text-white/45">
                  {t.subStep2Desc}
                </p>
              </div>

              {/* Full-width QR card */}
              <div className="overflow-hidden rounded-2xl bg-white shadow-2xl">
                <img
                  src={PLAN_QR[selected]}
                  alt="KHQR Payment"
                  className="h-auto w-full object-contain"
                  style={{ display: 'block' }}
                />
              </div>

              {/* Action buttons row */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={saveQr}
                  className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-[12px] font-semibold text-white/85 transition hover:bg-white/10"
                  style={{ border: '1.5px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)' }}
                >
                  <Download size={14} />
                  {km ? 'រក្សាទុក QR' : 'Save QR'}
                </button>
                <button
                  className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-[12px] font-bold text-black transition hover:brightness-105"
                  style={{ background: 'linear-gradient(90deg,#E8A94A,#C97A2E)' }}
                  disabled
                >
                  <Check size={16} strokeWidth={3} />
                </button>
              </div>

              {/* Share icon row */}
              <div className="mt-2 flex justify-center">
                <button
                  onClick={saveQr}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white/35 transition hover:text-white/60"
                >
                  <Share2 size={16} />
                </button>
              </div>
            </div>

            {/* Waiting / countdown section at bottom */}
            <div
              className="mx-4 mb-2 rounded-2xl px-4 py-3"
              style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}
            >
              <div className="flex items-center gap-3">
                {/* Mini circular countdown */}
                <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center">
                  <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 32 32">
                    <circle cx="16" cy="16" r="12" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                    <circle
                      cx="16" cy="16" r="12"
                      fill="none"
                      stroke={urgent ? '#EF4444' : '#E8A94A'}
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={`${circumference}`}
                      strokeDashoffset={`${circumference * (1 - progress)}`}
                      style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s ease' }}
                    />
                  </svg>
                  <span
                    className="text-[11px] font-black tabular-nums"
                    style={{ color: urgent ? '#EF4444' : '#E8A94A' }}
                  >
                    {secondsLeft}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold text-white/80">
                    <Loader2 size={11} className="animate-spin flex-shrink-0 text-[#0F8F72]" />
                    {t.subWaitingPayment ?? (km ? 'រង់ចាំការទូទាត់…' : 'Waiting for payment…')}
                  </p>
                  <p className="mt-0.5 text-[9.5px] text-white/35">
                    {t.subAutoUnlockNote ?? (km ? 'VIP ដោះសោស្វ័យប្រវត្តិពេល ABA បញ្ជាក់' : 'Auto-unlocks when ABA confirms')}
                  </p>
                </div>
              </div>
            </div>

            {/* Back button */}
            <button
              onClick={() => { stopTimers(); setStep('summary'); }}
              className="mb-1 flex items-center gap-1.5 px-4 py-2 text-[11px] text-white/40 transition hover:text-white/70"
            >
              <ArrowLeft size={13} />
              {km ? 'ចំហរភ្នំ' : 'Back'}
            </button>

            {/* Footer */}
            <div className="flex items-center justify-center gap-1.5 border-t border-white/5 py-3">
              <ShieldCheck size={10} className="text-white/25" />
              <p className="text-[9px] text-white/25">{t.subSecFooter ?? 'Secured checkout · Powered by ABA PayWay KHQR'}</p>
            </div>
          </>
        )}

        {/* ─── SUCCESS ─── */}
        {step === 'success' && (
          <div className="flex flex-col items-center px-5 py-10 text-center">
            <div
              className="mb-4 flex h-20 w-20 items-center justify-center rounded-full"
              style={{ background: 'radial-gradient(circle,rgba(34,197,94,0.22),rgba(34,197,94,0.05))' }}
            >
              <CheckCircle2 size={40} className="text-[#22C55E]" />
            </div>
            <p className="flex items-center gap-1.5 text-base font-bold text-white">
              <Crown size={15} fill="#E8A94A" strokeWidth={0} className="text-[#E8A94A]" />
              {t.subYourePremium}
            </p>
            <p className="mx-auto mt-2 max-w-[250px] text-[10.5px] leading-relaxed text-white/50">
              {t.subConfirmedDesc}
            </p>
            <button
              onClick={onClose}
              className="mt-5 rounded-xl px-8 py-3 text-sm font-bold text-white transition hover:brightness-105"
              style={{ background: 'linear-gradient(90deg,#0F8F72,#0B6E58)' }}
            >
              {t.subStartWatching}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
