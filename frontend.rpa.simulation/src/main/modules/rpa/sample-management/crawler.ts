import { WebContents } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import * as XLSX from 'xlsx'
import { logger } from '../../../utils/logger'
import { SampleManagementExportResult, SampleManagementRow, SampleManagementTabCrawlResult, SampleManagementTabKey } from './types'

const SAMPLE_GROUP_LIST_URL = '/api/v1/affiliate/sample/group/list'
const SAMPLE_PERFORMANCE_URL = '/api/v1/affiliate/sample/performance'
const SAMPLE_TABLE_SELECTOR = '.arco-table'
const SAMPLE_NEXT_SELECTOR = 'li.arco-pagination-item-next'
const SAMPLE_DRAWER_SELECTOR = '.arco-drawer'
const SAMPLE_DRAWER_CLOSE_SELECTOR = '.arco-drawer-close-icon'

const TAB_CONFIG: Record<
  SampleManagementTabKey,
  {
    displayName: string
    status: string
    sheetName: string
  }
> = {
  to_review: {
    displayName: 'To review',
    status: 'ready to review',
    sheetName: 'to_review'
  },
  ready_to_ship: {
    displayName: 'Ready to ship',
    status: 'ready to ship',
    sheetName: 'ready_to_ship'
  },
  shipped: {
    displayName: 'Shipped',
    status: 'shipped',
    sheetName: 'shipped'
  },
  in_progress: {
    displayName: 'In progress',
    status: 'content pending',
    sheetName: 'in_progress'
  },
  completed: {
    displayName: 'Completed',
    status: 'completed',
    sheetName: 'completed'
  }
}

