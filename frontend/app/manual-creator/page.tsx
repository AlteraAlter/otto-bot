"use client";

import { ChangeEvent, DragEvent, useState } from "react";

import { useCurrentUser } from "../hooks/use-current-user";
import { AppWorkspaceShell } from "../ui/app-workspace-shell";

type UploadState = "idle" | "loading" | "success" | "error";

type CreationIssue = {
  index: number;
  stage: string;
  message: string;
};

type CreationResponse = {
  success: boolean;
  message?: string;
  created_items?: number;
  issues?: CreationIssue[];
};

type ImageUploadResponse = {
  success?: boolean;
  imageUrl?: string;
  message?: string;
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
  bulletPoints: string;
  description: string;
  price: string;
  imageUrls: string[];
  pendingImageUrl: string;
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
    bulletPoints: "",
    description: "",
    price: "99.99",
    imageUrls: [],
    pendingImageUrl: "",
  };
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

function rowToPreparedPayload(
  row: SingleRow,
): { payload: Record<string, unknown> | null; error?: string } {
  if (!row.sku.trim()) return { payload: null, error: "SKU is required" };
  if (!row.productReference.trim()) return { payload: null, error: "Product Reference is required" };
  if (!row.category.trim()) return { payload: null, error: "Category is required" };
  if (!row.brandId.trim()) return { payload: null, error: "Brand ID is required" };

  const amount = Number(row.price);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { payload: null, error: "Price must be a positive number" };
  }

  const images = row.imageUrls.map((item) => item.trim()).filter((item) => item.length > 0);
  if (images.length === 0) {
    return { payload: null, error: "At least one image is required" };
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
      return { payload: null, error: "Image URL must start with http:// or https://, or be uploaded" };
    }
  }

  return {
    payload: {
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
        attributes: [],
      },
      mediaAssets: images.map((location) => ({ type: "IMAGE", location })),
      pricing: {
        standardPrice: {
          amount,
          currency: "EUR",
        },
        vat: "FULL",
      },
      logistics: {
        packingUnitCount: 1,
        packingUnits: [
          {
            weight: 1,
            width: 1,
            height: 1,
            length: 1,
          },
        ],
      },
    },
  };
}

