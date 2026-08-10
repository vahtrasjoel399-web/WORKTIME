import "./globals.css";
import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { ThemeInit } from "@/components/ThemeInit";

export const metadata: Metadata = {
  title: "Tööaeg — tööandja töölaud",
  description: "GPS-põhine tööaja arvestus ehitusettevõttele",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="et" suppressHydrationWarning>
      <body className="min-h-screen font-sans antialiased">
        <ThemeInit />
        <Nav />
        <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
      </body>
    </html>
  );
}
