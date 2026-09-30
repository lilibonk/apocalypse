import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { toast } from 'sonner'

import { AppProviders } from '@/app/providers'
import { queryClient } from '@/app/query-client'
import { DynaForm } from '@/components/dyna/DynaForm'
import { http } from '@/lib/api/client'
import { useSettingsStore } from '@/stores/settings'
import { UserForm } from '@/views/system/user/UserForm'
import userSchema from '@/views/system/user/user.schema'
import { RoleForm } from '@/views/system/role/RoleForm'
import roleSchema from '@/views/system/role/role.schema'
import '@/index.css'

if (!import.meta.env.DEV) throw new Error('Test fixture is dev-only')
let denied = false
let empty = false
let operation = ''
http.defaults.adapter = async (config) => {
  if (config.url !== '/system/users/department-options')
    throw new Error('Unexpected fixture request')
  operation = String(config.params.operation)
  return {
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
    data: denied
      ? { code: 40300, message: '本次操作没有部门选择权限' }
      : {
          code: 0,
          data: empty
            ? []
            : [
                {
                  id: '9223372036854775806',
                  parentId: '0',
                  deptName: 'Fixture department',
                  status: 1,
                  children: [],
                },
              ],
        },
  }
}

function Controls() {
  const [open, setOpen] = useState<'form' | 'user-create' | 'user-edit' | 'role-edit' | null>(null)
  const [saved, setSaved] = useState({ count: 0, department: '', dataScope: '', operation: '' })
  const onSubmit = (body: Record<string, unknown>) => {
    setSaved((current) => ({
      count: current.count + 1,
      department: String(body.deptId ?? ''),
      dataScope: String(body.dataScope ?? ''),
      operation,
    }))
    setOpen(null)
  }
  const openUser = (mode: 'user-create' | 'user-edit', reject = false, noOptions = false) => {
    denied = reject
    empty = noOptions
    queryClient.clear()
    setOpen(mode)
  }
  return (
    <>
      <button onClick={() => useSettingsStore.getState().setTheme('light')}>Theme light</button>
      <button onClick={() => useSettingsStore.getState().setTheme('dark')}>Theme dark</button>
      <button onClick={() => useSettingsStore.getState().setTheme('system')}>Theme system</button>
      <button onClick={() => toast.success('Ready')}>Show toast</button>
      <button onClick={() => setOpen('form')}>Open form</button>
      <button onClick={() => openUser('user-create')}>Create user</button>
      <button onClick={() => openUser('user-edit')}>Edit user</button>
      <button onClick={() => openUser('user-create', true)}>Denied user</button>
      <button onClick={() => openUser('user-create', false, true)}>Empty user</button>
      <button onClick={() => setOpen('role-edit')}>Edit legacy role</button>
      <output
        data-testid="saved"
        data-count={saved.count}
        data-department={saved.department}
        data-scope={saved.dataScope}
        data-operation={saved.operation}
      >
        Saved {saved.count}
      </output>
      <DynaForm
        config={{
          createTitle: 'Fixture form',
          fields: [{ name: 'name', label: 'Name', type: 'input', required: true }],
        }}
        mode="create"
        open={open === 'form'}
        submitting={false}
        onOpenChange={(next) => !next && setOpen(null)}
        onSubmit={onSubmit}
      />
      <UserForm
        config={userSchema.form!}
        mode={open === 'user-edit' ? 'edit' : 'create'}
        open={open === 'user-create' || open === 'user-edit'}
        initialRow={
          open === 'user-edit'
            ? {
                id: '1',
                username: 'fixture',
                nickname: 'Existing',
                deptId: 'disabled-dept',
                deptName: 'Disabled department',
              }
            : null
        }
        submitting={false}
        onOpenChange={(next) => !next && setOpen(null)}
        onSubmit={onSubmit}
      />
      <RoleForm
        config={roleSchema.form!}
        mode="edit"
        open={open === 'role-edit'}
        initialRow={
          open === 'role-edit'
            ? { id: '1', roleName: 'Legacy', roleKey: 'legacy', status: 1 }
            : null
        }
        submitting={false}
        onOpenChange={(next) => !next && setOpen(null)}
        onSubmit={onSubmit}
      />
    </>
  )
}
useSettingsStore.setState({ motionEnabled: false })
createRoot(document.getElementById('root')!).render(
  <AppProviders>
    <Controls />
  </AppProviders>,
)
