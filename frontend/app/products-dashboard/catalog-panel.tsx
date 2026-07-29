"use client";

import Link from "next/link";
import { memo, useEffect, useMemo, useRef, useState } from "react";

import { PriceUpdateController, PriceUpdateItem } from "./use-product-dashboard";
import { Product, SortByField, SortOrder } from "./types";
import { formatCurrency, formatDateTime, formatText, processUvp } from "./utils";

type CatalogPanelProps = {
  categories: string[];
  categoryFilter: string;
  dbTotal: number;
  isCompact: boolean;
  isLoading: boolean;
  products: Product[];
  query: string;
  selectedId: string;
  selectedProductIds: Set<string>;
  sortBy: SortByField;
  sortOrder: SortOrder;
  tablePage: number;
  totalTablePages: number;
  onBulkPriceUpdate: (
    items: PriceUpdateItem[],
    controller?: PriceUpdateController,
  ) => Promise<Product[]>;
  onCategoryFilterChange: (value: string) => void;
  onClearProductSelection: () => void;
  onOpenProduct: (productId: string) => void;
  onPageChange: (updater: number | ((prev: number) => number)) => void;
  onQueryChange: (value: string) => void;
  onSortByChange: (value: SortByField) => void;
  onSortOrderChange: (value: SortOrder) => void;
  onTogglePageSelection: () => void;
  onToggleProductSelection: (productId: string) => void;
};

type ProductRowProps = {
  isCompact: boolean;
  isActiveRow: boolean;
  isSelected: boolean;
  product: Product;
  onOpen: (productId: string) => void;
  onToggleSelection: (productId: string) => void;
};

type ProductImagePreviewProps = {
  alt: string;
  compact?: boolean;
  imageUrls: string[];
  fallbackLabel: string;
};

function ProductImagePreview({
  alt,
  compact = false,
  imageUrls,
  fallbackLabel,
}: ProductImagePreviewProps) {
  const [hasImageError, setHasImageError] = useState(false);
  const imageUrl = imageUrls[0] ?? null;
  const showImage = Boolean(imageUrl) && !hasImageError;
  const imagesCount = imageUrls.length;

  useEffect(() => {
    setHasImageError(false);
  }, [imageUrl]);

  return (
    <span className={`product-thumbnail-wrapper ${compact ? "compact" : ""}`.trim()}>
      {showImage && imageUrl ? (
        <img
          alt={alt}
          className="product-thumbnail"
          loading="lazy"
          onError={() => setHasImageError(true)}
          src={imageUrl}
        />
      ) : (
        <span className="product-thumbnail product-thumbnail--empty" aria-label="Нет фото">
          <span>{fallbackLabel.slice(0, 1) || "P"}</span>
          {!compact ? <em>Нет фото</em> : null}
        </span>
      )}

      {imagesCount > 1 ? (
        <span className="product-thumbnail-count">{imagesCount}</span>
      ) : null}
    </span>
  );
}

