"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Box, Check, CheckCircle2, ChevronLeft, ChevronRight, Copy, Funnel, Package, Pencil, RefreshCw, Search, Trash2, TriangleAlert, X } from "lucide-react";

import { readApiErrorMessage, readJsonResponse } from "../lib/api";
import { useCurrentUser } from "../hooks/use-current-user";
import { AppWorkspaceShell } from "../ui/app-workspace-shell";
import { PageLoadingShell } from "../ui/page-loading-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type UploadState = "idle" | "loading" | "success" | "error";
type ControllerOption = "jv" | "xl";
const CREATOR_DRAFT_KEY = "creator_process_draft_v1";
const AVAILABILITY_CONCURRENCY = 10;

type FabricOption = { id: string; name: string; items_count?: number };
type FabricListResponse = { factory?: FabricOption[] };
type CategoryListResponse = { success?: boolean; items?: string[] };
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
  frontend_draft?: Record<string, unknown>;
  products_count?: number;
  otto_process_id?: string | null;
  otto_create_state?: string;
  otto_update_result?: Record<string, unknown>;
  otto_failed_result?: Record<string, unknown> | null;
  availability_errors?: OttoErrorRow[];
  availability_failed?: number;
};
type SubmitPreparedResponse = {
  success?: boolean;
  saved_path?: string;
  products_count?: number;
  otto_process_id?: string | null;
  otto_create_state?: string;
  otto_update_result?: Record<string, unknown>;
  otto_failed_result?: Record<string, unknown> | null;
  queued?: boolean;
  process_state?: string;
};
type EnrichPreparedResponse = {
  success?: boolean;
  process_id?: string;
  products_count?: number;
  products?: Record<string, unknown>[];
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
type TaskProgress = {
  total: number;
  completed: number;
  percent: number;
};
type OttoErrorRow = {
  variation: string;
  code: string;
  title: string;
  jsonPath: string;
};
type AiCategoryReview = {
  category: string;
  confidence: number;
};
type CategoryReviewStatus = "confirmed" | "requires_review" | "manually_changed" | "manually_confirmed";
type ParsedSkuError = {
  sku: string;
  code: string;
  message: string;
  field: string;
  jsonPath: string;
};

type EditorTab = "general" | "attributes" | "json";
type AttributeEditField = "values";
type WorkflowStep = "categories" | "details";
const SHIPPING_PROFILE_LABELS: Record<string, string> = {
  "786c6468-3baf-52e0-88b5-13757eb7f873": "4-8 недель",
  "360835cf-4962-59bb-ae66-78e8a41c8948": "6-10 недель",
  "28e3b4f8-12aa-5994-a7e9-26027baede55": "2-4 недели",
  "ad6009b9-a82f-5284-ac64-5627575655ac": "Express Chesterfield",
  "571dd076-4e59-5216-a86f-3e5f30319e9c": "Express Production",
  "935a75b0-ac88-55a8-98df-8556306f1386": "8-12 недель",
  "b4139e65-603f-52f7-9b99-393cf6b2461f": "Доступно сразу",
  "83feaefc-c110-5b39-af53-49344b77ae89": "Сборка/занос, сразу",
};

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

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;

  async function consume() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = { status: "fulfilled", value: await worker(items[index], index) };
      } catch (error) {
        results[index] = { status: "rejected", reason: error };
      }
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, () => consume());
  await Promise.all(workers);
  return results;
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
  const rawList = Array.isArray(payload)
    ? payload
    : (() => {
      const record = asRecord(payload);
      if (Array.isArray(record.shippingProfiles)) return record.shippingProfiles;
      if (Array.isArray(record.items)) return record.items;
      if (Array.isArray(record.data)) return record.data;
      if (Array.isArray(record.results)) return record.results;
      return [];
    })();

  const parsed = rawList
    .map((item) => asRecord(item))
    .map((item) => {
      const id = String(
        item.id ??
        item.shippingProfileID ??
        item.shippingProfileId ??
        item.profileId ??
        "",
      );
      const name = String(
        item.name ??
        item.title ??
        item.profileName ??
        item.label ??
        SHIPPING_PROFILE_LABELS[id] ??
        id,
      );
      return { id, name };
    })
    .filter((item) => Boolean(item.id));

  const unique = new Map<string, ShippingProfileOption>();
  for (const item of parsed) unique.set(item.id, item);
  return Array.from(unique.values());
}

function productShippingProfileId(product: Record<string, unknown>): string {
  return String(product.shippingProfileID ?? "");
}

function readAiCategoryReview(product: Record<string, unknown>): AiCategoryReview {
  const description = asRecord(product.productDescription);
  return {
    category: String(
      product.aiCategory ??
      product.category ??
      description.aiCategory ??
      description.category ??
      "",
    ),
    confidence: Number(
      product.aiCategoryConfidence ??
      product.categoryConfidence ??
      product.confidence ??
      description.aiCategoryConfidence ??
      description.categoryConfidence ??
      description.confidence ??
      0,
    ),
  };
}

function mergeAiCategoryReview(
  storedReview: AiCategoryReview | undefined,
  product: Record<string, unknown>,
): AiCategoryReview {
  const productReview = readAiCategoryReview(product);
  if (!storedReview) {
    return productReview;
  }

  const storedCategory = String(storedReview.category ?? "").trim();
  const productCategory = String(productReview.category ?? "").trim();
  const storedConfidence = Number(storedReview.confidence ?? 0);
  const productConfidence = Number(productReview.confidence ?? 0);

  return {
    category: storedCategory || productCategory,
    confidence: productConfidence > 0 ? productConfidence : storedConfidence,
  };
}

