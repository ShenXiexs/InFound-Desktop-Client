import { randomUUID } from 'node:crypto'
import { IPC_CHANNELS } from '@common/types/ipc-type'
import type { SellerChatbotPayloadInput } from '@common/types/rpa-chatbot'
import type {
  SellerCreatorDetailData,
  SellerCreatorDetailPayloadInput
} from '@common/types/rpa-creator-detail'
import type { OutreachFilterConfigInput } from '@common/types/rpa-outreach'
import { logger } from '../../utils/logger'
import { appWindowsAndViewsManager } from '../../windows/app-windows-and-views-manager'
import {
  buildSellerCreatorDetailExtractionScript,
  persistSellerCreatorDetailArtifacts
} from '../rpa/creator-detail/extractor'
import {
  buildSellerCreatorDetailSteps,
  countCollectedCreatorDetailFields,
  createDemoSellerCreatorDetailPayload,
  isSellerCreatorDetailPayloadInput,
  mergeSellerCreatorDetailPayload,
  persistSellerCreatorDetailSessionMarkdown
} from '../rpa/creator-detail/support'
import {
  buildSellerChatbotFinalizeSteps,
  buildSellerChatbotPrepareSteps,
  buildSellerChatbotSendAttemptSteps,
  createDemoSellerChatbotPayload,
  isSellerChatbotPayloadInput,
  mergeSellerChatbotPayload,
  persistSellerChatbotSessionMarkdown,
  SELLER_CHATBOT_CREATOR_NAME_KEY,
  SELLER_CHATBOT_INPUT_COUNT_AFTER_KEY,
  SELLER_CHATBOT_INPUT_COUNT_KEY,
  SELLER_CHATBOT_INPUT_SELECTOR,
  SELLER_CHATBOT_MAX_SEND_ATTEMPTS,
  SELLER_CHATBOT_TRANSCRIPT_AFTER_KEY,
  SELLER_CHATBOT_TRANSCRIPT_BEFORE_KEY
} from '../rpa/chatbot/support'
import {
  buildOutreachFilterSteps,
  createDemoOutreachFilterConfig,
  CREATOR_MARKETPLACE_DATA_KEY,
  CREATOR_MARKETPLACE_EXCEL_FILE_PATH_KEY,
  CREATOR_MARKETPLACE_FILE_PATH_KEY,
  CREATOR_MARKETPLACE_RAW_DIRECTORY_PATH_KEY,
  CREATOR_MARKETPLACE_RAW_FILE_PATH_KEY,
  isOutreachFilterConfigInput,
  mergeOutreachFilterConfig
} from '../rpa/outreach/support'
import { BrowserActionRunner } from '../rpa/task-dsl/browser-action-runner'
import type { BrowserTask } from '../rpa/task-dsl/browser-actions'
import { IPCHandle, IPCType } from './base/ipc-decorator'

const SELLER_LOGIN_URL = 'https://seller-mx.tiktok.com/'

export class RPAController {
  @IPCHandle(IPC_CHANNELS.RPA_SELLER_LOGIN, IPCType.SEND)
  async sellerLogin(): Promise<void> {
    logger.info(`启动店铺登录 RPA 任务，打开登录页: ${SELLER_LOGIN_URL}`)
    await appWindowsAndViewsManager.tkWebContentView.openView(SELLER_LOGIN_URL)
    appWindowsAndViewsManager.tkWebContentView.startSellerLoginSuccessMonitor()
  }

