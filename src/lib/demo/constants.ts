export const DEMO_SEED = 2_026_0721
export const DEMO_UUID_NAMESPACE = '0ee9d584-5a7d-5aa8-a21b-b6a566f8d91e'
export const DEMO_GENERATOR_VERSION = 'atlas-v1'
export const DEMO_RECORDED_AT = '2026-07-21T09:00:00.000Z'
export const DEMO_NOTICE =
  'FICTIONAL SYNTHETIC DATA: Atlas, its history, people-like actors, repositories, and delivery evidence are invented for demonstration only.'

export const DEMO_HISTORY_DEFAULTS = {
  projectCount: 18,
  deliveryEventCount: 250_000,
  ciRunCount: 50_000,
  chunkSize: 2_000,
} as const

export const ATLAS_CALIBRATION = {
  baseline: { expected: 0.43, range: [0.35, 0.5] as const },
  deferAuditExport: { expected: 0.81, range: [0.78, 0.85] as const },
  ciBlockerRiskMultiplier: 2.4,
  urgentNonCriticalWeight: 0.15,
} as const
