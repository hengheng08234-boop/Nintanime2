import { useEffect, useRef, useState } from 'react';
import {
  X,
  Crown,
  QrCode,
  Download,
  CheckCircle2,
  Loader2,
  Sparkles,
  DollarSign,
  BadgeCheck,
  RefreshCw,
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

const COUNTDOWN_SECONDS = 30;
const POLL_INTERVAL_MS = 3000;

interface Props {
  onClose: () => void;
}

type Step = 'summary' | 'qr' | 'waiting' | 'success' | 'timeout';

export default function SubscriptionModal({ onClose }: Props) {
  const { lang } = useLang();
  const t = appText[lang];

  const [selected, setSelected] = useState<PlanKey>('1y');
  const [step, setStep] = useState<Step>('summary');
  const [error, setError] = useState('');
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const [qrSaved, setQrSaved] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedPlan = PLANS.find((p) => p.key === selected)!;

  const stopTimers = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  };

  useEffect(() => stopTimers, []);

  // Reset when plan changes
  useEffect(() => {
    stopTimers();
    setStep('summary');
    setError('');
    setPendingRequestId(null);
    setQrSaved(false);
    setSecondsLeft(COUNTDOWN_SECONDS);
  }, [selected]);

  const startCountdownAndPoll = (requestId: string) => {
    setPendingRequestId(requestId);
    setSecondsLeft(COUNTDOWN_SECONDS);
    setStep('waiting');

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

  const handlePay = async () => {
    setError('');
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setError(t.subNotSignedIn);
        return;
      }
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

      if (insertError || !data) {
        setError(insertError?.message || t.subQrGenericError);
        return;
      }

      setPendingRequestId(data.id);
      setStep('qr');
    } catch (err) {
      setError(err instanceof Error ? err.message : t.subQrGenericError);
    }
  };

  const handleSaveQr = () => {
    const a = document.createElement('a');
    a.href = PLAN_QR[selected];
    a.download = `nint-anime-payment-qr-${selected}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setQrSaved(true);
  };

  const handleStartWaiting = () => {
    if (!pendingRequestId) return;
    startCountdownAndPoll(pendingRequestId);
  };

  const handleRetry = async () => {
    stopTimers();
    setQrSaved(false);
    setSecondsLeft(COUNTDOWN_SECONDS);
    // Create a new request for retry
    setError('');
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setError(t.subNotSignedIn);
        return;
      }
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

      if (insertError || !data) {
        setError(insertError?.message || t.subQrGenericError);
        return;
      }

      setPendingRequestId(data.id);
      setStep('qr');
    } catch (err) {
      setError(err instanceof Error ? err.message : t.subQrGenericError);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(6,6,10,0.85)', backdropFilter: 'blur(8px)' }}
      onClick={step === 'waiting' ? undefined : onClose}
    >
      <div
        className="relative w-full max-w-sm max-h-[92vh] overflow-y-auto rounded-[28px] text-white shadow-2xl"
        style={{
          background: '#101018',
          border: '1px solid rgba(232,169,74,0.18)',
          boxShadow:
            '0 30px 80px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.03), 0 0 60px rgba(15,143,114,0.08)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="relative overflow-hidden px-5 pb-6 pt-5"
          style={{
            background:
              'radial-gradient(120% 140% at 50% -20%, #262035 0%, #171626 45%, #0d0d16 100%)',
          }}
        >
          <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-[#E8A94A]/10 blur-3xl" />
          <div className="pointer-events-none absolute -left-10 top-10 h-32 w-32 rounded-full bg-[#0F8F72]/15 blur-3xl" />
          {step !== 'waiting' && (
            <button
              onClick={onClose}
              className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              <X size={17} />
            </button>
          )}
          <div className="relative flex flex-col items-center pt-2 text-center">
            <div className="mb-3 flex h-24 w-24 items-center justify-center">
              <img
                src={LOGO_URL}
                alt="NINT ANIME"
                className="h-full w-full object-contain drop-shadow-[0_6px_18px_rgba(232,169,74,0.35)]"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            </div>
            <p
              className="flex items-center gap-1.5 text-lg font-extrabold tracking-wide"
              style={{ fontFamily: '"Bebas Neue", Battambang, Inter, sans-serif', letterSpacing: '0.03em' }}
            >
              <Crown size={17} className="text-[#E8A94A]" fill="#E8A94A" strokeWidth={0} />
              {t.subGoPremium}
            </p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <Sparkles size={12} className="text-[#E8A94A]" />
              <p className="text-[11px] text-white/55">{t.subTagline}</p>
            </div>
          </div>
        </div>

        <div className="p-4">
          {/* Plan picker — visible on summary and qr steps */}
          {(step === 'summary' || step === 'qr') && (
            <>
              <div className="mb-4 grid grid-cols-2 gap-2.5">
                {PLANS.map((p) => {
                  const isSelected = selected === p.key;
                  return (
                    <button
                      key={p.key}
                      onClick={() => setSelected(p.key)}
                      className="relative rounded-2xl p-3 text-center transition-all duration-200"
                      style={{
                        border: isSelected ? '1.5px solid #E8A94A' : '1.5px solid rgba(255,255,255,0.08)',
                        background: isSelected
                          ? 'linear-gradient(160deg, rgba(232,169,74,0.14) 0%, rgba(15,143,114,0.08) 100%)'
                          : 'rgba(255,255,255,0.02)',
                        transform: isSelected ? 'translateY(-2px)' : 'none',
                        boxShadow: isSelected ? '0 8px 20px rgba(232,169,74,0.15)' : 'none',
                      }}
                    >
                      {p.tagKey && (
                        <span
                          className="absolute -top-2.5 left-1/2 flex -translate-x-1/2 items-center gap-0.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-wide text-black"
                          style={{ background: 'linear-gradient(90deg, #E8A94A, #C97A2E)' }}
                        >
                          <Sparkles size={7} />
                          {t[p.tagKey]}
                        </span>
                      )}
                      <p className="mt-1 text-[11px] font-semibold text-white/80">{t[p.labelKey]}</p>
                      <p className="mt-0.5 text-xl font-extrabold" style={{ color: isSelected ? '#E8A94A' : '#0F8F72' }}>
                        ${p.price}
                      </p>
                      <p className="text-[10px] text-white/35">
                        ${(p.price / p.months).toFixed(2)}{t.subPerMonth}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div
                className="mb-4 flex items-center justify-between rounded-2xl px-4 py-3"
                style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-xl"
                    style={{ background: 'linear-gradient(145deg,#3FD8B0,#0B6E58)' }}
                  >
                    <DollarSign size={16} className="text-white" />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-white/45">{t.subTotalDue}</p>
                    <p className="text-[10px] text-white/45">{t[selectedPlan.labelKey]}</p>
                  </div>
                </div>
                <p className="text-2xl font-extrabold text-white">${selectedPlan.price}</p>
              </div>
            </>
          )}

          {/* STEP: summary */}
          {step === 'summary' && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-center">
              <div className="mb-2 flex items-center justify-center gap-1.5">
                <QrCode size={14} className="text-[#0F8F72]" />
                <p className="text-[11px] font-bold text-white">{t.subScanToPay}</p>
              </div>
              <p className="mb-3 px-2 text-[10.5px] leading-relaxed text-white/50">{t.subManualIntro}</p>
              {error && <p className="mb-2 text-[10.5px] text-[#EF4444]">{error}</p>}
              <button
                onClick={handlePay}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl py-3 text-xs font-bold text-black transition hover:opacity-90"
                style={{ background: 'linear-gradient(90deg,#E8A94A,#C97A2E)' }}
              >
                <Crown size={14} />
                {t.subPayNow}
              </button>
            </div>
          )}

          {/* STEP: qr — show QR, save button, then start 30s window */}
          {step === 'qr' && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <div className="mb-2 flex items-center justify-center gap-1.5">
                <QrCode size={14} className="text-[#0F8F72]" />
                <p className="text-[11px] font-bold text-white">{t.subStep2Title}</p>
              </div>
              <p className="mb-3 px-2 text-center text-[10px] leading-relaxed text-white/50">
                {t.subStep2Desc}
              </p>

              {/* QR image */}
              <div className="flex flex-col items-center py-1">
                <img
                  src={PLAN_QR[selected]}
                  alt="Payment QR"
                  className="h-64 w-64 rounded-2xl bg-white p-2 object-contain shadow-lg"
                />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={handleSaveQr}
                  className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[11px] font-semibold transition ${
                    qrSaved
                      ? 'border border-[#22C55E]/40 bg-[#22C55E]/10 text-[#22C55E]'
                      : 'border border-white/10 text-white hover:bg-white/5'
                  }`}
                >
                  <Download size={13} />
                  {qrSaved ? '✓ Saved' : t.subSaveQr}
                </button>
                <button
                  onClick={handleStartWaiting}
                  className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[11px] font-bold text-black transition hover:opacity-90"
                  style={{ background: 'linear-gradient(90deg,#E8A94A,#C97A2E)' }}
                >
                  <Clock size={13} />
                  {lang === 'km' ? 'ខ្ញុំបានទូទាត់' : "I've Paid"}
                </button>
              </div>
            </div>
          )}

          {/* STEP: waiting — 30 second countdown */}
          {step === 'waiting' && (
            <div className="rounded-2xl p-5 text-center" style={{ border: '1px solid rgba(232,169,74,0.25)', background: 'rgba(232,169,74,0.06)' }}>
              {/* Big countdown circle */}
              <div className="relative mx-auto mb-4 flex h-28 w-28 items-center justify-center">
                <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 112 112">
                  <circle cx="56" cy="56" r="50" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
                  <circle
                    cx="56" cy="56" r="50"
                    fill="none"
                    stroke={secondsLeft > 10 ? '#E8A94A' : '#EF4444'}
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 50}`}
                    strokeDashoffset={`${2 * Math.PI * 50 * (1 - secondsLeft / COUNTDOWN_SECONDS)}`}
                    style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s ease' }}
                  />
                </svg>
                <div className="flex flex-col items-center">
                  <span
                    className="text-4xl font-black tabular-nums"
                    style={{ color: secondsLeft > 10 ? '#E8A94A' : '#EF4444' }}
                  >
                    {secondsLeft}
                  </span>
                  <span className="text-[10px] text-white/50">{lang === 'km' ? 'វិនាទី' : 'sec'}</span>
                </div>
              </div>

              <p className="text-sm font-bold text-white">
                {lang === 'km' ? 'រង់ចាំការបញ្ជាក់…' : 'Waiting for confirmation…'}
              </p>
              <p className="mt-1.5 px-3 text-[10.5px] leading-relaxed text-white/55">
                {lang === 'km'
                  ? 'បន្ទាប់ពីអ្នកទូទាត់ ប្រព័ន្ធ Telegram នឹង unlock ដោយស្វ័យប្រវត្តិ ក្នុង ៣០ វិនាទីនេះ'
                  : 'After you pay, the Telegram system will unlock automatically within these 30 seconds'}
              </p>

              <div className="mt-3 flex items-center justify-center gap-1.5">
                <Loader2 size={12} className="animate-spin text-[#E8A94A]" />
                <p className="text-[10px] text-white/60">
                  {lang === 'km' ? 'កំពុងស្ទាក់ចាំ…' : 'Listening for payment…'}
                </p>
              </div>
            </div>
          )}

          {/* STEP: timeout — 30s expired, offer retry */}
          {step === 'timeout' && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/5">
                <Clock size={26} className="text-white/50" />
              </div>
              <p className="text-sm font-bold text-white">
                {lang === 'km' ? 'រយៈពេល ៣០ វិនាទីបានផុត' : '30 seconds expired'}
              </p>
              <p className="mt-1.5 px-3 text-[10.5px] leading-relaxed text-white/50">
                {lang === 'km'
                  ? 'មិនទាន់ទទួលបានការបញ្ជាក់ទេ។ ប្រសិនបើអ្នកបានទូទាត់ហើយ សូមចុចទូទាត់ម្ដងទៀតដើម្បីបើក ៣០ វិនាទីថ្មី'
                  : 'No confirmation received. If you already paid, click pay again to open a new 30-second window.'}
              </p>
              {error && <p className="mt-2 text-[10.5px] text-[#EF4444]">{error}</p>}
              <button
                onClick={handleRetry}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl py-3 text-xs font-bold text-black transition hover:opacity-90"
                style={{ background: 'linear-gradient(90deg,#E8A94A,#C97A2E)' }}
              >
                <RefreshCw size={13} />
                {lang === 'km' ? 'ទូទាត់ម្ដងទៀត' : 'Pay Again'}
              </button>
              <button
                onClick={onClose}
                className="mt-2 w-full rounded-xl border border-white/10 py-2.5 text-[11px] font-semibold text-white/60 transition hover:bg-white/5"
              >
                {lang === 'km' ? 'បិទ' : 'Close'}
              </button>
            </div>
          )}

          {/* STEP: success */}
          {step === 'success' && (
            <div className="py-8 text-center">
              <div
                className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full"
                style={{ background: 'radial-gradient(circle, rgba(232,169,74,0.25) 0%, rgba(34,197,94,0.08) 70%)' }}
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#22C55E]/20">
                  <CheckCircle2 size={32} className="text-[#22C55E]" />
                </div>
              </div>
              <p className="mt-1 flex items-center justify-center gap-1.5 text-sm font-bold text-white">
                <Crown size={15} className="text-[#E8A94A]" fill="#E8A94A" strokeWidth={0} />
                {t.subYourePremium}
              </p>
              <p className="mt-1.5 px-6 text-xs leading-relaxed text-white/50">
                {t.subConfirmedDesc}
              </p>
              <button
                onClick={onClose}
                className="mt-4 rounded-xl px-6 py-2.5 text-xs font-bold text-black transition hover:opacity-90"
                style={{ background: 'linear-gradient(90deg,#E8A94A,#C97A2E)' }}
              >
                {t.subStartWatching}
              </button>
            </div>
          )}

          <div className="flex items-center justify-center gap-1.5 pb-1 pt-3">
            <BadgeCheck size={11} className="text-white/30" />
            <p className="text-[9.5px] text-white/30">{t.subSecuredCheckout}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
