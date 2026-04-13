"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getHeroParametricGradient } from "@/lib/hero-parametric-gradient";
import { isPlaybookCoverImageEnabled } from "@/lib/playbook-data-source";

type AttachmentLike = {
  tmp_url?: string;
  url?: string;
  name?: string;
  type?: string;
  file_token?: string;
};

const MOTION_FIELD_KEYS = ["Motion", "motion", "MOTION"] as const;
const COVER_FIELD_KEYS = ["Cover", "cover", "COVER"] as const;

function pickRawField(
  fields: Record<string, unknown>,
  keys: readonly string[],
): { key: string | null; raw: unknown } {
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(fields, k) && fields[k] != null) {
      return { key: k, raw: fields[k] };
    }
  }
  return { key: null, raw: undefined };
}

function pickRawMotion(fields: Record<string, unknown>): { key: string | null; raw: unknown } {
  return pickRawField(fields, MOTION_FIELD_KEYS);
}

function firstAttachmentRow(raw: unknown): AttachmentLike | null {
  if (!raw || !Array.isArray(raw) || raw.length === 0) return null;
  const first = raw[0];
  if (!first || typeof first !== "object") return null;
  return first as AttachmentLike;
}

/** 从飞书「需鉴权」的 drive open-apis 链接里取 file_token（如 batch_get_tmp_download_url?file_tokens=） */
function feishuFileTokenFromOpenApiUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith("feishu.cn") && !u.hostname.endsWith("larkoffice.com")) return null;
    const q =
      u.searchParams.get("file_tokens") ||
      u.searchParams.get("file_token") ||
      u.searchParams.get("token");
    if (q) {
      const t = q
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)[0];
      if (t) return t;
    }
    const m = u.pathname.match(/\/medias\/([A-Za-z0-9_-]+)\/(?:download|preview)(?:\/|$)/i);
    if (m?.[1]) return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
  return null;
}

/**
 * Cover / Motion 共用的浏览器可访问地址：同源 `/api/feishu-image?token=`。
 * 路由名含 image，实为 `drive/v1/medias/{token}/download` 的二进制流，**图片与 webm 等附件均可**。
 */
