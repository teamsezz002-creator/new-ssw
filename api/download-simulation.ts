function isAllowedStorageUrl(url: URL) {
  if (url.protocol !== 'https:') return false;
  if (url.hostname !== 'firebasestorage.googleapis.com') return false;
  if (!url.pathname.includes('/o/')) return false;
  return url.pathname.includes('sezsimulationworld.firebasestorage.app');
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sourceUrl = searchParams.get('url');

    if (!sourceUrl) {
      return Response.json({ error: 'Missing url parameter.' }, { status: 400 });
    }

    const parsedUrl = new URL(sourceUrl);
    if (!isAllowedStorageUrl(parsedUrl)) {
      return Response.json({ error: 'URL not allowed.' }, { status: 400 });
    }

    const upstream = await fetch(parsedUrl.toString());
    if (!upstream.ok) {
      return Response.json({ error: `Upstream download failed with status ${upstream.status}.` }, { status: 502 });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/zip',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Download proxy failed.';
    return Response.json({ error: message }, { status: 500 });
  }
}
