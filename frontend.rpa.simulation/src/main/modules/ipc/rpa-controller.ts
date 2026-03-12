import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { IPC_CHANNELS } from '@common/types/ipc-type'
import type { SellerChatbotPayload, SellerChatbotPayloadInput } from '@common/types/rpa-chatbot'
import type {
  SellerCreatorDetailData,
  SellerCreatorDetailPayload,
  SellerCreatorDetailPayloadInput
} from '@common/types/rpa-creator-detail'
import type {
  AvgCommissionRateOption,
  ContentTypeOption,
  CreatorAgencyOption,
  CreatorFilterConfig,
  FollowerAgeOption,
  FollowerFilterConfig,
  FollowerGenderOption,
  OutreachFilterConfig,
  OutreachFilterConfigInput,
  PerformanceEstPostRateOption,
  PerformanceFilterConfig,
  PerformanceGmvOption,
  PerformanceItemsSoldOption
} from '@common/types/rpa-outreach'
import { logger } from '../../utils/logger'
import { appWindowsAndViewsManager } from '../../windows/app-windows-and-views-manager'
import {
  buildSellerCreatorDetailExtractionScript,
  persistSellerCreatorDetailArtifacts
} from '../rpa/creator-detail/extractor'
import { BrowserActionRunner } from '../rpa/task-dsl/browser-action-runner'
import { BrowserAction, BrowserTask } from '../rpa/task-dsl/browser-actions'
import { IPCHandle, IPCType } from './base/ipc-decorator'

interface CreatorProductCategoryOption {
  label: string
  value: string
}

const CREATOR_PRODUCT_CATEGORY_OPTIONS: CreatorProductCategoryOption[] = [
  { label: 'Home Supplies', value: '600001' },
  { label: 'Kitchenware', value: '600024' },
  { label: 'Textiles & Soft Furnishings', value: '600154' },
  { label: 'Household Appliances', value: '600942' },
  { label: 'Womenswear & Underwear', value: '601152' },
  { label: 'Shoes', value: '601352' },
  { label: 'Beauty & Personal Care', value: '601450' },
  { label: 'Phones & Electronics', value: '601739' },
  { label: 'Computers & Office Equipment', value: '601755' },
  { label: 'Pet Supplies', value: '602118' },
  { label: 'Sports & Outdoor', value: '603014' },
  { label: 'Toys & Hobbies', value: '604206' },
  { label: 'Furniture', value: '604453' },
  { label: 'Tools & Hardware', value: '604579' },
  { label: 'Home Improvement', value: '604968' },
  { label: 'Automotive & Motorcycle', value: '605196' },
  { label: 'Fashion Accessories', value: '605248' },
  { label: 'Health', value: '700645' },
  { label: 'Books, Magazines & Audio', value: '801928' },
  { label: "Kids' Fashion", value: '802184' },
  { label: 'Menswear & Underwear', value: '824328' },
  { label: 'Luggage & Bags', value: '824584' },
  { label: 'Collectibles', value: '951432' },
  { label: 'Jewelry Accessories & Derivatives', value: '953224' }
]

const CREATOR_PRODUCT_CATEGORY_VALUE_SET = new Set(CREATOR_PRODUCT_CATEGORY_OPTIONS.map((item) => item.value))
const CREATOR_PRODUCT_CATEGORY_LABEL_TO_VALUE = new Map(
  CREATOR_PRODUCT_CATEGORY_OPTIONS.map((item) => [item.label.toLowerCase(), item.value] as const)
)

const AVG_COMMISSION_RATE_OPTIONS: AvgCommissionRateOption[] = [
  'All',
  'Less than 20%',
  'Less than 15%',
  'Less than 10%',
  'Less than 5%'
]
const CONTENT_TYPE_OPTIONS: ContentTypeOption[] = ['All', 'Video', 'LIVE']
const CREATOR_AGENCY_OPTIONS: CreatorAgencyOption[] = ['All', 'Managed by Agency', 'Independent creators']
const FOLLOWER_AGE_OPTIONS: FollowerAgeOption[] = ['18 - 24', '25 - 34', '35 - 44', '45 - 54', '55+']
const FOLLOWER_GENDER_OPTIONS: FollowerGenderOption[] = ['All', 'Female', 'Male']
const PERFORMANCE_GMV_OPTIONS: PerformanceGmvOption[] = ['MX$0-MX$100', 'MX$100-MX$1K', 'MX$1K-MX$10K', 'MX$10K+']
const PERFORMANCE_ITEMS_SOLD_OPTIONS: PerformanceItemsSoldOption[] = ['0-10', '10-100', '100-1K', '1K+']
const PERFORMANCE_EST_POST_RATE_OPTIONS: PerformanceEstPostRateOption[] = ['All', 'OK', 'Good', 'Better']

