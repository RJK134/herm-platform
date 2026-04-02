import { useTranslation } from 'react-i18next';

const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
];

export function LanguageSelector() {
  const { i18n } = useTranslation();
  const current = LANGUAGES.find(l => l.code === i18n.language?.split('-')[0]) ?? LANGUAGES[0];

  return (
    <div className="relative group">
      <button
        className="flex items-center gap-1.5 px-2 py-1 text-sm text-white/60 hover:text-white rounded transition-colors"
        aria-label="Select language"
        aria-haspopup="listbox"
      >
        <span aria-hidden="true">{current.flag}</span>
        <span className="text-xs">{current.label}</span>
        <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        className="absolute bottom-full left-0 mb-1 w-36 bg-gray-800 border border-white/10 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50"
        role="listbox"
        aria-label="Language options"
      >
        {LANGUAGES.map(lang => (
          <button
            key={lang.code}
            role="option"
            aria-selected={lang.code === current.code}
            onClick={() => i18n.changeLanguage(lang.code)}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
              lang.code === current.code
                ? 'text-teal-400 bg-teal-900/20'
                : 'text-white/70 hover:text-white hover:bg-white/5'
            }`}
          >
            <span aria-hidden="true">{lang.flag}</span>
            <span>{lang.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
