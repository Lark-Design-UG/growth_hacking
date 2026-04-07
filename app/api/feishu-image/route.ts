import { getTenantAccessToken } from "@/lib/feishu/auth";

const IMAGE_CACHE_TTL_MS = 10 * 60 * 1000;
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

    if (!upstream.ok) {
      const errText = await upstream.text();
      return Response.json(
        { ok: false, error: `Feishu image fetch failed: ${upstream.status} ${errText}` },
        { status: upstream.status }
      );
    }

    const arrayBuffer = await upstream.arrayBuffer();
    const body = new Uint8Array(arrayBuffer);
    const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
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
