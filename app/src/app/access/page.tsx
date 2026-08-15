"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { FeatureCollection, Polygon } from "geojson";
import MapView, { type MapControls } from "@/components/map/MapView";
import AccessLayer from "@/components/map/AccessLayer";
import AccessPanel from "@/components/access/AccessPanel";
import OriginPicker, {
  type ReferencePoint,
} from "@/components/access/OriginPicker";
import Legend, { type LegendSection } from "@/components/panels/Legend";
import { ACCESS_SURFACE } from "@/lib/scales";
import {
  cellStatus,
  normalizeSurface,
  type AccessIndex,
  type AccessOrigin,
  type AccessSurface,
  type MeshCellProperties,
} from "@/lib/access-types";
import { useT } from "@/i18n/context";

/**
 * Access — the half of this project addressed to the person making the trip
 * rather than to the person funding the street.
 *
 * The Network tab asks which streets are worth money and the Investment
 * Ranking asks in what order; both are answers to questions a resident never
 * asks. This page asks the one they do — can my child ride to that school, can
 * I reach that station — and answers it in the only unit that carries: how
 * many people can, and how many cannot because of the streets in between.
 *
 * It is also where the project's "trip distance" idea finally has somewhere to
 * live. As a filter over segments it never meant anything; as the radius of a
 * reach surface it is the control the whole page turns on, and 3 km stops
 * being a category and becomes a distance somebody rides.
 *
 * Nothing here is computed. Every figure comes from access_index.json at the
 * bands the pipeline declares; the page picks a band and paints cells.
 */

