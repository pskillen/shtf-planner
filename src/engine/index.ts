export { ASSUMPTIONS, HORIZONS, type EngineAssumption } from './assumptions';
export { ageInMonths, addMonths } from './dates';
export { CAPABILITY_ORDER } from './context';
export {
  targets,
  planDone,
  applicablePlanItems,
  ANSWERED_BY_ASSET,
  type Target,
  type TargetKind,
  type TargetRule,
} from './targets';
export {
  coverage,
  analyse,
  type Analysis,
  type BelowFloor,
  type BlockedAsset,
  type Coverage,
  type CoverageSource,
} from './coverage';
export { gaps, type Gap, type Suggestion } from './gaps';
export { score, type CapabilityScore, type Score } from './score';
export { preview, type PreviewHorizon, type PreviewRow } from './preview';