  async runSellerOutReach(payload?: OutreachFilterConfigInput): Promise<void> {
    const view = appWindowsAndViewsManager.tkWebContentView
    const region = await view.resolveAffiliateShopRegionOrThrow()
    const filterConfig = mergeOutreachFilterConfig(payload)
    const targetUrl = `https://affiliate.tiktok.com/connection/creator?shop_region=${encodeURIComponent(region)}`
    const homepageUrl = `https://affiliate.tiktok.com/platform/homepage?shop_region=${encodeURIComponent(region)}`

    const taskData = {
      taskId: randomUUID(),
      taskName: '建联任务',
      version: '1.0.0',
      config: {
        enableTrace: true,
        retryCount: 0
      },
      steps: [
        {
          actionType: 'goto',
          payload: {
            url: targetUrl,
            postLoadWaitMs: 2500
          },
          options: {
            retryCount: 1
          },
          onError: 'abort'
        },
        {
          actionType: 'waitForBodyText',
          payload: {
            text: 'Find creators',
            timeoutMs: 30000,
            intervalMs: 500
          },
          recovery: {
            gotoUrl: targetUrl,
            postLoadWaitMs: 2500
          },
          options: {
            retryCount: 5
          },
          onError: 'abort'
        },
        ...buildOutreachFilterSteps(filterConfig)
      ]
    } as BrowserTask

    logger.info(
      `[${taskData.taskId}] 启动建联任务: name=${taskData.taskName} version=${taskData.version} region=${region} steps=${taskData.steps.length}`
    )

    const taskRunner = new BrowserActionRunner(logger, view)
    const runtimeData = await taskRunner.execute(taskData)
    const creatorCount = Array.isArray(runtimeData[CREATOR_MARKETPLACE_DATA_KEY])
      ? runtimeData[CREATOR_MARKETPLACE_DATA_KEY].length
      : 0
    const filePath = String(runtimeData[CREATOR_MARKETPLACE_FILE_PATH_KEY] || '')
    const excelFilePath = String(runtimeData[CREATOR_MARKETPLACE_EXCEL_FILE_PATH_KEY] || '')
    const rawFilePath = String(runtimeData[CREATOR_MARKETPLACE_RAW_FILE_PATH_KEY] || '')
    const rawDirectoryPath = String(runtimeData[CREATOR_MARKETPLACE_RAW_DIRECTORY_PATH_KEY] || '')

    logger.info(
      `[${taskData.taskId}] 建联任务执行完成: creators=${creatorCount}${filePath ? ` file=${filePath}` : ''}${excelFilePath ? ` excel=${excelFilePath}` : ''}${rawFilePath ? ` raw_file=${rawFilePath}` : ''}${rawDirectoryPath ? ` raw_dir=${rawDirectoryPath}` : ''}`
    )

    logger.info(`[${taskData.taskId}] 建联任务已完成，返回 affiliate 首页待命: ${homepageUrl}`)
    await view.openView(homepageUrl)
    logger.info('已返回 affiliate 首页，等待后续任务指令')
  }

