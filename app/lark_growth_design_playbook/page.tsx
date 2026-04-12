"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import { getHeroParametricGradient, heroGradientSeedForRecord } from "@/lib/hero-parametric-gradient";
import { PlaybookDeferredShaderCover } from "@/app/lark_growth_design_playbook/playbook-deferred-shader-cover";
import { PlaybookFullscreenPathTracers } from "@/app/lark_growth_design_playbook/playbook-fullscreen-path-tracers";
import { PlaybookSplashPaths } from "@/app/lark_growth_design_playbook/playbook-splash-paths";
import { getPlaybookAppToken, getPlaybookTableId } from "@/lib/playbook-data-source";

const PlaybookHeroShaderBackground = dynamic(() => import("./playbook-hero-shader-bg"), {
  ssr: false,
});

type BaseRecord = {
  record_id: string;
  /** 飞书多维表格记录常见顶层字段，用于「最新」排序 */
  created_time?: number | string;
  last_modified_time?: number | string;
  fields: {
    Title?: string;
    Category?: string;
    Region?: string[];
    Cover?: Array<{
      file_token?: string;
      url?: string;
      tmp_url?: string;
      name?: string;
      type?: string;
      size?: number;
    }>;
    Docs?: {
      link: string;
      text: string;
    };
    Slug?: string;
    Status?: string;
    [key: string]: any;
  };
};

type BaseData = {
  items: BaseRecord[];
  total: number;
  has_more: boolean;
};

const APP_TOKEN = getPlaybookAppToken();
const TABLE_ID = getPlaybookTableId();

/** Hero 全屏 ↔ 卡片：比 cubic 更顺滑的加减速 */
function easeInOutQuint(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 16 * x * x * x * x * x : 1 - Math.pow(-2 * x + 2, 5) / 2;
}

/** 全屏 ↔ 卡片几何插值时长（略短 + RAF 节流可明显减轻卡顿） */
const HERO_SNAP_MS = 640;
/** 切换完成后新 UI 渐显时长（与渐隐时长 HERO_SNAP_MS 分离） */
const HERO_CHROME_FADE_IN_MS = 520;

type HeroSnapAnim = {
  active: boolean;
  startTime: number;
  from: number;
  to: number;
};

function readHeroSpVisual(anim: HeroSnapAnim, spRef: { current: number }, now: number): number {
  if (!anim.active) return spRef.current;
  const u = Math.min(1, (now - anim.startTime) / HERO_SNAP_MS);
  const p = easeInOutQuint(u);
  return anim.from + (anim.to - anim.from) * p;
}

const HERO_CARD_GAP_PX = 12;
/** 卡片顶相对 Hero 外包层的 offset（px），与 `heroLayout.top` 一致；0 表示贴齐内容区顶边 */
const HERO_LOGO_CLEARANCE_PX = 0;
/**
 * 卡片态 main 无左右 padding 时与视口同宽；全屏↔卡片动画收尾 outerW 与此一致。
 */
function playbookMainContentInnerWidthPx(viewportW: number) {
  return Math.max(320, viewportW);
}

/** 卡片态 Hero 高度：视口高度的 1/2（与 `computeHeroLayout` / 全屏↔卡片动画共用） */
function heroCollapsedHeightPx(viewportH: number) {
  const h = Math.max(1, viewportH);
  return Math.round(h * 0.5);
}

function computeHeroLayout(viewportW: number, viewportH: number, p: number) {
  const safeW = Math.max(320, viewportW);
  const safeH = Math.max(480, viewportH);
  const pp = Math.min(1, Math.max(0, p));
  const cardW = playbookMainContentInnerWidthPx(safeW);
  const collapsedH = heroCollapsedHeightPx(viewportH);
  const outerW = (1 - pp) * safeW + pp * cardW;
  const outerH = (1 - pp) * safeH + pp * collapsedH;
  const top = pp * HERO_LOGO_CLEARANCE_PX;
  const viewportScale = safeW > 0 ? outerW / safeW : 1;
  const radius = 12 * pp;
  return { outerW, outerH, top, viewportScale, collapsedH, cardW, radius };
}

