"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, BriefcaseBusiness, Check, ChevronDown, IdCard, RefreshCw, Search, Sparkles } from "lucide-react";

import { readApiErrorMessage, readJsonResponse } from "../lib/api";
import { useCurrentUser } from "../hooks/use-current-user";
import { AppWorkspaceShell } from "../ui/app-workspace-shell";
import { PageLoadingShell } from "../ui/page-loading-shell";
import {
  UploadState,
  ControllerOption,
  FACTORY_SOURCE_CONTROLLER,
  CREATOR_DRAFT_KEY,
  AVAILABILITY_CONCURRENCY,
  AVAILABILITY_AFTER_CREATE_DELAY_MS,
  FabricOption,
  FabricListResponse,
  CategoryGroupCategoriesResponse,
  ShippingProfileOption,
  CreateFromFabricResponse,
  PrepareStatusResponse,
  SubmitPreparedResponse,
  EnrichPreparedResponse,
  AvailabilitySubmitResponse,
  OttoSummary,
  TaskProgress,
  OttoErrorRow,
  AiCategoryReview,
  CategoryReviewStatus,
  CategoryStatusFilter,
  CategorySortOption,
  ProductReviewStatus,
  ReviewQueueFilter,
  ReviewQueueSort,
  CategoryChangeEvent,
  CategoryCheckRow,
  ProductReviewRow,
  CategoryAttributeOption,
  CategoryAttributesResponse,
  ParsedSkuError,
  EditorTab,
  AttributeEditField,
  BulkAttributePatch,
  WorkflowStep,
  ProductVariantDraft,
  asRecord,
  ottoErrorsFromPayload,
  readTaskProductRows,
  mergeLiveProductRows,
  updateProductField,
  updateProductTitle,
  bulkUpsertProductAttributes,
  firstImage,
  buildPagination,
  normalizeSku,
  normalizeFieldToken,
  stableVariantImageRequestId,
  waitForGeneratedImage,
  runWithConcurrency,
  readProductVariants,
  patchVariantInProducts,
  syncLocalVariantsForProduct,
  expandedProductCount,
  collectVariantExportIssues,
  sanitizeUiMessage,
  readAttributeGroup,
  labelWithRu,
  attributeDisplayName,
  attributeAllowedValueLabel,
  immediateAttributeOption,
  mergeAttributeOption,
  isColorVariantAttribute,
  isColorAutofillAttribute,
  isMaterialVariantAttribute,
  attributeLayoutRank,
  attributeFieldLayout,
  attributeControlKind,
  parseShippingProfiles,
  productShippingProfileId,
  sleep,
  readAiCategoryReview,
  mergeAiCategoryReview,
  productAftercoolData,
  FabricHero,
  ProductUploadCard,
  CategoryReviewCard,
  ProductCategoriesCard,
  CategoryCheckToolbar,
  CategoryCheckBatchActions,
  BulkCategoryEditDrawer,
  CategoryCheckTable,
  CategoryEditDrawer,
  CategoryReviewModal,
  ProductReviewPage,
  productReviewCategory,
  ProductList,
  ProductReviewHeader,
  DiffViewer,
  ReviewTabs,
  AttributeCard,
  OverviewActionsMenu,
  AttributeEditor,
  materialValueForVariant,
  VariantManager,
  ErrorDrawer,
  StickyActionBar,
  useBulkAttributeEdit,
  BulkSelectionBar,
  BulkAttributeEditDrawer,
} from "./creator-support";

