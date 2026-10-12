import "server-only";

import { cookies, headers } from "next/headers";

import { en } from "@/lib/i18n/messages/en";
import { de } from "@/lib/i18n/messages/de";
import {
  defaultLocale,
  isLocale,
  localeCookie,
  matchLocale,
  type Locale,
} from "@/lib/i18n/config";
import {
  translate,
  translateList,
  type Messages,
  type TranslateFn,
  type TranslateListFn,
} from "@/lib/i18n/translate";

const catalogs: Record<Locale, Messages> = { en, de };

export function messagesFor(locale: Locale): Messages {
  return catalogs[locale] ?? catalogs[defaultLocale];
}

export async function getLocale(): Promise<Locale> {
  const fromCookie = (await cookies()).get(localeCookie)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  const acceptLanguage = (await headers()).get("accept-language");
  return matchLocale(acceptLanguage);
}

export async function getI18n(): Promise<{
  locale: Locale;
  messages: Messages;
  t: TranslateFn;
  tList: TranslateListFn;
}> {
  const locale = await getLocale();
  const messages = messagesFor(locale);
  return {
    locale,
    messages,
    t: (key, vars) => translate(messages, key, vars),
    tList: (key) => translateList(messages, key),
  };
}