export default function ManualCreatorPage() {
  const { currentUser, isLoading, error } = useCurrentUser();
  const [state, setState] = useState<UploadState>("idle");
  const [message, setMessage] = useState("Fill one or more rows and submit.");
  const [issues, setIssues] = useState<CreationIssue[]>([]);
  const [rows, setRows] = useState<SingleRow[]>([createEmptySingleRow()]);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [uploadingImageIds, setUploadingImageIds] = useState<Set<string>>(new Set());
  const [imageUploadErrors, setImageUploadErrors] = useState<Record<string, string>>({});

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

  async function uploadImagesForRow(id: string, files: File[]) {
    if (files.length === 0) return;
    if (files.some((file) => !file.type.startsWith("image/"))) {
      setImageUploadErrors((prev) => ({ ...prev, [id]: "Please choose only image files." }));
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
          setImageUploadErrors((prev) => ({ ...prev, [id]: payload.message ?? "Image upload failed." }));
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
      setImageUploadErrors((prev) => ({ ...prev, [id]: "Image upload failed." }));
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
      setMessage("Fill at least one row.");
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
          message: converted.error ?? "Validation error",
        });
        return;
      }
      requestBodies.push(converted.payload);
    });

    if (localIssues.length > 0) {
      setState("error");
      setMessage("Please fix validation errors.");
      setIssues(localIssues);
      return;
    }

    setState("loading");
    setMessage("Creating products...");
    setIssues([]);

    try {
      const response = await fetch("/api/products/create-from-prepared", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ request_bodies: requestBodies }),
        cache: "no-store",
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
        setMessage(parsed?.message ?? `Request failed (${response.status})`);
        return;
      }

      setState("success");
      setMessage(`Created: ${parsed?.created_items ?? 0} products.`);
      const freshRow = createEmptySingleRow();
      setRows([freshRow]);
      setCollapsedIds(new Set());
    } catch (caughtError) {
      setState("error");
      setMessage(
        caughtError instanceof Error ? `Request failed: ${caughtError.message}` : "Request failed",
      );
    }
  }

  if (isLoading) {
    return (
      <main className="otto-page">
        <section className="app-shell">
          <section className="workspace">
            <p className="helper-banner info">Please wait...</p>
          </section>
        </section>
      </main>
    );
  }

  return (
    <AppWorkspaceShell
      activeHref="/manual-creator"
      currentUser={currentUser}
      sectionLabel="Creation"
      title="Manual Product Creation"
      description="Create OTTO products with a clear form flow."
    >
      <div className="creator-workspace manual-creator-workspace">
        {error ? <p className="helper-banner">{error}</p> : null}
        <p className={`helper-banner ${state === "error" ? "" : "info"}`}>{message}</p>

        <section className="manual-creator-header-card">
          <div>
            <h2>Product Form Builder</h2>
            <p>
              Fill each product card below. Keep details simple and complete, then click
              <strong> Create Products</strong>.
            </p>
          </div>
          <div className="manual-creator-header-actions">
            <button className="ghost-btn" type="button" onClick={expandAll}>
              Expand All
            </button>
            <button className="ghost-btn" type="button" onClick={collapseAll}>
              Collapse All
            </button>
            <button className="secondary-btn" type="button" onClick={addRow}>
              Add Product Card
            </button>
            <button
              className="primary-btn"
              type="button"
              onClick={handleCreateItems}
              disabled={state === "loading"}
            >
              {state === "loading" ? "Creating..." : "Create Products"}
            </button>
          </div>
        </section>

        <div className="manual-creator-cards">
          {rows.map((row, cardIndex) => {
            const bulletPoints = splitBulletPointsForEdit(row.bulletPoints);
            const isCollapsed = collapsedIds.has(row.id);
            const isUploadingImage = uploadingImageIds.has(row.id);
            const imageError = imageUploadErrors[row.id];
            return (
              <section className="manual-product-card" key={row.id}>
                <div className="manual-product-card-head">
                  <h3>Product {cardIndex + 1}</h3>
                  <div className="manual-product-card-actions">
                    <button type="button" className="ghost-btn" onClick={() => toggleCard(row.id)}>
                      {isCollapsed ? "Expand" : "Collapse"}
                    </button>
                    <button type="button" className="ghost-btn" onClick={() => removeRow(row.id)}>
                      Remove Product
                    </button>
                  </div>
                </div>

                {!isCollapsed ? (
                  <>
                <div className="manual-form-section">
                  <h4>Identity</h4>
                  <div className="manual-form-grid">
                    <label>
                      Product Reference
                      <input
                        value={row.productReference}
                        onChange={(e) => updateRow(row.id, "productReference", e.target.value)}
                        placeholder="Internal reference"
                      />
                    </label>
                    <label>
                      SKU
                      <input
                        value={row.sku}
                        onChange={(e) => updateRow(row.id, "sku", e.target.value)}
                        placeholder="SKU code"
                      />
                    </label>
                    <label>
                      EAN
                      <input
                        value={row.ean}
                        onChange={(e) => updateRow(row.id, "ean", e.target.value)}
                        placeholder="Optional"
                      />
                    </label>
                    <label>
                      MOIN
                      <input
                        value={row.moin}
                        onChange={(e) => updateRow(row.id, "moin", e.target.value)}
                        placeholder="Optional"
                      />
                    </label>
                  </div>
                </div>

                <div className="manual-form-section">
                  <h4>Catalog Details</h4>
                  <div className="manual-form-grid">
                    <label>
                      Category
                      <input
                        value={row.category}
                        onChange={(e) => updateRow(row.id, "category", e.target.value)}
                        placeholder="Category name"
                      />
                    </label>
                    <label>
                      Brand ID
                      <input
                        value={row.brandId}
                        onChange={(e) => updateRow(row.id, "brandId", e.target.value)}
                        placeholder="Brand identifier"
                      />
                    </label>
                    <label className="manual-field-full">
                      Product Title
                      <input
                        value={row.productLine}
                        onChange={(e) => updateRow(row.id, "productLine", e.target.value)}
                        placeholder="Customer-facing title"
                      />
                    </label>
                  </div>
                </div>

                <div className="manual-form-section">
                  <h4>Content</h4>
                  <label className="manual-field-full">
                    Description
                    <textarea
                      value={row.description}
                      onChange={(e) => updateRow(row.id, "description", e.target.value)}
                      rows={4}
                      placeholder="Clear product description for OTTO listing"
                    />
                  </label>
                  <div className="manual-bullets-wrap">
                    <div className="manual-bullets-head">
                      <span>Bullet Points</span>
                      <button type="button" className="secondary-btn" onClick={() => addBulletPoint(row.id)}>
                        Add Bullet
                      </button>
                    </div>
                    <div className="manual-bullets-list">
                      {(bulletPoints.length > 0 ? bulletPoints : [""]).map((point, idx) => (
                        <div className="manual-bullet-row" key={`${row.id}-bp-${idx}`}>
                          <input
                            value={point}
                            onChange={(e) => updateBulletPoint(row.id, idx, e.target.value)}
                            placeholder={`Bullet point ${idx + 1}`}
                          />
                          <button type="button" className="ghost-btn" onClick={() => removeBulletPoint(row.id, idx)}>
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="manual-form-section">
                  <h4>Price and Media</h4>
                  <div className="manual-form-grid">
                    <label>
                      Price (EUR)
                      <input
                        value={row.price}
                        onChange={(e) => updateRow(row.id, "price", e.target.value)}
                        placeholder="99.99"
                      />
                    </label>
                    <label className="manual-field-full">
                      Product Images
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
                        <strong>{isUploadingImage ? "Uploading images..." : "Drag and drop images here"}</strong>
                        <span>or click to choose one or more files</span>
                      </label>
                      {imageError ? <em className="manual-image-error">{imageError}</em> : null}
                    </label>
                    <label className="manual-field-full">
                      Add External Image URL (optional)
                      <div className="manual-image-url-row">
                      <input
                        value={row.pendingImageUrl}
                        onChange={(e) => updateRow(row.id, "pendingImageUrl", e.target.value)}
                        placeholder="Use only if image is hosted elsewhere (https://...)"
                      />
                        <button type="button" className="secondary-btn" onClick={() => addImageUrl(row.id)}>
                          Add
                        </button>
                      </div>
                    </label>
                    <div className="manual-field-full manual-images-list">
                      {row.imageUrls.length === 0 ? (
                        <p className="manual-collapsed-note">No images added yet.</p>
                      ) : (
                        row.imageUrls.map((url, imageIndex) => (
                          <div className="manual-image-item" key={`${row.id}-img-${imageIndex}`}>
                            <img
                              className="manual-image-preview"
                              src={url}
                              alt={`Product ${cardIndex + 1} image ${imageIndex + 1}`}
                            />
                            <div className="manual-image-item-meta">
                              <span>{url}</span>
                              <button
                                type="button"
                                className="ghost-btn"
                                onClick={() => removeImageUrl(row.id, imageIndex)}
                              >
                                Remove
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
                    Card collapsed. Click Expand to continue editing this product.
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
                Product {issue.index + 1}: {issue.message}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </AppWorkspaceShell>
  );
}
