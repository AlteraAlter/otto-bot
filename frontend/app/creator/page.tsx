"use client";

import Link from "next/link";
import { ChangeEvent, DragEvent, FormEvent, useMemo, useState } from "react";

type UploadState = "idle" | "loading" | "success" | "error";

type CreationIssue = {
  index: number;
  stage: string;
  message: string;
};

type CreationResponse = {
  success: boolean;
  message?: string;
  source_items?: number;
  normalized_items?: number;
  created_items?: number;
  skipped_items?: number;
  issues?: CreationIssue[];
  request_bodies?: Record<string, unknown>[];
};

function valueToCell(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function cellToValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);

  const first = trimmed[0];
  if (first === "{" || first === "[" || first === '"') {
    try {
      return JSON.parse(trimmed);
    } catch {
      return raw;
    }
  }

  return raw;
}

function buildTableRows(items: Record<string, unknown>[]): {
  columns: string[];
  rows: Record<string, string>[];
} {
  const keySet = new Set<string>();
  items.forEach((item) => Object.keys(item).forEach((key) => keySet.add(key)));
  const columns = Array.from(keySet);
  const rows = items.map((item) => {
    const row: Record<string, string> = {};
    columns.forEach((key) => {
      row[key] = valueToCell(item[key]);
    });
    return row;
  });
  return { columns, rows };
}

function tableRowsToPayload(rows: Record<string, string>[], columns: string[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((column) => {
      const parsed = cellToValue(row[column] ?? "");
      if (parsed !== undefined) {
        obj[column] = parsed;
      }
    });
    return obj;
  });
}

