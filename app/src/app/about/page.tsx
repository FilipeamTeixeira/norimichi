import type { Metadata } from "next";
import { getDictionary, getLocale } from "@/i18n/server";
import AboutContentEn from "./content.en";
import AboutContentJa from "./content.ja";

/**
 * The About page is a document, so the language switch happens here — at the
 * whole-document level — rather than string by string. See primitives.tsx for
 * why. Both versions render the same section ids, so an anchor shared in one
 * language still lands in the right place when the reader is in the other.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return {
    title: t.meta.about.title,
    description: t.meta.about.description,
  };
}

export default async function AboutPage() {
  const locale = await getLocale();

  return (
    <main className="flex-1 bg-[#F7F8FA] overflow-auto">
      <div className="max-w-3xl mx-auto px-6 py-10">
        {locale === "ja" ? <AboutContentJa /> : <AboutContentEn />}
      </div>
    </main>
  );
}
