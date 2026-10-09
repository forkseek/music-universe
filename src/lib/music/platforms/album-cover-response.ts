import "server-only";
import { RequestError } from "@/lib/server/errors";

// Next's Netlify adapter varies on framework queries unless we also declare ours.
// Keep this identical for success/error responses at the legacy query-based URL.
const vary = "query=provider|id";
export function albumCoverCacheHeaders(provider: string, id: string) {
    return {
        "Cache-Control": "public, max-age=300",
        "Netlify-CDN-Cache-Control": "public, max-age=86400, durable",
        "Netlify-Vary": vary,
        "Netlify-Cache-Tag": "music-album-covers",
        "X-Album-Cover-Provider": provider,
        "X-Album-Cover-Id": id,
        "X-Content-Type-Options": "nosniff",
    };
}
export function albumCoverErrorResponse(error: unknown) {
    return Response.json({ error: { message: "专辑封面暂不可用。" } }, {
        status: error instanceof RequestError ? error.status : 502,
        headers: { "Cache-Control": "no-store", "Netlify-CDN-Cache-Control": "no-store", "Netlify-Vary": vary },
    });
}
