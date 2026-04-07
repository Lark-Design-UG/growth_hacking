"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type BaseRecord = {
  record_id: string;
  fields: Record<string, any>;
};

type BaseData = {
  items: BaseRecord[];
  total: number;
  has_more: boolean;
};

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

export default function FeishuTablePage() {
  const [data, setData] = useState<BaseData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appToken, setAppToken] = useState("B4K3bAYKTau24es6Dxdcq3FEnig");
  const [tableId, setTableId] = useState("tblHalmUkZ8AZSgp");

  const fetchData = async () => {
    if (!appToken || !tableId) {
      setError("Please enter both App Token and Table ID");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/test-feishu?action=base&appToken=${appToken}&tableId=${tableId}`
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

  const getFieldKeys = () => {
    if (!data?.items?.length) return [];
    return Object.keys(data.items[0].fields);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">飞书多维表格数据</h1>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                App Token
              </label>
              <input
                type="text"
                value={appToken}
                onChange={(e) => setAppToken(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Table ID
              </label>
              <input
                type="text"
                value={tableId}
                onChange={(e) => setTableId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={fetchData}
                disabled={loading}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "加载中..." : "获取数据"}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {data && (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                共 {data.total} 条记录
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Record ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Article
                    </th>
                    {getFieldKeys().map((key) => (
                      <th
                        key={key}
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.items.map((record) => (
                    <tr key={record.record_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {record.record_id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {collectDocUrl(record.fields) ? (
                          <Link
                            href={`/article?appToken=${encodeURIComponent(
                              appToken
                            )}&tableId=${encodeURIComponent(
                              tableId
                            )}&recordId=${encodeURIComponent(record.record_id)}`}
                            className="text-blue-600 hover:underline"
                          >
                            查看文章
                          </Link>
                        ) : (
                          <span className="text-gray-400">无 docs 链接</span>
                        )}
                      </td>
                      {getFieldKeys().map((key) => (
                        <td
                          key={key}
                          className="px-6 py-4 whitespace-nowrap text-sm text-gray-500"
                        >
                          {typeof record.fields[key] === "object"
                            ? JSON.stringify(record.fields[key])
                            : String(record.fields[key] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
