export interface UserInfoResponse {
  userId: string
  userShortId: number
  username: string
  nickname: string
  avatar: string
  userType: number
  permission: PermissionSetting
  updateTime: number
  inviteCode: string
  menuItemCount: number
}

export interface PermissionSetting {
  startTime: string
  endTime: string
  maxTabs: number
  enableDebug: boolean
}
