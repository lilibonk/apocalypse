/** Metadata updates never accept code identities, resource bindings or scope declarations. */
export function permissionMetadataBody(body: Record<string, unknown>, version: unknown) {
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0)
    throw new Error('权限定义版本未完整加载')
  return {
    expectedVersion: version,
    name: String(body.name ?? '').trim(),
    description: typeof body.description === 'string' ? body.description : null,
    status: body.status,
    lifecycle: body.lifecycle,
  }
}
