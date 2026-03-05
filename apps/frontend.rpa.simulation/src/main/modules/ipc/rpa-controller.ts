import { app } from 'electron'
import path from 'path'
import { IPCHandle, IPCType } from './base/ipc-decorator'
import { IPC_CHANNELS } from '@common/types/ipc-type'
import { logger } from '../../utils/logger'
import { appWindowsAndViewsManager } from '../../windows/app-windows-and-views-manager'
import { AutomationRunner, RPATask } from '@infound/desktop-shared'
import { randomUUID } from 'node:crypto'

const getBrowserPath = (headless: boolean): string => {
  // 生产环境：指向 extraResources 下的文件夹
  let browserPath = ''

  if (headless) {
    browserPath = app.isPackaged
      ? path.join(process.resourcesPath, 'chromium', 'chromium_headless_shell-1208', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe')
      : path.join(__dirname, '../../node_modules/playwright-core/.local-browsers/chromium_headless_shell-1208/chrome-headless-shell-win64/chrome-headless-shell.exe')
  } else {
    browserPath = app.isPackaged
      ? path.join(process.resourcesPath, 'chromium', 'chromium-1208', 'chrome-win64', 'chrome.exe')
      : path.join(__dirname, '../../node_modules/playwright-core/.local-browsers/chromium-1208/chrome-win64/chrome.exe')
  }

  return browserPath
}

export class RPAController {
  @IPCHandle(IPC_CHANNELS.RPA_SELLER_LOGIN, IPCType.SEND)
  async sellerLogin(): Promise<void> {
    logger.info('启动店铺登录 RPA 任务')

    await appWindowsAndViewsManager.tkWebContentView.openView('https://seller-mx.tiktok.com/')
  }

  @IPCHandle(IPC_CHANNELS.RPA_SELLER_OUT_REACH, IPCType.SEND)
  async sellerOutReach(): Promise<void> {
    logger.info('启动店铺建联 RPA 任务')

    const taskData = {
      taskId: randomUUID(),
      taskName: '店铺建联任务',
      version: '1.0.0',
      config: {
        enableTrace: true,
        retryCount: 3
      },
      steps: [
        {
          actionType: 'goto',
          payload: { url: 'https://seller-mx.tiktok.com/account/login', waitUntil: 'load' }
        },
        {
          actionType: 'clickElement',
          payload: {
            locator: { type: 'xpath', value: '//span[@id="TikTok_Ads_SSO_Login_Email_Panel_Button"]' }
          },
          options: {
            retryCount: 3
          }
        },
        {
          actionType: 'fillElement',
          payload: {
            locator: { type: 'xpath', value: '//input[@id="TikTok_Ads_SSO_Login_Email_Input"]' },
            value: 'rnd.infound@gmail.com'
          }
        },
        {
          actionType: 'fillElement',
          payload: {
            locator: { type: 'xpath', value: '//input[@id="TikTok_Ads_SSO_Login_Pwd_Input"]' },
            value: 'if@202511!^',
            afterKey: 'Enter' // 现在 afterKey 成了 FillPayload 的一部分，逻辑更内聚
          }
        }
      ]
    } as RPATask

    const headless = false
    const runner = new AutomationRunner(logger, taskData)
    await runner.initContextAsync(path.join(process.cwd(), 'userdata'), getBrowserPath(headless), headless)
    await runner.execute()
  }
}
