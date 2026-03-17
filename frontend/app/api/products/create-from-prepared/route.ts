import { NextResponse } from "next/server";

const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL ?? "http://127.0.0.1:8000";

function withPath(path: string) {
  return `${BACKEND_BASE_URL}${path}`;
}

export async function POST(request: Request) {
  const body = await request.text();
  const response = await fetch(withPath("/v1/products/create-from-prepared"), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body,
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
