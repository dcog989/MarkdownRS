import { get } from "svelte/store";
import { _, addMessages, getLocaleFromNavigator, init, locale } from "svelte-i18n";
import { en } from "./messages/en";

export type MessageKey = DeepKey<typeof en>;

export const SUPPORTED_LOCALES = ["en"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

// Sentinel value for the locale setting: follow the OS language on each start.
export const SYSTEM_LOCALE = "system";

export const LOCALE_NAMES: Record<AppLocale, string> = {
  en: "English",
};

type DeepKey<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : T[K] extends object
      ? DeepKey<T[K], `${Prefix}${K}.`>
      : never;
}[keyof T & string];

let initialized = false;

export function initI18n(preferredLocale: string): void {
  if (initialized) return;
  initialized = true;
  addMessages("en", en);
  init({
    fallbackLocale: "en",
    initialLocale: "en",
    ignoreTag: true,
  });
  locale.set(resolveLocale(preferredLocale));
}

export function detectSystemLocale(): string {
  const detected = getLocaleFromNavigator();
  if (detected && SUPPORTED_LOCALES.includes(detected as AppLocale)) {
    return detected;
  }
  if (detected) {
    const base = detected.split("-")[0];
    if (SUPPORTED_LOCALES.includes(base as AppLocale)) {
      return base;
    }
  }
  return "en";
}

export function resolveLocale(localeId: string): string {
  return localeId === SYSTEM_LOCALE ? detectSystemLocale() : localeId;
}

export function setAppLocale(localeId: string): void {
  locale.set(resolveLocale(localeId));
}

export type TranslateOptions = {
  values?: Record<string, string | number | boolean | Date | null | undefined>;
  default?: string;
};

export function translate(key: MessageKey | (string & {}), options?: TranslateOptions): string {
  return get(_)(key, options);
}