function recordRecencyMs(r: BaseRecord): number {
  const raw = r.last_modified_time ?? r.created_time;
  if (raw == null) return 0;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/** Hero 与筛选无关：全表按修改/创建时间取最新的若干条 */
function latestRecordsForHero(items: BaseRecord[], limit: number): BaseRecord[] {
  if (items.length === 0 || limit <= 0) return [];
  const indexed = items.map((item, index) => ({ item, index }));
  indexed.sort((a, b) => {
    const ta = recordRecencyMs(a.item);
    const tb = recordRecencyMs(b.item);
    if (tb !== ta) return tb - ta;
    return b.index - a.index;
  });
  return indexed.slice(0, limit).map(({ item }) => item);
}

/** 卡片 Hero 顶栏「展开全屏」图标 */
function PlaybookCardFullscreenIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M9 3H5a2 2 0 0 0-2 2v4m12-6h4a2 2 0 0 1 2 2v4M7 21H5a2 2 0 0 1-2-2v-4m16 0v4a2 2 0 0 1-2 2h-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type HeroChromeSurface = "fullscreen" | "card";

type PlaybookHeroSlidesCardChromeProps = {
  heroSlides: BaseRecord[];
  activeHeroSlide: number;
  stripEmojiFn: (value: string) => string;
  setActiveHeroSlide: Dispatch<SetStateAction<number>>;
  onToggleLayout: () => void;
};

function PlaybookHeroSlidesCardChrome({
  heroSlides,
  activeHeroSlide,
  stripEmojiFn,
  setActiveHeroSlide,
  onToggleLayout,
}: PlaybookHeroSlidesCardChromeProps) {
  const goHeroRing = useCallback(
    (dir: -1 | 1) => {
      setActiveHeroSlide((prev) => {
        const n = heroSlides.length;
        if (n < 2) return prev;
        if (dir === 1) return prev >= n - 1 ? 0 : prev + 1;
        return prev <= 0 ? n - 1 : prev - 1;
      });
    },
    [heroSlides.length, setActiveHeroSlide],
  );

  if (heroSlides.length === 0) return null;

  const currentSlide =
    heroSlides[Math.max(0, Math.min(heroSlides.length - 1, activeHeroSlide))]!;
  const copyMeta = [currentSlide.fields.Category, currentSlide.fields.Region?.[0]]
    .filter(Boolean)
    .map((value) => stripEmojiFn(String(value)))
    .join(" ｜ ");
  const copyHref = `/article/${currentSlide.fields.Slug || currentSlide.record_id}`;

  return (
    <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col">
      <div
        role="navigation"
        aria-label="Playbook"
        className="relative z-20 flex w-full min-w-0 shrink-0 items-center px-4 pb-2 pt-2.5 text-white sm:px-5 sm:pb-2.5 sm:pt-3 lg:px-6 lg:pb-3 lg:pt-3.5"
      >
        <Link
          href="/lark_growth_design_playbook"
          className="relative z-[1] flex shrink-0 items-center text-white outline-offset-4 ring-offset-transparent focus-visible:ring-2 focus-visible:ring-stone-300/90"
        >
          <Image
            src="/Lark%20Design.svg"
            alt="Lark Design"
            width={186}
            height={38}
            className="h-9 w-auto brightness-0 invert"
            priority
          />
        </Link>
        <p className="pointer-events-none absolute left-1/2 top-1/2 z-0 max-w-[min(100%-5rem,calc(100vw-6rem))] -translate-x-1/2 -translate-y-1/2 px-2 text-center text-[11px] font-semibold uppercase leading-snug tracking-wide text-white sm:max-w-[min(100%-6.5rem,40rem)] sm:text-xs md:text-sm">
          Lark Growth Design Playbook
        </p>
        <button
          type="button"
          onClick={onToggleLayout}
          className="relative z-[1] ml-auto inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-stone-200/80 bg-white/15 text-white transition-[background-color,border-color,opacity] duration-200 ease-out hover:border-stone-100 hover:bg-white/25"
          aria-label="展开全屏"
        >
          <PlaybookCardFullscreenIcon className="size-[1.125rem]" />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-center px-4 pb-14 pt-2 sm:px-6 sm:pb-16 sm:pt-4"
          aria-live="polite"
        >
          <div
            key={currentSlide.record_id}
            className="playbook-hero-copy-swap pointer-events-auto max-w-4xl"
          >
            {copyMeta ? (
              <p className="mb-3 text-left text-xs font-medium uppercase tracking-wide text-white/75 sm:mb-4">
                {copyMeta}
              </p>
            ) : null}
            <h1 className="text-balance text-2xl font-semibold leading-[1.1] tracking-tight text-white sm:text-3xl md:text-4xl lg:text-5xl">
              {currentSlide.fields.Title || "Untitled"}
            </h1>
            <div className="mt-5 flex flex-wrap items-center gap-3 sm:mt-6">
              <Link
                href={copyHref}
                className="inline-flex items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-stone-900 transition-[opacity,transform] duration-200 ease-out hover:opacity-95 active:scale-[0.98] sm:px-5 sm:py-2.5"
              >
                立即阅读
              </Link>
              {heroSlides.length > 1 ? (
                <div className="flex items-center gap-2" role="group" aria-label="切换篇目">
                  <button
                    type="button"
                    aria-label="上一篇，在第一篇时回到最后一篇"
                    onClick={() => goHeroRing(-1)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone-200/80 bg-white/10 text-white transition-colors duration-200 ease-out hover:border-stone-100 hover:bg-white/20 motion-reduce:transition-none sm:h-10 sm:w-10"
                  >
                    <svg viewBox="0 0 24 24" fill="none" className="size-[18px] shrink-0 sm:size-5" aria-hidden>
                      <path
                        d="M7 14.5L12 9.5l5 5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    aria-label="下一篇，在最后一篇时回到第一篇"
                    onClick={() => goHeroRing(1)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone-200/80 bg-white/10 text-white transition-colors duration-200 ease-out hover:border-stone-100 hover:bg-white/20 motion-reduce:transition-none sm:h-10 sm:w-10"
                  >
                    <svg viewBox="0 0 24 24" fill="none" className="size-[18px] shrink-0 sm:size-5" aria-hidden>
                      <path
                        d="M7 9.5L12 14.5l5-5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <nav
          aria-label="篇目切换"
          className="pointer-events-none absolute inset-y-0 right-2 z-30 flex items-center sm:right-3 lg:right-4"
        >
          <ol className="pointer-events-auto flex flex-col items-center gap-2.5 py-6">
            {heroSlides.map((item, i) => {
              const on = i === activeHeroSlide;
              return (
                <li key={item.record_id}>
                  <button
                    type="button"
                    aria-label={`第 ${i + 1} 篇`}
                    aria-current={on ? "true" : undefined}
                    onClick={() => setActiveHeroSlide(i)}
                    className={`block rounded-full transition-[height,width,background-color] duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none ${
                      on
                        ? "h-7 w-[5px] bg-white ring-1 ring-inset ring-stone-400/45"
                        : "h-2 w-2 bg-white/40 hover:bg-white/65"
                    }`}
                  />
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
    </div>
  );
}

type PlaybookHeroSlidesFullscreenChromeProps = {
  heroSlides: BaseRecord[];
  activeHeroSlide: number;
  heroSlidesKey: string;
  stripEmojiFn: (value: string) => string;
  setActiveHeroSlide: Dispatch<SetStateAction<number>>;
  onEnterCardMode: () => void;
};

function PlaybookHeroSlidesFullscreenChrome({
  heroSlides,
  activeHeroSlide,
  heroSlidesKey,
  stripEmojiFn,
  setActiveHeroSlide,
  onEnterCardMode,
}: PlaybookHeroSlidesFullscreenChromeProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const programmaticScrollRef = useRef(false);
  const programmaticScrollClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollSettleRaf = useRef(0);

  const lockProgrammaticScroll = useCallback((ms: number) => {
    programmaticScrollRef.current = true;
    if (programmaticScrollClearRef.current) {
      clearTimeout(programmaticScrollClearRef.current);
    }
    programmaticScrollClearRef.current = setTimeout(() => {
      programmaticScrollClearRef.current = null;
      programmaticScrollRef.current = false;
    }, ms);
  }, []);

  const applySlideFromScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || heroSlides.length === 0) return;
    const h = el.clientHeight;
    if (h < 8) return;
    const i = Math.round(el.scrollTop / h);
    const clamped = Math.max(0, Math.min(heroSlides.length - 1, i));
    setActiveHeroSlide((prev) => (prev === clamped ? prev : clamped));
  }, [heroSlides.length, setActiveHeroSlide]);

  const onScrollAreaScroll = useCallback(() => {
    if (programmaticScrollRef.current) return;
    cancelAnimationFrame(scrollSettleRaf.current);
    scrollSettleRaf.current = requestAnimationFrame(applySlideFromScroll);
  }, [applySlideFromScroll]);

  const goHeroRing = useCallback(
    (dir: -1 | 1) => {
      setActiveHeroSlide((prev) => {
        const n = heroSlides.length;
        if (n < 2) return prev;
        if (dir === 1) return prev >= n - 1 ? 0 : prev + 1;
        return prev <= 0 ? n - 1 : prev - 1;
      });
    },
    [heroSlides.length, setActiveHeroSlide],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || heroSlides.length === 0) return;
    const h = el.clientHeight;
    if (h < 8) return;
    const target = activeHeroSlide * h;
    if (Math.abs(el.scrollTop - target) < 4) {
      return;
    }
    lockProgrammaticScroll(72);
    el.scrollTop = target;
    return () => {
      if (programmaticScrollClearRef.current) {
        clearTimeout(programmaticScrollClearRef.current);
        programmaticScrollClearRef.current = null;
      }
      programmaticScrollRef.current = false;
    };
  }, [activeHeroSlide, heroSlides.length, heroSlidesKey, lockProgrammaticScroll]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (programmaticScrollRef.current) return;
      lockProgrammaticScroll(72);
      const h = el.clientHeight;
      if (h > 0) {
        el.scrollTop = activeHeroSlide * h;
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeHeroSlide, heroSlides.length, lockProgrammaticScroll]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScrollEnd = () => {
      if (programmaticScrollRef.current) return;
      applySlideFromScroll();
    };
    el.addEventListener("scrollend", onScrollEnd);
    return () => el.removeEventListener("scrollend", onScrollEnd);
  }, [applySlideFromScroll]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(scrollSettleRaf.current);
      if (programmaticScrollClearRef.current) clearTimeout(programmaticScrollClearRef.current);
    };
  }, []);

  if (heroSlides.length === 0) return null;

  const currentSlide =
    heroSlides[Math.max(0, Math.min(heroSlides.length - 1, activeHeroSlide))]!;
  const copyMeta = [currentSlide.fields.Category, currentSlide.fields.Region?.[0]]
    .filter(Boolean)
    .map((value) => stripEmojiFn(String(value)))
    .join(" ｜ ");
  const copyHref = `/article/${currentSlide.fields.Slug || currentSlide.record_id}`;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        role="navigation"
        aria-label="Playbook"
        className="relative z-20 grid shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-6 pb-3 pt-6 sm:px-8 sm:pt-8 lg:px-12 lg:pt-10"
      >
        <div className="flex min-w-0 justify-start">
          <Link
            href="/lark_growth_design_playbook"
            className="flex shrink-0 items-center outline-offset-4"
          >
            <Image
              src="/Lark%20Design.svg"
              alt="Lark Design"
              width={186}
              height={38}
              className="h-9 w-auto brightness-0 invert"
              priority
            />
          </Link>
        </div>
        <p className="pointer-events-none max-w-[min(52vw,20rem)] truncate px-2 text-center text-xs font-semibold uppercase tracking-wide text-white/95 sm:max-w-[min(40vw,28rem)] sm:text-sm md:max-w-none md:overflow-visible md:whitespace-normal md:text-clip">
          Lark Growth Design Playbook
        </p>
        <div className="flex min-w-0 justify-end">
          <button
            type="button"
            onClick={onEnterCardMode}
            className="shrink-0 rounded-full border border-white/90 bg-transparent px-3.5 py-1.5 text-xs font-medium text-white transition-colors duration-200 ease-out hover:border-white hover:bg-white/10 sm:px-4 sm:py-2 sm:text-sm"
          >
            查看全部
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={onScrollAreaScroll}
          className="h-full snap-y snap-mandatory overflow-y-auto overscroll-y-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{
            scrollPaddingBottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px))",
          }}
        >
          {heroSlides.map((item) => (
            <div
              key={item.record_id}
              className="min-h-full shrink-0 snap-start"
              aria-hidden
            />
          ))}
        </div>

        <div
          className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-center px-6 pb-20 pt-10 sm:px-8 sm:pb-24 sm:pt-14 lg:px-12 lg:pr-16"
          aria-live="polite"
        >
          <div
            key={currentSlide.record_id}
            className="playbook-hero-copy-swap pointer-events-auto max-w-4xl"
          >
            {copyMeta ? (
              <p className="mb-6 text-left text-xs font-medium uppercase tracking-wide text-white/75">
                {copyMeta}
              </p>
            ) : null}
            <h1 className="text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl">
              {currentSlide.fields.Title || "Untitled"}
            </h1>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href={copyHref}
                className="inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-stone-900 transition-[opacity,transform] duration-200 ease-out hover:opacity-95 active:scale-[0.98]"
              >
                阅读全文
              </Link>
              {heroSlides.length > 1 ? (
                <div className="flex items-center gap-2" role="group" aria-label="切换篇目">
                  <button
                    type="button"
                    aria-label="上一篇，在第一篇时回到最后一篇"
                    onClick={() => goHeroRing(-1)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/90 bg-white/10 text-white transition-colors duration-200 ease-out hover:border-white hover:bg-white/20 motion-reduce:transition-none sm:h-11 sm:w-11"
                  >
                    <svg viewBox="0 0 24 24" fill="none" className="size-5 shrink-0 sm:size-[22px]" aria-hidden>
                      <path
                        d="M7 14.5L12 9.5l5 5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    aria-label="下一篇，在最后一篇时回到第一篇"
                    onClick={() => goHeroRing(1)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/90 bg-white/10 text-white transition-colors duration-200 ease-out hover:border-white hover:bg-white/20 motion-reduce:transition-none sm:h-11 sm:w-11"
                  >
                    <svg viewBox="0 0 24 24" fill="none" className="size-5 shrink-0 sm:size-[22px]" aria-hidden>
                      <path
                        d="M7 9.5L12 14.5l5-5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <nav
          aria-label="篇目切换"
          className="pointer-events-none absolute inset-y-0 right-3 z-30 flex items-center sm:right-5 lg:right-8"
        >
          <ol className="pointer-events-auto flex flex-col items-center gap-2.5 py-8">
            {heroSlides.map((item, i) => {
              const on = i === activeHeroSlide;
              return (
                <li key={item.record_id}>
                  <button
                    type="button"
                    aria-label={`第 ${i + 1} 篇`}
                    aria-current={on ? "true" : undefined}
                    onClick={() => setActiveHeroSlide(i)}
                    className={`block rounded-full transition-[height,width,background-color] duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none ${
                      on
                        ? "h-7 w-[5px] bg-white ring-1 ring-inset ring-white/40"
                        : "h-2 w-2 bg-white/40 hover:bg-white/65"
                    }`}
                  />
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
    </div>
  );
}

function PlaybookHeroEmptyCardChrome({ onToggleLayout }: { onToggleLayout: () => void }) {
  return (
    <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col items-stretch">
      <div
        role="navigation"
        aria-label="Playbook"
        className="relative z-20 flex w-full min-w-0 shrink-0 items-center px-4 pb-2 pt-2.5 text-white sm:px-5 sm:pb-2.5 sm:pt-3 lg:px-6 lg:pb-3 lg:pt-3.5"
      >
        <Link
          href="/lark_growth_design_playbook"
          className="relative z-[1] flex shrink-0 items-center text-white outline-offset-4 ring-offset-transparent focus-visible:ring-2 focus-visible:ring-stone-300/90"
        >
          <Image
            src="/Lark%20Design.svg"
            alt="Lark Design"
            width={186}
            height={38}
            className="h-9 w-auto brightness-0 invert"
            priority
          />
        </Link>
        <p className="pointer-events-none absolute left-1/2 top-1/2 z-0 max-w-[min(100%-5rem,calc(100vw-6rem))] -translate-x-1/2 -translate-y-1/2 px-2 text-center text-[11px] font-semibold uppercase leading-snug tracking-wide text-white sm:max-w-[min(100%-6.5rem,40rem)] sm:text-xs md:text-sm">
          Lark Growth Design Playbook
        </p>
        <button
          type="button"
          onClick={onToggleLayout}
          className="relative z-[1] ml-auto inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-stone-200/80 bg-white/15 text-white transition-[background-color,border-color,opacity] duration-200 ease-out hover:border-stone-100 hover:bg-white/25"
          aria-label="展开全屏"
        >
          <PlaybookCardFullscreenIcon className="size-[1.125rem]" />
        </button>
      </div>
    </div>
  );
}

function PlaybookHeroEmptyFullscreenChrome({ onToggleLayout }: { onToggleLayout: () => void }) {
  return (
    <>
      <div
        role="navigation"
        aria-label="Playbook"
        className="relative z-20 flex shrink-0 items-center justify-between gap-4 px-6 pb-2 pt-6 sm:px-8 sm:pt-8 lg:px-12 lg:pt-10"
      >
        <Link
          href="/lark_growth_design_playbook"
          className="flex min-w-0 shrink-0 items-center outline-offset-4"
        >
          <Image
            src="/Lark%20Design.svg"
            alt="Lark Design"
            width={186}
            height={38}
            className="h-9 w-auto brightness-0 invert"
            priority
          />
        </Link>
        <button
          type="button"
          onClick={onToggleLayout}
          className="shrink-0 rounded-full border border-stone-900/15 bg-white px-3 py-1.5 text-xs font-semibold text-stone-800 transition-colors duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] hover:bg-stone-50 sm:text-sm"
          aria-pressed={false}
          aria-label="收起为卡片"
        >
          卡片
        </button>
      </div>
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center px-6 py-10 sm:px-8 sm:py-14 lg:px-12">
        <div className="max-w-3xl">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl md:text-6xl">
            Lark Growth Design Playbook
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-white/75">
            Discover insights, experiments, and best practices for driving growth through design.
          </p>
        </div>
      </div>
    </>
  );
}

const LINE_CAP_BEFORE_SEAL = 0.88;

export default function PlaybookPage() {
  const [data, setData] = useState<BaseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** 首屏白底遮罩：请求结束后先拉满线再关 */
  const [splashVisible, setSplashVisible] = useState(true);
  /** 0–1，与接口无关的爬行；收到响应后设为 1 并等 transitionend 再关遮罩 */
  const [lineRatio, setLineRatio] = useState(0);
  const [isFetching, setIsFetching] = useState(true);
  /** 为 true 时进度条才有 transform transition（收尾拉满）；爬行阶段为 false 避免每 tick 都动画 */
  const [sealPhase, setSealPhase] = useState(false);
  const sealingRef = useRef(false);
  const splashDismissedRef = useRef(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [isFilterSticky, setIsFilterSticky] = useState(false);
  const [activeHeroSlide, setActiveHeroSlide] = useState(0);
  const [heroSpDisplay, setHeroSpDisplay] = useState(0);
  /** 与 heroSp 目标一致：全屏(0) 时锁整页滚动，卡片(1) 时恢复 */
  const [heroWantsFullLayout, setHeroWantsFullLayout] = useState(true);
  /** 全屏→卡片完成后递增，强制列表重挂载以重播 playbook-card-enter */
  const [cardGridRevealEpoch, setCardGridRevealEpoch] = useState(0);
  /** 正在过渡到卡片模式时隐藏列表，避免 Hero 动画期间先看到静态卡片 */
  const [cardGridAwaitingReveal, setCardGridAwaitingReveal] = useState(false);
  /** 全屏 / 卡片两套 Hero 控件：全屏→卡片在 snap 结束后切换；卡片→全屏在 snap 开始时切换以免宽度被 main 夹住 */
  const [heroChromeSurface, setHeroChromeSurface] = useState<HeroChromeSurface>("fullscreen");
  const [heroChromeVisible, setHeroChromeVisible] = useState(true);
  const [heroChromeFadeMs, setHeroChromeFadeMs] = useState(HERO_SNAP_MS);
  const [viewportSize, setViewportSize] = useState({ w: 1200, h: 800 });
  const heroSpDisplayRef = useRef(0);
  const heroMotionReduceRef = useRef(false);
  /** WebGL 背景在 prefers-reduced-motion 时关闭，仅保留 CSS 渐变 */
  const [reduceHeroShaderMotion, setReduceHeroShaderMotion] = useState(false);
  /** Hero 几何 snap 进行中：暂停路径拖尾 / WebGL 以减轻 GPU 与主线程压力 */
  const [heroSnapBusy, setHeroSnapBusy] = useState(false);
  const splashCurveRef = useRef<SVGPathElement | null>(null);
  const splashHLineRef = useRef<SVGLineElement | null>(null);
  const splashVLineRef = useRef<SVGLineElement | null>(null);
  /** 与 `public/playbook-load-paths.svg` 三条线一一对应：曲线、水平线、竖线 */
  const [splashStrokeLens, setSplashStrokeLens] = useState<[number, number, number]>([0, 0, 0]);
  const heroAnimRef = useRef<HeroSnapAnim>({
    active: false,
    startTime: 0,
    from: 0,
    to: 0,
  });
  const heroScrollPortRef = useRef<HTMLDivElement | null>(null);
  const filterBarRef = useRef<HTMLDivElement | null>(null);

  const beginHeroSnap = useCallback((to: number) => {
    const now = performance.now();
    const visual = readHeroSpVisual(heroAnimRef.current, heroSpDisplayRef, now);
    if (heroMotionReduceRef.current) {
      const a = heroAnimRef.current;
      a.active = false;
      setHeroSnapBusy(false);
      heroSpDisplayRef.current = to;
      setHeroSpDisplay(to);
      setHeroWantsFullLayout(to < 0.5);
      setHeroChromeSurface(to === 1 ? "card" : "fullscreen");
      setHeroChromeFadeMs(HERO_CHROME_FADE_IN_MS);
      setHeroChromeVisible(true);
      setCardGridAwaitingReveal(false);
      if (to === 1) setCardGridRevealEpoch((e) => e + 1);
      return;
    }
    if (Math.abs(visual - to) < 0.004) return;
    setHeroSnapBusy(true);
    setHeroWantsFullLayout(to < 0.5);
    if (to === 0) setCardGridAwaitingReveal(false);
    if (to === 1) setCardGridAwaitingReveal(true);
    /**
     * 卡片→全屏：立刻挂到全屏 DOM。若在 card 分支里动画，header 会受 main 内 `max-width:100%` 限制无法随 outerW 变宽，收尾与全屏布局不一致。
     * 全屏→卡片：仍只在动画结束再切 card（最后一帧宽度已与 main 内容区对齐）。
     */
    if (to === 0) setHeroChromeSurface("fullscreen");
    setHeroChromeFadeMs(HERO_SNAP_MS);
    setHeroChromeVisible(false);
    const a = heroAnimRef.current;
    a.active = true;
    a.startTime = now;
    a.from = visual;
    a.to = to;
  }, []);

  const toggleHeroLayout = useCallback(() => {
    const now = performance.now();
    const visual = readHeroSpVisual(heroAnimRef.current, heroSpDisplayRef, now);
    beginHeroSnap(visual < 0.5 ? 1 : 0);
  }, [beginHeroSnap]);

  const dismissSplash = useCallback(() => {
    if (splashDismissedRef.current) return;
    splashDismissedRef.current = true;
    sealingRef.current = false;
    setSplashVisible(false);
    setLoading(false);
  }, []);

  const fetchData = async () => {
    splashDismissedRef.current = false;
    setLoading(true);
    setSplashVisible(true);
    setLineRatio(0);
    setSealPhase(false);
    setIsFetching(true);
    sealingRef.current = false;
    setError(null);

    try {
      const response = await fetch(
        `/api/test-feishu?action=base&appToken=${APP_TOKEN}&tableId=${TABLE_ID}`
      );
      const result = await response.json();

      if (result.ok) {
        setData(result.data);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setIsFetching(false);
      const reduceMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion) {
        setLineRatio(1);
        dismissSplash();
      } else {
        sealingRef.current = true;
        setSealPhase(true);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setLineRatio(1);
          });
        });
      }
    }
  };

  /** 请求进行中：每帧微增 lineRatio，三条 stroke 同步延伸 */
  useEffect(() => {
    if (!isFetching || !splashVisible) return;
    let raf = 0;
    const tick = () => {
      setLineRatio((p) => {
        if (p >= LINE_CAP_BEFORE_SEAL) return p;
        const room = LINE_CAP_BEFORE_SEAL - p;
        return p + Math.max(0.00035, room * 0.028);
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isFetching, splashVisible]);

  useLayoutEffect(() => {
    if (!splashVisible) return;
    const measure = () => {
      const c = splashCurveRef.current?.getTotalLength() ?? 0;
      const h = splashHLineRef.current?.getTotalLength() ?? 0;
      const v = splashVLineRef.current?.getTotalLength() ?? 0;
      if (c > 0 && h > 0 && v > 0) {
        setSplashStrokeLens([c, h, v]);
      }
    };
    const id = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", measure);
    };
  }, [splashVisible, viewportSize.w, viewportSize.h]);

  const onSplashProgressTransitionEnd = (
    e: React.TransitionEvent<SVGGeometryElement>,
  ) => {
    if (!sealingRef.current) return;
    if (e.propertyName !== "stroke-dashoffset") return;
    dismissSplash();
  };

  /** transitionend 偶发不触发时的兜底 */
  useEffect(() => {
    if (!sealPhase || lineRatio < 1 || !splashVisible) return;
    const t = window.setTimeout(() => {
      if (sealingRef.current) dismissSplash();
    }, 1150);
    return () => window.clearTimeout(t);
  }, [sealPhase, lineRatio, splashVisible, dismissSplash]);

  useEffect(() => {
    fetchData();
  }, []);

  const getCategories = () => {
    if (!data?.items) return [];
    const categories = new Set<string>();
    data.items.forEach((item) => {
      if (item.fields.Category) {
        categories.add(item.fields.Category);
      }
    });
    return Array.from(categories);
  };

  const getRegions = () => {
    if (!data?.items) return [];
    const regions = new Set<string>();
    data.items.forEach((item) => {
      if (item.fields.Region) {
        item.fields.Region.forEach((r) => regions.add(r));
      }
    });
    return Array.from(regions);
  };

  const stripEmoji = (value: string) =>
    value
      .replace(/\p{Extended_Pictographic}/gu, "")
      .replace(/\uFE0F/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const visibleItems = useMemo(() => {
    if (!data?.items) return [];
    return data.items.filter((item) => {
      const categoryMatch = !selectedCategory || item.fields.Category === selectedCategory;
      const regionMatch =
        !selectedRegion || (item.fields.Region && item.fields.Region.includes(selectedRegion));
      return categoryMatch && regionMatch;
    });
  }, [data?.items, selectedCategory, selectedRegion]);
  const HERO_LATEST_COUNT = 5;
  const heroSlides = latestRecordsForHero(data?.items ?? [], HERO_LATEST_COUNT);
  const heroSlidesKey = heroSlides.map((h) => h.record_id).join(",");
  const activeHeroBgRecord =
    heroSlides.length > 0
      ? (heroSlides[Math.max(0, Math.min(heroSlides.length - 1, activeHeroSlide))] ?? null)
      : null;
  const activeHeroBgSeed = activeHeroBgRecord ? heroGradientSeedForRecord(activeHeroBgRecord) : "";

  const scrollPageLocked = heroSlides.length > 0 && heroWantsFullLayout;

  useEffect(() => {
    if (!scrollPageLocked) {
      document.documentElement.style.removeProperty("overflow");
      document.body.style.removeProperty("overflow");
      return;
    }
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    window.scrollTo(0, 0);
    return () => {
      document.documentElement.style.removeProperty("overflow");
      document.body.style.removeProperty("overflow");
    };
  }, [scrollPageLocked]);

  useEffect(() => {
    setActiveHeroSlide(0);
  }, [heroSlidesKey]);

  useEffect(() => {
    if (heroSlides.length === 0) return;
    if (activeHeroSlide >= heroSlides.length) {
      setActiveHeroSlide(0);
    }
  }, [heroSlides.length, activeHeroSlide]);

  useEffect(() => {
    const syncViewport = () =>
      setViewportSize({ w: window.innerWidth, h: window.innerHeight });
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMq = () => {
      heroMotionReduceRef.current = mq.matches;
      setReduceHeroShaderMotion(mq.matches);
    };
    syncMq();
    mq.addEventListener("change", syncMq);
    return () => mq.removeEventListener("change", syncMq);
  }, []);

  /** 全屏 ↔ 卡片：临界值触发后缓动到目标（时长见 HERO_SNAP_MS） */
  useEffect(() => {
    let raf = 0;
    /** 每 2 帧才 setHeroSpDisplay，避免 ~60 次/秒整页 reconcile；收尾帧必刷新 */
    let snapFrame = 0;
    const loop = () => {
      const a = heroAnimRef.current;
      if (a.active) {
        const now = performance.now();
        const u = Math.min(1, (now - a.startTime) / HERO_SNAP_MS);
        const p = easeInOutQuint(u);
        const v = a.from + (a.to - a.from) * p;
        heroSpDisplayRef.current = v;
        snapFrame += 1;
        /** 奇数帧更新 React，偶数帧跳过（约 30fps 布局刷新，首帧必更新） */
        if ((snapFrame & 1) === 1 || u >= 1) {
          setHeroSpDisplay(v);
        }
        if (u >= 1) {
          snapFrame = 0;
          a.active = false;
          heroSpDisplayRef.current = a.to;
          setHeroSpDisplay(a.to);
          setHeroSnapBusy(false);
          const nextSurface: HeroChromeSurface = a.to === 1 ? "card" : "fullscreen";
          setHeroChromeSurface(nextSurface);
          setHeroChromeFadeMs(HERO_CHROME_FADE_IN_MS);
          setHeroChromeVisible(false);
          requestAnimationFrame(() => {
            setHeroChromeVisible(true);
          });
          if (a.to === 1) {
            setCardGridAwaitingReveal(false);
            setCardGridRevealEpoch((e) => e + 1);
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    let raf = 0;

    const tick = () => {
      if (filterBarRef.current) {
        const { top } = filterBarRef.current.getBoundingClientRect();
        /** 筛选条 `top:0` 吸顶；条顶贴近视口顶时显示收缩态 Logo */
        setIsFilterSticky(top <= 6);
      }
    };

    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };

    tick();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", tick);
    };
  }, [loading]);

  const heroSp = heroSpDisplay;
  const heroLayout = computeHeroLayout(viewportSize.w, viewportSize.h, heroSp);
  const heroShellBgTransparent = heroSp < 0.02;
  /** 全屏幻灯：隐藏首屏以下 UI，避免缩放/圆角外漏出白底或列表 */
  const playbookChromeFullscreen = heroChromeSurface === "fullscreen";

  const showPage = !loading;

  useEffect(() => {
    if (!showPage) return;
    if (playbookChromeFullscreen) {
      document.documentElement.style.background = "transparent";
      document.body.style.background = "transparent";
    } else {
      document.documentElement.style.removeProperty("background");
      document.body.style.removeProperty("background");
    }
    return () => {
      document.documentElement.style.removeProperty("background");
      document.body.style.removeProperty("background");
    };
  }, [showPage, playbookChromeFullscreen]);

  return (
    <div
      className={`relative min-h-screen text-stone-900 ${
        playbookChromeFullscreen ? "bg-transparent" : "bg-white"
      }`}
    >
      {splashVisible ? (
        <div
          className="fixed inset-0 z-[200] flex min-h-0 min-w-0 flex-col bg-white"
          style={{ paddingTop: `${heroLayout.top}px` }}
          aria-busy
          aria-live="polite"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(lineRatio * 100)}
        >
          <span className="sr-only">加载中</span>
          {/* 三线铺满视口（含顶栏背后），Logo 叠在上层 */}
          <div className="pointer-events-none absolute inset-0 z-0 flex min-h-0 min-w-0 flex-col">
            <PlaybookSplashPaths
              curveRef={splashCurveRef}
              hLineRef={splashHLineRef}
              vLineRef={splashVLineRef}
              lengths={splashStrokeLens}
              measured={
                splashStrokeLens[0] > 0 &&
                splashStrokeLens[1] > 0 &&
                splashStrokeLens[2] > 0
              }
              lineRatio={lineRatio}
              sealPhase={sealPhase}
              onStrokeTransitionEnd={onSplashProgressTransitionEnd}
            />
          </div>
          {/* 与全屏 Hero 顶栏同一 max-w-7xl + 栅格 + 中右占位，Logo 位置与加载后一致；白底用纯黑 Logo */}
          <div className="relative z-[210] mx-auto w-full max-w-7xl shrink-0 bg-transparent">
            <div
              role="navigation"
              aria-label="Playbook"
              className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-6 pb-3 pt-6 sm:px-8 sm:pt-8 lg:px-12 lg:pt-10"
            >
              <div className="flex min-w-0 justify-start">
                <Link
                  href="/lark_growth_design_playbook"
                  className="flex shrink-0 items-center outline-offset-4"
                >
                  <Image
                    src="/Lark%20Design.svg"
                    alt="Lark Design"
                    width={186}
                    height={38}
                    className="h-9 w-auto brightness-0"
                    priority
                  />
                </Link>
              </div>
              <p
                aria-hidden
                className="pointer-events-none invisible max-w-[min(52vw,20rem)] truncate px-2 text-center text-xs font-semibold uppercase tracking-wide text-white/95 sm:max-w-[min(40vw,28rem)] sm:text-sm md:max-w-none md:overflow-visible md:whitespace-normal md:text-clip"
              >
                Lark Growth Design Playbook
              </p>
              <div className="flex min-w-0 justify-end">
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden
                  className="invisible pointer-events-none shrink-0 rounded-full border border-stone-200 bg-transparent px-3.5 py-1.5 text-xs font-medium text-white sm:px-4 sm:py-2 sm:text-sm"
                >
                  查看全部
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showPage ? (
      <div
        className={`playbook-page-fade-in ${playbookChromeFullscreen ? "min-h-0 overflow-x-clip" : ""}`}
      >
      {playbookChromeFullscreen ? (
        <>
      <div
        ref={heroScrollPortRef}
        className="relative h-fit w-full shrink-0 isolate"
      >
        <div className="relative z-40 w-full" style={{ paddingTop: `${heroLayout.top}px` }}>
      <header
        className={`relative overflow-hidden text-stone-900 ${heroShellBgTransparent ? "bg-transparent" : "bg-white"}`}
        style={{
          position: "relative",
          marginLeft: "auto",
          marginRight: "auto",
          width: `${heroLayout.outerW}px`,
          height: `${heroLayout.outerH}px`,
          borderRadius: `0 0 ${heroLayout.radius}px ${heroLayout.radius}px`,
          maxWidth: "100%",
          boxShadow:
            heroSp > 0.04 && heroSp < 0.88
              ? `0 22px 48px -18px rgba(15,23,42,${0.08 + 0.14 * heroSp})`
              : undefined,
        }}
      >
        {heroSlides.length > 0 ? (
          <div
            className="will-change-transform"
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              width: viewportSize.w,
              height: viewportSize.h,
              marginLeft: -viewportSize.w / 2,
              transform: `scale(${heroLayout.viewportScale})`,
              transformOrigin: "top center",
            }}
          >
            <div className="relative h-full min-h-0 w-full">
              <div className="absolute inset-0">
                {activeHeroBgRecord ? (
                  <div className="pointer-events-none absolute inset-0" aria-hidden>
                    <div
                      className="absolute inset-0 z-0 h-full w-full"
                      style={{ background: getHeroParametricGradient(activeHeroBgSeed) }}
                    />
                    {!reduceHeroShaderMotion ? (
                      <PlaybookHeroShaderBackground
                        seed={activeHeroBgSeed}
                        motionPaused={heroSnapBusy}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>

              <PlaybookFullscreenPathTracers
                active={showPage && playbookChromeFullscreen}
                motionPaused={heroSnapBusy}
                reduceMotion={reduceHeroShaderMotion}
              />

              <div
                className={`pointer-events-auto absolute inset-0 z-10 mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col transition-opacity ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none ${!heroChromeVisible ? "pointer-events-none" : ""}`}
                style={{
                  opacity: heroChromeVisible ? 1 : 0,
                  transitionDuration: `${heroChromeFadeMs}ms`,
                }}
              >
                <PlaybookHeroSlidesFullscreenChrome
                  heroSlides={heroSlides}
                  activeHeroSlide={activeHeroSlide}
                  heroSlidesKey={heroSlidesKey}
                  stripEmojiFn={stripEmoji}
                  setActiveHeroSlide={setActiveHeroSlide}
                  onEnterCardMode={() => beginHeroSnap(1)}
                />
              </div>
            </div>
          </div>
        ) : (
          <div
            className="will-change-transform"
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              width: viewportSize.w,
              height: viewportSize.h,
              marginLeft: -viewportSize.w / 2,
              transform: `scale(${heroLayout.viewportScale})`,
              transformOrigin: "top center",
            }}
          >
          <div className="relative flex h-full min-h-0 w-full flex-col text-white">
            <div className="pointer-events-none absolute inset-0 z-0 h-full w-full" aria-hidden>
              <div
                className="absolute inset-0 h-full w-full"
                style={{ background: getHeroParametricGradient("playbook-empty-hero") }}
              />
              {!reduceHeroShaderMotion ? (
                <PlaybookHeroShaderBackground
                  seed="playbook-empty-hero"
                  motionPaused={heroSnapBusy}
                />
              ) : null}
            </div>
            <PlaybookFullscreenPathTracers
              active={showPage && playbookChromeFullscreen}
              motionPaused={heroSnapBusy}
              reduceMotion={reduceHeroShaderMotion}
            />
            <div
              className={`pointer-events-auto absolute inset-0 z-10 mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col transition-opacity ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none ${!heroChromeVisible ? "pointer-events-none" : ""}`}
              style={{
                opacity: heroChromeVisible ? 1 : 0,
                transitionDuration: `${heroChromeFadeMs}ms`,
              }}
            >
              <PlaybookHeroEmptyFullscreenChrome onToggleLayout={toggleHeroLayout} />
            </div>
          </div>
          </div>
        )}
      </header>
        </div>
      </div>

      <main
        className={`mx-auto max-w-7xl px-6 py-10 sm:px-8 sm:py-10 lg:px-8 ${
          playbookChromeFullscreen
            ? "pointer-events-none invisible m-0 max-h-0 min-h-0 overflow-hidden border-0 p-0 opacity-0"
            : ""
        }`}
        aria-hidden={playbookChromeFullscreen}
      ></main>
        </>
      ) : (
        <div ref={heroScrollPortRef} className="relative w-full min-h-0">
          <main
            className="w-full max-w-none px-0 pb-0 pt-0"
            aria-hidden={false}
          >
            <div className="relative z-40 w-full" style={{ paddingTop: `${heroLayout.top}px` }}>
              <header
                className={`relative overflow-hidden text-stone-900 ${heroShellBgTransparent ? "bg-transparent" : "bg-white"}`}
                style={{
                  position: "relative",
                  marginLeft: "auto",
                  marginRight: "auto",
                  width: `${heroLayout.outerW}px`,
                  height: `${heroLayout.outerH}px`,
                  borderRadius: 0,
                  maxWidth: "100%",
                }}
              >
                {heroSlides.length > 0 ? (
                  /**
                   * 卡片态：header 高度为 outerH，勿再用「整视口高 + scale」全屏套路，否则正文被 overflow-hidden 裁掉。
                   */
                  <div className="relative h-full min-h-0 w-full overflow-hidden">
                    <div className="absolute inset-0">
                      {activeHeroBgRecord ? (
                        <div className="pointer-events-none absolute inset-0" aria-hidden>
                          <div
                            className="absolute inset-0 z-0 h-full w-full"
                            style={{ background: getHeroParametricGradient(activeHeroBgSeed) }}
                          />
                          {!reduceHeroShaderMotion ? (
                            <PlaybookHeroShaderBackground seed={activeHeroBgSeed} motionPaused />
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <div
                      className={`pointer-events-auto absolute inset-0 z-10 mx-auto flex h-full min-h-0 w-full max-w-none flex-col transition-opacity ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none ${!heroChromeVisible ? "pointer-events-none" : ""}`}
                      style={{
                        opacity: heroChromeVisible ? 1 : 0,
                        transitionDuration: `${heroChromeFadeMs}ms`,
                      }}
                    >
                      <PlaybookHeroSlidesCardChrome
                        heroSlides={heroSlides}
                        activeHeroSlide={activeHeroSlide}
                        stripEmojiFn={stripEmoji}
                        setActiveHeroSlide={setActiveHeroSlide}
                        onToggleLayout={toggleHeroLayout}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="relative h-full min-h-0 w-full overflow-hidden">
                    <div className="pointer-events-none absolute inset-0 z-0 h-full w-full text-white" aria-hidden>
                      <div
                        className="absolute inset-0 h-full w-full"
                        style={{ background: getHeroParametricGradient("playbook-empty-hero") }}
                      />
                      {!reduceHeroShaderMotion ? (
                        <PlaybookHeroShaderBackground seed="playbook-empty-hero" motionPaused />
                      ) : null}
                    </div>
                    <div
                      className={`pointer-events-auto absolute inset-0 z-10 mx-auto flex h-full min-h-0 w-full max-w-none flex-col transition-opacity ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none ${!heroChromeVisible ? "pointer-events-none" : ""}`}
                      style={{
                        opacity: heroChromeVisible ? 1 : 0,
                        transitionDuration: `${heroChromeFadeMs}ms`,
                      }}
                    >
                      <PlaybookHeroEmptyCardChrome onToggleLayout={toggleHeroLayout} />
                    </div>
                  </div>
                )}
              </header>
            </div>

            <div
              ref={filterBarRef}
              className="sticky z-50 -mx-6 mb-0 bg-white/95 px-6 py-5 backdrop-blur sm:-mx-8 sm:px-8 sm:py-6 lg:mx-0 lg:px-0 lg:py-7"
              style={{ top: 0 }}
            >
          <div className="relative flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {isFilterSticky && (
              <div className="absolute left-0 top-1/2 hidden -translate-y-1/2 sm:block">
              <Image
                src="/Lark%20Design.svg"
                alt="Lark Design"
                width={124}
                height={24}
                className="h-6 w-auto brightness-0"
              />
              </div>
            )}
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`text-sm transition-colors duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] ${
                  !selectedCategory
                    ? "font-semibold text-stone-900 underline underline-offset-4"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                All Categories
              </button>
              {getCategories().map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`text-sm transition-colors duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] ${
                    selectedCategory === category
                      ? "font-semibold text-stone-900 underline underline-offset-4"
                      : "text-stone-600 hover:text-stone-900"
                  }`}
                >
                  {stripEmoji(category)}
                </button>
              ))}
            </div>
            <span className="text-stone-300">|</span>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
              <button
                onClick={() => setSelectedRegion(null)}
                className={`text-sm transition-colors duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] ${
                  !selectedRegion
                    ? "font-semibold text-stone-900 underline underline-offset-4"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                All Regions
              </button>
              {getRegions().map((region) => (
                <button
                  key={region}
                  onClick={() => setSelectedRegion(region)}
                  className={`text-sm transition-colors duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] ${
                    selectedRegion === region
                      ? "font-semibold text-stone-900 underline underline-offset-4"
                      : "text-stone-600 hover:text-stone-900"
                  }`}
                >
                  {stripEmoji(region)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-0 rounded-lg border border-stone-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {!error && (
          <div>
            {visibleItems.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-lg text-stone-500">No items found for the selected filters.</p>
              </div>
            ) : (
              <div
                className={
                  cardGridAwaitingReveal
                    ? "pointer-events-none select-none opacity-0"
                    : undefined
                }
                aria-hidden={cardGridAwaitingReveal}
              >
              <div className="border border-stone-200">
                <div
                  key={cardGridRevealEpoch}
                  className="grid grid-cols-1 gap-px bg-stone-200 sm:grid-cols-2 lg:grid-cols-4"
                >
                  {Array.from({
                    length: (4 - (visibleItems.length % 4)) % 4,
                  }).map((_, padI) => (
                    <div
                      key={`grid-row-pad-${padI}`}
                      aria-hidden
                      className="hidden aspect-square bg-white p-4 lg:flex lg:flex-col lg:items-center lg:justify-center"
                    >
                      <p className="max-w-[11rem] text-balance text-center text-[11px] font-medium uppercase leading-snug tracking-wide text-stone-400 sm:text-xs">
                        Reserved for the next growth story.
                      </p>
                    </div>
                  ))}
                  {visibleItems.map((item, i) => {
                    const cardCoverSeed = heroGradientSeedForRecord(item);
                    return (
                    <Link
                      key={`${item.record_id}-${selectedCategory ?? "c"}-${selectedRegion ?? "r"}`}
                      href={`/article/${item.fields.Slug || item.record_id}`}
                      className="playbook-card-enter group relative block aspect-square overflow-hidden rounded-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-stone-400"
                      style={{
                        animationDelay: `${Math.min(i, 24) * 64}ms`,
                      }}
                    >
                      <div
                        className="pointer-events-none absolute inset-0 overflow-hidden transition-opacity duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] group-hover:opacity-95"
                        aria-hidden
                      >
                        <div
                          className="absolute inset-0 z-0 h-full w-full"
                          style={{
                            background: getHeroParametricGradient(cardCoverSeed),
                          }}
                        />
                        {!reduceHeroShaderMotion ? (
                          <PlaybookDeferredShaderCover seed={cardCoverSeed} pixelDensity={1} />
                        ) : null}
                      </div>
                      <div className="absolute inset-x-0 bottom-0 z-10 p-3 sm:p-4">
                        <h2 className="text-sm font-semibold leading-snug text-white transition-colors duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] group-hover:text-white sm:text-base">
                          {item.fields.Title}
                        </h2>
                        <p className="mt-1.5 text-xs text-white">
                          {[item.fields.Category, item.fields.Region?.[0]]
                            .filter(Boolean)
                            .map((value) => stripEmoji(String(value)))
                            .join(" ｜ ")}
                        </p>
                      </div>
                    </Link>
                    );
                  })}
                </div>
              </div>
              </div>
            )}
          </div>
        )}
          </main>
        </div>
      )}
      <footer
        className={`mt-0 border-t border-stone-200 ${
          playbookChromeFullscreen
            ? "pointer-events-none invisible m-0 max-h-0 min-h-0 overflow-hidden border-0 p-0 opacity-0"
            : ""
        }`}
        aria-hidden={playbookChromeFullscreen}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-6 text-sm text-stone-500 sm:px-8 lg:px-8">
          <p>© {new Date().getFullYear()} Lark Growth Design Playbook</p>
          <p>Built for growth stories and design insights.</p>
        </div>
      </footer>
      </div>
      ) : null}
    </div>
  );
}
