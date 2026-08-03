import { useRef, useState } from 'react';
import { Gift, Sparkles, X } from 'lucide-react';
import { claimNewMemberSpin, SPIN_TIERS } from '@/lib/luckyDraw';
import { useLang } from '@/lib/useLang';
import { appText } from '@/lib/appTranslations';

interface Props {
  onClose: () => void;
  // Called with the granted reward once the spin lands, so the caller can
  // refresh the profile (subscription_expires_at just moved).
  onClaimed: (rewardLabel: string, days: number) => void;
}

// Alternating brand colors for the 8 equal wedges; the last three (the
// rare 4/5/6-month jackpot tiers) get the warm gold treatment so they read
// as the "big win" slice even before landing on them.
const WEDGE_COLORS = [
  '#12362E', '#0F8F72', '#12362E', '#0F8F72',
  '#12362E', '#E8A94A', '#C98A2E', '#E8A94A',
];

const SEGMENT_DEG = 360 / SPIN_TIERS.length;

export default function LuckyDrawModal({ onClose, onClaimed }: Props) {
  const { lang } = useLang();
  const t = appText[lang];
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<{ label: string; days: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wheelRef = useRef<HTMLDivElement>(null);

  const spin = async () => {
    if (spinning || result) return;
    setError(null);
    setSpinning(true);

    const { data, error: err } = await claimNewMemberSpin();
    if (err || !data) {
      setSpinning(false);
      setError(
        err === 'already_used'
          ? t.spinAlreadyUsed
          : err === 'not_vip'
            ? t.spinNotVip
            : t.spinError,
      );
      return;
    }

    const tierIndex = SPIN_TIERS.findIndex((tier) => tier.days === data.reward_days);
    const idx = tierIndex >= 0 ? tierIndex : 0;
    const segmentCenter = idx * SEGMENT_DEG + SEGMENT_DEG / 2;
    const extraSpins = 6; // full turns for a satisfying spin
    const target = extraSpins * 360 + (360 - segmentCenter);

    setRotation(target);

    window.setTimeout(() => {
      setSpinning(false);
      setResult({ label: data.reward_label, days: data.reward_days });
      onClaimed(data.reward_label, data.reward_days);
    }, 4200);
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={result ? onClose : undefined}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-[#E8A94A]/25 bg-gradient-to-b from-[#141420] to-[#0A0A0F] p-6 text-center shadow-[0_0_60px_rgba(232,169,74,0.15)]"
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-1 flex items-center justify-center gap-1.5 text-[#E8A94A]">
          <Sparkles className="h-4 w-4" />
          <span className="text-xs font-bold uppercase tracking-[0.2em]">{t.spinEyebrow}</span>
          <Sparkles className="h-4 w-4" />
        </div>
        <h2
          className="mb-4 text-2xl font-black text-white"
          style={{ fontFamily: '"Bebas Neue", Battambang, Inter, sans-serif' }}
        >
          {t.spinTitle}
        </h2>

        {/* Wheel */}
        <div className="relative mx-auto mb-5 h-64 w-64">
          {/* Pointer */}
          <div className="absolute left-1/2 top-[-6px] z-10 h-6 w-6 -translate-x-1/2 rotate-180">
            <div
              className="h-0 w-0 border-x-[10px] border-t-[16px] border-x-transparent border-t-[#E8A94A]"
              style={{ transform: 'rotate(180deg)' }}
            />
          </div>

          <div
            ref={wheelRef}
            className="relative h-full w-full rounded-full border-4 border-[#E8A94A]/60 shadow-[0_0_40px_rgba(0,0,0,0.5)]"
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: spinning ? 'transform 4.2s cubic-bezier(0.17,0.67,0.16,0.99)' : 'none',
              background: `conic-gradient(${SPIN_TIERS.map(
                (_, i) =>
                  `${WEDGE_COLORS[i]} ${i * SEGMENT_DEG}deg ${(i + 1) * SEGMENT_DEG}deg`,
              ).join(', ')})`,
            }}
          >
            {SPIN_TIERS.map((tier, i) => {
              const angle = i * SEGMENT_DEG + SEGMENT_DEG / 2;
              return (
                <div
                  key={tier.days}
                  className="absolute left-1/2 top-1/2 h-0 w-0 origin-top-left"
                  style={{ transform: `rotate(${angle}deg)` }}
                >
                  <span
                    className="absolute -translate-x-1/2 text-[11px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
                    style={{ top: '-108px' }}
                  >
                    {tier.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Hub */}
          <div className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-[#0A0A0F] bg-gradient-to-br from-[#E8A94A] to-[#C98A2E] shadow-lg">
            <Gift className="h-6 w-6 text-[#0A0A0F]" />
          </div>
        </div>

        {error && (
          <p className="mb-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
        )}

        {result ? (
          <div className="space-y-3">
            <p className="text-lg font-bold text-[#E8A94A]">
              {t.spinWonPrefix} {result.label} {t.spinWonSuffixVip}
            </p>
            <button
              onClick={onClose}
              className="w-full rounded-full bg-gradient-to-r from-[#0F8F72] to-[#0BB88F] py-3 text-sm font-bold text-white transition hover:opacity-90"
            >
              {t.spinCollect}
            </button>
          </div>
        ) : (
          <button
            onClick={spin}
            disabled={spinning || !!error}
            className="w-full rounded-full bg-gradient-to-r from-[#E8A94A] to-[#C98A2E] py-3 text-sm font-bold text-[#0A0A0F] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {spinning ? t.spinSpinning : t.spinButton}
          </button>
        )}
      </div>
    </div>
  );
}