interface CapturedJsonResponse {
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

interface ParsedSampleManagementPage {
  rows: SampleManagementRow[]
  hasMore?: boolean
  pageSignature: string
}

interface SampleManagementContentItem {
  content_type: string
  content_id: string
  cover_img: string
  content_title: string
  content_like: number | null
  content_order: number | null
  content_url: string
  content_view: number | null
  comment_num: number | null
  content_time: string
}

interface GroupItemsExtractionResult {
  found: boolean
  items: Array<Record<string, unknown>>
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export class SampleManagementCrawler {
  private readonly sheetColumns: Record<SampleManagementTabKey, Array<keyof SampleManagementRow>> = {
    to_review: [
      'crawl_time',
      'tab',
      'status',
      'page_index',
      'group_index',
      'request_index',
      'group_id',
      'creator_id',
      'creator_name',
      'sample_request_id',
      'product_name',
      'product_id',
      'sku_id',
      'sku_desc',
      'sku_image',
      'commission_rate',
      'commission_rate_text',
      'region',
      'sku_stock',
      'expired_in_ms',
      'expired_in_text',
      'content_summary'
    ],
    ready_to_ship: [
      'crawl_time',
      'tab',
      'status',
      'page_index',
      'group_index',
      'request_index',
      'group_id',
      'creator_id',
      'creator_name',
      'sample_request_id',
      'product_name',
      'product_id',
      'sku_id',
      'sku_desc',
      'sku_image',
      'commission_rate',
      'commission_rate_text',
      'region',
      'sku_stock',
      'expired_in_ms',
      'expired_in_text',
      'content_summary'
    ],
    shipped: [
      'crawl_time',
      'tab',
      'status',
      'page_index',
      'group_index',
      'request_index',
      'group_id',
      'creator_id',
      'creator_name',
      'sample_request_id',
      'product_name',
      'product_id',
      'sku_id',
      'sku_desc',
      'sku_image',
      'commission_rate',
      'commission_rate_text',
      'region',
      'sku_stock',
      'expired_in_ms',
      'expired_in_text',
      'content_summary'
    ],
    in_progress: [
      'crawl_time',
      'tab',
      'status',
      'page_index',
      'group_index',
      'request_index',
      'group_id',
      'creator_id',
      'creator_name',
      'sample_request_id',
      'product_name',
      'product_id',
      'sku_id',
      'sku_desc',
      'sku_image',
      'commission_rate',
      'commission_rate_text',
      'region',
      'sku_stock',
      'expired_in_ms',
      'expired_in_text',
      'content_summary'
    ],
    completed: [
      'crawl_time',
      'tab',
      'status',
      'page_index',
      'group_index',
      'request_index',
      'group_id',
      'creator_id',
      'creator_name',
      'sample_request_id',
      'product_name',
      'product_id',
      'sku_id',
      'sku_desc',
      'sku_image',
      'commission_rate',
      'commission_rate_text',
      'region',
      'sku_stock',
      'expired_in_ms',
      'expired_in_text',
      'content_summary'
    ]
  }

  public async crawlTabsAndExportExcel(
    webContents: WebContents,
    options?: { tabs?: SampleManagementTabKey[] }
  ): Promise<SampleManagementExportResult> {
    const requestedTabs =
      options?.tabs && options.tabs.length > 0
        ? options.tabs
        : (['to_review', 'ready_to_ship', 'shipped', 'in_progress', 'completed'] as const)

    const results = new Map<SampleManagementTabKey, SampleManagementTabCrawlResult>()
    let firstTab = true

    for (const tab of requestedTabs) {
      logger.info(`开始抓取样品管理 tab: ${TAB_CONFIG[tab].displayName}`)
      const result = await this.crawlTabViaApi(webContents, tab, {
        reloadBeforeCapture: firstTab
      })
      results.set(tab, result)
      logger.info(
        `样品管理 tab 抓取完成: tab=${TAB_CONFIG[tab].displayName} rows=${result.rows.length} pages=${result.pages_visited} responses=${result.responses_captured} stop_reason=${result.stop_reason}`
      )
      firstTab = false
    }

    const toReview = results.get('to_review') || this.emptyTabResult('to_review', 'tab_not_selected_by_task')
    const readyToShip = results.get('ready_to_ship') || this.emptyTabResult('ready_to_ship', 'tab_not_selected_by_task')
    const shipped = results.get('shipped') || this.emptyTabResult('shipped', 'tab_not_selected_by_task')
    const inProgress = results.get('in_progress') || this.emptyTabResult('in_progress', 'tab_not_selected_by_task')
    const completed = results.get('completed') || this.emptyTabResult('completed', 'tab_not_selected_by_task')

    const excelPath = this.exportWorkbook(toReview, readyToShip, shipped, inProgress, completed)
    logger.info(`样品管理数据已导出 Excel: ${excelPath}`)

    return {
      to_review: toReview,
      ready_to_ship: readyToShip,
      shipped,
      in_progress: inProgress,
      completed,
      excel_path: excelPath
    }
  }

  private async crawlTabViaApi(
    webContents: WebContents,
    tab: SampleManagementTabKey,
    options: { reloadBeforeCapture: boolean }
  ): Promise<SampleManagementTabCrawlResult> {
    const captureKey = `sample_management_${tab}_${Date.now()}`
    const knownPageSignatures = new Set<string>()
    const pageSignatures: string[] = []
    const rows: SampleManagementRow[] = []
    const config = TAB_CONFIG[tab]
    let responseCursor = 0
    let pageIndex = 1
    let stopReason = 'completed'
    let responses: CapturedJsonResponse[] = []

    await this.startJsonResponseCapture(webContents, {
      captureKey,
      urlIncludes: SAMPLE_GROUP_LIST_URL,
      method: 'GET'
    })

    try {
      if (options.reloadBeforeCapture) {
        await this.reloadCurrentPage(webContents)
      }

      const pageReady = await this.waitForSamplePageReady(webContents)
      if (!pageReady) {
        stopReason = 'page_not_ready'
        return {
          tab,
          rows,
          pages_visited: 0,
          responses_captured: 0,
          stop_reason: stopReason,
          page_signatures: pageSignatures
        }
      }

      const tabReady = await this.ensureTabSelected(webContents, config.displayName)
      if (!tabReady) {
        stopReason = `${tab}_tab_not_found`
        return {
          tab,
          rows,
          pages_visited: 0,
          responses_captured: 0,
          stop_reason: stopReason,
          page_signatures: pageSignatures
        }
      }

      const hardMaxPages = 200
      while (pageIndex <= hardMaxPages) {
        const nextPage = await this.waitForNextSamplePage({
          captureKey,
          responseCursor,
          knownPageSignatures,
          pageIndex,
          tab,
          timeoutMs: pageIndex === 1 ? 30000 : 20000
        })

        if (!nextPage) {
          stopReason = pageIndex === 1 ? 'no_api_response' : 'no_new_unique_response'
          break
        }

        responseCursor = nextPage.nextCursor
        knownPageSignatures.add(nextPage.page.pageSignature)
        pageSignatures.push(nextPage.page.pageSignature)
        if (tab === 'completed' && nextPage.page.rows.length > 0) {
          await this.enrichCompletedRowsWithContentSummary(webContents, nextPage.page.rows)
        }

        rows.push(...nextPage.page.rows)

        if (nextPage.page.hasMore === false) {
          stopReason = 'api_has_more_false'
          break
        }

        const moved = await this.clickPaginationNext(webContents)
        if (!moved) {
          stopReason = 'pagination_next_disabled'
          break
        }

        pageIndex += 1
      }

      if (pageIndex > hardMaxPages) {
        stopReason = 'hard_max_pages_reached'
      }
    } finally {
      responses = await this.disposeJsonResponseCaptureSession(webContents, captureKey)
    }

    return {
      tab,
      rows,
      pages_visited: pageSignatures.length,
      responses_captured: responses.length,
      stop_reason: stopReason,
      page_signatures: pageSignatures
    }
  }

  private emptyTabResult(tab: SampleManagementTabKey, stopReason: string): SampleManagementTabCrawlResult {
    return {
      tab,
      rows: [],
      pages_visited: 0,
      responses_captured: 0,
      stop_reason: stopReason,
      page_signatures: []
    }
  }

  private async startJsonResponseCapture(
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
            logger.warn(`样品管理 API 响应解析失败: ${(error as Error)?.message || error}`)
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
    logger.info(`启动样品管理 API 捕获: key=${captureKey} urlIncludes=${urlIncludes}`)
  }

  private async waitForNextSamplePage(options: {
    captureKey: string
    responseCursor: number
    knownPageSignatures: Set<string>
    pageIndex: number
    tab: SampleManagementTabKey
    timeoutMs: number
  }): Promise<{ page: ParsedSampleManagementPage; nextCursor: number } | null> {
    const deadline = Date.now() + options.timeoutMs
    let cursor = options.responseCursor

    while (Date.now() < deadline) {
      const session = this.captureSessions.get(options.captureKey)
      if (!session) {
        throw new Error(`样品管理 API 捕获会话不存在: ${options.captureKey}`)
      }

      while (cursor < session.responses.length) {
        const captured = session.responses[cursor]
        cursor += 1
        const parsed = this.parseSamplePayload(captured.body, options.pageIndex, options.tab)
        if (!parsed) {
          continue
        }
        if (options.knownPageSignatures.has(parsed.pageSignature)) {
          continue
        }
        return {
          page: parsed,
          nextCursor: cursor
        }
      }

      await sleep(250)
    }

    return null
  }

  private parseSamplePayload(payload: unknown, pageIndex: number, tab: SampleManagementTabKey): ParsedSampleManagementPage | null {
    const config = TAB_CONFIG[tab]
    const extraction = this.extractGroupItems(payload)
    const hasMore = this.readHasMoreFlag(payload)

    if (!extraction.found) {
      return null
    }

    if (extraction.items.length === 0) {
      return {
        rows: [],
        hasMore,
        pageSignature: `empty|${config.sheetName}|${pageIndex}`
      }
    }

    const rows: SampleManagementRow[] = []

    extraction.items.forEach((item, groupIndex) => {
      const groupRecord = this.readRecordAtPath(item, 'apply_group') ?? item
      const creatorInfo =
        this.readRecordAtPath(groupRecord, 'creator_info') ||
        this.readRecordAtPath(item, 'creator_info') ||
        this.readRecordAtPath(item, 'apply_detail.creator_info') ||
        this.readRecordAtPath(item, 'apply_deatil.creator_info') ||
        {}

      const creatorId = this.toText(creatorInfo.creator_id)
      const creatorName = this.toText(creatorInfo.name)
      const groupId = this.toText(groupRecord.group_id) || creatorId
      const applyInfos = this.extractApplyInfos(item)

      applyInfos.forEach((applyInfo, requestIndex) => {
        const requestId = this.toText(applyInfo.apply_id)
        const commissionRaw =
          this.toText(applyInfo.commission_rate) ||
          this.toText(this.readValueAtPath(applyInfo, 'standard_commission.fixed_commission_rate'))
        const commissionRate = this.parseCommissionRate(commissionRaw)
        const expiredInMs = this.toNullableNumber(applyInfo.expired_in)
        const region = this.toText(applyInfo.region) || this.toText(groupRecord.region) || this.toText(creatorInfo.region)

        rows.push({
          crawl_time: new Date().toISOString(),
          tab: config.displayName,
          status: config.status,
          page_index: pageIndex,
          group_index: groupIndex + 1,
          request_index: requestIndex + 1,
          group_id: groupId,
          creator_id: creatorId,
          creator_name: creatorName,
          sample_request_id: requestId,
          product_name: this.toText(applyInfo.product_title),
          product_id: this.toText(applyInfo.product_id),
          sku_id: this.toText(applyInfo.sku_id),
          sku_desc: this.toText(applyInfo.sku_desc),
          sku_image: this.toText(applyInfo.sku_image),
          commission_rate: commissionRate,
          commission_rate_text: commissionRate === null ? '' : `${commissionRate}%`,
          region,
          sku_stock: this.toNullableNumber(applyInfo.sku_stock),
          expired_in_ms: expiredInMs,
          expired_in_text: this.formatDuration(expiredInMs),
          content_summary: ''
        })
      })
    })

    const pageSignature =
      rows.length > 0
        ? rows
            .map((row) => `${row.group_id}|${row.sample_request_id || 'none'}`)
            .join('||')
        : `empty_rows|${config.sheetName}|${pageIndex}`

    return {
      rows,
      hasMore,
      pageSignature
    }
  }

  private extractGroupItems(payload: unknown): GroupItemsExtractionResult {
    const candidatePaths = [
      'data.list',
      'data.group_list',
      'data.apply_group_list',
      'data.sample_group_list',
      'data.sample_apply_group_list',
      'data.groups',
      'list',
      'group_list',
      'apply_group_list',
      'sample_group_list',
      'sample_apply_group_list'
    ]

    for (const path of candidatePaths) {
      const value = this.readValueAtPath(payload, path)
      if (Array.isArray(value)) {
        return {
          found: true,
          items: value.filter((entry): entry is Record<string, unknown> => this.looksLikeGroupRecord(entry))
        }
      }
    }

    const recursiveFound = this.findGroupRecordArrayRecursively(payload, 0)
    if (recursiveFound.found) {
      return recursiveFound
    }

    if (this.looksLikeGroupRecord(payload)) {
      return {
        found: true,
        items: [payload as Record<string, unknown>]
      }
    }

    return {
      found: false,
      items: []
    }
  }

  private extractApplyInfos(item: Record<string, unknown>): Array<Record<string, unknown>> {
    const directArrays = [
      this.readValueAtPath(item, 'apply_infos'),
      this.readValueAtPath(item, 'apply_info_list'),
      this.readValueAtPath(item, 'apply_group.apply_infos')
    ]

    for (const candidate of directArrays) {
      if (Array.isArray(candidate)) {
        return candidate.filter((entry): entry is Record<string, unknown> => this.isRecord(entry))
      }
    }

    const singleCandidates = [
      this.readRecordAtPath(item, 'apply_detail.apply_info'),
      this.readRecordAtPath(item, 'apply_deatil.apply_info')
    ].filter((entry): entry is Record<string, unknown> => this.isRecord(entry))

    return singleCandidates
  }

  private findGroupRecordArrayRecursively(value: unknown, depth: number): GroupItemsExtractionResult {
    if (depth > 5) {
      return { found: false, items: [] }
    }

    if (Array.isArray(value)) {
      const items = value.filter((entry): entry is Record<string, unknown> => this.looksLikeGroupRecord(entry))
      if (items.length > 0) {
        return { found: true, items }
      }
      for (const entry of value) {
        const found = this.findGroupRecordArrayRecursively(entry, depth + 1)
        if (found.found) return found
      }
      return { found: false, items: [] }
    }

    if (!this.isRecord(value)) {
      return { found: false, items: [] }
    }

    for (const entry of Object.values(value)) {
      const found = this.findGroupRecordArrayRecursively(entry, depth + 1)
      if (found.found) return found
    }

    return { found: false, items: [] }
  }

  private looksLikeGroupRecord(value: unknown): value is Record<string, unknown> {
    if (!this.isRecord(value)) {
      return false
    }

    return Boolean(
      value.apply_group ||
        value.apply_infos ||
        value.apply_detail ||
        value.apply_deatil ||
        (value.group_id && value.creator_info)
    )
  }

  private readHasMoreFlag(payload: unknown): boolean | undefined {
    const candidatePaths = ['data.has_more', 'pagination.has_more', 'next_pagination.has_more', 'has_more']
    for (const path of candidatePaths) {
      const value = this.readValueAtPath(payload, path)
      if (typeof value === 'boolean') {
        return value
      }
    }
    return undefined
  }

  private readValueAtPath(source: unknown, path: string): unknown {
    if (!path) return source
    return path.split('.').reduce<unknown>((current, segment) => {
      if (current === null || current === undefined) return undefined
      if (Array.isArray(current) && /^\d+$/.test(segment)) {
        return current[Number(segment)]
      }
      if (typeof current === 'object') {
        return (current as Record<string, unknown>)[segment]
      }
      return undefined
    }, source)
  }

  private readRecordAtPath(source: unknown, path: string): Record<string, unknown> | null {
    const value = this.readValueAtPath(source, path)
    return this.isRecord(value) ? value : null
  }

  private parseCommissionRate(value: string): number | null {
    const numeric = Number(String(value || '').trim())
    if (!Number.isFinite(numeric)) {
      return null
    }
    return Number((numeric / 100).toFixed(2))
  }

  private formatDuration(durationMs: number | null): string {
    if (!Number.isFinite(durationMs) || durationMs === null || durationMs < 0) {
      return ''
    }

    const totalSeconds = Math.floor(durationMs / 1000)
    const days = Math.floor(totalSeconds / 86400)
    const hours = Math.floor((totalSeconds % 86400) / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    return `${days}天 ${hours}小时 ${minutes}分 ${seconds}秒`
  }

  private toText(value: unknown): string {
    return String(value ?? '').trim()
  }

  private toNullableNumber(value: unknown): number | null {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : null
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }

  private async ensureNetworkDebuggerReady(webContents: WebContents): Promise<void> {
    if (!webContents.debugger.isAttached()) {
      webContents.debugger.attach('1.3')
    }
    await webContents.debugger.sendCommand('Network.enable')
  }

  private async disposeJsonResponseCaptureSession(
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

  private async reloadCurrentPage(webContents: WebContents): Promise<void> {
    await new Promise<void>((resolve) => {
      let settled = false
      const timer = setTimeout(() => finish(), 30000)
      const finish = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve()
      }

      webContents.once('did-finish-load', finish)
      try {
        webContents.reload()
      } catch {
        finish()
      }
    })
  }

  private async waitForSamplePageReady(webContents: WebContents): Promise<boolean> {
    const timeoutMs = 30000
    const startedAt = Date.now()

    while (Date.now() - startedAt < timeoutMs) {
      const ready = await webContents.executeJavaScript(
        `(() => {
          const href = String(location.href || '')
          const bodyText = String(document.body?.innerText || '')
          return href.includes('/product/sample-request') && bodyText.includes('To review') && Boolean(document.querySelector(${JSON.stringify(
            SAMPLE_TABLE_SELECTOR
          )}))
        })()`,
        true
      )

      if (Boolean(ready)) {
        return true
      }

      await sleep(250)
    }

    return false
  }

  private async ensureTabSelected(webContents: WebContents, label: string): Promise<boolean> {
    return Boolean(
      await webContents.executeJavaScript(
        `(() => {
          const targetLabel = ${JSON.stringify(label)}
          const normalize = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
          const expected = normalize(targetLabel)
          const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
          const extractTitle = (node) =>
            normalize(node.querySelector('.m4b-tabs-pane-title-content')?.textContent || node.textContent).replace(/\s*\d+\s*$/, '')
          const isSelected = (node) =>
            node.getAttribute('aria-selected') === 'true' || String(node.getAttribute('class') || '').includes('arco-tabs-header-title-active')

          return (async () => {
            const tabs = Array.from(document.querySelectorAll('[role="tab"], .arco-tabs-header-title'))
            const target = tabs.find((node) => extractTitle(node) === expected)
            if (!target) return false
            if (!isSelected(target)) {
              const html = target instanceof HTMLElement ? target : target.querySelector('.m4b-tabs-pane-title-content') || target
              if (html instanceof HTMLElement) {
                html.click()
              } else if (typeof target.click === 'function') {
                target.click()
              } else {
                target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
              }
              await sleep(1000)
            }
            return isSelected(target)
          })()
        })()`,
        true
      )
    )
  }

  private async clickPaginationNext(webContents: WebContents): Promise<boolean> {
    return Boolean(
      await webContents.executeJavaScript(
        `(() => {
          const nextButton = document.querySelector(${JSON.stringify(SAMPLE_NEXT_SELECTOR)})
          if (!nextButton) return false
          const className = String(nextButton.getAttribute('class') || '')
          const disabled = nextButton.getAttribute('aria-disabled') === 'true' || className.includes('arco-pagination-item-disabled')
          if (disabled) return false
          if (typeof nextButton.click === 'function') {
            nextButton.click()
          } else {
            nextButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
          }
          return true
        })()`,
        true
      )
    )
  }

  private async enrichCompletedRowsWithContentSummary(
    webContents: WebContents,
    rows: SampleManagementRow[]
  ): Promise<void> {
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex]
      row.content_summary = await this.collectCompletedContentSummaryForRow(webContents, row, rowIndex)
    }
  }