const FILTER_TITLE_SELECTOR = 'button[data-tid="m4b_button"] .arco-typography'
const PRODUCT_CATEGORY_PANEL_SELECTOR = 'ul.arco-cascader-list.arco-cascader-list-multiple'
const SINGLE_SELECT_OPTION_SELECTOR = 'li.arco-select-option'
const MULTI_SELECT_OPTION_SELECTOR = 'span.arco-select-option.m4b-select-option'
const MULTI_SELECT_POPUP_SELECTOR = 'div.arco-select-popup.arco-select-popup-multiple'
const FOLLOWER_COUNT_RANGE_SELECTOR = 'div[data-e2e="ec40fffd-2fcf-30d5"]'
const FOLLOWER_COUNT_MIN_INPUT_SELECTOR = `${FOLLOWER_COUNT_RANGE_SELECTOR} input[data-e2e="d9c26458-94d3-e920"]`
const FOLLOWER_COUNT_MAX_INPUT_SELECTOR = `${FOLLOWER_COUNT_RANGE_SELECTOR} input[data-e2e="b7512111-8b2f-a07b"]`
const POPUP_THRESHOLD_INPUT_SELECTOR = 'input[data-tid="m4b_input"][data-e2e="7f6a7b3f-260b-00c0"]'
const POPUP_CHECKBOX_LABEL_SELECTOR = 'label[data-tid="m4b_checkbox"]'
const POPUP_SCROLL_CONTAINER_SELECTOR = '.arco-select-popup-inner'
const OUTREACH_FILTER_DISMISS_TEXT = 'Find creators'
const OUTREACH_FILTER_DISMISS_SELECTOR = 'button span, h1, h2, h3, p, span, div'
const OUTREACH_STEP_RETRY_COUNT = 3
const OUTREACH_STEP_ERROR_POLICY = 'continue' as const
const SEARCH_INPUT_SELECTOR = 'input[data-tid="m4b_input_search"]'
const OUTREACH_SCROLL_CONTAINER_SELECTOR = '#modern_sub_app_container_connection'
const CREATOR_MARKETPLACE_CAPTURE_KEY = 'creator_marketplace_results'
const CREATOR_MARKETPLACE_FIND_URL_KEYWORD = '/api/v1/oec/affiliate/creator/marketplace/find'
const CREATOR_MARKETPLACE_DATA_KEY = 'creator_marketplace_creators'
const CREATOR_MARKETPLACE_SUMMARY_KEY = 'creator_marketplace_summary'
const CREATOR_MARKETPLACE_FILE_PATH_KEY = 'creator_marketplace_file_path'
const CREATOR_MARKETPLACE_EXCEL_FILE_PATH_KEY = 'creator_marketplace_excel_file_path'
const CREATOR_MARKETPLACE_RAW_DATA_KEY = 'creator_marketplace_raw_creators'
const CREATOR_MARKETPLACE_RAW_FILE_PATH_KEY = 'creator_marketplace_raw_file_path'
const CREATOR_MARKETPLACE_RAW_DIRECTORY_PATH_KEY = 'creator_marketplace_raw_directory_path'
const SELLER_LOGIN_URL = 'https://seller-mx.tiktok.com/'
const SELLER_CHATBOT_INPUT_SELECTOR =
  'textarea[data-e2e="798845f5-2eb9-0980"], textarea#imTextarea, #im_sdk_chat_input textarea, textarea[placeholder="Send a message"]'
const SELLER_CHATBOT_SEND_BUTTON_SELECTOR =
  '#im_sdk_chat_input > div.footer-zRiuSb > div > button'
const SELLER_CHATBOT_INPUT_COUNT_SELECTOR =
  'div[data-e2e="6981c08f-68cc-5df6"] span[data-e2e="76868bb0-0a54-15ad"]'
const SELLER_CHATBOT_TRANSCRIPT_SELECTOR =
  'div[data-e2e="4c874cc7-9725-d612"], div.messageList-tkdtcN, div.chatd-scrollView'
const SELLER_CHATBOT_CREATOR_NAME_SELECTOR =
  'div[data-e2e="4e0becc3-a040-a9d2"], div.personInfo-qNFxKc .text-body-m-medium'
const SELLER_CHATBOT_CREATOR_NAME_KEY = 'seller_chatbot_creator_name'
const SELLER_CHATBOT_TRANSCRIPT_BEFORE_KEY = 'seller_chatbot_transcript_before'
const SELLER_CHATBOT_TRANSCRIPT_AFTER_KEY = 'seller_chatbot_transcript_after'
const SELLER_CHATBOT_INPUT_COUNT_KEY = 'seller_chatbot_input_count'
const SELLER_CHATBOT_INPUT_COUNT_AFTER_KEY = 'seller_chatbot_input_count_after'
const SELLER_CHATBOT_MAX_SEND_ATTEMPTS = 3
const SELLER_CREATOR_DETAIL_READY_TEXT = 'Creator details'
const DEFAULT_SELLER_CHATBOT_MESSAGE = `Hola 😊

Soy Natalie Cueto, Social Media Partnership Specialist de GOKOCO México.
Estamos buscando creadores con un estilo auténtico para colaborar con nosotros en contenido de cuidado personal y belleza inteligente.

Nos encantaría enviarte uno de nuestros productos para que lo pruebes y, si te gusta, compartir tu experiencia con tu comunidad.
Además, la colaboración incluye comisión por cada venta generada a través de tus recomendaciones.

Si te interesa, con gusto te comparto más detalles.
Quedo atenta.`

const createDefaultOutreachFilterConfig = (): OutreachFilterConfig => ({
  creatorFilters: {
    productCategorySelections: ['Home Supplies'],
    avgCommissionRate: 'All',
    contentType: 'All',
    creatorAgency: 'All',
    spotlightCreator: false,
    fastGrowing: false,
    notInvitedInPast90Days: false
  },
  followerFilters: {
    followerAgeSelections: [],
    followerGender: 'All',
    followerCountMin: '0',
    followerCountMax: '10,000,000+'
  },
  performanceFilters: {
    gmvSelections: [],
    itemsSoldSelections: [],
    averageViewsPerVideoMin: '0',
    averageViewsPerVideoShoppableVideosOnly: false,
    averageViewersPerLiveMin: '0',
    averageViewersPerLiveShoppableLiveOnly: false,
    engagementRateMinPercent: '0',
    engagementRateShoppableVideosOnly: false,
    estPostRate: 'All',
    brandCollaborationSelections: []
  },
  searchKeyword: ''
})

const createDemoOutreachFilterConfig = (): OutreachFilterConfigInput => ({
  creatorFilters: {
    productCategorySelections: ['Home Supplies', 'Beauty & Personal Care', 'Phones & Electronics'],
    avgCommissionRate: 'Less than 20%',
    contentType: 'Video',
    creatorAgency: 'Independent creators',
    spotlightCreator: true,
    fastGrowing: true,
    notInvitedInPast90Days: true
  },
  followerFilters: {
    followerAgeSelections: ['18 - 24', '25 - 34'],
    followerGender: 'Female',
    followerCountMin: '10000',
    followerCountMax: '200000'
  },
  performanceFilters: {
    gmvSelections: ['MX$100-MX$1K', 'MX$1K-MX$10K'],
    itemsSoldSelections: ['10-100', '100-1K'],
    averageViewsPerVideoMin: '1000',
    averageViewsPerVideoShoppableVideosOnly: true,
    averageViewersPerLiveMin: '300',
    averageViewersPerLiveShoppableLiveOnly: true,
    engagementRateMinPercent: '5',
    engagementRateShoppableVideosOnly: true,
    estPostRate: 'Good',
    brandCollaborationSelections: ["L'OREAL PROFESSIONNEL", 'Maybelline New York', 'NYX Professional Makeup']
  },
  searchKeyword: 'lipstick'
})

