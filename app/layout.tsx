import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { NavLinks, NavLinksView } from "@/components/crm/nav-links";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "taxPOD CRM",
  description: "Lightweight CRM with tax document Q&A",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b">
          <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-6 px-6">
            <Link href="/" className="font-semibold tracking-tight whitespace-nowrap">
              taxPOD CRM
            </Link>
            <Suspense fallback={<NavLinksView />}>
              <NavLinks />
            </Suspense>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">{children}</main>
        <footer className="mx-auto w-full max-w-7xl px-6 py-4 text-xs text-muted-foreground">
          <Link href="/status" className="hover:underline">
            System status
          </Link>
        </footer>
        <Toaster />
      </body>
    </html>
  );
}
