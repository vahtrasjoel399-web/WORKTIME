import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Nav } from "@/components/Nav";
import { ThemeInit } from "@/components/ThemeInit";
import { I18nProvider } from "@/components/I18nProvider";

export const metadata: Metadata = {
  title: "Tööaeg",
  description: "Учёт рабочего времени · GPS",
  applicationName: "Tööaeg",
  appleWebApp: { capable: true, title: "Tööaeg", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0B1320",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="et" suppressHydrationWarning>
      <body className="min-h-screen font-sans antialiased">
        <ThemeInit />
        <I18nProvider>
          <Nav />
          <main className="mx-auto w-full max-w-6xl overflow-x-hidden px-4 py-6 sm:px-5 sm:py-8">{children}</main>
        </I18nProvider>
      </body>
    </html>
  );
}
