import { DynaForm, type DynaFormProps } from '@/components/dyna/DynaForm'

/**
 * Definition editor for the DynaPage list: edits send the row's `version` as `expectedVersion`, so a
 * concurrent change (including one from the value workspace) returns 40900 instead of being lost.
 */
export function ConfigForm(props: DynaFormProps) {
  const version = props.initialRow?.version
  return (
    <DynaForm
      {...props}
      onSubmit={(body) =>
        props.onSubmit(
          props.mode === 'edit' && typeof version === 'number'
            ? { ...body, expectedVersion: version }
            : body,
        )
      }
    />
  )
}
