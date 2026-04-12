"use client";

import { useEffect, useRef, useState } from "react";

import PlaybookHeroShaderBackground from "./playbook-hero-shader-bg";
import { cancelShaderMount, scheduleShaderMount } from "./playbook-shader-mount-queue";

type PlaybookDeferredShaderCoverProps = {
  seed: string;
  pixelDensity?: number;
  /** 视口外预取距离，越大越早创建 WebGL（略增首屏外开销） */
  rootMargin?: string;
  /** 为 true 时播放 Shader 时间轴（默认静态，用于卡片 hover） */
  hoverActive?: boolean;
};

/**
 * 仅在接近/进入视口时挂载 Shader，离开视口后卸载以释放 WebGL 上下文；
 * 挂载顺序经 {@link scheduleShaderMount} 排队，每帧最多初始化一个。
 */
export function PlaybookDeferredShaderCover({
  seed,
  pixelDensity = 1,
  rootMargin = "200px 0px",
  hoverActive = false,
}: PlaybookDeferredShaderCoverProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(false);
  const inViewRef = useRef(false);
  const mountTokenRef = useRef<ReturnType<typeof scheduleShaderMount> | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      visibleRef.current = true;
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries[0]?.isIntersecting ?? false;
        inViewRef.current = hit;

        if (hit) {
          if (visibleRef.current) return;
          cancelShaderMount(mountTokenRef.current);
          mountTokenRef.current = scheduleShaderMount(() => {
            mountTokenRef.current = null;
            if (!inViewRef.current) return;
            visibleRef.current = true;
            setVisible(true);
          });
        } else {
          cancelShaderMount(mountTokenRef.current);
          mountTokenRef.current = null;
          visibleRef.current = false;
          setVisible(false);
        }
      },
      { root: null, rootMargin, threshold: 0 },
    );

    io.observe(el);
    return () => {
      io.disconnect();
      cancelShaderMount(mountTokenRef.current);
      mountTokenRef.current = null;
    };
  }, [rootMargin]);

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
      {visible ? (
        <PlaybookHeroShaderBackground
          seed={seed}
          motionPaused={!hoverActive}
          pixelDensity={pixelDensity}
          skipRevealDelay
        />
      ) : null}
    </div>
  );
}
