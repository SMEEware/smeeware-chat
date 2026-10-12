import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import Providers from "@/context/Providers";
import { I18nProvider } from "@/context/i18n-provider";
import { getI18n } from "@/lib/i18n/server";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: {
    default: "SMEEware Chat",
    template: "%s",
  },
  description: "Connect your AI to the tools that matter.",
  applicationName: "SMEEware Chat",
  appleWebApp: {
    capable: true,
    title: "SMEE Chat",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FCF9F7" },
    { media: "(prefers-color-scheme: dark)", color: "#110D0B" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { locale, messages } = await getI18n();
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={cn(
        "antialiased",
        "font-sans",
        inter.variable,
        geistMono.variable,
        bricolage.variable,
      )}
    >
      <body className="relative flex min-h-screen w-full flex-col">
        <I18nProvider locale={locale} messages={messages}>
          <Providers>
            <main className="flex flex-1 flex-col">{children}</main>
          </Providers>
        </I18nProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
