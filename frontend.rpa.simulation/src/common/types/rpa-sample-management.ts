export type SampleManagementTabKey =
  | 'to_review'
  | 'ready_to_ship'
  | 'shipped'
  | 'in_progress'
  | 'completed'

export interface SampleManagementPayload {
  tabs: SampleManagementTabKey[]
}

export interface SampleManagementPayloadInput {
  tab?: string
  tabs?: string[]
}
