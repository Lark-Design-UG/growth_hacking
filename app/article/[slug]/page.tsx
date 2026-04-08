"use client";

import {
  Fragment,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import styles from "./article.module.css";

const PRESET_DOCUMENT_ID = "JCKEw8gDBiupjkko8ZCcOtYOnLd";
const APP_TOKEN = "B4K3bAYKTau24es6Dxdcq3FEnig";
const TABLE_ID = "tblHalmUkZ8AZSgp";

type ContentSegment =
  | { type: "text"; value: string }
  | { type: "image"; value: string; alt?: string };
type ArticleBlock =
  | { type: "heading"; text: string; level: number }
  | { type: "paragraph"; text: string }
  | { type: "blockquote"; text: string }
  | { type: "code"; text: string }
  | { type: "hr" }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "table"; rows: string[][] }
  | { type: "image"; url: string };

type ArticleApiData = {
  recordId: string;
  docsUrl: string;
  documentId: string;
  docTitle?: string;
  debug?: boolean;
  content: string;
  imageUrls?: string[];
  partial?: boolean;
  blocks?: {
    id: string;
    type: string;
    text?: string;
    level?: number;
    rows?: string[][];
    imageUrl?: string;
    imageToken?: string;
    caption?: string;
    columns?: string[];
    raw?: unknown;
  }[];
};

type RenderCtx = { blockIndex: number };
type MergedCell = { text: string; rowSpan?: number; colSpan?: number };

function buildRowSpanTable(rows: string[][]): MergedCell[][] {
  if (!rows.length) return [];
  const colCount = Math.max(...rows.map((r) => r.length));
  const normalized = rows.map((r) =>
    Array.from({ length: colCount }, (_, i) => (r[i] ?? "").trim())
  );

  const result: MergedCell[][] = normalized.map((r) =>
    r.map((text) => ({ text }))
  );

  for (let c = 0; c < Math.min(colCount, 1); c++) {
    let anchorRow = -1;
    for (let r = 0; r < normalized.length; r++) {
      const text = normalized[r][c];
      if (text) {
        anchorRow = r;
        continue;
      }
      const rowHasOtherContent = normalized[r].some((v, idx) => idx !== c && Boolean(v));
      if (anchorRow >= 0 && rowHasOtherContent) {
        result[anchorRow][c].rowSpan = (result[anchorRow][c].rowSpan ?? 1) + 1;
        result[r][c] = { text: "", rowSpan: 0 };
      } else {
        anchorRow = -1;
      }
    }
  }

  for (let r = 0; r < normalized.length; r++) {
    const rowHasAnyContent = normalized[r].some(Boolean);
    if (!rowHasAnyContent) continue;

    let anchorCol = -1;
    for (let c = 0; c < colCount; c++) {
      const cell = result[r][c];
      if (cell.rowSpan === 0) continue;

      if (cell.text) {
        anchorCol = c;
        continue;
      }

      if (anchorCol >= 0) {
        result[r][anchorCol].colSpan = (result[r][anchorCol].colSpan ?? 1) + 1;
        result[r][c] = { text: "", colSpan: 0 };
      }
    }
  }

  return result;
}

function renderRichCellContent(text: string, keyPrefix: string): ReactNode[] {
  const segments = parseContentSegments(text);
  const nodes: ReactNode[] = [];
  let idx = 0;

  for (const seg of segments) {
    if (seg.type === "image") {
      nodes.push(
        <LazyImage
          key={`${keyPrefix}-img-${idx++}`}
          src={seg.value}
          alt={seg.alt || `${keyPrefix}-image`}
          className={styles.gridColumnImage}
        />
      );
      if (seg.alt?.trim()) {
        nodes.push(
          <p key={`${keyPrefix}-cap-${idx++}`} className={styles.imageCaption}>
            {seg.alt.trim()}
          </p>
        );
      }
      continue;
    }
    const lines = seg.value.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (!lines.length) continue;
    for (const line of lines) {
      nodes.push(
        <p key={`${keyPrefix}-txt-${idx++}`} className={styles.gridColumnText}>
          {renderInline(line, `${keyPrefix}-inline-${idx}`)}
        </p>
      );
    }
  }

  if (!nodes.length) {
    nodes.push(<Fragment key={`${keyPrefix}-empty`}>{renderInline(text, `${keyPrefix}-plain`)}</Fragment>);
  }
  return nodes;
}

