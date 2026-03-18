"use client";

import Link from "next/link";
import { ChangeEvent, DragEvent, FormEvent, ReactNode, useMemo, useState } from "react";

type UploadState = "idle" | "loading" | "success" | "error";
type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type PathPart = string | number;

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

function isJsonObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBranchNode(value: JsonValue): boolean {
  return Array.isArray(value) || isJsonObject(value);
}

function normalizeJsonValue(input: unknown): JsonValue {
  if (input === null) return null;
  if (typeof input === "string" || typeof input === "number" || typeof input === "boolean") {
    return input;
  }
  if (Array.isArray(input)) {
    return input.map((item) => normalizeJsonValue(item));
  }
  if (typeof input === "object") {
    const result: { [key: string]: JsonValue } = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (value !== undefined) {
        result[key] = normalizeJsonValue(value);
      }
    }
    return result;
  }
  return String(input);
}

function valueToCell(value: JsonValue): string {
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function cellToValue(raw: string): JsonValue | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "";
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);

  const first = trimmed[0];
  if (first === "{" || first === "[" || first === '"') {
    try {
      return normalizeJsonValue(JSON.parse(trimmed));
    } catch {
      return raw;
    }
  }

  return raw;
}

function pathToKey(path: PathPart[]): string {
  if (path.length === 0) return "$";
  return path.map((part) => String(part)).join("~");
}

function updateNodeAtPath(root: JsonValue, path: PathPart[], nextValue: JsonValue): JsonValue {
  if (path.length === 0) {
    return nextValue;
  }

  const [head, ...tail] = path;

  if (typeof head === "number") {
    if (!Array.isArray(root) || head < 0 || head >= root.length) {
      return root;
    }
    const nextArray = [...root];
    nextArray[head] = updateNodeAtPath(nextArray[head], tail, nextValue);
    return nextArray;
  }

  if (!isJsonObject(root) || !(head in root)) {
    return root;
  }

  const nextObject = { ...root };
  nextObject[head] = updateNodeAtPath(nextObject[head], tail, nextValue);
  return nextObject;
}

function nodeMeta(value: JsonValue): string {
  if (Array.isArray(value)) return `array(${value.length})`;
  if (isJsonObject(value)) return `object(${Object.keys(value).length})`;
  if (value === null) return "null";
  return typeof value;
}