  private async collectCompletedContentSummaryForRow(
    webContents: WebContents,
    row: SampleManagementRow,
    rowIndex: number
  ): Promise<string> {
    const emptySummary = JSON.stringify({ count: 0, items: [] })
    if (!row.sample_request_id) {
      return emptySummary
    }

    const captureKey = `sample_management_completed_content_${row.sample_request_id}_${Date.now()}`
    await this.startJsonResponseCapture(webContents, {
      captureKey,
      urlIncludes: SAMPLE_PERFORMANCE_URL,
      method: 'GET'
    })

    let responses: CapturedJsonResponse[] = []
    try {
      const opened = await this.openCompletedViewContentDrawer(webContents, row, rowIndex)
      if (!opened) {
        logger.warn(`样品管理 Completed 内容抓取失败：未打开侧边页 request=${row.sample_request_id}`)
        return emptySummary
      }

      const drawerReady = await this.waitForSelectorState(webContents, SAMPLE_DRAWER_SELECTOR, 'present', 10000, 200)
      if (!drawerReady) {
        logger.warn(`样品管理 Completed 内容抓取失败：侧边页未出现 request=${row.sample_request_id}`)
        return emptySummary
      }

      await sleep(1200)
      const clickedVideo = await this.clickDrawerTabByText(webContents, 'Video')
      if (clickedVideo) {
        await sleep(1200)
      }

      const clickedLive = await this.clickDrawerTabByText(webContents, 'LIVE')
      if (clickedLive) {
        await sleep(1200)
      }
    } finally {
      responses = await this.disposeJsonResponseCaptureSession(webContents, captureKey)
      await this.closeDrawerIfOpen(webContents)
    }

    const items = this.extractPerformanceSummaryItems(responses, row.sample_request_id)
    return JSON.stringify({
      count: items.length,
      items
    })
  }

