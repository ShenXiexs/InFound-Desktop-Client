import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '@renderer/pages/portal/views/Home.vue'
import LoginView from '@renderer/pages/portal/views/Login.vue'
import { AppState } from '@infound/desktop-shared'
import { rendererStore } from '@renderer/store/renderer-store'

const router = createRouter({
  // history: createWebHistory(import.meta.env.BASE_URL),
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: { requiresAuth: true }
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView
    }
  ]
})

//登录验证
router.beforeEach((to, _from, next) => {
  //登录
  const globalState: AppState = rendererStore.currentState
  if (to.meta.requiresAuth) {
    //需要登录权限进入的路由
    if (!globalState.isLogin) {
      //window.logger.info(`to: ${to.path}, isLogin: ${globalState.isLogin}, go to /login`)
      next({
        path: '/login'
      })
    } else {
      return next() //获取到登录信息进行下一步
    }
  } else {
    //不需要权限登录的直接进行下一步
    return next()
  }
})

export default router
