import { NextRequest, NextResponse } from "next/server";

const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL ?? "http://127.0.0.1:8000";

function withPath(path: string) {
  return `${BACKEND_BASE_URL}${path}`;
}

export async function GET(request: NextRequest) {
  const target = withPath(`/v1/products?${request.nextUrl.searchParams.toString()}`);

  const response = await fetch(target, {
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

export async function POST(request: NextRequest) {
  const body = await request.text();
  const response = await fetch(withPath("/v1/products/create"), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body
  });

  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json"
    }
  });
}
