/**
 * Playbook 首页 /api/playbook 共用的多维表定位。
 * Debug：设 NEXT_PUBLIC_PLAYBOOK_DEBUG=true 时改用 .env 中的调试表（与 Lark 链接一致）。
 */

const DEFAULT_APP_TOKEN = "B4K3bAYKTau24es6Dxdcq3FEnig";
const DEFAULT_TABLE_ID = "tblHalmUkZ8AZSgp";

function playbookDebugEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_PLAYBOOK_DEBUG;
  return v === "true" || v === "1";
}

export function getPlaybookAppToken(): string {
  if (playbookDebugEnabled()) {
    const t = process.env.NEXT_PUBLIC_PLAYBOOK_DEBUG_APP_TOKEN?.trim();
    if (t) return t;
  }
  return DEFAULT_APP_TOKEN;
}

export function getPlaybookTableId(): string {
  if (playbookDebugEnabled()) {
    const t = process.env.NEXT_PUBLIC_PLAYBOOK_DEBUG_TABLE_ID?.trim();
    if (t) return t;
  }
  return DEFAULT_TABLE_ID;
}

/** 预留：接口支持按视图拉取时可读取 */
export function getPlaybookViewId(): string | undefined {
  const v = process.env.NEXT_PUBLIC_PLAYBOOK_DEBUG_VIEW_ID?.trim();
  return v || undefined;
}