  private async openCompletedViewContentDrawer(
    webContents: WebContents,
    row: SampleManagementRow,
    rowIndex: number
  ): Promise<boolean> {
    return Boolean(
      await webContents.executeJavaScript(
        `(() => {
          const rowIndex = ${JSON.stringify(rowIndex)}
          const creatorName = ${JSON.stringify(row.creator_name)}
          const productName = ${JSON.stringify(row.product_name)}
          const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim().toLowerCase()
          const isVisible = (node) => {
            if (!(node instanceof HTMLElement)) return false
            const style = window.getComputedStyle(node)
            if (style.display === 'none' || style.visibility === 'hidden') return false
            return node.offsetParent !== null || style.position === 'fixed'
          }

          const rows = Array.from(document.querySelectorAll('tr.arco-table-tr')).filter(isVisible)
          const expectedCreator = normalize(creatorName)
          const expectedCreatorAt = expectedCreator.startsWith('@') ? expectedCreator : '@' + expectedCreator
          const expectedProduct = normalize(productName)

          let targetRow =
            rows.find((rowNode) => {
              const text = normalize(rowNode.textContent)
              const creatorMatched = !expectedCreator || text.includes(expectedCreator) || text.includes(expectedCreatorAt)
              const productMatched = !expectedProduct || text.includes(expectedProduct)
              return creatorMatched && productMatched
            }) || rows[rowIndex] || null

          if (!(targetRow instanceof HTMLElement)) {
            return false
          }

          targetRow.scrollIntoView({ block: 'center', inline: 'nearest' })
          const actionNodes = Array.from(targetRow.querySelectorAll('div[data-e2e="e197794d-b324-d3da"]'))
          const viewContentNode =
            actionNodes.find((node) => normalize(node.textContent).includes('view content')) || null
          if (!(viewContentNode instanceof HTMLElement)) {
            return false
          }

          viewContentNode.scrollIntoView({ block: 'center', inline: 'nearest' })
          viewContentNode.click()
          return true
        })()`,
        true
      )
    )
  }

