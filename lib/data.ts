// Typed readers for the JSON files in data/processed/, written by scripts/preprocess.py.
// Readers only load and type the data. Calculations live elsewhere.

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
