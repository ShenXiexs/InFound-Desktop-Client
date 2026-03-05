export interface AppInfo {
  name: string
  version: string
  description: string
  deviceId: string
  sessionId: number
}

export interface AppSetting {
  resourcesPath: string
  ui: {
    tabItemLeftSize: number
    splitSpace: number
  }
}

export interface CurrentUserInfo {
  userId: string
  userShortId: number
  username: string
  userType: number
  email?: string
  phoneNumber?: string
  avatar?: string
  nickname?: string
  tokenName: string
  tokenValue: string
  startTime: number
  endTime: number
  maxTabs: number
  updateTime: number
  enableDebug: boolean
  inviteCode: string
}

export interface AppStoreSchema {
  appSetting: AppSetting
  currentUser?: CurrentUserInfo
}

export interface AppState {
  appInfo: AppInfo
  appSetting: AppSetting
  isUpdating: boolean
  isLogin: boolean
  enableDebug: boolean
  currentUser?: CurrentUserInfo
}
