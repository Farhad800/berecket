import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Arabic } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { dirOf, type Locale } from "@/i18n/config";
import InstallBanner from "@/components/install-banner";
import NoWheelNumbers from "@/components/no-wheel-numbers";
import "./globals.css";

const latin = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-latin", display: "swap" });
const arabic = Noto_Sans_Arabic({ subsets: ["arabic"], variable: "--font-arabic", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Bereket Plastic — Factory Management System", template: "%s · Bereket Plastic" },
  description: "Bereket Plastic Factory Management System",
  applicationName: "Bereket FMS",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Bereket FMS", statusBarStyle: "black-translucent" },
  robots: { index: false, follow: false }, // internal system — keep out of search engines
  other: { "mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  themeColor: "#294680",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = (await getLocale()) as Locale;
  const messages = await getMessages();
  return (
    <html lang={locale} dir={dirOf(locale)} className={`${latin.variable} ${arabic.variable}`}>
      <body className="min-h-dvh">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
          <InstallBanner />
          <NoWheelNumbers />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