export default function CreatorPage() {
  const { currentUser, isLoading, error } = useCurrentUser();
  const [controller, setController] = useState<ControllerOption>("jv");
  const [fabrics, setFabrics] = useState<FabricOption[]>([]);
  const [shippingProfiles, setShippingProfiles] = useState<ShippingProfileOption[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [selectedFabricId, setSelectedFabricId] = useState<string>("");
  const [state, setState] = useState<UploadState>("idle");
  const [isLoadingFabrics, setIsLoadingFabrics] = useState(false);
  const [isRefreshingFabrics, setIsRefreshingFabrics] = useState(false);
  const [message, setMessage] = useState("Выберите fabric и нажмите «Выставить».");
  const [issues, setIssues] = useState<string[]>([]);
  const [processId, setProcessId] = useState<string>("");
  const [processState, setProcessState] = useState<string>("IDLE");
  const [products, setProducts] = useState<Record<string, unknown>[]>([]);
  const [aiCategoryByIndex, setAiCategoryByIndex] = useState<Record<number, AiCategoryReview>>({});
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>("categories");
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
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [priceFrom, setPriceFrom] = useState("");
  const [priceTo, setPriceTo] = useState("");
  const [errorFilter, setErrorFilter] = useState<"all" | "with_errors" | "only_success">("all");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [copiedSkuIndex, setCopiedSkuIndex] = useState<number | null>(null);
  const [copiedRuntimeField, setCopiedRuntimeField] = useState<string | null>(null);
  const [runtimeCopyErrorField, setRuntimeCopyErrorField] = useState<string | null>(null);
  const [tableStatusPhase, setTableStatusPhase] = useState<"pending" | "processing" | "result">("pending");
  const [selectedCategoryRowIndexes, setSelectedCategoryRowIndexes] = useState<number[]>([]);
  const [bulkCategoryValue, setBulkCategoryValue] = useState("");
  const [confirmedCategoryRowIndexes, setConfirmedCategoryRowIndexes] = useState<number[]>([]);
  const [taskProgress, setTaskProgress] = useState<TaskProgress>({ total: 0, completed: 0, percent: 0 });
  const [realtimeMode, setRealtimeMode] = useState<"websocket" | "polling">("websocket");

  function setUiMessage(nextMessage: string) {
    setMessage(sanitizeUiMessage(nextMessage));
  }

  function isItemProgressStep(step: string) {
    return step.startsWith("ai_enrichment") || step === "building_category_preview";
  }

  function applyFrontendDraft(parsed: PrepareStatusResponse, options?: { preserveWorkflowStep?: boolean }) {
    const frontendDraft = asRecord((parsed as Record<string, unknown>)?.frontend_draft);
    if (Object.keys(frontendDraft).length === 0) return;

    const storedSelectedIndex = Number(frontendDraft.selectedIndex ?? 0);
    const storedWorkflowStep = String(frontendDraft.workflowStep ?? "");
    const storedAiCategoryByIndex = asRecord(frontendDraft.aiCategoryByIndex) as Record<number, AiCategoryReview>;
    const storedConfirmedRows = Array.isArray(frontendDraft.confirmedCategoryRowIndexes)
      ? (frontendDraft.confirmedCategoryRowIndexes as number[])
      : [];
    const storedOttoErrors = Array.isArray(frontendDraft.ottoErrors)
      ? (frontendDraft.ottoErrors as OttoErrorRow[])
      : [];
    const storedSummary = asRecord(frontendDraft.ottoSummary);

    setSelectedIndex(Number.isFinite(storedSelectedIndex) ? storedSelectedIndex : 0);
    if (!options?.preserveWorkflowStep && (storedWorkflowStep === "categories" || storedWorkflowStep === "details")) {
      setWorkflowStep(storedWorkflowStep);
    }
    if (Object.keys(storedAiCategoryByIndex).length > 0) {
      setAiCategoryByIndex(storedAiCategoryByIndex);
    }
    setConfirmedCategoryRowIndexes(storedConfirmedRows);
    setTableStatusPhase(
      frontendDraft.tableStatusPhase === "processing" || frontendDraft.tableStatusPhase === "result"
        ? frontendDraft.tableStatusPhase
        : "pending",
    );
    setLastSubmitTotal(Number(frontendDraft.lastSubmitTotal ?? 0));
    setOttoProcessId(String(frontendDraft.ottoProcessId ?? ""));
    setOttoErrors(storedOttoErrors);
    if (Object.keys(storedSummary).length > 0) {
      setOttoSummary({
        state: String(storedSummary.state ?? ""),
        total: Number(storedSummary.total ?? 0),
        progress: Number(storedSummary.progress ?? 0),
        succeeded: Number(storedSummary.succeeded ?? 0),
        failed: Number(storedSummary.failed ?? 0),
      });
    }
  }

  function applyProcessUpdate(parsed: PrepareStatusResponse) {
    const nextState = parsed?.process_state ?? "IN_PROGRESS";
    setProcessState(nextState);
    setIssues(Array.isArray(parsed?.issues) ? parsed.issues : []);
    setCurrentStep(String(parsed?.current_step ?? "in_progress"));
    setStepElapsed(Number(parsed?.step_elapsed_sec ?? 0));
    setHeartbeatLag(Number(parsed?.heartbeat_lag_sec ?? 0));
    setStuckMessage(parsed?.stuck ? String(parsed?.stuck_message ?? "Процесс завис") : "");
    setTaskProgress({
      total: Number((parsed as Record<string, unknown>)?.progress_total ?? 0),
      completed: Number((parsed as Record<string, unknown>)?.progress_completed ?? 0),
      percent: Number((parsed as Record<string, unknown>)?.progress_percent ?? 0),
    });

    const currentStepName = String(parsed?.current_step ?? "");
    if ((nextState === "DONE" || nextState === "FAILED") && (currentStepName === "otto_create_done" || currentStepName === "availability_done" || currentStepName === "otto_create_failed")) {
      const update = asRecord(parsed?.otto_update_result);
      const failed = asRecord(parsed?.otto_failed_result);
      const failedCount = Number(update.failed ?? 0);
      const succeededCount = Number(update.succeeded ?? 0);
      const ottoPid = String(parsed?.otto_process_id ?? "");
      const availabilityErrors = Array.isArray(parsed?.availability_errors) ? parsed.availability_errors : [];
      setOttoProcessId(ottoPid);
      setOttoSummary({
        state: String(update.state ?? parsed?.otto_create_state ?? ""),
        total: Number(update.total ?? parsed?.products_count ?? 0),
        progress: Number(update.progress ?? 0),
        succeeded: succeededCount,
        failed: failedCount,
      });

      const resultErrors = Array.isArray(failed.results) ? failed.results : [];
      const ottoErrorRows: OttoErrorRow[] = resultErrors.flatMap((entry) => {
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
      const nextErrors = availabilityErrors.length > 0 ? availabilityErrors : ottoErrorRows;
      setOttoErrors(nextErrors);
      setTableStatusPhase("result");

      if (nextState === "FAILED" || failedCount > 0 || nextErrors.length > 0) {
        setState("error");
        setIssues(nextErrors.length > 0 ? nextErrors.map((item) => `${item.variation}: ${item.code}`) : (Array.isArray(parsed?.issues) ? parsed.issues : [`OTTO process ${ottoPid || "-"} failed`]));
        setUiMessage(currentStepName === "availability_done" ? "Availability завершен с ошибками." : "Загрузка завершена с ошибками.");
        return;
      }

      setState("success");
      setIssues([]);
      setUiMessage(`Загружено товаров: ${parsed?.products_count ?? succeededCount}. Availability отправлен.`);
      return;
    }

    if (nextState === "DONE") {
      const rows = Array.isArray(parsed?.products) ? parsed.products : [];
      setProducts(rows);
      if (currentStepName === "ai_enrichment_done") {
        applyFrontendDraft(parsed, { preserveWorkflowStep: true });
        setState("success");
        setSelectedIndex((current) => (current >= 0 && current < rows.length ? current : 0));
        setWorkflowStep("details");
        setTableStatusPhase("pending");
        setUiMessage("AI-атрибуты и описания готовы. Проверьте товары перед финальной отправкой.");
        return;
      }

      applyFrontendDraft(parsed);
      setAiCategoryByIndex(
        Object.fromEntries(
          rows.map((product, index) => {
            const record = asRecord(product);
            return [
              index,
              readAiCategoryReview(record),
            ];
          }),
        ),
      );
      if (!asRecord((parsed as Record<string, unknown>)?.frontend_draft).aiCategoryByIndex) {
        setSelectedIndex(0);
        setConfirmedCategoryRowIndexes([]);
        setWorkflowStep("categories");
        setTableStatusPhase("pending");
      }
      setState("success");
      setUiMessage(`Подготовка завершена: source=${parsed?.source_items ?? 0}, mapped=${parsed?.mapped_items ?? 0}, payload=${parsed?.payload_items ?? rows.length}.`);
    }
    if (nextState === "FAILED") {
      setState("error");
      const failedStep = String(parsed?.current_step ?? "");
      if (parsed?.stuck && (failedStep === "prepare_queued" || failedStep === "ai_enrichment_queued" || failedStep === "otto_create_queued")) {
        setProcessState("IN_PROGRESS");
        setState("loading");
        setRealtimeMode("polling");
        setUiMessage("Процесс ожидает worker. Продолжаю проверять статус...");
        return;
      }
      setUiMessage(failedStep.startsWith("ai_enrichment") ? "Генерация товаров завершилась с ошибкой." : "Подготовка завершилась с ошибкой.");
    }
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
      setState((draft.state as UploadState) ?? "idle");
      setUiMessage(String(draft.message ?? "Выберите fabric и нажмите «Выставить»."));
      setIssues(Array.isArray(draft.issues) ? (draft.issues as string[]) : []);
      setProcessId(String(draft.processId ?? ""));
      setProcessState(String(draft.processState ?? "IDLE"));
      setWorkflowStep((draft.workflowStep as WorkflowStep) ?? "categories");
      setCurrentStep(String(draft.currentStep ?? "prepare_initializing"));
      setStepElapsed(Number(draft.stepElapsed ?? 0));
      setHeartbeatLag(Number(draft.heartbeatLag ?? 0));
      setStuckMessage(String(draft.stuckMessage ?? ""));
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
      state,
      message,
      issues,
      processId,
      processState,
      workflowStep,
      currentStep,
      stepElapsed,
      heartbeatLag,
      stuckMessage,
    };
    try {
      window.localStorage.setItem(CREATOR_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // ignore storage failures and continue without browser draft persistence
    }
  }, [
    hydratedDraft,
    controller,
    selectedFabricId,
    state,
    message,
    issues,
    processId,
    processState,
    workflowStep,
    currentStep,
    stepElapsed,
    heartbeatLag,
    stuckMessage,
  ]);

  useEffect(() => {
    if (!hydratedDraft || !processId || products.length > 0) return;
    let active = true;

    async function restorePersistedTask() {
      try {
        const response = await fetch(`/api/products/create-from-fabric/${encodeURIComponent(processId)}`, {
          method: "GET",
          cache: "no-store",
        });
        const parsed = await readJsonResponse<PrepareStatusResponse>(response);
        if (!active || !response.ok || !parsed || parsed.success === false) return;
        applyProcessUpdate(parsed);
      } catch {
        // ignore restore failures and keep current draft state
      }
    }

    void restorePersistedTask();
    return () => {
      active = false;
    };
  }, [hydratedDraft, processId, products.length]);

  useEffect(() => {
    if (!hydratedDraft || !processId || products.length === 0) return;
    if (currentStep.startsWith("ai_enrichment") && currentStep !== "ai_enrichment_done" && currentStep !== "ai_enrichment_failed") {
      return;
    }
    const timer = window.setTimeout(() => {
      void fetch(`/api/products/create-from-fabric/${encodeURIComponent(processId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          products,
          current_step: currentStep,
          frontend_draft: {
            aiCategoryByIndex,
            selectedIndex,
            workflowStep,
            confirmedCategoryRowIndexes,
            ottoProcessId,
            ottoSummary,
            ottoErrors,
            lastSubmitTotal,
            tableStatusPhase,
          },
        }),
        cache: "no-store",
      }).catch(() => {
        // keep working locally if draft sync fails temporarily
      });
    }, 900);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    hydratedDraft,
    processId,
    products,
    currentStep,
    aiCategoryByIndex,
    selectedIndex,
    workflowStep,
    confirmedCategoryRowIndexes,
    ottoProcessId,
    ottoSummary,
    ottoErrors,
    lastSubmitTotal,
    tableStatusPhase,
  ]);

  async function loadFabrics(options?: { silent?: boolean }) {
    const silent = Boolean(options?.silent);
    if (!silent) setIsLoadingFabrics(true);
    try {
      const response = await fetch(`/api/products/fabrics?controller=${encodeURIComponent(controller)}`, { method: "GET", cache: "no-store" });
      const parsed = await readJsonResponse<FabricListResponse>(response);
      if (!response.ok) {
        setFabrics([]);
        setSelectedFabricId("");
        setUiMessage(readApiErrorMessage(parsed, "Не удалось загрузить fabrics", response.status));
        return;
      }
      const items = Array.isArray(parsed?.factory) ? parsed.factory : [];
      setFabrics(items);
      setSelectedFabricId((prev) => (prev && items.some((item) => item.id === prev) ? prev : (items[0]?.id ?? "")));
      setMessage((prev) =>
        prev.includes("Ошибка загрузки списка fabrics")
          ? "Выберите fabric и нажмите «Выставить»."
          : prev,
      );
    } catch {
      setFabrics([]);
      setSelectedFabricId("");
      setUiMessage("Ошибка загрузки списка fabrics.");
    } finally {
      if (!silent) setIsLoadingFabrics(false);
    }
  }

  useEffect(() => {
    void loadFabrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller]);

  async function refreshFabrics() {
    setIsRefreshingFabrics(true);
    setUiMessage("Обновляю factories: очищаю таблицу и загружаю заново...");
    try {
      const response = await fetch("/api/products/fabrics/refresh", {
        method: "POST",
        cache: "no-store",
      });
      const parsed = await readJsonResponse<unknown>(response);
      if (!response.ok) {
        setUiMessage(readApiErrorMessage(parsed, "Не удалось обновить factories", response.status));
        return;
      }
      await loadFabrics({ silent: true });
      setUiMessage("Список fabrics обновлен.");
    } catch (caughtError) {
      setUiMessage(caughtError instanceof Error ? `Ошибка обновления fabrics: ${caughtError.message}` : "Ошибка обновления fabrics.");
    } finally {
      setIsRefreshingFabrics(false);
    }
  }

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
          return;
        }
        const items = parseShippingProfiles(parsed);
        setShippingProfiles(items);
      } catch {
        if (!active) return;
        setShippingProfiles([]);
      }
    }
    void loadShippingProfiles();
    return () => { active = false; };
  }, [controller]);

  useEffect(() => {
    let active = true;
    async function loadCategories() {
      try {
        const response = await fetch("/api/products/available-categories", {
          method: "GET",
          cache: "no-store",
        });
        const parsed = await readJsonResponse<CategoryListResponse>(response);
        if (!active || !response.ok) return;
        setAvailableCategories(
          Array.isArray(parsed?.items)
            ? parsed.items.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
            : [],
        );
      } catch {
        if (!active) return;
        setAvailableCategories([]);
      }
    }
    void loadCategories();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (shippingProfiles.length === 0 || products.length === 0) return;
    const defaultProfileId = shippingProfiles[0]?.id ?? "";
    if (!defaultProfileId) return;
    setProducts((prev) =>
      prev.map((raw) => {
        const product = asRecord(raw);
        if (productShippingProfileId(product)) return product;
        return { ...product, shippingProfileID: defaultProfileId };
      }),
    );
  }, [shippingProfiles, products.length]);

  useEffect(() => {
    if (!processId || processState !== "IN_PROGRESS" || realtimeMode !== "polling") return;
    const timer = setInterval(async () => {
      const response = await fetch(`/api/products/create-from-fabric/${processId}`, { method: "GET", cache: "no-store" });
      const parsed = await readJsonResponse<PrepareStatusResponse>(response);
      if (!response.ok || !parsed || parsed?.success === false) return;
      applyProcessUpdate(parsed);
    }, 1800);
    return () => clearInterval(timer);
  }, [processId, processState, realtimeMode]);

  useEffect(() => {
    if (!processId || processState !== "IN_PROGRESS" || typeof window === "undefined") return;
    setRealtimeMode("websocket");
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/v1/products/tasks/create-from-factory/${encodeURIComponent(processId)}/ws`;
    let closedByTerminalState = false;
    let socket: WebSocket | null = null;
    try {
      socket = new WebSocket(wsUrl);
      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(String(event.data ?? "")) as PrepareStatusResponse;
          if (parsed?.success === false) return;
          applyProcessUpdate(parsed);
          const nextState = parsed?.process_state ?? "IN_PROGRESS";
          if (nextState === "DONE" || nextState === "FAILED") {
            closedByTerminalState = true;
          }
        } catch {
          // ignore malformed realtime payloads and keep fallback available
        }
      };
      socket.onerror = () => {
        setRealtimeMode("polling");
      };
      socket.onclose = () => {
        if (!closedByTerminalState && processState === "IN_PROGRESS") {
          setRealtimeMode("polling");
        }
      };
    } catch {
      setRealtimeMode("polling");
    }

    return () => {
      if (socket && socket.readyState === WebSocket.OPEN) socket.close();
    };
  }, [processId, processState]);

  const rows = useMemo(() => products.map((product, index) => {
    const description = asRecord(product.productDescription);
    const pricing = asRecord(product.pricing);
    const standardPrice = asRecord(pricing.standardPrice);
    const profileId = productShippingProfileId(asRecord(product));
    const profileName = shippingProfiles.find((item) => item.id === profileId)?.name ?? "";
    const rowErrors = ottoErrors.filter((error) => error.variation === String(product.sku ?? "")).length;
    const rowStatus =
      tableStatusPhase === "pending"
        ? "pending"
        : tableStatusPhase === "processing"
          ? "processing"
          : rowErrors > 0
            ? "failed"
            : "passed";
    const title = String(
      product.Artikelbeschreibung ??
      product.TranslatedDescription ??
      description.productLine ??
      product.productReference ??
      product.sku ??
      `Товар ${index + 1}`,
    );
    const aiReview = mergeAiCategoryReview(
      aiCategoryByIndex[index],
      asRecord(product),
    );
    const aiCategory = String(aiReview.category ?? "");
    const aiConfidence = Number(aiReview.confidence ?? 0);
    return {
      index,
      image: firstImage(product),
      title,
      sku: String(product.sku ?? ""),
      aiCategory,
      aiConfidence,
      selectedCategory: String(description.category ?? ""),
      shippingProfileId: profileId,
      shippingProfileName: profileName,
      ean: String(product.ean ?? ""),
      productReference: String(product.productReference ?? ""),
      price: String(standardPrice.amount ?? ""),
      productLine: String(description.productLine ?? ""),
      errors: rowErrors,
      status: rowStatus as "passed" | "failed" | "processing" | "pending",
    };
  }), [products, aiCategoryByIndex, ottoErrors, tableStatusPhase, shippingProfiles]);

  const categories = useMemo(
    () => Array.from(new Set(rows.map((row) => row.selectedCategory || row.aiCategory).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const query = tableQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (categoryFilter !== "all" && row.selectedCategory !== categoryFilter && row.aiCategory !== categoryFilter) return false;
      if (!query) return true;
      return [row.sku, row.aiCategory, row.selectedCategory, row.title, row.productReference, row.productLine, row.ean]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [rows, tableQuery, categoryFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const paginationItems = buildPagination(safePage, totalPages);
  const selectedCategoryIndexSet = useMemo(() => new Set(selectedCategoryRowIndexes), [selectedCategoryRowIndexes]);
  const confirmedCategoryIndexSet = useMemo(() => new Set(confirmedCategoryRowIndexes), [confirmedCategoryRowIndexes]);
  const allFilteredRowsSelected = filteredRows.length > 0 && filteredRows.every((row) => selectedCategoryIndexSet.has(row.index));
  const missingCategoryCount = rows.filter((row) => !row.selectedCategory.trim()).length;
  const isCategoryStage = workflowStep === "categories" && products.length > 0;
  const selectedConfirmableCount = useMemo(
    () =>
      selectedCategoryRowIndexes.filter((index) => {
        const row = rows.find((item) => item.index === index);
        return Boolean(row?.selectedCategory.trim());
      }).length,
    [rows, selectedCategoryRowIndexes],
  );
  const categoryRowStatuses = useMemo<Record<number, CategoryReviewStatus>>(
    () =>
      Object.fromEntries(
        rows.map((row) => {
          const manuallyChanged = row.selectedCategory.trim() !== row.aiCategory.trim();
          const isConfirmed = confirmedCategoryIndexSet.has(row.index);
          const status: CategoryReviewStatus = manuallyChanged
            ? isConfirmed
              ? "manually_confirmed"
              : "manually_changed"
            : isConfirmed
              ? "confirmed"
              : "requires_review";
          return [row.index, status];
        }),
      ),
    [rows, confirmedCategoryIndexSet],
  );
  const categoryKpis = useMemo(() => {
    let confirmed = 0;
    let requiresReview = 0;
    let manuallyChanged = 0;
    for (const row of rows) {
      const status = categoryRowStatuses[row.index];
      if (status === "confirmed" || status === "manually_confirmed") confirmed += 1;
      if (status === "manually_changed") manuallyChanged += 1;
      if (status === "requires_review") requiresReview += 1;
    }
    return {
      total: rows.length,
      confirmed,
      requiresReview,
      manuallyChanged,
    };
  }, [rows, categoryRowStatuses]);

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
    const failedProducts = errorCardsBySku.length;
    const candidate = Math.max(summaryFailed, failedProducts, 0);
    return Math.min(kpiTotal, candidate);
  }, [ottoSummary?.failed, errorCardsBySku.length, kpiTotal]);
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

  async function copyText(value: string, field: string) {
    if (!value || value === "-") {
      setRuntimeCopyErrorField(field);
      window.setTimeout(() => setRuntimeCopyErrorField((current) => (current === field ? null : current)), 1200);
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopiedRuntimeField(field);
      setRuntimeCopyErrorField(null);
      window.setTimeout(() => setCopiedRuntimeField((current) => (current === field ? null : current)), 1600);
    } catch {
      setRuntimeCopyErrorField(field);
      window.setTimeout(() => setRuntimeCopyErrorField((current) => (current === field ? null : current)), 1200);
    }
  }

  function updateSelected(path: string[], value: string) {
    setProducts((prev) => {
      const next = [...prev];
      next[selectedIndex] = updateProductField(asRecord(next[selectedIndex]), path, value);
      return next;
    });
  }

  function updateRowShippingProfile(rowIndex: number, profileId: string) {
    setProducts((prev) => {
      const next = [...prev];
      next[rowIndex] = { ...asRecord(next[rowIndex]), shippingProfileID: profileId };
      return next;
    });
  }

  function updateRowCategory(rowIndex: number, category: string) {
    setProducts((prev) => {
      const next = [...prev];
      const current = asRecord(next[rowIndex]);
      next[rowIndex] = updateProductField(current, ["productDescription", "category"], category);
      return next;
    });
    setConfirmedCategoryRowIndexes((prev) => prev.filter((item) => item !== rowIndex));
  }

  function toggleCategorySelection(rowIndex: number) {
    setSelectedCategoryRowIndexes((prev) =>
      prev.includes(rowIndex) ? prev.filter((item) => item !== rowIndex) : [...prev, rowIndex],
    );
  }

  function toggleAllFilteredRows() {
    setSelectedCategoryRowIndexes((prev) => {
      if (allFilteredRowsSelected) {
        return prev.filter((item) => !filteredRows.some((row) => row.index === item));
      }
      const next = new Set(prev);
      for (const row of filteredRows) next.add(row.index);
      return Array.from(next).sort((a, b) => a - b);
    });
  }

  function applyBulkCategory() {
    if (!bulkCategoryValue || selectedCategoryRowIndexes.length === 0) return;
    const selectedSet = new Set(selectedCategoryRowIndexes);
    setProducts((prev) =>
      prev.map((item, index) =>
        selectedSet.has(index)
          ? updateProductField(asRecord(item), ["productDescription", "category"], bulkCategoryValue)
          : item,
      ),
    );
    setConfirmedCategoryRowIndexes((prev) => prev.filter((item) => !selectedSet.has(item)));
    setUiMessage(`Категория применена к ${selectedCategoryRowIndexes.length} товарам.`);
  }

  function confirmCategoryRows(rowIndexes: number[]) {
    if (rowIndexes.length === 0) return;
    const eligible = rowIndexes.filter((index) => {
      const row = rows.find((item) => item.index === index);
      if (!row) return false;
      return row.selectedCategory.trim().length > 0;
    });
    if (eligible.length === 0) return;
    setConfirmedCategoryRowIndexes((prev) => Array.from(new Set([...prev, ...eligible])).sort((a, b) => a - b));
    setUiMessage(`Подтверждено категорий: ${eligible.length}.`);
  }

  function unconfirmCategoryRows(rowIndexes: number[]) {
    if (rowIndexes.length === 0) return;
    const confirmedIndexes = rowIndexes.filter((index) => confirmedCategoryIndexSet.has(index));
    if (confirmedIndexes.length === 0) return;
    const confirmedSet = new Set(confirmedIndexes);
    setConfirmedCategoryRowIndexes((prev) => prev.filter((item) => !confirmedSet.has(item)));
    setUiMessage(`Снято подтверждение с категорий: ${confirmedIndexes.length}.`);
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
    setAiCategoryByIndex({});
    setProcessId("");
    setWorkflowStep("categories");
    setCurrentStep("prepare_initializing");
    setStepElapsed(0);
    setHeartbeatLag(0);
    setStuckMessage("");
    setOttoProcessId("");
    setOttoSummary(null);
    setOttoErrors([]);
    setTableStatusPhase("pending");
    setLastSubmitTotal(0);
    setConfirmedCategoryRowIndexes([]);
    setTaskProgress({ total: 0, completed: 0, percent: 0 });
    setRealtimeMode("websocket");
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

  async function confirmCategories() {
    if (!processId || products.length === 0) return;
    if (missingCategoryCount > 0) {
      setState("error");
      setUiMessage("Укажите категорию для всех товаров перед переходом к следующему шагу.");
      return;
    }
    if (categoryKpis.requiresReview > 0) {
      setState("error");
      setUiMessage("Подтвердите все неотмеченные категории или измените их вручную перед созданием товаров.");
      return;
    }
    setState("loading");
    setUiMessage("Категории подтверждены. Запускаю создание товаров и AI-генерацию...");
    try {
      const response = await fetch(`/api/products/create-from-fabric/${processId}/enrich`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          products,
          controller,
          factory_id: selectedFabricId,
        }),
        cache: "no-store",
      });
      const parsed = await readJsonResponse<EnrichPreparedResponse>(response);
      if (!response.ok || parsed?.success === false) {
        setState("error");
        setUiMessage(readApiErrorMessage(parsed, "Не удалось сгенерировать детали товаров", response.status));
        return;
      }
      setProcessState("IN_PROGRESS");
      setCurrentStep("ai_enrichment_queued");
      setTaskProgress({ total: products.length, completed: 0, percent: 0 });
      setRealtimeMode("websocket");
      setUiMessage("Создание товаров запущено. Дожидаюсь генерации атрибутов, описаний и bullet points...");
    } catch (caughtError) {
      setState("error");
      setUiMessage(caughtError instanceof Error ? `Ошибка запроса: ${caughtError.message}` : "Ошибка запроса");
    }
  }

  async function submitEditedProducts() {
    if (!processId || products.length === 0) return;
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
      if (parsed?.queued) {
        setProcessState(parsed?.process_state ?? "IN_PROGRESS");
        setCurrentStep("otto_create_queued");
        setTaskProgress({ total: products.length, completed: 0, percent: 0 });
        setRealtimeMode("websocket");
        setUiMessage("Загрузка в OTTO запущена. Дожидаюсь live-результата...");
        return;
      }
      const update = asRecord(parsed?.otto_update_result);
      const failed = asRecord(parsed?.otto_failed_result);
      const failedCount = Number(update.failed ?? 0);
      const succeededCount = Number(update.succeeded ?? 0);
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
      if (succeededCount < products.length) {
        setState("error");
        setIssues([`Создано меньше товаров, чем ожидалось: ${succeededCount} из ${products.length}`]);
        setUiMessage("Availability не запущен: не все товары подтверждены как созданные.");
        return;
      }

      setUiMessage(`Товары созданы. Отправляю availability партиями по ${AVAILABILITY_CONCURRENCY}...`);
      const availabilityResults = await runWithConcurrency(
        products,
        AVAILABILITY_CONCURRENCY,
        async (product) => {
          const record = asRecord(product);
          const sku = String(record.sku ?? "").trim();
          const shippingProfileID = productShippingProfileId(record);
          if (!sku) {
            throw new Error("missing sku");
          }
          if (!shippingProfileID) {
            throw new Error("missing shipping profile");
          }
          const availabilityResponse = await fetch("/api/products/create-availability", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              sku,
              quantity: "20",
              shippingProfileID,
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
        },
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

  async function handleClear() {
    const staleProcessId = processId;
    window.localStorage.removeItem(CREATOR_DRAFT_KEY);
    setState("idle");
    setUiMessage("Состояние очищено.");
    setIssues([]);
    setProcessId("");
    setProcessState("IDLE");
    setProducts([]);
    setAiCategoryByIndex({});
    setSelectedIndex(0);
    setWorkflowStep("categories");
    setCurrentStep("prepare_initializing");
    setStepElapsed(0);
    setHeartbeatLag(0);
    setStuckMessage("");
    setOttoProcessId("");
    setOttoSummary(null);
    setOttoErrors([]);
    setTableStatusPhase("pending");
    setLastSubmitTotal(0);
    setConfirmedCategoryRowIndexes([]);
    setTaskProgress({ total: 0, completed: 0, percent: 0 });
    setRealtimeMode("websocket");
    setSelectedFabricId((prev) =>
      prev && fabrics.some((item) => item.id === prev) ? prev : (fabrics[0]?.id ?? ""),
    );
    if (staleProcessId) {
      await fetch(`/api/products/create-from-fabric/${encodeURIComponent(staleProcessId)}`, {
        method: "DELETE",
        cache: "no-store",
      }).catch(() => {
        // Client-side reset is still useful if the backend task was already gone.
      });
    }
  }

  if (isLoading) {
    return <PageLoadingShell contentMode="form" />;
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
      <div className={`creator-workspace creator-ref-workspace ${isCategoryStage ? "is-category-stage" : ""}`}>
        {error ? <p className="helper-banner">{error}</p> : null}
        <section className={`creator-ref-top-grid ${isCategoryStage ? "is-category-stage" : ""}`}>
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
              <button
                type="button"
                className="creator-ref-refresh-btn"
                onClick={() => void refreshFabrics()}
                disabled={state === "loading" || isLoadingFabrics || isRefreshingFabrics}
                title="Обновить список фабрик"
                aria-label="Обновить список фабрик"
              >
                <RefreshCw size={14} className={isRefreshingFabrics ? "spin" : ""} />
                {isRefreshingFabrics ? "Обновляю..." : "Обновить"}
              </button>
            </div>
            <div className="creator-ref-launch-actions">
              <Button className="creator-ref-launch-btn" size="lg" type="button" onClick={handleCreate} disabled={state === "loading" || !selectedFabricId}>
                {state === "loading" ? "Запуск..." : "Выставить товары"}
              </Button>
              <Button className="creator-ref-reset-btn" variant="secondary" size="lg" type="button" onClick={() => void handleClear()} disabled={!processId && state === "idle" && products.length === 0}>
                Сбросить
              </Button>
            </div>
            <div className={`creator-ref-inline-alert ${state === "error" ? "is-error" : state === "success" ? "is-success" : "is-info"}`}>
              <span className="creator-ref-inline-alert-icon" aria-hidden="true">
                {state === "error" ? <AlertCircle size={16} /> : state === "success" ? <Check size={16} /> : "i"}
              </span>
              <p>{message}</p>
            </div>
          </article>

          <article className="creator-ref-card creator-ref-card-main">
            <div className="creator-ref-main-head">
              <h2>{isCategoryStage ? "Проверка категорий" : "Последняя загрузка"}</h2>
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
            <div className={`creator-ref-metrics ${isCategoryStage ? "is-category-kpi" : ""}`}>
              {isCategoryStage ? (
                <>
                  <Card className="metric neutral">
                    <span className="metric-icon"><Box size={18} /></span>
                    <small>Всего</small>
                    <strong>{categoryKpis.total}</strong>
                  </Card>
                  <Card className="metric success">
                    <span className="metric-icon"><Check size={18} /></span>
                    <small>Подтверждено</small>
                    <strong>{categoryKpis.confirmed}</strong>
                  </Card>
                  <Card className="metric warning">
                    <span className="metric-icon"><AlertCircle size={18} /></span>
                    <small>Требуют проверки</small>
                    <strong>{categoryKpis.requiresReview}</strong>
                  </Card>
                  <Card className="metric error">
                    <span className="metric-icon"><RefreshCw size={18} /></span>
                    <small>Изменено вручную</small>
                    <strong>{categoryKpis.manuallyChanged}</strong>
                  </Card>
                </>
              ) : (
                <>
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
                </>
              )}
            </div>
            {processState === "IN_PROGRESS" ? (
              <div className="creator-ref-progress">
                <div className="creator-ref-progress-head">
                  <strong>{currentStep === "ai_enrichment_in_progress" || currentStep === "ai_enrichment_queued" ? "Создание товаров через AI" : "Подготовка данных"}</strong>
                  <span>
                    {isItemProgressStep(currentStep) && taskProgress.total > 0
                      ? `${Math.min(taskProgress.completed, taskProgress.total)} / ${taskProgress.total}`
                      : `${Math.max(0, Math.round(taskProgress.percent))}%`}
                  </span>
                </div>
                <div className="creator-ref-progress-track" aria-hidden="true">
                  <span style={{ width: `${Math.max(0, Math.min(100, Math.round(taskProgress.percent || 0)))}%` }} />
                </div>
                <p>{realtimeMode === "websocket" ? "Live updates через WebSocket" : "Live updates через polling fallback"}</p>
              </div>
            ) : null}
            <div className="creator-ref-runtime">
              <div className="creator-ref-runtime-row">
                <span>Otto Process ID</span>
                <code>{ottoProcessId || "-"}</code>
                <button
                  type="button"
                  className={`creator-runtime-copy-btn ${
                    copiedRuntimeField === "otto_process_id"
                      ? "is-copied"
                      : runtimeCopyErrorField === "otto_process_id"
                        ? "is-error"
                        : ""
                  }`}
                  onClick={() => void copyText(ottoProcessId || "-", "otto_process_id")}
                  disabled={!ottoProcessId}
                >
                  {copiedRuntimeField === "otto_process_id" ? <Check size={14} /> : <Copy size={14} />}
                  <span>
                    {copiedRuntimeField === "otto_process_id"
                      ? "Скопировано"
                      : runtimeCopyErrorField === "otto_process_id"
                        ? "Ошибка"
                        : "Копировать"}
                  </span>
                </button>
              </div>
              <div className="creator-ref-runtime-row">
                <span>Process ID</span>
                <code>{processId || "-"}</code>
                <button
                  type="button"
                  className={`creator-runtime-copy-btn ${
                    copiedRuntimeField === "process_id"
                      ? "is-copied"
                      : runtimeCopyErrorField === "process_id"
                        ? "is-error"
                        : ""
                  }`}
                  onClick={() => void copyText(processId || "-", "process_id")}
                  disabled={!processId}
                >
                  {copiedRuntimeField === "process_id" ? <Check size={14} /> : <Copy size={14} />}
                  <span>
                    {copiedRuntimeField === "process_id"
                      ? "Скопировано"
                      : runtimeCopyErrorField === "process_id"
                        ? "Ошибка"
                        : "Копировать"}
                  </span>
                </button>
              </div>
              <p>Шаг: <strong>{currentStep}</strong> · <strong>{Math.max(0, Math.round(stepElapsed))}s</strong></p>
              {stuckMessage ? <p className="helper-banner error">{stuckMessage}</p> : null}
            </div>
          </article>

          {!isCategoryStage ? (
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
          ) : null}
        </section>

        {isCategoryStage ? (
        <section className="creator-ref-main-grid creator-ref-main-grid-category">
          <Card className="creator-category-card">
            <div className="creator-category-head">
              <div className="creator-category-intro">
                <h2>Подтвердите категории</h2>
              </div>
            </div>

            <div className="creator-category-toolbar">
              <div className="creator-category-toolbar-summary">
                <p>Категории</p>
                <span>{selectedCategoryRowIndexes.length > 0 ? `Выбрано: ${selectedCategoryRowIndexes.length}` : "Массовое изменение"}</span>
              </div>
              <div className="creator-category-bulk">
                <select value={bulkCategoryValue} onChange={(event) => setBulkCategoryValue(event.target.value)} disabled={availableCategories.length === 0}>
                  <option value="">{availableCategories.length === 0 ? "Нет категорий" : "Категория для выбранных"}</option>
                  {availableCategories.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <button className="secondary-btn" type="button" onClick={applyBulkCategory} disabled={!bulkCategoryValue || selectedCategoryRowIndexes.length === 0}>
                  Применить
                </button>
                <button
                  className="secondary-btn"
                  type="button"
                  onClick={() => confirmCategoryRows(selectedCategoryRowIndexes)}
                  disabled={selectedConfirmableCount === 0}
                >
                  {selectedConfirmableCount > 0
                    ? `Подтвердить (${selectedConfirmableCount})`
                    : "Подтвердить"}
                </button>
              </div>
              <div className="creator-category-toolbar-actions">
                <div className="creator-category-toolbar-search">
                  <div className="creator-search-wrap">
                    <Search size={16} className="creator-search-icon" />
                    <input
                      className="creator-search-input"
                      placeholder="Поиск по названию, EAN"
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
                      <Funnel size={16} color="currentColor" fill={isFilterOpen ? "#111111" : "#ffffff"} />
                      Фильтр
                    </button>
                    {isFilterOpen ? (
                      <div className="creator-table-popover">
                        <p>Категория</p>
                        <select value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setPage(1); }}>
                          <option value="all">Все категории</option>
                          {availableCategories.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                      </div>
                    ) : null}
                  </div>
                </div>
                <button className="secondary-btn creator-category-reset-btn" type="button" onClick={handleClear}>
                  <Trash2 size={14} aria-hidden="true" />
                  Начать заново
                </button>
                <button className="primary-btn creator-category-submit-btn" type="button" onClick={confirmCategories} disabled={state === "loading" || filteredRows.length === 0 || missingCategoryCount > 0 || categoryKpis.requiresReview > 0}>
                  Создать товары
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>
            </div>

            {pagedRows.length === 0 ? (
              <div className="creator-products-empty">
                <Package size={28} />
                <strong>Нет товаров</strong>
                <p>Выберите Fabric и запустите подготовку товаров.</p>
              </div>
            ) : (
              <div className="creator-ref-table-scroll">
                <table className="creator-ref-table">
                  <thead>
                    <tr>
                      <th>
                        <input type="checkbox" checked={allFilteredRowsSelected} onChange={toggleAllFilteredRows} aria-label="Выбрать все товары" />
                      </th>
                      <th>Preview</th>
                      <th>Товар</th>
                      <th>AI Категория</th>
                      <th>Уверенность</th>
                      <th>Проверка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((row) => {
                      const isSelected = selectedCategoryIndexSet.has(row.index);
                      const reviewStatus = categoryRowStatuses[row.index];
                      const confidenceColorClass =
                        row.aiConfidence >= 95
                          ? "high"
                          : row.aiConfidence >= 80
                            ? "medium"
                            : "low";
                      return (
                        <tr
                          key={row.index}
                          className={selectedIndex === row.index ? "is-selected" : ""}
                          onClick={() => setSelectedIndex(row.index)}
                        >
                          <td data-label="Выбор" onClick={(event) => event.stopPropagation()}>
                            <label className="creator-category-checkbox">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleCategorySelection(row.index)}
                                aria-label={`Выбрать товар ${row.title || row.ean || row.sku || row.index}`}
                              />
                            </label>
                          </td>
                          <td data-label="Preview">
                            {row.image ? (
                              <img className="creator-ref-thumb" src={row.image} alt={row.title || row.sku || `product-${row.index}`} />
                            ) : (
                              <span className="creator-ref-thumb creator-ref-thumb-empty">-</span>
                            )}
                          </td>
                          <td data-label="Товар">
                            <div className="creator-category-title-cell">
                              <span>{`EAN: ${row.ean || "-"}`}</span>
                              <strong>{row.title || "-"}</strong>
                            </div>
                          </td>
                          <td data-label="AI Категория">
                            <div className="creator-category-select-cell">
                              <select
                                value={row.selectedCategory || ""}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => updateRowCategory(row.index, event.target.value)}
                                disabled={state === "loading" || availableCategories.length === 0}
                              >
                                <option value="">{availableCategories.length === 0 ? "Нет категорий" : "Выберите категорию"}</option>
                                {availableCategories.map((item) => <option key={item} value={item}>{item}</option>)}
                              </select>
                              <span className="creator-category-ai-hint">{`AI: ${row.aiCategory || "Не определена"}`}</span>
                            </div>
                          </td>
                          <td data-label="Уверенность">
                            <div className={`creator-confidence ${confidenceColorClass}`}>
                              <strong>{`${Math.max(0, Math.min(100, Math.round(row.aiConfidence || 0)))}%`}</strong>
                              <div className="creator-confidence-track" aria-hidden="true">
                                <span style={{ width: `${Math.max(0, Math.min(100, Math.round(row.aiConfidence || 0)))}%` }} />
                              </div>
                            </div>
                          </td>
                          <td data-label="Проверка">
                            <div className="creator-category-review-inline" onClick={(event) => event.stopPropagation()}>
                              <div className={`creator-category-status ${reviewStatus}`}>
                                {reviewStatus === "confirmed" ? (
                                  <CheckCircle2 size={16} aria-hidden="true" />
                                ) : reviewStatus === "manually_confirmed" ? (
                                  <Pencil size={16} aria-hidden="true" />
                                ) : reviewStatus === "manually_changed" ? (
                                  <Pencil size={16} aria-hidden="true" />
                                ) : (
                                  <TriangleAlert size={16} aria-hidden="true" />
                                )}
                                <span>
                                  {reviewStatus === "confirmed"
                                    ? "Подтверждено"
                                    : reviewStatus === "manually_confirmed"
                                      ? "Подтверждено вручную"
                                      : reviewStatus === "manually_changed"
                                        ? "Изменено вручную"
                                        : "Требует проверки"}
                                </span>
                              </div>
                              <button
                                className="secondary-btn"
                                type="button"
                                onClick={() => (
                                  reviewStatus === "confirmed" || reviewStatus === "manually_confirmed"
                                    ? unconfirmCategoryRows([row.index])
                                    : confirmCategoryRows([row.index])
                                )}
                              >
                                {reviewStatus === "confirmed" || reviewStatus === "manually_confirmed"
                                  ? "Отменить подтверждение"
                                  : "Подтвердить"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
        </section>
        ) : null}

        {workflowStep === "details" ? (
        <section className="creator-ref-main-grid creator-ref-main-grid-details">
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
              </aside>

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
                        <Funnel
                          size={16}
                          color="currentColor"
                          fill={isFilterOpen ? "#111111" : "#ffffff"}
                        />
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
                    <div className="creator-products-head-actions">
                      <button className="secondary-btn" type="button" onClick={handleClear}>Очистить</button>
                      <button className="primary-btn" type="button" onClick={submitEditedProducts}>Загрузить</button>
                    </div>
                  </div>
                </div>

                <div className="creator-products-grid-head">
                  <span>Preview</span>
                  <span>SKU</span>
                  <span>Delivery Profile</span>
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
                      <span className="creator-products-preview" data-label="Preview">
                        {row.image ? (
                          <img className="creator-ref-thumb" src={row.image} alt={row.sku || `product-${row.index}`} />
                        ) : (
                          <span className="creator-ref-thumb creator-ref-thumb-empty">-</span>
                        )}
                      </span>
                      <span className="creator-products-sku" data-label="SKU">
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
                      <span className="creator-products-delivery" data-label="Delivery Profile" title={row.shippingProfileName || "-"}>
                        <select
                          value={row.shippingProfileId}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => updateRowShippingProfile(row.index, event.target.value)}
                          disabled={state === "loading" || shippingProfiles.length === 0}
                        >
                          {shippingProfiles.length === 0 ? <option value="">Нет профилей</option> : null}
                          {shippingProfiles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </select>
                      </span>
                      <span className="creator-products-price" data-label="Price">{row.price || "-"}</span>
                      <span className="creator-products-status" data-label="Status">
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
        </section>
        ) : null}
      </div>
    </AppWorkspaceShell>
  );
}
