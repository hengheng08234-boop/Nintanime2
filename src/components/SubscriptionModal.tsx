import { useEffect, useRef, useState } from 'react';
import {
  X,
  Crown,
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
  BadgeCheck,
  Lock,
  Gift,
  ImagePlus,
  XCircle,
  ArrowLeft,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/supabaseClient';
import { useLang } from '@/lib/useLang';
import { appText } from '@/lib/appTranslations';
import { verifyReceiptScreenshot, RECEIPT_MATCH_PHRASE } from '@/lib/receiptOcr';

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

const ABA_ICON = '/assets/images/aba-mobile-icon.png';

function QrPaymentCard({ qrSrc, amount }: { qrSrc: string; amount: number }) {
  return (
    <div className="flex flex-col items-center py-1">
      <img
        src={LOGO_URL}
        alt="NINT ANIME"
        className="h-16 w-16 object-contain drop-shadow-[0_6px_18px_rgba(232,169,74,0.35)]"
      />
      <p
        className="mt-2 text-sm font-extrabold uppercase tracking-wide text-white"
        style={{ fontFamily: '"Bebas Neue", Battambang, Inter, sans-serif', letterSpacing: '0.06em' }}
      >
        Nint Anime
      </p>
      <p className="mt-0.5 text-2xl font-extrabold text-[#E8A94A]">
        ${amount.toFixed(2)}
      </p>
      <img
        key={qrSrc}
        src={qrSrc}
        alt="Payment QR"
        className="mt-3 h-48 w-48 rounded-2xl bg-white p-2 object-contain"
      />
    </div>
  );
}

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

  // --- Smart manual flow: pay -> real sandbox QR -> notice -> go to ABA -> upload & OCR bonus ---
  type ManualStep = 'summary' | 'qr' | 'notice' | 'upload' | 'success' | 'failed';
  const [manualStep, setManualStep] = useState<ManualStep>('summary');
  const [abaUnlocked, setAbaUnlocked] = useState(false);
  const abaLockRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrError, setOcrError] = useState('');
  const manualFileInputRef = useRef<HTMLInputElement>(null);

  const stopManualTimers = () => {
    if (abaLockRef.current) clearTimeout(abaLockRef.current);
  };

  const stopTimers = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    stopManualTimers();
  };

  useEffect(() => stopTimers, []);
  useEffect(() => {
    stopTimers();
    setAutoStatus('idle');
    setAutoQr(null);
    setAutoError('');
    setManualStep('summary');
    setAbaUnlocked(false);
    setOcrError('');
  }, [selected]);

  useEffect(() => {
    stopManualTimers();
    setManualStep('summary');
    setAbaUnlocked(false);
    setOcrError('');
  }, [payMode]);

  const handleManualPayClick = async () => {
    setManualStep('qr');
    await handleGenerateAutoQr();
  };

  const handleManualQrSaved = () => {
    handleSaveQr();
    setManualStep('notice');
    setAbaUnlocked(false);

    if (abaLockRef.current) clearTimeout(abaLockRef.current);
    abaLockRef.current = setTimeout(() => setAbaUnlocked(true), 3000);
  };

  const handleGoToAba = () => {
    if (!abaUnlocked) return;
    if (autoQr?.abapayDeeplink) {
      window.location.href = autoQr.abapayDeeplink;
    }
    setManualStep('upload');
  };

  const handleManualFileSelected = async (file: File) => {
    setOcrBusy(true);
    setOcrError('');
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setOcrError('Not signed in');
        setOcrBusy(false);
        return;
      }

      const { matched, rawText } = await verifyReceiptScreenshot(file);

      const ext = file.name.split('.').pop() || 'jpg';
      const path = `subscription-proofs/${userData.user.id}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true });
      if (uploadError) {
        setOcrError(uploadError.message);
        setOcrBusy(false);
        return;
      }
      const { data: pubData } = supabase.storage.from('avatars').getPublicUrl(path);
      setProofUrl(pubData.publicUrl);

      if (!matched) {
        setOcrBusy(false);
        setManualStep('failed');
        return;
      }

      // The real sandbox payment may already have auto-confirmed via polling
      // while the user was uploading — don't double-confirm in that case.
      if (autoStatus === 'confirmed') {
        stopTimers();
        setOcrBusy(false);
        setManualStep('success');
        setSubmitted(true);
        return;
      }

      const { error: rpcError } = await supabase.rpc('confirm_subscription_via_ocr', {
        p_plan: selectedPlan.key,
        p_amount: selectedPlan.price,
        p_proof_url: pubData.publicUrl,
        p_ocr_text: rawText,
        p_bonus_days: 10,
      });

      setOcrBusy(false);
      if (rpcError) {
        setManualStep('failed');
        return;
      }
      stopTimers();
      setManualStep('success');
      setSubmitted(true);
    } catch {
      setOcrBusy(false);
      setManualStep('failed');
    }
  };

  const handleSendForManualReview = async () => {
    setBusy(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error: insertError } = await supabase.from('subscription_requests').insert({
      user_id: userData.user?.id,
      plan: selectedPlan.key,
      amount: selectedPlan.price,
      discount: 0,
      description: 'Submitted for manual review after OCR mismatch',
      transaction_id: null,
      payment_date: new Date().toISOString().slice(0, 10),
      proof_url: proofUrl,
    });
    setBusy(false);
    if (!insertError) setSubmitted(true);
  };

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
    a.href = autoQr?.qrImage || PLAN_QR[selected];
    a.download = `nint-anime-payment-qr-${selected}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleConfirmPaid = async () => {
    setError('');
    if (!transactionId.trim() || !proofUrl) {
      setError(t.subMissingProof);
      return;
    }
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
        transaction_id: transactionId.trim(),
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
          <button
            onClick={onClose}
            className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            <X size={17} />
          </button>
          <div className="relative flex flex-col items-center pt-2 text-center">
            <div className="mb-3 flex h-24 w-24 items-center justify-center">
              <img
                src={LOGO_URL}
                alt="NINT ANIME"
                className="h-full w-full object-contain drop-shadow-[0_6px_18px_rgba(232,169,74,0.35)]"
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
                          ? '1.5px solid #E8A94A'
                          : '1.5px solid rgba(255,255,255,0.08)',
                        background: isSelected
                          ? 'linear-gradient(160deg, rgba(232,169,74,0.14) 0%, rgba(15,143,114,0.08) 100%)'
                          : 'rgba(255,255,255,0.02)',
                        transform: isSelected ? 'translateY(-2px)' : 'none',
                        boxShadow: isSelected
                          ? '0 8px 20px rgba(232,169,74,0.15)'
                          : 'none',
                      }}
                    >
                      {p.tagKey && (
                        <span
                          className="absolute -top-2.5 left-1/2 flex -translate-x-1/2 items-center gap-0.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-wide text-black"
                          style={{
                            background: 'linear-gradient(90deg, #E8A94A, #C97A2E)',
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
                        style={{ color: isSelected ? '#E8A94A' : '#0F8F72' }}
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
                    style={{ background: 'linear-gradient(145deg,#3FD8B0,#0B6E58)' }}
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
                      ? { background: 'linear-gradient(90deg,#E8A94A,#C97A2E)' }
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
                      ? 'bg-[#0F8F72] text-white'
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
                    border: '1px solid rgba(232,169,74,0.15)',
                    background:
                      'linear-gradient(160deg, rgba(232,169,74,0.05) 0%, rgba(255,255,255,0.02) 100%)',
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
                        style={{ background: 'linear-gradient(90deg,#E8A94A,#C97A2E)' }}
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
                      <Loader2 size={28} className="animate-spin text-[#E8A94A]" />
                      <p className="text-[10px] text-white/50">{t.subGeneratingQr}</p>
                    </div>
                  )}

                  {autoStatus === 'waiting' && autoQr && (
                    <>
                      <QrPaymentCard qrSrc={autoQr.qrImage} amount={selectedPlan.price} />
                      <div className="mt-2 flex items-center justify-center gap-1.5">
                        <Loader2 size={12} className="animate-spin text-[#E8A94A]" />
                        <p className="text-[10px] font-semibold text-white">
                          {t.subAutoVerifying} ({formatCountdown(secondsLeft)})
                        </p>
                      </div>
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
                        style={{ background: 'linear-gradient(90deg,#E8A94A,#C97A2E)' }}
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
                        style={{ background: 'linear-gradient(90deg,#E8A94A,#C97A2E)' }}
                      >
                        <RefreshCw size={13} />
                        {t.subTryAgain}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* MANUAL PAY — smart step-by-step flow */}
              {payMode === 'manual' && (
                <div className="mb-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                  {/* Step 1: summary + Pay button */}
                  {manualStep === 'summary' && (
                    <div className="text-center">
                      <div className="mb-2 flex items-center justify-center gap-1.5">
                        <QrCode size={14} className="text-[#0F8F72]" />
                        <p className="text-[11px] font-bold text-white">{t.subScanToPay}</p>
                      </div>
                      <p className="mb-3 text-2xl font-extrabold text-white">
                        ${selectedPlan.price.toFixed(2)}
                      </p>
                      <button
                        onClick={handleManualPayClick}
                        className="flex w-full items-center justify-center gap-1.5 rounded-xl py-3 text-xs font-bold text-white transition hover:opacity-90"
                        style={{ background: 'linear-gradient(90deg,#0F8F72,#0B6E58)' }}
                      >
                        <DollarSign size={14} />
                        {t.subPayNow}
                      </button>
                    </div>
                  )}

                  {/* Step 2: real sandbox KHQR + save */}
                  {manualStep === 'qr' && (
                    <div>
                      <div className="mb-2 flex items-center justify-center gap-1.5">
                        <QrCode size={14} className="text-[#0F8F72]" />
                        <p className="text-[11px] font-bold text-white">{t.subStep2Title}</p>
                      </div>
                      <p className="mb-2 px-2 text-center text-[10px] leading-relaxed text-white/50">
                        {t.subStep2Desc}
                      </p>

                      {autoStatus === 'loading' && (
                        <div className="mx-auto flex h-40 w-40 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/10">
                          <Loader2 size={28} className="animate-spin text-[#E8A94A]" />
                          <p className="text-[10px] text-white/50">{t.subGeneratingQr}</p>
                        </div>
                      )}

                      {autoStatus === 'error' && (
                        <div className="py-2 text-center">
                          <p className="mb-3 text-[11px] text-[#EF4444]">{autoError}</p>
                          <button
                            onClick={handleManualPayClick}
                            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold text-black transition hover:opacity-90"
                            style={{ background: 'linear-gradient(90deg,#E8A94A,#C97A2E)' }}
                          >
                            <RefreshCw size={13} />
                            {t.subTryAgain}
                          </button>
                        </div>
                      )}

                      {autoQr && (autoStatus === 'waiting' || autoStatus === 'confirmed') && (
                        <>
                          <QrPaymentCard qrSrc={autoQr.qrImage} amount={selectedPlan.price} />
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <button
                              onClick={handleSaveQr}
                              className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 py-2.5 text-[11px] font-semibold text-white transition hover:bg-white/5"
                            >
                              <Download size={13} />
                              {t.subSaveQr}
                            </button>
                            <button
                              onClick={handleManualQrSaved}
                              className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[11px] font-bold text-black transition hover:opacity-90"
                              style={{ background: 'linear-gradient(90deg,#E8A94A,#C97A2E)' }}
                            >
                              <CheckCircle2 size={13} />
                              {t.subIveSavedQr}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Step 3: notice + real countdown (Payway is auto-verifying in the background) + locked "go to ABA" button */}
                  {manualStep === 'notice' && (
                    <div>
                      <div
                        className="rounded-xl p-3"
                        style={{
                          border: '1px solid rgba(232,169,74,0.25)',
                          background: 'rgba(232,169,74,0.06)',
                        }}
                      >
                        <div className="mb-1.5 flex items-center gap-1.5">
                          <Gift size={13} className="text-[#E8A94A]" />
                          <p className="text-[11px] font-bold text-white">{t.subNoticeTitle}</p>
                        </div>
                        <p className="text-[10.5px] leading-relaxed text-white/60">
                          {t.subNoticeBody}
                        </p>
                        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#E8A94A]/15 px-2.5 py-1 text-[9.5px] font-bold text-[#E8A94A]">
                          <Sparkles size={10} />
                          {t.subBonusBadge}
                        </p>
                      </div>

                      <div className="mt-3 flex items-center justify-center gap-1.5">
                        <Loader2 size={12} className="animate-spin text-[#E8A94A]" />
                        <p className="text-[10px] font-semibold text-white">
                          {t.subCheckingPayment} ({formatCountdown(secondsLeft)})
                        </p>
                      </div>

                      <button
                        onClick={handleGoToAba}
                        disabled={!abaUnlocked}
                        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl py-3 text-xs font-bold text-black transition disabled:cursor-not-allowed disabled:opacity-50"
                        style={{ background: 'linear-gradient(90deg,#E8A94A,#C97A2E)' }}
                      >
                        {abaUnlocked ? <ImagePlus size={14} /> : <Lock size={13} />}
                        {t.subGoToAba}
                      </button>
                      {!abaUnlocked && (
                        <p className="mt-1.5 text-center text-[9.5px] text-white/35">
                          {t.subGoToAbaHint}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Step 4: upload & OCR-verify */}
                  {manualStep === 'upload' && (
                    <div className="text-center">
                      <div className="mb-1.5 flex items-center justify-center gap-1.5">
                        <Upload size={14} className="text-[#0F8F72]" />
                        <p className="text-[11px] font-bold text-white">
                          {t.subUploadReceiptTitle}
                        </p>
                      </div>
                      <p className="mb-3 px-2 text-[10px] leading-relaxed text-white/50">
                        {t.subUploadReceiptDesc}
                      </p>
                      <input
                        ref={manualFileInputRef}
                        type="file"
                        accept="image/*"
                        disabled={ocrBusy}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleManualFileSelected(file);
                        }}
                        className="hidden"
                      />
                      <button
                        onClick={() => manualFileInputRef.current?.click()}
                        disabled={ocrBusy}
                        className="flex w-full items-center justify-center gap-1.5 rounded-xl py-3 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-60"
                        style={{ background: 'linear-gradient(90deg,#0F8F72,#0B6E58)' }}
                      >
                        {ocrBusy ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            {t.subReadingImage}
                          </>
                        ) : (
                          <>
                            <ImagePlus size={14} />
                            {t.subChooseScreenshot}
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => setManualStep('notice')}
                        className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-white/40 hover:text-white/60"
                      >
                        <ArrowLeft size={11} />
                        {t.subBackBtn}
                      </button>
                    </div>
                  )}

                  {/* Step 5a: OCR match failed */}
                  {manualStep === 'failed' && (
                    <div className="py-1 text-center">
                      <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-[#EF4444]/15">
                        <XCircle size={28} className="text-[#EF4444]" />
                      </div>
                      <p className="text-[12px] font-bold text-white">{t.subVerifyFailed}</p>
                      <p className="mt-1.5 px-3 text-[10.5px] leading-relaxed text-white/50">
                        {t.subVerifyFailedDesc}
                      </p>
                      {ocrError && (
                        <p className="mt-1 text-[10px] text-[#EF4444]">{ocrError}</p>
                      )}
                      <div className="mt-3 grid grid-cols-1 gap-2">
                        <button
                          onClick={() => setManualStep('upload')}
                          className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[11px] font-bold text-black transition hover:opacity-90"
                          style={{ background: 'linear-gradient(90deg,#E8A94A,#C97A2E)' }}
                        >
                          <RefreshCw size={13} />
                          {t.subRetryUpload}
                        </button>
                        <button
                          onClick={handleSendForManualReview}
                          disabled={busy || !proofUrl}
                          className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 py-2.5 text-[11px] font-semibold text-white transition hover:bg-white/5 disabled:opacity-50"
                        >
                          {busy ? t.subSending : t.subSendForReview}
                        </button>
                      </div>
                    </div>
                  )}
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
            (() => {
              const isConfirmed = autoStatus === 'confirmed' || manualStep === 'success';
              return (
                <div className="py-8 text-center">
                  <div
                    className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full"
                    style={{
                      background: isConfirmed
                        ? 'radial-gradient(circle, rgba(232,169,74,0.25) 0%, rgba(34,197,94,0.08) 70%)'
                        : 'rgba(15,143,114,0.15)',
                    }}
                  >
                    <div
                      className={`flex h-14 w-14 items-center justify-center rounded-full ${
                        isConfirmed ? 'bg-[#22C55E]/20' : 'bg-[#0F8F72]/15'
                      }`}
                    >
                      <CheckCircle2
                        size={32}
                        className={isConfirmed ? 'text-[#22C55E]' : 'text-[#0F8F72]'}
                      />
                    </div>
                  </div>
                  <p className="mt-1 flex items-center justify-center gap-1.5 text-sm font-bold text-white">
                    {isConfirmed && (
                      <Crown size={15} className="text-[#E8A94A]" fill="#E8A94A" strokeWidth={0} />
                    )}
                    {manualStep === 'success'
                      ? t.subVerifySuccessTitle
                      : isConfirmed
                        ? t.subYourePremium
                        : t.subRequestReceived}
                  </p>
                  <p className="mt-1.5 px-6 text-xs leading-relaxed text-white/50">
                    {manualStep === 'success'
                      ? t.subVerifySuccessDesc
                      : isConfirmed
                        ? t.subConfirmedDesc
                        : t.subPendingDesc}
                  </p>
                  <button
                    onClick={onClose}
                    className="mt-4 rounded-xl px-6 py-2.5 text-xs font-bold text-black transition hover:opacity-90"
                    style={{ background: 'linear-gradient(90deg,#E8A94A,#C97A2E)' }}
                  >
                    {isConfirmed ? t.subStartWatching : t.subCloseBtn}
                  </button>
                </div>
              );
            })()
          )}
        </div>
      </div>
    </div>
  );
}
