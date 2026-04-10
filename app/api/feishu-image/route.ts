import { getTenantAccessToken } from "@/lib/feishu/auth";

const IMAGE_CACHE_TTL_MS = 10 * 60 * 1000;
const FEISHU_RATE_LIMIT_CODE = 99991400;
const imageCache = new Map<
  string,
  { expiresAt: number; contentType: string; body: Uint8Array }
>();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return Response.json({ ok: false, error: "Missing image token" }, { status: 400 });
    }

    const cached = imageCache.get(token);
    if (cached && cached.expiresAt > Date.now()) {
      return new Response(cached.body, {
        status: 200,
        headers: {
          "Content-Type": cached.contentType,
          "Cache-Control": "private, max-age=600",
        },
      });
    }

    const tenantToken = await getTenantAccessToken();
    const maxAttempts = 4;
    let arrayBuffer: ArrayBuffer | null = null;
    let contentType = "application/octet-stream";
    let lastStatus = 500;
    let lastErrText = "Unknown error";

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const upstream = await fetch(
        `https://open.feishu.cn/open-apis/drive/v1/medias/${encodeURIComponent(
          token
        )}/download`,
        {
          headers: {
            Authorization: `Bearer ${tenantToken}`,
          },
          cache: "no-store",
        }
      );

      if (upstream.ok) {
        arrayBuffer = await upstream.arrayBuffer();
        contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
        break;
      }

      const errText = await upstream.text();
      lastStatus = upstream.status;
      lastErrText = errText;
      const isRateLimited =
        upstream.status === 429 ||
        errText.includes("request trigger frequency limit") ||
        errText.includes(String(FEISHU_RATE_LIMIT_CODE));

      if (!isRateLimited || attempt === maxAttempts) {
        break;
      }

      const waitMs = Math.min(1200, 180 * 2 ** (attempt - 1));
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    if (!arrayBuffer) {
      return Response.json(
        { ok: false, error: `Feishu image fetch failed: ${lastStatus} ${lastErrText}` },
        { status: lastStatus }
      );
    }

    const body = new Uint8Array(arrayBuffer);
    imageCache.set(token, {
      expiresAt: Date.now() + IMAGE_CACHE_TTL_MS,
      contentType,
      body,
    });

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=600",
      },
    });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
