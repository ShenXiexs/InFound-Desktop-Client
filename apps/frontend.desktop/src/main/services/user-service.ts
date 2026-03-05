import openapiRequest from './base/open-api-service'
import { UserInfoResponse } from './dtos/user-info'
import { BaseApiResponse } from '../utils/net-request'
import { AuthenticationException } from '../modules/exception/exception-types'

export async function loginAsync(username: string, password: string): Promise<UserInfoResponse | null> {
  const result = await openapiRequest.post<BaseApiResponse<Record<string, any>>>('/account/login', {
    username: username.trim(),
    password: password.trim()
  })

  if (result.code === 200) {
    const userInfoResult = await openapiRequest.get<BaseApiResponse<UserInfoResponse>>('/user/info')
    if (userInfoResult.code === 200) {
      return userInfoResult.data!
    } else {
      throw new AuthenticationException(new Error(userInfoResult.msg), 'error.loginNotExist')
    }
  } else {
    const originalError = new Error(result.msg)
    switch (result.code) {
      case 2008: {
        throw new AuthenticationException(originalError, 'error.loginPause')
      }
      case 2103: {
        throw new AuthenticationException(originalError, 'error.loginExpired')
      }
      case 2003: {
        throw new AuthenticationException(originalError, 'error.loginNotExist')
      }
      case 2004: {
        throw new AuthenticationException(originalError, 'error.loginErrorPassword')
      }
    }
  }
  return null
}
