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
  Sparkles,
  DollarSign,
  BadgeCheck,
  ImagePlus,
  XCircle,
  ArrowLeft,
  Send,
  Clock,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/supabaseClient';
import { useLang } from '@/lib/useLang';
import { appText } from '@/lib/appTranslations';
import { verifyReceiptScreenshot, ReceiptOcrResult } from '@/lib/receiptOcr';

const LOGO_URL = '/assets/images/logo-transparent.png';

// TODO: replace with the real admin support chat link once it's ready.
const ADMIN_TELEGRAM_LINK = 'https://t.me/';

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

// Bundled with the app itself (public/assets/images) — the QR image
// already has the logo, plan name, and price baked in, so it always
// renders instantly and never depends on an edge function or storage
// bucket being configured.
const PLAN_QR: Record<PlanKey, string> = {
  '1m': '/assets/images/subscription-1m.png',
  '2m': '/assets/images/subscription-2m.png',
  '6m': '/assets/images/subscription-6m.png',
  '1y': '/assets/images/subscription-1y.png',
};

// A pending manual-review request auto-fails after this long, so nobody is
// left waiting forever if it isn't picked up.
const REVIEW_TIMEOUT_MS = 60 * 60 * 1000;
const POLL_INTERVAL_MS = 15000;

function QrPaymentCard({ qrSrc }: { qrSrc: string }) {
  return (
    <div className="flex flex-col items-center py-1">
      <img
        key={qrSrc}
        src={qrSrc}
        alt="Payment QR"
        className="h-64 w-64 rounded-2xl bg-white p-2 object-contain shadow-lg"
      />
    </div>
  );
}

function CheckRow({ ok, label }: { ok: boolean | null; label: string }) {
  return (
    <div className="flex items-center gap-2 py-1">
      {ok === true && <CheckCircle2 size={14} className="shrink-0 text-[#22C55E]" />}
      {ok === false && <XCircle size={14} className="shrink-0 text-[#EF4444]" />}
      {ok === null && <Clock size={14} className="shrink-0 text-white/30" />}
      <p className="text-[11px] text-white/70">{label}</p>
    </div>
  );
}

interface Props {
  onClose: () => void;
}

type Step = 'summary' | 'qr' | 'upload' | 'checking' | 'mismatch' | 'duplicate' | 'pending' | 'success' | 'failed';

