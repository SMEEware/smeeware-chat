"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import {
  defaultLocale,
  localeCookie,
  type Locale,
} from "@/lib/i18n/config";
import {
  translate,
  translateList,
  type Messages,
  type TranslateFn,
  type TranslateListFn,
  type Vars,
} from "@/lib/i18n/translate";

type I18nValue = {
  locale: Locale;
  t: TranslateFn;
  tList: TranslateListFn;
  setLocale: (locale: Locale) => void;
};

const I18nContext = React.createContext<I18nValue | null>(null);

export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Messages;
  children: React.ReactNode;
}) {
  const router = useRouter();

  const value = React.useMemo<I18nValue>(
    () => ({
      locale,
      t: (key: string, vars?: Vars) => translate(messages, key, vars),
      tList: (key: string) => translateList(messages, key),
      setLocale: (next: Locale) => {
        document.cookie = `${localeCookie}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
        router.refresh();
      },
    }),
    [locale, messages, router],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18n(): I18nValue {
  const value = React.useContext(I18nContext);
  if (value) return value;
  return {
    locale: defaultLocale,
    t: (key) => key,
    tList: () => [],
    setLocale: () => {},
  };
}

export function useT(): TranslateFn {
  return useI18n().t;
}

export function useTList(): TranslateListFn {
  return useI18n().tList;
}

export function useLocale(): Locale {
  return useI18n().locale;
}

export function useSetLocale(): (locale: Locale) => void {
  return useI18n().setLocale;
}
