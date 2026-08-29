import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { AppProviders } from '@/app/providers'
import { AppRouter } from '@/app/router'
// stores/auth 模块加载时完成 client 接线，必须先于任何请求
import '@/stores/auth'
// i18n 初始化（zh 默认，设置面板语言切换由 providers 同步）
import '@/i18n'

import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <AppRouter />
    </AppProviders>
  </StrictMode>,
)
