import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import * as apiClient from '@/lib/api/client'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'

import {
  deleteSystemFile,
  deleteSystemFilesBatch,
  downloadSystemFile,
  formatByteSize,
  getFileQuota,
  pageSystemFiles,
  uploadSystemFile,
  type FileQuotaSummary,
  type SystemFileRow,
} from './file.api'
import FilePage, { FileInspectorContent } from './index'

const SAMPLE_QUOTA: FileQuotaSummary = {
  usedUserBytes: 1_572_864,
  userQuotaBytes: 67_108_864,
  usedTotalBytes: 4_194_304,
  totalQuotaBytes: 536_870_912,
  maxFileSizeBytes: 10_485_760,
  activeFileCount: 2,
}

const SAMPLE_FILES: SystemFileRow[] = [
  {
    id: '9001',
    key: 'document/20261119/abc12345.pdf',
    category: 'document',
    originalFilename: 'quarterly-report.pdf',
    contentType: 'application/pdf',
    size: 1_048_576,
    sha256: 'deadbeef0123456789abcdefdeadbeef0123456789abcdefdeadbeef01234567',
    ownerId: '1',
    ownerUsername: 'admin',
    deptId: '100',
    remark: 'Q4 audit report',
    createTime: '2026-11-19T10:15:30',
  },
  {
    id: '9002',
    key: 'avatar/20261119/def67890.png',
    category: 'avatar',
    originalFilename: 'avatar.png',
    contentType: 'image/png',
    size: 524_288,
    sha256: 'cafebabe0123456789abcdefcafebabe0123456789abcdefcafebabe01234567',
    ownerId: '2',
    ownerUsername: 'alice',
    deptId: '101',
    remark: null,
    createTime: '2026-11-19T11:00:00',
  },
]

function seedFileQueries(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
  })
  queryClient.setQueryData(['system', 'files', 'quota', 1], SAMPLE_QUOTA)
  queryClient.setQueryData(
    [
      'system',
      'files',
      'page',
      { page: 1, size: 10, keyword: '', category: '', contentType: '' },
      1,
    ],
    {
      list: SAMPLE_FILES,
      total: 2,
      page: 1,
      size: 10,
    },
  )
  return queryClient
}

function renderFilePage(queryClient: QueryClient): string {
  return renderToStaticMarkup(
    <TooltipProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <FilePage />
        </MemoryRouter>
      </QueryClientProvider>
    </TooltipProvider>,
  )
}

function applyAuthState(perms: string[], allScopePerms: string[] = perms) {
  useAuthStore.setState({
    meLoaded: true,
    bootstrapped: true,
    sessionEpoch: 1,
    authorizationEpoch: 1,
    authorizationSnapshotId: 'file-test-snapshot',
    authorizationDeadline: Number.POSITIVE_INFINITY,
    perms,
    allScopePerms,
    menus: [],
  })
  // renderToStaticMarkup reads Zustand's getInitialState() via getServerSnapshot
  Object.assign(useAuthStore.getInitialState(), useAuthStore.getState())
}

