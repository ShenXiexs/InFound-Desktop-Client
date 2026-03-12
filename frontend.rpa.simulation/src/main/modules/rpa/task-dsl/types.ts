export type TaskStepErrorPolicy = 'abort' | 'continue'

export interface TaskStepOptions {
  retryCount?: number
}

export interface TaskStepBase {
  actionType: string
  id?: string
  onError?: TaskStepErrorPolicy
  options?: TaskStepOptions
}

export interface TaskConfig {
  enableTrace: boolean
  retryCount: number
}

export interface TaskDefinition<Action extends TaskStepBase> {
  taskId: string
  taskName: string
  version: string
  config: TaskConfig
  steps: Action[]
}

export interface TaskLoggerLike {
  info(message: string): void
  warn(message: string): void
  error(message: string): void
}
