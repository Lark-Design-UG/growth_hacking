/**
 * Hero 全屏背景：由稳定 seed 生成的参数化渐变（确定性、可缓存）。
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

export function heroGradientSeedForRecord(record: {
  record_id: string;
  fields: { Slug?: string; Title?: string };
}): string {
  const slug = record.fields.Slug?.trim();
  return slug || `${record.record_id}-${record.fields.Title || ""}`;
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
 * 与 {@link getHeroParametricGradient} 使用同一套色相逻辑，便于与 CSS 底图衔接。
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

  /** 饱和略封顶，避免高明度仍显「闷」 */
  const satBase = Math.min(62, 48 + pick(h, 18, 17));
  const sat2 = Math.min(64, satBase + 4 + pick(h, 24, 8));
  const sat3 = Math.max(40, Math.min(58, satBase - pick(h, 28, 10)));

  /** 三色明度均抬高下限，规避过深底（尤其 color2） */
  const l1 = 90 + pick(h, 4, 6);
  const l2 = 84 + pick(h, 10, 8);
  const l3 = 91 + pick(h, 14, 5);

  return {
    color1: hslToHex(hue1, satBase, l1),
    color2: hslToHex(hue2, sat2, l2),
    color3: hslToHex(hue3, sat3, l3),
  };
}

/** 0..1 浮点，与色相哈希解耦，专用于 waterPlane 形态差异 */
function f01(h: number, shift: number): number {
  return ((h >>> shift) & 4095) / 4095;
}

/**
 * Shader waterPlane：由 seed 确定性偏移强度/频率/相位相关项，静态帧也有明显差异。
 * 与 {@link heroShaderHexColorsFromSeed} 独立派生，避免与配色强相关。
 */
export function heroShaderWaveParamsFromSeed(seed: string): {
  uSpeed: number;
  uStrength: number;
  uDensity: number;
  uFrequency: number;
  uAmplitude: number;
  cDistance: number;
  cPolarAngle: number;
  cAzimuthAngle: number;
  brightness: number;
  grainBlending: number;
} {
  const hA = hash32(`${seed}\u200cwaterPlane`);
  const hB = hash32(`${seed}\u200cwaveform`);

  const uStrength = 2.05 + f01(hA, 0) * 1.95;
  const uDensity = 0.72 + f01(hA, 8) * 0.78;
  const uFrequency = 2.35 + f01(hA, 16) * 4.15;
  const uAmplitude = f01(hA, 24) * 0.32;
  const uSpeed = 0.14 + f01(hB, 0) * 0.38;

  const cDistance = Math.round(20 + f01(hB, 8) * 36);
  const cPolarAngle = Math.round(72 + f01(hB, 16) * 48);
  const cAzimuthAngle = Math.round(18 + f01(hB, 24) * 78);

  /** 整体提亮下限，减少 waterPlane 在静态帧上过暗 */
  const brightness = 0.91 + f01(hB, 4) * 0.13;
  const grainBlending = 0.28 + f01(hA, 4) * 0.38;

  return {
    uSpeed,
    uStrength,
    uDensity,
    uFrequency,
    uAmplitude,
    cDistance,
    cPolarAngle,
    cAzimuthAngle,
    brightness,
    grainBlending,
  };
}

export function getHeroParametricGradient(seed: string): string {
  const h = hash32(seed);

  const baseHue = pick(h, 0, 360);
  const step1 = 22 + pick(h, 6, 26);
  const step2 = 52 + pick(h, 12, 30);
  const hueA = baseHue;
  const hueB = (baseHue + step1) % 360;
  const hueC = (baseHue + step2) % 360;

  const sat = Math.min(62, 48 + pick(h, 18, 17));
  const sat2 = Math.min(64, sat + 4 + pick(h, 24, 8));
  const sat3 = Math.max(40, Math.min(58, sat - pick(h, 28, 10)));

  /** 线性渐变「深」色停点抬高，避免大面积低于 ~78% 明度 */
  const ligDeep = 78 + pick(h, 4, 7);
  const ligMid = 83 + pick(h, 10, 7);
  const ligGlow = 89 + pick(h, 14, 5);
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
