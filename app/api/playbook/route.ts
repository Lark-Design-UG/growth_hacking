import { getBaseRecords } from "@/lib/feishu/client";

const APP_TOKEN = "B4K3bAYKTau24es6Dxdcq3FEnig";
const TABLE_ID = "tblHalmUkZ8AZSgp";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug");

    const data = await getBaseRecords(APP_TOKEN, TABLE_ID);

    if (!slug) {
      return Response.json({ ok: true, data });
    }

    const items = (data as { items: any[] })?.items || [];
    const record = items.find((item: any) => item.fields?.Slug === slug);

    if (!record) {
      return Response.json({ ok: false, error: "Record not found" }, { status: 404 });
    }

    return Response.json({ ok: true, data: record });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
