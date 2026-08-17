import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TopNav from "@/components/layout/TopNav";
import { RegionProvider } from "@/components/region/context";
import { getDictionary, getLocale } from "@/i18n/server";
import { regionLabel } from "@/lib/regions";
import { findRegion, loadManifest } from "@/lib/regions.server";

/**
 * Puts the study area in the tab title.
 *
 * A template rather than a fixed string, so pages that set their own title —
 * About is the only one today — keep it and still get the region appended.
 * With several cities published, "Norimichi" alone does not tell you which of
 * four open tabs is Osaka.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ region: string }>;
}): Promise<Metadata> {
  const [{ region: slug }, t, locale] = await Promise.all([
    params,
    getDictionary(),
    getLocale(),
  ]);
  const region = await findRegion(slug);
  if (!region) return {};

  const label = regionLabel(region, locale);
  return {
    title: {
      template: `%s · ${label}`,
      default: `${t.meta.home.title} · ${label}`,
    },
    description: t.meta.home.description,
  };
}

/**
 * The region tree.
 *
 * Everything the app renders lives under here, which is what makes the active
 * study area unambiguous: it is a path segment, so a shared link carries it,
 * and no component has to guess or fall back to a default. An unpublished slug
 * is a 404 rather than a silent redirect to the default region — quietly
 * showing Yokohama to someone who asked for /osaka is how you end up reading
 * one city's numbers under another city's name, which is the failure this
 * whole structure exists to prevent.
 */
export default async function RegionLayout({
  children,
  params,
}: LayoutProps<"/[region]">) {
  const { region: slug } = await params;
  const [region, manifest] = await Promise.all([
    findRegion(slug),
    loadManifest(),
  ]);
  if (!region) notFound();

  return (
    <RegionProvider region={region} regions={manifest.regions}>
      <TopNav />
      {/*
        Keyed on the region so switching city remounts the page rather than
        re-rendering it. Next keeps the same component mounted across a param
        change, which would leave the previous city's segments, selection and
        map focus in state while the new city's data loads — a selected street
        in Yokohama still highlighted over Osaka. Remounting resets all of it
        in one place, instead of every page having to notice the switch.
      */}
      <div key={region.slug} className="flex-1 flex overflow-hidden">
        {children}
      </div>
    </RegionProvider>
  );
}
