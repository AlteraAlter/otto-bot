"use client";

import { BRAND_OPTIONS, Product, ProductBrand, ProductStatus } from "./types";

type EditorPanelProps = {
  hasProductChanges: boolean;
  hasStatusChanges: boolean;
  isApplying: boolean;
  isBulkSaving: boolean;
  isDetailOpen: boolean;
  multiSelectedIds: string[];
  selectedProduct: Product | null;
  onAddAttribute: () => void;
  onAddBulletPoint: () => void;
  onClose: () => void;
  onDeleteProduct: () => void;
  onRemoveAttribute: (index: number) => void;
  onRemoveBulletPoint: (index: number) => void;
  onSaveChanges: () => void;
  onUpdateAttributeAdditional: (index: number, value: boolean) => void;
  onUpdateAttributeName: (index: number, value: string) => void;
  onUpdateAttributeValues: (index: number, value: string) => void;
  onUpdateBulletPoint: (index: number, value: string) => void;
  onUpdateSelected: <K extends keyof Product>(field: K, value: Product[K]) => void;
};

export function EditorPanel({
  hasProductChanges,
  hasStatusChanges,
  isApplying,
  isBulkSaving,
  isDetailOpen,
  multiSelectedIds,
  selectedProduct,
  onAddAttribute,
  onAddBulletPoint,
  onClose,
  onDeleteProduct,
  onRemoveAttribute,
  onRemoveBulletPoint,
  onSaveChanges,
  onUpdateAttributeAdditional,
  onUpdateAttributeName,
  onUpdateAttributeValues,
  onUpdateBulletPoint,
  onUpdateSelected
}: EditorPanelProps) {
  return (
    <aside className="editor-panel">
      {selectedProduct && isDetailOpen && multiSelectedIds.length <= 1 ? (
        <>
          <div className="editor-head">
            <div>
              <h2>Карточка товара</h2>
              <p>{selectedProduct.updatedAt}</p>
            </div>
            <button className="ghost-btn" onClick={onClose}>
              Закрыть
            </button>
          </div>

          <div className="editor-grid">
            <label>
              Название
              <input
                value={selectedProduct.name}
                onChange={(event) => onUpdateSelected("name", event.target.value)}
              />
            </label>
            <label>
              SKU
              <input
                value={selectedProduct.sku}
                onChange={(event) => onUpdateSelected("sku", event.target.value)}
              />
            </label>
            <label>
              Бренд
              <select
                value={selectedProduct.brand}
                onChange={(event) => onUpdateSelected("brand", event.target.value as ProductBrand)}
              >
                {BRAND_OPTIONS.map((brand) => (
                  <option key={brand} value={brand}>
                    {brand}
                  </option>
                ))}
              </select>
            </label>
            <label>
              ID бренда
              <input
                value={selectedProduct.brandId}
                onChange={(event) => onUpdateSelected("brandId", event.target.value)}
              />
            </label>
            <label>
              Категория
              <input
                value={selectedProduct.category}
                onChange={(event) => onUpdateSelected("category", event.target.value)}
              />
            </label>
            <label>
              Статус
              <select
                value={selectedProduct.status}
                onChange={(event) => onUpdateSelected("status", event.target.value as ProductStatus)}
              >
                <option value="active">Активен</option>
                <option value="non_active">Неактивен</option>
              </select>
            </label>
            <label>
              EAN
              <input
                value={selectedProduct.ean}
                onChange={(event) => onUpdateSelected("ean", event.target.value)}
              />
            </label>
            <label>
              MOIN
              <input
                value={selectedProduct.moin}
                onChange={(event) => onUpdateSelected("moin", event.target.value)}
              />
            </label>
            <label>
              Цена (EUR)
              <input
                type="number"
                min="0"
                step="0.1"
                value={selectedProduct.price}
                onChange={(event) => onUpdateSelected("price", Number(event.target.value))}
              />
            </label>
            <label>
              Остаток
              <input
                type="number"
                min="0"
                value={selectedProduct.stock}
                onChange={(event) => onUpdateSelected("stock", Number(event.target.value))}
              />
            </label>
            <label>
              Product Reference
              <input
                value={selectedProduct.productReference}
                onChange={(event) => onUpdateSelected("productReference", event.target.value)}
              />
            </label>
          </div>

          <div className="product-actions">
            <button className="danger" onClick={onDeleteProduct}>
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

          <div className="product-detail-card">
            <p className="detail-title">Bullet points</p>
            <div className="dynamic-editor">
              {selectedProduct.bulletPoints.map((point, index) => (
                <div className="dynamic-editor-row" key={`bullet-${index}`}>
                  <input
                    value={point}
                    onChange={(event) => onUpdateBulletPoint(index, event.target.value)}
                    placeholder={`Bullet point ${index + 1}`}
                  />
                  <button type="button" className="ghost-btn" onClick={() => onRemoveBulletPoint(index)}>
                    Удалить
                  </button>
                </div>
              ))}
              <button type="button" className="ghost-btn" onClick={onAddBulletPoint}>
                Добавить bullet point
              </button>
            </div>
          </div>

          <div className="product-detail-card">
            <p className="detail-title">Attributes</p>
            <div className="dynamic-editor">
              {selectedProduct.attributes.map((attribute, index) => (
                <div className="dynamic-editor-row attribute-row" key={`attribute-${index}`}>
                  <input
                    value={attribute.name}
                    onChange={(event) => onUpdateAttributeName(index, event.target.value)}
                    placeholder="Название атрибута"
                  />
                  <input
                    value={attribute.values.join(", ")}
                    onChange={(event) => onUpdateAttributeValues(index, event.target.value)}
                    placeholder="Значения через запятую"
                  />
                  <select
                    value={attribute.additional ? "true" : "false"}
                    onChange={(event) => onUpdateAttributeAdditional(index, event.target.value === "true")}
                  >
                    <option value="false">Основной</option>
                    <option value="true">Дополнительный</option>
                  </select>
                  <button type="button" className="ghost-btn" onClick={() => onRemoveAttribute(index)}>
                    Удалить
                  </button>
                </div>
              ))}
              <button type="button" className="ghost-btn" onClick={onAddAttribute}>
                Добавить атрибут
              </button>
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

          <div className="sync-summary">
            <p>Карточка: {hasProductChanges ? "есть" : "нет"} | Статус: {hasStatusChanges ? "есть" : "нет"}</p>
          </div>

          <button className="primary-btn full" onClick={onSaveChanges} disabled={isApplying || isBulkSaving}>
            {isApplying ? "Сохраняем..." : "Сохранить"}
          </button>
        </>
      ) : (
        <div className="empty-state">Выберите мини-карточку слева, чтобы открыть все данные товара</div>
      )}
    </aside>
  );
}