function parseContentSegments(content: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  const imageRegex =
    /!\[([^\]]*)]\(((?:https?:\/\/|\/)[^)\s]+)\)|<img[^>]*src=["']((?:https?:\/\/|\/)[^"']+)["'][^>]*>/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;

  while ((match = imageRegex.exec(content)) !== null) {
    const textPart = content.slice(lastIndex, match.index);
    if (textPart) {
      segments.push({ type: "text", value: textPart });
    }
    const markdownAlt = match[1] ?? "";
    const imageUrl = match[2] ?? match[3];
    if (imageUrl) {
      segments.push({ type: "image", value: imageUrl, alt: markdownAlt });
    }
    lastIndex = imageRegex.lastIndex;
  }

  const tail = content.slice(lastIndex);
  if (tail) {
    segments.push({ type: "text", value: tail });
  }

  return segments;
}

function parseTextSegmentToBlocks(text: string): ArticleBlock[] {
  const blocks: ArticleBlock[] = [];
  const lines = text.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    if (!line) {
      i += 1;
      continue;
    }

    if (line.startsWith("```")) {
      i += 1;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push({ type: "code", text: codeLines.join("\n") });
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2],
      });
      i += 1;
      continue;
    }

    if (/^(-{3,}|_{3,}|\*{3,})$/.test(line)) {
      blocks.push({ type: "hr" });
      i += 1;
      continue;
    }

    if (line.startsWith(">")) {
      blocks.push({ type: "blockquote", text: line.replace(/^>\s?/, "") });
      i += 1;
      continue;
    }

    if (/^[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*+]\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    if (/^\|.+\|$/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\|.+\|$/.test(lines[i].trim())) {
        const row = lines[i]
          .trim()
          .split("|")
          .slice(1, -1)
          .map((cell) => cell.trim());
        rows.push(row);
        i += 1;
      }
      const pureDivider = /^:?-{3,}:?$/;
      const filteredRows = rows.filter(
        (row) => !row.every((cell) => pureDivider.test(cell))
      );
      blocks.push({ type: "table", rows: filteredRows });
      continue;
    }

    const paragraphLines: string[] = [];
    while (i < lines.length) {
      const cur = lines[i].trim();
      if (
        !cur ||
        cur.startsWith("```") ||
        /^(#{1,6})\s+/.test(cur) ||
        /^(-{3,}|_{3,}|\*{3,})$/.test(cur) ||
        cur.startsWith(">") ||
        /^[-*+]\s+/.test(cur) ||
        /^\d+\.\s+/.test(cur)
      ) {
        break;
      }
      paragraphLines.push(lines[i]);
      i += 1;
    }
    if (paragraphLines.length) {
      blocks.push({ type: "paragraph", text: paragraphLines.join("\n") });
    } else {
      i += 1;
    }
  }

  return blocks;
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const tokenRegex =
    /(\[[^\]]+]\((https?:\/\/[^)\s]+)\))|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;
  let idx = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <Fragment key={`${keyPrefix}-text-${idx++}`}>
          {text.slice(lastIndex, match.index)}
        </Fragment>
      );
    }

    if (match[1] && match[2]) {
      const label = match[1].match(/^\[([^\]]+)\]/)?.[1] ?? match[2];
      nodes.push(
        <a
          key={`${keyPrefix}-link-${idx++}`}
          href={match[2]}
          target="_blank"
          rel="noreferrer"
          className={styles.inlineLink}
        >
          {label}
        </a>
      );
    } else if (match[3] && match[4]) {
      nodes.push(
        <strong key={`${keyPrefix}-bold-${idx++}`} className={styles.inlineBold}>
          {match[4]}
        </strong>
      );
    } else if (match[5] && match[6]) {
      nodes.push(
        <em key={`${keyPrefix}-italic-${idx++}`} className={styles.inlineItalic}>
          {match[6]}
        </em>
      );
    } else if (match[7] && match[8]) {
      nodes.push(
        <code key={`${keyPrefix}-code-${idx++}`} className={styles.inlineCode}>
          {match[8]}
        </code>
      );
    }
    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(
      <Fragment key={`${keyPrefix}-tail-${idx++}`}>
        {text.slice(lastIndex)}
      </Fragment>
    );
  }

  if (!nodes.length) {
    nodes.push(<Fragment key={`${keyPrefix}-plain`}>{text}</Fragment>);
  }

  return nodes;
}