export default function AccessPage() {
  const t = useT();
  const [index, setIndex] = useState<AccessIndex | null>(null);
  const [mesh, setMesh] =
    useState<FeatureCollection<Polygon, MeshCellProperties> | null>(null);
  const [selected, setSelected] = useState<AccessOrigin | null>(null);
  const [surface, setSurface] = useState<AccessSurface | null>(null);
  const [bandM, setBandM] = useState<number | null>(null);
  const [reference, setReference] = useState<ReferencePoint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);

  const mapControls = useRef<MapControls | null>(null);
  /** Invalidates a surface fetch the reader has already navigated away from. */
  const requestId = useRef(0);

  const handleMapReady = useCallback((m: MapLibreMap) => setMap(m), []);

  /**
   * Frame the map on what the surface actually covers, rather than on a circle
   * of the band's radius around the origin. Network distance is not straight
   * line — a school hemmed in by a river reaches far less ground than its
   * radius claims, and a fit to the radius would leave the reader looking
   * mostly at the empty space that is the point.
   */
  const fitToSurface = useCallback(
    (
      next: AccessSurface,
      band: number,
      origin: AccessOrigin,
      cells: FeatureCollection<Polygon, MeshCellProperties>
    ) => {
      let w = origin.lon;
      let s = origin.lat;
      let e = origin.lon;
      let n = origin.lat;
      let any = false;

      for (const feature of cells.features) {
        if (cellStatus(next, feature.properties.mesh_code, band) === "unreached") {
          continue;
        }
        any = true;
        for (const ring of feature.geometry.coordinates) {
          for (const [lon, lat] of ring) {
            if (lon < w) w = lon;
            if (lon > e) e = lon;
            if (lat < s) s = lat;
            if (lat > n) n = lat;
          }
        }
      }

      if (!any) return;
      mapControls.current?.fitBounds([
        [w, s],
        [e, n],
      ]);
    },
    []
  );

  /**
   * The mesh is passed in rather than read from state because the `?origin=`
   * deep link below runs inside the load callback, where the mesh exists as a
   * local but the state holding it has not committed yet.
   */
  const selectWith = useCallback(
    (
      origin: AccessOrigin,
      band: number,
      cells: FeatureCollection<Polygon, MeshCellProperties> | null
    ) => {
      const id = ++requestId.current;
      setSelected(origin);
      setSurface(null);

      fetch(`/data/access/${origin.origin_id}.json`)
        .then((r) => {
          if (!r.ok) throw new Error(`${r.status}`);
          return r.json() as Promise<AccessSurface>;
        })
        .then((raw) => {
          if (id !== requestId.current) return;
          const next = normalizeSurface(raw);
          setSurface(next);
          if (cells) fitToSurface(next, band, origin, cells);
        })
        .catch(() => {
          if (id === requestId.current) setSurface(null);
        });
    },
    [fitToSurface]
  );

  useEffect(() => {
    Promise.all([
      fetch("/data/access_index.json").then((r) => {
        if (!r.ok) throw new Error(`access_index.json: ${r.status}`);
        return r.json() as Promise<AccessIndex>;
      }),
      fetch("/data/population_mesh.geojson").then((r) => {
        if (!r.ok) throw new Error(`population_mesh.geojson: ${r.status}`);
        return r.json() as Promise<
          FeatureCollection<Polygon, MeshCellProperties>
        >;
      }),
    ])
      .then(([idx, cells]) => {
        setIndex(idx);
        setMesh(cells);
        setBandM(idx.primary_band_m);

        /**
         * `?origin=<id>` opens straight onto one surface, so the map and panel
         * can be linked to from elsewhere — the About page, or a message to
         * somebody who only cares about one school.
         *
         * Applied here in the fetch callback rather than in an effect watching
         * `index`, for the reason F.6 records for the corridor handoff: a
         * synchronous setState in an effect body is the cascading-render
         * pattern `react-hooks/set-state-in-effect` rejects, and this build
         * treats lint errors as build failures. Read off `window.location`
         * rather than through `useSearchParams` for the same reason recorded
         * there — that hook needs a Suspense boundary or `next build` fails,
         * and it buys nothing for a value read once.
         */
        const wanted = new URLSearchParams(window.location.search).get("origin");
        if (!wanted) return;
        const origin = idx.origins.find((o) => o.origin_id === wanted);
        if (origin) selectWith(origin, idx.primary_band_m, cells);
      })
      .catch((e: Error) => setError(e.message));
  }, [selectWith]);

  const select = useCallback(
    (origin: AccessOrigin, band: number) => selectWith(origin, band, mesh),
    [selectWith, mesh]
  );

  /**
   * Changing the band repaints from the surface already in memory — the export
   * carries a distance per cell, not a band, precisely so this costs nothing.
   * It does not refit the map: the reader chose this view, and yanking the
   * viewport on every click of a three-way control would make comparing the
   * bands harder than not having it.
   */
  const changeBand = useCallback((next: number) => setBandM(next), []);

  /**
   * A searched place is a point to measure *from*, not a destination — it
   * re-sorts the list to the schools and stations nearest it and drops a
   * neutral marker, and deliberately does not select anything. Picking which
   * of them to look at stays the reader's move; guessing at the nearest one
   * would be wrong exactly when the nearest is not the one they use.
   *
   * The map only moves if nothing is selected. Yanking the viewport away from
   * a surface the reader is reading, because they typed an address to orient
   * themselves against it, is the opposite of helping.
   */
  const pickReference = useCallback(
    (next: ReferencePoint | null) => {
      setReference(next);
      if (next && !selected) {
        mapControls.current?.fitBounds([next.at, next.at]);
      }
    },
    [selected]
  );

  const legendSections = useMemo<LegendSection[]>(() => {
    if (!index || !selected || !surface || bandM === null) return [];
    return [
      {
        title: t.access.legend.title(bandM / 1000),
        shape: "fill",
        hasNoData: false,
        entries: [
          { color: ACCESS_SURFACE.calm, label: t.access.legend.calm },
          { color: ACCESS_SURFACE.severed, label: t.access.legend.severed },
        ],
        note: t.access.legend.note(index.calm_max_lts, index.mesh.cell_size_m),
      },
    ];
  }, [t, index, selected, surface, bandM]);

  /**
   * Read, never derived. Adding up every school's `population_any` counts a
   * central resident once per school in range — it produced 13.8 million
   * against a region of 612,000 before this came from the pipeline, where the
   * surfaces are combined by nearest-origin so a mesh cell counts once.
   */
  const summary = useMemo(
    () =>
      index?.study.find((s) => s.kind === "school" && s.band_m === bandM) ??
      null,
    [index, bandM]
  );

  if (error) {
    return (
      <main className="flex-1 bg-[#F7F8FA] p-6">
        <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-4 py-3 max-w-xl">
          {t.access.loadError(error)}
        </p>
      </main>
    );
  }

  return (
    <>
      {index && bandM !== null ? (
        <OriginPicker
          origins={index.origins}
          selected={selected?.origin_id ?? null}
          selectedKind={selected?.kind ?? null}
          onSelect={(o) => select(o, bandM)}
          bandM={bandM}
          bands={index.bands_m}
          onBandChange={changeBand}
          reference={reference}
          onReferenceChange={pickReference}
        />
      ) : (
        <aside className="w-[268px] border-r border-neutral-200 bg-white shrink-0 px-4 py-4">
          <p className="text-[12px] text-neutral-400">{t.common.loading}</p>
        </aside>
      )}

      <main className="flex-1 relative bg-[#F7F8FA]">
        <MapView
          onSelect={() => {}}
          onZoomChange={() => {}}
          segments={null}
          hexagons={null}
          coloredGeometry={null}
          color="#9ca3af"
          showBridges={false}
          controlRef={mapControls}
          onMapReady={handleMapReady}
        />

        <AccessLayer
          map={map}
          mesh={mesh}
          surface={surface}
          origin={selected}
          bandM={bandM ?? 0}
          reference={reference?.at ?? null}
        />

        {/* Before anything is selected the map has nothing on it, so the page
            says what it is for and states its one whole-study-area figure.
            That number is the reason the page exists; it should not be
            reachable only by clicking 106 schools one at a time. */}
        {!selected && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-white/95 rounded-xl border border-neutral-200 shadow-sm px-5 py-3 max-w-[440px]">
            <p className="text-[13px] text-neutral-700 leading-relaxed">
              {t.access.hint}
            </p>
            {summary && bandM !== null && summary.severed_share !== null && (
              <p className="mt-2 text-[12px] text-neutral-500 leading-relaxed">
                {t.access.studySummary({
                  km: bandM / 1000,
                  severed: summary.severed.toLocaleString(),
                  share: Math.round(summary.severed_share * 100),
                })}
              </p>
            )}
          </div>
        )}

        {selected && index && bandM !== null && (
          <AccessPanel
            origin={selected}
            index={index}
            bandM={bandM}
            onClose={() => {
              requestId.current += 1;
              setSelected(null);
              setSurface(null);
            }}
          />
        )}

        <Legend sections={legendSections} />
      </main>
    </>
  );
}
