"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Box, Check, ChevronLeft, ChevronRight, Copy, Funnel, MoreHorizontal, Package, RefreshCw, Search, Trash2, X } from "lucide-react";

import { readApiErrorMessage, readJsonResponse } from "../lib/api";
import { useCurrentUser } from "../hooks/use-current-user";
import { AppWorkspaceShell } from "../ui/app-workspace-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type UploadState = "idle" | "loading" | "success" | "error";
type ControllerOption = "jv" | "xl";
const CREATOR_DRAFT_KEY = "creator_process_draft_v1";

type FabricOption = { id: string; name: string; items_count?: number };
type FabricListResponse = { factory?: FabricOption[] };
type ShippingProfileOption = { id: string; name: string };
type CreateFromFabricResponse = {
  success?: boolean;
  process_id?: string | null;
  process_state?: string | null;
  issues?: string[];
};
type PrepareStatusResponse = {
  success?: boolean;
  process_id?: string;
  process_state?: string;
  source_items?: number;
  mapped_items?: number;
  payload_items?: number;
  issues?: string[];
  products?: Record<string, unknown>[];
  current_step?: string;
  step_elapsed_sec?: number;
  heartbeat_lag_sec?: number;
  stuck?: boolean;
  stuck_message?: string | null;
};
type SubmitPreparedResponse = {
  success?: boolean;
  saved_path?: string;
  products_count?: number;
  otto_process_id?: string | null;
  otto_create_state?: string;
  otto_update_result?: Record<string, unknown>;
  otto_failed_result?: Record<string, unknown> | null;
};
type AvailabilitySubmitResponse = {
  update_quantity?: { success?: boolean; errors?: string };
  update_delivery?: { success?: boolean; errors?: string };
};
type OttoSummary = {
  state: string;
  total: number;
  progress: number;
  succeeded: number;
  failed: number;
};
type OttoErrorRow = {
  variation: string;
  code: string;
  title: string;
  jsonPath: string;
};
type ParsedSkuError = {
  sku: string;
  code: string;
  message: string;
  field: string;
  jsonPath: string;
};

type EditorTab = "general" | "attributes" | "json";
type AttributeEditField = "values";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function updateProductField(product: Record<string, unknown>, path: string[], value: unknown): Record<string, unknown> {
  const next = { ...product };
  let cursor: Record<string, unknown> = next;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];
    cursor[key] = asRecord(cursor[key]);
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[path[path.length - 1]] = value;
  return next;
}

function firstImage(product: Record<string, unknown>): string {
  const assets = product.mediaAssets;
  if (!Array.isArray(assets) || assets.length === 0) return "";
  return String(asRecord(assets[0]).location ?? asRecord(assets[0]).filename ?? "");
}

function rowStatusLabel(status: "passed" | "failed" | "processing" | "pending"): string {
  if (status === "failed") return "Failed";
  if (status === "processing") return "Processing";
  if (status === "pending") return "Pending";
  return "Passed";
}

function buildPagination(currentPage: number, totalPages: number): Array<number | "..."> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  if (currentPage <= 3) return [1, 2, 3, "...", totalPages];
  if (currentPage >= totalPages - 2) return [1, "...", totalPages - 2, totalPages - 1, totalPages];
  return [1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages];
}

function normalizeSku(value: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const bySlash = raw.split("/").filter(Boolean).pop() ?? raw;
  const byQuery = bySlash.split("?")[0] ?? bySlash;
  return byQuery.trim();
}