const mergeOutreachFilterConfig = (input?: OutreachFilterConfigInput): OutreachFilterConfig => {
  const defaults = createDefaultOutreachFilterConfig()
  return {
    creatorFilters: {
      ...defaults.creatorFilters,
      ...(input?.creatorFilters ?? {})
    },
    followerFilters: {
      ...defaults.followerFilters,
      ...(input?.followerFilters ?? {})
    },
    performanceFilters: {
      ...defaults.performanceFilters,
      ...(input?.performanceFilters ?? {})
    },
    searchKeyword: input?.searchKeyword ?? defaults.searchKeyword
  }
}

const isOutreachFilterConfigInput = (value: unknown): value is OutreachFilterConfigInput => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return (
    'creatorFilters' in candidate ||
    'followerFilters' in candidate ||
    'performanceFilters' in candidate ||
    'searchKeyword' in candidate
  )
}

const createDefaultSellerChatbotPayload = (): SellerChatbotPayload => ({
  creatorId: '',
  message: DEFAULT_SELLER_CHATBOT_MESSAGE
})

const createDefaultSellerCreatorDetailPayload = (): SellerCreatorDetailPayload => ({
  creatorId: ''
})

const createDemoSellerChatbotPayload = (): SellerChatbotPayloadInput => ({
  creatorId: '7493999107359083121',
  message: DEFAULT_SELLER_CHATBOT_MESSAGE
})

const createDemoSellerCreatorDetailPayload = (): SellerCreatorDetailPayloadInput => ({
  creatorId: '7495400123324336701'
})

const mergeSellerChatbotPayload = (input?: SellerChatbotPayloadInput): SellerChatbotPayload => {
  const defaults = createDefaultSellerChatbotPayload()
  return {
    creatorId: String(input?.creatorId ?? defaults.creatorId).trim(),
    message: String(input?.message ?? defaults.message).trim()
  }
}

const mergeSellerCreatorDetailPayload = (input?: SellerCreatorDetailPayloadInput): SellerCreatorDetailPayload => {
  const defaults = createDefaultSellerCreatorDetailPayload()
  return {
    creatorId: String(input?.creatorId ?? defaults.creatorId).trim()
  }
}

const isSellerChatbotPayloadInput = (value: unknown): value is SellerChatbotPayloadInput => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return 'creatorId' in (value as Record<string, unknown>) || 'message' in (value as Record<string, unknown>)
}

const isSellerCreatorDetailPayloadInput = (value: unknown): value is SellerCreatorDetailPayloadInput => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return 'creatorId' in (value as Record<string, unknown>)
}

const buildLocalTimestamp = (): string => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hour = String(now.getHours()).padStart(2, '0')
  const minute = String(now.getMinutes()).padStart(2, '0')
  const second = String(now.getSeconds()).padStart(2, '0')
  return `${year}${month}${day}_${hour}${minute}${second}`
}

const persistSellerChatbotSessionMarkdown = (params: {
  creatorId: string
  region: string
  targetUrl: string
  creatorName: string
  message: string
  transcriptBefore: string
  transcriptAfter: string
  sendVerified: boolean
  sendAttempts: number
}): string => {
  const outputDir = join(process.cwd(), 'data/chatbot')
  mkdirSync(outputDir, { recursive: true })

  const filePath = join(outputDir, `seller_chatbot_session_${buildLocalTimestamp()}.md`)
  const transcriptChanged = params.transcriptBefore !== params.transcriptAfter

  const markdown = `# Seller Chatbot Session

- generated_at: ${new Date().toISOString()}
- creator_id: ${params.creatorId}
- creator_name: ${params.creatorName || '(empty)'}
- region: ${params.region}
- target_url: ${params.targetUrl}
- ready_signal: chat input visible
- input_selector: \`${SELLER_CHATBOT_INPUT_SELECTOR}\`
- send_button_selector: \`${SELLER_CHATBOT_SEND_BUTTON_SELECTOR}\`
- input_count_selector: \`${SELLER_CHATBOT_INPUT_COUNT_SELECTOR}\`
- transcript_selector: \`${SELLER_CHATBOT_TRANSCRIPT_SELECTOR}\`
- send_verified: ${params.sendVerified ? 'true' : 'false'}
- send_attempts: ${params.sendAttempts}
- transcript_changed_after_send: ${transcriptChanged ? 'true' : 'false'}

## Message Sent

\`\`\`text
${params.message}
\`\`\`

## Transcript Before Send

\`\`\`text
${params.transcriptBefore || '(empty)'}
\`\`\`

## Transcript After Send

\`\`\`text
${params.transcriptAfter || '(empty)'}
\`\`\`
`

  writeFileSync(filePath, markdown)
  return filePath
}

const persistSellerCreatorDetailSessionMarkdown = (params: {
  creatorId: string
  region: string
  targetUrl: string
  jsonPath: string
  xlsxPath: string
  detail: SellerCreatorDetailData
}): string => {
  const outputDir = join(process.cwd(), 'data/creator-detail')
  mkdirSync(outputDir, { recursive: true })

  const filePath = join(outputDir, `seller_creator_detail_session_${buildLocalTimestamp()}.md`)
  const videosCount = params.detail.videos_list.length
  const videosWithProductCount = params.detail.videos_with_product.length
  const relativeCreatorsCount = params.detail.relative_creators.length
  const markdown = `# Seller Creator Detail Session

- generated_at: ${new Date().toISOString()}
- creator_id: ${params.creatorId}
- region: ${params.region}
- target_url: ${params.targetUrl}
- ready_signal: ${SELLER_CREATOR_DETAIL_READY_TEXT}
- status: extracted
- json_path: ${params.jsonPath}
- xlsx_path: ${params.xlsxPath}

## Profile Summary

- creator_name: ${params.detail.creator_name || '(empty)'}
- creator_rating: ${params.detail.creator_rating || '(empty)'}
- creator_review_count: ${params.detail.creator_review_count || '(empty)'}
- creator_followers_count: ${params.detail.creator_followers_count || '(empty)'}
- creator_mcn: ${params.detail.creator_mcn || '(empty)'}
- brands_list: ${params.detail.brands_list || '(empty)'}

## Metrics Summary

- gmv: ${params.detail.gmv || '(empty)'}
- items_sold: ${params.detail.items_sold || '(empty)'}
- gpm: ${params.detail.gpm || '(empty)'}
- gmv_per_customer: ${params.detail.gmv_per_customer || '(empty)'}
- est_post_rate: ${params.detail.est_post_rate || '(empty)'}
- avg_commission_rate: ${params.detail.avg_commission_rate || '(empty)'}
- products: ${params.detail.products || '(empty)'}
- brand_collaborations: ${params.detail.brand_collaborations || '(empty)'}

## Collection Summary

- videos_list_count: ${videosCount}
- videos_with_product_count: ${videosWithProductCount}
- relative_creators_count: ${relativeCreatorsCount}

## Creator Intro

\`\`\`text
${params.detail.creator_intro || '(empty)'}
\`\`\`
`

  writeFileSync(filePath, markdown)
  return filePath
}

