import { Globe } from 'lucide-react';
import type { Lang } from '@/lib/useLang';

interface LanguageSwitcherProps {
  lang: Lang;
  onChange: (l: Lang) => void;
  className?: string;
  /** Skip the default pill chrome (border/bg/padding) when nesting inside another glass container */
  bare?: boolean;
}

export default function LanguageSwitcher({ lang, onChange, className = '', bare = false }: LanguageSwitcherProps) {
  return (
    <div
      className={`flex items-center gap-1 ${
        bare ? '' : 'rounded-full border border-white/10 bg-white/[0.04] p-1 backdrop-blur-sm'
      } ${className}`}
      role="group"
      aria-label="Language"
    >
      <Globe className="ml-2 h-3.5 w-3.5 text-white/40" />
      <button
        type="button"
        onClick={() => onChange('km')}
        aria-pressed={lang === 'km'}
        className={`rounded-full px-3 py-1 text-xs font-semibold transition font-khmer ${
          lang === 'km' ? 'bg-[#4CC950] text-black' : 'text-white/60 hover:text-white'
        }`}
      >
        ខ្មែរ
      </button>
      <button
        type="button"
        onClick={() => onChange('en')}
        aria-pressed={lang === 'en'}
        className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
          lang === 'en' ? 'bg-[#4CC950] text-black' : 'text-white/60 hover:text-white'
        }`}
      >
        English
      </button>
    </div>
  );
}
