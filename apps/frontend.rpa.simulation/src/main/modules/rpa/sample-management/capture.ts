import { WebContents } from 'electron'
import type { TaskLoggerLike } from '../task-dsl/types'

export interface CapturedJsonResponse {
  url: string
  body: unknown
  captured_at: string
}

interface JsonResponseCaptureSession {
  captureKey: string
  urlIncludes: string
  requestMethod?: string
  responses: CapturedJsonResponse[]
  matchedRequestIds: Set<string>
  processedRequestIds: Set<string>
  requestUrlById: Map<string, string>
  pendingTasks: Set<Promise<void>>
  listener: (_event: Electron.Event, method: string, params: Record<string, unknown>) => void
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export class SampleManagementCaptureManager {
  private readonly captureSessions = new Map<string, JsonResponseCaptureSession>()

  constructor(private readonly logger: TaskLoggerLike) {}

  public async startJsonResponseCapture(
    webContents: WebContents,
    options: { captureKey: string; urlIncludes: string; method?: string }
  ): Promise<void> {
    await this.ensureNetworkDebuggerReady(webContents)

    const captureKey = String(options.captureKey).trim()
    const urlIncludes = String(options.urlIncludes).trim()
    const requestMethod = String(options.method || '')
      .trim()
      .toUpperCase()

    const session: JsonResponseCaptureSession = {
      captureKey,
      urlIncludes,
      requestMethod: requestMethod || undefined,
      responses: [],
      matchedRequestIds: new Set<string>(),
      processedRequestIds: new Set<string>(),
      requestUrlById: new Map<string, string>(),
      pendingTasks: new Set<Promise<void>>(),
      listener: (_event, method, params) => {
        if (method === 'Network.requestWillBeSent') {
          const requestId = String(params?.requestId || '')
          const request = (params?.request || {}) as Record<string, unknown>
          const url = String(request.url || '')
          const currentMethod = String(request.method || '')
            .trim()
            .toUpperCase()
          const matchedMethod = !session.requestMethod || currentMethod === session.requestMethod
          if (requestId && url.includes(urlIncludes) && matchedMethod) {
            session.matchedRequestIds.add(requestId)
            session.requestUrlById.set(requestId, url)
          }
          return
        }

        if (method === 'Network.responseReceived') {
          const requestId = String(params?.requestId || '')
          if (!requestId || !session.matchedRequestIds.has(requestId)) {
            return
          }

          const response = (params?.response || {}) as Record<string, unknown>
          const mimeType = String(response.mimeType || '')
          const resourceType = String(params?.type || '')
          const matchedJsonLike = resourceType === 'XHR' || resourceType === 'Fetch' || mimeType.includes('json')
          if (!matchedJsonLike) {
            session.matchedRequestIds.delete(requestId)
            session.requestUrlById.delete(requestId)
          }
          return
        }

        if (method !== 'Network.loadingFinished') {
          return
        }

        const requestId = String(params?.requestId || '')
        if (!requestId || !session.matchedRequestIds.has(requestId) || session.processedRequestIds.has(requestId)) {
          return
        }

        session.processedRequestIds.add(requestId)
        const task = (async () => {
          try {
            const responseBody = (await webContents.debugger.sendCommand('Network.getResponseBody', {
              requestId
            })) as { body?: string; base64Encoded?: boolean }

            const rawBody = responseBody.base64Encoded
              ? Buffer.from(String(responseBody.body || ''), 'base64').toString('utf8')
              : String(responseBody.body || '')
            if (!rawBody) return

            const parsedBody = JSON.parse(rawBody)
            session.responses.push({
              url: session.requestUrlById.get(requestId) || '',
              body: parsedBody,
              captured_at: new Date().toISOString()
            })
          } catch (error) {
            this.logger.warn(`样品管理 API 响应解析失败: ${(error as Error)?.message || error}`)
          }
        })()

        session.pendingTasks.add(task)
        void task.finally(() => {
          session.pendingTasks.delete(task)
          session.matchedRequestIds.delete(requestId)
          session.requestUrlById.delete(requestId)
        })
      }
    }

    webContents.debugger.on('message', session.listener)
    this.captureSessions.set(captureKey, session)
    this.logger.info(`启动样品管理 API 捕获: key=${captureKey} urlIncludes=${urlIncludes}`)
  }

  public async disposeJsonResponseCaptureSession(
    webContents: WebContents,
    captureKey: string
  ): Promise<CapturedJsonResponse[]> {
    const session = this.captureSessions.get(captureKey)
    if (!session) return []

    if (!webContents.isDestroyed() && webContents.debugger.isAttached()) {
      webContents.debugger.off('message', session.listener)
    }

    await Promise.allSettled(Array.from(session.pendingTasks))
    this.captureSessions.delete(captureKey)
    return session.responses
  }

  public getResponses(captureKey: string): CapturedJsonResponse[] {
    return this.captureSessions.get(captureKey)?.responses ?? []
  }

  public async waitForNextParsedResponse<T>(options: {
    captureKey: string
    responseCursor: number
    timeoutMs: number
    parse: (captured: CapturedJsonResponse, responseIndex: number) => { key: string; value: T } | null
    knownKeys?: Set<string>
  }): Promise<{ key: string; value: T; nextCursor: number } | null> {
    const deadline = Date.now() + options.timeoutMs
    let cursor = options.responseCursor

    while (Date.now() < deadline) {
      const responses = this.getResponses(options.captureKey)

      while (cursor < responses.length) {
        const captured = responses[cursor]
        const currentIndex = cursor
        cursor += 1
        const parsed = options.parse(captured, currentIndex)
        if (!parsed) {
          continue
        }
        if (options.knownKeys?.has(parsed.key)) {
          continue
        }
        return {
          ...parsed,
          nextCursor: cursor
        }
      }

      await sleep(250)
    }

    return null
  }

  private async ensureNetworkDebuggerReady(webContents: WebContents): Promise<void> {
    if (!webContents.debugger.isAttached()) {
      webContents.debugger.attach('1.3')
    }
    await webContents.debugger.sendCommand('Network.enable')
  }
}
