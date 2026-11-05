const STATIC_PATH = /\.(?:avif|css|gif|ico|jpe?g|js|png|svg|webp|woff2?)$/i;
const EDGE_CACHE_TTL_SECONDS = 86400;
const HASHED_BROWSER_TTL_SECONDS = 31536000;
const IMAGE_BROWSER_TTL_SECONDS = 604800;

// Vite fingerprints /assets/* by content, so a year-long immutable copy in the browser is safe.
// Other static files keep their name across releases: a week in the browser, a day at the edge.
function staticCacheControl(pathname) {
  if (pathname.startsWith("/assets/")) {
    return `public, max-age=${HASHED_BROWSER_TTL_SECONDS}, s-maxage=${HASHED_BROWSER_TTL_SECONDS}, immutable`;
  }
  return `public, max-age=${IMAGE_BROWSER_TTL_SECONDS}, s-maxage=${EDGE_CACHE_TTL_SECONDS}`;
}

function isStaticAsset(request, url) {
  return request.method === "GET" && (
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/awards/") ||
    url.pathname.startsWith("/events/") ||
    url.pathname.startsWith("/seasonal/") ||
    url.pathname.startsWith("/statuses/") ||
    STATIC_PATH.test(url.pathname)
  );
}

function resolveOrigin(url, env) {
  if (url.pathname === "/health" || url.pathname.startsWith("/api/")) {
    return { baseUrl: env.API_ORIGIN_URL, pathname: url.pathname, api: true };
  }

  if (url.pathname === "/clock" || url.pathname.startsWith("/clock/")) {
    const pathname = url.pathname.replace(/^\/clock/, "") || "/";
    return { baseUrl: env.CLOCK_ORIGIN_URL, pathname, api: false };
  }

  return { baseUrl: env.WEB_ORIGIN_URL, pathname: url.pathname, api: false };
}

function buildOriginRequest(request, env) {
  const incomingUrl = new URL(request.url);
  const target = resolveOrigin(incomingUrl, env);
  const targetUrl = new URL(`${target.pathname}${incomingUrl.search}`, target.baseUrl);
  const headers = new Headers(request.headers);

  headers.delete("host");
  headers.set("x-forwarded-host", incomingUrl.host);
  headers.set("x-forwarded-proto", "https");

  if (target.api && headers.has("origin")) {
    headers.set("origin", env.API_TRUSTED_ORIGIN);
  }

  return {
    api: target.api,
    request: new Request(targetUrl, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual"
    })
  };
}

function withEdgeHeaders(response, cacheable, api, publicOrigin, pathname) {
  const headers = new Headers(response.headers);
  headers.set("x-flop-edge", "workers-vpc");

  if (api && headers.has("access-control-allow-origin")) {
    headers.set("access-control-allow-origin", publicOrigin);
    headers.append("vary", "Origin");
  }

  if (cacheable && response.ok) {
    headers.set("cache-control", staticCacheControl(pathname));
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cacheable = isStaticAsset(request, url);
    const cache = caches.default;

    if (cacheable) {
      const cached = await cache.match(request);
      if (cached) return cached;
    }

    try {
      const origin = buildOriginRequest(request, env);
      const originResponse = await env.FLOP_TUNNEL.fetch(origin.request);
      const response = withEdgeHeaders(originResponse, cacheable, origin.api, url.origin, url.pathname);

      if (cacheable && response.ok) {
        ctx.waitUntil(cache.put(request, response.clone()));
      }

      return response;
    } catch (error) {
      console.error("Workers VPC origin request failed", error);
      return Response.json(
        { ok: false, message: "Сервис временно недоступен" },
        { status: 503, headers: { "cache-control": "no-store" } }
      );
    }
  }
};