const ProductRow = memo(function ProductRow({
  isCompact,
  isActiveRow,
  isSelected,
  product,
  onOpen,
  onToggleSelection,
}: ProductRowProps) {
  const isInactive = formatText(product.activeStatus).toLowerCase().includes("inaktiv");
  const isError = Boolean(product.errorMessage);
  const title = formatText(product.productCategory);
  const productReference = formatText(product.productReference);
  const sku = formatText(product.sku);
  const ean = formatText(product.ean);

  return (
    <div
      className={`product-row ${isActiveRow ? "selected" : ""}`}
      data-selected={isActiveRow ? "true" : "false"}
    >
      {!isCompact ? (
        <label className="product-select-cell" aria-label={`Выбрать ${sku}`}>
          <input
            checked={isSelected}
            onChange={() => onToggleSelection(product.id)}
            type="checkbox"
          />
        </label>
      ) : null}
      <button type="button" className="row-open-btn" onClick={() => onOpen(product.id)}>
        {isCompact ? (
          <span className="product-sidebar-item">
            <ProductImagePreview
              alt={title}
              compact
              fallbackLabel={sku}
              imageUrls={product.mediaAssetLinks}
            />
            <span className="product-sidebar-item__copy">
              <strong title={sku}>{sku}</strong>
              <small title={title}>{title}</small>
            </span>
          </span>
        ) : (
          <>
            <span className="product-cell">
              <ProductImagePreview
                alt={title}
                fallbackLabel={title}
                imageUrls={product.mediaAssetLinks}
              />
              <span className="product-cell__content">
                <strong className="product-cell__title" title={title}>
                  {title}
                </strong>
                <small className="product-cell__meta" title={ean}>
                  {product.ean ? `EAN ${ean}` : "Без EAN"}
                </small>
              </span>
            </span>
            <span className="row-stack-cell" title={productReference}>
              <strong>{productReference}</strong>
              <small>{product.moin ? `MOIN ${formatText(product.moin)}` : "Без MOIN"}</small>
            </span>
            <span className="row-stack-cell" title={formatText(product.sku)}>
              <strong>{sku}</strong>
              <small>{product.ean ? `EAN ${ean}` : "Без EAN"}</small>
            </span>
            <span>
              <span className="table-pill" title={formatText(product.productCategory)}>
                {title}
              </span>
            </span>
            <span className="row-stack-cell" title={formatText(product.marketplaceStatus)}>
              <strong>{formatText(product.marketplaceStatus)}</strong>
              <small>{formatText(product.deliveryTime)}</small>
            </span>
            <span>
              <span
                className={`table-status-pill ${
                  isError ? "danger" : isInactive ? "muted" : "success"
                }`}
                title={formatText(product.activeStatus)}
              >
                {formatText(product.activeStatus)}
              </span>
            </span>
            <span className="row-stack-cell row-price-cell">
              <strong>{formatCurrency(product.price)}</strong>
              <small>{formatDateTime(product.lastChangedAt)}</small>
            </span>
          </>
        )}
      </button>
    </div>
  );
});

