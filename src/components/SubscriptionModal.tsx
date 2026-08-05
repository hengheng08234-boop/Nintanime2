import { useEffect, useRef, useState } from 'react';
import {
  X,
  Crown,
  CheckCircle2,
  Loader2,
  Sparkles,
  BadgeCheck,
  RefreshCw,
  Clock,
  Download,
  ScanLine,
  QrCode,
  ShieldCheck,
  Radio,
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

type Step = 'summary' | 'paying' | 'success' | 'timeout';

export default function SubscriptionModal({ onClose }: Props) {
  const { lang } = useLang();
  const t = appText[lang];
  const km = lang === 'km';

  const [selected, setSelected] = useState<PlanKey>('1y');
  const [step, setStep] = useState<Step>('summary');
  const [error, setError] = useState('');
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
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
    setPendingRequestId(requestId);
    setSecondsLeft(COUNTDOWN_SECONDS);
    setStep('paying');

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

  const canClose = step !== 'paying';
  const showPlans = step === 'summary';
  const showQr = step === 'paying' || step === 'timeout';
  const urgent = secondsLeft <= 10;
  const progress = secondsLeft / COUNTDOWN_SECONDS;
  const circumference = 2 * Math.PI * 46;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(6,6,10,0.88)', backdropFilter: 'blur(10px)' }}
      onClick={canClose ? onClose : undefined}
    >
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-[28px] text-white shadow-2xl"
        style={{
          background: '#101018',
          border: '1px solid rgba(232,169,74,0.15)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 60px rgba(15,143,114,0.07)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div
          className="relative overflow-hidden px-5 pb-5 pt-5"
          style={{ background: 'radial-gradient(120% 140% at 50% -20%, #262035 0%, #171626 50%, #0d0d16 100%)' }}
        >
          <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-[#E8A94A]/10 blur-3xl" />
          <div className="pointer-events-none absolute -left-10 top-8 h-32 w-32 rounded-full bg-[#0F8F72]/15 blur-3xl" />
          {canClose && (
            <button
              onClick={onClose}
              className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              <X size={17} />
            </button>
          )}
          <div className="relative flex flex-col items-center pt-1 text-center">
            <div className="mb-2.5 flex h-20 w-20 items-center justify-center">
              <img
                src={LOGO_URL}
                alt="NINT ANIME"
                className="h-full w-full object-contain drop-shadow-[0_6px_18px_rgba(232,169,74,0.3)]"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            </div>
            <p className="flex items-center gap-1.5 text-lg font-extrabold tracking-wide">
              <Crown size={16} className="text-[#E8A94A]" fill="#E8A94A" strokeWidth={0} />
              {t.subGoPremium}
            </p>
            <div className="mt-1 flex items-center gap-1.5">
              <Sparkles size={11} className="text-[#E8A94A]" />
              <p className="text-[10.5px] text-white/50">{t.subTagline}</p>
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="max-h-[72vh] overflow-y-auto p-4">

          {/* ── Plan selector (summary step only) ── */}
          {showPlans && (
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
                        ? 'linear-gradient(160deg,rgba(232,169,74,0.14),rgba(15,143,114,0.08))'
                        : 'rgba(255,255,255,0.02)',
                      transform: isSelected ? 'translateY(-2px)' : 'none',
                      boxShadow: isSelected ? '0 8px 20px rgba(232,169,74,0.15)' : 'none',
                    }}
                  >
                    {p.tagKey && (
                      <span
                        className="absolute -top-2.5 left-1/2 flex -translate-x-1/2 items-center gap-0.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-wide text-black"
                        style={{ background: 'linear-gradient(90deg,#E8A94A,#C97A2E)' }}
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
          )}

          {/* ── QR card (paying + timeout steps) ── */}
          {showQr && (
            <div
              className="mb-4 rounded-2xl p-4"
              style={{ border: '1px solid rgba(232,169,74,0.2)', background: 'rgba(232,169,74,0.04)' }}
            >
              {/* QR label */}
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <QrCode size={14} className="text-[#E8A94A]" />
                  <p className="text-[11px] font-bold uppercase tracking-widest text-[#E8A94A]/80">
                    KHQR · ABA
                  </p>
                </div>
                <p className="text-xl font-extrabold text-white">${selectedPlan.price}</p>
              </div>

              {/* QR image — stays visible for scanning */}
              <div className="relative mx-auto w-fit">
                <img
                  src={PLAN_QR[selected]}
                  alt="Payment QR"
                  className="h-56 w-56 rounded-2xl bg-white p-2 object-contain shadow-lg"
                />
                {step === 'paying' && (
                  <div className="absolute -bottom-1.5 left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-[#0F8F72] px-2.5 py-0.5 text-[9px] font-bold text-white shadow-lg">
                    <Radio size={9} className="animate-pulse" />
                    {km ? 'កំពុងស្ទាក់ចាំ…' : 'Listening…'}
                  </div>
                )}
              </div>

              {/* Scan hint */}
              <p className="mt-3 text-center text-[10px] text-white/40">
                <ScanLine size={10} className="mb-0.5 mr-0.5 inline" />
                {t.subScanHint}
              </p>

              {/* Save QR button */}
              <button
                onClick={saveQr}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] py-2.5 text-[11px] font-semibold text-white/85 transition hover:bg-white/[0.07]"
              >
                <Download size={13} />
                {t.subSaveOrScan}
              </button>
            </div>
          )}

          {/* ── Summary step: total + pay button ── */}
          {step === 'summary' && (
            <>
              <div
                className="mb-4 flex items-center justify-between rounded-2xl px-4 py-3"
                style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}
              >
                <div>
                  <p className="text-[10px] font-semibold text-white/45">{t.subTotalDue}</p>
                  <p className="text-[10px] text-white/45">{t[selectedPlan.labelKey]}</p>
                </div>
                <p className="text-2xl font-extrabold text-white">${selectedPlan.price}</p>
              </div>

              {error && <p className="mb-2 text-[10.5px] text-[#EF4444]">{error}</p>}

              <button
                onClick={handlePay}
                disabled={paying}
                className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-black transition hover:opacity-90 disabled:opacity-60"
                style={{ background: 'linear-gradient(90deg,#E8A94A,#C97A2E)' }}
              >
                {paying ? <Loader2 size={15} className="animate-spin" /> : <Crown size={15} />}
                {km ? 'ទូទាត់ & បង្ហាញ QR' : 'Pay & Show QR'}
              </button>
            </>
          )}

          {/* ── Paying step: countdown card ── */}
          {step === 'paying' && (
            <div
              className="rounded-2xl p-4"
              style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}
            >
              {/* countdown ring */}
              <div className="relative mx-auto mb-3 flex h-24 w-24 items-center justify-center">
                <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 108 108">
                  <circle cx="54" cy="54" r="46" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="5" />
                  <circle
                    cx="54" cy="54" r="46"
                    fill="none"
                    stroke={urgent ? '#EF4444' : '#E8A94A'}
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={`${circumference}`}
                    strokeDashoffset={`${circumference * (1 - progress)}`}
                    style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s ease' }}
                  />
                </svg>
                <div className="flex flex-col items-center">
                  <span
                    className="text-3xl font-black tabular-nums leading-none"
                    style={{ color: urgent ? '#EF4444' : '#E8A94A' }}
                  >
                    {secondsLeft}
                  </span>
                  <span className="mt-0.5 text-[9px] text-white/45">{km ? 'វិនាទី' : 'sec'}</span>
                </div>
              </div>

              <div className="text-center">
                <div className="flex items-center justify-center gap-1.5">
                  <Radio size={13} className="animate-pulse text-[#0F8F72]" />
                  <p className="text-[12px] font-bold text-white">{t.subListeningTitle}</p>
                </div>
                <p className="mx-auto mt-1.5 max-w-[250px] text-[10px] leading-relaxed text-white/50">
                  {t.subListeningDesc}
                </p>
              </div>

              <div className="mt-3 flex items-center justify-center gap-1.5">
                <Loader2 size={11} className="animate-spin text-[#E8A94A]" />
                <p className="text-[10px] text-white/50">
                  {km ? 'កំពុងស្ទាក់ចាំការបញ្ជាក់ពី ABA…' : 'Waiting for ABA confirmation…'}
                </p>
              </div>
            </div>
          )}

          {/* ── Timeout step: retry card ── */}
          {step === 'timeout' && (
            <div
              className="rounded-2xl p-4 text-center"
              style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}
            >
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/5">
                <Clock size={26} className="text-white/45" />
              </div>
              <p className="text-[13px] font-bold text-white">{t.subTimeoutTitle}</p>
              <p className="mx-auto mt-1.5 max-w-[260px] text-[10.5px] leading-relaxed text-white/50">
                {t.subTimeoutDesc}
              </p>
              {error && <p className="mt-2 text-[10.5px] text-[#EF4444]">{error}</p>}
              <button
                onClick={handleRetry}
                disabled={paying}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl py-3.5 text-sm font-bold text-black transition hover:opacity-90 disabled:opacity-60"
                style={{ background: 'linear-gradient(90deg,#E8A94A,#C97A2E)' }}
              >
                {paying ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {t.subPayAgain}
              </button>
              <button
                onClick={onClose}
                className="mt-2 w-full rounded-xl border border-white/10 py-2.5 text-[11px] font-semibold text-white/55 transition hover:bg-white/5"
              >
                {km ? 'បិទ' : 'Close'}
              </button>
            </div>
          )}

          {/* ── Success step ── */}
          {step === 'success' && (
            <div className="flex flex-col items-center py-6 text-center">
              <div
                className="mb-3 flex h-20 w-20 items-center justify-center rounded-full"
                style={{ background: 'radial-gradient(circle,rgba(34,197,94,0.22),rgba(34,197,94,0.05))' }}
              >
                <CheckCircle2 size={40} className="text-[#22C55E]" />
              </div>
              <p className="flex items-center gap-1.5 text-sm font-bold text-white">
                <Crown size={15} className="text-[#E8A94A]" fill="#E8A94A" strokeWidth={0} />
                {t.subYourePremium}
              </p>
              <p className="mx-auto mt-1.5 max-w-[250px] text-[10.5px] leading-relaxed text-white/50">
                {t.subConfirmedDesc}
              </p>
              <button
                onClick={onClose}
                className="mt-4 rounded-xl px-8 py-3 text-sm font-bold text-black transition hover:opacity-90"
                style={{ background: 'linear-gradient(90deg,#E8A94A,#C97A2E)' }}
              >
                {t.subStartWatching}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-1.5 px-4 pb-4 pt-1">
          <ShieldCheck size={10} className="text-white/25" />
          <p className="text-[9px] text-white/25">{t.subSecAuto}</p>
        </div>
      </div>
    </div>
  );
}