export default function CreatorPage() {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [message, setMessage] = useState<string>(
    "Загрузите JSON, подготовьте данные, при необходимости отредактируйте поля и отправьте на создание."
  );
  const [issues, setIssues] = useState<CreationIssue[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [editorData, setEditorData] = useState<JsonValue[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set(["$", "0"]));

  const fileLabel = useMemo(() => {
    if (!file) return "Файл не выбран";
    return `${file.name} (${Math.round(file.size / 1024)} KB)`;
  }, [file]);

  const currentJsonPreview = useMemo(() => {
    try {
      return JSON.stringify(editorData, null, 2);
    } catch (e) {
      console.error("Preview error", e);
      return "Не удалось показать JSON";
    }
  }, [editorData]);

  function pickFile(next: File | null) {
    if (!next) {
      setFile(null);
      setEditorData([]);
      setExpandedKeys(new Set(["$", "0"]));
      return;
    }

    if (!next.name.toLowerCase().endsWith(".json")) {
      setState("error");
      setMessage("Поддерживаются только файлы .json.");
      setFile(null);
      setEditorData([]);
      setExpandedKeys(new Set(["$", "0"]));
      return;
    }

    setFile(next);
    setState("idle");
    setMessage("Файл выбран. Нажмите «Подготовить данные».");
    setIssues([]);
    setEditorData([]);
    setExpandedKeys(new Set(["$", "0"]));
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

  function toggleExpanded(path: PathPart[]) {
    const key = pathToKey(path);
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function updateLeaf(path: PathPart[], raw: string) {
    setEditorData((prev) => {
      const nextValue = cellToValue(raw);
      const normalized = nextValue === undefined ? "" : nextValue;
      const updated = updateNodeAtPath(prev, path, normalized);
      return Array.isArray(updated) ? updated : prev;
    });
  }

  function renderTreeNode(value: JsonValue, path: PathPart[], label: string, depth: number): ReactNode {
    const branch = isBranchNode(value);
    const paddingLeft = 10 + depth * 14;
    const key = pathToKey(path);

    if (branch) {
      const expanded = expandedKeys.has(key);
      const children: ReactNode[] = [];

      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i += 1) {
          children.push(renderTreeNode(value[i], [...path, i], `[${i}]`, depth + 1));
        }
      } else if (isJsonObject(value)) {
        for (const childKey of Object.keys(value)) {
          children.push(renderTreeNode(value[childKey], [...path, childKey], childKey, depth + 1));
        }
      }

      return (
        <div key={`${key}-${label}`}>
          <button
            type="button"
            className="tree-node-btn tree-node-branch"
            style={{ paddingLeft }}
            onClick={() => toggleExpanded(path)}
          >
            <span className="tree-node-left">
              <span className="tree-node-arrow">{expanded ? "▾" : "▸"}</span>
              <span className="tree-node-label">{label}</span>
            </span>
            <span className="tree-node-meta">{nodeMeta(value)}</span>
          </button>
          {expanded ? <div className="tree-node-children">{children}</div> : null}
        </div>
      );
    }

    return (
      <div className="tree-leaf-row" key={`${key}-${label}`} style={{ paddingLeft }}>
        <span className="tree-leaf-label">{label}</span>
        <input
          className="tree-leaf-input"
          value={valueToCell(value)}
          onChange={(event) => updateLeaf(path, event.target.value)}
        />
      </div>
    );
  }

  async function handleRunScript(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setState("error");
      setMessage("Выберите JSON-файл или перетащите его в область загрузки.");
      return;
    }

    setState("loading");
    setMessage("Подготавливаем данные из файла...");
    setIssues([]);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("maxChars", "2000");

      const response = await fetch("/api/products/prepare-from-file", {
        method: "POST",
        body: formData,
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

      setIssues(Array.isArray(parsed?.issues) ? parsed.issues : []);

      if (!response.ok) {
        setState("error");
        setMessage(parsed?.message ?? `Ошибка запроса (${response.status})`);
        setEditorData([]);
        setExpandedKeys(new Set(["$", "0"]));
        return;
      }

      const requestBodies = Array.isArray(parsed?.request_bodies) ? parsed.request_bodies : [];
      const normalized = requestBodies.map((item) => normalizeJsonValue(item));
      setEditorData(normalized);
      setExpandedKeys(new Set(["$", "0"]));

      setState("success");
      setMessage(
        `Готово. Загружено элементов: ${normalized.length}. Вложенные узлы можно раскрывать, простые значения — редактировать.`
      );
    } catch (error) {
      setState("error");
      const detail = error instanceof Error ? error.message : "Неизвестная ошибка";
      setMessage(`Не удалось выполнить запрос: ${detail}`);
    }
  }

  async function handleSendToCreate() {
    if (editorData.length === 0) {
      setState("error");
      setMessage("Сначала подготовьте данные, чтобы заполнить дерево.");
      return;
    }

    const requestBodies = editorData.filter((item): item is { [key: string]: JsonValue } => isJsonObject(item));

    if (requestBodies.length === 0) {
      setState("error");
      setMessage("В корневом массиве нет валидных объектов для отправки.");
      return;
    }

    setState("loading");
    setMessage("Отправляем данные на создание...");
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

      setIssues(Array.isArray(parsed?.issues) ? parsed.issues : []);

      if (!response.ok) {
        setState("error");
        setMessage(parsed?.message ?? `Ошибка запроса (${response.status})`);
        return;
      }

      setState("success");
      setMessage(`Создано товаров: ${parsed?.created_items ?? 0} из ${parsed?.source_items ?? 0}.`);
    } catch (error) {
      setState("error");
      const detail = error instanceof Error ? error.message : "Неизвестная ошибка";
      setMessage(`Не удалось выполнить запрос: ${detail}`);
    }
  }

  return (
    <main className="creator-page">
      <section className="creator-card">
        <div className="creator-head">
          <div>
            <h1>Создание товаров из JSON</h1>
            <p>
              Раскрывайте вложенные поля и редактируйте простые значения прямо в дереве.
            </p>
          </div>
          <Link className="ghost-btn" href="/">
            Назад к каталогу
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
            <strong>Перетащите JSON-файл сюда</strong>
            <span>или нажмите, чтобы выбрать файл</span>
            <em>{fileLabel}</em>
          </label>

          <button className="primary-btn" type="submit" disabled={state === "loading"}>
            {state === "loading" ? "Подготовка..." : "Подготовить данные"}
          </button>
        </form>

        <section className="creator-editor">
          <div className="creator-editor-head">
            <h2>Редактор дерева</h2>
            <button
              className="primary-btn"
              type="button"
              onClick={handleSendToCreate}
              disabled={state === "loading" || editorData.length === 0}
            >
              Отправить на создание
            </button>
          </div>
          <p>Узлы-объекты и массивы раскрываются, простые значения можно редактировать.</p>

          {editorData.length > 0 ? (
            <div className="creator-tree-layout">
              <div className="creator-tree-panel">{renderTreeNode(editorData, [], "request_bodies", 0)}</div>
            </div>
          ) : (
            <div className="empty-state">Подготовьте данные, чтобы они появились в редакторе.</div>
          )}

          <h3>Итоговый JSON</h3>
          <pre className="uploader-response creator-json-preview">{currentJsonPreview}</pre>
        </section>

        <p className={`uploader-message ${state}`}>{message}</p>

        {issues.length > 0 ? (
          <div className="creator-issues">
            <h2>Замечания</h2>
            {issues.map((issue, index) => (
              <p key={`${issue.index}-${issue.stage}-${index}`}>
                #{issue.index} [{issue.stage}] {issue.message}
              </p>
            ))}
          </div>
        ) : null}

      </section>
    </main>
  );
}