export function CatalogPanel({
  categories,
  categoryFilter,
  dbTotal,
  isCompact,
  isLoading,
  products,
  query,
  selectedId,
  selectedProductIds,
  sortBy,
  sortOrder,
  tablePage,
  totalTablePages,
  onBulkPriceUpdate,
  onCategoryFilterChange,
  onClearProductSelection,
  onOpenProduct,
  onPageChange,
  onQueryChange,
  onSortByChange,
  onSortOrderChange,
  onTogglePageSelection,
  onToggleProductSelection,
}: CatalogPanelProps) {
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const [isBulkEditorOpen, setIsBulkEditorOpen] = useState(false);
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [bulkDraft, setBulkDraft] = useState({
    price: "",
  });
  const [bulkController, setBulkController] =
    useState<PriceUpdateController>("auto");
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const categoryMenuRef = useRef<HTMLDivElement | null>(null);

  const selectedProducts = useMemo(
    () => products.filter((product) => selectedProductIds.has(product.id)),
    [products, selectedProductIds]
  );
  const parsedBulkPrice = Number(bulkDraft.price.trim().replace(",", "."));
  const bulkUvpPreview = Number.isFinite(parsedBulkPrice) && parsedBulkPrice >= 0
    ? processUvp(parsedBulkPrice)
    : null;
  const isPageSelected =
    products.length > 0 && products.every((product) => selectedProductIds.has(product.id));

  const visibleCategories = useMemo(() => {
    const term = categorySearch.trim().toLowerCase();
    if (!term) {
      return categories;
    }
    return categories.filter((category) => category.toLowerCase().includes(term));
  }, [categories, categorySearch]);

  const selectedCategoryLabel =
    categoryFilter === "all" ? "Все категории" : categoryFilter;

  function parsePriceDraft(value: string, label: string): number | undefined {
    const normalized = value.trim().replace(",", ".");
    if (!normalized) {
      return undefined;
    }
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error(`${label}: укажите число от 0`);
    }
    return parsed;
  }

  async function applyBulkPrices() {
    setBulkMessage(null);
    if (selectedProducts.length === 0) {
      setBulkMessage("Выберите товары для массового редактирования.");
      return;
    }

    try {
      const price = parsePriceDraft(bulkDraft.price, "Цена");
      const updates: Omit<PriceUpdateItem, "id"> = {};

      if (price !== undefined) updates.price = price;

      if (Object.keys(updates).length === 0) {
        setBulkMessage("Заполните новую цену OTTO.");
        return;
      }

      setIsBulkSaving(true);
      await onBulkPriceUpdate(
        selectedProducts.map((product) => ({ id: product.id, ...updates })),
        bulkController,
      );
      setBulkMessage(`Обновлено товаров: ${selectedProducts.length}`);
      setBulkDraft({ price: "" });
    } catch (error) {
      setBulkMessage(
        error instanceof Error ? error.message : "Не удалось обновить цены"
      );
    } finally {
      setIsBulkSaving(false);
    }
  }

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!categoryMenuRef.current) return;
      if (!categoryMenuRef.current.contains(event.target as Node)) {
        setIsCategoryMenuOpen(false);
      }
    }

    if (isCategoryMenuOpen) {
      window.addEventListener("mousedown", handlePointerDown);
    }

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isCategoryMenuOpen]);

  return (
    <div className={`catalog-panel ${isCompact ? "catalog-panel-compact" : ""}`.trim()}>
      <div className="panel-header">
        <div>
          <h2>Товары из базы</h2>
          <p>
            Таблица показывает реальные поля импортированного XLSX, которые сейчас
            лежат в локальной базе.
          </p>
        </div>
        <div className="panel-meta">
          <span>{`На странице ${products.length}`}</span>
          <span>{`Всего в базе ${dbTotal}`}</span>
        </div>
      </div>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Поиск по SKU, reference, EAN, MOIN или категории"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <select
          value={sortBy}
          onChange={(event) => onSortByChange(event.target.value as SortByField)}
        >
          <option value="id">Сортировка: новые</option>
          <option value="productReference">По reference</option>
          <option value="sku">По SKU</option>
          <option value="category">По категории</option>
          <option value="ean">По EAN</option>
          <option value="moin">По MOIN</option>
          <option value="price">По цене</option>
          <option value="marketplaceStatus">По статусу маркетплейса</option>
          <option value="lastChangedAt">По дате изменения</option>
        </select>
        <select
          value={sortOrder}
          onChange={(event) => onSortOrderChange(event.target.value as SortOrder)}
        >
          <option value="DESC">По убыванию</option>
          <option value="ASC">По возрастанию</option>
        </select>
        <div className="category-filter" ref={categoryMenuRef}>
          <button
            className={`category-filter-trigger ${isCategoryMenuOpen ? "open" : ""}`}
            onClick={() => setIsCategoryMenuOpen((current) => !current)}
            type="button"
          >
            <span className="category-filter-label">{selectedCategoryLabel}</span>
            <span className="category-filter-caret">{isCategoryMenuOpen ? "▴" : "▾"}</span>
          </button>

          {isCategoryMenuOpen ? (
            <div className="category-filter-menu">
              <input
                autoFocus
                className="category-filter-search"
                onChange={(event) => setCategorySearch(event.target.value)}
                placeholder="Поиск категории..."
                type="search"
                value={categorySearch}
              />

              <div className="category-filter-options">
                <button
                  className={`category-filter-option ${categoryFilter === "all" ? "active" : ""}`}
                  onClick={() => {
                    onCategoryFilterChange("all");
                    setCategorySearch("");
                    setIsCategoryMenuOpen(false);
                  }}
                  type="button"
                >
                  Все категории
                </button>
                {visibleCategories.map((category) => (
                  <button
                    className={`category-filter-option ${
                      categoryFilter === category ? "active" : ""
                    }`}
                    key={category}
                    onClick={() => {
                      onCategoryFilterChange(category);
                      setCategorySearch("");
                      setIsCategoryMenuOpen(false);
                    }}
                    type="button"
                  >
                    {category}
                  </button>
                ))}
                {visibleCategories.length === 0 ? (
                  <div className="category-filter-empty">Ничего не найдено</div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
        <Link className="primary-btn toolbar-create-btn" href="/creator">
          Добавить товар
        </Link>
        {!isCompact ? (
          <button
            className="secondary-btn catalog-bulk-toggle"
            onClick={() => setIsBulkEditorOpen((current) => !current)}
            type="button"
          >
            Массово цены
          </button>
        ) : null}
      </div>

      {isBulkEditorOpen && !isCompact ? (
        <section className="bulk-price-editor" aria-label="Массовое редактирование цен">
          <div className="bulk-price-editor__head">
            <div>
              <h3>Массовое редактирование цен</h3>
              <p>Заполненные поля применятся к выбранным строкам текущей страницы.</p>
            </div>
            <span>{`${selectedProducts.length} выбрано`}</span>
          </div>

          <div className="bulk-price-editor__grid">
            <label className="product-field">
              Цена OTTO
              <input
                inputMode="decimal"
                onChange={(event) =>
                  setBulkDraft((current) => ({ ...current, price: event.target.value }))
                }
                placeholder="например 299.99"
                value={bulkDraft.price}
              />
            </label>
            <label className="product-field">
              Аккаунт OTTO
              <select
                onChange={(event) =>
                  setBulkController(event.target.value as PriceUpdateController)
                }
                value={bulkController}
              >
                <option value="auto">Авто</option>
                <option value="jv">JV</option>
                <option value="xl">XL</option>
              </select>
            </label>
          </div>

          {bulkMessage ? <p className="bulk-price-editor__message">{bulkMessage}</p> : null}
          {bulkUvpPreview !== null ? (
            <p className="bulk-price-editor__message">
              {`UVP будет пересчитан: ${formatCurrency(bulkUvpPreview)}`}
            </p>
          ) : null}

          <div className="bulk-price-editor__actions">
            <button
              className="secondary-btn"
              disabled={selectedProducts.length === 0 || isBulkSaving}
              onClick={onClearProductSelection}
              type="button"
            >
              Снять выбор
            </button>
            <button
              className="primary-btn"
              disabled={selectedProducts.length === 0 || isBulkSaving}
              onClick={() => void applyBulkPrices()}
              type="button"
            >
              {isBulkSaving ? "Сохраняю" : "Применить"}
            </button>
          </div>
        </section>
      ) : null}

      <div className="product-list">
        {isLoading ? <div className="empty-state">Загрузка товаров...</div> : null}
        {!isLoading && products.length === 0 ? (
          <div className="empty-state">По текущим фильтрам товаров не найдено</div>
        ) : null}

        {!isLoading && products.length > 0 ? (
          <div className="product-table">
            <div className="product-row product-row-head">
              {!isCompact ? (
                <label className="product-select-cell" aria-label="Выбрать товары на странице">
                  <input
                    checked={isPageSelected}
                    onChange={onTogglePageSelection}
                    type="checkbox"
                  />
                </label>
              ) : null}
              <div className="row-open-head">
                {isCompact ? (
                  <span>Товары</span>
                ) : (
                  <>
                    <span>Товар</span>
                    <span>Reference</span>
                    <span>SKU</span>
                    <span>Категория</span>
                    <span>Маркетплейс</span>
                    <span>Активность</span>
                    <span>Цена</span>
                  </>
                )}
              </div>
            </div>
            {products.map((product) => (
              <ProductRow
                key={product.id}
                isCompact={isCompact}
                isActiveRow={selectedId === product.id}
                isSelected={selectedProductIds.has(product.id)}
                product={product}
                onOpen={onOpenProduct}
                onToggleSelection={onToggleProductSelection}
              />
            ))}
          </div>
        ) : null}
      </div>

      {!isLoading && products.length > 0 ? (
        <div className="pagination-bar">
          <span className="pagination-info">{`${tablePage}/${totalTablePages} • ${dbTotal} строк`}</span>
          <div className="pagination-actions">
            <button
              className="secondary-btn"
              onClick={() => onPageChange((prev) => Math.max(1, prev - 1))}
              disabled={tablePage <= 1}
            >
              Назад
            </button>
            <button
              className="secondary-btn"
              onClick={() => onPageChange((prev) => Math.min(totalTablePages, prev + 1))}
              disabled={tablePage >= totalTablePages}
            >
              Вперёд
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
