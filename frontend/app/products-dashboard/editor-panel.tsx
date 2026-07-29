"use client";

import { useEffect, useState } from "react";

import { PriceUpdateController, PriceUpdateItem } from "./use-product-dashboard";
import { Product } from "./types";
import { formatCurrency, formatDateTime, formatText, processUvp } from "./utils";

type EditorPanelProps = {
  isClosing?: boolean;
  isDetailOpen: boolean;
  selectedProduct: Product | null;
  onClose: () => void;
  onUpdatePrices: (
    items: PriceUpdateItem[],
    controller?: PriceUpdateController,
  ) => Promise<Product[]>;
};

type FieldProps = {
  label: string;
  value: string;
};

type GalleryImageProps = {
  alt: string;
  className?: string;
  src: string | null;
};

function GalleryImage({ alt, className, src }: GalleryImageProps) {
  const [hasImageError, setHasImageError] = useState(false);

  useEffect(() => {
    setHasImageError(false);
  }, [src]);

  if (!src || hasImageError) {
    return (
      <div className={`${className ?? ""} product-image-fallback`.trim()}>
        <span>Нет фото</span>
      </div>
    );
  }

  return (
    <img
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setHasImageError(true)}
      src={src}
    />
  );
}

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
  onUpdatePrices,
}: EditorPanelProps) {
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [priceDraft, setPriceDraft] = useState({
    price: "",
  });
  const [priceController, setPriceController] =
    useState<PriceUpdateController>("auto");
  const [isPriceSaving, setIsPriceSaving] = useState(false);
  const [priceMessage, setPriceMessage] = useState<string | null>(null);

  useEffect(() => {
    setActiveMediaIndex(0);
  }, [selectedProduct?.id]);

  useEffect(() => {
    setPriceDraft({
      price: selectedProduct?.price !== null && selectedProduct?.price !== undefined
        ? String(selectedProduct.price)
        : "",
    });
    setPriceMessage(null);
  }, [selectedProduct?.id, selectedProduct?.price]);

  if (!selectedProduct || !isDetailOpen) {
    return null;
  }

  const mediaItems = selectedProduct.mediaAssetLinks;
  const hasMedia = mediaItems.length > 0;
  const activeMediaLink = hasMedia
    ? mediaItems[Math.min(activeMediaIndex, mediaItems.length - 1)]
    : null;
  const parsedDraftPrice = Number(priceDraft.price.trim().replace(",", "."));
  const previewUvp = Number.isFinite(parsedDraftPrice) && parsedDraftPrice >= 0
    ? processUvp(parsedDraftPrice)
    : selectedProduct.recommendedRetailPrice;

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

  function parsePriceValue(value: string, label: string): number | null {
    const normalized = value.trim().replace(",", ".");
    if (!normalized) {
      return null;
    }
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error(`${label}: укажите число от 0`);
    }
    return parsed;
  }

  async function savePrices() {
    if (!selectedProduct) {
      return;
    }

    setPriceMessage(null);
    try {
      const updateItem: PriceUpdateItem = {
        id: selectedProduct.id,
        price: parsePriceValue(priceDraft.price, "Price"),
      };
      setIsPriceSaving(true);
      await onUpdatePrices([updateItem], priceController);
      setPriceMessage("Цена отправлена в OTTO, локальная база обновлена");
    } catch (error) {
      setPriceMessage(
        error instanceof Error ? error.message : "Не удалось сохранить цены"
      );
    } finally {
      setIsPriceSaving(false);
    }
  }

  return (
    <aside className={`editor-panel ${isClosing ? "is-closing" : ""}`.trim()}>
      <div className="editor-head">
        <div>
          <span className="editor-eyebrow">Товар</span>
          <h2>{formatText(selectedProduct.productCategory)}</h2>
          <p>{formatText(selectedProduct.sku)}</p>
        </div>
        <button className="ghost-btn" onClick={onClose} type="button">
          Закрыть
        </button>
      </div>

      <div className="product-workspace">
        <section className="product-gallery" aria-label="Галерея товара">
          <a
            href={activeMediaLink ?? undefined}
            target="_blank"
            rel="noreferrer"
            className={`product-gallery__main ${!activeMediaLink ? "is-empty" : ""}`.trim()}
            aria-disabled={!activeMediaLink}
          >
            <GalleryImage
              alt={`Product image ${activeMediaIndex + 1}`}
              className="product-gallery__main-image"
              src={activeMediaLink}
            />
          </a>

          {mediaItems.length > 1 ? (
            <div className="product-gallery__nav">
              <button type="button" className="ghost-btn" onClick={goPrev}>
                Назад
              </button>
              <span>{`${activeMediaIndex + 1}/${mediaItems.length}`}</span>
              <button type="button" className="ghost-btn" onClick={goNext}>
                Вперёд
              </button>
            </div>
          ) : null}

          {hasMedia ? (
            <div className="product-gallery__thumbnails">
              {mediaItems.map((link, index) => (
                <button
                  key={`${selectedProduct.id}-thumb-${index}`}
                  type="button"
                  className="product-gallery__thumbnail"
                  data-active={index === activeMediaIndex ? "true" : "false"}
                  onClick={() => setActiveMediaIndex(index)}
                  aria-label={`Выбрать изображение ${index + 1}`}
                >
                  <GalleryImage
                    alt={`Product thumbnail ${index + 1}`}
                    src={link}
                  />
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section className="product-details-card">
          <header className="product-details-card__header">
            <div>
              <h3>Основная информация</h3>
              <p>{formatDateTime(selectedProduct.lastChangedAt)}</p>
            </div>
            <strong>{formatCurrency(selectedProduct.price)}</strong>
          </header>

          <section className="price-editor" aria-label="Редактор цен">
            <div className="price-editor__head">
              <div>
                <span>standardPrice</span>
                <h4>Цена OTTO</h4>
              </div>
              <strong>{formatCurrency(selectedProduct.price)}</strong>
            </div>

            <div className="price-editor__grid">
              <label className="price-editor__field price-editor__field--main">
                <span>Цена</span>
                <input
                  inputMode="decimal"
                  onChange={(event) =>
                    setPriceDraft((current) => ({
                      ...current,
                      price: event.target.value,
                    }))
                  }
                  value={priceDraft.price}
                />
              </label>
              <label className="price-editor__field">
                <span>Аккаунт OTTO</span>
                <select
                  onChange={(event) =>
                    setPriceController(event.target.value as PriceUpdateController)
                  }
                  value={priceController}
                >
                  <option value="auto">Авто</option>
                  <option value="jv">JV</option>
                  <option value="xl">XL</option>
                </select>
              </label>
            </div>

            <dl className="price-editor__legend">
              <div>
                <dt>UVP / РРЦ</dt>
                <dd>{formatCurrency(previewUvp)}</dd>
              </div>
              <div>
                <dt>Sale price</dt>
                <dd>{formatCurrency(selectedProduct.salePrice)}</dd>
              </div>
            </dl>

            <div className="price-editor__footer">
              <p className="price-editor__hint">
                UVP пересчитается автоматически по формуле от цены OTTO.
              </p>
              <button
                className="primary-btn"
                disabled={isPriceSaving}
                onClick={() => void savePrices()}
                type="button"
              >
                {isPriceSaving ? "Сохраняю" : "Сохранить"}
              </button>
            </div>

            {priceMessage ? (
              <p className="price-editor__message">{priceMessage}</p>
            ) : null}
          </section>

          <div className="product-details-grid editor-grid">
            <label className="product-field">
              Product reference
              <input value={formatText(selectedProduct.productReference)} readOnly />
            </label>
            <label className="product-field">
              SKU
              <input value={formatText(selectedProduct.sku)} readOnly />
            </label>
            <label className="product-field">
              EAN
              <input value={formatText(selectedProduct.ean)} readOnly />
            </label>
            <label className="product-field">
              MOIN
              <input value={formatText(selectedProduct.moin)} readOnly />
            </label>
            <label className="product-field">
              Category
              <input value={formatText(selectedProduct.productCategory)} readOnly />
            </label>
            <label className="product-field">
              Delivery time
              <input value={formatText(selectedProduct.deliveryTime)} readOnly />
            </label>
            <label className="product-field">
              Sale start
              <input value={formatDateTime(selectedProduct.saleStart)} readOnly />
            </label>
            <label className="product-field">
              Sale end
              <input value={formatDateTime(selectedProduct.saleEnd)} readOnly />
            </label>
            <label className="product-field">
              Last changed
              <input value={formatDateTime(selectedProduct.lastChangedAt)} readOnly />
            </label>
          </div>
        </section>
      </div>

      <div className="product-status-grid">
        <div className="product-status-card">
          <span>Marketplace status</span>
          <strong className="status-value">
            <i className="status-dot status-dot--success" aria-hidden="true" />
            {formatText(selectedProduct.marketplaceStatus)}
          </strong>
        </div>
        <div className="product-status-card">
          <span>Active status</span>
          <strong className="status-value">
            <i className="status-dot status-dot--success" aria-hidden="true" />
            {formatText(selectedProduct.activeStatus)}
          </strong>
        </div>
      </div>

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
                <GalleryImage alt={`Product image ${index + 1}`} src={link} />
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