  async runSellerChatbot(payload?: SellerChatbotPayloadInput): Promise<void> {
    const view = appWindowsAndViewsManager.tkWebContentView
    const region = await view.resolveAffiliateShopRegionOrThrow()
    const chatbotPayload = mergeSellerChatbotPayload(payload)
    if (!chatbotPayload.creatorId) {
      throw new Error('聊天机器人缺少 creatorId')
    }
    if (!chatbotPayload.message) {
      throw new Error('聊天机器人缺少 message')
    }

    const targetUrl = `https://affiliate.tiktok.com/seller/im?creator_id=${encodeURIComponent(chatbotPayload.creatorId)}&shop_region=${encodeURIComponent(region)}`

    const taskData = {
      taskId: randomUUID(),
      taskName: '聊天机器人任务',
      version: '1.0.0',
      config: {
        enableTrace: true,
        retryCount: 0
      },
      steps: [
        {
          actionType: 'goto',
          payload: {
            url: targetUrl,
            postLoadWaitMs: 2500
          },
          options: { retryCount: 1 },
          onError: 'abort'
        },
        {
          actionType: 'waitForSelector',
          payload: {
            selector: SELLER_CHATBOT_INPUT_SELECTOR,
            state: 'visible',
            timeoutMs: 30000,
            intervalMs: 500
          },
          recovery: {
            gotoUrl: targetUrl,
            postLoadWaitMs: 2500
          },
          options: { retryCount: 5 },
          onError: 'abort'
        },
        ...buildSellerChatbotPrepareSteps()
      ]
    } as BrowserTask

    logger.info(
      `[${taskData.taskId}] 启动聊天机器人任务: creator_id=${chatbotPayload.creatorId} region=${region} steps=${taskData.steps.length}`
    )

    const taskRunner = new BrowserActionRunner(logger, view)
    const initialRuntimeData = await taskRunner.execute(taskData)
    const creatorName = String(initialRuntimeData[SELLER_CHATBOT_CREATOR_NAME_KEY] || '')
    const transcriptBefore = String(initialRuntimeData[SELLER_CHATBOT_TRANSCRIPT_BEFORE_KEY] || '')

    let sendVerified = false
    let sendAttempts = 0

    for (let attempt = 1; attempt <= SELLER_CHATBOT_MAX_SEND_ATTEMPTS; attempt += 1) {
      sendAttempts = attempt
      try {
        const sendTaskData = {
          taskId: randomUUID(),
          taskName: `聊天机器人发送尝试 #${attempt}（按钮发送）`,
          version: '1.0.0',
          config: {
            enableTrace: true,
            retryCount: 0
          },
          steps: buildSellerChatbotSendAttemptSteps(chatbotPayload.message)
        } as BrowserTask

        const sendRuntimeData = await taskRunner.execute(sendTaskData)
        const inputCount = String(sendRuntimeData[SELLER_CHATBOT_INPUT_COUNT_KEY] || '')
        const inputCountAfter = String(sendRuntimeData[SELLER_CHATBOT_INPUT_COUNT_AFTER_KEY] || '')

        if (inputCount && inputCount !== '0' && inputCountAfter === '0') {
          sendVerified = true
          logger.info(
            `[${taskData.taskId}] 聊天消息发送校验通过: creator_id=${chatbotPayload.creatorId} attempt=${attempt} mode=button input_count=${inputCount} input_count_after=${inputCountAfter || '(empty)'}`
          )
          break
        }

        logger.warn(
          `[${taskData.taskId}] 聊天消息发送校验失败: creator_id=${chatbotPayload.creatorId} attempt=${attempt} input_count=${inputCount || '(empty)'} input_count_after=${inputCountAfter || '(empty)'}`
        )
      } catch (err) {
        logger.warn(
          `[${taskData.taskId}] 聊天消息发送尝试异常: creator_id=${chatbotPayload.creatorId} attempt=${attempt} error=${(err as Error)?.message || err}`
        )
      }
    }

    const finalizeTaskData = {
      taskId: randomUUID(),
      taskName: '聊天机器人收尾读取',
      version: '1.0.0',
      config: {
        enableTrace: true,
        retryCount: 0
      },
      steps: buildSellerChatbotFinalizeSteps()
    } as BrowserTask

    const finalizeRuntimeData = await taskRunner.execute(finalizeTaskData)
    const transcriptAfter = String(finalizeRuntimeData[SELLER_CHATBOT_TRANSCRIPT_AFTER_KEY] || '')

    const sessionMarkdownPath = persistSellerChatbotSessionMarkdown({
      creatorId: chatbotPayload.creatorId,
      region,
      targetUrl,
      creatorName,
      message: chatbotPayload.message,
      transcriptBefore,
      transcriptAfter,
      sendVerified,
      sendAttempts
    })

    if (!sendVerified) {
      throw new Error(`聊天消息发送校验失败: creator_id=${chatbotPayload.creatorId}`)
    }

    logger.info(
      `[${taskData.taskId}] 聊天机器人任务执行完成: creator_id=${chatbotPayload.creatorId}${creatorName ? ` creator_name=${creatorName}` : ''} attempts=${sendAttempts} md=${sessionMarkdownPath}`
    )
  }

