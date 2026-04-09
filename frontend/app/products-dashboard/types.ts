"use client";

export type Product = {
  id: string;
  productReference: string | null;
  sku: string | null;
  ean: string | null;
  moin: string | null;
  productCategory: string | null;
  deliveryTime: string | null;
  price: number | null;
  recommendedRetailPrice: number | null;
  salePrice: number | null;
  saleStart: string | null;
  saleEnd: string | null;
  marketplaceStatus: string | null;
  errorMessage: string | null;
  activeStatus: string | null;
  ottoUrl: string | null;
  mediaAssetLinks: string[];
  description: string | null;
  bulletPoints: string[];
  attributes: Array<{
    name: string;
    values: string[];
  }>;
  lastChangedAt: string | null;
};

export type SortByField =
  | "id"
  | "sku"
  | "productReference"
  | "category"
  | "ean"
  | "moin"
  | "price"
  | "marketplaceStatus"
  | "lastChangedAt";

export type SortOrder = "ASC" | "DESC";
