import { redirect } from "next/navigation";
import { loadManifest } from "@/lib/regions.server";

/**
 * "/" has no study area, so it picks one.
 *
 * The default comes from the manifest — the first region in the pipeline
 * config that has actually been published — rather than a constant here, so
 * the app never advertises a region whose files are missing, and reordering
 * the config is enough to change the landing city.
 */
export default async function RootPage() {
  const { default: slug } = await loadManifest();
  redirect(`/${slug}`);
}
