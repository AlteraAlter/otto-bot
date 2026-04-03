"use client";

import Link from "next/link";
import { ChangeEvent, DragEvent, FormEvent, ReactNode, useMemo, useState } from "react";

type UploadState = "idle" | "loading" | "success" | "error";
type CreatorMode = "file" | "single";
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

type SingleRow = {
  id: string;
  productReference: string;
  sku: string;
  ean: string;
  moin: string;
  category: string;
  brandId: string;
  productLine: string;
  description: string;
  bulletPoints: string;
  price: string;
  imageUrl: string;
};

function createEmptySingleRow(): SingleRow {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    productReference: "",
    sku: "",
    ean: "",
    moin: "",
    category: "KOB Set-Artikel",
    brandId: "JVmoebel",
    productLine: "",
    description: "",
    bulletPoints: "",
    price: "99.99",
    imageUrl: "https://example.com/image.jpg"
  };
}

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

function splitBulletPoints(raw: string): string[] {
  return raw
    .split("|")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function rowToPreparedPayload(row: SingleRow): { payload: Record<string, unknown> | null; error?: string } {
  if (!row.sku.trim()) return { payload: null, error: "SKU обязателен" };
  if (!row.productReference.trim()) return { payload: null, error: "Product Reference обязателен" };
  if (!row.category.trim()) return { payload: null, error: "Category обязателен" };
  if (!row.brandId.trim()) return { payload: null, error: "Brand ID обязателен" };

  const amount = Number(row.price);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { payload: null, error: "Цена должна быть положительным числом" };
  }

  const imageUrl = row.imageUrl.trim();
  if (!/^https?:\/\//i.test(imageUrl)) {
    return { payload: null, error: "Image URL должен начинаться с http:// или https://" };
  }

  const payload: Record<string, unknown> = {
    productReference: row.productReference.trim(),
    sku: row.sku.trim(),
    ean: row.ean.trim() || undefined,
    moin: row.moin.trim() || undefined,
    productDescription: {
      category: row.category.trim(),
      brandId: row.brandId.trim(),
      productLine: row.productLine.trim() || row.productReference.trim(),
      multiPack: false,
      bundle: false,
      fscCertified: false,
      disposal: false,
      description: row.description.trim() || undefined,
      bulletPoints: splitBulletPoints(row.bulletPoints),
      attributes: []
    },
    mediaAssets: [
      {
        type: "IMAGE",
        location: imageUrl
      }
    ],
    pricing: {
      standardPrice: {
        amount,
        currency: "EUR"
      },
      vat: "FULL"
    },
    logistics: {
      packingUnitCount: 1,
      packingUnits: [
        {
          weight: 1,
          width: 1,
          height: 1,
          length: 1
        }
      ]
    }
  };

  return { payload };
}