  private async clickDrawerTabByText(webContents: WebContents, label: string): Promise<boolean> {
    return Boolean(
      await webContents.executeJavaScript(
        `(() => {
          const label = ${JSON.stringify(label)}
          const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim().toLowerCase()
          const isVisible = (node) => {
            if (!(node instanceof HTMLElement)) return false
            const style = window.getComputedStyle(node)
            if (style.display === 'none' || style.visibility === 'hidden') return false
            return node.offsetParent !== null || style.position === 'fixed'
          }

          const drawers = Array.from(document.querySelectorAll('.arco-drawer')).filter(isVisible)
          const drawer = drawers[drawers.length - 1]
          if (!(drawer instanceof HTMLElement)) {
            return false
          }

          const tabs = Array.from(drawer.querySelectorAll('[role="tab"], .arco-tabs-header-title'))
          const target = tabs.find((tab) => normalize(tab.textContent).includes(normalize(label)))
          if (!(target instanceof HTMLElement)) {
            return false
          }

          target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
          target.click()
          return true
        })()`,
        true
      )
    )
  }

  private async closeDrawerIfOpen(webContents: WebContents): Promise<void> {
    const closed = await webContents.executeJavaScript(
      `(() => {
        const isVisible = (node) => {
          if (!(node instanceof HTMLElement)) return false
          const style = window.getComputedStyle(node)
          if (style.display === 'none' || style.visibility === 'hidden') return false
          return node.offsetParent !== null || style.position === 'fixed'
        }
        const closeNode = Array.from(document.querySelectorAll(${JSON.stringify(SAMPLE_DRAWER_CLOSE_SELECTOR)})).find(isVisible)
        if (!(closeNode instanceof HTMLElement)) {
          return false
        }
        closeNode.click()
        return true
      })()`,
      true
    )

    if (closed) {
      await this.waitForSelectorState(webContents, SAMPLE_DRAWER_SELECTOR, 'absent', 5000, 150)
    }
  }