const countCollectedCreatorDetailFields = (detail: SellerCreatorDetailData): number =>
  Object.values(detail).reduce((count, value) => {
    if (Array.isArray(value)) {
      return count + (value.length > 0 ? 1 : 0)
    }
    if (value && typeof value === 'object') {
      return count + (Object.keys(value as Record<string, unknown>).length > 0 ? 1 : 0)
    }
    return count + (String(value ?? '').trim() ? 1 : 0)
  }, 0)

const normalizeCreatorProductCategoryValues = (selections: string[]): string[] => {
  const normalizedValues: string[] = []
  const seen = new Set<string>()

  for (const rawSelection of selections) {
    const token = String(rawSelection || '').trim()
    if (!token) continue

    let value = ''
    if (CREATOR_PRODUCT_CATEGORY_VALUE_SET.has(token)) {
      value = token
    } else {
      const matched = CREATOR_PRODUCT_CATEGORY_LABEL_TO_VALUE.get(token.toLowerCase())
      if (matched) {
        value = matched
      }
    }

    if (!value) {
      throw new Error(`未知 Product category 选项: ${token}`)
    }

    if (!seen.has(value)) {
      seen.add(value)
      normalizedValues.push(value)
    }
  }

  return normalizedValues
}

const normalizeSingleSelectOption = <T extends string>(selection: string, options: readonly T[], optionName: string): T => {
  const token = String(selection || '').trim()
  const matched = options.find((item) => item.toLowerCase() === token.toLowerCase())
  if (!matched) {
    throw new Error(`未知 ${optionName} 选项: ${selection}`)
  }
  return matched
}

const normalizeMultiSelectOptions = <T extends string>(
  selections: string[],
  options: readonly T[],
  optionName: string
): T[] => {
  const seen = new Set<string>()
  const normalized: T[] = []

  for (const rawSelection of selections) {
    const token = String(rawSelection || '').trim()
    if (!token) continue

    const matched = options.find((item) => item.toLowerCase() === token.toLowerCase())
    if (!matched) {
      throw new Error(`未知 ${optionName} 选项: ${rawSelection}`)
    }

    if (!seen.has(matched)) {
      seen.add(matched)
      normalized.push(matched)
    }
  }

  return normalized
}

const normalizeFreeformSelections = (selections: string[]): string[] => {
  const normalized: string[] = []
  const seen = new Set<string>()

  for (const rawSelection of selections) {
    const token = String(rawSelection || '').trim()
    if (!token || seen.has(token.toLowerCase())) continue
    seen.add(token.toLowerCase())
    normalized.push(token)
  }

  return normalized
}

const buildOutreachDismissPayload = () => ({
  closeText: OUTREACH_FILTER_DISMISS_TEXT,
  closeSelector: OUTREACH_FILTER_DISMISS_SELECTOR
})

const MODULE_BUTTON_FALLBACK_TEXTS: Record<string, string[]> = {
  Followers: ['Follower']
}

const buildModuleButtonAction = (moduleTitle: string, postClickWaitMs = 350): BrowserAction => ({
  actionType: 'clickByText',
  payload: {
    text: moduleTitle,
    fallbackTexts: MODULE_BUTTON_FALLBACK_TEXTS[moduleTitle] ?? [],
    selector: 'button[data-tid="m4b_button"] span',
    exact: true,
    caseSensitive: false,
    timeoutMs: 10000,
    intervalMs: 250,
    postClickWaitMs
  },
  options: { retryCount: OUTREACH_STEP_RETRY_COUNT },
  onError: OUTREACH_STEP_ERROR_POLICY
})

