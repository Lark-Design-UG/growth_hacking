"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type BaseRecord = {
  record_id: string;
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

const APP_TOKEN = "B4K3bAYKTau24es6Dxdcq3FEnig";
const TABLE_ID = "tblHalmUkZ8AZSgp";

export default function PlaybookPage() {
  const [data, setData] = useState<BaseData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [activeHeroIndex, setActiveHeroIndex] = useState(0);
  const [isFilterSticky, setIsFilterSticky] = useState(false);
  const filterBarRef = useRef<HTMLDivElement | null>(null);

  const fetchData = async () => {
    setLoading(true);
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
      setLoading(false);
    }
  };

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

  const filteredItems = () => {
    if (!data?.items) return [];
    return data.items.filter((item) => {
      const categoryMatch = !selectedCategory || item.fields.Category === selectedCategory;
      const regionMatch = !selectedRegion || 
        (item.fields.Region && item.fields.Region.includes(selectedRegion));
      return categoryMatch && regionMatch;
    });
  };

  const getCoverImage = (item: BaseRecord) => {
    if (item.fields.Cover && item.fields.Cover.length > 0 && item.fields.Cover[0].file_token) {
      return `/api/feishu-image?token=${encodeURIComponent(item.fields.Cover[0].file_token)}`;
    }
    return null;
  };

  const stripEmoji = (value: string) =>
    value
      .replace(/\p{Extended_Pictographic}/gu, "")
      .replace(/\uFE0F/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const gradientPresets = [
    "linear-gradient(135deg,#dbeafe 0%,#bfdbfe 45%,#93c5fd 100%)",
    "linear-gradient(135deg,#fae8ff 0%,#e9d5ff 45%,#c4b5fd 100%)",
    "linear-gradient(135deg,#fef3c7 0%,#fde68a 45%,#fcd34d 100%)",
    "linear-gradient(135deg,#dcfce7 0%,#bbf7d0 45%,#86efac 100%)",
    "linear-gradient(135deg,#fee2e2 0%,#fecaca 45%,#fca5a5 100%)",
    "linear-gradient(135deg,#cffafe 0%,#a5f3fc 45%,#67e8f9 100%)",
  ];

  const getGradientForItem = (seed: string) => {
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash = (hash << 5) - hash + seed.charCodeAt(i);
      hash |= 0;
    }
    return gradientPresets[Math.abs(hash) % gradientPresets.length];
  };

  const visibleItems = filteredItems();
  const heroItems = visibleItems.slice(0, 5);
  const activeHeroItem = heroItems[activeHeroIndex];

  const goPrevHero = () => {
    if (heroItems.length === 0) return;
    setActiveHeroIndex((prev) => (prev - 1 + heroItems.length) % heroItems.length);
  };

  const goNextHero = () => {
    if (heroItems.length === 0) return;
    setActiveHeroIndex((prev) => (prev + 1) % heroItems.length);
  };

  useEffect(() => {
    if (heroItems.length === 0) return;

    if (activeHeroIndex >= heroItems.length) {
      setActiveHeroIndex(0);
      return;
    }

    const timer = window.setInterval(goNextHero, 5000);

    return () => window.clearInterval(timer);
  }, [heroItems.length]);

  useEffect(() => {
    const onScroll = () => {
      if (!filterBarRef.current) return;
      const { top } = filterBarRef.current.getBoundingClientRect();
      setIsFilterSticky(top <= 0.5);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-white text-stone-900">
      <header className="relative overflow-hidden bg-[radial-gradient(circle_at_18%_20%,#93c5fd_0%,#60a5fa_34%,#3b82f6_68%,#1d4ed8_100%)] text-white md:min-h-[680px]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_12%,rgba(186,230,253,0.35),transparent_46%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.2)_0%,transparent_36%,rgba(125,211,252,0.22)_78%,transparent_100%)]" />
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 px-6 py-16 sm:px-8 md:py-20 lg:grid-cols-[1fr_1.08fr] lg:items-center lg:px-12">
          <div className="max-w-xl">
            <Image
              src="/Lark%20Design.svg"
              alt="Lark Design"
              width={186}
              height={38}
              className="mb-5 h-9 w-auto"
              priority
            />
            <h1 className="mt-4 text-5xl font-semibold leading-[1.06] tracking-tight sm:text-6xl">
              Lark Growth
              <br />
              Design Playbook
            </h1>
            <p className="mt-6 max-w-md text-base leading-relaxed text-white/72">
              Discover insights, experiments, and best practices for driving growth through design.
            </p>
          </div>

          {heroItems.length > 0 && activeHeroItem ? (
            <div className="mx-auto w-full max-w-[620px]">
              <div className="relative">
                <div className="pointer-events-none absolute -left-14 top-12 h-[72%] w-[38%] rounded-2xl bg-white/18 blur-[1px]" />
                <div className="pointer-events-none absolute -right-10 top-8 h-[76%] w-[32%] rounded-2xl bg-white/14 blur-[1px]" />

                <Link
                  href={`/article/${activeHeroItem.fields.Slug || activeHeroItem.record_id}`}
                  className="relative block overflow-hidden rounded-lg bg-[linear-gradient(180deg,rgba(247,250,255,0.95)_0%,rgba(238,244,255,0.92)_100%)] shadow-[0_24px_48px_-30px_rgba(15,23,42,0.55)] transition-transform duration-500 hover:scale-[1.008]"
                >
                  <div className="aspect-[373/210] overflow-hidden rounded-t-lg border-b border-slate-200/70 bg-white/80">
                    {getCoverImage(activeHeroItem) ? (
                      <img
                        src={getCoverImage(activeHeroItem)!}
                        alt={activeHeroItem.fields.Title || ""}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div
                        className="h-full w-full"
                        style={{
                          background: getGradientForItem(
                            `${activeHeroItem.record_id}-${activeHeroItem.fields.Title || ""}`
                          ),
                        }}
                      />
                    )}
                  </div>

                  <div className="p-4 pt-3">
                    <p className="text-xs text-stone-500">
                      {[activeHeroItem.fields.Category, activeHeroItem.fields.Region?.[0]]
                        .filter(Boolean)
                        .map((value) => stripEmoji(String(value)))
                        .join(" ｜ ")}
                    </p>
                    <h2 className="mt-2 line-clamp-2 text-2xl font-semibold leading-tight text-slate-900 sm:text-[2rem]">
                      {activeHeroItem.fields.Title}
                    </h2>
                    <p className="mt-3 text-sm font-medium text-slate-700">阅读全文 &gt;</p>
                  </div>
                </Link>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  onClick={goPrevHero}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/35 bg-white/10 text-white transition-colors hover:bg-white/20"
                  aria-label="Previous story"
                >
                  &lt;
                </button>
                <button
                  onClick={goNextHero}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/35 bg-white/10 text-white transition-colors hover:bg-white/20"
                  aria-label="Next story"
                >
                  &gt;
                </button>
              </div>
            </div>
          ) : (
            <div
              aria-hidden="true"
              className="mx-auto h-[520px] w-full max-w-[620px] opacity-0 pointer-events-none"
            />
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10 sm:px-8 lg:px-12">
        <div
          ref={filterBarRef}
          className="sticky top-0 z-30 -mx-6 mb-10 bg-white/95 px-6 py-4 backdrop-blur sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12"
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
                className={`text-sm transition-colors ${
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
                  className={`text-sm transition-colors ${
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
                className={`text-sm transition-colors ${
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
                  className={`text-sm transition-colors ${
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
          <div className="mb-8 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {loading && (
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-stone-300 border-t-stone-700"></div>
            <p className="mt-4 text-stone-600">Loading...</p>
          </div>
        )}

        {!loading && !error && (
          <div>
            <div className="grid grid-cols-1 gap-x-8 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
              {visibleItems.map((item) => (
                <Link
                  key={item.record_id}
                  href={`/article/${item.fields.Slug || item.record_id}`}
                  className="group block"
                >
                  {getCoverImage(item) ? (
                    <div className="overflow-hidden rounded-lg bg-stone-100">
                      <img
                        src={getCoverImage(item)!}
                        alt={item.fields.Title || ""}
                        className="aspect-[373/210] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                    </div>
                  ) : (
                    <div
                      className="aspect-[373/210] overflow-hidden rounded-lg"
                      style={{
                        background: getGradientForItem(`${item.record_id}-${item.fields.Title || ""}`),
                      }}
                    />
                  )}

                  <div className="pt-3">
                    <h2 className="text-lg font-medium leading-snug text-stone-900 transition-colors group-hover:text-stone-700">
                      {item.fields.Title}
                    </h2>
                    <p className="mt-2 text-xs text-stone-500">
                      {[item.fields.Category, item.fields.Region?.[0]]
                        .filter(Boolean)
                        .map((value) => stripEmoji(String(value)))
                        .join(" ｜ ")}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {!loading && !error && visibleItems.length === 0 && (
          <div className="text-center py-12">
            <p className="text-lg text-stone-500">No items found for the selected filters.</p>
          </div>
        )}
      </main>
      <footer className="mt-10 border-t border-stone-200">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-6 text-sm text-stone-500 sm:px-8 lg:px-12">
          <p>© {new Date().getFullYear()} Lark Growth Design Playbook</p>
          <p>Built for growth stories and design insights.</p>
        </div>
      </footer>
    </div>
  );
}