export default function SubscriptionModal({ onClose }: Props) {
  const { lang } = useLang();
  const t = appText[lang];

  const [selected, setSelected] = useState<PlanKey>('1y');
  const [step, setStep] = useState<Step>('summary');
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [ocrResult, setOcrResult] = useState<ReceiptOcrResult | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [bonusDays, setBonusDays] = useState(0);

  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const [reviewDeadline, setReviewDeadline] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedPlan = PLANS.find((p) => p.key === selected)!;

  const stopTimers = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  };

  useEffect(() => stopTimers, []);

  useEffect(() => {
    // Changing plan mid-flow starts the payment over.
    stopTimers();
    setStep('summary');
    setOcrResult(null);
    setError('');
  }, [selected]);

  const formatCountdown = (ms: number) => {
    const totalSeconds = Math.max(Math.floor(ms / 1000), 0);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;
  };

  const handleGenerateQr = () => {
    setError('');
    setStep('qr');
  };

  const handleSaveQr = () => {
    const a = document.createElement('a');
    a.href = PLAN_QR[selected];
    a.download = `nint-anime-payment-qr-${selected}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const uploadProof = async (file: File, userId: string) => {
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `subscription-proofs/${userId}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true });
    if (uploadError) throw uploadError;
    const { data: pubData } = supabase.storage.from('avatars').getPublicUrl(path);
    return pubData.publicUrl;
  };

  const startPendingWatch = (requestId: string, createdAtIso: string) => {
    const deadline = new Date(createdAtIso).getTime() + REVIEW_TIMEOUT_MS;
    setPendingRequestId(requestId);
    setReviewDeadline(deadline);
    setSecondsLeft(deadline - Date.now());
    setStep('pending');

    stopTimers();
    countdownRef.current = setInterval(() => {
      setSecondsLeft(deadline - Date.now());
    }, 1000);

    pollRef.current = setInterval(async () => {
      const { data } = await supabase
        .from('subscription_requests')
        .select('status')
        .eq('id', requestId)
        .single();

      if (data?.status === 'confirmed') {
        stopTimers();
        setStep('success');
        return;
      }

      if (Date.now() >= deadline) {
        const { data: expired } = await supabase.rpc('expire_my_pending_subscription_request', {
          p_request_id: requestId,
        });
        stopTimers();
        setStep(expired?.status === 'confirmed' ? 'success' : 'failed');
      }
    }, POLL_INTERVAL_MS);
  };

  const handleFileSelected = async (file: File) => {
    setStep('checking');
    setError('');
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setError(t.subNotSignedIn);
        setStep('upload');
        return;
      }

      const [result, url] = await Promise.all([
        verifyReceiptScreenshot(file, selectedPlan.price),
        uploadProof(file, userData.user.id),
      ]);
      setOcrResult(result);
      setProofUrl(url);

      if (result.matched) {
        const { data: confirmed, error: rpcError } = await supabase.rpc(
          'confirm_subscription_via_ocr',
          {
            p_plan: selectedPlan.key,
            p_amount: selectedPlan.price,
            p_proof_url: url,
            p_ocr_text: result.rawText,
            p_bonus_days: 10,
            p_tran_id: result.tranId,
          },
        );
        if (rpcError?.message?.includes('tran_id_reused')) {
          // Checkpoint 4 failed: this exact receipt (by its transaction
          // ID) was already used to confirm a different account. Name,
          // reference, and amount all matched — a photo-edited screenshot
          // can pass those — but the transaction ID can't be reused, so
          // this goes straight to "already used", not the admin queue.
          setStep('duplicate');
          return;
        }
        if (rpcError || !confirmed) {
          // Server-side re-check disagreed (or a network hiccup) — fall
          // back to the human review queue rather than silently failing.
          await sendForReview(userData.user.id, url, result);
          return;
        }
        setBonusDays(confirmed.bonus_days ?? 10);
        stopTimers();
        setStep('success');
        return;
      }

      if (!result.nameMatched && !result.refMatched) {
        // Neither signal was found at all — this isn't a borderline OCR
        // misread, it's almost certainly the wrong screenshot (wrong
        // account, wrong app, or not a receipt). Tell the person right
        // away instead of making them wait up to an hour for admin review.
        setStep('mismatch');
        return;
      }

      if (result.amountMatched === false) {
        // Name/reference look right but the amount on the receipt doesn't
        // match the selected plan — likely paid for a different plan.
        // Reject immediately rather than auto-unlocking the wrong tier.
        setStep('mismatch');
        return;
      }

      await sendForReview(userData.user.id, url, result);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.subQrGenericError);
      setStep('upload');
    }
  };

  const sendForReview = async (userId: string, url: string, result: ReceiptOcrResult) => {
    const notes = [
      !result.nameMatched && 'name not detected',
      !result.refMatched && 'reference tag not detected',
      result.amountMatched === false && 'amount does not match selected plan',
      result.dateText ? `date on receipt: ${result.dateText}` : 'no date detected',
      result.timeText ? `time on receipt: ${result.timeText}` : 'no time detected',
    ]
      .filter(Boolean)
      .join('; ');

    const { data, error: insertError } = await supabase
      .from('subscription_requests')
      .insert({
        user_id: userId,
        plan: selectedPlan.key,
        amount: selectedPlan.price,
        discount: 0,
        description: `Awaiting admin review — ${notes}`,
        transaction_id: null,
        payment_date: new Date().toISOString().slice(0, 10),
        proof_url: url,
      })
      .select('id, created_at')
      .single();

    if (insertError || !data) {
      setError(insertError?.message || t.subQrGenericError);
      setStep('upload');
      return;
    }
    startPendingWatch(data.id, data.created_at);
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
          {/* Plan picker — always visible while we haven't started paying */}
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
                        ${(p.price / p.months).toFixed(2)}
                        {t.subPerMonth}
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

          {/* STEP: summary — single, honest call to action */}
          {step === 'summary' && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-center">
              <div className="mb-2 flex items-center justify-center gap-1.5">
                <QrCode size={14} className="text-[#0F8F72]" />
                <p className="text-[11px] font-bold text-white">{t.subScanToPay}</p>
              </div>
              <p className="mb-3 px-2 text-[10.5px] leading-relaxed text-white/50">{t.subManualIntro}</p>
              <button
                onClick={handleGenerateQr}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl py-3 text-xs font-bold text-white transition hover:opacity-90"
                style={{ background: 'linear-gradient(90deg,#0F8F72,#0B6E58)' }}
              >
                <DollarSign size={14} />
                {t.subPayNow}
              </button>
            </div>
          )}

          {/* STEP: qr */}
          {step === 'qr' && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <div className="mb-2 flex items-center justify-center gap-1.5">
                <QrCode size={14} className="text-[#0F8F72]" />
                <p className="text-[11px] font-bold text-white">{t.subStep2Title}</p>
              </div>
              <p className="mb-2 px-2 text-center text-[10px] leading-relaxed text-white/50">{t.subStep2Desc}</p>

              <QrPaymentCard qrSrc={PLAN_QR[selected]} />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={handleSaveQr}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 py-2.5 text-[11px] font-semibold text-white transition hover:bg-white/5"
                >
                  <Download size={13} />
                  {t.subSaveQr}
                </button>
                <button
                  onClick={() => setStep('upload')}
                  className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[11px] font-bold text-black transition hover:opacity-90"
                  style={{ background: 'linear-gradient(90deg,#E8A94A,#C97A2E)' }}
                >
                  <CheckCircle2 size={13} />
                  {t.subIvePaidUpload}
                </button>
              </div>
              <button
                onClick={() => setStep('summary')}
                className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-white/40 hover:text-white/60"
              >
                <ArrowLeft size={11} />
                {t.subBackBtn}
              </button>
            </div>
          )}

          {/* STEP: upload */}
          {step === 'upload' && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-center">
              <div className="mb-1.5 flex items-center justify-center gap-1.5">
                <Upload size={14} className="text-[#0F8F72]" />
                <p className="text-[11px] font-bold text-white">{t.subUploadReceiptTitle}</p>
              </div>
              {error && <p className="mb-2 text-[10.5px] text-[#EF4444]">{error}</p>}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelected(file);
                }}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl py-3 text-xs font-bold text-white transition hover:opacity-90"
                style={{ background: 'linear-gradient(90deg,#0F8F72,#0B6E58)' }}
              >
                <ImagePlus size={14} />
                {t.subChooseScreenshot}
              </button>
              <button
                onClick={() => setStep('qr')}
                className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-white/40 hover:text-white/60"
              >
                <ArrowLeft size={11} />
                {t.subBackBtn}
              </button>
            </div>
          )}

          {/* STEP: checking (OCR running) */}
          {step === 'checking' && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <div className="mx-auto flex h-40 w-40 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/10">
                <Loader2 size={28} className="animate-spin text-[#E8A94A]" />
                <p className="px-4 text-center text-[10px] text-white/50">{t.subReadingImage}</p>
              </div>
              {ocrResult && (
                <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.02] p-3">
                  <CheckRow ok={ocrResult.nameMatched} label={t.subCheckNameLabel} />
                  <CheckRow ok={ocrResult.refMatched} label={t.subCheckRefLabel} />
                  <CheckRow ok={ocrResult.amountMatched} label={t.subCheckAmountLabel} />
                  <CheckRow ok={ocrResult.tranId ? true : null} label={t.subCheckTranIdLabel} />
                  <CheckRow
                    ok={ocrResult.dateText ? ocrResult.dateRecent ?? null : null}
                    label={ocrResult.dateText ? `${t.subCheckDateLabel}: ${ocrResult.dateText}` : t.subCheckDateLabel}
                  />
                </div>
              )}
            </div>
          )}

          {/* STEP: duplicate (receipt's transaction ID already used elsewhere) */}
          {step === 'duplicate' && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 py-6 text-center">
              <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-[#EF4444]/15">
                <XCircle size={28} className="text-[#EF4444]" />
              </div>
              <p className="text-[12px] font-bold text-white">{t.subDuplicateTitle}</p>
              <p className="mt-1.5 px-3 text-[10.5px] leading-relaxed text-white/50">{t.subDuplicateBody}</p>

              {ocrResult && (
                <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.03] p-3 text-left">
                  <CheckRow ok={ocrResult.nameMatched} label={t.subCheckNameLabel} />
                  <CheckRow ok={ocrResult.refMatched} label={t.subCheckRefLabel} />
                  <CheckRow ok={ocrResult.amountMatched} label={t.subCheckAmountLabel} />
                  <CheckRow ok={false} label={t.subCheckTranIdLabel} />
                </div>
              )}

              <div className="mt-4 grid grid-cols-1 gap-2">
                <a
                  href={ADMIN_TELEGRAM_LINK}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[11px] font-bold text-black transition hover:opacity-90"
                  style={{ background: 'linear-gradient(90deg,#E8A94A,#C97A2E)' }}
                >
                  <Send size={13} />
                  {t.subContactAdminNow}
                </a>
                <button
                  onClick={() => {
                    setError('');
                    setOcrResult(null);
                    setStep('upload');
                  }}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 py-2.5 text-[11px] font-semibold text-white transition hover:bg-white/5"
                >
                  <RefreshCw size={13} />
                  {t.subRetryUpload}
                </button>
              </div>
            </div>
          )}

          {/* STEP: mismatch (receipt clearly doesn't match — reject immediately) */}
          {step === 'mismatch' && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 py-6 text-center">
              <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-[#EF4444]/15">
                <XCircle size={28} className="text-[#EF4444]" />
              </div>
              <p className="text-[12px] font-bold text-white">{t.subVerifyFailed}</p>
              <p className="mt-1.5 px-3 text-[10.5px] leading-relaxed text-white/50">{t.subVerifyFailedDesc}</p>

              {ocrResult && (
                <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.03] p-3 text-left">
                  <CheckRow ok={ocrResult.nameMatched} label={t.subCheckNameLabel} />
                  <CheckRow ok={ocrResult.refMatched} label={t.subCheckRefLabel} />
                  <CheckRow ok={ocrResult.amountMatched} label={t.subCheckAmountLabel} />
                  <CheckRow ok={ocrResult.tranId ? true : null} label={t.subCheckTranIdLabel} />
                </div>
              )}

              <div className="mt-4 grid grid-cols-1 gap-2">
                <button
                  onClick={() => {
                    setError('');
                    setOcrResult(null);
                    setStep('upload');
                  }}
                  className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[11px] font-bold text-black transition hover:opacity-90"
                  style={{ background: 'linear-gradient(90deg,#E8A94A,#C97A2E)' }}
                >
                  <RefreshCw size={13} />
                  {t.subRetryUpload}
                </button>
                <button
                  onClick={async () => {
                    const { data: userData } = await supabase.auth.getUser();
                    if (userData.user && proofUrl && ocrResult) {
                      await sendForReview(userData.user.id, proofUrl, ocrResult);
                    }
                  }}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 py-2.5 text-[11px] font-semibold text-white transition hover:bg-white/5"
                >
                  <Upload size={13} />
                  {t.subSendForReview}
                </button>
                <a
                  href={ADMIN_TELEGRAM_LINK}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 py-2.5 text-[11px] font-semibold text-white transition hover:bg-white/5"
                >
                  <Send size={13} />
                  {t.subContactAdminNow}
                </a>
              </div>
            </div>
          )}

          {/* STEP: pending (awaiting admin review, 1-hour window) */}
          {step === 'pending' && (
            <div className="rounded-2xl p-4 text-center" style={{ border: '1px solid rgba(232,169,74,0.25)', background: 'rgba(232,169,74,0.06)' }}>
              <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-[#E8A94A]/15">
                <Clock size={26} className="text-[#E8A94A]" />
              </div>
              <p className="text-[12px] font-bold text-white">{t.subPendingTitle}</p>
              <p className="mt-1.5 px-2 text-[10.5px] leading-relaxed text-white/60">{t.subPendingBody}</p>

              {ocrResult && (
                <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.03] p-3 text-left">
                  <CheckRow ok={ocrResult.nameMatched} label={t.subCheckNameLabel} />
                  <CheckRow ok={ocrResult.refMatched} label={t.subCheckRefLabel} />
                  <CheckRow ok={ocrResult.amountMatched} label={t.subCheckAmountLabel} />
                  <CheckRow ok={ocrResult.tranId ? true : null} label={t.subCheckTranIdLabel} />
                </div>
              )}

              <div className="mt-3 flex items-center justify-center gap-1.5">
                <Loader2 size={12} className="animate-spin text-[#E8A94A]" />
                <p className="text-[10px] font-semibold text-white">
                  {t.subPendingWaiting} ({formatCountdown(secondsLeft)})
                </p>
              </div>

              <a
                href={ADMIN_TELEGRAM_LINK}
                target="_blank"
                rel="noreferrer"
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 py-2.5 text-[11px] font-semibold text-white transition hover:bg-white/5"
              >
                <Send size={13} />
                {t.subContactAdminNow}
              </a>
            </div>
          )}

          {/* STEP: failed (1 hour passed, unresolved) */}
          {step === 'failed' && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 py-6 text-center">
              <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-[#EF4444]/15">
                <XCircle size={28} className="text-[#EF4444]" />
              </div>
              <p className="text-[12px] font-bold text-white">{t.subFailedTitle}</p>
              <p className="mt-1.5 px-3 text-[10.5px] leading-relaxed text-white/50">{t.subFailedBody}</p>
              <div className="mt-4 grid grid-cols-1 gap-2">
                <a
                  href={ADMIN_TELEGRAM_LINK}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[11px] font-bold text-black transition hover:opacity-90"
                  style={{ background: 'linear-gradient(90deg,#E8A94A,#C97A2E)' }}
                >
                  <Send size={13} />
                  {t.subContactAdminNow}
                </a>
                <button
                  onClick={() => {
                    setError('');
                    setOcrResult(null);
                    setStep('upload');
                  }}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 py-2.5 text-[11px] font-semibold text-white transition hover:bg-white/5"
                >
                  <RefreshCw size={13} />
                  {t.subRetryUpload}
                </button>
              </div>
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
                {bonusDays > 0
                  ? `${t.subVerifySuccessDesc}`
                  : t.subConfirmedDesc}
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
