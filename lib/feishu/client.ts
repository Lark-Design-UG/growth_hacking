import { getTenantAccessToken } from "./auth";

type FeishuResponse<T = any> = {
  code: number;
  msg: string;
  data?: T;
};

function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout = 10000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  return fetch(url, {
    ...options,
    signal: controller.signal,
  }).finally(() => clearTimeout(timeoutId));
}

export async function feishuRequest<T = any>(
  url: string,
  options: RequestInit = {},
  timeout = 10000
): Promise<T> {
  const token = await getTenantAccessToken();

  const finalOptions: RequestInit = {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
    cache: "no-store",
  };

  console.log(`[Feishu Request] ${options.method || "GET"} ${url}`);

  const res = await fetchWithTimeout(url, finalOptions, timeout);

  const rawText = await res.text();
  console.log(`[Feishu Response] Status: ${res.status}, Raw:`, rawText);

  if (!res.ok) {
    throw new Error(`Feishu API HTTP error: ${res.status} - ${rawText}`);
  }

  let data: FeishuResponse<T>;
  try {
    data = JSON.parse(rawText);
  } catch (e) {
    throw new Error(`Feishu API response is not JSON: ${rawText}`);
  }

  if (data.code !== 0) {
    throw new Error(`Feishu API error: code=${data.code}, msg=${data.msg}`);
  }

  return data.data as T;
}

export async function getBaseRecords(appToken: string, tableId: string) {
  return feishuRequest(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`
  );
}

export async function getDocumentContent(documentId: string) {
  return feishuRequest(
    `https://open.feishu.cn/open-apis/docx/v1/documents/${documentId}/raw_content`
  );
}

export async function getCurrentUser() {
  return feishuRequest(
    `https://open.feishu.cn/open-apis/contact/v3/users/me`
  );
}

export async function getBaseTables(appToken: string) {
  return feishuRequest(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables`
  );
}

export async function getBaseMeta(appToken: string) {
  return feishuRequest(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}`
  );
}
