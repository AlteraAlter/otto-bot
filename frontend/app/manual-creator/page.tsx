"use client";

import { ChangeEvent, DragEvent, useEffect, useState } from "react";

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
};

type ImageUploadResponse = {
  success?: boolean;
  imageUrl?: string;
  message?: string;
  detail?: string;
};

type AvailabilityResult = {
  update_quantity?: { success?: boolean; errors?: string | null };
  update_delivery?: { success?: boolean; errors?: string | null };
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
type CardSection = "base" | "content" | "availability" | "media";

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

function getRequiredFieldCount(row: SingleRow): { done: number; total: number } {
  const checks = [
    row.productReference.trim().length > 0,
    row.sku.trim().length > 0,
    row.ean.trim().length > 0,
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
  if (!row.ean.trim()) return { payload: null, error: "Поле EAN обязательно" };
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
      ean: row.ean.trim(),
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
  const STORAGE_KEY = "manual_creator_draft_v2";
  const { currentUser, isLoading, error } = useCurrentUser();
  const [state, setState] = useState<UploadState>("idle");
  const [message, setMessage] = useState("");
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
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [activeSectionByCard, setActiveSectionByCard] = useState<Record<string, CardSection>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { controller?: ControllerOption; rows?: SingleRow[] };
      if (parsed.controller === "jv" || parsed.controller === "xl") {
        setController(parsed.controller);
      }
      if (Array.isArray(parsed.rows) && parsed.rows.length > 0) {
        setRows(parsed.rows);
      }
    } catch {
      // ignore broken draft
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ controller, rows }));
    } catch {
      // ignore storage failures
    }
  }, [controller, rows]);

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
    setRows((prev) => {
      const next = [...prev, nextRow];
      setActiveCardIndex(next.length - 1);
      return next;
    });
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      next.delete(nextRow.id);
      return next;
    });
    setActiveSectionByCard((prev) => ({ ...prev, [nextRow.id]: "base" }));
  }

  function removeRow(id: string) {
    setRows((prev) => {
      const next = prev.filter((row) => row.id !== id);
      if (next.length === 0) {
        setActiveCardIndex(0);
        return [createEmptySingleRow()];
      }
      setActiveCardIndex((current) => Math.max(0, Math.min(current, next.length - 1)));
      return next;
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
    setActiveSectionByCard((prev) => {
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

  function moveImage(id: string, idx: number, direction: "left" | "right") {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const next = [...row.imageUrls];
        const target = direction === "left" ? idx - 1 : idx + 1;
        if (target < 0 || target >= next.length) return row;
        const temp = next[idx];
        next[idx] = next[target];
        next[target] = temp;
        return { ...row, imageUrls: next };
      }),
    );
  }

  function setMainImage(id: string, idx: number) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        if (idx <= 0 || idx >= row.imageUrls.length) return row;
        const next = [...row.imageUrls];
        const [chosen] = next.splice(idx, 1);
        next.unshift(chosen);
        return { ...row, imageUrls: next };
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
        const payload = await readJsonResponse<ImageUploadResponse>(response);
        if (!response.ok || !payload?.imageUrl) {
          const reason = readApiErrorMessage(
            payload,
            payload?.message ?? payload?.detail ?? "Не удалось загрузить изображение.",
            response.status,
          );
          setImageUploadErrors((prev) => ({
            ...prev,
            [id]: reason,
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
    } catch (caughtError) {
      setImageUploadErrors((prev) => ({
        ...prev,
        [id]:
          caughtError instanceof Error
            ? `Не удалось загрузить изображение: ${caughtError.message}`
            : "Не удалось загрузить изображение.",
      }));
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
    const items: Array<{
      product: Record<string, unknown>;
      quantity: number;
      shippingProfileID: string;
      processingTime: string;
      sku: string;
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
      items.push({
        product: converted.payload,
        quantity: Number(row.quantity),
        shippingProfileID: row.shippingProfileID.trim(),
        processingTime: row.processingTime.trim() || "DEFAULT",
        sku: row.sku.trim(),
      });
    });

    if (localIssues.length > 0) {
      setState("error");
      setMessage("Проверьте обязательные поля в карточках.");
      setIssues(localIssues);
      return;
    }

    setState("loading");
    setMessage("Submitting...");
    setIssues([]);

    try {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          controller,
          products: items.map((item) => item.product),
        }),
        cache: "no-store",
      });

      const parsed = await readJsonResponse<CreationResponse>(response);

      if (!response.ok) {
        setState("error");
        setMessage(readApiErrorMessage(parsed, "Ошибка создания товаров", response.status));
        return;
      }

      const availabilityIssues: CreationIssue[] = [];
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const availabilityResponse = await fetch("/api/products/create-availability", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sku: item.sku,
            quantity: String(item.quantity),
            shippingProfileID: item.shippingProfileID,
            processingTime: item.processingTime,
            controller,
          }),
          cache: "no-store",
        });

        const availabilityParsed = await readJsonResponse<AvailabilityResult>(availabilityResponse);
        if (!availabilityResponse.ok) {
          availabilityIssues.push({
            index,
            stage: "availability",
            message: readApiErrorMessage(
              availabilityParsed,
              "Не удалось обновить availability",
              availabilityResponse.status,
            ),
          });
          continue;
        }

        const quantityOk = availabilityParsed?.update_quantity?.success !== false;
        const deliveryOk = availabilityParsed?.update_delivery?.success !== false;
        if (!quantityOk || !deliveryOk) {
          availabilityIssues.push({
            index,
            stage: "availability",
            message:
              availabilityParsed?.update_quantity?.errors ||
              availabilityParsed?.update_delivery?.errors ||
              "Availability обновился с ошибкой",
          });
        }
      }

      if (availabilityIssues.length > 0) {
        setState("error");
        setIssues(availabilityIssues);
        setMessage(
          `Summary: ${items.length - availabilityIssues.length}/${items.length} succeeded, ${availabilityIssues.length} failed.`,
        );
        return;
      }

      setState("success");
      setMessage(`Success: ${items.length}/${items.length} created.`);
      const freshRow = createEmptySingleRow();
      setRows([freshRow]);
      setCollapsedIds(new Set());
      localStorage.removeItem(STORAGE_KEY);
    } catch (caughtError) {
      setState("error");
      setMessage(
        caughtError instanceof Error
          ? `Ошибка запроса: ${caughtError.message}`
          : "Ошибка запроса",
      );
    }
  }

  function openConfirmModal() {
    setShowConfirmModal(true);
  }

  async function confirmAndCreate() {
    setShowConfirmModal(false);
    await handleCreateItems();
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
      description="Создание товаров вручную."
    >
      <div className="creator-workspace manual-creator-workspace">
        {error ? <p className="helper-banner">{error}</p> : null}
        {state !== "idle" && message ? (
          <p className={`helper-banner ${state === "error" ? "" : state === "success" ? "success" : "info"}`}>
            {message}
          </p>
        ) : null}

        <section className="manual-creator-header-card">
          <div>
            <h2>Конструктор / Product Builder</h2>
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
            <div className="manual-card-graph" aria-label="Навигация по карточкам">
              {rows.map((graphRow, index) => {
                const cardProgress = getRequiredFieldCount(graphRow);
                const isDone = cardProgress.done === cardProgress.total;
                const isActive = index === activeCardIndex;
                const tone = isDone ? "done" : isActive ? "active" : "idle";
                return (
                  <div className="manual-card-graph-node-wrap" key={`graph-${graphRow.id}`}>
                    <button
                      type="button"
                      className={`manual-card-graph-node ${tone}`.trim()}
                      onClick={() => setActiveCardIndex(index)}
                      aria-label={`Товар ${index + 1}`}
                      title={`Товар ${index + 1}`}
                    />
                    {index < rows.length - 1 ? <span className="manual-card-graph-edge" aria-hidden="true" /> : null}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="manual-creator-header-actions">
            <button className="secondary-btn" type="button" onClick={addRow}>
              Добавить карточку
            </button>
            <button className="primary-btn" type="button" onClick={openConfirmModal} disabled={state === "loading"}>
              {state === "loading" ? (
                <>
                  <span className="manual-submit-spinner" aria-hidden="true" />
                  Submitting...
                </>
              ) : (
                "Create"
              )}
            </button>
          </div>
        </section>

        <div className="manual-creator-cards">
          {rows
            .map((row, index) => ({ row, index }))
            .filter(({ index }) => index === activeCardIndex)
            .map(({ row, index: cardIndex }) => {
            const bulletPoints = splitBulletPointsForEdit(row.bulletPoints);
            const isCollapsed = collapsedIds.has(row.id);
            const isUploadingImage = uploadingImageIds.has(row.id);
            const imageError = imageUploadErrors[row.id];
            const mainImage = row.imageUrls[0] ?? "";
            return (
              <section className="manual-product-card" key={row.id}>
                <div className="manual-product-card-head">
                  <h3>
                    {row.sku.trim() ? `SKU ${row.sku.trim()}` : `SKU #${cardIndex + 1}`}
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
                <div className="manual-card-tabs">
                  {([
                    ["base", "База"],
                    ["content", "Контент"],
                    ["availability", "Availability"],
                  ] as const).map(([section, label], index, all) => {
                    const current = activeSectionByCard[row.id] ?? "base";
                    const isActive = current === section;
                    const isDone =
                      section === "base"
                        ? row.productReference.trim().length > 0 &&
                          row.sku.trim().length > 0 &&
                          row.ean.trim().length > 0 &&
                          row.category.trim().length > 0
                        : section === "content"
                          ? row.description.trim().length > 0 || row.bulletPoints.trim().length > 0
                          : section === "availability"
                            ? row.shippingProfileID.trim().length > 0 && Number(row.quantity) > 0
                            : row.imageUrls.some((item) => item.trim().length > 0);
                    const tone = isDone ? "done" : isActive ? "active" : "idle";
                    return (
                      <div className="manual-section-step-wrap" key={`${row.id}-${section}`}>
                        <button
                          type="button"
                          className={`manual-section-step ${tone}`.trim()}
                          onClick={() => setActiveSectionByCard((prev) => ({ ...prev, [row.id]: section }))}
                        >
                          <span className="manual-section-step-dot" aria-hidden="true" />
                          <span>{label}</span>
                        </button>
                        {index < all.length - 1 ? <span className="manual-section-step-edge" aria-hidden="true" /> : null}
                      </div>
                    );
                  })}
                </div>

                <div className="manual-card-layout">
                {!isCollapsed ? (
                  <aside className="manual-card-media">
                    <details className="manual-form-section" open>
                      <summary><h4>Media First / Preview</h4></summary>
                      <div className="manual-media-stage">
                        {mainImage ? (
                          <>
                            <img
                              className="manual-media-main-image"
                              src={toPreviewImageUrl(mainImage)}
                              alt={`Товар ${cardIndex + 1} основное изображение`}
                            />
                            {row.imageUrls.length > 1 ? (
                              <>
                                <button
                                  type="button"
                                  className="manual-media-nav prev"
                                  onClick={() => moveImage(row.id, 0, "right")}
                                  aria-label="Предыдущее изображение"
                                >
                                  ‹
                                </button>
                                <button
                                  type="button"
                                  className="manual-media-nav next"
                                  onClick={() => moveImage(row.id, 0, "left")}
                                  aria-label="Следующее изображение"
                                >
                                  ›
                                </button>
                              </>
                            ) : null}
                          </>
                        ) : (
                          <div className="manual-media-main-placeholder">Загрузите первое изображение</div>
                        )}
                      </div>

                      <div className="manual-media-dots" aria-label="Индикатор изображений">
                        {row.imageUrls.length === 0 ? (
                          <p className="manual-collapsed-note">Пока нет изображений.</p>
                        ) : (
                          row.imageUrls.map((url, imageIndex) => (
                            <button
                              type="button"
                              key={`${row.id}-dot-${imageIndex}`}
                              className={`manual-media-dot ${imageIndex === 0 ? "active" : ""}`.trim()}
                              onClick={() => setMainImage(row.id, imageIndex)}
                              aria-label={`Сделать изображение ${imageIndex + 1} активным`}
                            />
                          ))
                        )}
                      </div>

                      <div className="manual-form-grid">
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
                      </div>
                    </details>
                  </aside>
                ) : null}
                <div className="manual-card-main">
                {!isCollapsed ? (
                  <>
                    {(activeSectionByCard[row.id] ?? "base") === "base" ? (
                    <>
                    <details className="manual-form-section" open>
                      <summary><h4>Идентификаторы / Identity</h4></summary>
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
                    </details>

                    <details className="manual-form-section" open>
                      <summary><h4>Каталог / Catalog</h4></summary>
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
                    </details>
                    </>
                    ) : null}

                    {(activeSectionByCard[row.id] ?? "base") === "content" ? (
                    <details className="manual-form-section" open>
                      <summary><h4>Контент / Content</h4></summary>
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
                          <select
                            value={row.pendingAttributeName}
                            onChange={(e) => updateRow(row.id, "pendingAttributeName", e.target.value)}
                          >
                            <option value="">Выберите атрибут</option>
                            {attributeOptions.map((item) => (
                              <option key={item} value={item}>
                                {item}
                              </option>
                            ))}
                          </select>
                          <input
                            className="manual-attribute-value-input"
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
                    </details>
                    ) : null}

                    {(activeSectionByCard[row.id] ?? "base") === "availability" ? (
                    <details className="manual-form-section" open>
                      <summary><h4>Availability</h4></summary>
                      <div className="manual-form-grid">
                        <label>
                          Цена (EUR) *
                          <input
                            value={row.price}
                            onChange={(e) => updateRow(row.id, "price", e.target.value)}
                            placeholder="99.99"
                          />
                        </label>
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
                    </details>
                    ) : null}
                  </>
                ) : (
                  <p className="manual-collapsed-note">
                    Карточка свернута. Нажмите «Раскрыть», чтобы продолжить редактирование.
                  </p>
                )}
                </div>
                </div>
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
        {showConfirmModal ? (
          <div className="manual-confirm-backdrop">
            <div className="manual-confirm-modal">
              <h3>Подтверждение / Confirm</h3>
              <p>Будет отправлено карточек: <strong>{rows.length}</strong></p>
              <p>Controller: <strong>{controller}</strong></p>
              <div className="manual-product-card-actions">
                <button className="ghost-btn" type="button" onClick={() => setShowConfirmModal(false)}>Отмена</button>
                <button className="primary-btn" type="button" onClick={confirmAndCreate}>Отправить</button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AppWorkspaceShell>
  );
}
