"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ProductStatus = "active" | "draft" | "paused";

type Product = {
  id: string;
  productReference: string;
  name: string;
  sku: string;
  ean: string;
  moin: string;
  category: string;
  brand: string;
  brandId: string;
  price: number;
  stock: number;
  mediaCount: number;
  attributesCount: number;
  bulletPoints: string[];
  description: string;
  status: ProductStatus;
  rating: number;
  sales: number;
  views: number;
  updatedAt: string;
};

type Activity = {
  id: string;
  productId: string;
  message: string;
  time: string;
};

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPath(source: JsonObject, path: string[]): unknown {
  let current: unknown = source;
  for (const key of path) {
    if (!isObject(current)) return undefined;
    current = current[key];
  }
  return current;
}

function getString(source: JsonObject, paths: string[][]): string | undefined {
  for (const path of paths) {
    const value = readPath(source, path);
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return undefined;
}

function getNumber(source: JsonObject, paths: string[][]): number | undefined {
  for (const path of paths) {
    const value = readPath(source, path);
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function extractCollection(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isObject(payload)) return [];

  const containers = [
    "productVariations",
    "marketPlaceStatus",
    "status",
    "items",
    "products",
    "content",
    "data",
    "results"
  ];
  for (const key of containers) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
  }

  return [];
}

function statusFromText(value: string | undefined): ProductStatus | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (
    normalized.includes("pause") ||
    normalized.includes("inactive") ||
    normalized.includes("offline")
  ) {
    return "paused";
  }
  if (
    normalized.includes("active") ||
    normalized.includes("aktiv") ||
    normalized.includes("online")
  ) {
    return "active";
  }
  if (normalized.includes("draft")) return "draft";
  return undefined;
}

function toDateLabel(input: unknown) {
  if (typeof input !== "string" || input.length === 0) return "-";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return date.toLocaleDateString("ru-RU");
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2
  }).format(value);
}

function statusLabel(status: ProductStatus) {
  if (status === "active") return "Активен";
  if (status === "paused") return "Пауза";
  return "Черновик";
}

function mapProduct(raw: unknown, index: number, statusBySku: Record<string, ProductStatus>): Product | null {
  if (!isObject(raw)) return null;

  const sku = getString(raw, [["sku"], ["productSku"]]);
  const productReference = getString(raw, [["productReference"], ["reference"]]);
  const id = sku ?? productReference ?? `item-${index}`;
  const productLine = getString(raw, [["productDescription", "productLine"], ["name"]]);
  const bulletPointsRaw = readPath(raw, ["productDescription", "bulletPoints"]);
  const attributesRaw = readPath(raw, ["productDescription", "attributes"]);
  const mediaAssetsRaw = readPath(raw, ["mediaAssets"]);
  const bulletPoints = Array.isArray(bulletPointsRaw)
    ? bulletPointsRaw.filter((item): item is string => typeof item === "string")
    : [];
  const attributesCount = Array.isArray(attributesRaw) ? attributesRaw.length : 0;
  const mediaCount = Array.isArray(mediaAssetsRaw) ? mediaAssetsRaw.length : 0;

  const category = getString(raw, [["productDescription", "category"], ["category"]]) ?? "Без категории";
  const brand = getString(raw, [["productDescription", "brand"]]) ?? "Без бренда";
  const brandId = getString(raw, [["productDescription", "brandId"]]) ?? "-";
  const price = getNumber(raw, [["pricing", "standardPrice", "amount"], ["price", "amount"], ["price"]]) ?? 0;
  const stock =
    getNumber(raw, [["availability", "stockQuantity"], ["stock"], ["inventory"], ["quantity"], ["order", "maxOrderQuantity", "quantity"]]) ?? 0;

  const rawStatus =
    statusFromText(getString(raw, [["marketPlaceStatus"], ["status"], ["activeStatus"]])) ?? "draft";

  const mappedStatus = sku ? statusBySku[sku] ?? rawStatus : rawStatus;

  return {
    id,
    productReference: productReference ?? "-",
    name: productLine ?? productReference ?? sku ?? `Товар ${index + 1}`,
    sku: sku ?? `sku-${index}`,
    ean: getString(raw, [["ean"]]) ?? "-",
    moin: getString(raw, [["moin"]]) ?? "-",
    category,
    brand,
    brandId,
    price,
    stock,
    mediaCount,
    attributesCount,
    bulletPoints,
    description: getString(raw, [["productDescription", "description"]]) ?? "",
    status: mappedStatus,
    rating: getNumber(raw, [["rating"], ["reviews", "rating"]]) ?? 0,
    sales: getNumber(raw, [["sales"], ["soldQuantity"]]) ?? 0,
    views: getNumber(raw, [["views"], ["viewCount"]]) ?? 0,
    updatedAt: toDateLabel(readPath(raw, ["updatedAt"]) ?? readPath(raw, ["lastModifiedDate"]))
  };
}