  private async waitForSelectorState(
    webContents: WebContents,
    selector: string,
    state: 'present' | 'visible' | 'absent' | 'hidden',
    timeoutMs: number,
    intervalMs: number
  ): Promise<boolean> {
    return Boolean(
      await webContents.executeJavaScript(
        `(() => {
          const selector = ${JSON.stringify(selector)}
          const state = ${JSON.stringify(state)}
          const timeoutMs = ${JSON.stringify(timeoutMs)}
          const intervalMs = ${JSON.stringify(intervalMs)}

          const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
          const isVisible = (element) => {
            if (!(element instanceof HTMLElement)) return false
            const style = window.getComputedStyle(element)
            if (style.display === 'none' || style.visibility === 'hidden') return false
            return element.offsetParent !== null || style.position === 'fixed'
          }
          const match = () => {
            const nodes = Array.from(document.querySelectorAll(selector))
            if (state === 'present') return nodes.length > 0
            if (state === 'visible') return nodes.some((node) => isVisible(node))
            if (state === 'absent') return nodes.length === 0
            if (state === 'hidden') return nodes.length > 0 && nodes.every((node) => !isVisible(node))
            return false
          }

          return (async () => {
            const startedAt = Date.now()
            while (Date.now() - startedAt < timeoutMs) {
              if (match()) return true
              await sleep(intervalMs)
            }
            return false
          })()
        })()`,
        true
      )
    )
  }

