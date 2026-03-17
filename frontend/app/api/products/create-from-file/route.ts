import { NextResponse } from "next/server";

const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL ?? "http://127.0.0.1:8000";

function withPath(path: string) {
  return `${BACKEND_BASE_URL}${path}`;
}

export async function POST(request: Request) {
  const incoming = await request.formData();
  const file = incoming.get("file");
  const maxChars = incoming.get("maxChars");

  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, message: "file is required", issues: [] }, { status: 400 });
  }

  const formData = new FormData();
  formData.append("file", file, file.name);

  if (typeof maxChars === "string" && maxChars.trim().length > 0) {
    formData.append("max_chars", maxChars);
  }

  const response = await fetch(withPath("/v1/products/create-from-file"), {
    method: "POST",
    body: formData,
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
