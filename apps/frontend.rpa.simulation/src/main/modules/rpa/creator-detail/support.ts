import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  SellerCreatorDetailData,
  SellerCreatorDetailPayload,
  SellerCreatorDetailPayloadInput
} from '@common/types/rpa-creator-detail'
import type { BrowserAction } from '../task-dsl/browser-actions'

export const SELLER_CREATOR_DETAIL_READY_TEXT = 'Creator details'

const createDefaultSellerCreatorDetailPayload = (): SellerCreatorDetailPayload => ({
  creatorId: ''
})

export const createDemoSellerCreatorDetailPayload = (): SellerCreatorDetailPayloadInput => ({
  creatorId: '7495400123324336701'
})

export const mergeSellerCreatorDetailPayload = (
  input?: SellerCreatorDetailPayloadInput
): SellerCreatorDetailPayload => {
  const defaults = createDefaultSellerCreatorDetailPayload()
  return {
    creatorId: String(input?.creatorId ?? defaults.creatorId).trim()
  }
}

export const isSellerCreatorDetailPayloadInput = (value: unknown): value is SellerCreatorDetailPayloadInput => {
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

export const persistSellerCreatorDetailSessionMarkdown = (params: {
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

export const countCollectedCreatorDetailFields = (detail: SellerCreatorDetailData): number =>
  Object.values(detail).reduce((count, value) => {
    if (Array.isArray(value)) {
      return count + (value.length > 0 ? 1 : 0)
    }
    if (value && typeof value === 'object') {
      return count + (Object.keys(value as Record<string, unknown>).length > 0 ? 1 : 0)
    }
    return count + (String(value ?? '').trim() ? 1 : 0)
  }, 0)

export const buildSellerCreatorDetailSteps = (): BrowserAction[] => [
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
