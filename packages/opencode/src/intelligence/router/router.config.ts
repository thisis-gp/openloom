/** Router policy knobs only — model metadata comes from the Provider catalog. */
export const RouterPolicy = {
  explorationRate: 0.08,
  minimumSamplesBeforeExploit: 20,
  maxCostBoost: 2.5,
  circuitBreakerFailureWindow: 20,
  circuitBreakerFailureRate: 0.5,
  outcomeHistoryLimit: 500,
} as const