function mapStatusBySku(payload: unknown): Record<string, ProductStatus> {
  const map: Record<string, ProductStatus> = {};
  for (const item of extractCollection(payload)) {
    if (!isObject(item)) continue;

    const sku = getString(item, [["sku"], ["productSku"]]);
    if (!sku) continue;

    const boolFlag = readPath(item, ["active"]);
    if (typeof boolFlag === "boolean") {
      map[sku] = boolFlag ? "active" : "paused";
      continue;
    }

    const fromString = statusFromText(getString(item, [["status"], ["marketPlaceStatus"], ["activeStatus"]]));
    if (fromString) map[sku] = fromString;
  }
  return map;
}

function mapActivity(payload: unknown): Activity[] {
  return extractCollection(payload)
    .map((item, index) => {
      if (!isObject(item)) return null;
      const sku = getString(item, [["sku"], ["productSku"]]);
      const message =
        getString(item, [["reason"], ["message"], ["status"], ["marketPlaceStatus"]]) ?? "Изменение статуса товара";

      return {
        id: `act-${index}-${sku ?? "unknown"}`,
        productId: sku ?? "unknown",
        message,
        time: toDateLabel(readPath(item, ["changedAt"]) ?? readPath(item, ["updatedAt"]) ?? readPath(item, ["fromDate"]))
      };
    })
    .filter((item): item is Activity => item !== null);
}

