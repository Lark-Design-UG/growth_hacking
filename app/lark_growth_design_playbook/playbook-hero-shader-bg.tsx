"use client";

import { ShaderGradient, ShaderGradientCanvas } from "@shadergradient/react";
import { useEffect, useMemo, useState } from "react";

import {
  heroShaderHexColorsFromSeed,
  heroShaderWaveParamsFromSeed,
} from "@/lib/hero-parametric-gradient";

/**
 * [@shadergradient/react](https://github.com/ruucm/shadergradient) 动效渐变背景。
 * 仅客户端渲染（由 page 的 dynamic ssr:false 引入）。
 */
type PlaybookHeroShaderBackgroundProps = {
  seed: string;
  /** 卡片态下关闭 Shader 时间轴动画，减轻 GPU 并避免小窗里背景仍在动 */
  motionPaused?: boolean;
  /** 默认 1.2；多卡片网格可降至 1 以降低多 WebGL 上下文开销 */
  pixelDensity?: number;
  /** 视口懒加载场景下跳过 88ms 渐显延迟，避免进屏后再等一截 */
  skipRevealDelay?: boolean;
};

export default function PlaybookHeroShaderBackground({
  seed,
  motionPaused = false,
  pixelDensity = 1.2,
  skipRevealDelay = false,
}: PlaybookHeroShaderBackgroundProps) {
  const { color1, color2, color3 } = useMemo(() => heroShaderHexColorsFromSeed(seed), [seed]);
  const wave = useMemo(() => heroShaderWaveParamsFromSeed(seed), [seed]);
  /** 避免 WebGL 首帧 / 懒挂载与底层 CSS 叠在一起时产生「跳变」，略延迟再渐入 */
  const [layerVisible, setLayerVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setLayerVisible(true);
      return;
    }
    if (skipRevealDelay) {
      const id = requestAnimationFrame(() => setLayerVisible(true));
      return () => cancelAnimationFrame(id);
    }
    const t = window.setTimeout(() => setLayerVisible(true), 88);
    return () => window.clearTimeout(t);
  }, [skipRevealDelay]);

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-[1] overflow-hidden transition-opacity duration-[520ms] ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none ${
        layerVisible ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* 略放大 + 模糊，柔化 WebGL 边缘与色带；父级 overflow-hidden 裁切 */}
      <div
        className="pointer-events-none absolute -inset-[14%] h-[128%] w-[128%] origin-center blur-[clamp(14px,3.2vw,28px)] contrast-[0.96] saturate-[1.02]"
        aria-hidden
      >
        <ShaderGradientCanvas
          pointerEvents="none"
          className="pointer-events-none h-full w-full touch-none"
          style={{ position: "absolute", inset: 0 }}
          pixelDensity={pixelDensity}
          fov={8}
        >
          <ShaderGradient
            control="props"
            animate={motionPaused ? "off" : "on"}
            type="waterPlane"
            shader="defaults"
            uTime={0}
            uSpeed={wave.uSpeed}
            uStrength={wave.uStrength}
            uDensity={wave.uDensity}
            uFrequency={wave.uFrequency}
            uAmplitude={wave.uAmplitude}
            lightType="3d"
            brightness={wave.brightness}
            envPreset="dawn"
            grain="on"
            grainBlending={wave.grainBlending}
            cDistance={wave.cDistance}
            cPolarAngle={wave.cPolarAngle}
            cAzimuthAngle={wave.cAzimuthAngle}
            color1={color1}
            color2={color2}
            color3={color3}
            enableTransition={false}
            zoomOut={false}
            toggleAxis={false}
          />
        </ShaderGradientCanvas>
      </div>
      {/* 极轻 CSS 噪点层，补足胶片感（与 shader grain 叠加） */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.14] mix-blend-overlay"
        aria-hidden
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />
    </div>
  );
}
