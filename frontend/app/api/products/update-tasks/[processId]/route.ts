import { NextResponse } from "next/server";

import {
  getAuthorizedHeaders,
  toClientResponse,
  withBackendPath,
} from "../../../../../lib/auth";

type Params = {
  params: Promise<{ processId: string }>;
};

export async function GET(request: Request, { params }: Params) {
  const { processId } = await params;
  const url = new URL(request.url);
  const controller = (url.searchParams.get("controller") ?? "jv").trim();

  const response = await fetch(
    withBackendPath(
      `/v1/products/update-tasks/${encodeURIComponent(processId)}?controller=${encodeURIComponent(controller)}`,
    ),
    {
      method: "GET",
      headers: await getAuthorizedHeaders(),
      cache: "no-store",
    },
  );

  return toClientResponse(response);
}

