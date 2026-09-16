import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import Providers from "@/context/Providers";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        "font-sans",
        inter.variable,
        geistMono.variable,
      )}
    >
      <body className="relative flex min-h-screen w-full flex-col">
        <Providers>
          <main className="flex flex-1 flex-col">{children}</main>
        </Providers>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
