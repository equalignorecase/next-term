import { useAppStore } from "@/store/useAppStore";
import { translations, type TranslationKey, type Language } from "./i18n";

export function useTranslation() {
  const currentLang = useAppStore((s) => s.settings.language || "en") as Language;
  const dict = translations[currentLang] || translations.en;

  const t = (key: TranslationKey, params?: Record<string, string | number>): string => {
    let str: string = dict[key] || translations.en[key] || key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      });
    }
    return str;
  };

  return { t, language: currentLang };
}

