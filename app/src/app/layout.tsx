import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import TopNav from "@/components/layout/TopNav";
import { LocaleProvider } from "@/i18n/context";
import { getDictionary, getLocale } from "@/i18n/server";

/**
 * Latin only, deliberately.
 *
 * `next/font/google` exposes no `japanese` subset for any CJK family — Google
 * splits Noto Sans JP into 124 unicode-range chunks and the loader's font data
 * lists only cyrillic/latin/latin-ext/vietnamese — so self-hosting Japanese
 * here would mean shipping several megabytes of woff2 to render a UI whose
 * longest string is a paragraph. The Japanese glyphs come from the system
 * stack in globals.css instead, which every platform this site is read on
 * ships with (Hiragino Sans, Yu Gothic UI, Noto Sans CJK JP).
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return {
    title: t.meta.home.title,
    description: t.meta.home.description,
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();

  return (
    <html lang={locale} className={`${inter.variable} h-full antialiased`}>
      <body className="h-full flex flex-col">
        <LocaleProvider initial={locale}>
          <TopNav />
          <div className="flex-1 flex overflow-hidden">{children}</div>
        </LocaleProvider>
      </body>
    </html>
  );
}
