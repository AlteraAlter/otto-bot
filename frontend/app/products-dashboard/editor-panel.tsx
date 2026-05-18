"use client";

import { useEffect, useState } from "react";

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
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);

  if (!selectedProduct || !isDetailOpen) {
    return null;
  }

  const mediaItems = selectedProduct.mediaAssetLinks;
  const hasMedia = mediaItems.length > 0;
  const activeMediaLink = hasMedia
    ? mediaItems[Math.min(activeMediaIndex, mediaItems.length - 1)]
    : null;

  useEffect(() => {
    setActiveMediaIndex(0);
  }, [selectedProduct.id]);

  const goPrev = () => {
    if (!hasMedia) return;
    setActiveMediaIndex((prev) =>
      prev === 0 ? mediaItems.length - 1 : prev - 1
    );
  };

  const goNext = () => {
    if (!hasMedia) return;
    setActiveMediaIndex((prev) =>
      prev === mediaItems.length - 1 ? 0 : prev + 1
    );
  };

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
        {hasMedia && activeMediaLink ? (
          <>
            <a
              href={activeMediaLink}
              target="_blank"
              rel="noreferrer"
              className="product-media-hero-link"
            >
              <img
                src={activeMediaLink}
                alt={`Product image ${activeMediaIndex + 1}`}
                loading="lazy"
              />
            </a>

            {mediaItems.length > 1 ? (
              <div className="product-media-carousel-controls">
                <button type="button" className="ghost-btn" onClick={goPrev}>
                  Назад
                </button>
                <div className="product-media-dots">
                  {mediaItems.map((_, index) => (
                    <button
                      key={`${selectedProduct.id}-dot-${index}`}
                      type="button"
                      className={`product-media-dot ${
                        index === activeMediaIndex ? "active" : ""
                      }`}
                      onClick={() => setActiveMediaIndex(index)}
                      aria-label={`Go to image ${index + 1}`}
                    />
                  ))}
                </div>
                <button type="button" className="ghost-btn" onClick={goNext}>
                  Вперёд
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <div className="product-media-empty">Нет сохранённых изображений.</div>
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
        {hasMedia ? (
          <div className="product-media-grid">
            {mediaItems.map((link, index) => (
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
