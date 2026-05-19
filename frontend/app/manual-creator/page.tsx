"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useState } from "react";

import { useCurrentUser } from "../hooks/use-current-user";
import { AppWorkspaceShell } from "../ui/app-workspace-shell";
import { readApiErrorMessage, readJsonResponse } from "../lib/api";

type UploadState = "idle" | "loading" | "success" | "error";

type CreationIssue = {
  index: number;
  stage: string;
  message: string;
};

type CreationResponse = {
  state?: string;
  total?: number;
  message?: string;
  links?: Array<{ href?: string; rel?: string; method?: string }>;
};

type UpdateTaskResponse = {
  state?: string;
  failed?: number;
  succeeded?: number;
  unchanged?: number;
  results?: {
    failed?: number;
    succeeded?: number;
    unchanged?: number;
  };
  summary?: {
    failed?: number;
    succeeded?: number;
    unchanged?: number;
  };
};

type ImageUploadResponse = {
  success?: boolean;
  imageUrl?: string;
  message?: string;
};

type CategoriesResponse = {
  items?: string[];
};

type AttributeOptionsResponse = {
  items?: string[];
};

type ShippingProfileOption = {
  id: string;
  name: string;
};

type ControllerOption = "jv" | "xl";

type ShippingProfilesResponse = {
  shippingProfiles?: ShippingProfileOption[];
  results?: Array<{
    shippingProfileId?: string;
    shippingProfileName?: string;
  }>;
};

type SingleRow = {
  id: string;
  productReference: string;
  sku: string;
  ean: string;
  category: string;
  brandId: string;
  productLine: string;
  bulletPoints: string;
  description: string;
  price: string;
  quantity: string;
  shippingProfileID: string;
  processingTime: string;
  imageUrls: string[];
  pendingImageUrl: string;
  attributes: Array<{ name: string; value: string }>;
  pendingAttributeName: string;
  pendingAttributeValue: string;
};

function createEmptySingleRow(): SingleRow {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    productReference: "",
    sku: "",
    ean: "",
    category: "KOB Set-Artikel",
    brandId: "JVmoebel",
    productLine: "",
    bulletPoints: "",
    description: "",
    price: "99.99",
    quantity: "1",
    shippingProfileID: "",
    processingTime: "DEFAULT",
    imageUrls: [],
    pendingImageUrl: "",
    attributes: [],
    pendingAttributeName: "",
    pendingAttributeValue: "",
  };
}

function getBrandIdByController(controller: ControllerOption): string {
  return controller === "xl" ? "6HMOZBOU" : "UO4EGHSX";
}

function toPreviewImageUrl(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return "";
  const uploadMarker = "/uploads/";
  const markerIndex = trimmed.indexOf(uploadMarker);
  if (markerIndex >= 0) {
    const file = trimmed.slice(markerIndex + uploadMarker.length).split("?")[0].split("#")[0];
    if (file) {
      return `/api/uploads/local?file=${encodeURIComponent(file)}`;
    }
  }
  return trimmed;
}

