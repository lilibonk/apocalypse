import type { ComponentType } from 'react'

import { PulseIndicator } from '@/components/motion'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { DynaDetail } from './DynaDetail'
import { DynaForm, type DynaAsyncFieldValidator, type DynaFormProps } from './DynaForm'
import { DynaImportDialog } from './DynaImportDialog'
import { rowIdOf, type DynaController } from './use-dyna-controller'
import { useDynaText } from './use-dyna'

export interface DynaDialogsProps {
  controller: DynaController
  formComponent?: ComponentType<DynaFormProps>
  asyncValidators?: Record<string, DynaAsyncFieldValidator>
}

/**
 * Composable CRUD dialogs (Create/Edit Form, Detail Sheet, CSV Import, Delete, Batch Delete,
 * Status Toggle) driven by a headless `useDynaController` instance. Spatial workspaces can mount
 * `<DynaDialogs controller={dyna} />` directly without wrapping in `DynaPage`.
 */
export function renderDynaDialogs({
  controller,
  formComponent: FormComponent = DynaForm,
  asyncValidators,
  t,
}: DynaDialogsProps & { t: ReturnType<typeof useDynaText> }) {
  const { schema, rowKey, entity, selectedKeys, actions, dialogs } = controller
  const {
    dialog,
    setDialog,
    viewing,
    setViewing,
    deleting,
    setDeleting,
    toggling,
    setToggling,
    batchDeleting,
    setBatchDeleting,
    importing,
    setImporting,
    savePending,
    deletePending,
    batchDeletePending,
    togglePending,
    submitSave,
    confirmDelete,
    confirmBatchDelete,
    confirmToggle,
  } = dialogs

  const deletingDisplay = deleting
    ? String(deleting[schema.deleteNameKey ?? rowKey] ?? rowIdOf(deleting, rowKey))
    : ''
  const togglingDisplay = toggling
    ? String(toggling.row[schema.deleteNameKey ?? rowKey] ?? rowIdOf(toggling.row, rowKey))
    : ''

  return (
    <>
      {schema.form && (
        <FormComponent
          config={schema.form}
          mode={dialog?.mode ?? 'create'}
          open={dialog !== null}
          initialRow={dialog?.row ?? null}
          submitting={savePending}
          asyncValidators={asyncValidators}
          onOpenChange={(open) => !open && setDialog(null)}
          onSubmit={submitSave}
        />
      )}

      <DynaDetail
        open={viewing !== null}
        onOpenChange={(open) => !open && setViewing(null)}
        title={schema.detail?.title ?? `${schema.entityName ?? '记录'}详情`}
        description={schema.detail?.description}
        fields={schema.detail?.fields ?? schema.columns}
        record={viewing}
      />

      {schema.importPerm && (
        <DynaImportDialog
          open={importing}
          onOpenChange={setImporting}
          endpoint={schema.endpoint}
          templatePath={schema.importTemplatePath}
          entityName={entity}
          templateFileName={schema.importTemplateFileName ?? `${schema.key}-template.csv`}
          onImported={() => void actions.invalidate()}
        />
      )}

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && !deletePending && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('确认删除')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteHint', { entity, name: deletingDisplay })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePending}>{t('取消')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deletePending}
              onClick={(event) => {
                event.preventDefault()
                confirmDelete()
              }}
            >
              {deletePending && <PulseIndicator variant="inline" tone="current" />}
              {deletePending ? t('删除中…') : t('确认删除')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={batchDeleting}
        onOpenChange={(open) => !open && !batchDeletePending && setBatchDeleting(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('确认删除')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('batchDeleteHint', { count: selectedKeys.length, entity })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={batchDeletePending}>{t('取消')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={batchDeletePending}
              onClick={(event) => {
                event.preventDefault()
                confirmBatchDelete()
              }}
            >
              {batchDeletePending && <PulseIndicator variant="inline" tone="current" />}
              {batchDeletePending ? t('删除中…') : t('确认删除')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={toggling !== null}
        onOpenChange={(open) => !open && !togglePending && setToggling(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('confirmToggle', { action: toggling ? t(toggling.label) : '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('toggleHint', {
                action: toggling ? t(toggling.label) : '',
                entity,
                name: togglingDisplay,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={togglePending}>{t('取消')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={togglePending}
              onClick={(event) => {
                event.preventDefault()
                confirmToggle()
              }}
            >
              {togglePending && <PulseIndicator variant="inline" tone="current" />}
              {togglePending ? t('处理中…') : toggling ? t(toggling.label) : ''}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export function DynaDialogs(props: DynaDialogsProps) {
  const t = useDynaText()
  return renderDynaDialogs({ ...props, t })
}
