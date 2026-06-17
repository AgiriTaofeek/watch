export type EventType =
  | "web_vital"
  | "frontend_error"
  | "network_request"
  | "navigation"
  | "asset_load"
  | "breadcrumb"
  | "deployment"

export interface EventEnvelope<T = unknown> {
  environment: string
  release?: string
  service: "frontend"
  timestamp: string
  type: EventType
  context: {
    route?: string
    user_id_hash?: string
    session_id?: string
  }
  payload: T
}