  async runSellerCreatorDetailCrawler(payload?: SellerCreatorDetailPayloadInput): Promise<void> {
    const view = appWindowsAndViewsManager.tkWebContentView
    const region = await view.resolveAffiliateShopRegionOrThrow()
    const creatorDetailPayload = mergeSellerCreatorDetailPayload(payload)
    if (!creatorDetailPayload.creatorId) {
      throw new Error('达人详情机器人缺少 creatorId')
    }

    const targetUrl = `https://affiliate.tiktok.com/connection/creator/detail?cid=${encodeURIComponent(creatorDetailPayload.creatorId)}&shop_region=${encodeURIComponent(region)}`
    const taskData = {
      taskId: randomUUID(),
      taskName: '达人详细信息爬取任务',
      version: '1.0.0',
      config: {
        enableTrace: true,
        retryCount: 0
      },
      steps: [
        {
          actionType: 'goto',
          payload: {
            url: targetUrl,
            postLoadWaitMs: 2500
          },
          options: { retryCount: 1 },
          onError: 'abort'
        },
        {
          actionType: 'assertUrlContains',
          payload: {
            keyword: '/connection/creator/detail'
          },
          options: { retryCount: 2 },
          onError: 'abort'
        },
        ...buildSellerCreatorDetailSteps()
      ]
    } as BrowserTask

    logger.info(
      `[${taskData.taskId}] 启动达人详细信息爬取任务: creator_id=${creatorDetailPayload.creatorId} region=${region} steps=${taskData.steps.length}`
    )

    const taskRunner = new BrowserActionRunner(logger, view)
    await taskRunner.execute(taskData)

    let detail: SellerCreatorDetailData | null = null
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const extracted = (await view.executeStructuredDataExtraction(
        buildSellerCreatorDetailExtractionScript()
      )) as SellerCreatorDetailData

      detail = {
        ...extracted,
        creator_id: extracted?.creator_id || creatorDetailPayload.creatorId,
        region: extracted?.region || region,
        target_url: extracted?.target_url || targetUrl,
        collected_at_utc: extracted?.collected_at_utc || new Date().toISOString(),
        creator_name: extracted?.creator_name || '',
        creator_rating: extracted?.creator_rating || '',
        creator_review_count: extracted?.creator_review_count || '',
        creator_followers_count: extracted?.creator_followers_count || '',
        creator_mcn: extracted?.creator_mcn || '',
        creator_intro: extracted?.creator_intro || '',
        gmv: extracted?.gmv || '',
        items_sold: extracted?.items_sold || '',
        gpm: extracted?.gpm || '',
        gmv_per_customer: extracted?.gmv_per_customer || '',
        est_post_rate: extracted?.est_post_rate || '',
        avg_commission_rate: extracted?.avg_commission_rate || '',
        products: extracted?.products || '',
        brand_collaborations: extracted?.brand_collaborations || '',
        brands_list: extracted?.brands_list || '',
        product_price: extracted?.product_price || '',
        video_gpm: extracted?.video_gpm || '',
        videos_count: extracted?.videos_count || '',
        avg_video_views: extracted?.avg_video_views || '',
        avg_video_engagement: extracted?.avg_video_engagement || '',
        avg_video_likes: extracted?.avg_video_likes || '',
        avg_video_comments: extracted?.avg_video_comments || '',
        avg_video_shares: extracted?.avg_video_shares || '',
        live_gpm: extracted?.live_gpm || '',
        live_streams: extracted?.live_streams || '',
        avg_live_views: extracted?.avg_live_views || '',
        avg_live_engagement: extracted?.avg_live_engagement || '',
        avg_live_likes: extracted?.avg_live_likes || '',
        avg_live_comments: extracted?.avg_live_comments || '',
        avg_live_shares: extracted?.avg_live_shares || '',
        gmv_per_sales_channel: extracted?.gmv_per_sales_channel || {},
        gmv_by_product_category: extracted?.gmv_by_product_category || {},
        follower_gender: extracted?.follower_gender || {},
        follower_age: extracted?.follower_age || {},
        videos_list: extracted?.videos_list || [],
        videos_with_product: extracted?.videos_with_product || [],
        relative_creators: extracted?.relative_creators || []
      }

      if (detail.creator_name) {
        break
      }

      logger.warn(
        `[${taskData.taskId}] 达人详情提取重试: creator_id=${creatorDetailPayload.creatorId} attempt=${attempt}`
      )
      await view.waitForDelay(1000)
    }

    if (!detail?.creator_name) {
      throw new Error(`达人详情提取失败: creator_id=${creatorDetailPayload.creatorId}`)
    }

    const { jsonPath, xlsxPath } = persistSellerCreatorDetailArtifacts(detail)
    const sessionMarkdownPath = persistSellerCreatorDetailSessionMarkdown({
      creatorId: creatorDetailPayload.creatorId,
      region,
      targetUrl,
      jsonPath,
      xlsxPath,
      detail
    })
    const collectedFieldCount = countCollectedCreatorDetailFields(detail)

