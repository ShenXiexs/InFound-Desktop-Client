import { app, BrowserWindow, protocol, shell } from 'electron'
import path from 'path'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { IPCManager } from './modules/ipc/base/ipc-manager'
import { RPAController } from './modules/ipc/rpa-controller'
import { LoggerController } from './modules/ipc/logger-controller'
import { appWindowsAndViewsManager } from './windows/app-windows-and-views-manager'
import { AppController } from './modules/ipc/app-controller'
import { logger } from './utils/logger'

let userDataPath = path.join(app.getPath('appData'), app.getName())
if (import.meta.env.MODE !== 'pro') {
  userDataPath = path.join(app.getPath('appData'), app.getName() + import.meta.env.MODE)
  app.commandLine.appendSwitch('ignore-certificate-errors')
}
app.setPath('userData', userDataPath)

logger.info('程序启动')

app.whenReady().then(async () => {
  protocol.handle('bytedance', () => {
    logger.warn('已从系统底层彻底拦截 bytedance 协议')
    return new Response('Protocol Blocked', { status: 403 })
  })

  const originalOpenExternal = shell.openExternal
  shell.openExternal = async (url, options) => {
    if (url.startsWith('bytedance://') || url.startsWith('ms-windows-store://')) {
      logger.error(`[安全拦截] 阻止了对外部应用的调起: ${url}`)
      return Promise.resolve() // 直接返回空，什么都不做
    }
    return originalOpenExternal(url, options)
  }

  electronApp.setAppUserModelId('if.xunda.rpa.simulation')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  IPCManager.register(new LoggerController())
  IPCManager.register(new AppController())
  IPCManager.register(new RPAController())

  await appWindowsAndViewsManager.initMainWindow()
  appWindowsAndViewsManager.mainWindow.showWindow()

  app.on('activate', async function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) await appWindowsAndViewsManager.initMainWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