function parseArticleBlocks(content: string): ArticleBlock[] {
  const segments = parseContentSegments(content);
  const blocks: ArticleBlock[] = [];

  for (const segment of segments) {
    if (segment.type === "image") {
      blocks.push({ type: "image", url: segment.value });
      continue;
    }
    blocks.push(...parseTextSegmentToBlocks(segment.value));
  }

  return blocks;
}

function LazyImage({
  src,
  alt,
  className,
}: {
  src?: string;
  alt: string;
  className: string;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!wrapRef.current) return;
    if (!src) return;
    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px 0px" }
    );

    observer.observe(wrapRef.current);
    return () => observer.disconnect();
  }, [src]);

  return (
    <div ref={wrapRef} className={styles.lazyImageWrap}>
      {!isLoaded && <div className={styles.lazyImageSkeleton} />}
      {isVisible && src ? (
        <img
          src={src}
          alt={alt}
          className={`${className} ${styles.lazyImage} ${
            isLoaded ? styles.lazyImageLoaded : ""
          }`}
          loading="lazy"
          referrerPolicy="no-referrer"
          onLoad={() => setIsLoaded(true)}
        />
      ) : null}
    </div>
  );
}

function getHeadingClass(level: number): string {
  if (level === 1) return styles.heading1;
  if (level === 2) return styles.heading2;
  return styles.heading3;
}

