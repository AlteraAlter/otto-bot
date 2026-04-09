"use client";

import { useEffect, useMemo, useState } from "react";

import { Product } from "./types";
import { formatCurrency, formatDateTime, formatText } from "./utils";

type EditorPanelProps = {
  isClosing?: boolean;
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
  isClosing = false,
  isDetailOpen,
  selectedProduct,
  onClose,
}: EditorPanelProps) {
  const mediaLinks = useMemo(
    () =>
      (selectedProduct?.mediaAssetLinks ?? [])
        .map((link) => link.trim())
        .filter((link) => link.length > 0),
    [selectedProduct?.mediaAssetLinks],
  );
  const [mediaIndex, setMediaIndex] = useState(0);
  const activeMedia = mediaLinks.length > 0 ? mediaLinks[mediaIndex % mediaLinks.length] : null;

  useEffect(() => {
    setMediaIndex(0);
  }, [selectedProduct?.id, mediaLinks.length]);

  if (!selectedProduct || !isDetailOpen) {
    return null;
  }

  return (
    <aside className={`editor-panel ${isClosing ? "is-closing" : ""}`.trim()}>
      <div className="editor-head">
        <div>
          <h2>Детали товара</h2>
          <p>{formatDateTime(selectedProduct.lastChangedAt)}</p>
        </div>
        <button className="ghost-btn" onClick={onClose} type="button">
          Закрыть
        </button>
      </div>

      <div className="product-media-hero">
        {mediaLinks.length > 0 ? (
          <div className="product-media-viewer">
            <a href={activeMedia ?? "#"} target="_blank" rel="noreferrer" className="product-media-main">
              <img
                key={activeMedia ?? `media-${mediaIndex}`}
                className="product-media-image"
                src={activeMedia ?? ""}
                alt={`Product image ${mediaIndex + 1}`}
                loading="lazy"
              />
            </a>
            {mediaLinks.length > 1 ? (
              <>
                <div className="product-media-controls">
                  <button
                    className="product-media-arrow product-media-arrow-left"
                    type="button"
                    aria-label="Previous image"
                    onClick={() =>
                      setMediaIndex((prev) => (prev === 0 ? mediaLinks.length - 1 : prev - 1))
                    }
                  >
                    ‹
                  </button>
                  <button
                    className="product-media-arrow product-media-arrow-right"
                    type="button"
                    aria-label="Next image"
                    onClick={() => setMediaIndex((prev) => (prev + 1) % mediaLinks.length)}
                  >
                    ›
                  </button>
                </div>
                <div className="product-media-dots" aria-label="Image position">
                  {mediaLinks.map((_, index) => (
                    <button
                      key={`${selectedProduct.id}-media-dot-${index}`}
                      type="button"
                      className={`product-media-dot ${index === mediaIndex ? "active" : ""}`}
                      onClick={() => setMediaIndex(index)}
                      aria-label={`Open image ${index + 1}`}
                    />
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ) : (
          <p className="detail-description">Нет сохранённых изображений.</p>
        )}
      </div>

      <div className="editor-summary-strip">
        <div className="editor-summary-chip">
          <span>Статус</span>
          <strong>{formatText(selectedProduct.activeStatus)}</strong>
        </div>
        <div className="editor-summary-chip">
          <span>Маркетплейс</span>
          <strong>{formatText(selectedProduct.marketplaceStatus)}</strong>
        </div>
        <div className="editor-summary-chip">
          <span>Цена</span>
          <strong>{formatCurrency(selectedProduct.price)}</strong>
        </div>
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
      <Field label="Description" value={formatText(selectedProduct.description)} />
      <Field label="Active status" value={formatText(selectedProduct.activeStatus)} />
      <Field label="Error message" value={formatText(selectedProduct.errorMessage)} />

      <div className="product-detail-card">
        <p className="detail-title">Bullet points</p>
        {selectedProduct.bulletPoints.length > 0 ? (
          <div className="detail-bullets">
            {selectedProduct.bulletPoints.map((bulletPoint, index) => (
              <span key={`${selectedProduct.id}-bullet-${index}`}>{bulletPoint}</span>
            ))}
          </div>
        ) : (
          <p className="detail-description">Нет сохранённых bullet points.</p>
        )}
      </div>

      <div className="product-detail-card">
        <p className="detail-title">Attributes</p>
        {selectedProduct.attributes.length > 0 ? (
          <div className="detail-attributes">
            {selectedProduct.attributes.map((attribute) => (
              <div
                className="detail-attribute-row"
                key={`${selectedProduct.id}-${attribute.name}`}
              >
                <strong>{attribute.name}</strong>
                <span>{attribute.values.join(", ")}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="detail-description">Нет сохранённых attributes.</p>
        )}
      </div>

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
    </aside>
  );
}
