// The data layer over the JSON files in data/processed/, written by scripts/preprocess.py. Each module in
// lib/data/ loads its file once, types it and calculates its KPIs. runKpi and listKpis in calculations.ts are the
// one entry point for the dashboard and the LLM tools, and no figure the app shows is computed anywhere else
// (ADR 0001).

export type {
  CatalogueEntry,
  DataStatus,
  DataTransparencyNote,
  Month,
  ProcessedFile,
  ProcessedMeta,
  ReviewPart,
  View,
} from "./data/processed.ts";
export { readProcessed } from "./data/processed.ts";

export type {
  Assumption,
  Baseline,
  BaselineId,
  Customer,
  DataQualityEntry,
  IndustryPriority,
  Laundry,
  MasterData,
  Product,
  ProductPreset,
  Site,
  SiteTypeGroup,
} from "./data/master-data.ts";
export { getMasterData } from "./data/master-data.ts";

export type {
  LaundryWasteFactor,
  OperationalCircularityDefaults,
  OperationalCircularityKpis,
  PackedPiecesFact,
  RepairFact,
  RepairType,
  WasteFact,
} from "./data/operational-circularity-kpis.ts";
export { getOperationalCircularityKpis } from "./data/operational-circularity-kpis.ts";

export type {
  ServiceActivityFact,
  ServiceCycleFact,
  ServiceKpis,
  ServiceSiteMonthFact,
  ServiceTurnaround,
} from "./data/service-kpis.ts";
export { getServiceKpis } from "./data/service-kpis.ts";

export type {
  ContextLine,
  KamNote,
  PublicFigure,
  PublicFigureUse,
  PublicRange,
  PublicReference,
  PublicReferenceGap,
} from "./data/public-reference.ts";
export { getPublicReference } from "./data/public-reference.ts";

export type {
  AccountHealth,
  AccountHealthCatalogueEntry,
  AccountHealthInputId,
  AccountHealthRating,
  HealthInputResult,
  HealthRating,
  HealthThresholds,
} from "./data/account-health.ts";
export { getAccountHealth } from "./data/account-health.ts";

export type {
  BaselineFactor,
  BaselineFactors,
  BaselineLowCase,
  FactorCase,
  FootprintBaselines,
  FootprintFact,
  FootprintHandprintKpis,
  FootprintHandprintParameter,
  FootprintTransparency,
  HandprintRow,
  LaundryMonthFactors,
  LaundryProcessCo2ePerKwh,
  PerWearerDenominator,
} from "./data/footprint-handprint-kpis.ts";
export { getFootprintHandprintKpis } from "./data/footprint-handprint-kpis.ts";

export type {
  CompareTo,
  CompareToConvention,
  ComparisonId,
  ComparisonLabel,
  ComparisonResult,
  ComparisonSide,
  CustomerComparison,
  ImprovementCatalogueEntry,
  ImprovementDefaults,
  ImprovementResults,
  PeriodComparisons,
} from "./data/period-comparisons.ts";
export { getPeriodComparisons } from "./data/period-comparisons.ts";

export type {
  CustomerPriorities,
  CustomerPriorityCatalogueEntry,
  CustomerPriorityId,
  DashboardEmphasis,
  DefaultPriorityOrder,
  PriorityTerm,
  PriorityTermSource,
} from "./data/customer-priorities.ts";
export { getCustomerPriorities } from "./data/customer-priorities.ts";

export type {
  CustomerSignalRanking,
  LeverOwner,
  OpportunitySignals,
  RankedSignal,
  SignalCatalogueEntry,
  SignalEvaluation,
  SignalId,
  SignalResult,
  SignalSize,
  SignalThresholds,
  SiteMonthInput,
  SiteProductMonthInput,
  TurnaroundByStage,
} from "./data/opportunity-signals.ts";
export { getOpportunitySignals } from "./data/opportunity-signals.ts";

export type {
  CustomerViewDefaults,
  DataStatusLegendEntry,
  DataTransparencyItem,
  FirstScreen,
  FirstScreenTile,
  HeadlineKpis,
  PriorityBlock,
  ProcessedRef,
  ProposedNextStep,
  ResolvedView,
  ReviewConfig,
  ReviewPartConfig,
  SignalGroup,
  SplitGroup,
  ThresholdAndGuard,
  ViewItem,
  ViewsAndReview,
  ViewsConfig,
} from "./data/views-and-review.ts";
export { getViewsAndReview } from "./data/views-and-review.ts";

export type {
  KpiAnswer,
  KpiDetail,
  KpiParameter,
  KpiQuery,
  KpiResult,
  Period,
  Scope,
  Withheld,
} from "./data/query.ts";
export { applyView, periodMonths } from "./data/query.ts";

export type { KpiListing } from "./data/calculations.ts";
export { listKpis, runKpi } from "./data/calculations.ts";
