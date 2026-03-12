import { TaskDefinition, TaskLoggerLike, TaskStepBase } from './types'

type TaskActionType<Action extends TaskStepBase> = Action['actionType']
type TaskActionHandler<Action extends TaskStepBase, Type extends string> = (
  action: Extract<Action, { actionType: Type }>,
  context: { taskId: string; taskName: string; stepIndex: number; data: Record<string, unknown> }
) => Promise<void>

export type TaskActionHandlerMap<Action extends TaskStepBase> = {
  [K in TaskActionType<Action> & string]: TaskActionHandler<Action, K>
}

export class TaskDSLRunner<Action extends TaskStepBase> {
  constructor(private readonly logger: TaskLoggerLike) {}

  public async execute(task: TaskDefinition<Action>, handlers: TaskActionHandlerMap<Action>): Promise<Record<string, unknown>> {
    this.logger.info(`[${task.taskId}] 开始执行任务: ${task.taskName}`)
    const runtimeData: Record<string, unknown> = {}

    for (let stepIndex = 0; stepIndex < task.steps.length; stepIndex += 1) {
      const step = task.steps[stepIndex]
      const stepName = String((step as { actionType?: string }).actionType || 'unknown')
      const maxRetries = Number(step.options?.retryCount ?? task.config.retryCount ?? 0)
      const onError = step.onError ?? 'abort'
      let attempt = 0

      while (attempt <= maxRetries) {
        try {
          const handler = handlers[stepName as keyof TaskActionHandlerMap<Action>] as TaskActionHandler<Action, string> | undefined
          if (!handler) {
            throw new Error(`Action handler not found: ${stepName}`)
          }

          this.logger.info(`[${task.taskId}] 执行步骤(${stepIndex + 1}/${task.steps.length}): ${stepName}`)
          await handler(step as Extract<Action, { actionType: string }>, {
            taskId: task.taskId,
            taskName: task.taskName,
            stepIndex: stepIndex + 1,
            data: runtimeData
          })
          break
        } catch (error) {
          attempt += 1
          const errorMessage = (error as Error)?.message || String(error)
          const canRetry = attempt <= maxRetries

          if (canRetry) {
            this.logger.warn(
              `[${task.taskId}] 步骤失败(${stepName})，重试 ${attempt}/${maxRetries}，原因: ${errorMessage}`
            )
            continue
          }

          if (onError === 'continue') {
            this.logger.warn(
              `[${task.taskId}] 步骤失败(${stepName})，按 continue 策略跳过，原因: ${errorMessage}`
            )
            break
          }

          this.logger.error(`[${task.taskId}] 任务中断，失败步骤: ${stepName}，原因: ${errorMessage}`)
          throw error
        }
      }
    }

    this.logger.info(`[${task.taskId}] 任务执行完成: ${task.taskName}`)
    return runtimeData
  }
}
