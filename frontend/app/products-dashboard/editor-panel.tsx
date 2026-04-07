"use client";

import { Product } from "./types";
import { formatCurrency, formatDateTime, formatText } from "./utils";

type EditorPanelProps = {
  isDetailOpen: boolean;
  selectedProduct: Product | null;
  onClose: () => void;
};

type FieldProps = {
  label: string;
  value: string;
};

function Field({ label, value }: FieldProps) {
  return (
    <div className="product-detail-card">
      <p className="detail-title">{label}</p>
      <p className="detail-description">{value}</p>
    </div>
  );
}

export function EditorPanel({
  isDetailOpen,
  selectedProduct,
  onClose,
}: EditorPanelProps) {
  if (!selectedProduct || !isDetailOpen) {
    return (
      <aside className="editor-panel">
        <div className="empty-state">
          Выберите строку слева, чтобы посмотреть все поля товара из базы.
        </div>
      </aside>
    );
  }

  return (
    <aside className="editor-panel">
      <div className="editor-head">
        <div>
          <h2>Детали товара</h2>
          <p>{formatDateTime(selectedProduct.lastChangedAt)}</p>
        </div>
        <button className="ghost-btn" onClick={onClose} type="button">
          Закрыть
        </button>
      </div>

      <div className="editor-grid">
        <label>
          Product reference
          <input value={formatText(selectedProduct.productReference)} readOnly />
        </label>
        <label>
          SKU
          <input value={formatText(selectedProduct.sku)} readOnly />
        </label>
        <label>
          EAN
          <input value={formatText(selectedProduct.ean)} readOnly />
        </label>
        <label>
          MOIN
          <input value={formatText(selectedProduct.moin)} readOnly />
        </label>
        <label>
          Category
          <input value={formatText(selectedProduct.productCategory)} readOnly />
        </label>
        <label>
          Delivery time
          <input value={formatText(selectedProduct.deliveryTime)} readOnly />
        </label>
        <label>
          Price
          <input value={formatCurrency(selectedProduct.price)} readOnly />
        </label>
        <label>
          Recommended retail price
          <input value={formatCurrency(selectedProduct.recommendedRetailPrice)} readOnly />
        </label>
        <label>
          Sale price
          <input value={formatCurrency(selectedProduct.salePrice)} readOnly />
        </label>
        <label>
          Sale start
          <input value={formatDateTime(selectedProduct.saleStart)} readOnly />
        </label>
        <label>
          Sale end
          <input value={formatDateTime(selectedProduct.saleEnd)} readOnly />
        </label>
        <label>
          Last changed
          <input value={formatDateTime(selectedProduct.lastChangedAt)} readOnly />
        </label>
      </div>

      <Field
        label="Marketplace status"
        value={formatText(selectedProduct.marketplaceStatus)}
      />
      <Field label="Active status" value={formatText(selectedProduct.activeStatus)} />
      <Field label="Error message" value={formatText(selectedProduct.errorMessage)} />

      <div className="product-detail-card">
        <p className="detail-title">OTTO URL</p>
        {selectedProduct.ottoUrl ? (
          <a
            href={selectedProduct.ottoUrl}
            target="_blank"
            rel="noreferrer"
            className="ghost-btn"
          >
            Открыть ссылку
          </a>
        ) : (
          <p className="detail-description">-</p>
        )}
      </div>

      <div className="product-detail-card">
        <p className="detail-title">Media assets</p>
        {selectedProduct.mediaAssetLinks.length > 0 ? (
          <div className="product-media-grid">
            {selectedProduct.mediaAssetLinks.map((link, index) => (
              <a
                key={`${selectedProduct.id}-${index}`}
                href={link}
                target="_blank"
                rel="noreferrer"
                className="product-media-item"
              >
                <img src={link} alt={`Product image ${index + 1}`} loading="lazy" />
              </a>
            ))}
          </div>
        ) : (
          <p className="detail-description">Нет сохранённых изображений.</p>
        )}
      </div>
    </aside>
  );
}
