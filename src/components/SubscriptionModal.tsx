import { useEffect, useRef, useState } from 'react';
import {
  X,
  Crown,
  Clock,
  QrCode,
  Download,
  Upload,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Zap,
  ShieldCheck,
  Sparkles,
  Calendar,
  DollarSign,
  Hash,
  FileText,
  Percent,
  Plus,
  Minus,
  ArrowRight,
  BadgeCheck,
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
  '2m': '/assets/images/subscription-1m.png',
  '6m': '/assets/images/subscription-1m.png',
  '1y': '/assets/images/subscription-1y.png',
};

const ABA_ICON = '/assets/images/aba-mobile-icon.png';

interface Props {
  onClose: () => void;
}

type PayMode = 'auto' | 'manual';
type AutoStatus = 'idle' | 'loading' | 'waiting' | 'confirmed' | 'expired' | 'error';

export default function SubscriptionModal({ onClose }: Props) {
  const { lang } = useLang();
  const t = appText[lang];
  const [selected, setSelected] = useState<PlanKey>('1y');
  const [payMode, setPayMode] = useState<PayMode>('auto');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const [transactionId, setTransactionId] = useState('');
  const [paymentDate, setPaymentDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [amountPaid, setAmountPaid] = useState('');
  const [discount, setDiscount] = useState('0');
  const [description, setDescription] = useState('');
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofUploading, setProofUploading] = useState(false);
  const proofInputRef = useRef<HTMLInputElement>(null);

  const [autoStatus, setAutoStatus] = useState<AutoStatus>('idle');
  const [autoQr, setAutoQr] = useState<{
    requestId: string;
    qrImage: string;
    abapayDeeplink?: string;
  } | null>(null);
  const [autoError, setAutoError] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimers = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  };

  useEffect(() => stopTimers, []);
  useEffect(() => {
    stopTimers();
    setAutoStatus('idle');
    setAutoQr(null);
    setAutoError('');
  }, [selected]);

  const startPolling = (requestId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const { data } = await supabase.functions.invoke('check-qr-status', {
        body: { requestId },
      });
      if (data?.status === 'confirmed') {
        stopTimers();
        setAutoStatus('confirmed');
        setSubmitted(true);
      } else if (data?.status === 'expired') {
        stopTimers();
        setAutoStatus('expired');
      }
    }, 3000);
  };

  const handleGenerateAutoQr = async () => {
    setAutoStatus('loading');
    setAutoError('');
    const { data, error } = await supabase.functions.invoke('create-qr-payment', {
      body: { plan: selected },
    });
    if (error || data?.error) {
      setAutoStatus('error');
      setAutoError(
        data?.error || data?.detail || error?.message || 'Something went wrong',
      );
      return;
    }
    setAutoQr({
      requestId: data.requestId,
      qrImage: data.qrImage,
      abapayDeeplink: data.abapayDeeplink,
    });
    setSecondsLeft(data.expiresInSeconds || 900);
    setAutoStatus('waiting');
    startPolling(data.requestId);

    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const formatCountdown = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const selectedPlan = PLANS.find((p) => p.key === selected)!;
  const effectiveAmount =
    amountPaid.trim() === '' ? selectedPlan.price : parseFloat(amountPaid) || 0;
  const discountVal = parseFloat(discount) || 0;
  const finalAmount = Math.max(effectiveAmount - discountVal, 0);

  const openDetails = () => {
    setAmountPaid(String(selectedPlan.price));
    setShowDetails(true);
  };

  const handleProofUpload = async (rawFile: File) => {
    setProofUploading(true);
    setError('');
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setProofUploading(false);
      return;
    }
    const ext = rawFile.name.split('.').pop() || 'jpg';
    const path = `subscription-proofs/${userData.user.id}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, rawFile, { upsert: true });
    if (uploadError) {
      setProofUploading(false);
      setError(uploadError.message);
      return;
    }
    const { data: pubData } = supabase.storage
      .from('avatars')
      .getPublicUrl(path);
    setProofUrl(pubData.publicUrl);
    setProofUploading(false);
    setShowDetails(true);
  };

  const handleSaveQr = () => {
    const a = document.createElement('a');
    a.href = PLAN_QR[selected];
    a.download = `nint-anime-payment-qr-${selected}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleConfirmPaid = async () => {
    setError('');
    setBusy(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error: insertError } = await supabase
      .from('subscription_requests')
      .insert({
        user_id: userData.user?.id,
        plan: selectedPlan.key,
        amount: finalAmount,
        discount: discountVal,
        description: description.trim() || null,
        transaction_id: transactionId.trim() || null,
        payment_date: paymentDate,
        proof_url: proofUrl,
      });
    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setSubmitted(true);
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(6,6,10,0.85)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm max-h-[92vh] overflow-y-auto rounded-[28px] text-white shadow-2xl"
        style={{
          background: '#101018',
          border: '1px solid rgba(255,210,63,0.18)',
          boxShadow:
            '0 30px 80px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.03), 0 0 60px rgba(255,77,94,0.08)',
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
          <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-[#FFD23F]/10 blur-3xl" />
          <div className="pointer-events-none absolute -left-10 top-10 h-32 w-32 rounded-full bg-[#FF4D5E]/15 blur-3xl" />
          <button
            onClick={onClose}
            className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            <X size={17} />
          </button>
          <div className="relative flex flex-col items-center pt-2 text-center">
            <div
              className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl p-2.5"
              style={{
                background: 'linear-gradient(145deg, #FFE27A 0%, #FFD23F 45%, #E8A917 100%)',
                boxShadow: '0 8px 28px rgba(255,210,63,0.4), 0 0 0 1px rgba(255,255,255,0.15) inset',
              }}
            >
              <img
                src={LOGO_URL}
                alt="NINT ANIME"
                className="h-full w-full object-contain"
                onError={(e) => {
                  // Fall back to the crown mark if the logo asset is missing
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
            <p
              className="flex items-center gap-1.5 text-lg font-extrabold tracking-wide"
              style={{ fontFamily: '"Bebas Neue", Battambang, Inter, sans-serif', letterSpacing: '0.03em' }}
            >
              <Crown size={17} className="text-[#FFD23F]" fill="#FFD23F" strokeWidth={0} />
              {t.subGoPremium}
            </p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <Sparkles size={12} className="text-[#FFD23F]" />
              <p className="text-[11px] text-white/55">{t.subTagline}</p>
            </div>
          </div>
        </div>

        <div className="p-4">
          {!submitted ? (
            <>
              {/* Plan cards */}
              <div className="mb-4 grid grid-cols-2 gap-2.5">
                {PLANS.map((p) => {
                  const isSelected = selected === p.key;
                  return (
                    <button
                      key={p.key}
                      onClick={() => {
                        setSelected(p.key);
                        setShowDetails(false);
                      }}
                      className="relative rounded-2xl p-3 text-center transition-all duration-200"
                      style={{
                        border: isSelected
                          ? '1.5px solid #FFD23F'
                          : '1.5px solid rgba(255,255,255,0.08)',
                        background: isSelected
                          ? 'linear-gradient(160deg, rgba(255,210,63,0.14) 0%, rgba(255,77,94,0.08) 100%)'
                          : 'rgba(255,255,255,0.02)',
                        transform: isSelected ? 'translateY(-2px)' : 'none',
                        boxShadow: isSelected
                          ? '0 8px 20px rgba(255,210,63,0.15)'
                          : 'none',
                      }}
                    >
                      {p.tagKey && (
                        <span
                          className="absolute -top-2.5 left-1/2 flex -translate-x-1/2 items-center gap-0.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-wide text-black"
                          style={{
                            background: 'linear-gradient(90deg, #FFD23F, #FFB020)',
                          }}
                        >
                          <Sparkles size={7} />
                          {t[p.tagKey]}
                        </span>
                      )}
                      <p className="mt-1 text-[11px] font-semibold text-white/80">
                        {t[p.labelKey]}
                      </p>
                      <p
                        className="mt-0.5 text-xl font-extrabold"
                        style={{ color: isSelected ? '#FFD23F' : '#FF4D5E' }}
                      >
                        ${p.price}
                      </p>
                      <p className="text-[10px] text-white/35">
                        ${(p.price / p.months).toFixed(2)}{t.subPerMonth}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Amount summary */}
              <div
                className="mb-3 flex items-center justify-between rounded-2xl px-4 py-3"
                style={{
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.03)',
                }}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-xl"
                    style={{ background: 'linear-gradient(145deg,#FF6B7A,#E63946)' }}
                  >
                    <DollarSign size={16} className="text-white" />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-white/45">
                      {t.subTotalDue}
                    </p>
                    <p className="text-[10px] text-white/45">{t[selectedPlan.labelKey]}</p>
                  </div>
                </div>
                <p className="text-2xl font-extrabold text-white">
                  ${selectedPlan.price}
                </p>
              </div>

              {/* Payment mode tabs */}
              <div className="mb-3 flex gap-1.5 rounded-xl bg-white/[0.04] p-1">
                <button
                  onClick={() => setPayMode('auto')}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-bold transition-all ${
                    payMode === 'auto' ? 'text-black' : 'text-white/50'
                  }`}
                  style={
                    payMode === 'auto'
                      ? { background: 'linear-gradient(90deg,#FFD23F,#FFB020)' }
                      : undefined
                  }
                >
                  <Zap size={13} className={payMode === 'auto' ? 'text-black' : ''} />
                  {t.subInstantUnlock}
                </button>
                <button
                  onClick={() => setPayMode('manual')}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-bold transition-all ${
                    payMode === 'manual'
                      ? 'bg-[#FF4D5E] text-white'
                      : 'text-white/50'
                  }`}
                >
                  <QrCode size={13} />
                  {t.subManual}
                </button>
              </div>

              {/* AUTO PAY — premium instant-unlock flow */}
              {payMode === 'auto' && (
                <div
                  className="mb-3 rounded-2xl p-4"
                  style={{
                    border: '1px solid rgba(255,210,63,0.15)',
                    background:
                      'linear-gradient(160deg, rgba(255,210,63,0.05) 0%, rgba(255,255,255,0.02) 100%)',
                  }}
                >
                  <div className="mb-3 flex items-center justify-center gap-1.5">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#22C55E]/15">
                      <ShieldCheck size={13} className="text-[#22C55E]" />
                    </div>
                    <p className="text-[11px] font-bold text-white">
                      {t.subPayWithKhqr}
                    </p>
                  </div>

                  {autoStatus === 'idle' && (
                    <div className="text-center">
                      <p className="mb-3 text-[10px] leading-relaxed text-white/50">
                        {t.subPayWithKhqrDesc}
                      </p>
                      <button
                        onClick={handleGenerateAutoQr}
                        className="flex w-full items-center justify-center gap-1.5 rounded-xl py-3 text-xs font-bold text-black transition hover:opacity-90"
                        style={{ background: 'linear-gradient(90deg,#FFD23F,#FFB020)' }}
                      >
                        <Zap size={14} />
                        {t.subGenerateQr}
                      </button>

                      <div className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5">
                        <img
                          src={ABA_ICON}
                          alt="ABA Mobile"
                          className="h-7 w-7 rounded-[7px] object-cover"
                        />
                        <p className="text-left text-[10px] leading-tight text-white/45">
                          {t.subWorksWithAba}{' '}
                          <span className="font-semibold text-white/70">ABA Mobile</span>
                          {' '}{t.subAndAnyKhqr}
                        </p>
                      </div>
                    </div>
                  )}

                  {autoStatus === 'loading' && (
                    <div className="mx-auto flex h-40 w-40 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/10">
                      <Loader2 size={28} className="animate-spin text-[#FFD23F]" />
                      <p className="text-[10px] text-white/50">{t.subGeneratingQr}</p>
                    </div>
                  )}

                  {autoStatus === 'waiting' && autoQr && (
                    <>
                      <div className="mb-3 flex justify-center">
                        <div className="relative">
                          <img
                            src={autoQr.qrImage}
                            alt="Payment QR"
                            className="h-44 w-44 rounded-2xl border-2 border-[#FFD23F]/40 bg-white p-2 object-contain"
                          />
                          <div className="absolute -inset-1 animate-pulse rounded-2xl border-2 border-[#FFD23F]/30" />
                        </div>
                      </div>
                      <div className="mb-3 flex items-center justify-center gap-1.5">
                        <Loader2 size={12} className="animate-spin text-[#FFD23F]" />
                        <p className="text-[10px] font-semibold text-white">
                          {t.subAutoVerifying} ({formatCountdown(secondsLeft)})
                        </p>
                      </div>

                      {/* Prominent ABA Mobile deep link */}
                      {autoQr.abapayDeeplink && (
                        <a
                          href={autoQr.abapayDeeplink}
                          className="mb-2 flex w-full items-center gap-3 rounded-xl px-3 py-3 transition hover:opacity-90"
                          style={{
                            background: 'linear-gradient(135deg, #14707F 0%, #0C5261 100%)',
                            boxShadow: '0 6px 18px rgba(15,95,123,0.35)',
                          }}
                        >
                          <img
                            src={ABA_ICON}
                            alt="ABA Mobile"
                            className="h-9 w-9 rounded-[9px] object-cover"
                          />
                          <span className="flex-1 text-left">
                            <span className="block text-[12px] font-bold text-white">
                              {t.subOpenAba}
                            </span>
                            <span className="block text-[9.5px] text-white/70">
                              {t.subPayOneTap}
                            </span>
                          </span>
                          <ArrowRight size={16} className="text-white/80" />
                        </a>
                      )}
                      <p className="text-center text-[9.5px] text-white/35">
                        {t.subAlreadyPaidHint}
                      </p>
                    </>
                  )}

                  {autoStatus === 'expired' && (
                    <div className="py-2 text-center">
                      <p className="mb-3 text-[11px] text-[#EF4444]">
                        {t.subQrExpired}
                      </p>
                      <button
                        onClick={handleGenerateAutoQr}
                        className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold text-black transition hover:opacity-90"
                        style={{ background: 'linear-gradient(90deg,#FFD23F,#FFB020)' }}
                      >
                        <RefreshCw size={13} />
                        {t.subGenerateNewQr}
                      </button>
                    </div>
                  )}

                  {autoStatus === 'error' && (
                    <div className="py-2 text-center">
                      <p className="mb-3 text-[11px] text-[#EF4444]">{autoError}</p>
                      <button
                        onClick={handleGenerateAutoQr}
                        className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold text-black transition hover:opacity-90"
                        style={{ background: 'linear-gradient(90deg,#FFD23F,#FFB020)' }}
                      >
                        <RefreshCw size={13} />
                        {t.subTryAgain}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* MANUAL PAY */}
              {payMode === 'manual' && (
                <div className="mb-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="mb-3 flex items-center justify-center gap-1.5">
                    <QrCode size={14} className="text-[#FF4D5E]" />
                    <p className="text-[11px] font-bold text-white">Scan to Pay</p>
                  </div>
                  <div className="mb-3 flex justify-center">
                    <img
                      key={selected}
                      src={PLAN_QR[selected]}
                      alt="Payment QR"
                      className="h-40 w-40 rounded-2xl border-2 border-[#FF4D5E]/30 bg-white p-2 object-contain"
                    />
                  </div>

                  <div className="mb-1.5 grid grid-cols-2 gap-2">
                    <button
                      onClick={handleSaveQr}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 py-2.5 text-[11px] font-semibold text-white transition hover:bg-white/5"
                    >
                      <Download size={13} />
                      {t.subSaveQr}
                    </button>
                    <input
                      ref={proofInputRef}
                      type="file"
                      accept="image/*"
                      disabled={proofUploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleProofUpload(file);
                      }}
                      className="hidden"
                    />
                    <button
                      onClick={() => proofInputRef.current?.click()}
                      disabled={proofUploading}
                      className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[11px] font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                      style={{
                        backgroundColor: proofUrl ? '#22C55E' : '#FF4D5E',
                      }}
                    >
                      {proofUploading ? (
                        t.subUploadingProof
                      ) : proofUrl ? (
                        <>
                          <CheckCircle2 size={13} />
                          {t.subVerified}
                        </>
                      ) : (
                        <>
                          <Upload size={13} />
                          {t.subUploadProof}
                        </>
                      )}
                    </button>
                  </div>

                  {/* Payment details accordion */}
                  <div className="mt-2 overflow-hidden rounded-xl border border-white/10">
                    <button
                      onClick={() =>
                        showDetails ? setShowDetails(false) : openDetails()
                      }
                      className="flex w-full items-center justify-between px-3 py-2.5"
                    >
                      <span className="text-[11px] font-bold text-white">
                        {t.subPaymentDetails}
                      </span>
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/5">
                        {showDetails ? (
                          <Minus size={14} className="text-white" />
                        ) : (
                          <Plus size={14} className="text-white" />
                        )}
                      </span>
                    </button>

                    {showDetails && (
                      <div
                        className="space-y-2.5 px-3 pb-3"
                        style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
                      >
                        <div className="pt-2.5">
                          <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-white/70">
                            <Calendar size={12} /> {t.subPaymentDate}
                          </label>
                          <input
                            type="date"
                            value={paymentDate}
                            onChange={(e) => setPaymentDate(e.target.value)}
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-white outline-none"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-white/70">
                              <DollarSign size={12} /> {t.subAmountPaid}
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={amountPaid}
                              onChange={(e) => setAmountPaid(e.target.value)}
                              className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-white outline-none"
                            />
                          </div>
                          <div>
                            <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-white/70">
                              <Percent size={12} /> {t.subDiscount}
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={discount}
                              onChange={(e) => setDiscount(e.target.value)}
                              className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-white outline-none"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-white/70">
                            <FileText size={12} /> {t.subDescription}
                          </label>
                          <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={2}
                            placeholder={t.subDescriptionPlaceholder}
                            className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-white outline-none"
                          />
                        </div>
                        <div>
                          <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-white/70">
                            <Hash size={12} /> {t.subTransactionId}
                          </label>
                          <input
                            value={transactionId}
                            onChange={(e) => setTransactionId(e.target.value)}
                            placeholder={t.subTransactionPlaceholder}
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-white outline-none"
                          />
                        </div>
                        <div
                          className="flex justify-between pt-1 text-[11px]"
                          style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
                        >
                          <span className="text-white/50">{t.subTotalDue}</span>
                          <span className="font-extrabold text-[#FF4D5E]">
                            ${finalAmount.toFixed(2)}
                          </span>
                        </div>
                        {error && (
                          <p className="text-center text-xs text-[#EF4444]">{error}</p>
                        )}
                        <button
                          onClick={handleConfirmPaid}
                          disabled={busy}
                          className="w-full rounded-xl bg-[#22C55E] py-2.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-60"
                        >
                          {busy ? t.subSending : t.subConfirmPaid}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-center gap-1.5 pb-1 pt-1">
                <BadgeCheck size={11} className="text-white/30" />
                <p className="text-[9.5px] text-white/30">
                  {t.subSecuredCheckout}
                </p>
              </div>
            </>
          ) : (
            <div className="py-8 text-center">
              <div
                className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full"
                style={{
                  background:
                    autoStatus === 'confirmed'
                      ? 'radial-gradient(circle, rgba(255,210,63,0.25) 0%, rgba(34,197,94,0.08) 70%)'
                      : 'rgba(255,77,94,0.15)',
                }}
              >
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-full ${
                    autoStatus === 'confirmed' ? 'bg-[#22C55E]/20' : 'bg-[#FF4D5E]/15'
                  }`}
                >
                  <CheckCircle2
                    size={32}
                    className={
                      autoStatus === 'confirmed' ? 'text-[#22C55E]' : 'text-[#FF4D5E]'
                    }
                  />
                </div>
              </div>
              <p className="mt-1 flex items-center justify-center gap-1.5 text-sm font-bold text-white">
                {autoStatus === 'confirmed' && (
                  <Crown size={15} className="text-[#FFD23F]" fill="#FFD23F" strokeWidth={0} />
                )}
                {autoStatus === 'confirmed' ? t.subYourePremium : t.subRequestReceived}
              </p>
              <p className="mt-1.5 px-6 text-xs leading-relaxed text-white/50">
                {autoStatus === 'confirmed' ? t.subConfirmedDesc : t.subPendingDesc}
              </p>
              <button
                onClick={onClose}
                className="mt-4 rounded-xl px-6 py-2.5 text-xs font-bold text-black transition hover:opacity-90"
                style={{ background: 'linear-gradient(90deg,#FFD23F,#FFB020)' }}
              >
                {autoStatus === 'confirmed' ? t.subStartWatching : t.subCloseBtn}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
