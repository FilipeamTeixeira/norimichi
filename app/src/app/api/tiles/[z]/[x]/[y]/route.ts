export async function GET(
  _request: Request,
  { params }: { params: Promise<{ z: string; x: string; y: string }> }
) {
  const { z, x, y } = await params;
  const url = `https://basemaps.cartocdn.com/light_nolabels/${z}/${x}/${y}@2x.png`;
  const res = await fetch(url);

  if (!res.ok) {
    return new Response(null, { status: res.status });
  }

  const buffer = await res.arrayBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