function renderBlock(block: ArticleBlock, ctx: RenderCtx): ReactNode {
  const { blockIndex } = ctx;
  switch (block.type) {
    case "heading":
      return (
        <h2 key={`heading-${blockIndex}`} className={getHeadingClass(block.level)}>
          {renderInline(block.text, `heading-${blockIndex}`)}
        </h2>
      );
    case "paragraph":
      return (
        <p key={`paragraph-${blockIndex}`} className={styles.paragraph}>
          {renderInline(block.text, `paragraph-${blockIndex}`)}
        </p>
      );
    case "blockquote":
      return (
        <blockquote key={`blockquote-${blockIndex}`} className={styles.blockquote}>
          {renderInline(block.text, `blockquote-${blockIndex}`)}
        </blockquote>
      );
    case "code":
      return (
        <pre key={`code-${blockIndex}`} className={styles.codeBlock}>
          <code>{block.text}</code>
        </pre>
      );
    case "hr":
      return <hr key={`hr-${blockIndex}`} className={styles.hr} />;
    case "ul":
      return (
        <ul key={`ul-${blockIndex}`} className={styles.ul}>
          {block.items.map((item, itemIndex) => (
            <li key={`ul-${blockIndex}-${itemIndex}`} className={styles.li}>
              {renderInline(item, `ul-${blockIndex}-${itemIndex}`)}
            </li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol key={`ol-${blockIndex}`} className={styles.ol}>
          {block.items.map((item, itemIndex) => (
            <li key={`ol-${blockIndex}-${itemIndex}`} className={styles.li}>
              {renderInline(item, `ol-${blockIndex}-${itemIndex}`)}
            </li>
          ))}
        </ol>
      );
    case "table": {
      const [header, ...body] = block.rows;
      return (
        <div key={`table-${blockIndex}`} className={styles.tableWrap}>
          <table className={styles.table}>
            {header && (
              <thead>
                <tr>
                  {header.map((cell, cellIdx) => (
                    <th key={`th-${blockIndex}-${cellIdx}`} className={styles.th}>
                      {renderInline(cell, `th-${blockIndex}-${cellIdx}`)}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {body.map((row, rowIdx) => (
                <tr key={`tr-${blockIndex}-${rowIdx}`}>
                  {row.map((cell, cellIdx) => (
                    <td
                      key={`td-${blockIndex}-${rowIdx}-${cellIdx}`}
                      className={styles.td}
                    >
                      {renderInline(cell, `td-${blockIndex}-${rowIdx}-${cellIdx}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "image":
      return (
        <LazyImage
          key={`img-${blockIndex}`}
          src={block.url}
          alt={`article-image-${blockIndex}`}
          className={styles.image}
        />
      );
    default:
      return null;
  }
}

function SkeletonCallout() {
  return (
    <div className={styles.skeletonCallout}>
      <div className={styles.skeletonLine} style={{ width: "80%" }} />
      <div className={styles.skeletonLine} style={{ width: "60%" }} />
    </div>
  );
}

function SkeletonGrid({ cols }: { cols: number }) {
  return (
    <div
      className={styles.skeletonGrid}
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}
    >
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className={styles.skeletonGridCol}>
          <div className={styles.skeletonImageArea} />
          <div className={styles.skeletonLine} style={{ width: "70%" }} />
          <div className={styles.skeletonLineShort} />
        </div>
      ))}
    </div>
  );
}

function ArticleContent({
  article,
  blocks,
}: {
  article: ArticleApiData;
  blocks: ArticleBlock[];
}) {
  const isPartial = article.partial === true;
  const isPresetDoc = article.documentId === PRESET_DOCUMENT_ID;
  const blockPayloads = article.blocks ?? [];
  return (
    <section className="space-y-4">
      <div className={`${styles.content} ${isPresetDoc ? styles.docPreset : ""}`}>
        {blockPayloads.length
          ? blockPayloads.map((block, index) => {
              if (block.type.startsWith("heading")) {
                const level = block.level ?? 3;
                const cls =
                  level === 1
                    ? styles.heading1
                    : level === 2
                    ? styles.heading2
                    : level === 3
                    ? styles.heading3
                    : level === 4
                    ? styles.heading4
                    : level === 5
                    ? styles.heading5
                    : styles.heading6;
                return (
                  <h2 key={block.id} className={cls}>
                    {renderInline(block.text ?? "", `block-heading-${index}`)}
                  </h2>
                );
              }
              if (block.type === "text") {
                return (
                  <p key={block.id} className={styles.textBlock}>
                    {renderInline(block.text ?? "", `block-text-${index}`)}
                  </p>
                );
              }
              if (block.type === "bullet") {
                return (
                  <ul key={block.id} className={styles.bulletBlock}>
                    <li className={styles.li}>
                      {renderInline(block.text ?? "", `block-bullet-${index}`)}
                    </li>
                  </ul>
                );
              }
              if (block.type === "ordered") {
                return (
                  <ol key={block.id} className={styles.orderedBlock}>
                    <li className={styles.li}>
                      {renderInline(block.text ?? "", `block-ordered-${index}`)}
                    </li>
                  </ol>
                );
              }
              if (block.type === "callout") {
                if (!block.text?.trim() && isPartial) {
                  return <SkeletonCallout key={block.id} />;
                }
                return (
                  <div key={block.id} className={styles.calloutBlock}>
                    {renderInline(block.text ?? "", `block-callout-${index}`)}
                  </div>
                );
              }
              if (block.type === "quote_container") {
                if (!block.text?.trim() && isPartial) {
                  return <SkeletonCallout key={block.id} />;
                }
                return (
                  <blockquote key={block.id} className={styles.quoteBlock}>
                    {renderInline(block.text ?? "", `block-quote-${index}`)}
                  </blockquote>
                );
              }
              if (block.type === "divider") {
                return <hr key={block.id} className={styles.dividerBlock} />;
              }
              if (block.type === "image") {
                return (
                  <figure key={block.id} className={styles.imageBlockWrap}>
                    <LazyImage
                      src={block.imageUrl}
                      alt={block.caption || `article-image-${index}`}
                      className={styles.image}
                    />
                    {block.caption ? (
                      <figcaption className={styles.imageCaption}>
                        {block.caption}
                      </figcaption>
                    ) : null}
                  </figure>
                );
              }
              if (block.type === "table") {
                const rows = block.rows ?? [];
                const mergedRows = buildRowSpanTable(rows);
                const [header, ...body] = mergedRows;
                return (
                  <div key={block.id} className={styles.tableWrap}>
                    <table className={styles.table}>
                      {header?.length ? (
                        <thead>
                          <tr>
                            {header.map((cell, cellIdx) =>
                              cell.rowSpan === 0 || cell.colSpan === 0 ? null : (
                                <th
                                  key={`${block.id}-th-${cellIdx}`}
                                  className={styles.th}
                                  rowSpan={cell.rowSpan && cell.rowSpan > 1 ? cell.rowSpan : undefined}
                                  colSpan={cell.colSpan && cell.colSpan > 1 ? cell.colSpan : undefined}
                                >
                                  {renderRichCellContent(
                                    cell.text,
                                    `block-table-th-${index}-${cellIdx}`
                                  )}
                                </th>
                              )
                            )}
                          </tr>
                        </thead>
                      ) : null}
                      <tbody>
                        {body.map((row, rowIdx) => (
                          <tr key={`${block.id}-tr-${rowIdx}`}>
                            {row.map((cell, cellIdx) =>
                              cell.rowSpan === 0 || cell.colSpan === 0 ? null : (
                                <td
                                  key={`${block.id}-td-${rowIdx}-${cellIdx}`}
                                  className={styles.td}
                                  rowSpan={cell.rowSpan && cell.rowSpan > 1 ? cell.rowSpan : undefined}
                                  colSpan={cell.colSpan && cell.colSpan > 1 ? cell.colSpan : undefined}
                                >
                                  {renderRichCellContent(
                                    cell.text,
                                    `block-table-td-${index}-${rowIdx}-${cellIdx}`
                                  )}
                                </td>
                              )
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              }
              if (block.type === "grid") {
                const columns = block.columns ?? [];
                const hasColumnContent = columns.some((c) => c.trim().length > 0);
                if (!hasColumnContent && isPartial) {
                  const colCount =
                    (block.raw as { column_size?: number } | null)?.column_size ?? 2;
                  return <SkeletonGrid key={block.id} cols={colCount} />;
                }
                if (columns.length) {
                  return (
                    <div
                      key={block.id}
                      className={styles.gridColumns}
                      style={{
                        gridTemplateColumns: `repeat(${Math.max(
                          columns.length,
                          1
                        )}, minmax(0, 1fr))`,
                      }}
                    >
                      {columns.map((column, colIdx) => (
                        <div key={`${block.id}-col-${colIdx}`} className={styles.gridColumn}>
                          {parseContentSegments(column).map((seg, segIdx) =>
                            seg.type === "image" ? (
                              <Fragment key={`${block.id}-col-${colIdx}-img-${segIdx}`}>
                                <LazyImage
                                  src={seg.value}
                                  alt={seg.alt || `grid-image-${colIdx}-${segIdx}`}
                                  className={styles.gridColumnImage}
                                />
                                {seg.alt?.trim() ? (
                                  <p className={styles.imageCaption}>{seg.alt.trim()}</p>
                                ) : null}
                              </Fragment>
                            ) : (
                              seg.value.trim() ? (
                                <p
                                  key={`${block.id}-col-${colIdx}-text-${segIdx}`}
                                  className={styles.gridColumnText}
                                >
                                  {renderInline(
                                    seg.value,
                                    `block-grid-${index}-${colIdx}-${segIdx}`
                                  )}
                                </p>
                              ) : null
                            )
                          )}
                        </div>
                      ))}
                    </div>
                  );
                }
                return (
                  <pre key={block.id} className={styles.gridBlock}>
                    {JSON.stringify(block.raw, null, 2)}
                  </pre>
                );
              }
              if (block.type === "children") {
                return (
                  <pre key={block.id} className={styles.childrenBlock}>
                    {JSON.stringify(block.raw, null, 2)}
                  </pre>
                );
              }
              return (
                <pre key={block.id} className={styles.unknownBlock}>
                  {JSON.stringify(block.raw ?? block, null, 2)}
                </pre>
              );
            })
          : blocks.map((block, blockIndex) => renderBlock(block, { blockIndex }))}
      </div>
      {!!article.imageUrls?.length && (
        <div className="mt-8 border-t border-gray-100 pt-4">
          <p className="mb-2 text-sm font-medium text-gray-600">原图链接</p>
          <ul className="space-y-1 text-sm">
            {article.imageUrls.map((url) => (
              <li key={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-blue-600 hover:underline"
                >
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function collectDocUrl(value: unknown): string | null {
  if (!value) return null;

  if (typeof value === "string") {
    const match = value.match(/https?:\/\/[^\s]+/);
    const url = match?.[0] ?? value;
    if (url.includes("/docx/")) return url;
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = collectDocUrl(item);
      if (hit) return hit;
    }
    return null;
  }

  if (typeof value === "object") {
    for (const val of Object.values(value as Record<string, unknown>)) {
      const hit = collectDocUrl(val);
      if (hit) return hit;
    }
  }

  return null;
}

function extractDocumentId(url: string): string | null {
  const match = url.match(/\/docx\/([A-Za-z0-9]+)/);
  return match?.[1] ?? null;
}

export default function ArticlePage() {
  const [mounted, setMounted] = useState(false);
  const bgShader = "none";
  const params = useParams();
  const slug = params.slug as string;

  const [loading, setLoading] = useState(false);
  const [streamComplete, setStreamComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [article, setArticle] = useState<ArticleApiData | null>(null);
  const articleBlocks = useMemo(
    () => (article ? parseArticleBlocks(article.content) : []),
    [article]
  );
  const componentTypes = useMemo(
    () =>
      article?.blocks?.length
        ? Array.from(new Set(article.blocks.map((block) => block.type)))
        : Array.from(new Set(articleBlocks.map((block) => block.type))),
    [article, articleBlocks]
  );
  const articleTitle = useMemo(() => {
    if (article?.docTitle?.trim()) {
      return article.docTitle.trim();
    }
    const fromBlocks = article?.blocks?.find((block) =>
      block.type.startsWith("heading")
    )?.text;
    return fromBlocks?.trim() || "";
  }, [article]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadArticle = async () => {
      setLoading(true);
      setStreamComplete(false);
      setError(null);
      setArticle(null);

      try {
        const playbookRes = await fetch(`/api/playbook?slug=${encodeURIComponent(slug)}`);
        const playbookResult = await playbookRes.json();

        if (!playbookResult.ok) {
          throw new Error(playbookResult.error || "Record not found");
        }

        const record = playbookResult.data;
        const docsUrl = collectDocUrl(record.fields) ?? "";
        const documentId = extractDocumentId(docsUrl) ?? "";

        const articleRes = await fetch(
          `/api/article?appToken=${APP_TOKEN}&tableId=${TABLE_ID}&recordId=${record.record_id}&stream=1`
        );

        if (!articleRes.ok || !articleRes.body) {
          throw new Error(`HTTP ${articleRes.status}`);
        }

        const reader = articleRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done || cancelled) break;

          buffer += decoder.decode(value, { stream: !done });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            const msg = JSON.parse(line) as {
              type: string;
              data?: ArticleApiData;
              error?: string;
              recordId?: string;
              docsUrl?: string;
              documentId?: string;
              docTitle?: string;
              debug?: boolean;
              content?: string;
              imageUrls?: string[];
              blocks?: ArticleApiData["blocks"];
            };

            if (cancelled) break;

            if (msg.type === "partial") {
              setArticle({
                recordId: msg.recordId ?? record.record_id,
                docsUrl: msg.docsUrl ?? docsUrl,
                documentId: msg.documentId ?? documentId,
                docTitle: msg.docTitle,
                debug: msg.debug,
                content: msg.content ?? "",
                imageUrls: msg.imageUrls ?? [],
                blocks: msg.blocks,
                partial: true,
              });
              setLoading(false);
            } else if (msg.type === "complete") {
              setArticle(msg.data ?? null);
              setStreamComplete(true);
              setLoading(false);
            } else if (msg.type === "error") {
              setError(msg.error ?? "加载文章失败");
              setLoading(false);
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(String(err));
          setLoading(false);
        }
      }
    };

    loadArticle();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (!mounted) {
    return (
      <div className="relative min-h-screen pb-10 pt-[72px]">
        <div
          className="pointer-events-none fixed inset-0 -z-10"
          style={{
            backgroundImage: bgShader,
            backgroundColor: "#f3f4f6",
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
            backgroundPosition: "center center",
          }}
        />
        <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-10">
          <article className="rounded-2xl border border-white/80 bg-white/92 p-5 shadow-[0_20px_60px_-35px_rgba(15,23,42,0.45)] backdrop-blur-sm sm:p-6 lg:p-8">
            <div className="mx-auto mb-10 flex max-w-[940px] items-center justify-between">
              <span className="inline-block h-10 w-10 animate-pulse rounded-full bg-gray-100" />
              <span className="inline-block h-8 w-8 animate-pulse rounded-md bg-gray-100" />
            </div>
            <header className="mx-auto mb-4 max-w-[940px] border-b border-gray-100 pb-4">
              <h1 className="mt-8 text-3xl font-bold text-gray-900 sm:text-4xl">
                <span className="block h-10 w-2/3 animate-pulse rounded bg-gray-200" />
              </h1>
            </header>
          </article>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen pb-10 pt-[72px]">
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          backgroundImage: bgShader,
          backgroundColor: "#f3f4f6",
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
          backgroundPosition: "center center",
        }}
      />
      <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-10">
        <article className="rounded-2xl border border-white/80 bg-white/92 p-5 shadow-[0_20px_60px_-35px_rgba(15,23,42,0.45)] backdrop-blur-sm sm:p-6 lg:p-8">
          <div className="mx-auto mb-10 flex max-w-[940px] items-center justify-between">
            <Link
              href="/lark_growth_design_playbook"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                <path d="M19 12H5" />
                <path d="M12 19l-7-7 7-7" />
              </svg>
            </Link>
            {article?.docsUrl ? (
              <a
                href={article.docsUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="打开原始飞书文档"
                title="打开原始飞书文档"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-blue-600"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                >
                  <path d="M14 3h7v7" />
                  <path d="M10 14L21 3" />
                  <path d="M21 14v7h-7" />
                  <path d="M3 10v11h11" />
                </svg>
              </a>
            ) : (
              <span className="inline-block h-8 w-8 animate-pulse rounded-md bg-gray-100" />
            )}
          </div>
          <header className="mx-auto mb-4 max-w-[940px] border-b border-gray-100 pb-4">
            <h1 className="mt-8 text-3xl font-bold text-gray-900 sm:text-4xl">
              {!article ? (
                <span className="block h-10 w-2/3 animate-pulse rounded bg-gray-200" />
              ) : (
                articleTitle
              )}
            </h1>
          </header>

          {loading && !article && (
            <section className="space-y-4">
              <div className={`${styles.content} ${styles.docPreset}`}>
                <div className={styles.heading2}>
                  <div className={styles.skeletonLine} style={{ width: "42%" }} />
                </div>
                <p className={styles.textBlock}>
                  <span className={styles.skeletonLine} style={{ width: "96%" }} />
                </p>
                <p className={styles.textBlock}>
                  <span className={styles.skeletonLine} style={{ width: "88%" }} />
                </p>
                <div className={styles.imageBlockWrap}>
                  <div className={styles.skeletonImageArea} />
                </div>
              </div>
            </section>
          )}
          {error && <p className="text-red-600">{error}</p>}

          {article && (
            <ArticleContent article={article} blocks={articleBlocks} />
          )}

          {article?.partial && !streamComplete && (
            <div className={styles.skeletonCallout}>
              <div className={styles.skeletonLine} style={{ width: "32%" }} />
              <div className={styles.skeletonLineShort} />
            </div>
          )}
        </article>
      </div>
    </div>
  );
}