export default function CreatorPage() {
  const { currentUser, isLoading, error } = useCurrentUser();
  const controller: ControllerOption = FACTORY_SOURCE_CONTROLLER;
  const [fabrics, setFabrics] = useState<FabricOption[]>([]);
  const [shippingProfiles, setShippingProfiles] = useState<ShippingProfileOption[]>([]);
  const [categoryOptionsByGroup, setCategoryOptionsByGroup] = useState<Record<string, string[]>>({});
  const [selectedFabricId, setSelectedFabricId] = useState<string>("");
  const [fabricQuery, setFabricQuery] = useState("");
  const [fabricDropdownOpen, setFabricDropdownOpen] = useState(false);
  const [state, setState] = useState<UploadState>("idle");
  const [isLoadingFabrics, setIsLoadingFabrics] = useState(false);
  const [isRefreshingFabrics, setIsRefreshingFabrics] = useState(false);
  const [message, setMessage] = useState("Выберите папку и нажмите «Выставить».");
  const [issues, setIssues] = useState<string[]>([]);
  const [processId, setProcessId] = useState<string>("");
  const [processState, setProcessState] = useState<string>("IDLE");
  const [products, setProducts] = useState<Record<string, unknown>[]>([]);
  const [aiCategoryByIndex, setAiCategoryByIndex] = useState<Record<number, AiCategoryReview>>({});
  const [categoryDisplayByValue, setCategoryDisplayByValue] = useState<Record<string, string>>({});
  const [categoryGroupDisplayByValue, setCategoryGroupDisplayByValue] = useState<Record<string, string>>({});
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>("categories");
  const [currentStep, setCurrentStep] = useState<string>("prepare_initializing");
  const [stepElapsed, setStepElapsed] = useState<number>(0);
  const [heartbeatLag, setHeartbeatLag] = useState<number>(0);
  const [stuckMessage, setStuckMessage] = useState<string>("");
  const [hydratedDraft, setHydratedDraft] = useState(false);
  const [isRestoringProcess, setIsRestoringProcess] = useState(false);
  const [ottoProcessId, setOttoProcessId] = useState<string>("");
  const [ottoSummary, setOttoSummary] = useState<OttoSummary | null>(null);
  const [ottoErrors, setOttoErrors] = useState<OttoErrorRow[]>([]);
  const [lastSubmitTotal, setLastSubmitTotal] = useState(0);
  const [editorTab, setEditorTab] = useState<EditorTab>("general");
  const [editingOverviewField, setEditingOverviewField] = useState<string | null>(null);
  const [categoryAttributes, setCategoryAttributes] = useState<CategoryAttributeOption[]>([]);
  const [categoryAttributesByKey, setCategoryAttributesByKey] = useState<Record<string, CategoryAttributeOption[]>>({});
  const [isLoadingCategoryAttributes, setIsLoadingCategoryAttributes] = useState(false);
  const [categoryAttributesError, setCategoryAttributesError] = useState("");
  const [newAttributeName, setNewAttributeName] = useState("");
  const [newAttributeValue, setNewAttributeValue] = useState("");
  const [editingAttribute, setEditingAttribute] = useState<{ index: number; field: AttributeEditField } | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [tableQuery, setTableQuery] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryStatusFilter, setCategoryStatusFilter] = useState<CategoryStatusFilter>("all");
  const [categorySort, setCategorySort] = useState<CategorySortOption>("title");
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
  const [isBulkCategoryDrawerOpen, setIsBulkCategoryDrawerOpen] = useState(false);
  const [confirmedCategoryRowIndexes, setConfirmedCategoryRowIndexes] = useState<number[]>([]);
  const [skippedCategoryRowIndexes, setSkippedCategoryRowIndexes] = useState<number[]>([]);
  const [categoryChangeHistoryByIndex, setCategoryChangeHistoryByIndex] = useState<Record<number, CategoryChangeEvent[]>>({});
  const [categoryCommentsByIndex, setCategoryCommentsByIndex] = useState<Record<number, string>>({});
  const [editingCategoryIndex, setEditingCategoryIndex] = useState<number | null>(null);
  const [detailsCategoryIndex, setDetailsCategoryIndex] = useState<number | null>(null);
  const [approvedComparisonRowIndexes, setApprovedComparisonRowIndexes] = useState<number[]>([]);
  const [rejectedReviewRowIndexes, setRejectedReviewRowIndexes] = useState<number[]>([]);
  const [selectedReviewRowIndexes, setSelectedReviewRowIndexes] = useState<number[]>([]);
  const imageGenerationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [bulkModifiedRowIndexes, setBulkModifiedRowIndexes] = useState<number[]>([]);
  const [bulkToast, setBulkToast] = useState<{ message: string; error: boolean } | null>(null);
  const [reviewQueueFilter, setReviewQueueFilter] = useState<ReviewQueueFilter>("all");
  const [reviewCategoryFilter, setReviewCategoryFilter] = useState("all");
  const [reviewQueueSort, setReviewQueueSort] = useState<ReviewQueueSort>("upload");
  const [reviewSearchQuery, setReviewSearchQuery] = useState("");
  const [isErrorDrawerOpen, setIsErrorDrawerOpen] = useState(false);
  const [taskProgress, setTaskProgress] = useState<TaskProgress>({ total: 0, completed: 0, percent: 0 });
  const [dummyProgressPercent, setDummyProgressPercent] = useState(0);
  const [preparationCounts, setPreparationCounts] = useState({ source: 0, mapped: 0, payload: 0 });
  const [realtimeMode, setRealtimeMode] = useState<"websocket" | "polling">("websocket");
  const productsDraftSaveSkippedRef = useRef(false);
  const serverDraftRestoreAttemptedRef = useRef(false);
  const liveCategoryRowsCountRef = useRef(0);
  const taskProgressSnapshotRef = useRef({ step: "", completed: 0, percent: 0 });
  const reviewSearchRef = useRef<HTMLInputElement>(null);
  const fabricTriggerRef = useRef<HTMLButtonElement>(null);
  const fabricMenuRef = useRef<HTMLDivElement>(null);
  const fabricSearchRef = useRef<HTMLInputElement>(null);
  const fabricOptionRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const bulkAttributeEdit = useBulkAttributeEdit();
  const [fabricMenuStyle, setFabricMenuStyle] = useState<CSSProperties>({});
  const [highlightedFabricId, setHighlightedFabricId] = useState("");

  useEffect(() => {
    if (!bulkToast) return;
    const timer = window.setTimeout(() => setBulkToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [bulkToast]);

  useEffect(() => {
    if (processState === "DONE") {
      setDummyProgressPercent(100);
      return;
    }
    if (processState !== "IN_PROGRESS") return;

    const startedAt = Date.now();
    setDummyProgressPercent((current) => Math.max(1, Math.min(99, current)));

    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const progressWindowMs = 75_000;
      const ratio = Math.min(1, elapsed / progressWindowMs);
      const easedTarget = Math.floor(99 * (1 - Math.pow(1 - ratio, 3)));
      setDummyProgressPercent((current) => Math.min(99, Math.max(current, easedTarget)));
    }, 800);

    return () => window.clearInterval(timer);
  }, [processId, processState]);

  function setUiMessage(nextMessage: string) {
    setMessage(sanitizeUiMessage(nextMessage));
  }

  function progressTitle(step: string) {
    if (step === "building_category_preview") return "AI выбирает parent category";
    if (step === "saving_snapshot") return "Сохраняю готовые категории";
    if (step === "ai_enrichment_in_progress" || step === "ai_enrichment_queued") return "Создание товаров через AI";
    if (step === "otto_create_queued" || step === "otto_create_in_progress") return "Отправка в OTTO";
    if (step === "availability_in_progress") return "Отправка availability";
    return "Подготовка данных";
  }

  const displayProgressPercent = processState === "DONE"
    ? 100
    : processState === "IN_PROGRESS"
      ? dummyProgressPercent
      : Math.max(0, Math.min(100, Math.round(taskProgress.percent || 0)));

  function applyLegacyBrowserDraft(): boolean {
    try {
      const raw = window.localStorage.getItem(CREATOR_DRAFT_KEY);
      if (!raw) return false;
      const draft = JSON.parse(raw) as Record<string, unknown>;
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
      return true;
    } catch {
      return false;
    }
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
    const storedApprovedComparisonRows = Array.isArray(frontendDraft.approvedComparisonRowIndexes)
      ? (frontendDraft.approvedComparisonRowIndexes as number[])
      : [];
    const storedRejectedReviewRows = Array.isArray(frontendDraft.rejectedReviewRowIndexes)
      ? (frontendDraft.rejectedReviewRowIndexes as number[])
      : [];
    const storedBulkModifiedRows = Array.isArray(frontendDraft.bulkModifiedRowIndexes)
      ? (frontendDraft.bulkModifiedRowIndexes as number[])
      : [];
    const storedSkippedRows = Array.isArray(frontendDraft.skippedCategoryRowIndexes)
      ? (frontendDraft.skippedCategoryRowIndexes as number[])
      : [];
    const storedCategoryHistory = asRecord(frontendDraft.categoryChangeHistoryByIndex) as Record<number, CategoryChangeEvent[]>;
    const storedCategoryComments = asRecord(frontendDraft.categoryCommentsByIndex) as Record<number, string>;
    const storedOttoErrors = Array.isArray(frontendDraft.ottoErrors)
      ? (frontendDraft.ottoErrors as OttoErrorRow[])
      : [];
    const storedSummary = asRecord(frontendDraft.ottoSummary);

    setSelectedIndex(Number.isFinite(storedSelectedIndex) ? storedSelectedIndex : 0);
    if (!options?.preserveWorkflowStep && (storedWorkflowStep === "categories" || storedWorkflowStep === "compare" || storedWorkflowStep === "details")) {
      setWorkflowStep(storedWorkflowStep);
    }
    if (Object.keys(storedAiCategoryByIndex).length > 0) {
      setAiCategoryByIndex(storedAiCategoryByIndex);
    }
    setConfirmedCategoryRowIndexes(storedConfirmedRows);
    setSkippedCategoryRowIndexes(storedSkippedRows);
    setCategoryChangeHistoryByIndex(storedCategoryHistory);
    setCategoryCommentsByIndex(storedCategoryComments);
    setApprovedComparisonRowIndexes(storedApprovedComparisonRows);
    setRejectedReviewRowIndexes(storedRejectedReviewRows);
    setBulkModifiedRowIndexes(storedBulkModifiedRows);
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
    const currentStepName = String(parsed?.current_step ?? "in_progress");
    setCurrentStep(currentStepName);
    setStepElapsed(Number(parsed?.step_elapsed_sec ?? 0));
    setHeartbeatLag(Number(parsed?.heartbeat_lag_sec ?? 0));
    setStuckMessage(parsed?.stuck ? String(parsed?.stuck_message ?? "Процесс завис") : "");
    const nextProgress = {
      total: Number((parsed as Record<string, unknown>)?.progress_total ?? 0),
      completed: Number((parsed as Record<string, unknown>)?.progress_completed ?? 0),
      percent: Number((parsed as Record<string, unknown>)?.progress_percent ?? 0),
    };
    setTaskProgress((previous) => {
      const snapshot = taskProgressSnapshotRef.current;
      const sameStep = snapshot.step === currentStepName;
      const isTransientRollback = sameStep && nextProgress.percent < snapshot.percent && nextProgress.completed <= snapshot.completed;
      if (isTransientRollback) return previous;

      taskProgressSnapshotRef.current = {
        step: currentStepName,
        completed: nextProgress.completed,
        percent: nextProgress.percent,
      };
      return nextProgress;
    });
    setPreparationCounts({
      source: Number(parsed?.source_items ?? 0),
      mapped: Number(parsed?.mapped_items ?? 0),
      payload: Number(parsed?.payload_items ?? (Array.isArray(parsed?.products) ? parsed.products.length : 0)),
    });

    const liveRows = readTaskProductRows(parsed);
    if (liveRows.length > 0 && nextState === "IN_PROGRESS") {
      if (currentStepName === "building_category_preview" && liveRows.length < liveCategoryRowsCountRef.current) return;
      if (currentStepName === "building_category_preview") liveCategoryRowsCountRef.current = liveRows.length;
      const nextRows = currentStepName.startsWith("ai_enrichment")
        ? mergeLiveProductRows(liveRows, products)
        : liveRows.map((product) => asRecord(product));
      setProducts(nextRows);
      // Partial products are compacted and can move to another array index while
      // parallel normalization is still running. Rebuild the index-based review
      // map from the same snapshot so stale categories cannot follow old indexes.
      setAiCategoryByIndex(
        Object.fromEntries(
          nextRows.map((product, index) => [index, readAiCategoryReview(asRecord(product))]),
        ),
      );
    }

    if (nextState === "FAILED" && !currentStepName.startsWith("otto_create") && !currentStepName.startsWith("availability")) {
      const parsedIssues = Array.isArray(parsed?.issues) ? parsed.issues.map((item) => String(item)).filter(Boolean) : [];
      setState("error");
      setUiMessage(parsedIssues[0] || parsed?.stuck_message || "Подготовка товаров завершилась с ошибкой.");
      setWorkflowStep("categories");
      return;
    }

    if ((nextState === "DONE" || nextState === "FAILED") && (currentStepName === "otto_create_done" || currentStepName === "availability_done" || currentStepName === "otto_create_failed" || currentStepName === "final_validation_failed")) {
      if (liveRows.length > 0) {
        const restoredRows = liveRows.map((product) => asRecord(product));
        setProducts(restoredRows);
        applyFrontendDraft(parsed);
        setWorkflowStep("details");
      }
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

      const ottoErrorRows = ottoErrorsFromPayload(failed);
      const nextErrors = availabilityErrors.length > 0 ? (availabilityErrors as OttoErrorRow[]) : ottoErrorRows;
      setOttoErrors(nextErrors);
      setTableStatusPhase("result");

      if (nextState === "FAILED" || failedCount > 0 || nextErrors.length > 0) {
        setState("error");
        const parsedIssues = Array.isArray(parsed?.issues) ? parsed.issues.map((item) => String(item)) : [];
        setIssues(nextErrors.length > 0 ? nextErrors.map((item) => `${item.variation}: ${item.code}: ${item.title}`) : (parsedIssues.length > 0 ? parsedIssues : [`OTTO process ${ottoPid || "-"} failed`]));
        setUiMessage(currentStepName === "availability_done" ? "Availability завершен с ошибками." : "Загрузка завершена с ошибками.");
        return;
      }

      resetCreatorWorkspace("Успешно загружено.", "success");
      void clearBackendProcess(processId);
      return;
    }

    if (nextState === "DONE") {
      const rawRows = liveRows;
      const rows = currentStepName === "ai_enrichment_done"
        ? mergeLiveProductRows(rawRows, products)
        : rawRows.map((product) => asRecord(product));
      setProducts(rows);
      if (currentStepName === "ai_enrichment_done") {
        applyFrontendDraft(parsed, { preserveWorkflowStep: true });
        setState("success");
        setSelectedIndex((current) => (current >= 0 && current < rows.length ? current : 0));
        setWorkflowStep("compare");
        setTableStatusPhase("pending");
        setApprovedComparisonRowIndexes([]);
        setRejectedReviewRowIndexes([]);
        setSelectedReviewRowIndexes([]);
        setBulkModifiedRowIndexes([]);
        setUiMessage("AI-атрибуты и описания готовы. Сравните с Aftercool и approve-ните товары.");
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
        setSkippedCategoryRowIndexes([]);
        setCategoryChangeHistoryByIndex({});
        setCategoryCommentsByIndex({});
        setApprovedComparisonRowIndexes([]);
        setWorkflowStep("categories");
        setTableStatusPhase("pending");
      }
      setState("success");
      setUiMessage(`${parsed?.payload_items ?? rows.length} товаров готовы к проверке.`);
    }
    if (nextState === "FAILED") {
      if (liveRows.length > 0) {
        setProducts(liveRows);
        applyFrontendDraft(parsed);
        setWorkflowStep("details");
      }
      setState("error");
      const failedStep = String(parsed?.current_step ?? "");
      if (parsed?.stuck && (failedStep === "prepare_queued" || failedStep === "ai_enrichment_queued" || failedStep === "otto_create_queued")) {
        setProcessState("IN_PROGRESS");
        setState("loading");
        setRealtimeMode("polling");
        setUiMessage("Процесс ожидает worker. Продолжаю проверять статус...");
        return;
      }
      if (parsed?.stuck) {
        setUiMessage(String(parsed.stuck_message ?? "Процесс был остановлен или потерян. Запустите подготовку заново."));
        return;
      }
      setUiMessage(failedStep.startsWith("ai_enrichment") ? "Генерация товаров завершилась с ошибкой." : "Подготовка завершилась с ошибкой.");
    }
  }

  useEffect(() => {
    setHydratedDraft(true);
  }, []);

  useEffect(() => {
    if (!hydratedDraft || serverDraftRestoreAttemptedRef.current) return;
    serverDraftRestoreAttemptedRef.current = true;
    let active = true;
    setIsRestoringProcess(true);

    async function restoreLatestWorkspaceTask() {
      try {
        const response = await fetch("/api/products/create-from-fabric/latest", {
          method: "GET",
          cache: "no-store",
        });
        const parsed = await readJsonResponse<PrepareStatusResponse>(response);
        if (!active) return;
        if (!response.ok || !parsed || parsed.success === false || !parsed.process_id) {
          if (applyLegacyBrowserDraft()) {
            setUiMessage("Восстановлен старый browser draft. Дальше он будет сохранен в workspace.");
          }
          return;
        }

        setProcessId(String(parsed.process_id));
        setSelectedFabricId(String((parsed as Record<string, unknown>).factory_id ?? ""));
        applyProcessUpdate(parsed);
        window.localStorage.removeItem(CREATOR_DRAFT_KEY);
        setUiMessage("Восстановлен текущий процесс создания из workspace.");
      } catch {
        if (active && applyLegacyBrowserDraft()) {
          setUiMessage("Восстановлен старый browser draft. Дальше он будет сохранен в workspace.");
        }
      } finally {
        if (active) setIsRestoringProcess(false);
      }
    }

    void restoreLatestWorkspaceTask();
    return () => {
      active = false;
      setIsRestoringProcess(false);
    };
  }, [hydratedDraft]);

  useEffect(() => {
    if (!hydratedDraft || !processId || products.length > 0) return;
    let active = true;
    setIsRestoringProcess(true);

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
      } finally {
        if (active) setIsRestoringProcess(false);
      }
    }

    void restorePersistedTask();
    return () => {
      active = false;
      setIsRestoringProcess(false);
    };
  }, [hydratedDraft, processId, products.length]);

  useEffect(() => {
    if (!hydratedDraft || !processId || products.length === 0) return;
    const timer = window.setTimeout(() => {
      void fetch(`/api/products/create-from-fabric/${encodeURIComponent(processId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          frontend_draft: {
            aiCategoryByIndex,
            selectedIndex,
            workflowStep,
            confirmedCategoryRowIndexes,
            skippedCategoryRowIndexes,
            categoryChangeHistoryByIndex,
            categoryCommentsByIndex,
            approvedComparisonRowIndexes,
            rejectedReviewRowIndexes,
            bulkModifiedRowIndexes,
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
    }, 600);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    hydratedDraft,
    processId,
    aiCategoryByIndex,
    selectedIndex,
    workflowStep,
    confirmedCategoryRowIndexes,
    skippedCategoryRowIndexes,
    categoryChangeHistoryByIndex,
    categoryCommentsByIndex,
    approvedComparisonRowIndexes,
    rejectedReviewRowIndexes,
    bulkModifiedRowIndexes,
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
      const response = await fetch(`/api/products/fabrics?controller=${encodeURIComponent(FACTORY_SOURCE_CONTROLLER)}`, { method: "GET", cache: "no-store" });
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
  }, []);

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
    if (!processId || processState !== "IN_PROGRESS") return;
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch(`/api/products/create-from-fabric/${processId}`, { method: "GET", cache: "no-store" });
        const parsed = await readJsonResponse<PrepareStatusResponse>(response);
        if (!active || !response.ok || !parsed || parsed?.success === false) return;
        applyProcessUpdate(parsed);
      } catch {
        // WebSocket may still deliver updates; retry polling on the next interval.
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 1800);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [processId, processState]);

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

  const shippingProfileNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of shippingProfiles) map.set(item.id, item.name);
    return map;
  }, [shippingProfiles]);

  const errorCountByVariation = useMemo(() => {
    const map = new Map<string, number>();
    for (const error of ottoErrors) {
      const key = String(error.variation ?? "");
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [ottoErrors]);

  const rows = useMemo(() => products.map((product, index) => {
    const description = asRecord(product.productDescription);
    const pricing = asRecord(product.pricing);
    const standardPrice = asRecord(pricing.standardPrice);
    const profileId = productShippingProfileId(asRecord(product));
    const profileName = shippingProfileNameById.get(profileId) ?? "";
    const rowErrors = errorCountByVariation.get(String(product.sku ?? "")) ?? 0;
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
    const aiCategoryGroup = String(aiReview.categoryGroup ?? "");
    const confidence = Number(product.aiCategoryConfidence ?? product.categoryConfidence ?? (aiCategoryGroup ? 100 : 0));
    const sourceCategory = String(
      product.sourceCategory ??
      product.originalCategory ??
      product.Produktkategorie ??
      product.productCategory ??
      "",
    );
    return {
      index,
      image: firstImage(product),
      title,
      sku: String(product.sku ?? ""),
      sourceCategory,
      aiCategory,
      aiCategoryGroup,
      selectedCategory: String(description.category ?? ""),
      confidence: Number.isFinite(confidence) ? confidence : 0,
      shippingProfileId: profileId,
      shippingProfileName: profileName,
      ean: String(product.ean ?? ""),
      productReference: String(product.productReference ?? ""),
      price: String(standardPrice.amount ?? ""),
      productLine: String(description.productLine ?? ""),
      errors: rowErrors,
      status: rowStatus as "passed" | "failed" | "processing" | "pending",
    };
  }), [products, aiCategoryByIndex, errorCountByVariation, tableStatusPhase, shippingProfileNameById]);

  const categoryFilterOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => row.aiCategoryGroup.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  useEffect(() => {
    if (categoryFilter === "all") return;
    if (categoryFilterOptions.includes(categoryFilter)) return;
    setCategoryFilter("all");
    setPage(1);
  }, [categoryFilter, categoryFilterOptions]);

  const requestedCategoryGroups = useMemo(
    () => Array.from(new Set(rows.map((row) => row.aiCategoryGroup.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  useEffect(() => {
    const missingGroups = requestedCategoryGroups.filter((group) => !categoryOptionsByGroup[group]);
    if (missingGroups.length === 0) return;

    let active = true;
    async function loadCategoryGroupOptions() {
      const params = new URLSearchParams();
      for (const group of missingGroups) params.append("category_group", group);
      try {
        const response = await fetch(`/api/products/category-group-categories?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
        });
        const parsed = await readJsonResponse<CategoryGroupCategoriesResponse>(response);
        if (!active || !response.ok) return;
        const nextEntries: Record<string, string[]> = {};
        const nextDisplayByValue: Record<string, string> = {};
        const nextGroupDisplayByValue: Record<string, string> = {};
        const nextAttributesByKey: Record<string, CategoryAttributeOption[]> = {};
        const categoriesByGroupKey = new Map<string, string[]>();
        for (const item of Array.isArray(parsed?.items) ? parsed.items : []) {
          const group = String(item.categoryGroup ?? "").trim();
          if (!group) continue;
          nextGroupDisplayByValue[group] = String(item.displayCategoryGroup ?? "").trim() || labelWithRu(group, item.categoryGroupRu);
          nextAttributesByKey[categoryAttributesCacheKey("", group)] =
            Array.isArray(item.attributes) ? item.attributes.filter((attribute) => attribute.name) : [];
          const categories = Array.isArray(item.categories)
            ? item.categories.filter((category): category is string => typeof category === "string" && category.trim().length > 0)
            : [];
          const options = categories.length > 0 ? categories : [group];
          nextEntries[group] = options;
          categoriesByGroupKey.set(group.toLowerCase(), options);
          if (Array.isArray(item.categoriesDisplay)) {
            for (const displayItem of item.categoriesDisplay) {
              const value = String(displayItem.name ?? "").trim();
              const label = String(displayItem.displayName ?? "").trim() || labelWithRu(value, displayItem.nameRu);
              if (value && label) nextDisplayByValue[value] = label;
            }
          }
        }
        for (const group of missingGroups) {
          nextEntries[group] = categoriesByGroupKey.get(group.toLowerCase()) ?? [group];
        }
        setCategoryOptionsByGroup((prev) => ({ ...prev, ...nextEntries }));
        setCategoryDisplayByValue((prev) => ({ ...prev, ...nextDisplayByValue }));
        setCategoryGroupDisplayByValue((prev) => ({ ...prev, ...nextGroupDisplayByValue }));
        setCategoryAttributesByKey((prev) => ({ ...prev, ...nextAttributesByKey }));
      } catch {
        if (!active) return;
      }
    }
    void loadCategoryGroupOptions();
    return () => {
      active = false;
    };
  }, [requestedCategoryGroups, categoryOptionsByGroup]);

  const filteredRows = useMemo(() => {
    const query = tableQuery.trim().toLowerCase();
    const skippedSet = new Set(skippedCategoryRowIndexes);
    const confirmedSet = new Set(confirmedCategoryRowIndexes);
    const isCategoryMode = workflowStep === "categories";
    const filtered = rows.filter((row) => {
      if (categoryFilter !== "all" && row.aiCategoryGroup !== categoryFilter) return false;
      const manuallyChanged = row.selectedCategory.trim() !== row.aiCategory.trim();
      const status: CategoryReviewStatus = skippedSet.has(row.index)
        ? "skipped"
        : manuallyChanged
          ? confirmedSet.has(row.index)
            ? "manually_confirmed"
            : "manually_changed"
          : confirmedSet.has(row.index)
            ? "confirmed"
            : "requires_review";
      if (isCategoryMode) {
        if (categoryStatusFilter === "confirmed" && status !== "confirmed" && status !== "manually_confirmed") return false;
        if (categoryStatusFilter !== "all" && categoryStatusFilter !== "confirmed" && status !== categoryStatusFilter) return false;
      }
      if (!query) return true;
      return [row.sku, row.aiCategoryGroup, row.aiCategory, row.selectedCategory, row.title, row.productReference, row.productLine, row.ean, row.sourceCategory]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
    if (!isCategoryMode) return filtered;
    return [...filtered].sort((a, b) => {
      if (categorySort === "title") return a.title.localeCompare(b.title);
      const statusOrder: Record<CategoryReviewStatus, number> = {
        requires_review: 0,
        manually_changed: 1,
        skipped: 2,
        confirmed: 3,
        manually_confirmed: 3,
      };
      const statusFor = (row: CategoryCheckRow): CategoryReviewStatus => {
        const manuallyChanged = row.selectedCategory.trim() !== row.aiCategory.trim();
        if (skippedSet.has(row.index)) return "skipped";
        if (manuallyChanged) return confirmedSet.has(row.index) ? "manually_confirmed" : "manually_changed";
        return confirmedSet.has(row.index) ? "confirmed" : "requires_review";
      };
      return statusOrder[statusFor(a)] - statusOrder[statusFor(b)];
    });
  }, [
    rows,
    tableQuery,
    categoryFilter,
    workflowStep,
    skippedCategoryRowIndexes,
    confirmedCategoryRowIndexes,
    categoryStatusFilter,
    categorySort,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const paginationItems = buildPagination(safePage, totalPages);
  const selectedCategoryIndexSet = useMemo(() => new Set(selectedCategoryRowIndexes), [selectedCategoryRowIndexes]);
  const confirmedCategoryIndexSet = useMemo(() => new Set(confirmedCategoryRowIndexes), [confirmedCategoryRowIndexes]);
  const skippedCategoryIndexSet = useMemo(() => new Set(skippedCategoryRowIndexes), [skippedCategoryRowIndexes]);
  const rowByIndex = useMemo(() => {
    const map = new Map<number, (typeof rows)[number]>();
    for (const row of rows) map.set(row.index, row);
    return map;
  }, [rows]);
  const selectedCategoryGroups = useMemo(
    () =>
      Array.from(
        new Set(
          selectedCategoryRowIndexes
            .map((index) => rowByIndex.get(index)?.aiCategoryGroup.trim() ?? "")
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [rowByIndex, selectedCategoryRowIndexes],
  );
  const bulkCategoryOptions = useMemo(() => {
    if (selectedCategoryGroups.length !== 1) return [];
    return categoryOptionsByGroup[selectedCategoryGroups[0]] ?? [];
  }, [categoryOptionsByGroup, selectedCategoryGroups]);
  const allFilteredRowsSelected = filteredRows.length > 0 && filteredRows.every((row) => selectedCategoryIndexSet.has(row.index));
  const missingCategoryCount = rows.filter((row) => !skippedCategoryIndexSet.has(row.index) && !row.selectedCategory.trim()).length;
  const isEnrichmentLoading = processState === "IN_PROGRESS" && currentStep.startsWith("ai_enrichment");
  const isOttoSubmitLoading =
    processState === "IN_PROGRESS" &&
    (currentStep.startsWith("otto_create") || currentStep.startsWith("availability"));
  const isCategoryStage = !isEnrichmentLoading && !isOttoSubmitLoading && workflowStep === "categories";
  const selectedConfirmableCount = useMemo(
    () =>
      selectedCategoryRowIndexes.filter((index) => {
        const row = rowByIndex.get(index);
        return Boolean(row?.selectedCategory.trim()) && !skippedCategoryIndexSet.has(index);
      }).length,
    [rowByIndex, selectedCategoryRowIndexes, skippedCategoryIndexSet],
  );
  const categoryRowStatuses = useMemo<Record<number, CategoryReviewStatus>>(
    () =>
      Object.fromEntries(
        rows.map((row) => {
          if (skippedCategoryIndexSet.has(row.index)) {
            return [row.index, "skipped"];
          }
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
    [rows, confirmedCategoryIndexSet, skippedCategoryIndexSet],
  );
  const categoryKpis = useMemo(() => {
    let confirmed = 0;
    let requiresReview = 0;
    let manuallyChanged = 0;
    let skipped = 0;
    for (const row of rows) {
      const status = categoryRowStatuses[row.index];
      if (status === "confirmed" || status === "manually_confirmed") confirmed += 1;
      if (status === "manually_changed") manuallyChanged += 1;
      if (status === "requires_review") requiresReview += 1;
      if (status === "skipped") skipped += 1;
    }
    return {
      total: rows.length,
      confirmed,
      requiresReview,
      manuallyChanged,
      skipped,
    };
  }, [rows, categoryRowStatuses]);

  useEffect(() => {
    if (!bulkCategoryValue) return;
    if (!bulkCategoryOptions.includes(bulkCategoryValue)) {
      setBulkCategoryValue("");
    }
  }, [bulkCategoryOptions, bulkCategoryValue]);

  const selectedProduct = asRecord(products[selectedIndex]);
  const editingCategoryRow = editingCategoryIndex === null ? null : rowByIndex.get(editingCategoryIndex) ?? null;
  const detailsCategoryRow = detailsCategoryIndex === null ? null : rowByIndex.get(detailsCategoryIndex) ?? null;
  const detailsCategoryStatus = detailsCategoryIndex === null ? "requires_review" : categoryRowStatuses[detailsCategoryIndex] ?? "requires_review";
  const detailsCategoryPosition = detailsCategoryIndex === null ? -1 : filteredRows.findIndex((row) => row.index === detailsCategoryIndex);
  const navigateCategoryDetails = (position: number) => {
    const target = filteredRows[position];
    if (!target) return;
    setDetailsCategoryIndex(target.index);
    setSelectedIndex(target.index);
    setPage(Math.floor(position / pageSize) + 1);
  };
  const selectedAftercoolData = productAftercoolData(selectedProduct);
  const approvedComparisonIndexSet = useMemo(() => new Set(approvedComparisonRowIndexes), [approvedComparisonRowIndexes]);
  const rejectedReviewIndexSet = useMemo(() => new Set(rejectedReviewRowIndexes), [rejectedReviewRowIndexes]);
  const bulkModifiedIndexSet = useMemo(() => new Set(bulkModifiedRowIndexes), [bulkModifiedRowIndexes]);
  const comparisonApprovedCount = rows.filter((row) => approvedComparisonIndexSet.has(row.index)).length;
  const allComparisonsApproved = rows.length > 0 && comparisonApprovedCount === rows.length;
  const allReviewRows = useMemo<ProductReviewRow[]>(() => {
    return rows.map((row) => {
      const reviewStatus: ProductReviewStatus = rejectedReviewIndexSet.has(row.index)
        ? "rejected"
        : approvedComparisonIndexSet.has(row.index)
          ? "approved"
          : bulkModifiedIndexSet.has(row.index) || (categoryChangeHistoryByIndex[row.index]?.length ?? 0) > 0
            ? "modified"
            : "pending";
      return { ...row, reviewStatus };
    });
  }, [rows, rejectedReviewIndexSet, approvedComparisonIndexSet, bulkModifiedIndexSet, categoryChangeHistoryByIndex]);
  const reviewRows = useMemo<ProductReviewRow[]>(() => {
    const query = reviewSearchQuery.trim().toLowerCase();
    const statusRank = (row: ProductReviewRow) => {
      if (reviewQueueSort === "errors") return row.errors > 0 || row.reviewStatus === "rejected" ? 0 : 1;
      if (reviewQueueSort === "modified") return row.reviewStatus === "modified" ? 0 : 1;
      if (reviewQueueSort === "approved") return row.reviewStatus === "approved" ? 0 : 1;
      if (reviewQueueSort === "unreviewed") return row.reviewStatus === "pending" || row.reviewStatus === "modified" ? 0 : 1;
      return 0;
    };
    return [...allReviewRows]
      .filter((row) => {
        if (reviewQueueFilter === "errors") {
          if (row.errors <= 0 && row.reviewStatus !== "rejected") return false;
        } else if (reviewQueueFilter !== "all" && row.reviewStatus !== reviewQueueFilter) return false;
        if (reviewCategoryFilter !== "all" && productReviewCategory(row) !== reviewCategoryFilter) return false;
        if (!query) return true;
        return [row.sku, row.ean, row.title, row.productReference].join(" ").toLowerCase().includes(query);
      })
      .sort((left, right) => {
        if (reviewQueueSort === "title-asc") return left.title.localeCompare(right.title);
        if (reviewQueueSort === "title-desc") return right.title.localeCompare(left.title);
        if (reviewQueueSort === "sku") return left.sku.localeCompare(right.sku);
        const ranked = statusRank(left) - statusRank(right);
        return ranked || left.index - right.index;
      });
  }, [allReviewRows, reviewSearchQuery, reviewQueueFilter, reviewCategoryFilter, reviewQueueSort]);
  const selectedReviewStatus: ProductReviewStatus = rejectedReviewIndexSet.has(selectedIndex)
    ? "rejected"
    : approvedComparisonIndexSet.has(selectedIndex)
      ? "approved"
      : bulkModifiedIndexSet.has(selectedIndex) || (categoryChangeHistoryByIndex[selectedIndex]?.length ?? 0) > 0
        ? "modified"
        : "pending";
  const selectedReviewRowForRender = useMemo<ProductReviewRow | null>(() => {
    const row = rowByIndex.get(selectedIndex);
    return row ? { ...row, reviewStatus: selectedReviewStatus } : null;
  }, [rowByIndex, selectedIndex, selectedReviewStatus]);
  const selectedAttributeCategory = selectedReviewRowForRender?.selectedCategory || selectedReviewRowForRender?.aiCategory || "";
  const selectedAttributeCategoryGroup = selectedReviewRowForRender?.aiCategoryGroup || "";
  const selectedCategoryAttributesKey = categoryAttributesCacheKey(selectedAttributeCategory, selectedAttributeCategoryGroup);
  const selectedSku = normalizeSku(String(selectedProduct.sku ?? ""));
  const selectedShippingProfileId = productShippingProfileId(selectedProduct);
  const selectedDescription = asRecord(selectedProduct.productDescription);
  const selectedPricing = asRecord(selectedProduct.pricing);
  const selectedStandardPrice = asRecord(selectedPricing.standardPrice);
  const selectedCurrency = String(selectedStandardPrice.currency ?? selectedPricing.currency ?? "").trim();
  const selectedCurrencyLabel = selectedCurrency.toUpperCase() === "EUR" ? "€" : selectedCurrency;
  const selectedImage = firstImage(selectedProduct);
  const selectedBulletPoints = Array.isArray(selectedDescription.bulletPoints)
    ? selectedDescription.bulletPoints.map((item) => String(item))
    : [];
  const selectedAttributes = Array.isArray(selectedDescription.attributes)
    ? selectedDescription.attributes
    : [];

  function categoryAttributesCacheKey(category: string, categoryGroup: string) {
    const normalizedCategory = category.trim();
    if (normalizedCategory) return `category:${normalizedCategory.toLocaleLowerCase()}`;
    const group = categoryGroup.trim();
    return group ? `group:${group.toLocaleLowerCase()}` : "";
  }

  useEffect(() => {
    if (selectedIndex < 0 || selectedIndex >= products.length) return;
    const current = asRecord(products[selectedIndex]);
    if (Object.keys(current).length === 0) return;
    const synced = syncLocalVariantsForProduct(current, categoryAttributes);
    const currentVariants = JSON.stringify(current.variants ?? null);
    const syncedVariants = JSON.stringify(synced.variants ?? null);
    if (currentVariants === syncedVariants) return;
    const copy = [...products];
    copy[selectedIndex] = synced;
    setProducts(copy);
    persistProductsDraftNow(copy);
  }, [categoryAttributes, products, selectedIndex]);

  useEffect(() => {
    setEditingOverviewField(null);
  }, [selectedIndex]);
  const categoryAttributeByName = useMemo(() => {
    const map = new Map<string, CategoryAttributeOption>();
    for (const option of categoryAttributes) {
      for (const value of [option.id, option.attributeId, option.attributeKey, option.name, option.nameRu, option.displayName, attributeDisplayName(option)]) {
        const key = normalizeFieldToken(String(value ?? ""));
        if (key && !map.has(key)) map.set(key, option);
      }
    }
    return map;
  }, [categoryAttributes]);
  const attributeCards = useMemo(() => {
    return selectedAttributes.map((item, index) => {
      const attr = asRecord(item);
      const name = String(attr.name ?? "");
      const rawValues = Array.isArray(attr.values) ? attr.values.map((value) => String(value)) : [];
      const localOption = immediateAttributeOption(attr, name, rawValues);
      const attrId = String(attr.attribute_id ?? attr.attributeId ?? "").trim();
      const attrKey = String(attr.attribute_key ?? attr.attributeKey ?? "").trim();
      const loadedOption = categoryAttributeByName.get(normalizeFieldToken(attrId))
        ?? categoryAttributeByName.get(normalizeFieldToken(attrKey))
        ?? categoryAttributeByName.get(normalizeFieldToken(name));
      const option = loadedOption ? mergeAttributeOption(loadedOption, localOption) : localOption;
      const values = rawValues.join(", ");
      const variantKind: AttributeCard["variantKind"] = isColorVariantAttribute(name) ? "color" : isMaterialVariantAttribute(name) ? "material" : null;
      const displayValues = option
        ? rawValues.map((value) => attributeAllowedValueLabel(option, value) || value).join(", ")
        : values;
      return {
        index,
        name,
        displayName: option ? attributeDisplayName(option) : name,
        values,
        valueList: rawValues,
        displayValues,
        allowedValues: option?.allowedValues ?? [],
        multiValue: Boolean(option?.multiValue),
        variantKind,
        option,
        group: readAttributeGroup(name),
        layout: attributeFieldLayout(name),
        controlKind: attributeControlKind(name, values),
        sortRank: attributeLayoutRank(name),
      };
    });
  }, [selectedAttributes, categoryAttributeByName]);
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
  const invalidAttributeNames = useMemo(() => new Set(attributeCards
    .filter((attribute) => {
      const name = normalizeFieldToken(attribute.name);
      return name && selectedErrorFieldTokens.some((token) => token.includes(name) || name.includes(token));
    })
    .map((attribute) => normalizeFieldToken(attribute.name))), [attributeCards, selectedErrorFieldTokens]);
  const bulkAttributeOptions = useMemo(() => {
    const byIdentity = new Map<string, CategoryAttributeOption>();
    for (const option of categoryAttributes) {
      const identity = String(option.attributeId ?? option.id ?? option.attributeKey ?? normalizeFieldToken(option.name));
      if (option.name && identity) byIdentity.set(identity, option);
    }
    for (const productIndex of selectedReviewRowIndexes) {
      const description = asRecord(asRecord(products[productIndex]).productDescription);
      const attributes = Array.isArray(description.attributes) ? description.attributes : [];
      for (const item of attributes) {
        const attribute = asRecord(item);
        const name = String(attribute.name ?? "").trim();
        if (!name) continue;
        const attributeId = String(attribute.attribute_id ?? attribute.attributeId ?? "").trim() || undefined;
        const attributeKey = String(attribute.attribute_key ?? attribute.attributeKey ?? "").trim() || undefined;
        const identity = attributeId ?? attributeKey ?? normalizeFieldToken(name);
        if (!byIdentity.has(identity)) {
          byIdentity.set(identity, { name, attributeId, attributeKey, unit: String(attribute.unit ?? "").trim() || undefined });
        }
      }
    }
    const rank: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return Array.from(byIdentity.values()).sort((left, right) => {
      const priority = (rank[String(left.relevance ?? "LOW").toUpperCase()] ?? 3) - (rank[String(right.relevance ?? "LOW").toUpperCase()] ?? 3);
      return priority || left.name.localeCompare(right.name);
    });
  }, [categoryAttributes, products, selectedReviewRowIndexes]);
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
    setEditingAttribute(null);
    setEditingDraft("");
    setNewAttributeName("");
    setNewAttributeValue("");
  }, [selectedIndex]);

  useEffect(() => {
    if (workflowStep === "categories") {
      const cached = categoryAttributesByKey[selectedCategoryAttributesKey];
      if (cached) {
        setCategoryAttributes(cached);
        setCategoryAttributesError("");
        setIsLoadingCategoryAttributes(false);
      }
      return;
    }
    if (!selectedAttributeCategory && !selectedAttributeCategoryGroup) {
      setCategoryAttributes([]);
      setCategoryAttributesError("");
      setIsLoadingCategoryAttributes(false);
      return;
    }
    const cached = categoryAttributesByKey[selectedCategoryAttributesKey];
    if (cached) {
      setCategoryAttributes(cached);
      setCategoryAttributesError("");
      setIsLoadingCategoryAttributes(false);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams();
    if (selectedAttributeCategory) params.set("category", selectedAttributeCategory);
    else params.set("category_group", selectedAttributeCategoryGroup);
    setCategoryAttributes([]);
    setCategoryAttributesError("");
    setIsLoadingCategoryAttributes(true);

    async function loadCategoryAttributes() {
      try {
        const response = await fetch(`/api/products/category-attributes?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });
        const parsed = await readJsonResponse<CategoryAttributesResponse>(response);
        if (!response.ok) {
          throw new Error(
            readApiErrorMessage(
              parsed,
              "Не удалось загрузить атрибуты категории.",
              response.status,
            ),
          );
        }
        const items = Array.isArray(parsed?.items)
          ? parsed.items.filter((attribute) => attribute.name)
          : [];
        setCategoryAttributes(items);
        setCategoryAttributesByKey((previous) => ({
          ...previous,
          [selectedCategoryAttributesKey]: items,
        }));
      } catch (error) {
        if (controller.signal.aborted) return;
        setCategoryAttributesError(
          error instanceof Error ? error.message : "Не удалось загрузить атрибуты категории.",
        );
      } finally {
        if (!controller.signal.aborted) setIsLoadingCategoryAttributes(false);
      }
    }

    void loadCategoryAttributes();
    return () => controller.abort();
  }, [workflowStep, selectedAttributeCategory, selectedAttributeCategoryGroup, selectedCategoryAttributesKey, categoryAttributesByKey]);

  useEffect(() => {
    if (workflowStep === "categories") return;
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      const isTyping = tagName === "input" || tagName === "textarea" || tagName === "select" || target?.isContentEditable;
      if (event.ctrlKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        reviewSearchRef.current?.focus();
        return;
      }
      if (isTyping) return;
      if (event.key.toLowerCase() === "a") {
        event.preventDefault();
        approveReviewProduct(selectedIndex);
      }
      if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        rejectReviewProduct(selectedIndex);
      }
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveReviewDraft();
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((current) => {
          const currentPosition = reviewRows.findIndex((row) => row.index === current);
          if (currentPosition <= 0) return reviewRows[0]?.index ?? current;
          return reviewRows[currentPosition - 1].index;
        });
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((current) => {
          const currentPosition = reviewRows.findIndex((row) => row.index === current);
          if (currentPosition < 0) return reviewRows[0]?.index ?? current;
          return reviewRows[Math.min(reviewRows.length - 1, currentPosition + 1)]?.index ?? current;
        });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [workflowStep, selectedIndex, reviewRows, selectedReviewRowIndexes]);

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

  function persistProductsDraftNow(nextProducts: Record<string, unknown>[], options?: { force?: boolean }) {
    if (!hydratedDraft || !processId || nextProducts.length === 0) return;
    if (processState === "IN_PROGRESS" && !options?.force) return;
    productsDraftSaveSkippedRef.current = true;
    void saveProductsDraftNow(nextProducts).catch(() => {
      // Debounced autosave will retry later.
    });
  }

  async function saveProductsDraftNow(nextProducts: Record<string, unknown>[]) {
    if (!hydratedDraft || !processId || nextProducts.length === 0) return false;
    productsDraftSaveSkippedRef.current = true;
    const response = await fetch(`/api/products/create-from-fabric/${encodeURIComponent(processId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        products: nextProducts,
      }),
      cache: "no-store",
    });
    if (!response.ok) return false;
    return true;
  }

  async function saveFrontendDraftNow() {
    if (!hydratedDraft || !processId || products.length === 0) return false;
    const response = await fetch(`/api/products/create-from-fabric/${encodeURIComponent(processId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        frontend_draft: {
          aiCategoryByIndex,
          selectedIndex,
          workflowStep,
          confirmedCategoryRowIndexes,
          skippedCategoryRowIndexes,
          categoryChangeHistoryByIndex,
          categoryCommentsByIndex,
          approvedComparisonRowIndexes,
          rejectedReviewRowIndexes,
          bulkModifiedRowIndexes,
          ottoProcessId,
          ottoSummary,
          ottoErrors,
          lastSubmitTotal,
          tableStatusPhase,
        },
      }),
      cache: "no-store",
    });
    return response.ok;
  }

  function updateSelected(path: string[], value: string) {
    setProducts((prev) => {
      const next = [...prev];
      next[selectedIndex] = updateProductField(asRecord(next[selectedIndex]), path, value);
      return next;
    });
  }

  function updateSelectedTitle(value: string) {
    setProducts((prev) => {
      const next = [...prev];
      next[selectedIndex] = updateProductTitle(asRecord(next[selectedIndex]), value);
      return next;
    });
  }

  function updateBulletPoint(index: number, value: string) {
    setProducts((prev) => {
      const next = [...prev];
      const current = asRecord(next[selectedIndex]);
      const description = asRecord(current.productDescription);
      const bulletPoints = Array.isArray(description.bulletPoints)
        ? description.bulletPoints.map((item) => String(item))
        : [];
      bulletPoints[index] = value;
      next[selectedIndex] = updateProductField(current, ["productDescription", "bulletPoints"], bulletPoints);
      return next;
    });
  }

  function removeBulletPoint(index: number) {
    setProducts((prev) => {
      const next = [...prev];
      const current = asRecord(next[selectedIndex]);
      const description = asRecord(current.productDescription);
      const bulletPoints = Array.isArray(description.bulletPoints)
        ? description.bulletPoints.map((item) => String(item))
        : [];
      next[selectedIndex] = updateProductField(
        current,
        ["productDescription", "bulletPoints"],
        bulletPoints.filter((_, itemIndex) => itemIndex !== index),
      );
      return next;
    });
  }

  function addBulletPoint() {
    setProducts((prev) => {
      const next = [...prev];
      const current = asRecord(next[selectedIndex]);
      const description = asRecord(current.productDescription);
      const bulletPoints = Array.isArray(description.bulletPoints)
        ? description.bulletPoints.map((item) => String(item))
        : [];
      next[selectedIndex] = updateProductField(current, ["productDescription", "bulletPoints"], [...bulletPoints, ""]);
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
    setSkippedCategoryRowIndexes((prev) => prev.filter((item) => item !== rowIndex));
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
    if (!bulkCategoryOptions.includes(bulkCategoryValue)) return;
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
    setIsBulkCategoryDrawerOpen(false);
  }

  function confirmCategoryRows(rowIndexes: number[]) {
    if (rowIndexes.length === 0) return;
    const eligible = rowIndexes.filter((index) => {
      const row = rows.find((item) => item.index === index);
      if (!row) return false;
      return row.selectedCategory.trim().length > 0 && !skippedCategoryIndexSet.has(index);
    });
    if (eligible.length === 0) return;
    setConfirmedCategoryRowIndexes((prev) => Array.from(new Set([...prev, ...eligible])).sort((a, b) => a - b));
    setSelectedCategoryRowIndexes((prev) => prev.filter((item) => !eligible.includes(item)));
    setUiMessage(`Подтверждено категорий: ${eligible.length}.`);
  }

  function skipCategoryRows(rowIndexes: number[]) {
    if (rowIndexes.length === 0) return;
    setSkippedCategoryRowIndexes((prev) => Array.from(new Set([...prev, ...rowIndexes])).sort((a, b) => a - b));
    setConfirmedCategoryRowIndexes((prev) => prev.filter((item) => !rowIndexes.includes(item)));
    setSelectedCategoryRowIndexes((prev) => prev.filter((item) => !rowIndexes.includes(item)));
    setUiMessage(`Пропущено товаров: ${rowIndexes.length}.`);
  }

  function unconfirmCategoryRows(rowIndexes: number[]) {
    if (rowIndexes.length === 0) return;
    const confirmedIndexes = rowIndexes.filter((index) => confirmedCategoryIndexSet.has(index));
    if (confirmedIndexes.length === 0) return;
    const confirmedSet = new Set(confirmedIndexes);
    setConfirmedCategoryRowIndexes((prev) => prev.filter((item) => !confirmedSet.has(item)));
    setUiMessage(`Снято подтверждение с категорий: ${confirmedIndexes.length}.`);
  }

  function saveCategoryEdit(rowIndex: number, category: string, comment: string) {
    const row = rowByIndex.get(rowIndex);
    if (!row || !category.trim()) return;
    const previous = row.selectedCategory || row.aiCategory || "";
    updateRowCategory(rowIndex, category.trim());
    setCategoryCommentsByIndex((prev) => ({ ...prev, [rowIndex]: comment.trim() }));
    setCategoryChangeHistoryByIndex((prev) => ({
      ...prev,
      [rowIndex]: [
        ...(prev[rowIndex] ?? []),
        {
          at: new Date().toISOString(),
          by: currentUser?.email ?? "unknown",
          from: previous,
          to: category.trim(),
          comment: comment.trim() || undefined,
        },
      ],
    }));
    setEditingCategoryIndex(null);
    setUiMessage("Категория изменена. Подтвердите товар в таблице.");
  }

  function setComparisonApproved(rowIndex: number, approved: boolean) {
    setApprovedComparisonRowIndexes((prev) => {
      const next = new Set(prev);
      if (approved) next.add(rowIndex);
      else next.delete(rowIndex);
      return Array.from(next).sort((a, b) => a - b);
    });
    setProducts((prev) => {
      const next = [...prev];
      const product = asRecord(next[rowIndex]);
      const comparison = asRecord(product.aftercoolComparison);
      next[rowIndex] = {
        ...product,
        aftercoolComparison: {
          ...comparison,
          approved,
        },
      };
      return next;
    });
  }

  function approveReviewProduct(rowIndex: number) {
    if (rowIndex < 0 || rowIndex >= products.length) return;
    setRejectedReviewRowIndexes((prev) => prev.filter((item) => item !== rowIndex));
    setBulkModifiedRowIndexes((prev) => prev.filter((item) => item !== rowIndex));
    setComparisonApproved(rowIndex, true);
  }

  function rejectReviewProduct(rowIndex: number) {
    if (rowIndex < 0 || rowIndex >= products.length) return;
    setComparisonApproved(rowIndex, false);
    setRejectedReviewRowIndexes((prev) => Array.from(new Set([...prev, rowIndex])).sort((a, b) => a - b));
    setUiMessage("Товар помечен как rejected.");
  }

  async function saveReviewDraft() {
    const productsSaved = await saveProductsDraftNow(products);
    const frontendDraftSaved = await saveFrontendDraftNow();
    if (productsSaved && frontendDraftSaved) {
      setUiMessage("Draft сохранен в workspace и доступен с других устройств.");
      return;
    }
    setState("error");
    setUiMessage("Не удалось сохранить draft в workspace.");
  }

  function toggleReviewSelection(rowIndex: number) {
    setSelectedReviewRowIndexes((prev) =>
      prev.includes(rowIndex) ? prev.filter((item) => item !== rowIndex) : [...prev, rowIndex].sort((a, b) => a - b),
    );
  }

  function toggleAllVisibleReviewRows(indexes: number[], selected: boolean) {
    if (indexes.length === 0) return;
    setSelectedReviewRowIndexes((prev) => {
      if (selected) {
        const visible = new Set(indexes);
        return prev.filter((index) => !visible.has(index));
      }
      return Array.from(new Set([...prev, ...indexes])).sort((a, b) => a - b);
    });
  }

  function approveSelectedReviewProducts() {
    for (const index of selectedReviewRowIndexes) approveReviewProduct(index);
    setSelectedReviewRowIndexes([]);
  }

  function rejectSelectedReviewProducts() {
    for (const index of selectedReviewRowIndexes) rejectReviewProduct(index);
    setSelectedReviewRowIndexes([]);
  }

  function applyBulkAttributeChanges(attributes: BulkAttributePatch[]) {
    const result = bulkUpsertProductAttributes(products, selectedReviewRowIndexes, attributes);
    setProducts(result.products);
    if (result.updatedIndexes.length > 0) {
      setBulkModifiedRowIndexes((current) => Array.from(new Set([...current, ...result.updatedIndexes])).sort((left, right) => left - right));
      setRejectedReviewRowIndexes((current) => current.filter((index) => !result.updatedIndexes.includes(index)));
      setApprovedComparisonRowIndexes((current) => current.filter((index) => !result.updatedIndexes.includes(index)));
    }
    bulkAttributeEdit.reset();
    if (result.failures.length === 0) {
      const successMessage = `Updated ${result.updatedIndexes.length} products successfully.`;
      setUiMessage(successMessage);
      setBulkToast({ message: successMessage, error: false });
    } else {
      const details = result.failures.map((failure) => `#${failure.productIndex + 1}: ${failure.reason}`).join("; ");
      const partialMessage = `Updated ${result.updatedIndexes.length} of ${selectedReviewRowIndexes.length} products. ${result.failures.length} failed. ${details}`;
      setUiMessage(partialMessage);
      setBulkToast({ message: partialMessage, error: true });
    }
  }

  function fieldHasError(keywords: string[]): boolean {
    const lowered = keywords.map((item) => normalizeFieldToken(item));
    return selectedErrorFieldTokens.some((token) =>
      lowered.some((keyword) => token.includes(keyword) || keyword.includes(token)),
    );
  }

  function updateAttributeField(attributeIndex: number, field: AttributeEditField, nextValue: string) {
    const nextValues = nextValue
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    setProducts((prev) => {
      const copy = [...prev];
      const current = asRecord(copy[selectedIndex]);
      const desc = asRecord(current.productDescription);
      const attrs = Array.isArray(desc.attributes) ? [...desc.attributes] : [];
      const nextAttr = asRecord(attrs[attributeIndex]);
      attrs[attributeIndex] = {
        ...nextAttr,
        values: nextValues,
      };
      const editedName = String(nextAttr.name ?? "").trim();
      if (field === "values" && isColorVariantAttribute(editedName) && nextValues.length > 0) {
        const existingNames = new Set<string>();
        for (let index = 0; index < attrs.length; index += 1) {
          const attribute = asRecord(attrs[index]);
          const name = String(attribute.name ?? "").trim();
          existingNames.add(normalizeFieldToken(name));
          if (index === attributeIndex || !isColorAutofillAttribute(name)) continue;
          const currentValues = Array.isArray(attribute.values)
            ? attribute.values.map((value) => String(value).trim()).filter(Boolean)
            : [];
          if (currentValues.length === 0) attrs[index] = { ...attribute, values: nextValues };
        }
        for (const option of categoryAttributes) {
          if (!isColorAutofillAttribute(option.name)) continue;
          const key = normalizeFieldToken(option.name);
          if (existingNames.has(key)) continue;
          const allowedByValue = new Map(
            (option.allowedValues ?? []).map((value) => [normalizeFieldToken(value), value]),
          );
          const values = allowedByValue.size > 0
            ? nextValues.map((value) => allowedByValue.get(normalizeFieldToken(value))).filter((value): value is string => Boolean(value))
            : nextValues;
          if (values.length === 0) continue;
          attrs.push({
            name: option.name,
            values,
            additional: true,
            ...(option.unit ? { unit: option.unit } : {}),
          });
          existingNames.add(key);
        }
      }
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

  function saveAttributeEdit(attributeIndex?: number, value?: string) {
    if (typeof attributeIndex === "number") {
      updateAttributeField(attributeIndex, "values", value ?? "");
      setEditingAttribute(null);
      setEditingDraft("");
      return;
    }
    if (!editingAttribute) return;
    updateAttributeField(editingAttribute.index, editingAttribute.field, editingDraft);
    setEditingAttribute(null);
    setEditingDraft("");
  }

  function cancelAttributeEdit() {
    setEditingAttribute(null);
    setEditingDraft("");
  }

  function addAttribute() {
    const name = newAttributeName.trim();
    const values = newAttributeValue
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (!name || values.length === 0) return;
    const option = categoryAttributes.find((item) => item.name.toLowerCase() === name.toLowerCase()) ?? null;
    setProducts((prev) => {
      const copy = [...prev];
      const current = asRecord(copy[selectedIndex]);
      const desc = asRecord(current.productDescription);
      const attrs = Array.isArray(desc.attributes) ? [...desc.attributes] : [];
      attrs.push({
        name: option?.name ?? name,
        values,
        additional: true,
        ...(option?.unit ? { unit: option.unit } : {}),
      });
      copy[selectedIndex] = updateProductField(
        current,
        ["productDescription", "attributes"],
        attrs,
      );
      return copy;
    });
    setNewAttributeName("");
    setNewAttributeValue("");
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

  function patchSelectedVariant(combinationKey: string, patch: Partial<ProductVariantDraft>) {
    setProducts((previousProducts) => {
      const nextProducts = patchVariantInProducts(previousProducts, selectedIndex, combinationKey, patch);
      if (nextProducts === previousProducts) return previousProducts;
      persistProductsDraftNow(nextProducts, { force: true });
      return nextProducts;
    });
    setBulkModifiedRowIndexes((current) => Array.from(new Set([...current, selectedIndex])).sort((left, right) => left - right));
    setApprovedComparisonRowIndexes((current) => current.filter((index) => index !== selectedIndex));
  }

  function deleteSelectedVariant(combinationKey: string) {
    patchSelectedVariant(combinationKey, { active: false });
  }

  async function runVariantImageGeneration(combinationKey: string) {
    const currentProduct = asRecord(products[selectedIndex]);
    const variant = readProductVariants(currentProduct).find((item) => item.combinationKey === combinationKey);
    if (!variant) return;
    const requestId = stableVariantImageRequestId(selectedIndex, combinationKey);
    const recoverableImageUrl = `/generated-media/${requestId}.jpg`;
    patchSelectedVariant(combinationKey, {
      status: "generating_image",
      generationError: undefined,
    });
    try {
      const response = await fetch("/api/products/variant-image/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          combination: variant.combination,
          sourceImageUrl: firstImage(currentProduct),
          requestId,
        }),
        cache: "no-store",
      });
      const parsed = await readJsonResponse<{ imageUrl?: string; imagePath?: string }>(response);
      if (!response.ok || !parsed?.imageUrl) {
        throw new Error(readApiErrorMessage(parsed, "Image generation failed.", response.status));
      }
      const readyPatch = {
        imageUrl: parsed.imageUrl,
        mediaAssets: [{ type: "IMAGE", location: parsed.imageUrl }],
        status: "ready",
        generationError: undefined,
      } satisfies Partial<ProductVariantDraft>;
      patchSelectedVariant(combinationKey, readyPatch);
      await saveProductsDraftNow(patchVariantInProducts(products, selectedIndex, combinationKey, readyPatch));
    } catch (error) {
      const recovered = await waitForGeneratedImage(recoverableImageUrl);
      if (recovered) {
        const recoveredPatch = {
          imageUrl: recoverableImageUrl,
          mediaAssets: [{ type: "IMAGE", location: recoverableImageUrl }],
          status: "ready",
          generationError: undefined,
        } satisfies Partial<ProductVariantDraft>;
        patchSelectedVariant(combinationKey, recoveredPatch);
        await saveProductsDraftNow(patchVariantInProducts(products, selectedIndex, combinationKey, recoveredPatch));
        return;
      }
      const message = error instanceof Error && error.name === "AbortError"
        ? "Image generation request was interrupted. Try again."
        : error instanceof Error
          ? error.message
          : "Image generation failed.";
      patchSelectedVariant(combinationKey, {
        status: "failed",
        generationError: message,
      });
    }
  }

  function regenerateSelectedVariant(combinationKey: string) {
    imageGenerationQueueRef.current = imageGenerationQueueRef.current
      .catch(() => undefined)
      .then(() => runVariantImageGeneration(combinationKey));
    return imageGenerationQueueRef.current;
  }

  function resetCreatorWorkspace(nextMessage: string, nextState: UploadState = "idle") {
    window.localStorage.removeItem(CREATOR_DRAFT_KEY);
    setState(nextState);
    setUiMessage(nextMessage);
    setIssues([]);
    setProcessId("");
    setProcessState("IDLE");
    setProducts([]);
    productsDraftSaveSkippedRef.current = false;
    liveCategoryRowsCountRef.current = 0;
    taskProgressSnapshotRef.current = { step: "", completed: 0, percent: 0 };
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
    setSkippedCategoryRowIndexes([]);
    setCategoryChangeHistoryByIndex({});
    setCategoryCommentsByIndex({});
    setEditingCategoryIndex(null);
    setDetailsCategoryIndex(null);
    setApprovedComparisonRowIndexes([]);
    setRejectedReviewRowIndexes([]);
    setSelectedReviewRowIndexes([]);
    setBulkModifiedRowIndexes([]);
    setTaskProgress({ total: 0, completed: 0, percent: 0 });
    setDummyProgressPercent(0);
    setPreparationCounts({ source: 0, mapped: 0, payload: 0 });
    setRealtimeMode("websocket");
    setSelectedFabricId((prev) =>
      prev && fabrics.some((item) => item.id === prev) ? prev : (fabrics[0]?.id ?? ""),
    );
  }

  async function clearBackendProcess(processIdToClear: string) {
    if (!processIdToClear) return;
    await fetch(`/api/products/create-from-fabric/${encodeURIComponent(processIdToClear)}`, {
      method: "DELETE",
      cache: "no-store",
    }).catch(() => {
      // Client-side reset is still useful if the backend task was already gone.
    });
  }

  async function clearAllBackendProcesses() {
    await fetch("/api/products/create-from-fabric", {
      method: "DELETE",
      cache: "no-store",
    }).catch(() => {
      // Client-side reset is still useful if backend cleanup is temporarily unavailable.
    });
  }

  async function handleCreate() {
    if (!selectedFabricId) {
      setState("error");
      setUiMessage("Сначала выберите fabric.");
      return;
    }
    const runId = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setState("loading");
    setProcessState("IN_PROGRESS");
    setUiMessage("Процесс подготовки запущен...");
    setIssues([]);
    setProducts([]);
    productsDraftSaveSkippedRef.current = false;
    liveCategoryRowsCountRef.current = 0;
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
    setSkippedCategoryRowIndexes([]);
    setCategoryChangeHistoryByIndex({});
    setCategoryCommentsByIndex({});
    setEditingCategoryIndex(null);
    setDetailsCategoryIndex(null);
    setApprovedComparisonRowIndexes([]);
    setRejectedReviewRowIndexes([]);
    setSelectedReviewRowIndexes([]);
    setBulkModifiedRowIndexes([]);
    setTaskProgress({ total: 0, completed: 0, percent: 0 });
    setDummyProgressPercent(0);
    setPreparationCounts({ source: 0, mapped: 0, payload: 0 });
    setRealtimeMode("websocket");
    try {
      const response = await fetch("/api/products/create-from-fabric", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          controller,
          factory_id: selectedFabricId,
          run_id: runId,
        }),
        cache: "no-store",
      });
      const parsed = await readJsonResponse<CreateFromFabricResponse>(response);
      if (!response.ok || parsed?.success === false) {
        setState("error");
        setIssues(Array.isArray(parsed?.issues) ? parsed.issues : []);
        setUiMessage(readApiErrorMessage(parsed, "Не удалось запустить подготовку", response.status));
        return;
      }
      const nextProcessId = String(parsed?.process_id ?? runId).trim();
      if (!nextProcessId) {
        setState("error");
        setProcessState("FAILED");
        setUiMessage("Backend подтвердил запуск без process id. Невозможно отслеживать pipeline.");
        return;
      }
      setProcessId(nextProcessId);
      setUiMessage(`Запуск успешен. Process ID: ${nextProcessId}`);
    } catch (caughtError) {
      setState("error");
      setProcessState("FAILED");
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
    const skippedSet = new Set(skippedCategoryRowIndexes);
    const productsForEnrichment = products.filter((_, index) => !skippedSet.has(index));
    if (productsForEnrichment.length === 0) {
      setState("error");
      setUiMessage("Все товары пропущены. Нет товаров для создания.");
      return;
    }
    setState("loading");
    setUiMessage("Категории подтверждены. Запускаю создание товаров и AI-генерацию...");
    try {
      const response = await fetch(`/api/products/create-from-fabric/${processId}/enrich`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          products: productsForEnrichment,
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
      setProducts(productsForEnrichment);
      setSelectedIndex(0);
      setApprovedComparisonRowIndexes([]);
      setRejectedReviewRowIndexes([]);
      setSelectedReviewRowIndexes([]);
      setBulkModifiedRowIndexes([]);
      setTaskProgress({ total: productsForEnrichment.length, completed: 0, percent: 0 });
      setDummyProgressPercent(1);
      setRealtimeMode("websocket");
      setUiMessage("Создание товаров запущено. Дожидаюсь генерации атрибутов, описаний и bullet points...");
    } catch (caughtError) {
      setState("error");
      setUiMessage(caughtError instanceof Error ? `Ошибка запроса: ${caughtError.message}` : "Ошибка запроса");
    }
  }

  async function regenerateAiProducts() {
    if (!processId || products.length === 0) return;
    setState("loading");
    setProcessState("IN_PROGRESS");
    setCurrentStep("ai_enrichment_queued");
    setUiMessage("Перегенерирую AI-описания, bullet points и атрибуты из текущих данных...");
    setOttoSummary(null);
    setOttoErrors([]);
    setIssues([]);
    setTableStatusPhase("pending");
    setApprovedComparisonRowIndexes([]);
    setRejectedReviewRowIndexes([]);
    setSelectedReviewRowIndexes([]);
    setBulkModifiedRowIndexes([]);
    setTaskProgress({ total: products.length, completed: 0, percent: 0 });
    setDummyProgressPercent(1);

    try {
      const response = await fetch(`/api/products/create-from-fabric/${processId}/enrich`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          products,
          controller,
          factory_id: selectedFabricId,
          regenerate: true,
        }),
        cache: "no-store",
      });
      const parsed = await readJsonResponse<EnrichPreparedResponse>(response);
      if (!response.ok || parsed?.success === false) {
        setState("error");
        setUiMessage(readApiErrorMessage(parsed, "Не удалось перегенерировать товары", response.status));
        return;
      }
      setRealtimeMode("websocket");
      setUiMessage("Перегенерация запущена. Дожидаюсь нового AI-результата...");
    } catch (caughtError) {
      setState("error");
      setUiMessage(caughtError instanceof Error ? `Ошибка запроса: ${caughtError.message}` : "Ошибка запроса");
    }
  }

  async function submitEditedProducts() {
    if (!processId || products.length === 0) return;
    if (!allComparisonsApproved) {
      setState("error");
      setUiMessage(`Approve-ните сравнение для всех товаров: ${comparisonApprovedCount} из ${rows.length}.`);
      return;
    }
    const variantIssues = collectVariantExportIssues(products);
    if (variantIssues.length > 0) {
      setState("error");
      setOttoErrors(variantIssues);
      setIssues(variantIssues.map((item) => `${item.variation}: ${item.code}`));
      setTableStatusPhase("result");
      setUiMessage(`Проверьте variants перед отправкой: ${variantIssues.length} ошибок.`);
      return;
    }
    const submitTotal = expandedProductCount(products);
    setState("loading");
    setUiMessage("Загрузить: отправляю все продукты в OTTO...");
    setOttoSummary(null);
    setOttoErrors([]);
    setProcessState("IN_PROGRESS");
    setCurrentStep("otto_create_queued");
    setTaskProgress({ total: submitTotal, completed: 0, percent: 0 });
    setDummyProgressPercent(1);
    setTableStatusPhase("processing");
    setLastSubmitTotal(submitTotal);
    try {
      const response = await fetch(`/api/products/create-from-fabric/${processId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          products,
          controller,
          factory_id: selectedFabricId,
          media_base_url: window.location.origin,
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
        setTaskProgress({ total: submitTotal, completed: 0, percent: 0 });
        setDummyProgressPercent(1);
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

      const nextErrors = ottoErrorsFromPayload(failed);
      setOttoErrors(nextErrors);
      setTableStatusPhase("result");

      if (failedCount > 0) {
        setState("error");
        const nextIssues: string[] = nextErrors.map((item) => `${item.variation}: ${item.code}: ${item.title}`);
        setIssues(nextIssues.length > 0 ? nextIssues : [`OTTO process ${ottoPid}: failed=${failedCount}`]);
        setUiMessage("Загрузка завершена с ошибками.");
        return;
      }
      if (succeededCount < submitTotal) {
        setState("error");
        setIssues([`Создано меньше товаров, чем ожидалось: ${succeededCount} из ${submitTotal}`]);
        setUiMessage("Availability не запущен: не все товары подтверждены как созданные.");
        return;
      }

      setUiMessage("Товары созданы. Жду, пока OTTO завершит создание variations...");
      await sleep(AVAILABILITY_AFTER_CREATE_DELAY_MS);
      setUiMessage(`Отправляю stock=20 и shipping profile партиями по ${AVAILABILITY_CONCURRENCY}...`);
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

      resetCreatorWorkspace("Успешно загружено.", "success");
      void clearBackendProcess(processId);
    } catch (caughtError) {
      setState("error");
      setUiMessage(caughtError instanceof Error ? `Ошибка запроса: ${caughtError.message}` : "Ошибка запроса");
    }
  }

  async function handleClear() {
    serverDraftRestoreAttemptedRef.current = true;
    await clearAllBackendProcesses();
    resetCreatorWorkspace("Состояние очищено.");
  }

  const normalizedFabricQuery = normalizeFieldToken(fabricQuery);
  const filteredFabrics = normalizedFabricQuery
    ? fabrics.filter((item) =>
      normalizeFieldToken(`${item.name ?? ""} ${item.id ?? ""}`).includes(normalizedFabricQuery),
    )
    : fabrics;
  const visibleFabrics = selectedFabricId && !filteredFabrics.some((item) => item.id === selectedFabricId)
    ? [
      ...fabrics.filter((item) => item.id === selectedFabricId),
      ...filteredFabrics,
    ]
    : filteredFabrics;
  const selectedFabric = fabrics.find((item) => item.id === selectedFabricId);
  const fabricPickerDisabled = isLoadingFabrics || state === "loading" || fabrics.length === 0;

  const updateFabricMenuPosition = () => {
    const trigger = fabricTriggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 12;
    const gap = 6;
    const preferredHeight = 340;
    const availableBelow = viewportHeight - rect.bottom - margin - gap;
    const availableAbove = rect.top - margin - gap;
    const openUp = availableBelow < 220 && availableAbove > availableBelow;
    const availableHeight = Math.max(180, openUp ? availableAbove : availableBelow);
    const maxHeight = Math.min(preferredHeight, availableHeight);
    const width = Math.max(rect.width, 240);
    const left = Math.min(
      Math.max(margin, rect.left),
      Math.max(margin, viewportWidth - width - margin),
    );

    setFabricMenuStyle({
      left,
      width,
      maxHeight,
      ...(openUp
        ? { bottom: viewportHeight - rect.top + gap, top: "auto" }
        : { top: rect.bottom + gap, bottom: "auto" }),
    });
  };

  useLayoutEffect(() => {
    if (!fabricDropdownOpen) return;

    updateFabricMenuPosition();
    const update = () => updateFabricMenuPosition();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [fabricDropdownOpen, visibleFabrics.length]);

  useEffect(() => {
    if (!fabricDropdownOpen) return;

    setHighlightedFabricId(selectedFabricId || visibleFabrics[0]?.id || "");
    window.setTimeout(() => fabricSearchRef.current?.focus(), 0);

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (fabricTriggerRef.current?.contains(target)) return;
      if (fabricMenuRef.current?.contains(target)) return;
      setFabricDropdownOpen(false);
      fabricTriggerRef.current?.focus();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setFabricDropdownOpen(false);
        fabricTriggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [fabricDropdownOpen]);

  useEffect(() => {
    if (!fabricDropdownOpen) return;
    if (visibleFabrics.length === 0) {
      setHighlightedFabricId("");
      return;
    }
    if (!visibleFabrics.some((item) => item.id === highlightedFabricId)) {
      setHighlightedFabricId(selectedFabricId || visibleFabrics[0].id);
    }
  }, [fabricDropdownOpen, highlightedFabricId, selectedFabricId, visibleFabrics]);

  const selectFabric = (fabricId: string) => {
    setSelectedFabricId(fabricId);
    setFabricDropdownOpen(false);
    window.setTimeout(() => fabricTriggerRef.current?.focus(), 0);
  };

  const moveFabricHighlight = (direction: 1 | -1) => {
    if (visibleFabrics.length === 0) return;
    const currentIndex = visibleFabrics.findIndex((item) => item.id === highlightedFabricId);
    const nextIndex = currentIndex < 0
      ? 0
      : (currentIndex + direction + visibleFabrics.length) % visibleFabrics.length;
    const nextId = visibleFabrics[nextIndex].id;
    setHighlightedFabricId(nextId);
    fabricOptionRefs.current[nextId]?.scrollIntoView({ block: "nearest" });
  };

  const fabricMenu = fabricDropdownOpen && typeof document !== "undefined"
    ? createPortal(
      <div
        className="fabric-picker-menu"
        ref={fabricMenuRef}
        style={{
          ...fabricMenuStyle,
          visibility: fabricMenuStyle.left === undefined ? "hidden" : undefined,
        }}
      >
        <div className="creator-search-wrap fabric-search">
          <Search size={16} className="creator-search-icon" />
          <input
            ref={fabricSearchRef}
            className="creator-search-input"
            type="search"
            value={fabricQuery}
            onChange={(event) => setFabricQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                moveFabricHighlight(1);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                moveFabricHighlight(-1);
              } else if (event.key === "Enter" && highlightedFabricId) {
                event.preventDefault();
                selectFabric(highlightedFabricId);
              }
            }}
            placeholder="Поиск fabric..."
          />
        </div>
        <div className="fabric-picker-options" role="listbox">
          {visibleFabrics.length === 0 ? (
            <span className="fabric-picker-empty">Ничего не найдено</span>
          ) : visibleFabrics.map((item) => (
            <button
              type="button"
              role="option"
              aria-selected={item.id === selectedFabricId}
              className={`${item.id === selectedFabricId ? "is-selected" : ""} ${item.id === highlightedFabricId ? "is-highlighted" : ""}`.trim()}
              key={item.id}
              ref={(node) => {
                fabricOptionRefs.current[item.id] = node;
              }}
              onMouseEnter={() => setHighlightedFabricId(item.id)}
              onMouseDown={(event) => {
                event.preventDefault();
                selectFabric(item.id);
              }}
            >
              <span>{item.name ?? item.id}</span>
              <small>{`${item.items_count ?? 0} товаров`}</small>
            </button>
          ))}
        </div>
      </div>,
      document.body,
    )
    : null;

  if (isLoading || !hydratedDraft || isRestoringProcess) {
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
      hidePageHead
    >
      <div className={`creator-workspace creator-ref-workspace ${isCategoryStage ? "is-category-stage" : ""}`}>
        {error ? <p className="helper-banner">{error}</p> : null}
        {isEnrichmentLoading || isOttoSubmitLoading ? (
          <section className="product-enrichment-loading" role="status" aria-live="polite">
            <RefreshCw className="spin" size={34} aria-hidden="true" />
            <div>
              <h2>{isOttoSubmitLoading ? "Отправляем товары в OTTO" : "Подготавливаем данные товаров"}</h2>
              <p>{isOttoSubmitLoading ? "Идёт создание товаров и отправка availability. Дождитесь результата обработки." : "Загружаем описания, атрибуты и изображения. Работа с товарами станет доступна после завершения подготовки."}</p>
            </div>
            <div className="product-enrichment-loading-progress" aria-hidden="true">
              <span style={{ width: `${displayProgressPercent}%` }} />
            </div>
            <strong>{`${displayProgressPercent}%`}</strong>
          </section>
        ) : (
          <>
            <FabricHero />
            <section className="fabric-dashboard-grid">
              <ProductUploadCard
                fabricControl={(
                  <div className="fabric-picker">
                    <button
                      ref={fabricTriggerRef}
                      type="button"
                      className="fabric-picker-trigger"
                      disabled={fabricPickerDisabled}
                      aria-haspopup="listbox"
                      aria-expanded={fabricDropdownOpen}
                      onClick={() => {
                        if (fabricPickerDisabled) return;
                        setFabricDropdownOpen((open) => !open);
                      }}
                    >
                      <span>{isLoadingFabrics ? "Загрузка fabrics..." : selectedFabric ? `${selectedFabric.name ?? selectedFabric.id} (${selectedFabric.items_count ?? 0})` : "Выберите fabric"}</span>
                      <ChevronDown size={16} aria-hidden="true" />
                    </button>
                  </div>
                )}
                fabricMenu={fabricMenu}
                isPreparing={state === "loading"}
                canPrepare={Boolean(selectedFabricId)}
                canReset={Boolean(processId || state !== "idle" || products.length > 0)}
                isRefreshing={isRefreshingFabrics}
                status={state}
                message={state === "success" && products.length > 0 ? `${products.length} товаров готовы к проверке` : message}
                onPrepare={handleCreate}
                onRefresh={() => void refreshFabrics()}
                onReset={() => void handleClear()}
              />
              <CategoryReviewCard
                categoryKpis={categoryKpis}
                processState={processState}
                currentStep={currentStep}
                progressPercent={displayProgressPercent}
                progressLabel={progressTitle(currentStep)}
                preparationCounts={preparationCounts}
                realtimeMode={realtimeMode}
                processId={processId}
                ottoProcessId={ottoProcessId}
                stepElapsed={stepElapsed}
                heartbeatLag={heartbeatLag}
                copiedRuntimeField={copiedRuntimeField}
                runtimeCopyErrorField={runtimeCopyErrorField}
                copyText={(value, field) => void copyText(value, field)}
                stuckMessage={stuckMessage}
              />
            </section>
          </>
        )}

        {isCategoryStage ? (
          <section className="category-check-page">
            {state === "error" ? (
              <div className="category-check-alert">
                <AlertCircle size={16} />
                <span>{message}</span>
                <button type="button" onClick={handleCreate} disabled={!selectedFabricId}>Повторить</button>
              </div>
            ) : null}
            <ProductCategoriesCard
              canCreate={!(state === "loading" || filteredRows.length === 0 || missingCategoryCount > 0 || categoryKpis.requiresReview > 0)}
              onCreate={confirmCategories}
              isLive={processState === "IN_PROGRESS"}
              toolbar={(
                <CategoryCheckToolbar
                  tableQuery={tableQuery}
                  setTableQuery={setTableQuery}
                  categoryFilter={categoryFilter}
                  setCategoryFilter={setCategoryFilter}
                  categoryFilterOptions={categoryFilterOptions}
                  categoryGroupDisplayByValue={categoryGroupDisplayByValue}
                  statusFilter={categoryStatusFilter}
                  setStatusFilter={setCategoryStatusFilter}
                  categorySort={categorySort}
                  setCategorySort={setCategorySort}
                  setPage={setPage}
                />
              )}
              batchActions={(
                <CategoryCheckBatchActions
                  selectedCount={selectedCategoryRowIndexes.length}
                  selectedConfirmableCount={selectedConfirmableCount}
                  editSelected={() => setIsBulkCategoryDrawerOpen(true)}
                  confirmSelected={() => confirmCategoryRows(selectedCategoryRowIndexes)}
                  skipSelected={() => skipCategoryRows(selectedCategoryRowIndexes)}
                  resetSelected={() => {
                    setSelectedCategoryRowIndexes([]);
                    setIsBulkCategoryDrawerOpen(false);
                    setBulkCategoryValue("");
                  }}
                />
              )}
              table={(
                <CategoryCheckTable
                  rows={pagedRows}
                  categoryRowStatuses={categoryRowStatuses}
                  categoryDisplayByValue={categoryDisplayByValue}
                  categoryGroupDisplayByValue={categoryGroupDisplayByValue}
                  selectedCategoryIndexSet={selectedCategoryIndexSet}
                  allFilteredRowsSelected={allFilteredRowsSelected}
                  toggleAllFilteredRows={toggleAllFilteredRows}
                  toggleCategorySelection={toggleCategorySelection}
                  confirmCategoryRows={confirmCategoryRows}
                  openDetails={setDetailsCategoryIndex}
                  selectedIndex={selectedIndex}
                  setSelectedIndex={setSelectedIndex}
                  pageSize={pageSize}
                  setPageSize={setPageSize}
                  safePage={safePage}
                  totalPages={totalPages}
                  paginationItems={paginationItems}
                  setPage={setPage}
                  filteredCount={filteredRows.length}
                  state={state}
                  processState={processState}
                  rowNumberStart={(safePage - 1) * pageSize}
                />
              )}
            />
            <CategoryEditDrawer
              row={editingCategoryRow}
              categoryOptionsByGroup={categoryOptionsByGroup}
              categoryGroupDisplayByValue={categoryGroupDisplayByValue}
              categoryDisplayByValue={categoryDisplayByValue}
              open={editingCategoryIndex !== null}
              onSave={(category, comment) => {
                if (editingCategoryIndex !== null) saveCategoryEdit(editingCategoryIndex, category, comment);
              }}
              onClose={() => setEditingCategoryIndex(null)}
            />
            <BulkCategoryEditDrawer
              open={isBulkCategoryDrawerOpen}
              count={selectedCategoryRowIndexes.length}
              groups={selectedCategoryGroups}
              categoryGroupDisplayByValue={categoryGroupDisplayByValue}
              categoryDisplayByValue={categoryDisplayByValue}
              options={bulkCategoryOptions}
              value={bulkCategoryValue}
              setValue={setBulkCategoryValue}
              onClose={() => setIsBulkCategoryDrawerOpen(false)}
              onApply={applyBulkCategory}
            />
            <CategoryReviewModal
              row={detailsCategoryRow}
              rows={filteredRows}
              statuses={categoryRowStatuses}
              status={detailsCategoryStatus}
              categoryOptionsByGroup={categoryOptionsByGroup}
              categoryGroupDisplayByValue={categoryGroupDisplayByValue}
              categoryDisplayByValue={categoryDisplayByValue}
              open={detailsCategoryIndex !== null}
              onSave={(category, comment) => {
                if (detailsCategoryIndex !== null) saveCategoryEdit(detailsCategoryIndex, category, comment);
              }}
              position={detailsCategoryPosition}
              total={filteredRows.length}
              onPrevious={() => navigateCategoryDetails(detailsCategoryPosition - 1)}
              onNext={() => navigateCategoryDetails(detailsCategoryPosition + 1)}
              onSelectProduct={(rowIndex) => {
                const nextPosition = filteredRows.findIndex((item) => item.index === rowIndex);
                if (nextPosition >= 0) navigateCategoryDetails(nextPosition);
              }}
              onClose={() => setDetailsCategoryIndex(null)}
            />
          </section>
        ) : null}

        {!isEnrichmentLoading && workflowStep !== "categories" ? (
          <ProductReviewPage>
            {bulkToast ? <div className={`bulk-edit-toast${bulkToast.error ? " is-error" : ""}`} role="status">{bulkToast.error ? <AlertCircle size={16} /> : <Check size={16} />}{bulkToast.message}</div> : null}
            <BulkSelectionBar
              count={selectedReviewRowIndexes.length}
              onBulkEdit={() => bulkAttributeEdit.setOpen(true)}
              onApprove={approveSelectedReviewProducts}
              onReject={rejectSelectedReviewProducts}
              onClear={() => setSelectedReviewRowIndexes([])}
            />
            <div className="product-review-layout">
              <ProductList
                allRows={allReviewRows}
                rows={reviewRows}
                selectedIndex={selectedIndex}
                selectedReviewIndexes={selectedReviewRowIndexes}
                onSelect={setSelectedIndex}
                onToggleSelect={toggleReviewSelection}
                onToggleAllVisible={toggleAllVisibleReviewRows}
                onClearSelection={() => setSelectedReviewRowIndexes([])}
                searchRef={reviewSearchRef}
                query={reviewSearchQuery}
                setQuery={setReviewSearchQuery}
                filter={reviewQueueFilter}
                setFilter={setReviewQueueFilter}
                categoryFilter={reviewCategoryFilter}
                setCategoryFilter={setReviewCategoryFilter}
                sort={reviewQueueSort}
                setSort={setReviewQueueSort}
              />
              <main className="product-review-workspace">
                {products.length === 0 ? (
                  <div className="product-review-empty workspace"><strong>Select a product to review</strong></div>
                ) : (
                  <>
                    <ProductReviewHeader
                      row={selectedReviewRowForRender}
                      image={selectedImage}
                      categoryDisplayByValue={categoryDisplayByValue}
                      categoryGroupDisplayByValue={categoryGroupDisplayByValue}
                    />
                    {selectedProductErrors.length > 0 ? (
                      <button className="product-review-error-indicator" type="button" onClick={() => setIsErrorDrawerOpen(true)}>
                        <AlertCircle size={16} />
                        {`Errors (${selectedProductErrors.length})`}
                      </button>
                    ) : null}
                    <ReviewTabs value={editorTab} setValue={setEditorTab} />
                    <div className={`product-review-content is-${editorTab}`}>
                      {editorTab === "general" ? (
                        <div className="product-overview-grid">
                          <section className="product-overview-card product-overview-identifiers">
                            <div className="product-overview-card-head"><h3><span className="product-overview-card-icon"><IdCard size={15} /></span>Identifiers</h3></div>
                            <div className="product-overview-fields">
                              {[
                                { key: "sku", label: "SKU", value: String(selectedProduct.sku ?? ""), path: ["sku"] },
                                { key: "ean", label: "EAN", value: String(selectedProduct.ean ?? ""), path: ["ean"] },
                                { key: "product-reference", label: "Product Reference", value: String(selectedProduct.productReference ?? ""), path: ["productReference"] },
                              ].map((field) => {
                                const copyKey = `overview-${field.key}`;
                                const editing = editingOverviewField === field.key;
                                return (
                                  <div className="product-overview-field attribute-field-card" key={field.key}>
                                    <div className="product-overview-field-head attribute-field-card-head">
                                      <span>{field.label}</span>
                                      {!editing ? <OverviewActionsMenu onEdit={() => setEditingOverviewField(field.key)} onCopy={() => void copyText(field.value, copyKey)} canCopy={Boolean(field.value)} copied={copiedRuntimeField === copyKey} /> : null}
                                    </div>
                                    {editing ? (
                                      <div className="attribute-field-editor"><input autoFocus value={field.value} onBlur={() => setEditingOverviewField(null)} onChange={(event) => updateSelected(field.path, event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></div>
                                    ) : (
                                      <button type="button" className={`attribute-field-value${field.value ? "" : " is-empty"}`} onClick={() => setEditingOverviewField(field.key)}>{field.value || "Not provided"}</button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </section>

                          <section className="product-overview-card product-overview-information">
                            <div className="product-overview-card-head"><h3><span className="product-overview-card-icon"><BriefcaseBusiness size={15} /></span>Product Information</h3></div>
                            <div className="product-overview-info-columns">
                              <div className="product-overview-info-main">
                                <div className="product-overview-field product-overview-title-field attribute-field-card">
                                  <div className="product-overview-field-head attribute-field-card-head">
                                    <span>Title</span>
                                    {editingOverviewField !== "title" ? <OverviewActionsMenu onEdit={() => setEditingOverviewField("title")} onCopy={() => void copyText(selectedReviewRowForRender?.title ?? "", "overview-title")} canCopy={Boolean(selectedReviewRowForRender?.title)} copied={copiedRuntimeField === "overview-title"} /> : null}
                                  </div>
                                  {editingOverviewField === "title" ? (
                                    <div className="attribute-field-editor"><input autoFocus value={selectedReviewRowForRender?.title ?? ""} onBlur={() => setEditingOverviewField(null)} onChange={(event) => updateSelectedTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></div>
                                  ) : (
                                    <button type="button" className={`attribute-field-value${selectedReviewRowForRender?.title?.trim() ? "" : " is-empty"}`} onClick={() => setEditingOverviewField("title")}>{selectedReviewRowForRender?.title?.trim() || "Not provided"}</button>
                                  )}
                                </div>
                                <div className="product-overview-field attribute-field-card">
                                  <div className="product-overview-field-head attribute-field-card-head">
                                    <span>Product Line</span>
                                    {editingOverviewField !== "product-line" ? <OverviewActionsMenu onEdit={() => setEditingOverviewField("product-line")} /> : null}
                                  </div>
                                  {editingOverviewField === "product-line" ? (
                                    <div className="attribute-field-editor"><input autoFocus value={String(selectedDescription.productLine ?? "")} onBlur={() => setEditingOverviewField(null)} onChange={(event) => updateSelectedTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></div>
                                  ) : (
                                    <button type="button" className={`attribute-field-value${String(selectedDescription.productLine ?? "").trim() ? "" : " is-empty"}`} onClick={() => setEditingOverviewField("product-line")}>{String(selectedDescription.productLine ?? "").trim() || "Not provided"}</button>
                                  )}
                                </div>
                              </div>
                              <div className="product-overview-info-side">
                                <div className="product-overview-field attribute-field-card">
                                  <div className="product-overview-field-head attribute-field-card-head">
                                    <span>Price</span>
                                    {editingOverviewField !== "price" ? <OverviewActionsMenu onEdit={() => setEditingOverviewField("price")} /> : null}
                                  </div>
                                  {editingOverviewField === "price" ? (
                                    <div className="attribute-field-editor"><div className="product-overview-price-input">
                                      <input autoFocus inputMode="decimal" value={String(selectedStandardPrice.amount ?? "")} onChange={(event) => {
                                        const amount = Number(event.target.value.trim() || 0);
                                        if (Number.isNaN(amount)) return;
                                        setProducts((prev) => {
                                          const next = [...prev];
                                          next[selectedIndex] = updateProductField(asRecord(next[selectedIndex]), ["pricing", "standardPrice", "amount"], amount);
                                          return next;
                                        });
                                      }} onBlur={() => setEditingOverviewField(null)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
                                      {selectedCurrencyLabel ? <span>{selectedCurrencyLabel}</span> : null}
                                    </div></div>
                                  ) : (
                                    <button type="button" className={`attribute-field-value${selectedStandardPrice.amount === undefined || selectedStandardPrice.amount === null || selectedStandardPrice.amount === "" ? " is-empty" : ""}`} onClick={() => setEditingOverviewField("price")}>{selectedStandardPrice.amount === undefined || selectedStandardPrice.amount === null || selectedStandardPrice.amount === "" ? "Not provided" : `${String(selectedStandardPrice.amount)}${selectedCurrencyLabel ? ` ${selectedCurrencyLabel}` : ""}`}</button>
                                  )}
                                </div>
                                <div className="product-overview-field attribute-field-card">
                                  <div className="product-overview-field-head attribute-field-card-head">
                                    <span>Delivery days</span>
                                  </div>
                                  <select
                                    value={selectedShippingProfileId}
                                    onChange={(event) => updateRowShippingProfile(selectedIndex, event.target.value)}
                                    disabled={shippingProfiles.length === 0}
                                  >
                                    {selectedShippingProfileId && !shippingProfiles.some((item) => item.id === selectedShippingProfileId) ? (
                                      <option value={selectedShippingProfileId}>{selectedReviewRowForRender?.shippingProfileName || selectedShippingProfileId}</option>
                                    ) : null}
                                    {shippingProfiles.length === 0 ? (
                                      <option value="">{selectedShippingProfileId || "No delivery profiles"}</option>
                                    ) : (
                                      shippingProfiles.map((item) => (
                                        <option key={item.id} value={item.id}>{item.name}</option>
                                      ))
                                    )}
                                  </select>
                                </div>
                                <div className="product-overview-field attribute-field-card">
                                  <div className="product-overview-field-head attribute-field-card-head">
                                    <span>Category</span>
                                  </div>
                                  <span className="attribute-field-value">{`${categoryGroupDisplayByValue[selectedAttributeCategoryGroup] || selectedAttributeCategoryGroup || "-"} / ${categoryDisplayByValue[selectedAttributeCategory] || selectedAttributeCategory || "-"}`}</span>
                                </div>
                              </div>
                            </div>
                          </section>

                          <section className="product-overview-card product-overview-generated">
                            <div className="product-overview-card-head">
                              <h3><span className="product-overview-card-icon"><Sparkles size={15} /></span>Generated Content</h3>
                              {editingOverviewField !== "bullet-points" ? <OverviewActionsMenu onEdit={() => setEditingOverviewField("bullet-points")} /> : null}
                            </div>
                            <div className="product-overview-field product-overview-bullets">
                              <span>Bullet Points</span>
                              {editingOverviewField === "bullet-points" ? (
                                <div className="product-overview-bullet-editor" role="list">
                                  {(selectedBulletPoints.length > 0 ? selectedBulletPoints : [""]).map((bulletPoint, index) => (
                                    <div className="product-overview-bullet-row" key={`bullet-editor-${index}`} role="listitem">
                                      <span className="product-overview-bullet-dot" aria-hidden="true" />
                                      <input
                                        autoFocus={index === 0}
                                        value={bulletPoint}
                                        onChange={(event) => updateBulletPoint(index, event.target.value)}
                                        onKeyDown={(event) => {
                                          if (event.key === "Enter") {
                                            event.preventDefault();
                                            addBulletPoint();
                                          } else if (event.key === "Backspace" && bulletPoint === "" && selectedBulletPoints.length > 1) {
                                            event.preventDefault();
                                            removeBulletPoint(index);
                                          }
                                        }}
                                      />
                                      <span className="product-overview-bullet-handle" aria-hidden="true" />
                                    </div>
                                  ))}
                                </div>
                              ) : selectedBulletPoints.length > 0 ? (
                                <ul>{selectedBulletPoints.map((bulletPoint, index) => <li key={`${index}-${bulletPoint}`}>{bulletPoint}</li>)}</ul>
                              ) : (
                                <div className="product-overview-empty"><strong>No generated content</strong><span>Bullet points have not been generated yet.</span></div>
                              )}
                            </div>
                          </section>
                        </div>
                      ) : null}
                      {editorTab === "attributes" ? (
                        <>
                          <AttributeEditor
                            attributes={attributeCards}
                            basePrice={String(selectedStandardPrice.amount ?? "")}
                            categoryAttributes={categoryAttributes}
                            isLoadingCategoryAttributes={isLoadingCategoryAttributes}
                            categoryAttributesError={categoryAttributesError}
                            newAttributeName={newAttributeName}
                            setNewAttributeName={setNewAttributeName}
                            newAttributeValue={newAttributeValue}
                            setNewAttributeValue={setNewAttributeValue}
                            addAttribute={addAttribute}
                            editingAttribute={editingAttribute}
                            editingDraft={editingDraft}
                            setEditingDraft={setEditingDraft}
                            startAttributeEdit={startAttributeEdit}
                            saveAttributeEdit={saveAttributeEdit}
                            cancelAttributeEdit={cancelAttributeEdit}
                            deleteAttribute={deleteAttribute}
                            invalidAttributeNames={invalidAttributeNames}
                            onMaterialPriceChange={(materialValue, price) => {
                              readProductVariants(selectedProduct)
                                .filter((variant) => variant.active && materialValueForVariant(variant) === materialValue)
                                .forEach((variant) => patchSelectedVariant(variant.combinationKey, { price }));
                            }}
                          />
                          <VariantManager
                            product={selectedProduct}
                            categoryAttributes={categoryAttributes}
                            onPatchVariant={patchSelectedVariant}
                            onDeleteVariant={deleteSelectedVariant}
                            onRegenerateVariant={regenerateSelectedVariant}
                          />
                        </>
                      ) : null}
                      {editorTab === "json" ? (
                        <section className="product-review-section">
                          <div className="product-review-section-head"><h3>Raw Payload</h3></div>
                          <textarea className="product-review-json" value={JSON.stringify(selectedProduct, null, 2)} readOnly rows={18} />
                        </section>
                      ) : null}
                      {editorTab === "diff" ? <DiffViewer aftercool={selectedAftercoolData} /> : null}
                    </div>
                    <StickyActionBar
                      onReject={() => rejectReviewProduct(selectedIndex)}
                      onSave={saveReviewDraft}
                      onRegenerate={regenerateAiProducts}
                      onApprove={() => approveReviewProduct(selectedIndex)}
                      onSubmit={submitEditedProducts}
                      approved={approvedComparisonIndexSet.has(selectedIndex)}
                      approvedCount={comparisonApprovedCount}
                      totalCount={rows.length}
                      allApproved={allComparisonsApproved}
                      disabled={products.length === 0 || state === "loading"}
                    />
                  </>
                )}
              </main>
            </div>
            <ErrorDrawer open={isErrorDrawerOpen} errors={selectedProductErrors} onClose={() => setIsErrorDrawerOpen(false)} />
            <BulkAttributeEditDrawer
              count={selectedReviewRowIndexes.length}
              options={bulkAttributeOptions}
              isLoading={isLoadingCategoryAttributes}
              state={bulkAttributeEdit}
              onClose={bulkAttributeEdit.reset}
              onApply={applyBulkAttributeChanges}
            />
            <CategoryEditDrawer
              row={rowByIndex.get(selectedIndex) ?? null}
              categoryOptionsByGroup={categoryOptionsByGroup}
              categoryGroupDisplayByValue={categoryGroupDisplayByValue}
              categoryDisplayByValue={categoryDisplayByValue}
              open={editingCategoryIndex === selectedIndex}
              onSave={(category, comment) => saveCategoryEdit(selectedIndex, category, comment)}
              onClose={() => setEditingCategoryIndex(null)}
            />
          </ProductReviewPage>
        ) : null}
      </div>
    </AppWorkspaceShell>
  );
}