    logger.info(
      `[${taskData.taskId}] 达人详细信息页采集完成: creator_id=${creatorDetailPayload.creatorId} creator_name=${detail.creator_name} fields=${collectedFieldCount} json=${jsonPath} xlsx=${xlsxPath} md=${sessionMarkdownPath}`
    )
  }

  getDemoOutreachPayload(): OutreachFilterConfigInput {
    return createDemoOutreachFilterConfig()
  }

  getDemoSellerChatbotPayload(): SellerChatbotPayloadInput {
    return createDemoSellerChatbotPayload()
  }

  getDemoSellerCreatorDetailPayload(): SellerCreatorDetailPayloadInput {
    return createDemoSellerCreatorDetailPayload()
  }

  @IPCHandle(IPC_CHANNELS.RPA_SELLER_OUT_REACH, IPCType.SEND)
  async sellerOutReach(eventOrPayload?: unknown, payloadMaybe?: OutreachFilterConfigInput): Promise<void> {
    const payload = isOutreachFilterConfigInput(payloadMaybe)
      ? payloadMaybe
      : isOutreachFilterConfigInput(eventOrPayload)
        ? eventOrPayload
        : undefined

    await this.runSellerOutReach(payload)
  }

  @IPCHandle(IPC_CHANNELS.RPA_SELLER_CHATBOT, IPCType.SEND)
  async sellerChatbot(eventOrPayload?: unknown, payloadMaybe?: SellerChatbotPayloadInput): Promise<void> {
    const payload = isSellerChatbotPayloadInput(payloadMaybe)
      ? payloadMaybe
      : isSellerChatbotPayloadInput(eventOrPayload)
        ? eventOrPayload
        : undefined

    await this.runSellerChatbot(payload)
  }

  @IPCHandle(IPC_CHANNELS.RPA_SELLER_CREATOR_DETAIL, IPCType.SEND)
  async sellerCreatorDetail(eventOrPayload?: unknown, payloadMaybe?: SellerCreatorDetailPayloadInput): Promise<void> {
    const payload = isSellerCreatorDetailPayloadInput(payloadMaybe)
      ? payloadMaybe
      : isSellerCreatorDetailPayloadInput(eventOrPayload)
        ? eventOrPayload
        : undefined

    await this.runSellerCreatorDetailCrawler(payload)
  }

  @IPCHandle(IPC_CHANNELS.RPA_SAMPLE_MANAGEMENT, IPCType.SEND)
  async sampleManagement(): Promise<void> {
    const view = appWindowsAndViewsManager.tkWebContentView
    const region = await view.resolveAffiliateShopRegionOrThrow()
    const targetUrl = `https://affiliate.tiktok.com/product/sample-request?shop_region=${encodeURIComponent(region)}`

    const taskData = {
      taskId: randomUUID(),
      taskName: '样品管理任务',
      version: '1.0.0',
      config: {
        enableTrace: true,
        retryCount: 0
      },
      steps: [
        {
          actionType: 'goto',
          payload: {
            url: targetUrl,
            postLoadWaitMs: 2500
          },
          options: {
            retryCount: 1
          },
          onError: 'abort'
        },
        {
          actionType: 'assertUrlContains',
          payload: {
            keyword: '/product/sample-request'
          },
          options: {
            retryCount: 2
          },
          onError: 'abort'
        },
        {
          actionType: 'waitForBodyText',
          payload: {
            text: 'To review',
            timeoutMs: 30000,
            intervalMs: 500
          },
          recovery: {
            gotoUrl: targetUrl,
            postLoadWaitMs: 2500
          },
          options: {
            retryCount: 3
          },
          onError: 'abort'
        },
        {
          actionType: 'waitForSelector',
          payload: {
            selector: '.arco-table',
            state: 'present',
            timeoutMs: 30000,
            intervalMs: 250
          },
          options: {
            retryCount: 2
          },
          onError: 'abort'
        }
      ]
    } as BrowserTask

    logger.info(
      `[${taskData.taskId}] 启动样品管理任务: name=${taskData.taskName} version=${taskData.version} target=${targetUrl} steps=${taskData.steps.length}`
    )

    const taskRunner = new BrowserActionRunner(logger, view)
    await taskRunner.execute(taskData)

    await view.crawlSampleManagementAndExportExcel({
      tabs: ['to_review', 'ready_to_ship', 'shipped', 'in_progress', 'completed']
    })
    logger.info(`[${taskData.taskId}] 样品管理爬取任务执行完成`)
  }

  async openSampleManagement(): Promise<void> {
    logger.info('打开样品管理页面')
    await appWindowsAndViewsManager.tkWebContentView.openSampleManagementView()
  }
}