function driveMediasProxySrcFromAttachmentRaw(raw: unknown): string | null {
  if (typeof raw === "string" && /^https?:\/\//i.test(raw.trim())) {
    const s = raw.trim();
    if (s.includes("/open-apis/")) {
      const tok = feishuFileTokenFromOpenApiUrl(s);
      if (tok) return `/api/feishu-image?token=${encodeURIComponent(tok)}`;
      return null;
    }
    return s;
  }

  const row = firstAttachmentRow(raw);
  if (!row) return null;

  if (typeof row.file_token === "string" && row.file_token.length > 0) {
    return `/api/feishu-image?token=${encodeURIComponent(row.file_token)}`;
  }

  const nested = (row as { file?: { url?: string; tmp_url?: string; token?: string } }).file;
  if (nested && typeof nested === "object") {
    if (typeof nested.token === "string" && nested.token.length > 0) {
      return `/api/feishu-image?token=${encodeURIComponent(nested.token)}`;
    }
    const n = nested.tmp_url || nested.url;
    if (typeof n === "string" && n.length > 0) {
      if (n.includes("/open-apis/")) {
        const tok = feishuFileTokenFromOpenApiUrl(n);
        if (tok) return `/api/feishu-image?token=${encodeURIComponent(tok)}`;
        return null;
      }
      if (/^https?:\/\//i.test(n)) return n;
    }
  }

  const u = row.tmp_url || row.url;
  if (typeof u === "string" && u.length > 0) {
    if (u.includes("/open-apis/")) {
      const tok = feishuFileTokenFromOpenApiUrl(u);
      if (tok) return `/api/feishu-image?token=${encodeURIComponent(tok)}`;
      return null;
    }
    if (/^https?:\/\//i.test(u)) return u;
  }
  return null;
}

/** 供列表用：Motion 在 `<video src>` 上可用的地址（与 Cover 同源代理逻辑） */
export function motionAttachmentUrlFromFields(fields: {
  Motion?: AttachmentLike[] | null;
  motion?: AttachmentLike[] | null;
  [key: string]: unknown;
}): string | null {
  const { raw } = pickRawMotion(fields as Record<string, unknown>);
  return driveMediasProxySrcFromAttachmentRaw(raw);
}

/** 供列表用：Cover 首张图在 `<img src>` 上可用的地址 */
export function coverAttachmentUrlFromFields(fields: {
  Cover?: AttachmentLike[] | null;
  cover?: AttachmentLike[] | null;
  [key: string]: unknown;
}): string | null {
  const { raw } = pickRawField(fields as Record<string, unknown>, COVER_FIELD_KEYS);
  return driveMediasProxySrcFromAttachmentRaw(raw);
}

/**
 * 开发排查：在控制台执行不便时，可看返回值。
 * - `url === null` 且 `hasKey === false` → 接口里可能没有 Motion 字段名（或拼写不一致）
 * - `url === null` 且 `hasKey === true` → 有字段但结构不是附件数组 / 无 url
 * - `url` 有值但页面不显示 → 看 Network 是否 403、或 video onError（跨域等）
 */
export function peekMotionField(fields: Record<string, unknown>): {
  hasKey: boolean;
  keyUsed: string | null;
  rawSummary: string;
  url: string | null;
} {
  const { key, raw } = pickRawMotion(fields);
  if (!key) {
    return { hasKey: false, keyUsed: null, rawSummary: "（无 Motion/motion 键）", url: null };
  }
  let rawSummary: string;
  if (raw === undefined) rawSummary = "undefined";
  else if (raw === null) rawSummary = "null";
  else if (Array.isArray(raw)) rawSummary = `数组 length=${raw.length}`;
  else rawSummary = typeof raw;
  return {
    hasKey: true,
    keyUsed: key,
    rawSummary,
    url: driveMediasProxySrcFromAttachmentRaw(raw),
  };
}

function playbookDebugEnabled(): boolean {
  return (
    typeof process !== "undefined" &&
    (process.env.NEXT_PUBLIC_PLAYBOOK_DEBUG === "true" || process.env.NEXT_PUBLIC_PLAYBOOK_DEBUG === "1")
  );
}

type PlaybookCardCoverMediaProps = {
  coverUrl: string | null;
  motionUrl: string | null;
  /** 底图参数化渐变：请传 `heroGradientSeedForRecord(item)`（以多维表格 Slug 列为主种子）。 */
  seed: string;
  reduceMotion: boolean;
  /** 仅用于调试日志 / data 属性 */
  recordId?: string;
};

type VideoPhase = "idle" | "loaded" | "error";

/**
 * 渐变底 → Motion（z 较低）→ Cover（z 较高）；二者都有时 hover 淡出 Cover 露出下方视频并播放。
 *
 * 排查：`data-playbook-motion` / `title`；DEBUG 下控制台 `[Playbook Motion]`。
 */
export function PlaybookCardCoverMedia({
  coverUrl,
  motionUrl,
  seed,
  reduceMotion,
  recordId,
}: PlaybookCardCoverMediaProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<VideoPhase>("idle");
  const [coverBroken, setCoverBroken] = useState(false);
  const debug = playbookDebugEnabled();

  const coverDisplayOn = isPlaybookCoverImageEnabled();
  const hasCover = coverDisplayOn && Boolean(coverUrl) && !coverBroken;
  const hasMotion = Boolean(motionUrl);
  const coverFadesOnHoverToRevealMotion = hasCover && hasMotion;

  useEffect(() => {
    setPhase("idle");
  }, [motionUrl]);

  useEffect(() => {
    setCoverBroken(false);
  }, [coverUrl]);

  useEffect(() => {
    if (!debug || !recordId) return;
    if (motionUrl) {
      console.info(`[Playbook Motion] record=${recordId} url≈`, motionUrl.slice(0, 96) + (motionUrl.length > 96 ? "…" : ""));
    } else {
      console.info(`[Playbook Motion] record=${recordId} 无可用 URL（字段缺、空数组或无数组内 url/tmp_url）`);
    }
  }, [debug, motionUrl, recordId]);

  const onEnter = useCallback(() => {
    if (reduceMotion || !motionUrl) return;
    const v = videoRef.current;
    if (!v) return;
    void v.play().catch((e) => {
      console.warn("[Playbook Motion video] play() 失败", recordId, e);
    });
  }, [motionUrl, reduceMotion, recordId]);

  const onLeave = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    try {
      v.currentTime = 0;
    } catch {
      /* ignore */
    }
  }, []);

  const onVideoLoaded = useCallback(() => {
    setPhase("loaded");
    if (debug) console.info("[Playbook Motion video] loadeddata", recordId);
  }, [debug, recordId]);

  const onVideoError = useCallback(() => {
    setPhase("error");
    const v = videoRef.current;
    console.warn("[Playbook Motion video] error（常见：链接过期、403、非视频 MIME）", {
      recordId,
      src: motionUrl?.slice(0, 120),
      error: v?.error,
    });
  }, [motionUrl, recordId]);

  const fallbackBg = reduceMotion ? "#1c1917" : getHeroParametricGradient(seed);

  const dataMotion = !motionUrl ? "absent" : phase === "error" ? "error" : phase === "loaded" ? "ready" : "present";
  const dataCover = !coverDisplayOn
    ? coverUrl
      ? "suppressed"
      : "absent"
    : !coverUrl
      ? "absent"
      : coverBroken
        ? "error"
        : "present";

  const titleHint = [
    coverDisplayOn && coverUrl && !coverBroken
      ? `Cover: ${coverUrl.slice(0, 120)}${coverUrl.length > 120 ? "…" : ""}`
      : !coverDisplayOn && coverUrl
        ? "Cover: 已关闭（NEXT_PUBLIC_PLAYBOOK_SHOW_COVER）"
        : null,
    motionUrl
      ? phase === "error"
        ? "Motion 加载失败（见控制台）"
        : `Motion: ${motionUrl.slice(0, 120)}${motionUrl.length > 120 ? "…" : ""}`
      : "无 Motion",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div
      className="absolute inset-0 z-0 overflow-hidden rounded-[inherit]"
      data-playbook-motion={dataMotion}
      data-playbook-cover={dataCover}
      data-playbook-record-id={recordId ?? ""}
      title={titleHint.length > 0 ? titleHint : "无 Cover / Motion，仅渐变"}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div
        className="pointer-events-none absolute inset-0 z-0 transition-[filter] duration-500 ease-[cubic-bezier(0.33,1,0.68,1)] group-hover:brightness-[1.05] group-hover:saturate-[1.06]"
        aria-hidden
        style={{ background: fallbackBg }}
      />
      {motionUrl ? (
        <video
          ref={videoRef}
          className="pointer-events-none absolute inset-0 z-[1] h-full w-full object-cover opacity-100"
          src={motionUrl}
          muted
          playsInline
          loop
          preload="metadata"
          aria-hidden
          onLoadedData={onVideoLoaded}
          onError={onVideoError}
        />
      ) : null}
      {coverDisplayOn && coverUrl && !coverBroken ? (
        <img
          src={coverUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className={`pointer-events-none absolute inset-0 z-[2] h-full w-full object-cover ${
            coverFadesOnHoverToRevealMotion
              ? "transition-opacity duration-300 ease-out group-hover:opacity-0"
              : ""
          }`}
          aria-hidden
          onError={() => {
            setCoverBroken(true);
            console.warn("[Playbook Cover img] error", { recordId, src: coverUrl?.slice(0, 120) });
          }}
        />
      ) : null}
    </div>
  );
}
