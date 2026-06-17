export interface BreadcrumbEntry {
  type: "navigation" | "network" | "asset" | "console" | "release" | "manual"
  timestamp: string // ISO 8601
  message?: string
  data?: Record<string, string | number | boolean>
}

const MAX_BREADCRUMBS = 50

// Fixed-capacity ring buffer: when full, the oldest entry is evicted.
export class BreadcrumbBuffer {
  private entries: BreadcrumbEntry[] = []

  add(entry: BreadcrumbEntry): void {
    this.entries.push(entry)
    if (this.entries.length > MAX_BREADCRUMBS) {
      this.entries.shift()
    }
  }

  getAll(): BreadcrumbEntry[] {
    return this.entries.slice()
  }

  clear(): void {
    this.entries = []
  }
}