  private extractPerformanceSummaryItems(
    responses: CapturedJsonResponse[],
    sampleRequestId: string
  ): SampleManagementContentItem[] {
    const items: SampleManagementContentItem[] = []
    const seenKeys = new Set<string>()

    for (const response of responses) {
      const applyId = this.readQueryParam(response.url, 'apply_id')
      if (applyId !== sampleRequestId) {
        continue
      }

      const performanceItems = this.extractPerformanceItems(response.body)
      for (const performanceItem of performanceItems) {
        const contentId = this.toText(performanceItem.content_id)
        const contentType = this.toContentTypeText(performanceItem.content_type)
        const key = `${contentType}|${contentId}`
        if (!contentId || seenKeys.has(key)) {
          continue
        }
        seenKeys.add(key)

        const createTime = this.toNullableNumber(performanceItem.create_time)
        const finishTime = this.toNullableNumber(performanceItem.finish_time)
        const contentTime =
          finishTime && finishTime > 0
            ? `${this.formatTimestamp(createTime)} ~ ${this.formatTimestamp(finishTime)}`
            : this.formatTimestamp(createTime)

        items.push({
          content_type: contentType,
          content_id: contentId,
          cover_img: this.toText(performanceItem.cover_img),
          content_title: this.toText(performanceItem.desc),
          content_like: this.toNullableNumber(performanceItem.like_num),
          content_order: this.toNullableNumber(performanceItem.paid_order_num),
          content_url: this.toText(performanceItem.source_url),
          content_view: this.toNullableNumber(performanceItem.view_num),
          comment_num: this.toNullableNumber(performanceItem.comment_num),
          content_time: contentTime
        })
      }
    }

    return items
  }

