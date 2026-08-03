import { Gift, Sparkles, X } from 'lucide-react';
import { useLang } from '@/lib/useLang';
import { appText } from '@/lib/appTranslations';

interface Props {
  variant: 'guest' | 'spin-ready';
  onPrimary: () => void;
  onDismiss: () => void;
}

// Center-of-screen popup banner for the new-member VIP lucky-draw promo.
// - "guest": visitor has no account yet -> CTA opens sign-up.
// - "spin-ready": signed-in user who just became VIP and hasn't used their
//   one-time spin yet -> CTA opens the LuckyDrawModal.
export default function NewMemberPromoBanner({ variant, onPrimary, onDismiss }: Props) {
  const { lang } = useLang();
  const t = appText[lang];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-[#E8A94A]/25 bg-gradient-to-b from-[#141420] to-[#0A0A0F] p-6 text-center shadow-[0_0_60px_rgba(232,169,74,0.15)]">
        <button
          onClick={onDismiss}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#E8A94A] to-[#C98A2E] shadow-lg">
          <Gift className="h-8 w-8 text-[#0A0A0F]" />
        </div>

        <div className="mb-1 flex items-center justify-center gap-1.5 text-[#E8A94A]">
          <Sparkles className="h-3.5 w-3.5" />
          <span className="text-xs font-bold uppercase tracking-[0.2em]">{t.promoEyebrow}</span>
          <Sparkles className="h-3.5 w-3.5" />
        </div>

        <h2
          className="mb-2 text-2xl font-black leading-tight text-white"
          style={{ fontFamily: '"Bebas Neue", Battambang, Inter, sans-serif' }}
        >
          {variant === 'guest' ? t.promoGuestTitle : t.promoSpinTitle}
        </h2>
        <p className="mb-5 text-sm leading-relaxed text-white/60">
          {variant === 'guest' ? t.promoGuestBody : t.promoSpinBody}
        </p>

        <button
          onClick={onPrimary}
          className="w-full rounded-full bg-gradient-to-r from-[#E8A94A] to-[#C98A2E] py-3 text-sm font-bold text-[#0A0A0F] transition hover:opacity-90"
        >
          {variant === 'guest' ? t.promoGuestCta : t.promoSpinCta}
        </button>
      </div>
    </div>
  );
}
