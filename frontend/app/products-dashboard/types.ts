"use client";

export type ProductStatus = "active" | "non_active";

export const BRAND_OPTIONS = ["JVmoebel", "XLmoebel"] as const;

export type ProductBrand = (typeof BRAND_OPTIONS)[number];

export type ProductAttribute = {
  name: string;
  values: string[];
  additional: boolean;
};

export type Product = {
  id: string;
  productReference: string;
  name: string;
  sku: string;
  ean: string;
  moin: string;
  category: string;
  brand: ProductBrand;
  brandId: string;
  price: number;
  stock: number;
  mediaCount: number;
  attributesCount: number;
  attributes: ProductAttribute[];
  bulletPoints: string[];
  description: string;
  status: ProductStatus;
  rating: number;
  sales: number;
  views: number;
  updatedAt: string;
};

export type SortByField =
  | "id"
  | "productLine"
  | "sku"
  | "productReference"
  | "category"
  | "brandId"
  | "ean"
  | "price";

export type SortOrder = "ASC" | "DESC";

export type BulkPriceOperation = "delta" | "percent" | "set";

export type JsonObject = Record<string, unknown>;

export type ProductBaseline = {
  sku: string;
  status: ProductStatus;
  comparableSnapshot: string;
};
