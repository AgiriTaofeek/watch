import { onCLS, onFCP, onINP, onLCP, onTTFB } from "web-vitals"
import type { Metric } from "web-vitals"

export interface WebVitalPayload {
  name: "LCP" | "CLS" | "INP" | "FCP" | "TTFB"
  value: number
  rating: "good" | "needs-improvement" | "poor"
}

// Registers observers for all five Core Web Vitals. Each fires once when the
// browser has a stable measurement. In environments that lack the required
// APIs (e.g. jsdom in tests) the web-vitals library silently does nothing.
export function collectVitals(
  onVital: (payload: WebVitalPayload) => void,
): void {
  function handle(metric: Metric): void {
    onVital({
      name: metric.name as WebVitalPayload["name"],
      value: metric.value,
      rating: metric.rating,
    })
  }

  onLCP(handle)
  onCLS(handle)
  onINP(handle)
  onFCP(handle)
  onTTFB(handle)
}
