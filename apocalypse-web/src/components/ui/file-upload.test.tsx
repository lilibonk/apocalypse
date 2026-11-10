import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { FileUpload, validateUploadFile } from './file-upload'

describe('FileUpload component and validation (FE-W6 M2)', () => {
  it('validates file extension, MIME type, and size budget', () => {
    const validCsv = new File(['username,nickname\nadmin,Admin'], 'users.csv', {
      type: 'text/csv',
    })
    expect(validateUploadFile(validCsv, { accept: '.csv,text/csv', maxSizeMb: 5 })).toBeNull()

    const wrongType = new File(['hello'], 'notes.exe', {
      type: 'application/octet-stream',
    })
    expect(validateUploadFile(wrongType, { accept: '.csv,text/csv', maxSizeMb: 5 })).toContain(
      '.csv,text/csv',
    )

    const oversized = new File([new Uint8Array(2 * 1024 * 1024)], 'huge.csv', {
      type: 'text/csv',
    })
    expect(validateUploadFile(oversized, { accept: '.csv', maxSizeMb: 1 })).toContain('1 MB')
  })

  it('renders dropzone and selected file state', () => {
    const emptyHtml = renderToStaticMarkup(
      <FileUpload value="" onValueChange={vi.fn()} accept=".csv" maxSizeMb={5} />,
    )
    expect(emptyHtml).toContain('data-slot="file-upload"')
    expect(emptyHtml).toContain('accept=".csv"')

    const filledHtml = renderToStaticMarkup(
      <FileUpload value="users.csv" onValueChange={vi.fn()} accept=".csv" maxSizeMb={5} />,
    )
    expect(filledHtml).toContain('users.csv')
  })

  it('supports AbortSignal for cancelling an in-flight upload', async () => {
    let capturedSignal: AbortSignal | undefined
    const uploadFn = vi.fn(
      (_file: File, onProgress: (percent: number) => void, signal?: AbortSignal) => {
        capturedSignal = signal
        onProgress(50)
        return new Promise<string>((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            const err = new Error('Canceled')
            err.name = 'CanceledError'
            reject(err)
          })
        })
      },
    )

    const controller = new AbortController()
    const file = new File(['data'], 'report.csv', { type: 'text/csv' })
    const promise = uploadFn(file, vi.fn(), controller.signal)
    expect(capturedSignal).toBe(controller.signal)
    controller.abort()
    await expect(promise).rejects.toThrow('Canceled')
    expect(capturedSignal?.aborted).toBe(true)
  })
})
