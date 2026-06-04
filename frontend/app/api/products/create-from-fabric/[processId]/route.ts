import { NextResponse } from "next/server";

import {
  getAuthorizedHeaders,
  toClientResponse,
  withBackendPath,
} from "../../../../../lib/auth";

type Params = { params: Promise<{ processId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { processId } = await params;
  const response = await fetch(
    withBackendPath(`/v1/products/tasks/create-from-factory/${encodeURIComponent(processId)}`),
    {
      method: "GET",
      headers: await getAuthorizedHeaders(),
      cache: "no-store",
    },
  );
  return toClientResponse(response);
}

export async function POST(request: Request, { params }: Params) {
  const { processId } = await params;
  const body = await request.text();
  const response = await fetch(
    withBackendPath(
      `/v1/products/tasks/create-from-factory/${encodeURIComponent(processId)}/submit`,
    ),
    {
      method: "POST",
      headers: await getAuthorizedHeaders({
        "content-type": "application/json",
      }),
      body,
      cache: "no-store",
    },
  );
  return toClientResponse(response);
}

export async function PATCH(request: Request, { params }: Params) {
  const { processId } = await params;
  const body = await request.text();
  const response = await fetch(
    withBackendPath(
      `/v1/products/tasks/create-from-factory/${encodeURIComponent(processId)}/draft`,
    ),
    {
      method: "PATCH",
      headers: await getAuthorizedHeaders({
        "content-type": "application/json",
      }),
      body,
      cache: "no-store",
    },
  );
  return toClientResponse(response);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { processId } = await params;
  const response = await fetch(
    withBackendPath(`/v1/products/tasks/create-from-factory/${encodeURIComponent(processId)}`),
    {
      method: "DELETE",
      headers: await getAuthorizedHeaders(),
      cache: "no-store",
    },
  );
  return toClientResponse(response);
}
