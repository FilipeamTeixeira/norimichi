import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * These routes read the exported GeoJSON off disk at runtime. Next's file
   * tracer follows imports, and there is no import to follow for a path built
   * at runtime — so without this the route deploys without its data and fails
   * on the first request with ENOENT, while working locally.
   */
  outputFileTracingIncludes: {
    "/api/route-score": [
      "./public/data/segments.geojson",
      "./public/data/traffic_signals.geojson",
      "./public/data/bike_facilities.geojson",
    ],
    "/api/geocode": ["./public/data/hexagons.geojson"],
  },
};

export default nextConfig;