function normalizeFieldToken(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/['"`]/g, "")
    .replace(/[()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeUiMessage(value: string): string {
  const raw = String(value ?? "");
  return raw
    .replace(/\s*PID=[^\s]+/gi, "")
    .replace(/\s*File:\s*.+$/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function readAttributeGroup(name: string): "Основные характеристики" | "Комплектация" | "Дополнительно" {
  const normalized = name.toLowerCase();
  if (
    normalized.includes("farbe") ||
    normalized.includes("color") ||
    normalized.includes("material") ||
    normalized.includes("größe") ||
    normalized.includes("size")
  ) {
    return "Основные характеристики";
  }
  if (
    normalized.includes("set") ||
    normalized.includes("umfang") ||
    normalized.includes("inhalt") ||
    normalized.includes("paket")
  ) {
    return "Комплектация";
  }
  return "Дополнительно";
}

function parseShippingProfiles(payload: unknown): ShippingProfileOption[] {
  if (Array.isArray(payload)) {
    return payload
      .map((item) => asRecord(item))
      .map((item) => ({ id: String(item.id ?? ""), name: String(item.name ?? item.id ?? "") }))
      .filter((item) => Boolean(item.id));
  }
  const record = asRecord(payload);
  const nested = Array.isArray(record.shippingProfiles)
    ? record.shippingProfiles
    : Array.isArray(record.items)
      ? record.items
      : Array.isArray(record.data)
        ? record.data
        : [];
  return nested
    .map((item) => asRecord(item))
    .map((item) => ({ id: String(item.id ?? ""), name: String(item.name ?? item.id ?? "") }))
    .filter((item) => Boolean(item.id));
}

export default function CreatorPage() {
  const { currentUser, isLoading, error } = useCurrentUser();
  const [controller, setController] = useState<ControllerOption>("jv");
  const [fabrics, setFabrics] = useState<FabricOption[]>([]);
  const [shippingProfiles, setShippingProfiles] = useState<ShippingProfileOption[]>([]);
  const [selectedFabricId, setSelectedFabricId] = useState<string>("");
  const [selectedShippingProfileId, setSelectedShippingProfileId] = useState<string>("");
  const [state, setState] = useState<UploadState>("idle");
  const [isLoadingFabrics, setIsLoadingFabrics] = useState(false);
  const [message, setMessage] = useState("Выберите fabric и нажмите «Выставить».");
  const [issues, setIssues] = useState<string[]>([]);
  const [processId, setProcessId] = useState<string>("");
  const [processState, setProcessState] = useState<string>("IDLE");
  const [products, setProducts] = useState<Record<string, unknown>[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [currentStep, setCurrentStep] = useState<string>("prepare_initializing");
  const [stepElapsed, setStepElapsed] = useState<number>(0);
  const [heartbeatLag, setHeartbeatLag] = useState<number>(0);
  const [stuckMessage, setStuckMessage] = useState<string>("");
  const [hydratedDraft, setHydratedDraft] = useState(false);
  const [ottoProcessId, setOttoProcessId] = useState<string>("");
  const [ottoSummary, setOttoSummary] = useState<OttoSummary | null>(null);
  const [ottoErrors, setOttoErrors] = useState<OttoErrorRow[]>([]);
  const [lastSubmitTotal, setLastSubmitTotal] = useState(0);
  const [editorTab, setEditorTab] = useState<EditorTab>("general");
  const [attributeQuery, setAttributeQuery] = useState("");
  const [expandedAttributes, setExpandedAttributes] = useState<string[]>([]);
  const [editingAttribute, setEditingAttribute] = useState<{ index: number; field: AttributeEditField } | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [showAllErrorCards, setShowAllErrorCards] = useState(false);
  const [tableQuery, setTableQuery] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [priceFrom, setPriceFrom] = useState("");
  const [priceTo, setPriceTo] = useState("");
  const [errorFilter, setErrorFilter] = useState<"all" | "with_errors" | "only_success">("all");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [copiedSkuIndex, setCopiedSkuIndex] = useState<number | null>(null);
  const [tableStatusPhase, setTableStatusPhase] = useState<"pending" | "processing" | "result">("pending");

  function setUiMessage(nextMessage: string) {
    setMessage(sanitizeUiMessage(nextMessage));
  }

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CREATOR_DRAFT_KEY);
      if (!raw) {
        setHydratedDraft(true);
        return;
      }
      const draft = JSON.parse(raw) as Record<string, unknown>;
      setController((draft.controller as ControllerOption) ?? "jv");
      setSelectedFabricId(String(draft.selectedFabricId ?? ""));
      setSelectedShippingProfileId(String(draft.selectedShippingProfileId ?? ""));
      setState((draft.state as UploadState) ?? "idle");
      setUiMessage(String(draft.message ?? "Выберите fabric и нажмите «Выставить»."));
      setIssues(Array.isArray(draft.issues) ? (draft.issues as string[]) : []);
      setProcessId(String(draft.processId ?? ""));
      setProcessState(String(draft.processState ?? "IDLE"));
      setProducts(Array.isArray(draft.products) ? (draft.products as Record<string, unknown>[]) : []);
      setSelectedIndex(Number(draft.selectedIndex ?? 0));
      setCurrentStep(String(draft.currentStep ?? "prepare_initializing"));
      setStepElapsed(Number(draft.stepElapsed ?? 0));
      setHeartbeatLag(Number(draft.heartbeatLag ?? 0));
      setStuckMessage(String(draft.stuckMessage ?? ""));
      setOttoProcessId(String(draft.ottoProcessId ?? ""));
      const summary = asRecord(draft.ottoSummary);
      if (Object.keys(summary).length > 0) {
        setOttoSummary({
          state: String(summary.state ?? ""),
          total: Number(summary.total ?? 0),
          progress: Number(summary.progress ?? 0),
          succeeded: Number(summary.succeeded ?? 0),
          failed: Number(summary.failed ?? 0),
        });
      }
      setOttoErrors(Array.isArray(draft.ottoErrors) ? (draft.ottoErrors as OttoErrorRow[]) : []);
      setLastSubmitTotal(Number(draft.lastSubmitTotal ?? 0));
    } catch {
      // ignore broken draft and continue with clean state
    } finally {
      setHydratedDraft(true);
    }
  }, []);

  useEffect(() => {
    if (!hydratedDraft) return;
    const draft = {
      controller,
      selectedFabricId,
      selectedShippingProfileId,
      state,
      message,
      issues,
      processId,
      processState,
      products,
      selectedIndex,
      currentStep,
      stepElapsed,
      heartbeatLag,
      stuckMessage,
      ottoProcessId,
      ottoSummary,
      ottoErrors,
      lastSubmitTotal,
    };
    window.localStorage.setItem(CREATOR_DRAFT_KEY, JSON.stringify(draft));
  }, [
    hydratedDraft,
    controller,
    selectedFabricId,
    selectedShippingProfileId,
    state,
    message,
    issues,
    processId,
    processState,
    products,
    selectedIndex,
    currentStep,
    stepElapsed,
    heartbeatLag,
    stuckMessage,
    ottoProcessId,
    ottoSummary,
    ottoErrors,
    lastSubmitTotal,
  ]);

  useEffect(() => {
    let active = true;
    async function loadFabrics() {
      setIsLoadingFabrics(true);
      try {
        const response = await fetch(`/api/products/fabrics?controller=${encodeURIComponent(controller)}`, { method: "GET", cache: "no-store" });
        const parsed = await readJsonResponse<FabricListResponse>(response);
        if (!active) return;
        if (!response.ok) {
          setFabrics([]);
          setSelectedFabricId("");
          setUiMessage(readApiErrorMessage(parsed, "Не удалось загрузить fabrics", response.status));
          return;
        }
        const items = Array.isArray(parsed?.factory) ? parsed.factory : [];
        setFabrics(items);
        setSelectedFabricId(items[0]?.id ?? "");
      } catch {
        if (!active) return;
        setFabrics([]);
        setSelectedFabricId("");
        setUiMessage("Ошибка загрузки списка fabrics.");
      } finally {
        if (active) setIsLoadingFabrics(false);
      }
    }
    void loadFabrics();
    return () => { active = false; };
  }, [controller]);

  useEffect(() => {
    let active = true;
    async function loadShippingProfiles() {
      try {
        const response = await fetch(`/api/products/shipping-profiles?controller=${encodeURIComponent(controller)}`, {
          method: "GET",
          cache: "no-store",
        });
        const parsed = await readJsonResponse<unknown>(response);
        if (!active) return;
        if (!response.ok) {
          setShippingProfiles([]);
          setSelectedShippingProfileId("");
          return;
        }
        const items = parseShippingProfiles(parsed);
        setShippingProfiles(items);
        setSelectedShippingProfileId((prev) => (prev && items.some((item) => item.id === prev) ? prev : (items[0]?.id ?? "")));
      } catch {
        if (!active) return;
        setShippingProfiles([]);
        setSelectedShippingProfileId("");
      }
    }
    void loadShippingProfiles();
    return () => { active = false; };
  }, [controller]);

  useEffect(() => {
    if (!processId || processState !== "IN_PROGRESS") return;
    const timer = setInterval(async () => {
      const response = await fetch(`/api/products/create-from-fabric/${processId}`, { method: "GET", cache: "no-store" });
      const parsed = await readJsonResponse<PrepareStatusResponse>(response);
      if (!response.ok || parsed?.success === false) return;
      const nextState = parsed?.process_state ?? "IN_PROGRESS";
      setProcessState(nextState);
      setIssues(Array.isArray(parsed?.issues) ? parsed.issues : []);
      setCurrentStep(String(parsed?.current_step ?? "in_progress"));
      setStepElapsed(Number(parsed?.step_elapsed_sec ?? 0));
      setHeartbeatLag(Number(parsed?.heartbeat_lag_sec ?? 0));
      setStuckMessage(parsed?.stuck ? String(parsed?.stuck_message ?? "Процесс завис") : "");
      if (nextState === "DONE") {
        const rows = Array.isArray(parsed?.products) ? parsed.products : [];
        setProducts(rows);
        setSelectedIndex(0);
        setTableStatusPhase("pending");
        setState("success");
        setUiMessage(`Подготовка завершена: source=${parsed?.source_items ?? 0}, mapped=${parsed?.mapped_items ?? 0}, payload=${parsed?.payload_items ?? rows.length}.`);
      }
      if (nextState === "FAILED") {
        setState("error");
        setUiMessage("Подготовка завершилась с ошибкой.");
      }
    }, 1800);
    return () => clearInterval(timer);
  }, [processId, processState]);

  const rows = useMemo(() => products.map((product, index) => {
    const description = asRecord(product.productDescription);
    const pricing = asRecord(product.pricing);
    const standardPrice = asRecord(pricing.standardPrice);
    const rowErrors = ottoErrors.filter((error) => error.variation === String(product.sku ?? "")).length;
    const rowStatus =
      tableStatusPhase === "pending"
        ? "pending"
        : tableStatusPhase === "processing"
          ? "processing"
          : rowErrors > 0
            ? "failed"
            : "passed";
    return {
      index,
      image: firstImage(product),
      sku: String(product.sku ?? ""),
      category: String(description.category ?? ""),
      ean: String(product.ean ?? ""),
      productReference: String(product.productReference ?? ""),
      price: String(standardPrice.amount ?? ""),
      productLine: String(description.productLine ?? ""),
      errors: rowErrors,
      status: rowStatus as "passed" | "failed" | "processing" | "pending",
    };
  }), [products, ottoErrors, tableStatusPhase]);

  const categories = useMemo(
    () => Array.from(new Set(rows.map((row) => row.category).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const query = tableQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (categoryFilter !== "all" && row.category !== categoryFilter) return false;
      if (errorFilter === "with_errors" && row.errors === 0) return false;
      if (errorFilter === "only_success" && row.errors > 0) return false;

      const priceValue = Number(row.price);
      const from = priceFrom.trim() ? Number(priceFrom) : null;
      const to = priceTo.trim() ? Number(priceTo) : null;
      if (from !== null && Number.isFinite(priceValue) && priceValue < from) return false;
      if (to !== null && Number.isFinite(priceValue) && priceValue > to) return false;

      if (!query) return true;
      return [row.sku, row.category, row.productReference, row.productLine, row.ean]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [rows, tableQuery, statusFilter, categoryFilter, errorFilter, priceFrom, priceTo]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const paginationItems = buildPagination(safePage, totalPages);

  const selectedProduct = asRecord(products[selectedIndex]);
  const selectedSku = normalizeSku(String(selectedProduct.sku ?? ""));
  const selectedDescription = asRecord(selectedProduct.productDescription);
  const selectedPricing = asRecord(selectedProduct.pricing);
  const selectedStandardPrice = asRecord(selectedPricing.standardPrice);
  const selectedImage = firstImage(selectedProduct);
  const selectedBulletPoints = Array.isArray(selectedDescription.bulletPoints)
    ? selectedDescription.bulletPoints.map((item) => String(item))
    : [];
  const selectedAttributes = Array.isArray(selectedDescription.attributes)
    ? selectedDescription.attributes
    : [];
  const attributeCards = useMemo(() => {
    return selectedAttributes.map((item, index) => {
      const attr = asRecord(item);
      const name = String(attr.name ?? "");
      const values = Array.isArray(attr.values) ? attr.values.map((value) => String(value)).join(", ") : "";
      return {
        index,
        name,
        values,
        group: readAttributeGroup(name),
      };
    });
  }, [selectedAttributes]);
  const filteredAttributeCards = useMemo(() => {
    const term = attributeQuery.trim().toLowerCase();
    if (!term) return attributeCards;
    return attributeCards.filter((item) => {
      return item.name.toLowerCase().includes(term) || item.values.toLowerCase().includes(term);
    });
  }, [attributeCards, attributeQuery]);
  const groupedAttributeCards = useMemo(() => {
    const groups: Record<string, typeof filteredAttributeCards> = {
      "Основные характеристики": [],
      "Комплектация": [],
      "Дополнительно": [],
    };
    for (const item of filteredAttributeCards) {
      groups[item.group].push(item);
    }
    return groups;
  }, [filteredAttributeCards]);
  const parsedOttoErrors = useMemo<ParsedSkuError[]>(() => {
    return ottoErrors.map((item) => {
      const jsonPath = String(item.jsonPath ?? "");
      const byNameSingle = jsonPath.match(/@name='([^']+)'/);
      const byNameDouble = jsonPath.match(/@name==\"([^\"]+)\"/);
      const field = byNameSingle?.[1] ?? byNameDouble?.[1] ?? jsonPath;
      return {
        sku: normalizeSku(item.variation),
        code: String(item.code ?? "error"),
        message: String(item.title ?? item.code ?? "Unknown error"),
        field: String(field || "Неизвестное поле"),
        jsonPath,
      };
    });
  }, [ottoErrors]);
  const selectedProductErrors = useMemo(() => {
    return parsedOttoErrors.filter((item) => item.sku === selectedSku);
  }, [parsedOttoErrors, selectedSku]);
  const selectedErrorFieldTokens = useMemo(() => {
    const tokens: string[] = [];
    for (const item of selectedProductErrors) {
      const fieldToken = normalizeFieldToken(item.field);
      if (fieldToken) tokens.push(fieldToken);
      const pathToken = normalizeFieldToken(item.jsonPath);
      if (pathToken) tokens.push(pathToken);
    }
    return tokens;
  }, [selectedProductErrors]);
  const errorCardsBySku = useMemo(() => {
    const grouped: Record<string, ParsedSkuError[]> = {};
    for (const item of parsedOttoErrors) {
      if (!grouped[item.sku]) grouped[item.sku] = [];
      grouped[item.sku].push(item);
    }
    return Object.entries(grouped).map(([sku, list]) => ({
      sku,
      items: list,
      count: list.length,
      firstMessage: list[0]?.message ?? "Ошибка",
      fields: Array.from(new Set(list.map((entry) => entry.field).filter(Boolean))),
    }));
  }, [parsedOttoErrors]);
  const visibleErrorCards = useMemo(() => {
    return showAllErrorCards ? errorCardsBySku : errorCardsBySku.slice(0, 2);
  }, [errorCardsBySku, showAllErrorCards]);
  const kpiTotal = useMemo(() => {
    const candidate = lastSubmitTotal > 0 ? lastSubmitTotal : rows.length;
    return Math.max(0, candidate);
  }, [lastSubmitTotal, rows.length]);
  const kpiFailed = useMemo(() => {
    const summaryFailed = Number(ottoSummary?.failed ?? 0);
    const errorsFailed = ottoErrors.length;
    const candidate = Math.max(summaryFailed, errorsFailed, 0);
    return Math.min(kpiTotal, candidate);
  }, [ottoSummary?.failed, ottoErrors.length, kpiTotal]);
  const kpiSucceeded = useMemo(() => Math.max(0, kpiTotal - kpiFailed), [kpiTotal, kpiFailed]);
  const visibleGenericIssues = useMemo(() => {
    if (issues.length === 0) return [];
    const coveredPairs = new Set(
      parsedOttoErrors.map((item) => `${item.sku}:${item.code}`.toLowerCase()),
    );
    return issues.filter((item) => {
      const raw = String(item ?? "").trim().toLowerCase();
      if (!raw) return false;
      const normalized = raw.replace(/\s+/g, "");
      const normalizedCovered = new Set(
        Array.from(coveredPairs).map((pair) => pair.replace(/\s+/g, "")),
      );
      return !normalizedCovered.has(normalized);
    });
  }, [issues, parsedOttoErrors]);

  useEffect(() => {
    setAttributeQuery("");
    setExpandedAttributes([]);
    setEditingAttribute(null);
    setEditingDraft("");
  }, [selectedIndex]);

  async function copyText(value: string) {
    if (!value || value === "-") return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // ignore clipboard failures
    }
  }

  async function refreshProcessState() {
    if (!processId) return;
    const response = await fetch(`/api/products/create-from-fabric/${processId}`, { method: "GET", cache: "no-store" });
    const parsed = await readJsonResponse<PrepareStatusResponse>(response);
    if (!response.ok || parsed?.success === false) return;
    const nextState = parsed?.process_state ?? processState;
    setProcessState(nextState);
    setIssues(Array.isArray(parsed?.issues) ? parsed.issues : []);
    setCurrentStep(String(parsed?.current_step ?? currentStep));
    setStepElapsed(Number(parsed?.step_elapsed_sec ?? stepElapsed));
    setHeartbeatLag(Number(parsed?.heartbeat_lag_sec ?? heartbeatLag));
    setStuckMessage(parsed?.stuck ? String(parsed?.stuck_message ?? "Процесс завис") : "");
    if (nextState === "DONE") {
      const rows = Array.isArray(parsed?.products) ? parsed.products : [];
      if (rows.length > 0) setProducts(rows);
    }
  }

  function updateSelected(path: string[], value: string) {
    setProducts((prev) => {
      const next = [...prev];
      next[selectedIndex] = updateProductField(asRecord(next[selectedIndex]), path, value);
      return next;
    });
  }

  function fieldHasError(keywords: string[]): boolean {
    const lowered = keywords.map((item) => normalizeFieldToken(item));
    return selectedErrorFieldTokens.some((token) =>
      lowered.some((keyword) => token.includes(keyword) || keyword.includes(token)),
    );
  }

  function updateAttributeField(attributeIndex: number, field: AttributeEditField, nextValue: string) {
    setProducts((prev) => {
      const copy = [...prev];
      const current = asRecord(copy[selectedIndex]);
      const desc = asRecord(current.productDescription);
      const attrs = Array.isArray(desc.attributes) ? [...desc.attributes] : [];
      const nextAttr = asRecord(attrs[attributeIndex]);
      attrs[attributeIndex] = {
        ...nextAttr,
        values: nextValue
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      };
      copy[selectedIndex] = updateProductField(
        current,
        ["productDescription", "attributes"],
        attrs,
      );
      return copy;
    });
  }

  function startAttributeEdit(attributeIndex: number, field: AttributeEditField, sourceValue: string) {
    setEditingAttribute({ index: attributeIndex, field });
    setEditingDraft(sourceValue);
  }

  function saveAttributeEdit() {
    if (!editingAttribute) return;
    updateAttributeField(editingAttribute.index, editingAttribute.field, editingDraft);
    setEditingAttribute(null);
    setEditingDraft("");
  }

  function deleteAttribute(attributeIndex: number) {
    setProducts((prev) => {
      const copy = [...prev];
      const current = asRecord(copy[selectedIndex]);
      const desc = asRecord(current.productDescription);
      const attrs = Array.isArray(desc.attributes) ? [...desc.attributes] : [];
      const nextAttrs = attrs.filter((_, index) => index !== attributeIndex);
      copy[selectedIndex] = updateProductField(
        current,
        ["productDescription", "attributes"],
        nextAttrs,
      );
      return copy;
    });
    setEditingAttribute(null);
    setEditingDraft("");
  }

  async function handleCreate() {
    if (!selectedFabricId) {
      setState("error");
      setUiMessage("Сначала выберите fabric.");
      return;
    }
    setState("loading");
    setProcessState("IN_PROGRESS");
    setUiMessage("Процесс подготовки запущен...");
    setIssues([]);
    setProducts([]);
    setProcessId("");
    setCurrentStep("prepare_initializing");
    setStepElapsed(0);
    setHeartbeatLag(0);
    setStuckMessage("");
    setOttoProcessId("");
    setOttoSummary(null);
    setOttoErrors([]);
    setTableStatusPhase("pending");
    setLastSubmitTotal(0);
    try {
      const response = await fetch("/api/products/create-from-fabric", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ controller, factory_id: selectedFabricId }),
        cache: "no-store",
      });
      const parsed = await readJsonResponse<CreateFromFabricResponse>(response);
      if (!response.ok || parsed?.success === false) {
        setState("error");
        setIssues(Array.isArray(parsed?.issues) ? parsed.issues : []);
        setUiMessage(readApiErrorMessage(parsed, "Не удалось запустить подготовку", response.status));
        return;
      }
      setProcessId(parsed?.process_id ?? "");
      setUiMessage(`Запуск успешен. Process ID: ${parsed?.process_id ?? "-"}`);
    } catch (caughtError) {
      setState("error");
      setUiMessage(caughtError instanceof Error ? `Ошибка запроса: ${caughtError.message}` : "Ошибка запроса");
    }
  }

  async function submitEditedProducts() {
    if (!processId || products.length === 0) return;
    if (!selectedShippingProfileId) {
      setState("error");
      setUiMessage("Выберите профиль доставки перед загрузкой.");
      return;
    }
    setState("loading");
    setUiMessage("Загрузить: отправляю все продукты в OTTO...");
    setOttoSummary(null);
    setOttoErrors([]);
    setTableStatusPhase("processing");
    setLastSubmitTotal(products.length);
    try {
      const response = await fetch(`/api/products/create-from-fabric/${processId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          products,
          controller,
          factory_id: selectedFabricId,
        }),
        cache: "no-store",
      });
      const parsed = await readJsonResponse<SubmitPreparedResponse>(response);
      if (!response.ok || parsed?.success === false) {
        setState("error");
        setUiMessage(readApiErrorMessage(parsed, "Не удалось сохранить итоговые данные", response.status));
        return;
      }
      const update = asRecord(parsed?.otto_update_result);
      const failed = asRecord(parsed?.otto_failed_result);
      const failedCount = Number(update.failed ?? 0);
      const ottoPid = String(parsed?.otto_process_id ?? "");
      setOttoProcessId(ottoPid);
      setOttoSummary({
        state: String(update.state ?? parsed?.otto_create_state ?? ""),
        total: Number(update.total ?? 0),
        progress: Number(update.progress ?? 0),
        succeeded: Number(update.succeeded ?? 0),
        failed: Number(update.failed ?? 0),
      });

      const resultErrors = Array.isArray(failed.results) ? failed.results : [];
      const nextErrors: OttoErrorRow[] = resultErrors.flatMap((entry) => {
        const rec = asRecord(entry);
        const variation = String(rec.variation ?? "unknown");
        const errs = Array.isArray(rec.errors) ? rec.errors : [];
        return errs.map((err) => {
          const errRec = asRecord(err);
          return {
            variation,
            code: String(errRec.code ?? "error"),
            title: String(errRec.title ?? "Unknown error"),
            jsonPath: String(errRec.jsonPath ?? ""),
          };
        });
      });
      setOttoErrors(nextErrors);
      setTableStatusPhase("result");

      if (failedCount > 0) {
        setState("error");
        const nextIssues: string[] = nextErrors.map((item) => `${item.variation}: ${item.code}`);
        setIssues(nextIssues.length > 0 ? nextIssues : [`OTTO process ${ottoPid}: failed=${failedCount}`]);
        setUiMessage("Загрузка завершена с ошибками.");
        return;
      }

      setUiMessage("Товары созданы. Отправляю availability...");
      const availabilityResults = await Promise.allSettled(
        products.map(async (product) => {
          const sku = String(asRecord(product).sku ?? "").trim();
          if (!sku) {
            throw new Error("missing sku");
          }
          const availabilityResponse = await fetch("/api/products/create-availability", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              sku,
              quantity: "20",
              shippingProfileID: selectedShippingProfileId,
              controller,
            }),
            cache: "no-store",
          });
          const availabilityParsed = await readJsonResponse<AvailabilitySubmitResponse>(availabilityResponse);
          if (!availabilityResponse.ok) {
            throw new Error(readApiErrorMessage(availabilityParsed, `Availability failed for ${sku}`, availabilityResponse.status));
          }
          const quantityOk = Boolean(availabilityParsed?.update_quantity?.success);
          const deliveryOk = Boolean(availabilityParsed?.update_delivery?.success);
          if (!quantityOk || !deliveryOk) {
            const quantityError = availabilityParsed?.update_quantity?.errors ?? "";
            const deliveryError = availabilityParsed?.update_delivery?.errors ?? "";
            throw new Error(`quantity=${quantityError || "failed"}, delivery=${deliveryError || "failed"}`);
          }
          return sku;
        }),
      );
      const availabilityErrors: OttoErrorRow[] = availabilityResults.flatMap((result, index) => {
        if (result.status === "fulfilled") return [];
        const sku = String(asRecord(products[index]).sku ?? "unknown");
        return [{
          variation: sku,
          code: "availability_failed",
          title: result.reason instanceof Error ? result.reason.message : "Availability request failed",
          jsonPath: "availability",
        }];
      });
      if (availabilityErrors.length > 0) {
        setOttoErrors(availabilityErrors);
        setState("error");
        setIssues(availabilityErrors.map((item) => `${item.variation}: ${item.code}`));
        setUiMessage(`Availability завершен с ошибками: ${availabilityErrors.length} из ${products.length}.`);
        return;
      }

      setState("success");
      setUiMessage(`Загружено товаров: ${parsed?.products_count ?? products.length}. Availability отправлен для ${products.length}.`);
      setIssues([]);
    } catch (caughtError) {
      setState("error");
      setUiMessage(caughtError instanceof Error ? `Ошибка запроса: ${caughtError.message}` : "Ошибка запроса");
    }
  }

  function handleClear() {
    window.localStorage.removeItem(CREATOR_DRAFT_KEY);
    setState("idle");
    setUiMessage("Состояние очищено.");
    setIssues([]);
    setProcessId("");
    setProcessState("IDLE");
    setProducts([]);
    setSelectedIndex(0);
    setCurrentStep("prepare_initializing");
    setStepElapsed(0);
    setHeartbeatLag(0);
    setStuckMessage("");
    setOttoProcessId("");
    setOttoSummary(null);
    setOttoErrors([]);
    setTableStatusPhase("pending");
    setLastSubmitTotal(0);
  }

  if (isLoading) {
    return <main className="otto-page"><section className="app-shell"><section className="workspace"><p className="helper-banner info">Пожалуйста, подождите...</p></section></section></main>;
  }

  return (
    <AppWorkspaceShell
      activeHref="/creator"
      currentUser={currentUser}
      sectionLabel="Создание"
      title="Подготовка по Fabric"
      description="Подготовка, проверка и публикация товаров в OTTO"
      compactSidebar
    >
      <div className="creator-workspace creator-ref-workspace">
        {error ? <p className="helper-banner">{error}</p> : null}
        <section className="creator-ref-top-grid">
          <article className="creator-ref-card creator-ref-card-action">
            <h2>Подготовка по Fabric</h2>
            <p className="creator-ref-card-subtitle">Выберите Controller и Fabric для запуска загрузки товаров.</p>
            <div className="creator-mode-switch">
              <label>Controller
                <select value={controller} onChange={(event) => setController(event.target.value as ControllerOption)} disabled={state === "loading"}>
                  <option value="jv">JV</option><option value="xl">XL</option>
                </select>
              </label>
              <label>Fabric
                <select value={selectedFabricId} onChange={(event) => setSelectedFabricId(event.target.value)} disabled={isLoadingFabrics || state === "loading" || fabrics.length === 0}>
                  {fabrics.length === 0 ? <option value="">{isLoadingFabrics ? "Загрузка fabrics..." : "Нет fabrics"}</option> : fabrics.map((item) => <option key={item.id} value={item.id}>{item.name ?? item.id} ({item.items_count ?? 0})</option>)}
                </select>
              </label>
              <label>Профиль доставки
                <select value={selectedShippingProfileId} onChange={(event) => setSelectedShippingProfileId(event.target.value)} disabled={state === "loading" || shippingProfiles.length === 0}>
                  {shippingProfiles.length === 0
                    ? <option value="">Нет профилей</option>
                    : shippingProfiles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
            </div>
            <Button className="creator-ref-launch-btn" size="lg" type="button" onClick={handleCreate} disabled={state === "loading" || !selectedFabricId}>
              {state === "loading" ? "Запуск..." : "🚀 Выставить товары"}
            </Button>
            <div className={`creator-ref-inline-alert ${state === "error" ? "is-error" : state === "success" ? "is-success" : "is-info"}`}>
              <span className="creator-ref-inline-alert-icon" aria-hidden="true">
                {state === "error" ? <AlertCircle size={16} /> : state === "success" ? <Check size={16} /> : "i"}
              </span>
              <p>{message}</p>
            </div>
          </article>

          <article className="creator-ref-card creator-ref-card-main">
            <div className="creator-ref-main-head">
              <h2>Последняя загрузка</h2>
              <button className="creator-ref-refresh-btn" type="button" onClick={() => void refreshProcessState()}>
                <RefreshCw size={14} />
                Обновить
              </button>
            </div>
            <div className="creator-ref-status-line">
              <span className="creator-ref-status-label">Статус</span>
              <Badge
                className={`creator-ref-status-badge creator-ref-status-badge-animated ${
                  processState === "DONE"
                    ? "done"
                    : processState === "FAILED"
                      ? "failed"
                      : "progress"
                }`}
              >
                {processState}
              </Badge>
            </div>
            <div className="creator-ref-metrics">
              <Card className="metric success">
                <span className="metric-icon"><Check size={18} /></span>
                <small>Успешно</small>
                <strong>{kpiSucceeded}</strong>
              </Card>
              <Card className="metric error">
                <span className="metric-icon"><X size={18} /></span>
                <small>Ошибки</small>
                <strong>{kpiFailed}</strong>
              </Card>
              <Card className="metric neutral">
                <span className="metric-icon"><Box size={18} /></span>
                <small>Всего</small>
                <strong>{kpiTotal}</strong>
              </Card>
            </div>
            <div className="creator-ref-runtime">
              <div className="creator-ref-runtime-row">
                <span>Otto Process ID</span>
                <code>{ottoProcessId || "-"}</code>
                <button type="button" onClick={() => copyText(ottoProcessId || "-")}><Copy size={14} /></button>
              </div>
              <div className="creator-ref-runtime-row">
                <span>Process ID</span>
                <code>{processId || "-"}</code>
                <button type="button" onClick={() => copyText(processId || "-")}><Copy size={14} /></button>
              </div>
              <p>Шаг: <strong>{currentStep}</strong> · <strong>{Math.max(0, Math.round(stepElapsed))}s</strong></p>
              {stuckMessage ? <p className="helper-banner error">{stuckMessage}</p> : null}
            </div>
          </article>

          <article className="creator-ref-card creator-ref-card-errors">
            <div className="creator-ref-errors-head">
              <h2>{`Ошибки (${errorCardsBySku.length})`}</h2>
              {errorCardsBySku.length > 2 ? (
                <button type="button" className="creator-ref-show-all" onClick={() => setShowAllErrorCards((prev) => !prev)}>
                  {showAllErrorCards ? "Скрыть" : "Показать все"}
                </button>
              ) : null}
            </div>
            <div className="creator-ref-errors-list">
              {visibleErrorCards.map((item) => (
                <Card className="creator-ref-error-card" key={item.sku}>
                  <div className="creator-ref-error-row-top">
                    <span className="creator-ref-error-icon"><AlertCircle size={16} /></span>
                    <p className="creator-ref-error-title clamp-2">{item.firstMessage}</p>
                  </div>
                  <p className="creator-ref-error-meta">{`SKU: ${item.sku} • Ошибок: ${item.count}`}</p>
                  <div className="creator-ref-error-actions">
                    <button
                      type="button"
                      onClick={() => {
                        const sourceSku = normalizeSku(item.sku);
                        const row = rows.find((rowItem) => normalizeSku(rowItem.sku) === sourceSku);
                        if (row) setSelectedIndex(row.index);
                      }}
                    >
                      Открыть товар
                    </button>
                  </div>
                </Card>
              ))}
              {!showAllErrorCards && errorCardsBySku.length > 2 ? (
                <button className="creator-ref-more-errors" type="button" onClick={() => setShowAllErrorCards(true)}>
                  {`Еще ${errorCardsBySku.length - 2} ошибки`}
                </button>
              ) : null}
              {errorCardsBySku.length === 0 ? (
                <p className="helper-banner info">Ошибок не обнаружено.</p>
              ) : null}
            </div>
          </article>
        </section>

        <section className="creator-ref-main-grid">
          <Card className="creator-products-card">
            <div className="creator-products-head">
              <div>
                <h2 className="text-xl font-semibold">Товары</h2>
                <p className="text-sm text-[var(--muted-fg)]">{`${filteredRows.length} товаров`}</p>
              </div>
              <div className="creator-products-controls">
                <div className="creator-search-wrap">
                  <Search size={16} className="creator-search-icon" />
                  <input
                    className="creator-search-input"
                    placeholder="Поиск по SKU, категории или артикулу..."
                    type="search"
                    value={tableQuery}
                    onChange={(event) => {
                      setTableQuery(event.target.value);
                      setPage(1);
                    }}
                  />
                </div>
                <div className="creator-table-popover-wrap">
                  <button className="creator-table-top-btn" type="button" onClick={() => setIsFilterOpen((prev) => !prev)}>
                    <Funnel size={16} />
                    Фильтр
                  </button>
                  {isFilterOpen ? (
                    <div className="creator-table-popover">
                      <p>Статус</p>
                      <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>
                        <option value="all">Все</option>
                        <option value="passed">Passed</option>
                        <option value="failed">Failed</option>
                        <option value="processing">Processing</option>
                        <option value="pending">Pending</option>
                      </select>
                      <p>Категория</p>
                      <select value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setPage(1); }}>
                        <option value="all">Все категории</option>
                        {categories.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                      <p>Диапазон цены</p>
                      <div className="creator-popover-price-grid">
                        <input placeholder="От" value={priceFrom} onChange={(event) => { setPriceFrom(event.target.value); setPage(1); }} />
                        <input placeholder="До" value={priceTo} onChange={(event) => { setPriceTo(event.target.value); setPage(1); }} />
                      </div>
                      <p>Наличие ошибок</p>
                      <select value={errorFilter} onChange={(event) => { setErrorFilter(event.target.value as "all" | "with_errors" | "only_success"); setPage(1); }}>
                        <option value="all">Все</option>
                        <option value="with_errors">Только с ошибками</option>
                        <option value="only_success">Только успешные</option>
                      </select>
                    </div>
                  ) : null}
                </div>
                <div className="creator-table-popover-wrap">
                  <button className="creator-table-top-btn" type="button" onClick={() => setIsActionsOpen((prev) => !prev)}>
                    <MoreHorizontal size={16} />
                  </button>
                  {isActionsOpen ? (
                    <div className="creator-table-actions-popover">
                      <button type="button" onClick={() => setPage(1)}>Обновить данные</button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="creator-products-grid-head">
              <span>Preview</span>
              <span>SKU</span>
              <span>Category</span>
              <span className="is-right">Price</span>
              <span className="creator-status-head">Status</span>
            </div>

            {pagedRows.length === 0 ? (
              <div className="creator-products-empty">
                <Package size={28} />
                <strong>Нет товаров</strong>
                <p>Выберите Fabric и запустите подготовку товаров.</p>
              </div>
            ) : (
              pagedRows.map((row) => (
                <div
                  key={row.index}
                  className={`creator-products-row ${selectedIndex === row.index ? "is-selected" : ""}`}
                  onClick={() => setSelectedIndex(row.index)}
                >
                  <span className="creator-products-preview">
                    {row.image ? (
                      <img className="creator-ref-thumb" src={row.image} alt={row.sku || `product-${row.index}`} />
                    ) : (
                      <span className="creator-ref-thumb creator-ref-thumb-empty">-</span>
                    )}
                  </span>
                  <span className="creator-products-sku">
                    <strong>{row.sku || "-"}</strong>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        navigator.clipboard.writeText(row.sku || "");
                        setCopiedSkuIndex(row.index);
                        window.setTimeout(() => setCopiedSkuIndex(null), 1200);
                      }}
                    >
                      <Copy size={14} />
                      {copiedSkuIndex === row.index ? <em>Скопировано</em> : null}
                    </button>
                  </span>
                  <span className="creator-products-category" title={row.category || "-"}>
                    {row.category || "-"}
                  </span>
                  <span className="creator-products-price">{row.price || "-"}</span>
                  <span className="creator-products-status">
                    <Badge
                      className={`creator-ref-status-pill ${row.status}`}
                      variant={row.status === "passed" ? "success" : row.status === "failed" ? "outline" : "secondary"}
                    >
                      <span className="creator-ref-status-dot" aria-hidden="true" />
                      {rowStatusLabel(row.status)}
                    </Badge>
                  </span>
                </div>
              ))
            )}

            <div className="creator-products-pagination">
              <div className="creator-products-pagination-left">
                <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>
                  {[10, 25, 50, 100].map((item) => <option key={item} value={item}>{`${item} на странице`}</option>)}
                </select>
                <span>{`${filteredRows.length === 0 ? 0 : (safePage - 1) * pageSize + 1}-${Math.min(safePage * pageSize, filteredRows.length)} из ${filteredRows.length}`}</span>
              </div>
              <div className="creator-products-pagination-right">
                <button type="button" disabled={safePage <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}><ChevronLeft size={14} /></button>
                {paginationItems.map((item, idx) => typeof item === "number" ? (
                  <button key={`${item}-${idx}`} type="button" className={item === safePage ? "active" : ""} onClick={() => setPage(item)}>{item}</button>
                ) : (
                  <span key={`${item}-${idx}`}>...</span>
                ))}
                <button type="button" disabled={safePage >= totalPages} onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}><ChevronRight size={14} /></button>
              </div>
            </div>
          </Card>

          <aside className="creator-ref-editor">
            <div className="creator-ref-editor-head">
              <h3>Редактор товара</h3>
            </div>
            <div className="saas-editor-image-wrap">
              {selectedImage ? <img className="saas-editor-image" src={selectedImage} alt={String(selectedProduct.sku ?? "preview")} /> : <div className="saas-editor-image saas-editor-image-empty">No image</div>}
            </div>
            <div className="saas-editor-grid creator-ref-editor-grid">
              <label className={fieldHasError(["sku"]) ? "creator-field-error" : ""}>SKU<input value={String(selectedProduct.sku ?? "")} onChange={(event) => updateSelected(["sku"], event.target.value)} /></label>
              <label className={fieldHasError(["ean"]) ? "creator-field-error" : ""}>EAN<input value={String(selectedProduct.ean ?? "")} onChange={(event) => updateSelected(["ean"], event.target.value)} /></label>
              <label className={fieldHasError(["reference", "productreference"]) ? "creator-field-error" : ""}>Product Reference<input value={String(selectedProduct.productReference ?? "")} onChange={(event) => updateSelected(["productReference"], event.target.value)} /></label>
              <label className={fieldHasError(["category", "kategorie"]) ? "creator-field-error" : ""}>Category<input value={String(selectedDescription.category ?? "")} onChange={(event) => updateSelected(["productDescription", "category"], event.target.value)} /></label>
              <label className={fieldHasError(["price", "preis", "amount"]) ? "creator-field-error" : ""}>Price
                <input
                  value={String(selectedStandardPrice.amount ?? "")}
                  onChange={(event) => {
                    const value = event.target.value.trim();
                    const amount = value === "" ? 0 : Number(value);
                    if (Number.isNaN(amount)) return;
                    setProducts((prev) => {
                      const next = [...prev];
                      next[selectedIndex] = updateProductField(asRecord(next[selectedIndex]), ["pricing", "standardPrice", "amount"], amount);
                      return next;
                    });
                  }}
                />
              </label>
              <label className={fieldHasError(["productline", "line"]) ? "creator-field-error" : ""}>Product Line<input value={String(selectedDescription.productLine ?? "")} onChange={(event) => updateSelected(["productDescription", "productLine"], event.target.value)} /></label>
            </div>
            <div className="creator-ref-tabs">
              <button className={editorTab === "general" ? "active" : ""} onClick={() => setEditorTab("general")} type="button">Основное</button>
              <button className={editorTab === "attributes" ? "active" : ""} onClick={() => setEditorTab("attributes")} type="button">Атрибуты</button>
              <button className={editorTab === "json" ? "active" : ""} onClick={() => setEditorTab("json")} type="button">JSON</button>
            </div>
            {editorTab === "general" ? (
              <div className="saas-editor-grid">
                <label className={fieldHasError(["bullet", "point"]) ? "creator-field-error" : ""}>Bullet Points (one per line)
                  <textarea
                    value={selectedBulletPoints.join("\n")}
                    onChange={(event) => {
                      const next = event.target.value
                        .split("\n")
                        .map((line) => line.trim())
                        .filter(Boolean);
                      setProducts((prev) => {
                        const copy = [...prev];
                        copy[selectedIndex] = updateProductField(
                          asRecord(copy[selectedIndex]),
                          ["productDescription", "bulletPoints"],
                          next,
                        );
                        return copy;
                      });
                    }}
                    rows={6}
                  />
                </label>
              </div>
            ) : null}
            {editorTab === "attributes" ? (
              <div className="creator-attributes-v3">
                <div className="creator-attributes-v3-toolbar">
                  <input
                    type="search"
                    value={attributeQuery}
                    onChange={(event) => setAttributeQuery(event.target.value)}
                    placeholder="Поиск атрибута..."
                  />
                </div>
                {filteredAttributeCards.length === 0 ? <p>Ничего не найдено.</p> : null}
                {(["Основные характеристики", "Комплектация", "Дополнительно"] as const).map((groupName) => (
                  groupedAttributeCards[groupName].length > 0 ? (
                    <section key={groupName} className="creator-attributes-v3-group">
                      <h4>{groupName}</h4>
                      <div className="creator-attributes-v3-grid">
                        {groupedAttributeCards[groupName].map((attribute) => {
                          const key = `${attribute.index}`;
                          const isExpanded = expandedAttributes.includes(key);
                          const isValueEditing = editingAttribute?.index === attribute.index && editingAttribute.field === "values";
                          const valueIsLong = attribute.values.length > 90;
                          const attrName = normalizeFieldToken(attribute.name);
                          const isAttributeError = selectedErrorFieldTokens.some((fieldToken) =>
                            fieldToken.includes(attrName) || attrName.includes(fieldToken),
                          );
                          return (
                            <Card className={`creator-attributes-v3-card ${isAttributeError ? "is-error" : ""}`} key={`attr-${attribute.index}`}>
                              <div className="creator-attributes-v3-name-wrap">
                                <p className="creator-attributes-v3-name">{attribute.name || "Без названия"}</p>
                                <button
                                  type="button"
                                  className="creator-attributes-v3-delete"
                                  onClick={() => deleteAttribute(attribute.index)}
                                  aria-label="Удалить атрибут"
                                  title="Удалить атрибут"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                              <div className="creator-attributes-v3-value-wrap">
                                {isValueEditing ? (
                                  <input
                                    autoFocus
                                    value={editingDraft}
                                    onBlur={saveAttributeEdit}
                                    onChange={(event) => setEditingDraft(event.target.value)}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") saveAttributeEdit();
                                      if (event.key === "Escape") {
                                        setEditingAttribute(null);
                                        setEditingDraft("");
                                      }
                                    }}
                                  />
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      className={`creator-attributes-v3-value ${isExpanded ? "expanded" : ""}`}
                                      onClick={() => startAttributeEdit(attribute.index, "values", attribute.values)}
                                    >
                                      {attribute.values || "—"}
                                    </button>
                                    {valueIsLong ? (
                                      <button
                                        type="button"
                                        className="creator-attributes-v3-expand"
                                        onClick={() =>
                                          setExpandedAttributes((prev) =>
                                            prev.includes(key)
                                              ? prev.filter((item) => item !== key)
                                              : [...prev, key],
                                          )
                                        }
                                      >
                                        {isExpanded ? "Свернуть" : "Показать полностью"}
                                      </button>
                                    ) : null}
                                  </>
                                )}
                              </div>
                            </Card>
                          );
                        })}
                      </div>
                    </section>
                  ) : null
                ))}
              </div>
            ) : null}
            {editorTab === "json" ? (
              <div className="saas-editor-grid">
                <label>Attributes (JSON array)
                  <textarea
                    value={JSON.stringify(selectedAttributes, null, 2)}
                    onChange={(event) => {
                      try {
                        const parsed = JSON.parse(event.target.value);
                        if (!Array.isArray(parsed)) return;
                        setProducts((prev) => {
                          const copy = [...prev];
                          copy[selectedIndex] = updateProductField(
                            asRecord(copy[selectedIndex]),
                            ["productDescription", "attributes"],
                            parsed,
                          );
                          return copy;
                        });
                      } catch {
                        // let user type invalid JSON temporarily without crashing
                      }
                    }}
                    rows={12}
                  />
                </label>
              </div>
            ) : null}
            <div className="creator-ref-editor-actions">
              <button className="primary-btn" type="button" onClick={submitEditedProducts}>Загрузить</button>
              <button className="secondary-btn" type="button" onClick={handleClear}>Clear</button>
            </div>
          </aside>
        </section>
      </div>
    </AppWorkspaceShell>
  );
}