function splitBulletPoints(raw: string): string[] {
  return raw
    .split("|")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function splitBulletPointsForEdit(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw.split("|").map((item) => item.trim());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function extractProcessId(links: CreationResponse["links"]): string | null {
  if (!Array.isArray(links)) return null;
  for (const link of links) {
    const href = link?.href;
    if (!href) continue;
    const match = href.match(/update-tasks\/([^/?#]+)/i);
    if (match?.[1]) return match[1];
  }
  return null;
}

function extractProcessIdFromMessage(message: string | undefined): string | null {
  if (!message) return null;
  const direct = message.match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\b/i);
  if (direct?.[1]) return direct[1];
  const pathLike = message.match(/update-tasks\/([^/\s?#]+)/i);
  return pathLike?.[1] ?? null;
}

function extractFailedCount(payload: UpdateTaskResponse | null): number {
  if (!payload) return 0;
  const candidates = [
    payload.failed,
    payload.results?.failed,
    payload.summary?.failed,
  ];
  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return 0;
}

async function waitForUpdateTaskDone(
  processId: string,
  controller: ControllerOption,
): Promise<{ ok: boolean; failedCount: number; error?: string }> {
  const maxAttempts = 36;
  const intervalMs = 5000;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(
      `/api/products/update-tasks/${encodeURIComponent(processId)}?controller=${encodeURIComponent(controller)}`,
      { method: "GET", cache: "no-store" },
    );
    const payload = await readJsonResponse<UpdateTaskResponse>(response);

    if (!response.ok) {
      // OTTO task status can lag right after create; tolerate transient misses.
      if (response.status === 404 || response.status === 409) {
        await sleep(intervalMs);
        continue;
      }
      return {
        ok: false,
        failedCount: 0,
        error: readApiErrorMessage(payload, "Ошибка проверки update-task", response.status),
      };
    }

    const state = String(payload?.state ?? "").toUpperCase();
    if (state === "DONE") {
      const failedCount = extractFailedCount(payload);
      return { ok: failedCount === 0, failedCount };
    }
    if (state === "FAILED" || state === "ERROR") {
      return {
        ok: false,
        failedCount: Math.max(1, extractFailedCount(payload)),
        error: "Update-task завершился с ошибкой.",
      };
    }

    await sleep(intervalMs);
  }

  return {
    ok: false,
    failedCount: 0,
    error: "Таймаут ожидания update-task (state != DONE).",
  };
}

function getRequiredFieldCount(row: SingleRow): { done: number; total: number } {
  const checks = [
    row.productReference.trim().length > 0,
    row.sku.trim().length > 0,
    row.category.trim().length > 0,
    Number.isFinite(Number(row.price)) && Number(row.price) > 0,
    Number.isInteger(Number(row.quantity)) && Number(row.quantity) > 0,
    row.shippingProfileID.trim().length > 0,
    row.imageUrls.some((item) => item.trim().length > 0),
  ];

  return {
    done: checks.filter(Boolean).length,
    total: checks.length,
  };
}

function rowToPreparedPayload(
  controller: ControllerOption,
  row: SingleRow,
): { payload: Record<string, unknown> | null; error?: string } {
  if (!row.sku.trim()) return { payload: null, error: "Поле SKU обязательно" };
  if (!row.productReference.trim()) {
    return { payload: null, error: "Поле Product Reference обязательно" };
  }
  if (!row.category.trim()) return { payload: null, error: "Поле Category обязательно" };
  if (!row.shippingProfileID.trim()) {
    return { payload: null, error: "Нужно выбрать Shipping Profile" };
  }

  const amount = Number(row.price);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { payload: null, error: "Цена должна быть положительным числом" };
  }
  const quantity = Number(row.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { payload: null, error: "Количество должно быть целым числом больше 0" };
  }

  const images = row.imageUrls.map((item) => item.trim()).filter((item) => item.length > 0);
  if (images.length === 0) {
    return { payload: null, error: "Нужно добавить минимум одно изображение" };
  }
  for (const item of images) {
    if (item.startsWith("/uploads/")) continue;
    let parsedImageUrl: URL | null = null;
    try {
      parsedImageUrl = new URL(item);
    } catch {
      parsedImageUrl = null;
    }
    if (!parsedImageUrl || !/^https?:$/i.test(parsedImageUrl.protocol)) {
      return {
        payload: null,
        error: "Ссылка на изображение должна начинаться с http:// или https://",
      };
    }
  }

  const normalizedAttributes = row.attributes
    .map((item) => ({ name: item.name.trim(), value: item.value.trim() }))
    .filter((item) => item.name.length > 0 && item.value.length > 0)
    .map((item) => ({
      name: item.name,
      values: [item.value],
      additional: true,
    }));

  return {
    payload: {
      productReference: row.productReference.trim(),
      sku: row.sku.trim(),
      ean: row.ean.trim() || undefined,
      productDescription: {
        category: row.category.trim(),
        brandId: getBrandIdByController(controller),
        productLine: row.productLine.trim() || row.productReference.trim(),
        multiPack: false,
        bundle: false,
        fscCertified: false,
        disposal: false,
        description: row.description.trim() || undefined,
        bulletPoints: splitBulletPoints(row.bulletPoints),
        attributes: normalizedAttributes,
      },
      mediaAssets: images.map((location) => ({ type: "IMAGE", location })),
      pricing: {
        standardPrice: {
          amount,
          currency: "EUR",
        },
        vat: "FULL",
      },
    },
  };
}

export default function ManualCreatorPage() {
  const { currentUser, isLoading, error } = useCurrentUser();
  const [state, setState] = useState<UploadState>("idle");
  const [message, setMessage] = useState(
    "Заполните карточки товара и нажмите «Создать товары».",
  );
  const [issues, setIssues] = useState<CreationIssue[]>([]);
  const [rows, setRows] = useState<SingleRow[]>([createEmptySingleRow()]);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [uploadingImageIds, setUploadingImageIds] = useState<Set<string>>(new Set());
  const [imageUploadErrors, setImageUploadErrors] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<string[]>([]);
  const [attributeOptions, setAttributeOptions] = useState<string[]>([]);
  const [shippingProfiles, setShippingProfiles] = useState<ShippingProfileOption[]>([]);
  const [controller, setController] = useState<ControllerOption>("jv");
  const [loadingCategories, setLoadingCategories] = useState<boolean>(false);

  const progress = useMemo(() => {
    const totalRequired = rows.length * 7;
    const doneRequired = rows.reduce(
      (sum, row) => sum + getRequiredFieldCount(row).done,
      0,
    );
    return { doneRequired, totalRequired };
  }, [rows]);

  useEffect(() => {
    let active = true;
    async function loadAttributeOptions() {
      try {
        const response = await fetch("/api/products/attributes-options", {
          method: "GET",
          cache: "no-store",
        });
        const payload = await readJsonResponse<AttributeOptionsResponse>(response);
        if (!active || !response.ok) return;
        const items = Array.isArray(payload?.items) ? payload.items : [];
        setAttributeOptions(items);
        if (items.length > 0) {
          setRows((prev) =>
            prev.map((row) =>
              row.pendingAttributeName ? row : { ...row, pendingAttributeName: items[0] },
            ),
          );
        }
      } catch {
        if (!active) return;
        setAttributeOptions([]);
      }
    }

    void loadAttributeOptions();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadCategories() {
      setLoadingCategories(true);
      try {
        const response = await fetch("/api/products/available-categories", {
          method: "GET",
          cache: "no-store",
        });
        const payload = await readJsonResponse<CategoriesResponse>(response);
        if (!active) return;
        if (!response.ok) return;
        setCategories(Array.isArray(payload?.items) ? payload.items : []);
      } catch {
        if (!active) return;
        setCategories([]);
      } finally {
        if (active) {
          setLoadingCategories(false);
        }
      }
    }

    void loadCategories();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadShippingProfiles() {
      try {
        const response = await fetch(`/api/products/shipping-profiles?controller=${controller}`, {
          method: "GET",
          cache: "no-store",
        });
        const payload = await readJsonResponse<ShippingProfilesResponse>(response);
        if (!active || !response.ok) return;
        const options = Array.isArray(payload?.shippingProfiles)
          ? payload.shippingProfiles
          : Array.isArray(payload?.results)
            ? payload.results
                .map((item) => ({
                  id: item.shippingProfileId ?? "",
                  name: item.shippingProfileName ?? item.shippingProfileId ?? "",
                }))
                .filter((item) => item.id.length > 0)
            : [];
        setShippingProfiles(options);
        if (options.length > 0) {
          setRows((prev) =>
            prev.map((row) =>
              row.shippingProfileID
                ? row
                : { ...row, shippingProfileID: options[0].id },
            ),
          );
        }
      } catch {
        if (!active) return;
        setShippingProfiles([]);
      }
    }

    void loadShippingProfiles();
    return () => {
      active = false;
    };
  }, [controller]);

  function updateRow(id: string, field: keyof SingleRow, value: string) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  }

  function addRow() {
    const nextRow = createEmptySingleRow();
    setRows((prev) => [...prev, nextRow]);
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      next.delete(nextRow.id);
      return next;
    });
  }

  function removeRow(id: string) {
    setRows((prev) => {
      const next = prev.filter((row) => row.id !== id);
      return next.length > 0 ? next : [createEmptySingleRow()];
    });
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setUploadingImageIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setImageUploadErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function toggleCard(id: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function collapseAll() {
    setCollapsedIds(new Set(rows.map((row) => row.id)));
  }

  function expandAll() {
    setCollapsedIds(new Set());
  }

  function updateBulletPoint(id: string, idx: number, value: string) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const parts = splitBulletPointsForEdit(row.bulletPoints);
        const next = [...parts];
        next[idx] = value;
        return { ...row, bulletPoints: next.join(" | ") };
      }),
    );
  }

  function addBulletPoint(id: string) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const parts = splitBulletPointsForEdit(row.bulletPoints);
        parts.push("");
        return { ...row, bulletPoints: parts.join(" | ") };
      }),
    );
  }

  function removeBulletPoint(id: string, idx: number) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const parts = splitBulletPointsForEdit(row.bulletPoints);
        const next = parts.filter((_, index) => index !== idx);
        return { ...row, bulletPoints: next.join(" | ") };
      }),
    );
  }

  function addImageUrl(id: string) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const next = row.pendingImageUrl.trim();
        if (!next) return row;
        return {
          ...row,
          imageUrls: [...row.imageUrls, next],
          pendingImageUrl: "",
        };
      }),
    );
  }

  function removeImageUrl(id: string, idx: number) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        return {
          ...row,
          imageUrls: row.imageUrls.filter((_, index) => index !== idx),
        };
      }),
    );
  }

  function addAttribute(id: string) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const name = row.pendingAttributeName.trim();
        const value = row.pendingAttributeValue.trim();
        if (!name || !value) return row;
        return {
          ...row,
          attributes: [...row.attributes, { name, value }],
          pendingAttributeValue: "",
        };
      }),
    );
  }

  function removeAttribute(id: string, idx: number) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        return {
          ...row,
          attributes: row.attributes.filter((_, index) => index !== idx),
        };
      }),
    );
  }

  async function uploadImagesForRow(id: string, files: File[]) {
    if (files.length === 0) return;
    if (files.some((file) => !file.type.startsWith("image/"))) {
      setImageUploadErrors((prev) => ({ ...prev, [id]: "Можно загружать только изображения." }));
      return;
    }

    setImageUploadErrors((prev) => ({ ...prev, [id]: "" }));
    setUploadingImageIds((prev) => new Set(prev).add(id));

    try {
      const uploadedUrls: string[] = [];
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        const response = await fetch("/api/uploads/image", {
          method: "POST",
          body: form,
        });
        const payload = (await response.json()) as ImageUploadResponse;
        if (!response.ok || !payload.imageUrl) {
          setImageUploadErrors((prev) => ({
            ...prev,
            [id]: payload.message ?? "Не удалось загрузить изображение.",
          }));
          continue;
        }
        const absolute = payload.imageUrl.startsWith("http")
          ? payload.imageUrl
          : `${window.location.origin}${payload.imageUrl}`;
        uploadedUrls.push(absolute);
      }

      if (uploadedUrls.length > 0) {
        setRows((prev) =>
          prev.map((row) => {
            if (row.id !== id) return row;
            return { ...row, imageUrls: [...row.imageUrls, ...uploadedUrls] };
          }),
        );
      }
    } catch {
      setImageUploadErrors((prev) => ({ ...prev, [id]: "Не удалось загрузить изображение." }));
    } finally {
      setUploadingImageIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  function onImageInputChange(id: string, event: ChangeEvent<HTMLInputElement>) {
    void uploadImagesForRow(id, Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function onImageDrop(id: string, event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    void uploadImagesForRow(id, Array.from(event.dataTransfer.files ?? []));
  }

  async function handleCreateItems() {
    const nonEmptyRows = rows.filter(
      (row) =>
        row.productReference.trim().length > 0 ||
        row.sku.trim().length > 0 ||
        row.productLine.trim().length > 0,
    );

    if (nonEmptyRows.length === 0) {
      setState("error");
      setMessage("Заполните минимум одну карточку товара.");
      return;
    }

    const localIssues: CreationIssue[] = [];
    const products: Record<string, unknown>[] = [];
    const availabilityBodies: Array<{
      sku: string;
      quantity: string;
      shippingProfileID: string;
      processingTime: string;
      controller: ControllerOption;
    }> = [];

    nonEmptyRows.forEach((row, index) => {
      const converted = rowToPreparedPayload(controller, row);
      if (!converted.payload) {
        localIssues.push({
          index,
          stage: "validate",
          message: converted.error ?? "Ошибка валидации",
        });
        return;
      }
      products.push(converted.payload);
      availabilityBodies.push({
        sku: row.sku.trim(),
        quantity: String(Number(row.quantity)),
        shippingProfileID: row.shippingProfileID.trim(),
        processingTime: row.processingTime.trim() || "DEFAULT",
        controller,
      });
    });

    if (localIssues.length > 0) {
      setState("error");
      setMessage("Проверьте обязательные поля в карточках.");
      setIssues(localIssues);
      return;
    }

    setState("loading");
    setMessage("Создаем товары...");
    setIssues([]);

    try {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          controller,
          products,
        }),
        cache: "no-store",
      });

      const parsed = await readJsonResponse<CreationResponse>(response);

      if (!response.ok) {
        setState("error");
        setMessage(readApiErrorMessage(parsed, "Ошибка создания товаров", response.status));
        return;
      }

      const processId = extractProcessId(parsed?.links) ?? extractProcessIdFromMessage(parsed?.message);
      if (!processId) {
        setState("error");
        setMessage("Не найден processId в ответе create_or_update_products (links/message).");
        return;
      }

      setMessage("Товары отправлены. Ждем завершения update-task...");
      const updateTaskResult = await waitForUpdateTaskDone(processId, controller);
      if (!updateTaskResult.ok) {
        setState("error");
        if (updateTaskResult.failedCount > 0) {
          setMessage(
            `Update-task завершен с ошибками: failed=${updateTaskResult.failedCount}. Availability не запускался.`,
          );
        } else {
          setMessage(updateTaskResult.error ?? "Update-task не завершился успешно.");
        }
        return;
      }

      setMessage("Update-task DONE без ошибок. Создаем availability...");

      const availabilityResults = await Promise.allSettled(
        availabilityBodies.map((availabilityPayload) =>
          fetch("/api/products/create-availability", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(availabilityPayload),
            cache: "no-store",
          }),
        ),
      );
      const availabilityErrors: CreationIssue[] = [];
      for (let i = 0; i < availabilityResults.length; i += 1) {
        const result = availabilityResults[i];
        if (result.status === "rejected") {
          availabilityErrors.push({
            index: i,
            stage: "availability",
            message: "Ошибка сети при создании availability",
          });
          continue;
        }
        if (!result.value.ok) {
          const errorPayload = await readJsonResponse<{ message?: string }>(result.value);
          availabilityErrors.push({
            index: i,
            stage: "availability",
            message: readApiErrorMessage(
              errorPayload,
              "Ошибка создания availability",
              result.value.status,
            ),
          });
        }
      }
      if (availabilityErrors.length > 0) {
        setIssues(availabilityErrors);
        setState("error");
        setMessage(
          `Товары созданы, но availability с ошибками: ${availabilityErrors.length} из ${availabilityBodies.length}.`,
        );
        return;
      }

      setState("success");
      setMessage(
        parsed?.message ??
          `Успешно: создано/обновлено ${parsed?.total ?? products.length} товаров. Update-task DONE, availability создан.`,
      );
      const freshRow = createEmptySingleRow();
      setRows([freshRow]);
      setCollapsedIds(new Set());
    } catch (caughtError) {
      setState("error");
      setMessage(
        caughtError instanceof Error
          ? `Ошибка запроса: ${caughtError.message}`
          : "Ошибка запроса",
      );
    }
  }

  if (isLoading) {
    return (
      <main className="otto-page">
        <section className="app-shell">
          <section className="workspace">
            <p className="helper-banner info">Пожалуйста, подождите...</p>
          </section>
        </section>
      </main>
    );
  }

  return (
    <AppWorkspaceShell
      activeHref="/manual-creator"
      currentUser={currentUser}
      sectionLabel="Создание"
      title="Ручное создание товаров"
      description="Интерфейс собран по backend-схеме: заполняете карточки и отправляете одним действием."
    >
      <div className="creator-workspace manual-creator-workspace">
        {error ? <p className="helper-banner">{error}</p> : null}
        <p className={`helper-banner ${state === "error" ? "" : state === "success" ? "success" : "info"}`}>
          {message}
        </p>

        <section className="manual-creator-header-card">
          <div>
            <h2>Конструктор карточек товара</h2>
            <p>
              Поля со звездочкой обязательны. Отправляем данные в формате backend-схемы
              `create_or_update_products`.
            </p>
            <label className="manual-controller-select">
              <span>Controller</span>
              <select
                value={controller}
                onChange={(event) => setController(event.target.value as ControllerOption)}
              >
                <option value="jv">jv</option>
                <option value="xl">xl</option>
              </select>
            </label>
            <p className="manual-progress-line">
              Готовность: {progress.doneRequired} / {progress.totalRequired} обязательных полей.
            </p>
          </div>
          <div className="manual-creator-header-actions">
            <button className="ghost-btn" type="button" onClick={expandAll}>
              Раскрыть все
            </button>
            <button className="ghost-btn" type="button" onClick={collapseAll}>
              Свернуть все
            </button>
            <button className="secondary-btn" type="button" onClick={addRow}>
              Добавить карточку
            </button>
            <button
              className="primary-btn"
              type="button"
              onClick={handleCreateItems}
              disabled={state === "loading"}
            >
              {state === "loading" ? "Создаем..." : "Создать товары"}
            </button>
          </div>
        </section>

        <div className="manual-creator-cards">
          {rows.map((row, cardIndex) => {
            const bulletPoints = splitBulletPointsForEdit(row.bulletPoints);
            const isCollapsed = collapsedIds.has(row.id);
            const isUploadingImage = uploadingImageIds.has(row.id);
            const imageError = imageUploadErrors[row.id];
            const status = getRequiredFieldCount(row);
            return (
              <section className="manual-product-card" key={row.id}>
                {row.imageUrls.length > 0 ? (
                  <div className="manual-image-strip">
                    {row.imageUrls.map((url, imageIndex) => (
                      <img
                        className="manual-image-strip-item"
                        src={toPreviewImageUrl(url)}
                        alt={`Товар ${cardIndex + 1} изображение ${imageIndex + 1}`}
                        key={`${row.id}-top-img-${imageIndex}`}
                      />
                    ))}
                  </div>
                ) : null}
                <div className="manual-product-card-head">
                  <h3>
                    {row.sku.trim() ? `SKU ${row.sku.trim()}` : `SKU #${cardIndex + 1}`}
                    <span className="manual-card-progress">{status.done}/{status.total}</span>
                  </h3>
                  <div className="manual-product-card-actions">
                    <button type="button" className="ghost-btn" onClick={() => toggleCard(row.id)}>
                      {isCollapsed ? "Раскрыть" : "Свернуть"}
                    </button>
                    <button type="button" className="ghost-btn" onClick={() => removeRow(row.id)}>
                      Удалить
                    </button>
                  </div>
                </div>

                {!isCollapsed ? (
                  <>
                    <div className="manual-form-section">
                      <h4>Идентификаторы</h4>
                      <div className="manual-form-grid">
                        <label>
                          Product Reference *
                          <input
                            value={row.productReference}
                            onChange={(e) => updateRow(row.id, "productReference", e.target.value)}
                            placeholder="Внутренний идентификатор"
                          />
                        </label>
                        <label>
                          SKU *
                          <input
                            value={row.sku}
                            onChange={(e) => updateRow(row.id, "sku", e.target.value)}
                            placeholder="Артикул SKU"
                          />
                        </label>
                        <label>
                          EAN
                          <input
                            value={row.ean}
                            onChange={(e) => updateRow(row.id, "ean", e.target.value)}
                            placeholder="Необязательно"
                          />
                        </label>
                      </div>
                    </div>

                    <div className="manual-form-section">
                      <h4>Каталог</h4>
                      <div className="manual-form-grid">
                        <label>
                          Категория *
                          {categories.length > 0 ? (
                            <select
                              value={row.category}
                              onChange={(e) => updateRow(row.id, "category", e.target.value)}
                            >
                              {categories.map((category) => (
                                <option key={category} value={category}>
                                  {category}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              value={row.category}
                              onChange={(e) => updateRow(row.id, "category", e.target.value)}
                              placeholder={loadingCategories ? "Загружаем категории..." : "Название категории"}
                            />
                          )}
                        </label>
                        <label>
                          Brand ID
                          <input value={getBrandIdByController(controller)} readOnly />
                        </label>
                        <label className="manual-field-full">
                          Product Line
                          <input
                            value={row.productLine}
                            onChange={(e) => updateRow(row.id, "productLine", e.target.value)}
                            placeholder="Если оставить пустым, подставится Product Reference"
                          />
                        </label>
                      </div>
                    </div>

                    <div className="manual-form-section">
                      <h4>Контент</h4>
                      <label className="manual-field-full">
                        Описание
                        <textarea
                          value={row.description}
                          onChange={(e) => updateRow(row.id, "description", e.target.value)}
                          rows={4}
                          placeholder="Понятное описание для карточки товара"
                        />
                      </label>
                      <div className="manual-bullets-wrap">
                        <div className="manual-bullets-head">
                          <span>Bullet Points</span>
                          <button type="button" className="secondary-btn" onClick={() => addBulletPoint(row.id)}>
                            Добавить пункт
                          </button>
                        </div>
                        <div className="manual-bullets-list">
                          {(bulletPoints.length > 0 ? bulletPoints : [""]).map((point, idx) => (
                            <div className="manual-bullet-row" key={`${row.id}-bp-${idx}`}>
                              <input
                                value={point}
                                onChange={(e) => updateBulletPoint(row.id, idx, e.target.value)}
                                placeholder={`Преимущество ${idx + 1}`}
                              />
                              <button type="button" className="ghost-btn" onClick={() => removeBulletPoint(row.id, idx)}>
                                Удалить
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="manual-bullets-wrap">
                        <div className="manual-bullets-head">
                          <span>Attributes</span>
                        </div>
                        <div className="manual-attribute-add-row">
                          {attributeOptions.length > 0 ? (
                            <select
                              value={row.pendingAttributeName}
                              onChange={(e) => updateRow(row.id, "pendingAttributeName", e.target.value)}
                            >
                              {attributeOptions.map((item) => (
                                <option key={item} value={item}>
                                  {item}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              value={row.pendingAttributeName}
                              onChange={(e) => updateRow(row.id, "pendingAttributeName", e.target.value)}
                              placeholder="Название атрибута"
                            />
                          )}
                          <input
                            value={row.pendingAttributeValue}
                            onChange={(e) => updateRow(row.id, "pendingAttributeValue", e.target.value)}
                            placeholder="Значение"
                          />
                          <button type="button" className="secondary-btn" onClick={() => addAttribute(row.id)}>
                            Добавить
                          </button>
                        </div>
                        <div className="manual-bullets-list">
                          {row.attributes.map((attribute, idx) => (
                            <div className="manual-bullet-row" key={`${row.id}-attr-${idx}`}>
                              <input value={`${attribute.name}: ${attribute.value}`} readOnly />
                              <button type="button" className="ghost-btn" onClick={() => removeAttribute(row.id, idx)}>
                                Удалить
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="manual-form-section">
                      <h4>Availability</h4>
                      <div className="manual-form-grid">
                        <label>
                          Quantity *
                          <input
                            value={row.quantity}
                            onChange={(e) => updateRow(row.id, "quantity", e.target.value)}
                            placeholder="1"
                          />
                        </label>
                        <label>
                          Processing Time *
                          <input
                            value={row.processingTime}
                            onChange={(e) => updateRow(row.id, "processingTime", e.target.value)}
                            placeholder="DEFAULT"
                          />
                        </label>
                        <label className="manual-field-full">
                          Shipping Profile ID *
                          {shippingProfiles.length > 0 ? (
                            <select
                              value={row.shippingProfileID}
                              onChange={(e) => updateRow(row.id, "shippingProfileID", e.target.value)}
                            >
                              {shippingProfiles.map((profile) => (
                                <option key={profile.id} value={profile.id}>
                                  {profile.name} ({profile.id})
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              value={row.shippingProfileID}
                              onChange={(e) => updateRow(row.id, "shippingProfileID", e.target.value)}
                              placeholder="UUID shipping profile"
                            />
                          )}
                        </label>
                      </div>
                    </div>

                    <div className="manual-form-section">
                      <h4>Цена и медиа</h4>
                      <div className="manual-form-grid">
                        <label>
                          Цена (EUR) *
                          <input
                            value={row.price}
                            onChange={(e) => updateRow(row.id, "price", e.target.value)}
                            placeholder="99.99"
                          />
                        </label>
                        <label className="manual-field-full">
                          Изображения товара *
                          <label
                            className={`manual-image-dropzone ${isUploadingImage ? "is-uploading" : ""}`}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => onImageDrop(row.id, event)}
                          >
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              onChange={(event) => onImageInputChange(row.id, event)}
                            />
                            <strong>{isUploadingImage ? "Загружаем изображения..." : "Перетащите изображения сюда"}</strong>
                            <span>или нажмите и выберите один или несколько файлов</span>
                          </label>
                          {imageError ? <em className="manual-image-error">{imageError}</em> : null}
                        </label>
                        <label className="manual-field-full">
                          Внешняя ссылка на изображение (опционально)
                          <div className="manual-image-url-row">
                            <input
                              value={row.pendingImageUrl}
                              onChange={(e) => updateRow(row.id, "pendingImageUrl", e.target.value)}
                              placeholder="https://..."
                            />
                            <button type="button" className="secondary-btn" onClick={() => addImageUrl(row.id)}>
                              Добавить
                            </button>
                          </div>
                        </label>
                        <div className="manual-field-full manual-images-list">
                          {row.imageUrls.length === 0 ? (
                            <p className="manual-collapsed-note">Пока нет изображений.</p>
                          ) : (
                            row.imageUrls.map((url, imageIndex) => (
                              <div className="manual-image-item" key={`${row.id}-img-${imageIndex}`}>
                                <img
                                  className="manual-image-preview"
                                  src={toPreviewImageUrl(url)}
                                  alt={`Товар ${cardIndex + 1} изображение ${imageIndex + 1}`}
                                />
                                <div className="manual-image-item-meta">
                                  <span>{url}</span>
                                  <button
                                    type="button"
                                    className="ghost-btn"
                                    onClick={() => removeImageUrl(row.id, imageIndex)}
                                  >
                                    Удалить
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="manual-collapsed-note">
                    Карточка свернута. Нажмите «Раскрыть», чтобы продолжить редактирование.
                  </p>
                )}
              </section>
            );
          })}
        </div>

        {issues.length > 0 ? (
          <ul className="issues-list">
            {issues.map((issue, idx) => (
              <li key={`${issue.stage}-${issue.index}-${idx}`}>
                Товар {issue.index + 1}: {issue.message}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </AppWorkspaceShell>
  );
}