  private extractPerformanceItems(payload: unknown): Array<Record<string, unknown>> {
    const directCandidates = [payload, this.readValueAtPath(payload, 'data.list'), this.readValueAtPath(payload, 'list')]
    for (const candidate of directCandidates) {
      if (Array.isArray(candidate)) {
        return candidate.filter((entry): entry is Record<string, unknown> => this.looksLikePerformanceItem(entry))
      }
    }

    return this.findPerformanceItemsRecursively(payload, 0)
  }

  private findPerformanceItemsRecursively(value: unknown, depth: number): Array<Record<string, unknown>> {
    if (depth > 5) {
      return []
    }

    if (Array.isArray(value)) {
      const items = value.filter((entry): entry is Record<string, unknown> => this.looksLikePerformanceItem(entry))
      if (items.length > 0) {
        return items
      }
      for (const entry of value) {
        const found = this.findPerformanceItemsRecursively(entry, depth + 1)
        if (found.length > 0) {
          return found
        }
      }
      return []
    }

    if (!this.isRecord(value)) {
      return []
    }

    for (const entry of Object.values(value)) {
      const found = this.findPerformanceItemsRecursively(entry, depth + 1)
      if (found.length > 0) {
        return found
      }
    }

    return []
  }

  private looksLikePerformanceItem(value: unknown): value is Record<string, unknown> {
    if (!this.isRecord(value)) {
      return false
    }
    return Boolean(value.content_id && value.content_type)
  }

  private readQueryParam(url: string, key: string): string {
    try {
      return new URL(url).searchParams.get(key) || ''
    } catch {
      return ''
    }
  }

  private toContentTypeText(value: unknown): string {
    const numeric = Number(value)
    if (numeric === 1) return 'live'
    if (numeric === 2) return 'video'
    return this.toText(value)
  }

  private formatTimestamp(value: number | null): string {
    if (!Number.isFinite(value) || value === null || value <= 0) {
      return ''
    }

    const date = new Date(value)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hour = String(date.getHours()).padStart(2, '0')
    const minute = String(date.getMinutes()).padStart(2, '0')
    const second = String(date.getSeconds()).padStart(2, '0')
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`
  }

  private exportWorkbook(
    toReview: SampleManagementTabCrawlResult,
    readyToShip: SampleManagementTabCrawlResult,
    shipped: SampleManagementTabCrawlResult,
    inProgress: SampleManagementTabCrawlResult,
    completed: SampleManagementTabCrawlResult
  ): string {
    const exportDir = join(process.cwd(), 'data', 'sample-management')
    mkdirSync(exportDir, { recursive: true })

    const timestamp = this.buildTimestamp()
    const filePath = join(exportDir, `xunda_sample_management_${timestamp}.xlsx`)

    const workbook = XLSX.utils.book_new()
    this.appendSheet(workbook, TAB_CONFIG.to_review.sheetName, toReview.rows, this.sheetColumns.to_review)
    this.appendSheet(workbook, TAB_CONFIG.ready_to_ship.sheetName, readyToShip.rows, this.sheetColumns.ready_to_ship)
    this.appendSheet(workbook, TAB_CONFIG.shipped.sheetName, shipped.rows, this.sheetColumns.shipped)
    this.appendSheet(workbook, TAB_CONFIG.in_progress.sheetName, inProgress.rows, this.sheetColumns.in_progress)
    this.appendSheet(workbook, TAB_CONFIG.completed.sheetName, completed.rows, this.sheetColumns.completed)
    XLSX.writeFile(workbook, filePath)

    return filePath
  }

  private appendSheet(
    workbook: XLSX.WorkBook,
    sheetName: string,
    rows: SampleManagementRow[],
    columns: Array<keyof SampleManagementRow>
  ): void {
    const orderedRows = rows.map((row) => {
      const current: Record<string, string | number | null> = {}
      columns.forEach((column) => {
        current[column] = row[column]
      })
      return current
    })

    const worksheet = XLSX.utils.json_to_sheet(orderedRows, {
      header: columns as string[]
    })
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
  }

  private buildTimestamp(): string {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const hour = String(now.getHours()).padStart(2, '0')
    const minute = String(now.getMinutes()).padStart(2, '0')
    const second = String(now.getSeconds()).padStart(2, '0')
    return `${year}${month}${day}_${hour}${minute}${second}`
  }

  private readonly captureSessions = new Map<string, JsonResponseCaptureSession>()
}
