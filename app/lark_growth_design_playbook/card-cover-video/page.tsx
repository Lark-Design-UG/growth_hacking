"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { mountPlaybookHeightmapP5 } from "@/app/lark_growth_design_playbook/playbook-heightmap-p5-mount";
import { getPlaybookAppToken, getPlaybookTableId } from "@/lib/playbook-data-source";
import { heroGradientSeedForRecord, playbookSlugFromFields } from "@/lib/hero-parametric-gradient";

type BaseRecord = {
  record_id: string;
  fields: {
    Title?: string;
    Slug?: string;
    slug?: string;
    [key: string]: unknown;
  };
};

type BaseData = {
  items: BaseRecord[];
  total: number;
  has_more: boolean;
};

const APP_TOKEN = getPlaybookAppToken();
const TABLE_ID = getPlaybookTableId();

function pickVideoMimeType(): string | undefined {
  const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  }
  return undefined;
}

function safeFileSlug(record: BaseRecord): string {
  const raw = playbookSlugFromFields(record.fields) || record.fields.Title?.trim() || record.record_id;
  return raw.replace(/[^\w\u4e00-\u9fff-]+/g, "_").slice(0, 80);
}

export default function CardCoverVideoPage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<ReturnType<typeof mountPlaybookHeightmapP5> | null>(null);

  const [data, setData] = useState<BaseData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => data?.items.find((r) => r.record_id === selectedId) ?? null,
    [data, selectedId],
  );
  const seed = useMemo(
    () => (selected ? heroGradientSeedForRecord(selected) : ""),
    [selected],
  );

  const [outW, setOutW] = useState(720);
  const [outH, setOutH] = useState(720);
  const [durationSec, setDurationSec] = useState(6);
  const [fps, setFps] = useState(24);

  const [log, setLog] = useState("");
  const [recording, setRecording] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/test-feishu?action=base&appToken=${encodeURIComponent(APP_TOKEN)}&tableId=${encodeURIComponent(TABLE_ID)}`,
        );
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || "拉取失败");
        if (!cancelled) setData(json.data as BaseData);
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!data?.items.length) return;
    if (selectedId) return;
    setSelectedId(data.items[0]!.record_id);
  }, [data, selectedId]);

  /** 挂载 / 切换 seed 或输出尺寸 */
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !seed) return undefined;
    mountRef.current?.remove();
    mountRef.current = null;
    host.innerHTML = "";
    const m = mountPlaybookHeightmapP5(host, seed, {
      width: outW,
      height: outH,
      preserveDrawingBuffer: true,
    });
    mountRef.current = m;
    return () => {
      m.remove();
      if (mountRef.current === m) mountRef.current = null;
    };
  }, [seed, outW, outH]);

  const appendLog = useCallback((line: string) => {
    setLog((prev) => (prev ? `${prev}\n${line}` : line));
  }, []);

  const recordCurrentToBlob = useCallback(async (): Promise<Blob> => {
    const canvas = mountRef.current?.getCanvas();
    if (!canvas) throw new Error("画布未就绪");
    const mime = pickVideoMimeType();
    if (!mime) throw new Error("当前浏览器不支持 WebM 录制");

    const stream = canvas.captureStream(fps);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const stopped = new Promise<void>((resolve, reject) => {
      rec.onerror = () => reject(new Error("MediaRecorder 错误"));
      rec.onstop = () => resolve();
    });
    rec.start(100);
    await new Promise((r) => setTimeout(r, Math.max(200, durationSec * 1000)));
    rec.stop();
    await stopped;
    return new Blob(chunks, { type: mime.split(";")[0] || "video/webm" });
  }, [durationSec, fps]);

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onRecordOne = async () => {
    if (!selected) return;
    setRecording(true);
    setLog("");
    try {
      const blob = await recordCurrentToBlob();
      const name = `playbook-cover-${safeFileSlug(selected)}-${selected.record_id}.webm`;
      downloadBlob(blob, name);
      appendLog(`已下载：${name}`);
    } catch (e) {
      appendLog(String(e));
    } finally {
      setRecording(false);
    }
  };

  const onBatch = async () => {
    if (!data?.items.length) return;
    setBatchRunning(true);
    setLog("");
    try {
      for (let i = 0; i < data.items.length; i += 1) {
        const item = data.items[i]!;
        setSelectedId(item.record_id);
        appendLog(`[${i + 1}/${data.items.length}] 准备 ${item.record_id} …`);
        await new Promise((r) => setTimeout(r, 900));
        const blob = await recordCurrentToBlob();
        const name = `playbook-cover-${safeFileSlug(item)}-${item.record_id}.webm`;
        downloadBlob(blob, name);
        appendLog(`已下载：${name}`);
      }
      appendLog("批量完成。");
    } catch (e) {
      appendLog(String(e));
    } finally {
      setBatchRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 border-b border-stone-200 pb-6">
          <p className="text-sm text-stone-500">
            <Link href="/lark_growth_design_playbook" className="text-stone-700 underline-offset-4 hover:underline">
              ← 返回 Playbook
            </Link>
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">卡片封面视频（p5 WebGL）</h1>
          <p className="mt-2 max-w-3xl text-sm text-stone-600">
            使用与首页相同的高度图 shader，按设定分辨率与时长导出 <code className="rounded bg-stone-200/80 px-1">.webm</code>。
            依赖浏览器 <code className="rounded bg-stone-200/80 px-1">canvas.captureStream</code> 与 WebM；若 Safari 不支持请换 Chrome。
          </p>
        </header>

        {loading ? <p className="text-stone-600">加载多维表…</p> : null}
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
        ) : null}

        {!loading && !error && data ? (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">预览</h2>
              <div
                className="mt-2 overflow-hidden rounded-xl border border-stone-200 bg-black shadow-sm"
                style={{ aspectRatio: `${outW} / ${outH}`, maxHeight: "min(70vh, 720px)" }}
              >
                <div ref={hostRef} className="h-full w-full [&_canvas]:h-full [&_canvas]:w-full [&_canvas]:object-contain" />
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={recording || batchRunning || !selected}
                  onClick={() => void onRecordOne()}
                  className="rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-40"
                >
                  {recording ? "录制中…" : "录制当前并下载"}
                </button>
                <button
                  type="button"
                  disabled={recording || batchRunning || !data.items.length}
                  onClick={() => void onBatch()}
                  className="rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-800 transition-opacity disabled:opacity-40"
                >
                  {batchRunning ? "批量进行中…" : "按表顺序全部导出"}
                </button>
              </div>

              {log ? (
                <pre className="mt-4 max-h-48 overflow-auto rounded-lg border border-stone-200 bg-white p-3 text-xs text-stone-700">
                  {log}
                </pre>
              ) : null}
            </div>

            <aside className="space-y-6">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">记录</h2>
                <ul className="mt-2 max-h-[min(50vh,28rem)] space-y-1 overflow-y-auto rounded-lg border border-stone-200 bg-white p-1">
                  {data.items.map((r) => (
                    <li key={r.record_id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(r.record_id)}
                        className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                          r.record_id === selectedId ? "bg-stone-900 text-white" : "hover:bg-stone-100"
                        }`}
                      >
                        <span className="line-clamp-2">{r.fields.Title || r.record_id}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-stone-800">输出</h2>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label className="text-xs text-stone-600">
                    宽 px
                    <input
                      type="number"
                      min={320}
                      max={3840}
                      disabled={recording || batchRunning}
                      value={outW}
                      onChange={(e) => setOutW(Number(e.target.value) || 720)}
                      className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs text-stone-600">
                    高 px
                    <input
                      type="number"
                      min={240}
                      max={2160}
                      disabled={recording || batchRunning}
                      value={outH}
                      onChange={(e) => setOutH(Number(e.target.value) || 720)}
                      className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs text-stone-600">
                    时长（秒）
                    <input
                      type="number"
                      min={1}
                      max={120}
                      step={0.5}
                      disabled={recording || batchRunning}
                      value={durationSec}
                      onChange={(e) => setDurationSec(Number(e.target.value) || 6)}
                      className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs text-stone-600">
                    帧率
                    <input
                      type="number"
                      min={15}
                      max={60}
                      disabled={recording || batchRunning}
                      value={fps}
                      onChange={(e) => setFps(Number(e.target.value) || 24)}
                      className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                </div>
                <p className="mt-3 text-xs text-stone-500">
                  当前 seed（与首页卡片一致）：<br />
                  <code className="mt-1 block break-all text-[11px] text-stone-700">{seed || "—"}</code>
                </p>
              </div>
            </aside>
          </div>
        ) : null}
      </div>
    </div>
  );
}