function asCreatePayload(detail: JsonObject, product: Product): JsonObject | null {
  const productDescription = readPath(detail, ["productDescription"]);
  const mediaAssets = readPath(detail, ["mediaAssets"]);
  const pricing = readPath(detail, ["pricing"]);
  const logistics = readPath(detail, ["logistics"]);

  if (!isObject(productDescription) || !Array.isArray(mediaAssets) || !isObject(pricing) || !isObject(logistics)) {
    return null;
  }

  const standardPrice = readPath(pricing, ["standardPrice"]);
  if (!isObject(standardPrice)) return null;

  return {
    productReference: product.productReference !== "-" ? product.productReference : product.name,
    sku: product.sku,
    ean: product.ean !== "-" ? product.ean : getString(detail, [["ean"]]),
    pzn: getString(detail, [["pzn"]]),
    mpn: getString(detail, [["mpn"]]),
    moin: product.moin !== "-" ? product.moin : getString(detail, [["moin"]]),
    releaseDate: readPath(detail, ["releaseDate"]),
    productDescription: {
      ...productDescription,
      category: product.category,
      brand: product.brand,
      brandId: product.brandId,
      productLine: product.name,
      description: product.description,
      bulletPoints: product.bulletPoints
    },
    mediaAssets,
    order: isObject(readPath(detail, ["order"])) ? readPath(detail, ["order"]) : undefined,
    pricing: {
      ...pricing,
      standardPrice: {
        ...standardPrice,
        amount: product.price
      }
    },
    logistics,
    compliance: isObject(readPath(detail, ["compliance"])) ? readPath(detail, ["compliance"]) : undefined
  };
}

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [detailsBySku, setDetailsBySku] = useState<Record<string, JsonObject>>({});
  const [activity, setActivity] = useState<Activity[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ProductStatus>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSkuSearching, setIsSkuSearching] = useState(false);
  const [skuSearchResults, setSkuSearchResults] = useState<Product[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const statusCacheRef = useRef<Record<string, ProductStatus>>({});

  const allKnownProducts = useMemo(() => {
    const map = new Map<string, Product>();
    for (const item of products) map.set(item.id, item);
    for (const item of skuSearchResults ?? []) map.set(item.id, item);
    return Array.from(map.values());
  }, [products, skuSearchResults]);

  const selectedProduct = allKnownProducts.find((product) => product.id === selectedId) ?? null;

  const categories = useMemo(() => {
    return Array.from(new Set(products.map((item) => item.category)));
  }, [products]);

  const catalogFiltered = useMemo(() => {
    return products.filter((product) => {
      const inStatus = statusFilter === "all" || product.status === statusFilter;
      const inCategory = categoryFilter === "all" || product.category === categoryFilter;
      return inStatus && inCategory;
    });
  }, [products, statusFilter, categoryFilter]);

  const visibleProducts = useMemo(() => {
    const source = query.trim().length > 0 ? skuSearchResults ?? [] : catalogFiltered;
    return source.filter((product) => {
      const inStatus = statusFilter === "all" || product.status === statusFilter;
      const inCategory = categoryFilter === "all" || product.category === categoryFilter;
      return inStatus && inCategory;
    });
  }, [query, skuSearchResults, catalogFiltered, statusFilter, categoryFilter]);

  const kpi = useMemo(() => {
    const total = products.length;
    const active = products.filter((p) => p.status === "active").length;
    const lowStock = products.filter((p) => p.stock > 0 && p.stock < 15).length;
    const totalValue = products.reduce((sum, p) => sum + p.price * p.stock, 0);
    return { total, active, lowStock, totalValue };
  }, [products]);

  const productActivity = useMemo(() => {
    if (!selectedProduct) return [];
    return activity.filter((item) => item.productId === selectedProduct.sku).slice(0, 6);
  }, [activity, selectedProduct]);

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    setNotice(null);

    try {
      const [productsRes, statusRes] = await Promise.all([
        fetch("/api/products?limit=100", { cache: "no-store" }),
        fetch("/api/products/marketplace-status?limit=100", { cache: "no-store" })
      ]);

      if (!productsRes.ok) {
        throw new Error(`Не удалось получить товары (${productsRes.status})`);
      }

      const productPayload: unknown = await productsRes.json();
      const statusPayload: unknown = statusRes.ok ? await statusRes.json() : [];

      const statusBySku = mapStatusBySku(statusPayload);
      statusCacheRef.current = { ...statusCacheRef.current, ...statusBySku };
      const mapped = extractCollection(productPayload)
        .map((item, index) => mapProduct(item, index, statusBySku))
        .filter((item): item is Product => item !== null);

      setProducts(mapped);
      setActivity(mapActivity(statusPayload));

      if (mapped.length > 0) {
        setSelectedId((current) => current || mapped[0].id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ошибка загрузки товаров";
      setNotice(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    const sku = query.trim();
    if (sku.length === 0) {
      setSkuSearchResults(null);
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      setIsSkuSearching(true);
      try {
        const productResponse = await fetch(`/api/products/${encodeURIComponent(sku)}`, {
          cache: "no-store"
        });

        if (!productResponse.ok) {
          setSkuSearchResults([]);
          return;
        }

        const payload: unknown = await productResponse.json();
        let statusBySku = { ...statusCacheRef.current };

        if (!statusBySku[sku]) {
          const statusResponse = await fetch(
            `/api/products/marketplace-status?sku=${encodeURIComponent(sku)}&limit=10`,
            {
              cache: "no-store"
            }
          );
          if (statusResponse.ok) {
            const statusPayload: unknown = await statusResponse.json();
            const fromSearch = mapStatusBySku(statusPayload);
            statusBySku = { ...statusBySku, ...fromSearch };
            statusCacheRef.current = statusBySku;
          }
        }

        const mapped = mapProduct(payload, 0, statusBySku);
        setSkuSearchResults(mapped ? [mapped] : []);
      } catch {
        setSkuSearchResults([]);
      } finally {
        setIsSkuSearching(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [query]);

  const ensureProductDetail = useCallback(
    async (sku: string): Promise<JsonObject | null> => {
      if (detailsBySku[sku]) return detailsBySku[sku];

      const response = await fetch(`/api/products/${encodeURIComponent(sku)}`, {
        cache: "no-store"
      });

      if (!response.ok) return null;

      const payload: unknown = await response.json();
      if (!isObject(payload)) return null;

      setDetailsBySku((prev) => ({ ...prev, [sku]: payload }));
      return payload;
    },
    [detailsBySku]
  );

  function updateSelected<K extends keyof Product>(field: K, value: Product[K]) {
    if (!selectedProduct) return;

    setProducts((prev) =>
      prev.map((item) =>
        item.id === selectedProduct.id
          ? {
              ...item,
              [field]: value,
              updatedAt: new Date().toLocaleDateString("ru-RU")
            }
          : item
      )
    );
  }

  async function saveChanges() {
    if (!selectedProduct) return;

    setNotice(null);
    setIsSaving(true);

    try {
      const detail = await ensureProductDetail(selectedProduct.sku);
      if (!detail) {
        throw new Error("Не удалось загрузить полные данные товара для сохранения");
      }

      const payload = asCreatePayload(detail, selectedProduct);
      if (!payload) {
        throw new Error("Формат товара не подходит для /v1/products/create");
      }

      const response = await fetch("/api/products", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Сохранение не выполнено (${response.status}): ${text.slice(0, 220)}`);
      }

      setNotice("Изменения отправлены в ваш endpoint /v1/products/create");
      await loadProducts();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ошибка сохранения";
      setNotice(message);
    } finally {
      setIsSaving(false);
    }
  }

  function deleteProduct() {
    setNotice("Endpoint удаления не найден: в backend нет DELETE /v1/products/{sku}");
  }

  return (
    <main className="otto-page">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <section className="app-shell">
        <aside className="sidebar">
          <div>
            <p className="brand">OTTO Control</p>
            <p className="brand-subtitle">Marketplace manager</p>
          </div>

          <nav className="side-nav">
            <button className="nav-item active">Каталог</button>
            <button className="nav-item">Аналитика</button>
            <button className="nav-item">Заказы</button>
            <button className="nav-item">Промо</button>
            <Link className="nav-item" href="/creator">
              Создание товара
            </Link>
          </nav>

          <div className="side-card">
            <p className="side-card-title">Интеграция OTTO</p>
            <p className="side-card-text">Данные загружаются из ваших endpoint в FastAPI</p>
            <span className="sync-pill">api linked</span>
          </div>
        </aside>

        <section className="workspace">
          <header className="topbar">
            <div>
              <h1>Управление товарами</h1>
              <p>Подключено к backend: список и обновление карточек через API</p>
            </div>
          </header>

          {notice ? <p className="helper-banner">{notice}</p> : null}

          <section className="kpi-grid">
            <article className="kpi-card">
              <p>Всего товаров</p>
              <strong>{kpi.total}</strong>
            </article>
            <article className="kpi-card">
              <p>Активные</p>
              <strong>{kpi.active}</strong>
            </article>
            <article className="kpi-card">
              <p>Низкий остаток</p>
              <strong>{kpi.lowStock}</strong>
            </article>
            <article className="kpi-card">
              <p>Складская стоимость</p>
              <strong>{formatCurrency(kpi.totalValue)}</strong>
            </article>
          </section>

          <section className="content-grid">
            <div className="catalog-panel">
              <div className="toolbar">
                <input
                  type="search"
                  placeholder="Поиск по SKU через endpoint /{sku}"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as "all" | ProductStatus)}
                >
                  <option value="all">Все статусы</option>
                  <option value="active">Активные</option>
                  <option value="paused">Пауза</option>
                  <option value="draft">Черновики</option>
                </select>
                <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                  <option value="all">Все категории</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div className="product-list">
                {isLoading ? <div className="empty-state">Загрузка товаров...</div> : null}
                {!isLoading && isSkuSearching ? <div className="empty-state">Поиск товара по SKU...</div> : null}
                {!isLoading && !isSkuSearching && visibleProducts.length === 0 ? (
                  <div className="empty-state">По заданным фильтрам товары не найдены</div>
                ) : null}

                {!isLoading && !isSkuSearching
                  ? (
                    <div className="product-table">
                      <div className="product-row product-row-head">
                        <span>Товар</span>
                        <span>SKU</span>
                        <span>Категория</span>
                        <span>Цена</span>
                      </div>
                      {visibleProducts.map((product) => {
                        const isSelected = selectedId === product.id;
                        return (
                          <button
                            key={product.id}
                            type="button"
                            className={`product-row ${isSelected ? "selected" : ""}`}
                            onClick={() => {
                              setSelectedId(product.id);
                              setIsDetailOpen(true);
                            }}
                          >
                            <span className="row-name" title={product.name}>
                              {product.name}
                            </span>
                            <span title={product.sku}>{product.sku}</span>
                            <span title={product.category}>{product.category}</span>
                            <span>{formatCurrency(product.price)}</span>
                          </button>
                        );
                      })}
                    </div>
                  )
                  : null}
              </div>
            </div>

            <aside className="editor-panel">
              {selectedProduct && isDetailOpen ? (
                <>
                  <div className="editor-head">
                    <div>
                      <h2>Карточка товара</h2>
                      <p>Обновлено: {selectedProduct.updatedAt}</p>
                    </div>
                    <button className="ghost-btn" onClick={() => setIsDetailOpen(false)}>
                      Закрыть
                    </button>
                  </div>

                  <div className="editor-grid">
                    <label>
                      Название
                      <input
                        value={selectedProduct.name}
                        onChange={(event) => updateSelected("name", event.target.value)}
                      />
                    </label>
                    <label>
                      SKU
                      <input
                        value={selectedProduct.sku}
                        onChange={(event) => updateSelected("sku", event.target.value)}
                      />
                    </label>
                    <label>
                      Brand
                      <input
                        value={selectedProduct.brand}
                        onChange={(event) => updateSelected("brand", event.target.value)}
                      />
                    </label>
                    <label>
                      Brand ID
                      <input
                        value={selectedProduct.brandId}
                        onChange={(event) => updateSelected("brandId", event.target.value)}
                      />
                    </label>
                    <label>
                      Категория
                      <input
                        value={selectedProduct.category}
                        onChange={(event) => updateSelected("category", event.target.value)}
                      />
                    </label>
                    <label>
                      Статус
                      <select
                        value={selectedProduct.status}
                        onChange={(event) => updateSelected("status", event.target.value as ProductStatus)}
                      >
                        <option value="active">Активен</option>
                        <option value="paused">Пауза</option>
                        <option value="draft">Черновик</option>
                      </select>
                    </label>
                    <label>
                      EAN
                      <input value={selectedProduct.ean} onChange={(event) => updateSelected("ean", event.target.value)} />
                    </label>
                    <label>
                      MOIN
                      <input
                        value={selectedProduct.moin}
                        onChange={(event) => updateSelected("moin", event.target.value)}
                      />
                    </label>
                    <label>
                      Цена (EUR)
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={selectedProduct.price}
                        onChange={(event) => updateSelected("price", Number(event.target.value))}
                      />
                    </label>
                    <label>
                      Остаток
                      <input
                        type="number"
                        min="0"
                        value={selectedProduct.stock}
                        onChange={(event) => updateSelected("stock", Number(event.target.value))}
                      />
                    </label>
                    <label>
                      Product Reference
                      <input
                        value={selectedProduct.productReference}
                        onChange={(event) => updateSelected("productReference", event.target.value)}
                      />
                    </label>
                  </div>

                  <div className="product-actions">
                    <button className="danger" onClick={deleteProduct}>
                      Удалить
                    </button>
                  </div>

                  <div className="product-detail-card">
                    <p className="detail-title">Описание товара</p>
                    <p className="detail-description">
                      {selectedProduct.description.length > 0
                        ? selectedProduct.description.slice(0, 420)
                        : "Описание отсутствует"}
                    </p>
                    <div className="detail-bullets">
                      {selectedProduct.bulletPoints.slice(0, 3).map((point, index) => (
                        <span key={`${point}-${index}`}>{point}</span>
                      ))}
                    </div>
                  </div>

                  <div className="editor-analytics">
                    <article>
                      <p>Рейтинг</p>
                      <strong>{selectedProduct.rating.toFixed(1)}</strong>
                    </article>
                    <article>
                      <p>Конверсия</p>
                      <strong>
                        {selectedProduct.views === 0
                          ? "0%"
                          : `${((selectedProduct.sales / selectedProduct.views) * 100).toFixed(1)}%`}
                      </strong>
                    </article>
                    <article>
                      <p>Просмотры</p>
                      <strong>{selectedProduct.views}</strong>
                    </article>
                  </div>

                  <button className="primary-btn full" onClick={saveChanges} disabled={isSaving}>
                    {isSaving ? "Сохранение..." : "Сохранить изменения"}
                  </button>

                  <div className="timeline">
                    <h3>История статусов</h3>
                    {productActivity.length > 0 ? (
                      productActivity.map((item) => (
                        <div key={item.id} className="timeline-item">
                          <p>{item.message}</p>
                          <time>{item.time}</time>
                        </div>
                      ))
                    ) : (
                      <p className="timeline-empty">Нет событий по выбранному товару</p>
                    )}
                  </div>
                </>
              ) : (
                <div className="empty-state">Выберите мини-карточку слева, чтобы открыть все данные товара</div>
              )}
            </aside>
          </section>
        </section>
      </section>
    </main>
  );
}
