/**
 * Hero / Playbook 卡片底图：由**稳定字符串 seed** 经 `hash32` 确定性推出色相、饱和度、椭圆位置等，
 * 再拼成 CSS `background-image`（多层 radial + linear）或供 WebGL 取色（{@link heroShaderHexColorsFromSeed}）。
 *
 * **Playbook 多维表格**：列表与详情应通过 {@link heroGradientSeedForRecord} 生成 seed——
 * **优先使用表格「Slug」列**（字段名常见为 `Slug` / `slug` / `SLUG`）的文本作为**主种子**；
 * 无 Slug 时回退到 `Title`，再回退 `untitled`，并与 `record_id` 组合以保证行级稳定与冲突区分。
 *
 * 后续可改为请求独立接口（例如 `/api/hero-gradient?seed=`）并在此封装替换实现。
 */
function hash32(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return hash >>> 0;
}

function pick(h: number, shift: number, mod: number): number {
  return Math.floor((h >> shift) % mod);
}

/** 多维表格 Slug 列：兼容 API 返回的字段名大小写（与渐变 seed 同源） */
export function playbookSlugFromFields(fields: Record<string, unknown>): string {
  for (const k of ["Slug", "slug", "SLUG"] as const) {
    const v = fields[k];
    if (typeof v === "string") {
      const t = v.trim();
      if (t.length > 0) return t;
    }
  }
  return "";
}

/**
 * Playbook 单行记录 → 喂给 {@link getHeroParametricGradient} / Shader 的 seed 字符串。
 *
 * - **有 Slug**：`「slug」|record_id` —— 渐变主要由 **表格 Slug 字段**决定；末尾拼 `record_id` 防止同 Slug 多行时完全同色。
 * - **无 Slug**：`record_id|「title 或 untitled」` —— 与仅按标题区分时的稳定回退一致。
 */
export function heroGradientSeedForRecord(record: {
  record_id: string;
  fields: { Slug?: string; slug?: string; SLUG?: string; Title?: string; [key: string]: unknown };
}): string {
  const slug = playbookSlugFromFields(record.fields);
  if (slug) return `${slug}|${record.record_id}`;

  const titleRaw = record.fields.Title;
  const title = typeof titleRaw === "string" ? titleRaw.trim() : "";
  const label = title || "untitled";
  return `${record.record_id}|${label}`;
}

function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const lig = Math.max(0, Math.min(100, l)) / 100;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => {
    const k = (n + hue / 30) % 12;
    const c = lig - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Shader 专用：邻近色（色相间隔适中，避免贴太紧）+ 中饱和、高明度。
 * 与 {@link getHeroParametricGradient} 使用同一套色相逻辑（CSS 渐变函数仍可用于其它场景）。
 */
export function heroShaderHexColorsFromSeed(seed: string): {
  color1: string;
  color2: string;
  color3: string;
} {
  const h = hash32(seed);
  const baseHue = pick(h, 0, 360);
  const step1 = 22 + pick(h, 6, 26);
  const step2 = 52 + pick(h, 12, 30);
  const hue1 = baseHue;
  const hue2 = (baseHue + step1) % 360;
  const hue3 = (baseHue + step2) % 360;

  const satBase = 48 + pick(h, 18, 17);
  const sat2 = Math.min(68, satBase + 6 + pick(h, 24, 8));
  const sat3 = Math.max(42, satBase - pick(h, 28, 10));

  const l1 = 88 + pick(h, 4, 8);
  const l2 = 82 + pick(h, 10, 10);
  const l3 = 90 + pick(h, 14, 6);

  return {
    color1: hslToHex(hue1, satBase, l1),
    color2: hslToHex(hue2, sat2, l2),
    color3: hslToHex(hue3, sat3, l3),
  };
}

/**
 * 将任意 **稳定 seed**（如 {@link heroGradientSeedForRecord} 返回值）转为可写进 `style.background` 的多层渐变。
 * 内部：`hash32(seed)` → 从 32 位哈希按位取模得到色相步进、饱和、明度、椭圆中心百分比与线性角度。
 */
export function getHeroParametricGradient(seed: string): string {
  const h = hash32(seed);

  const baseHue = pick(h, 0, 360);
  const step1 = 22 + pick(h, 6, 26);
  const step2 = 52 + pick(h, 12, 30);
  const hueA = baseHue;
  const hueB = (baseHue + step1) % 360;
  const hueC = (baseHue + step2) % 360;

  const sat = 48 + pick(h, 18, 17);
  const sat2 = Math.min(68, sat + 6 + pick(h, 24, 8));
  const sat3 = Math.max(42, sat - pick(h, 28, 10));

  const ligDeep = 72 + pick(h, 4, 10);
  const ligMid = 80 + pick(h, 10, 8);
  const ligGlow = 88 + pick(h, 14, 6);
  const angle = pick(h, 4, 360);

  const rx = 18 + pick(h, 10, 64);
  const ry = 12 + pick(h, 14, 55);
  const rx2 = 70 + pick(h, 20, 28);
  const ry2 = 55 + pick(h, 26, 35);

  return [
    `radial-gradient(ellipse 130% 100% at ${rx}% ${ry}%, hsla(${hueB},${sat2}%,${ligGlow}%,0.28) 0%, transparent 58%)`,
    `radial-gradient(ellipse 90% 70% at ${rx2}% ${ry2}%, hsla(${hueC},${sat3}%,${ligMid}%,0.22) 0%, transparent 52%)`,
    `linear-gradient(${angle}deg, hsl(${hueA},${sat}%,${ligDeep}%) 0%, hsl(${hueC},${sat3}%,${ligMid}%) 48%, hsl(${hueB},${sat2}%,${ligDeep + 4}%) 100%)`,
  ].join(",");
}