describe('System file management workspace', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useSettingsStore.setState({ language: 'zh', motionEnabled: false })
    Object.assign(useSettingsStore.getInitialState(), useSettingsStore.getState())
    applyAuthState([
      'system:file:list',
      'system:file:upload',
      'system:file:remove',
      'system:user:list',
    ])
  })

  it('renders unified quota strip, file table rows and authorized controls without cluttered chrome', () => {
    const html = renderFilePage(seedFileQueries())

    expect(html).toContain('文件管理')
    expect(html).toContain('上传文件')
    expect(html).toContain('p-4 sm:p-6')
    expect(html).toContain('data-slot="file-quota-strip"')
    expect(html).toContain('1.5 MB / 64.0 MB')
    expect(html).toContain('4.0 MB / 512 MB')
    expect(html).toContain('quarterly-report.pdf')
    expect(html).toContain('avatar.png')
    expect(html).toContain('详情: quarterly-report.pdf')
    expect(html).toContain('下载: quarterly-report.pdf')
    expect(html).toContain('删除: quarterly-report.pdf')

    expect(html).not.toContain('当前账户仅可管理本人上传或授权范围内的文件')
    expect(html).not.toContain('file-workspace-layout')
    expect(html).not.toContain('全部全部分类')
    expect(html).not.toContain('全部全部类型')
    expect(html).not.toContain('选择表格行，查看存储键')
  })

  it('renders file inspector metadata, digest and action controls cleanly', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <FileInspectorContent
          file={SAMPLE_FILES[0]}
          downloading={false}
          copiedField={null}
          categoryLabel="文档资料"
          onCopy={vi.fn()}
          onDownload={vi.fn()}
          onRequestDelete={vi.fn()}
        />
      </MemoryRouter>,
    )

    expect(html).toContain('quarterly-report.pdf')
    expect(html).toContain('document/20261119/abc12345.pdf')
    expect(html).toContain('deadbeef0123456789abcdefdeadbeef0123456789abcdefdeadbeef01234567')
    expect(html).toContain('Q4 audit report')
    expect(html).toContain('文档资料')
    expect(html).toContain('下载')
    expect(html).toContain('删除')
  })

  it('hides upload and delete controls when user lacks write permissions', () => {
    applyAuthState(['system:file:list'], [])
    const html = renderFilePage(seedFileQueries())

    expect(html).toContain('quarterly-report.pdf')
    expect(html).toContain('下载: quarterly-report.pdf')
    expect(html).not.toContain('上传文件')
    expect(html).not.toContain('删除: quarterly-report.pdf')
  })

  it('shows personal quota and upload trigger when only upload permission is granted', () => {
    applyAuthState(['system:file:upload'], [])
    const html = renderFilePage(seedFileQueries())

    expect(html).toContain('上传文件')
    expect(html).toContain('data-columns="2"')
    expect(html).toContain('1.5 MB / 64.0 MB')
    expect(html).not.toContain('4.0 MB / 512 MB')
    expect(html).not.toContain('quarterly-report.pdf')
  })

  it('calls backend file endpoints with expected query, multipart upload and batch delete payloads', async () => {
    const reqSpy = vi.spyOn(apiClient, 'request').mockResolvedValue({
      list: SAMPLE_FILES,
      total: 2,
      page: 1,
      size: 10,
    })
    await pageSystemFiles({
      page: 1,
      size: 20,
      keyword: ' report ',
      category: 'document',
      contentType: 'application/pdf',
    })
    expect(reqSpy).toHaveBeenCalledWith('/system/files/page', {
      query: {
        page: 1,
        size: 20,
        keyword: 'report',
        category: 'document',
        contentType: 'application/pdf',
      },
      signal: undefined,
    })

    await getFileQuota()
    expect(reqSpy).toHaveBeenCalledWith('/system/files/quota', { signal: undefined })

    const postSpy = vi.spyOn(apiClient.http, 'post').mockResolvedValue({
      id: '9003',
      key: 'attachment/20261119/upload.png',
      originalFilename: 'photo.png',
      contentType: 'image/png',
      size: 12,
    })
    const onProgress = vi.fn()
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'photo.png', {
      type: 'image/png',
    })
    await uploadSystemFile(file, { category: 'attachment', remark: '  evidence  ' }, onProgress)
    expect(postSpy).toHaveBeenCalledWith(
      '/system/files/upload',
      expect.any(FormData),
      expect.objectContaining({
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    )
    const sentForm = postSpy.mock.calls[0]?.[1] as FormData
    expect(sentForm.get('category')).toBe('attachment')
    expect(sentForm.get('remark')).toBe('evidence')
    expect(sentForm.get('file')).toBe(file)

    const rawSpy = vi.spyOn(apiClient, 'rawRequest').mockResolvedValue(new Blob(['ok']))
    await downloadSystemFile('9001')
    expect(rawSpy).toHaveBeenCalledWith('/system/files/9001/download', 'blob', {
      signal: undefined,
    })

    await deleteSystemFile('9001')
    expect(reqSpy).toHaveBeenCalledWith('/system/files/9001', { method: 'DELETE' })

    await deleteSystemFilesBatch(['9001', '9002'])
    expect(reqSpy).toHaveBeenCalledWith('/system/files/batch', {
      method: 'DELETE',
      body: { ids: ['9001', '9002'] },
    })

    expect(formatByteSize(0)).toBe('0 B')
    expect(formatByteSize(1536)).toBe('1.5 KB')
    expect(formatByteSize(512 * 1024 * 1024)).toBe('512 MB')
  })
})