const buildCreatorFilterSteps = (config: CreatorFilterConfig): BrowserAction[] => {
  const categoryValues = normalizeCreatorProductCategoryValues(config.productCategorySelections)
  const avgCommissionRate = normalizeSingleSelectOption(config.avgCommissionRate, AVG_COMMISSION_RATE_OPTIONS, 'Avg. commission rate')
  const contentType = normalizeSingleSelectOption(config.contentType, CONTENT_TYPE_OPTIONS, 'Content type')
  const creatorAgency = normalizeSingleSelectOption(config.creatorAgency, CREATOR_AGENCY_OPTIONS, 'Creator agency')

  const filterSteps: BrowserAction[] = []

  if (categoryValues.length) {
    filterSteps.push({
      actionType: 'selectCascaderOptionsByValue',
      payload: {
        triggerText: 'Product category',
        triggerSelector: FILTER_TITLE_SELECTOR,
        panelSelector: PRODUCT_CATEGORY_PANEL_SELECTOR,
        values: categoryValues,
        inputSelector: 'input[type="checkbox"]',
        scrollContainerSelector: PRODUCT_CATEGORY_PANEL_SELECTOR,
        scrollStepPx: 320,
        maxScrollAttempts: 20,
        timeoutMs: 10000,
        intervalMs: 250,
        triggerPostClickWaitMs: 300,
        optionPostClickWaitMs: 180,
        closeAfterSelect: true
      },
      options: { retryCount: OUTREACH_STEP_RETRY_COUNT },
      onError: OUTREACH_STEP_ERROR_POLICY
    })
  }

  if (avgCommissionRate !== 'All') {
    filterSteps.push({
      actionType: 'selectDropdownSingle',
      payload: {
        triggerText: 'Avg. commission rate',
        triggerSelector: FILTER_TITLE_SELECTOR,
        optionText: avgCommissionRate,
        optionSelector: SINGLE_SELECT_OPTION_SELECTOR,
        waitSelector: SINGLE_SELECT_OPTION_SELECTOR,
        waitState: 'visible',
        exact: true,
        caseSensitive: false,
        timeoutMs: 10000,
        intervalMs: 250,
        triggerPostClickWaitMs: 250,
        optionPostClickWaitMs: 160,
        closeAfterSelect: true,
        ...buildOutreachDismissPayload()
      },
      options: { retryCount: OUTREACH_STEP_RETRY_COUNT },
      onError: OUTREACH_STEP_ERROR_POLICY
    })
  }

  if (contentType !== 'All') {
    filterSteps.push({
      actionType: 'selectDropdownSingle',
      payload: {
        triggerText: 'Content type',
        triggerSelector: FILTER_TITLE_SELECTOR,
        optionText: contentType,
        optionSelector: SINGLE_SELECT_OPTION_SELECTOR,
        waitSelector: SINGLE_SELECT_OPTION_SELECTOR,
        waitState: 'visible',
        exact: true,
        caseSensitive: false,
        timeoutMs: 10000,
        intervalMs: 250,
        triggerPostClickWaitMs: 250,
        optionPostClickWaitMs: 160,
        closeAfterSelect: true,
        ...buildOutreachDismissPayload()
      },
      options: { retryCount: OUTREACH_STEP_RETRY_COUNT },
      onError: OUTREACH_STEP_ERROR_POLICY
    })
  }

  if (creatorAgency !== 'All') {
    filterSteps.push({
      actionType: 'selectDropdownSingle',
      payload: {
        triggerText: 'Creator agency',
        triggerSelector: FILTER_TITLE_SELECTOR,
        optionText: creatorAgency,
        optionSelector: SINGLE_SELECT_OPTION_SELECTOR,
        waitSelector: SINGLE_SELECT_OPTION_SELECTOR,
        waitState: 'visible',
        exact: true,
        caseSensitive: false,
        timeoutMs: 10000,
        intervalMs: 250,
        triggerPostClickWaitMs: 250,
        optionPostClickWaitMs: 160,
        closeAfterSelect: true,
        ...buildOutreachDismissPayload()
      },
      options: { retryCount: OUTREACH_STEP_RETRY_COUNT },
      onError: OUTREACH_STEP_ERROR_POLICY
    })
  }

  if (config.spotlightCreator) {
    filterSteps.push({
      actionType: 'setCheckbox',
      payload: {
        selector: 'label#isRisingStar_input',
        checked: true,
        timeoutMs: 10000,
        intervalMs: 250,
        postClickWaitMs: 150
      },
      options: { retryCount: OUTREACH_STEP_RETRY_COUNT },
      onError: OUTREACH_STEP_ERROR_POLICY
    })
  }

  if (config.fastGrowing) {
    filterSteps.push({
      actionType: 'setCheckbox',
      payload: {
        selector: 'label#isFastGrowing_input',
        checked: true,
        timeoutMs: 10000,
        intervalMs: 250,
        postClickWaitMs: 150
      },
      options: { retryCount: OUTREACH_STEP_RETRY_COUNT },
      onError: OUTREACH_STEP_ERROR_POLICY
    })
  }

  if (config.notInvitedInPast90Days) {
    filterSteps.push({
      actionType: 'setCheckbox',
      payload: {
        selector: 'label#isInvitedBefore_input',
        checked: true,
        timeoutMs: 10000,
        intervalMs: 250,
        postClickWaitMs: 150
      },
      options: { retryCount: OUTREACH_STEP_RETRY_COUNT },
      onError: OUTREACH_STEP_ERROR_POLICY
    })
  }

  return filterSteps.length ? [buildModuleButtonAction('Creators'), ...filterSteps] : []
}

const buildFollowerFilterSteps = (config: FollowerFilterConfig): BrowserAction[] => {
  const followerAgeSelections = normalizeMultiSelectOptions(config.followerAgeSelections, FOLLOWER_AGE_OPTIONS, 'Follower age')
  const followerGender = normalizeSingleSelectOption(config.followerGender, FOLLOWER_GENDER_OPTIONS, 'Follower gender')
  const hasFollowerCountOverride =
    String(config.followerCountMin).trim() !== '0' || String(config.followerCountMax).trim() !== '10,000,000+'

  const filterSteps: BrowserAction[] = []

  if (followerAgeSelections.length) {
    filterSteps.push({
      actionType: 'selectDropdownMultiple',
      payload: {
        triggerText: 'Follower age',
        triggerSelector: FILTER_TITLE_SELECTOR,
        optionTexts: followerAgeSelections,
        optionSelector: MULTI_SELECT_OPTION_SELECTOR,
        waitSelector: MULTI_SELECT_POPUP_SELECTOR,
        waitState: 'visible',
        exact: true,
        caseSensitive: false,
        timeoutMs: 10000,
        intervalMs: 250,
        triggerPostClickWaitMs: 300,
        optionPostClickWaitMs: 180,
        closeAfterSelect: true,
        ...buildOutreachDismissPayload()
      },
      options: { retryCount: OUTREACH_STEP_RETRY_COUNT },
      onError: OUTREACH_STEP_ERROR_POLICY
    })
  }

  if (followerGender !== 'All') {
    filterSteps.push({
      actionType: 'selectDropdownSingle',
      payload: {
        triggerText: 'Follower gender',
        triggerSelector: FILTER_TITLE_SELECTOR,
        optionText: followerGender,
        optionSelector: SINGLE_SELECT_OPTION_SELECTOR,
        waitSelector: SINGLE_SELECT_OPTION_SELECTOR,
        waitState: 'visible',
        exact: true,
        caseSensitive: false,
        timeoutMs: 10000,
        intervalMs: 250,
        triggerPostClickWaitMs: 250,
        optionPostClickWaitMs: 160,
        closeAfterSelect: true,
        ...buildOutreachDismissPayload()
      },
      options: { retryCount: OUTREACH_STEP_RETRY_COUNT },
      onError: OUTREACH_STEP_ERROR_POLICY
    })
  }

  if (hasFollowerCountOverride) {
    filterSteps.push({
      actionType: 'fillDropdownRange',
      payload: {
        triggerText: 'Follower count',
        triggerFallbackTexts: ['Follower c'],
        triggerSelector: FILTER_TITLE_SELECTOR,
        triggerExact: false,
        waitSelector: FOLLOWER_COUNT_RANGE_SELECTOR,
        minSelector: FOLLOWER_COUNT_MIN_INPUT_SELECTOR,
        minValue: String(config.followerCountMin),
        maxSelector: FOLLOWER_COUNT_MAX_INPUT_SELECTOR,
        maxValue: String(config.followerCountMax),
        timeoutMs: 10000,
        intervalMs: 250,
        triggerPostClickWaitMs: 300,
        fillPostWaitMs: 200,
        closeAfterFill: true,
        ...buildOutreachDismissPayload()
      },
      options: { retryCount: OUTREACH_STEP_RETRY_COUNT },
      onError: OUTREACH_STEP_ERROR_POLICY
    })
  }

  return filterSteps.length ? [buildModuleButtonAction('Followers'), ...filterSteps] : []
}

