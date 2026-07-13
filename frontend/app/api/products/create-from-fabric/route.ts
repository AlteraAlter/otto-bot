import { NextResponse } from "next/server";

import {
  getAuthorizedHeaders,
  toClientResponse,
  withBackendPath,
} from "../../../../lib/auth";

export async function POST(request: Request) {
  const body = await request.text();
  try {
    const response = await fetch(
      withBackendPath("/v1/products/tasks/create-from-factory"),
      {
        method: "POST",
        headers: await getAuthorizedHeaders({
          "content-type": "application/json",
        }),
        body,
        cache: "no-store",
      },
    );

    if (response.status === 504) {
      return NextResponse.json(
        {
          success: false,
          process_state: "FAILED",
          issues: [
            "Backend не ответил вовремя. Процесс не подтвержден, попробуйте запустить подготовку еще раз.",
          ],
          message: "Backend request timed out",
        },
        { status: 504 },
      );
    }

    return toClientResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        process_state: "FAILED",
        issues: [
          error instanceof Error
            ? `Backend недоступен: ${error.message}`
            : "Backend недоступен. Запрос подготовки не был подтвержден.",
        ],
        message: "Backend request failed",
      },
      { status: 502 },
    );
  }
}

export async function DELETE() {
  const response = await fetch(
    withBackendPath("/v1/products/tasks/create-from-factory"),
    {
      method: "DELETE",
      headers: await getAuthorizedHeaders(),
      cache: "no-store",
    },
  );
  return toClientResponse(response);
}
