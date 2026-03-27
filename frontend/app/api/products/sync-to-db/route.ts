import { NextRequest, NextResponse } from "next/server";

const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL ?? "http://127.0.0.1:8000";

function withPath(path: string) {
  return `${BACKEND_BASE_URL}${path}`;
}

export async function POST(request: NextRequest) {
  const query = request.nextUrl.searchParams.toString();
  const target = withPath(`/v1/products/sync-to-db${query ? `?${query}` : ""}`);

  const response = await fetch(target, {
    method: "POST",
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