const buildPerformanceFilterSteps = (config: PerformanceFilterConfig): BrowserAction[] => {
  const gmvSelections = normalizeMultiSelectOptions(config.gmvSelections, PERFORMANCE_GMV_OPTIONS, 'GMV')
  const itemsSoldSelections = normalizeMultiSelectOptions(config.itemsSoldSelections, PERFORMANCE_ITEMS_SOLD_OPTIONS, 'Items sold')
  const estPostRate = normalizeSingleSelectOption(config.estPostRate, PERFORMANCE_EST_POST_RATE_OPTIONS, 'Est. post rate')
  const brandCollaborationSelections = normalizeFreeformSelections(config.brandCollaborationSelections)

  const hasAverageViewsPerVideoOverride =
    String(config.averageViewsPerVideoMin).trim() !== '0' || config.averageViewsPerVideoShoppableVideosOnly
  const hasAverageViewersPerLiveOverride =
    String(config.averageViewersPerLiveMin).trim() !== '0' || config.averageViewersPerLiveShoppableLiveOnly
  const hasEngagementRateOverride =
    String(config.engagementRateMinPercent).trim() !== '0' || config.engagementRateShoppableVideosOnly

  const filterSteps: BrowserAction[] = []

  if (gmvSelections.length) {
    filterSteps.push({
      actionType: 'selectDropdownMultiple',
      payload: {
        triggerText: 'GMV',
        triggerSelector: FILTER_TITLE_SELECTOR,
        optionTexts: gmvSelections,
        optionSelector: MULTI_SELECT_OPTION_SELECTOR,
        waitSelector: MULTI_SELECT_POPUP_SELECTOR,
        waitState: 'visible',
        exact: true,
        caseSensitive: false,
        timeoutMs: 10000,
        intervalMs: 250,
        triggerPostClickWaitMs: 300,
        optionPostClickWaitMs: 180,
        closeAfterSelect: true,
        ...buildOutreachDismissPayload()
      },
      options: { retryCount: OUTREACH_STEP_RETRY_COUNT },
      onError: OUTREACH_STEP_ERROR_POLICY
    })
  }

  if (itemsSoldSelections.length) {
    filterSteps.push({
      actionType: 'selectDropdownMultiple',
      payload: {
        triggerText: 'Items sold',
        triggerSelector: FILTER_TITLE_SELECTOR,
        optionTexts: itemsSoldSelections,
        optionSelector: MULTI_SELECT_OPTION_SELECTOR,
        waitSelector: MULTI_SELECT_POPUP_SELECTOR,
        waitState: 'visible',
        exact: true,
        caseSensitive: false,
        timeoutMs: 10000,
        intervalMs: 250,
        triggerPostClickWaitMs: 300,
        optionPostClickWaitMs: 180,
        closeAfterSelect: true,
        ...buildOutreachDismissPayload()
      },
      options: { retryCount: OUTREACH_STEP_RETRY_COUNT },
      onError: OUTREACH_STEP_ERROR_POLICY
    })
  }

  if (hasAverageViewsPerVideoOverride) {
    filterSteps.push({
      actionType: 'fillDropdownThreshold',
      payload: {
        triggerText: 'Average views per video',
        triggerSelector: FILTER_TITLE_SELECTOR,
        waitSelector: POPUP_THRESHOLD_INPUT_SELECTOR,
        inputSelector: POPUP_THRESHOLD_INPUT_SELECTOR,
        value: String(config.averageViewsPerVideoMin),
        checkboxLabelText: config.averageViewsPerVideoShoppableVideosOnly ? 'Filter by shoppable videos' : undefined,
        checkboxLabelSelector: config.averageViewsPerVideoShoppableVideosOnly ? POPUP_CHECKBOX_LABEL_SELECTOR : undefined,
        checkboxExact: false,
        timeoutMs: 10000,
        intervalMs: 250,
        triggerPostClickWaitMs: 300,
        fillPostWaitMs: 120,
        checkboxPostClickWaitMs: 150,
        closeAfterFill: true,
        ...buildOutreachDismissPayload()
      },
      options: { retryCount: OUTREACH_STEP_RETRY_COUNT },
      onError: OUTREACH_STEP_ERROR_POLICY
    })
  }

  if (hasAverageViewersPerLiveOverride) {
    filterSteps.push({
      actionType: 'fillDropdownThreshold',
      payload: {
        triggerText: 'Average viewers per LIVE',
        triggerSelector: FILTER_TITLE_SELECTOR,
        waitSelector: POPUP_THRESHOLD_INPUT_SELECTOR,
        inputSelector: POPUP_THRESHOLD_INPUT_SELECTOR,
        value: String(config.averageViewersPerLiveMin),
        checkboxLabelText: config.averageViewersPerLiveShoppableLiveOnly ? 'Filter by shoppable LIVE streams' : undefined,
        checkboxLabelSelector: config.averageViewersPerLiveShoppableLiveOnly ? POPUP_CHECKBOX_LABEL_SELECTOR : undefined,
        checkboxExact: false,
        timeoutMs: 10000,
        intervalMs: 250,
        triggerPostClickWaitMs: 300,
        fillPostWaitMs: 120,
        checkboxPostClickWaitMs: 150,
        closeAfterFill: true,
        ...buildOutreachDismissPayload()
      },
      options: { retryCount: OUTREACH_STEP_RETRY_COUNT },
      onError: OUTREACH_STEP_ERROR_POLICY
    })
  }

  if (hasEngagementRateOverride) {
    filterSteps.push({
      actionType: 'fillDropdownThreshold',
      payload: {
        triggerText: 'Engagement rate',
        triggerSelector: FILTER_TITLE_SELECTOR,
        waitSelector: POPUP_THRESHOLD_INPUT_SELECTOR,
        inputSelector: POPUP_THRESHOLD_INPUT_SELECTOR,
        value: String(config.engagementRateMinPercent),
        checkboxLabelText: config.engagementRateShoppableVideosOnly ? 'Filter by shoppable videos' : undefined,
        checkboxLabelSelector: config.engagementRateShoppableVideosOnly ? POPUP_CHECKBOX_LABEL_SELECTOR : undefined,
        checkboxExact: false,
        timeoutMs: 10000,
        intervalMs: 250,
        triggerPostClickWaitMs: 300,
        fillPostWaitMs: 120,
        checkboxPostClickWaitMs: 150,
        closeAfterFill: true,
        ...buildOutreachDismissPayload()
      },
      options: { retryCount: OUTREACH_STEP_RETRY_COUNT },
      onError: OUTREACH_STEP_ERROR_POLICY
    })
  }

  if (estPostRate !== 'All') {
    filterSteps.push({
      actionType: 'selectDropdownSingle',
      payload: {
        triggerText: 'Est. post rate',
        triggerSelector: FILTER_TITLE_SELECTOR,
        optionText: estPostRate,
        optionSelector: SINGLE_SELECT_OPTION_SELECTOR,
        waitSelector: SINGLE_SELECT_OPTION_SELECTOR,
        waitState: 'visible',
        exact: true,
        caseSensitive: false,
        timeoutMs: 10000,
        intervalMs: 250,
        triggerPostClickWaitMs: 250,
        optionPostClickWaitMs: 160,
        closeAfterSelect: true,
        ...buildOutreachDismissPayload()
      },
      options: { retryCount: OUTREACH_STEP_RETRY_COUNT },
      onError: OUTREACH_STEP_ERROR_POLICY
    })
  }

  if (brandCollaborationSelections.length) {
    filterSteps.push({
      actionType: 'selectDropdownMultiple',
      payload: {
        triggerText: 'Brand collaborations',
        triggerSelector: FILTER_TITLE_SELECTOR,
        optionTexts: brandCollaborationSelections,
        optionSelector: MULTI_SELECT_OPTION_SELECTOR,
        waitSelector: MULTI_SELECT_POPUP_SELECTOR,
        waitState: 'visible',
        exact: true,
        caseSensitive: false,
        scrollContainerSelector: POPUP_SCROLL_CONTAINER_SELECTOR,
        scrollStepPx: 420,
        maxScrollAttempts: 40,
        timeoutMs: 10000,
        intervalMs: 250,
        triggerPostClickWaitMs: 300,
        optionPostClickWaitMs: 180,
        closeAfterSelect: true,
        ...buildOutreachDismissPayload(),
        continueOnMissingOptions: true
      },
      options: { retryCount: OUTREACH_STEP_RETRY_COUNT },
      onError: OUTREACH_STEP_ERROR_POLICY
    })
  }

  return filterSteps.length ? [buildModuleButtonAction('Performance'), ...filterSteps] : []
}

