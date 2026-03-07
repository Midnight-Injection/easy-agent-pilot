import { createApp } from 'vue'
import App from './App.vue'
import { pinia } from './stores'
import router from './router'
import i18n from './i18n'

// 导入全局样式
import './styles/base.css'

// 初始化日志过滤器，过滤掉第三方库的警告
import { initLogger } from './utils/logger'
initLogger()

const app = createApp(App)

// 使用 Pinia 状态管理
app.use(pinia)

// Pinia HMR 支持 - 确保热更新时 store 状态正确保留
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    // HMR 时不需要额外操作，Pinia 会自动处理
  })
}

// 使用 Vue Router
app.use(router)

// 使用 i18n 国际化
app.use(i18n)

// 挂载应用
app.mount('#app')