export default function CreatorPage() {
  const [mode, setMode] = useState<CreatorMode>("file");
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [message, setMessage] = useState<string>(
    "Выберите режим создания: из JSON-файла или добавление товаров по одному."
  );
  const [issues, setIssues] = useState<CreationIssue[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [editorData, setEditorData] = useState<JsonValue[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set(["$", "0"]));
  const [singleRows, setSingleRows] = useState<SingleRow[]>([createEmptySingleRow()]);

  const fileLabel = useMemo(() => {
    if (!file) return "Файл не выбран";
    return `${file.name} (${Math.round(file.size / 1024)} KB)`;
  }, [file]);

  const currentJsonPreview = useMemo(() => {
    try {
      // We keep the preview derived from the same in-memory source the user edits,
      // so the JSON preview always matches what will actually be sent to the backend.
      const source =
        mode === "file"
          ? editorData
          : singleRows
              .map((row) => rowToPreparedPayload(row).payload)
              .filter((item): item is Record<string, unknown> => item !== null);
      return JSON.stringify(source, null, 2);
    } catch (e) {
      console.error("Preview error", e);
      return "Не удалось показать JSON";
    }
  }, [editorData, mode, singleRows]);

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
    if (mode !== "file") return;
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

  function updateSingleRow(id: string, field: keyof SingleRow, value: string) {
    setSingleRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  }

  function addSingleRow() {
    setSingleRows((prev) => [...prev, createEmptySingleRow()]);
  }

  function removeSingleRow(id: string) {
    setSingleRows((prev) => {
      const next = prev.filter((row) => row.id !== id);
      return next.length > 0 ? next : [createEmptySingleRow()];
    });
  }

  async function handleCreateSingleItems() {
    const nonEmptyRows = singleRows.filter(
      (row) =>
        row.productReference.trim().length > 0 ||
        row.sku.trim().length > 0 ||
        row.productLine.trim().length > 0
    );

    if (nonEmptyRows.length === 0) {
      setState("error");
      setMessage("Заполните хотя бы одну строку таблицы.");
      return;
    }

    const localIssues: CreationIssue[] = [];
    const requestBodies: Record<string, unknown>[] = [];

    nonEmptyRows.forEach((row, index) => {
      const converted = rowToPreparedPayload(row);
      if (!converted.payload) {
        localIssues.push({
          index,
          stage: "validate",
          message: converted.error ?? "Ошибка валидации строки"
        });
        return;
      }
      requestBodies.push(converted.payload);
    });

    if (localIssues.length > 0) {
      setIssues(localIssues);
      setState("error");
      setMessage("Проверьте таблицу: есть ошибки в заполнении строк.");
      return;
    }

    setState("loading");
    setMessage("Создаем товары из таблицы...");
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
      setMessage(`Создано товаров: ${parsed?.created_items ?? 0} из ${requestBodies.length}.`);
      setSingleRows([createEmptySingleRow()]);
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
            <p className="page-section-label">Создание</p>
            <h1>Создание товаров</h1>
            <p>
              Два понятных сценария: подготовка из JSON-файла и ручное добавление
              товаров по одному.
            </p>
          </div>
          <Link className="ghost-btn" href="/">
            Назад к каталогу
          </Link>
        </div>

        <div className="creator-mode-switch">
          <button
            type="button"
            className={`mode-btn ${mode === "file" ? "active" : ""}`}
            onClick={() => setMode("file")}
          >
            Из JSON-файла
          </button>
          <button
            type="button"
            className={`mode-btn ${mode === "single" ? "active" : ""}`}
            onClick={() => setMode("single")}
          >
            По одному
          </button>
        </div>

        {mode === "file" ? (
          <>
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
                <span>или нажмите, чтобы выбрать файл с компьютера</span>
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
          </>
        ) : (
          <section className="creator-editor">
            <div className="creator-editor-head">
              <h2>Табличное добавление товаров</h2>
              <button
                className="primary-btn"
                type="button"
                onClick={handleCreateSingleItems}
                disabled={state === "loading"}
              >
                Создать из таблицы
              </button>
            </div>
            <p>Заполняйте строки таблицы: одна строка = один товар.</p>

            <div className="single-table-wrap">
              <table className="single-create-table">
                <thead>
                  <tr>
                    <th>Product Ref</th>
                    <th>SKU</th>
                    <th>EAN</th>
                    <th>MOIN</th>
                    <th>Category</th>
                    <th>Brand ID</th>
                    <th>Title</th>
                    <th>Price EUR</th>
                    <th>Image URL</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {singleRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <input value={row.productReference} onChange={(event) => updateSingleRow(row.id, "productReference", event.target.value)} />
                      </td>
                      <td>
                        <input value={row.sku} onChange={(event) => updateSingleRow(row.id, "sku", event.target.value)} />
                      </td>
                      <td>
                        <input value={row.ean} onChange={(event) => updateSingleRow(row.id, "ean", event.target.value)} />
                      </td>
                      <td>
                        <input value={row.moin} onChange={(event) => updateSingleRow(row.id, "moin", event.target.value)} />
                      </td>
                      <td>
                        <input value={row.category} onChange={(event) => updateSingleRow(row.id, "category", event.target.value)} />
                      </td>
                      <td>
                        <input value={row.brandId} onChange={(event) => updateSingleRow(row.id, "brandId", event.target.value)} />
                      </td>
                      <td>
                        <input value={row.productLine} onChange={(event) => updateSingleRow(row.id, "productLine", event.target.value)} />
                      </td>
                      <td>
                        <input value={row.price} onChange={(event) => updateSingleRow(row.id, "price", event.target.value)} />
                      </td>
                      <td>
                        <input value={row.imageUrl} onChange={(event) => updateSingleRow(row.id, "imageUrl", event.target.value)} />
                      </td>
                      <td>
                        <button type="button" className="ghost-btn" onClick={() => removeSingleRow(row.id)}>
                          Удалить
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="single-actions">
              <button className="primary-btn" type="button" onClick={addSingleRow} disabled={state === "loading"}>
                Добавить строку
              </button>
            </div>

            <div className="single-extra-grid">
              {singleRows.map((row) => (
                <div key={`${row.id}-extra`} className="single-extra-card">
                  <p>Доп. поля для SKU: {row.sku || "—"}</p>
                  <input
                    placeholder="Description"
                    value={row.description}
                    onChange={(event) => updateSingleRow(row.id, "description", event.target.value)}
                  />
                  <input
                    placeholder="Bullet points через |"
                    value={row.bulletPoints}
                    onChange={(event) => updateSingleRow(row.id, "bulletPoints", event.target.value)}
                  />
                </div>
              ))}
            </div>

            <h3>Итоговый JSON</h3>
            <pre className="uploader-response creator-json-preview">{currentJsonPreview}</pre>

            <div className="single-queue">
              <h3>Строк в таблице: {singleRows.length}</h3>
            </div>
          </section>
        )}

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