const buildSearchKeywordSteps = (keyword: string): BrowserAction[] => {
  const normalizedKeyword = String(keyword || '').trim()

  return [
    {
      actionType: 'startJsonResponseCapture',
      payload: {
        captureKey: CREATOR_MARKETPLACE_CAPTURE_KEY,
        urlIncludes: CREATOR_MARKETPLACE_FIND_URL_KEYWORD,
        method: 'POST',
        reset: true
      },
      options: { retryCount: 1 },
      onError: 'abort'
    },
    {
      actionType: 'fillSelector',
      payload: {
        selector: SEARCH_INPUT_SELECTOR,
        value: normalizedKeyword,
        waitForState: 'visible',
        timeoutMs: 10000,
        intervalMs: 250,
        clearBeforeFill: true,
        postFillWaitMs: 120
      },
      options: { retryCount: 2 },
      onError: 'abort'
    },
    {
      actionType: 'clickByText',
      payload: {
        text: OUTREACH_FILTER_DISMISS_TEXT,
        selector: OUTREACH_FILTER_DISMISS_SELECTOR,
        exact: true,
        caseSensitive: false,
        timeoutMs: 10000,
        intervalMs: 250,
        postClickWaitMs: 120
      },
      options: { retryCount: 2 },
      onError: 'abort'
    },
    {
      actionType: 'clickSelector',
      payload: {
        selector: SEARCH_INPUT_SELECTOR,
        waitForState: 'visible',
        timeoutMs: 5000,
        intervalMs: 250,
        postClickWaitMs: 80
      },
      options: { retryCount: 2 },
      onError: 'abort'
    },
    {
      actionType: 'pressKey',
      payload: {
        key: 'Enter',
        postKeyWaitMs: 3000
      },
      options: { retryCount: 1 },
      onError: 'abort'
    }
  ]
}

const buildCreatorCollectionSteps = (): BrowserAction[] => [
  {
    actionType: 'collectApiItemsByScrolling',
    payload: {
      captureKey: CREATOR_MARKETPLACE_CAPTURE_KEY,
      responseListPath: 'creator_profile_list',
      dedupeByPath: 'creator_oecuid.value',
      fields: [
        {
          key: 'creator_id',
          path: 'creator_oecuid.value',
          defaultValue: ''
        },
        {
          key: 'avatar_url',
          path: 'avatar.value.thumb_url_list.0',
          defaultValue: ''
        },
        {
          key: 'category',
          path: 'category.value',
          arrayItemPath: 'name',
          joinWith: ',',
          defaultValue: ''
        },
        {
          key: 'creator_name',
          path: 'handle.value',
          defaultValue: ''
        }
      ],
      initialWaitMs: 2000,
      scrollContainerSelector: OUTREACH_SCROLL_CONTAINER_SELECTOR,
      scrollStepPx: 1400,
      scrollIntervalMs: 1800,
      settleWaitMs: 1500,
      maxIdleRounds: 3,
      maxScrollRounds: 200,
      saveAs: CREATOR_MARKETPLACE_DATA_KEY,
      saveSummaryAs: CREATOR_MARKETPLACE_SUMMARY_KEY,
      saveFilePathAs: CREATOR_MARKETPLACE_FILE_PATH_KEY,
      saveExcelFilePathAs: CREATOR_MARKETPLACE_EXCEL_FILE_PATH_KEY,
      saveRawItemsAs: CREATOR_MARKETPLACE_RAW_DATA_KEY,
      saveRawFilePathAs: CREATOR_MARKETPLACE_RAW_FILE_PATH_KEY,
      saveRawDirectoryPathAs: CREATOR_MARKETPLACE_RAW_DIRECTORY_PATH_KEY,
      outputDir: 'data/outreach',
      outputFilePrefix: 'creator_marketplace',
      excelOutputDir: 'data/outreach',
      excelOutputFilePrefix: 'creator_marketplace',
      rawOutputDir: 'data/outreach',
      rawOutputFilePrefix: 'creator_marketplace_raw',
      rawDirectoryOutputDir: 'data/outreach',
      rawDirectoryOutputPrefix: 'creator_marketplace_raw_items'
    },
    options: { retryCount: 1 },
    onError: 'abort'
  }
]

