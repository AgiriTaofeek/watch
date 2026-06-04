import type { EventEnvelope } from "@watch/contracts"

export interface InitOptions {
  dsn: string
  environment?: string
  release?: string
}

export function init(_options: InitOptions): void {
  // M2 implementation
}

export type { EventEnvelope }
