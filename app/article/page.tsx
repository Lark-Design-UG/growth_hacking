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
import { useSearchParams } from "next/navigation";
import styles from "./article.module.css";

const PRESET_DOCUMENT_ID = "JCKEw8gDBiupjkko8ZCcOtYOnLd";

type ContentSegment =
  | { type: "text"; value: string }
  | { type: "image"; value: string };
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
  blocks?: {
    id: string;
    type: string;
    text?: string;
    level?: number;
    imageUrl?: string;
    imageToken?: string;
    caption?: string;
    columns?: string[];
    raw?: unknown;
  }[];
};

type RenderCtx = { blockIndex: number };

function parseContentSegments(content: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  const imageRegex =
    /!\[[^\]]*]\(((?:https?:\/\/|\/)[^)\s]+)\)|<img[^>]*src=["']((?:https?:\/\/|\/)[^"']+)["'][^>]*>/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;

  while ((match = imageRegex.exec(content)) !== null) {
    const textPart = content.slice(lastIndex, match.index);
    if (textPart) {
      segments.push({ type: "text", value: textPart });
    }
    const imageUrl = match[1] ?? match[2];
    if (imageUrl) {
      segments.push({ type: "image", value: imageUrl });
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

function ArticleContent({
  article,
  blocks,
}: {
  article: ArticleApiData;
  blocks: ArticleBlock[];
}) {
  const isPresetDoc = article.documentId === PRESET_DOCUMENT_ID;
  const blockPayloads = article.blocks ?? [];
  return (
    <section className="space-y-4">
      <a
        href={article.docsUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-block text-sm text-blue-600 hover:underline"
      >
        打开原始飞书文档
      </a>
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
                return (
                  <div key={block.id} className={styles.calloutBlock}>
                    {renderInline(block.text ?? "", `block-callout-${index}`)}
                  </div>
                );
              }
              if (block.type === "quote_container") {
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
              if (block.type === "grid") {
                const columns = block.columns ?? [];
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
                              <LazyImage
                                key={`${block.id}-col-${colIdx}-img-${segIdx}`}
                                src={seg.value}
                                alt={`grid-image-${colIdx}-${segIdx}`}
                                className={styles.gridColumnImage}
                              />
                            ) : (
                              <p
                                key={`${block.id}-col-${colIdx}-text-${segIdx}`}
                                className={styles.gridColumnText}
                              >
                                {renderInline(
                                  seg.value,
                                  `block-grid-${index}-${colIdx}-${segIdx}`
                                )}
                              </p>
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

export default function ArticlePage() {
  const searchParams = useSearchParams();
  const appToken = searchParams.get("appToken") ?? "";
  const tableId = searchParams.get("tableId") ?? "";
  const recordId = searchParams.get("recordId") ?? "";
  const debug = searchParams.get("debug") === "1";

  const [loading, setLoading] = useState(false);
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
    return fromBlocks?.trim() || "飞书文档文章页";
  }, [article]);

  const requestUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (debug) {
      params.set("debug", "1");
      return `/api/article?${params.toString()}`;
    }
    if (appToken && tableId && recordId) {
      params.set("appToken", appToken);
      params.set("tableId", tableId);
      params.set("recordId", recordId);
    }
    const query = params.toString();
    return query ? `/api/article?${query}` : "/api/article";
  }, [appToken, tableId, recordId, debug]);

  useEffect(() => {
    const fetchArticle = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(requestUrl);
        const result = await res.json();
        if (!result.ok) {
          setError(result.error ?? "加载文章失败");
          return;
        }
        setArticle(result.data);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    };

    fetchArticle();
  }, [requestUrl]);

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="relative mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
        <Link
          href="/feishu-table"
          className="absolute left-0 top-6 hidden -translate-x-[110%] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50 lg:inline-flex"
        >
          返回表格页
        </Link>
        <article className="rounded-xl bg-white p-5 shadow-sm sm:p-6 lg:p-7">
          <header className="mb-8 border-b border-gray-100 pb-6">
            <p className="text-sm text-gray-500">Article Template</p>
            <h1 className="mt-2 text-3xl font-bold text-gray-900">{articleTitle}</h1>
            <div className="mt-3 flex items-center gap-4 text-sm">
              <a
                href="/article?debug=1"
                className="text-blue-600 hover:underline"
              >
                调试模式（固定文档）
              </a>
              {debug && appToken && tableId && recordId && (
                <a
                  href={`/article?appToken=${encodeURIComponent(
                    appToken
                  )}&tableId=${encodeURIComponent(
                    tableId
                  )}&recordId=${encodeURIComponent(recordId)}`}
                  className="text-gray-600 hover:underline"
                >
                  返回记录文档模式
                </a>
              )}
            </div>
            {article && (
              <p className="mt-3 text-sm text-gray-500">
                Record: {article.recordId} | Doc: {article.documentId}
                {article.debug ? " | DEBUG" : ""}
                {article.imageUrls?.length
                  ? ` | 图片: ${article.imageUrls.length}`
                  : ""}
                {componentTypes.length
                  ? ` | 组件种类: ${componentTypes.length}（${componentTypes.join(
                      ", "
                    )}）`
                  : ""}
              </p>
            )}
          </header>

          {loading && <p className="text-gray-600">正在加载文档内容...</p>}
          {error && <p className="text-red-600">{error}</p>}

          {!loading && !error && article && (
            <ArticleContent article={article} blocks={articleBlocks} />
          )}
        </article>
      </div>
    </div>
  );
}