const buildOutreachFilterSteps = (filters: OutreachFilterConfig): BrowserAction[] => [
  ...buildCreatorFilterSteps(filters.creatorFilters),
  ...buildFollowerFilterSteps(filters.followerFilters),
  ...buildPerformanceFilterSteps(filters.performanceFilters),
  ...buildSearchKeywordSteps(filters.searchKeyword),
  ...buildCreatorCollectionSteps()
]

const buildSellerChatbotPrepareSteps = (): BrowserAction[] => [
  {
    actionType: 'waitForSelector',
    payload: {
      selector: SELLER_CHATBOT_INPUT_SELECTOR,
      state: 'visible',
      timeoutMs: 30000,
      intervalMs: 250
    },
    options: { retryCount: 3 },
    onError: 'abort'
  },
  {
    actionType: 'readText',
    payload: {
      selector: SELLER_CHATBOT_CREATOR_NAME_SELECTOR,
      saveAs: SELLER_CHATBOT_CREATOR_NAME_KEY,
      timeoutMs: 5000,
      intervalMs: 250,
      trim: true
    },
    options: { retryCount: 2 },
    onError: 'continue'
  },
  {
    actionType: 'readText',
    payload: {
      selector: SELLER_CHATBOT_TRANSCRIPT_SELECTOR,
      saveAs: SELLER_CHATBOT_TRANSCRIPT_BEFORE_KEY,
      timeoutMs: 5000,
      intervalMs: 250,
      trim: true,
      preserveLineBreaks: true
    },
    options: { retryCount: 2 },
    onError: 'continue'
  }
]

const buildSellerChatbotSendAttemptSteps = (message: string): BrowserAction[] => [
  {
    actionType: 'waitForSelector',
    payload: {
      selector: SELLER_CHATBOT_INPUT_SELECTOR,
      state: 'visible',
      timeoutMs: 10000,
      intervalMs: 250
    },
    options: { retryCount: 2 },
    onError: 'abort'
  },
  {
    actionType: 'fillSelector',
    payload: {
      selector: SELLER_CHATBOT_INPUT_SELECTOR,
      value: message,
      waitForState: 'visible',
      timeoutMs: 10000,
      intervalMs: 250,
      clearBeforeFill: true,
      postFillWaitMs: 150
    },
    options: { retryCount: 2 },
    onError: 'abort'
  },
  {
    actionType: 'readText',
    payload: {
      selector: SELLER_CHATBOT_INPUT_COUNT_SELECTOR,
      saveAs: SELLER_CHATBOT_INPUT_COUNT_KEY,
      timeoutMs: 3000,
      intervalMs: 200,
      trim: true
    },
    options: { retryCount: 1 },
    onError: 'abort'
  },
  {
    actionType: 'assertData',
    payload: {
      key: SELLER_CHATBOT_INPUT_COUNT_KEY,
      notEquals: '0'
    },
    options: { retryCount: 1 },
    onError: 'abort'
  },
  {
    actionType: 'clickSelector',
    payload: {
      selector: SELLER_CHATBOT_INPUT_SELECTOR,
      native: true,
      waitForState: 'visible',
      timeoutMs: 5000,
      intervalMs: 250,
      postClickWaitMs: 80
    },
    options: { retryCount: 1 },
    onError: 'abort'
  },
  {
    actionType: 'clickSelector',
    payload: {
      selector: SELLER_CHATBOT_SEND_BUTTON_SELECTOR,
      native: true,
      waitForState: 'visible',
      timeoutMs: 5000,
      intervalMs: 250,
      postClickWaitMs: 1500
    },
    options: { retryCount: 1 },
    onError: 'abort'
  },
  {
    actionType: 'waitForTextChange',
    payload: {
      selector: SELLER_CHATBOT_INPUT_COUNT_SELECTOR,
      previousKey: SELLER_CHATBOT_INPUT_COUNT_KEY,
      saveAs: SELLER_CHATBOT_INPUT_COUNT_AFTER_KEY,
      timeoutMs: 5000,
      intervalMs: 200
    },
    options: { retryCount: 1 },
    onError: 'continue'
  },
  {
    actionType: 'readText',
    payload: {
      selector: SELLER_CHATBOT_INPUT_COUNT_SELECTOR,
      saveAs: SELLER_CHATBOT_INPUT_COUNT_AFTER_KEY,
      timeoutMs: 3000,
      intervalMs: 200,
      trim: true
    },
    options: { retryCount: 1 },
    onError: 'continue'
  }
]

const buildSellerChatbotFinalizeSteps = (): BrowserAction[] => [
  {
    actionType: 'readText',
    payload: {
      selector: SELLER_CHATBOT_TRANSCRIPT_SELECTOR,
      saveAs: SELLER_CHATBOT_TRANSCRIPT_AFTER_KEY,
      timeoutMs: 8000,
      intervalMs: 300,
      trim: true,
      preserveLineBreaks: true
    },
    options: { retryCount: 2 },
    onError: 'continue'
  }
]

const buildSellerCreatorDetailSteps = (): BrowserAction[] => [
  {
    actionType: 'waitForBodyText',
    payload: {
      text: SELLER_CREATOR_DETAIL_READY_TEXT,
      timeoutMs: 30000,
      intervalMs: 500
    },
    options: { retryCount: 5 },
    onError: 'abort'
  }
]

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
            intervalMs: 500,
            retryGotoUrl: targetUrl,
            retryGotoPostLoadMs: 2500
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
            intervalMs: 500,
            retryGotoUrl: targetUrl,
            retryGotoPostLoadMs: 2500
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
            intervalMs: 500,
            retryGotoUrl: targetUrl,
            retryGotoPostLoadMs: 2500
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
