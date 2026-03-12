import { WebContents } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import * as XLSX from 'xlsx'
import { logger } from '../../../utils/logger'
import { SampleManagementCaptureManager, type CapturedJsonResponse } from './capture'
import {
  SAMPLE_DRAWER_SELECTOR,
  SAMPLE_GROUP_LIST_URL,
  SAMPLE_MANAGEMENT_SHEET_COLUMNS,
  SAMPLE_MANAGEMENT_TAB_KEYS,
  SAMPLE_PERFORMANCE_URL,
  TAB_CONFIG
} from './config'
import {
  clickDrawerTabByText,
  clickPaginationNext,
  closeDrawerIfOpen,
  ensureTabSelected,
  openCompletedViewContentDrawer,
  reloadCurrentPage,
  waitForSamplePageReady,
  waitForSelectorState
} from './page'
import { extractPerformanceSummaryItems, parseSamplePayload, type ParsedSampleManagementPage } from './parser'
import { SampleManagementExportResult, SampleManagementRow, SampleManagementTabCrawlResult, SampleManagementTabKey } from './types'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export class SampleManagementCrawler {
  private readonly captureManager = new SampleManagementCaptureManager(logger)

  public async crawlTabsAndExportExcel(
    webContents: WebContents,
    options?: { tabs?: SampleManagementTabKey[] }
  ): Promise<SampleManagementExportResult> {
    const requestedTabs =
      options?.tabs && options.tabs.length > 0 ? options.tabs : SAMPLE_MANAGEMENT_TAB_KEYS

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

    await this.captureManager.startJsonResponseCapture(webContents, {
      captureKey,
      urlIncludes: SAMPLE_GROUP_LIST_URL,
      method: 'GET'
    })

    try {
      if (options.reloadBeforeCapture) {
        await reloadCurrentPage(webContents)
      }

      const pageReady = await waitForSamplePageReady(webContents)
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

      const tabReady = await ensureTabSelected(webContents, config.displayName)
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

        const moved = await clickPaginationNext(webContents)
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
      responses = await this.captureManager.disposeJsonResponseCaptureSession(webContents, captureKey)
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

  private async waitForNextSamplePage(options: {
    captureKey: string
    responseCursor: number
    knownPageSignatures: Set<string>
    pageIndex: number
    tab: SampleManagementTabKey
    timeoutMs: number
  }): Promise<{ page: ParsedSampleManagementPage; nextCursor: number } | null> {
    const result = await this.captureManager.waitForNextParsedResponse({
      captureKey: options.captureKey,
      responseCursor: options.responseCursor,
      timeoutMs: options.timeoutMs,
      knownKeys: options.knownPageSignatures,
      parse: (captured) => {
        const parsed = parseSamplePayload(captured.body, options.pageIndex, options.tab)
        if (!parsed) {
          return null
        }
        return {
          key: parsed.pageSignature,
          value: parsed
        }
      }
    })

    if (!result) {
      return null
    }

    return {
      page: result.value,
      nextCursor: result.nextCursor
    }
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
    await this.captureManager.startJsonResponseCapture(webContents, {
      captureKey,
      urlIncludes: SAMPLE_PERFORMANCE_URL,
      method: 'GET'
    })

    let responses: CapturedJsonResponse[] = []
    try {
      const opened = await openCompletedViewContentDrawer(webContents, row, rowIndex)
      if (!opened) {
        logger.warn(`样品管理 Completed 内容抓取失败：未打开侧边页 request=${row.sample_request_id}`)
        return emptySummary
      }

      const drawerReady = await waitForSelectorState(webContents, SAMPLE_DRAWER_SELECTOR, 'present', 10000, 200)
      if (!drawerReady) {
        logger.warn(`样品管理 Completed 内容抓取失败：侧边页未出现 request=${row.sample_request_id}`)
        return emptySummary
      }

      await sleep(1200)
      const clickedVideo = await clickDrawerTabByText(webContents, 'Video')
      if (clickedVideo) {
        await sleep(1200)
      }

      const clickedLive = await clickDrawerTabByText(webContents, 'LIVE')
      if (clickedLive) {
        await sleep(1200)
      }
    } finally {
      responses = await this.captureManager.disposeJsonResponseCaptureSession(webContents, captureKey)
      await closeDrawerIfOpen(webContents)
    }

    const items = extractPerformanceSummaryItems(responses, row.sample_request_id)
    return JSON.stringify({
      count: items.length,
      items
    })
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
    this.appendSheet(workbook, TAB_CONFIG.to_review.sheetName, toReview.rows, SAMPLE_MANAGEMENT_SHEET_COLUMNS.to_review)
    this.appendSheet(
      workbook,
      TAB_CONFIG.ready_to_ship.sheetName,
      readyToShip.rows,
      SAMPLE_MANAGEMENT_SHEET_COLUMNS.ready_to_ship
    )
    this.appendSheet(workbook, TAB_CONFIG.shipped.sheetName, shipped.rows, SAMPLE_MANAGEMENT_SHEET_COLUMNS.shipped)
    this.appendSheet(
      workbook,
      TAB_CONFIG.in_progress.sheetName,
      inProgress.rows,
      SAMPLE_MANAGEMENT_SHEET_COLUMNS.in_progress
    )
    this.appendSheet(
      workbook,
      TAB_CONFIG.completed.sheetName,
      completed.rows,
      SAMPLE_MANAGEMENT_SHEET_COLUMNS.completed
    )
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
}
