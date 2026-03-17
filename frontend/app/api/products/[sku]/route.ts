import { NextResponse } from "next/server";

const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL ?? "http://127.0.0.1:8000";

function withPath(path: string) {
  return `${BACKEND_BASE_URL}${path}`;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ sku: string }> }
) {
  const { sku } = await context.params;
  const response = await fetch(withPath(`/v1/products/${encodeURIComponent(sku)}`), {
    method: "GET",
    cache: "no-store"
  });

  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json"
    }
  });
}
