/**
 * 参数设置：统一单主视图（同屏支持参数分组改值草稿/批量原子保存 + 新增/编辑/删除参数定义）。
 * 参数定义表单事实来源：./config.schema.ts。
 */

import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Perm } from '@/components/Perm'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'

import { ConfigWorkspace } from './ConfigWorkspace'
import schema from './config.schema'

export default function ConfigPage() {
  const epoch = useAuthStore((state) => state.authorizationEpoch)
  return <ConfigPageContent key={epoch} />
}

function ConfigPageContent() {
  const { t } = useTranslation()
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <div data-theme-stage="" className="w-full min-w-0 space-y-6 p-4 sm:p-6">
      <PageHeader
        title={t('common.参数设置', { defaultValue: '参数设置' })}
        description="按分组维护系统参数值与参数定义，支持多页暂存、差异审阅与 40900 冲突解决。"
        actions={
          <Perm perm={schema.createPerm!}>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden="true" />
              新增参数
            </Button>
          </Perm>
        }
      />
      <div className="pb-24">
        <ConfigWorkspace active createOpen={createOpen} onCreateOpenChange={setCreateOpen} />
      </div>
    </div>
  )
}