export default function CreatorPage() {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [maxChars, setMaxChars] = useState<string>("2000");
  const [message, setMessage] = useState<string>(
    "Upload JSON, run script, edit table cells, then send to create endpoint."
  );
  const [responseBody, setResponseBody] = useState<string>("");
  const [issues, setIssues] = useState<CreationIssue[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [tableColumns, setTableColumns] = useState<string[]>([]);
  const [tableRows, setTableRows] = useState<Record<string, string>[]>([]);

  const fileLabel = useMemo(() => {
    if (!file) return "No file selected";
    return `${file.name} (${Math.round(file.size / 1024)} KB)`;
  }, [file]);

  const currentJsonPreview = useMemo(() => {
    try {
      const payload = tableRowsToPayload(tableRows, tableColumns);
      return JSON.stringify(payload, null, 2);
    } catch (e) {
      console.error("Preview error", e);
      return "Invalid JSON preview";
    }
  }, [tableRows, tableColumns]);

  function pickFile(next: File | null) {
    if (!next) {
      setFile(null);
      setTableColumns([]);
      setTableRows([]);
      return;
    }

    if (!next.name.toLowerCase().endsWith(".json")) {
      setState("error");
      setMessage("Only .json files are allowed.");
      setFile(null);
      setTableColumns([]);
      setTableRows([]);
      return;
    }

    setFile(next);
    setState("idle");
    setMessage("Ready to run script.");
    setResponseBody("");
    setIssues([]);
    setTableColumns([]);
    setTableRows([]);
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    pickFile(event.target.files?.[0] ?? null);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragOver(false);
    pickFile(event.dataTransfer.files?.[0] ?? null);
  }

  function onDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragOver(true);
  }

  function onDragLeave(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragOver(false);
  }

  function updateCell(rowIndex: number, column: string, value: string) {
    setTableRows((prev) => {
      const next = [...prev];
      next[rowIndex] = { ...next[rowIndex], [column]: value };
      return next;
    });
  }

  async function handleRunScript(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setState("error");
      setMessage("Please choose or drop a JSON file.");
      return;
    }

    setState("loading");
    setMessage("Running script and preparing request JSON (no send yet)...");
    setResponseBody("");
    setIssues([]);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("maxChars", maxChars);

      const response = await fetch("/api/products/prepare-from-file", {
        method: "POST",
        body: formData,
        cache: "no-store"
      });
      console.log(response)

      const text = await response.text();
      console.log(text)
      const parsed = (() => {
        try {
          return JSON.parse(text) as CreationResponse;
        } catch {
          return null;
        }
      })();

      const pretty = parsed ? JSON.stringify(parsed, null, 2) : text;
      setResponseBody(pretty);
      setIssues(Array.isArray(parsed?.issues) ? parsed.issues : []);

      if (!response.ok) {
        setState("error");
        setMessage(parsed?.message ?? `Failed with status ${response.status}`);
        setTableColumns([]);
        setTableRows([]);
        return;
      }

      const requestBodies = Array.isArray(parsed?.request_bodies) ? parsed.request_bodies : [];
      const { columns, rows } = buildTableRows(requestBodies);
      setTableColumns(columns);
      setTableRows(rows);

      setState("success");
      setMessage(
        `Script completed. ${rows.length} row(s) loaded into table editor. Edit any cell, then send.`
      );
    } catch (error) {
      setState("error");
      const detail = error instanceof Error ? error.message : "Unknown error";
      setMessage(`Request failed: ${detail}`);
    }
  }

  async function handleSendToCreate() {
    if (tableRows.length === 0 || tableColumns.length === 0) {
      setState("error");
      setMessage("Run script first so table has data.");
      return;
    }

    const requestBodies = tableRowsToPayload(tableRows, tableColumns);

    if (requestBodies.length === 0) {
      setState("error");
      setMessage("No valid table rows to send.");
      return;
    }

    setState("loading");
    setMessage("Sending edited table data to create endpoint...");
    setIssues([]);

    try {
      const response = await fetch("/api/products/create-from-prepared", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ request_bodies: requestBodies }),
        cache: "no-store"
      });

      const text = await response.text();
      const parsed = (() => {
        try {
          return JSON.parse(text) as CreationResponse;
        } catch {
          return null;
        }
      })();

      const pretty = parsed ? JSON.stringify(parsed, null, 2) : text;
      setResponseBody(pretty);
      setIssues(Array.isArray(parsed?.issues) ? parsed.issues : []);

      if (!response.ok) {
        setState("error");
        setMessage(parsed?.message ?? `Failed with status ${response.status}`);
        return;
      }

      setState("success");
      setMessage(`Created ${parsed?.created_items ?? 0}/${parsed?.source_items ?? 0} product(s).`);
    } catch (error) {
      setState("error");
      const detail = error instanceof Error ? error.message : "Unknown error";
      setMessage(`Request failed: ${detail}`);
    }
  }

  return (
    <main className="creator-page">
      <section className="creator-card">
        <div className="creator-head">
          <div>
            <h1>Create Products From JSON</h1>
            <p>
              Run script first, then edit request JSON in a table (keys as columns, values as rows), and
              send to create endpoint.
            </p>
          </div>
          <Link className="ghost-btn" href="/">
            Back To Catalog
          </Link>
        </div>

        <form className="creator-form" onSubmit={handleRunScript}>
          <label
            htmlFor="creator-file"
            className={`dropzone ${isDragOver ? "drag-over" : ""}`}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
          >
            <input
              id="creator-file"
              type="file"
              accept="application/json,.json"
              onChange={onInputChange}
            />
            <strong>Drag and drop JSON here</strong>
            <span>or click to choose from your system</span>
            <em>{fileLabel}</em>
          </label>

          <label>
            SEO max chars
            <input
              type="number"
              min="300"
              max="5000"
              value={maxChars}
              onChange={(event) => setMaxChars(event.target.value)}
            />
          </label>

          <button className="primary-btn" type="submit" disabled={state === "loading"}>
            {state === "loading" ? "Running..." : "Run Script"}
          </button>
        </form>

        <section className="creator-editor">
          <div className="creator-editor-head">
            <h2>Table Editor</h2>
            <button
              className="primary-btn"
              type="button"
              onClick={handleSendToCreate}
              disabled={state === "loading" || tableRows.length === 0}
            >
              Send To Create Endpoint
            </button>
          </div>
          <p>Edit any cell. If you need object/array values, put valid JSON in that cell.</p>

          {tableRows.length > 0 && tableColumns.length > 0 ? (
            <div className="creator-table-wrap">
              <table className="creator-table">
                <thead>
                  <tr>
                    <th>#</th>
                    {tableColumns.map((column) => (
                      <th key={column}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row, rowIndex) => (
                    <tr key={`row-${rowIndex}`}>
                      <td>{rowIndex + 1}</td>
                      {tableColumns.map((column) => (
                        <td key={`${rowIndex}-${column}`}>
                          <input
                            value={String(row[column] ?? "")}
                            onChange={(event) => updateCell(rowIndex, column, event.target.value)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">Run script to load result JSON into table editor.</div>
          )}

          <h3>Resulting JSON</h3>
          <pre className="uploader-response creator-json-preview">{currentJsonPreview}</pre>
        </section>

        <p className={`uploader-message ${state}`}>{message}</p>

        {issues.length > 0 ? (
          <div className="creator-issues">
            <h2>Issues</h2>
            {issues.map((issue, index) => (
              <p key={`${issue.index}-${issue.stage}-${index}`}>
                #{issue.index} [{issue.stage}] {issue.message}
              </p>
            ))}
          </div>
        ) : null}

        {responseBody ? <pre className="uploader-response">{responseBody}</pre> : null}
      </section>
    </main>
  );
}
