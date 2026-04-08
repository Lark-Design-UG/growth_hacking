"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type BaseRecord = {
  record_id: string;
  fields: {
    Title?: string;
    Category?: string;
    Region?: string[];
    Cover?: Array<{
      file_token?: string;
      url?: string;
      tmp_url?: string;
      name?: string;
      type?: string;
      size?: number;
    }>;
    Docs?: {
      link: string;
      text: string;
    };
    Slug?: string;
    Status?: string;
    [key: string]: any;
  };
};

type BaseData = {
  items: BaseRecord[];
  total: number;
  has_more: boolean;
};

const APP_TOKEN = "B4K3bAYKTau24es6Dxdcq3FEnig";
const TABLE_ID = "tblHalmUkZ8AZSgp";

export default function PlaybookPage() {
  const [data, setData] = useState<BaseData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/test-feishu?action=base&appToken=${APP_TOKEN}&tableId=${TABLE_ID}`
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

  const getCategories = () => {
    if (!data?.items) return [];
    const categories = new Set<string>();
    data.items.forEach((item) => {
      if (item.fields.Category) {
        categories.add(item.fields.Category);
      }
    });
    return Array.from(categories);
  };

  const getRegions = () => {
    if (!data?.items) return [];
    const regions = new Set<string>();
    data.items.forEach((item) => {
      if (item.fields.Region) {
        item.fields.Region.forEach((r) => regions.add(r));
      }
    });
    return Array.from(regions);
  };

  const filteredItems = () => {
    if (!data?.items) return [];
    return data.items.filter((item) => {
      const categoryMatch = !selectedCategory || item.fields.Category === selectedCategory;
      const regionMatch = !selectedRegion || 
        (item.fields.Region && item.fields.Region.includes(selectedRegion));
      return categoryMatch && regionMatch;
    });
  };

  const getCoverImage = (item: BaseRecord) => {
    if (item.fields.Cover && item.fields.Cover.length > 0 && item.fields.Cover[0].file_token) {
      return `/api/feishu-image?token=${encodeURIComponent(item.fields.Cover[0].file_token)}`;
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
              Lark Growth Design Playbook
            </h1>
            <p className="mt-4 text-xl text-gray-600 max-w-2xl mx-auto">
              Discover insights, experiments, and best practices for driving growth through design.
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Category
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  !selectedCategory
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                }`}
              >
                All
              </button>
              {getCategories().map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    selectedCategory === category
                      ? "bg-blue-600 text-white"
                      : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Region
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedRegion(null)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  !selectedRegion
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                }`}
              >
                All Regions
              </button>
              {getRegions().map((region) => (
                <button
                  key={region}
                  onClick={() => setSelectedRegion(region)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    selectedRegion === region
                      ? "bg-blue-600 text-white"
                      : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {region}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {loading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent"></div>
            <p className="mt-4 text-gray-600">Loading...</p>
          </div>
        )}

        {!loading && !error && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredItems().map((item) => (
              <Link
                key={item.record_id}
                href={`/article/${item.fields.Slug || item.record_id}`}
                className="block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow group"
              >
                {getCoverImage(item) ? (
                  <div className="aspect-video bg-gray-100 overflow-hidden">
                    <img
                      src={getCoverImage(item)!}
                      alt={item.fields.Title || ""}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                ) : (
                  <div className="aspect-video bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                    <span className="text-4xl">📚</span>
                  </div>
                )}

                <div className="p-6">
                  <div className="flex flex-wrap gap-2 mb-3">
                    {item.fields.Category && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {item.fields.Category}
                      </span>
                    )}
                    {item.fields.Region?.map((region) => (
                      <span
                        key={region}
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
                      >
                        {region}
                      </span>
                    ))}
                  </div>

                  <h2 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                    {item.fields.Title}
                  </h2>
                </div>
              </Link>
            ))}
          </div>
        )}

        {!loading && !error && filteredItems().length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">No items found for the selected filters.</p>
          </div>
        )}
      </main>
    </div>
  );
}
