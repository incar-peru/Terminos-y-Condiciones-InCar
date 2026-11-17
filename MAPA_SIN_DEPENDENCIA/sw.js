const CACHE_NAME = "incar-huancayo-offline-v4";
const ASSETS = [
    "./",
    "./index.html",
    "./TyC.html",
    "./manifest.json",
    "./huancayo.pmtiles",
    "./maplibre-gl.js",
    "./maplibre-gl.css",
    "./pmtiles.js",
    "./fonts/Noto Sans Regular/0-255.pbf",
    "./fonts/Noto Sans Regular/256-511.pbf"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) =>
            Promise.allSettled(ASSETS.map((url) => cache.add(url)))
        )
    );
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

async function responderRangoDesdeCache(request, cachedResponse) {
    const rangeHeader = request.headers.get("range");
    if (!rangeHeader) return cachedResponse;

    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (!match) return cachedResponse;

    const buf = await cachedResponse.arrayBuffer();
    const total = buf.byteLength;
    const start = parseInt(match[1], 10);
    const end = match[2] ? Math.min(parseInt(match[2], 10), total - 1) : total - 1;

    if (isNaN(start) || start >= total || start > end) {
        return new Response("", {
            status: 416,
            headers: { "Content-Range": `bytes */${total}` }
        });
    }

    const slice = buf.slice(start, end + 1);
    const headers = new Headers({
        "Content-Type": cachedResponse.headers.get("Content-Type") || "application/octet-stream",
        "Content-Range": `bytes ${start}-${end}/${total}`,
        "Content-Length": String(slice.byteLength),
        "Accept-Ranges": "bytes"
    });
    const etag = cachedResponse.headers.get("ETag");
    if (etag && !etag.startsWith("W/")) {
        headers.set("ETag", etag);
    }

    return new Response(slice, {
        status: 206,
        statusText: "Partial Content",
        headers
    });
}

self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") return;
    event.respondWith(
        (async () => {
            const cache = await caches.open(CACHE_NAME);
            const cached = await cache.match(event.request.url, { ignoreSearch: true });
            if (cached) {
                if (event.request.headers.get("range")) {
                    return responderRangoDesdeCache(event.request, cached);
                }
                return cached;
            }

            try {
                const networkResponse = await fetch(event.request);
                if (networkResponse && networkResponse.status === 200) {
                    cache.put(event.request.url, networkResponse.clone());
                }
                return networkResponse;
            } catch (err) {
                if (/\/fonts\/.*\.pbf$/i.test(event.request.url)) {
                    return new Response(new Uint8Array(0), {
                        status: 200,
                        headers: { "Content-Type": "application/x-protobuf" }
                    });
                }
                throw err;
            }
        })()
    );
});
