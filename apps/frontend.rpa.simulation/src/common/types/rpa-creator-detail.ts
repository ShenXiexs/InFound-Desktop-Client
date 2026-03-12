export interface SellerCreatorDetailPayload {
  creatorId: string
}

export interface SellerCreatorDetailPayloadInput {
  creatorId: string
}

export type CreatorDetailLegendMap = Record<string, string>

export interface CreatorDetailVideoItem {
  video_name: string
  video_released_time_utc: string
  video_view: string
  video_like: string
}

export interface SellerCreatorDetailData {
  creator_id: string
  region: string
  target_url: string
  collected_at_utc: string
  creator_name: string
  creator_rating: string
  creator_review_count: string
  creator_followers_count: string
  creator_mcn: string
  creator_intro: string
  gmv: string
  items_sold: string
  gpm: string
  gmv_per_customer: string
  est_post_rate: string
  avg_commission_rate: string
  products: string
  brand_collaborations: string
  brands_list: string
  product_price: string
  video_gpm: string
  videos_count: string
  avg_video_views: string
  avg_video_engagement: string
  avg_video_likes: string
  avg_video_comments: string
  avg_video_shares: string
  live_gpm: string
  live_streams: string
  avg_live_views: string
  avg_live_engagement: string
  avg_live_likes: string
  avg_live_comments: string
  avg_live_shares: string
  gmv_per_sales_channel: CreatorDetailLegendMap
  gmv_by_product_category: CreatorDetailLegendMap
  follower_gender: CreatorDetailLegendMap
  follower_age: CreatorDetailLegendMap
  videos_list: CreatorDetailVideoItem[]
  videos_with_product: CreatorDetailVideoItem[]
  relative_creators: string[]
}
