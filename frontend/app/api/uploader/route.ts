import { NextResponse } from "next/server";

const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL ?? "http://127.0.0.1:8000";

function withPath(path: string) {
  return `${BACKEND_BASE_URL}${path}`;
}

export async function POST(request: Request) {
  const incoming = await request.formData();
  const file = incoming.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ detail: "file is required" }, { status: 400 });
  }

  const formData = new FormData();
  formData.append("file", file, file.name);

  const response = await fetch(withPath("/v1/uploader/send-file"), {
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
