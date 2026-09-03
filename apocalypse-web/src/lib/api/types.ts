/**
 * 后端联调契约类型（与 apocalypse 后端 `common.response`、`system` 域视图对应）。
 *
 * 关键约定：
 * - 装箱 Long id（雪花）在 JSON 中是 string，前端一律用 string 承载，禁止 Number() 转换。
 * - 业务成功 R.code === 0；业务错误 HTTP 200 + 非 0 code；未认证 40100。
 * - 后端 record 字段名与任务书偶有出入（如菜单是 `type` 而非 `menuType`），
 *   统一在本层 normalize 后向上暴露，页面只认本文件的类型。
 */

/** 统一响应信封。 */
export interface R<T> {
  code: number
  message: string
  data: T
  traceId: string
  timestamp: number
}

/** 分页结构。 */
export interface PageResult<T> {
  list: T[]
  total: number
  page: number
  size: number
}

/** 雪花 id（JSON string）。 */
export type SnowflakeId = string

/** 登录/刷新令牌对（对应后端 AuthService.TokenResponse）。 */
export interface TokenPair {
  accessToken: string
  refreshToken: string | null
  /** 秒。 */
  expiresIn: number
  tokenType: string
}

/** 菜单树节点（normalize 后的前端形态）。menuType: C=目录 M=菜单 F=按钮。 */
export interface MenuNode {
  id: SnowflakeId
  parentId: SnowflakeId
  menuName: string
  menuType: 'C' | 'M' | 'F'
  path: string | null
  component: string | null
  perms: string | null
  icon: string | null
  /** 编译期业务能力键；null 表示核心能力。 */
  moduleKey: string | null
  sort: number
  children: MenuNode[]
}

/** 后端菜单原始形态（字段名兼容：type/menuType 皆收）。 */
export interface RawMenuNode {
  id: SnowflakeId
  parentId: SnowflakeId
  menuName: string
  type?: 'C' | 'M' | 'F'
  menuType?: 'C' | 'M' | 'F'
  path: string | null
  component: string | null
  perms: string | null
  icon: string | null
  moduleKey?: string | null
  sort: number | null
  children?: RawMenuNode[] | null
}

/** 用户信息。 */
export interface UserInfo {
  id: SnowflakeId
  username: string
  nickname: string | null
  status?: number
  deptId?: SnowflakeId | null
  deptName?: string | null
  createTime?: string
}

/** GET /system/users/me 的 data。 */
export interface CurrentUser {
  user: UserInfo
  roles: string[]
  perms: string[]
  menus: RawMenuNode[]
}

/** 字典数据项。 */
export interface DictData {
  id: SnowflakeId
  dictType: string
  dictLabel: string
  dictValue: string
  sort: number
  status: number
  remark: string | null
}

/** 用户创建请求（对应 UserCreateReq）。 */
export interface UserCreateReq {
  username: string
  password: string
  nickname?: string
  deptId?: SnowflakeId | null
}

/** 用户更新请求（对应 UserUpdateReq，字段均可选）。 */
export interface UserUpdateReq {
  nickname?: string
  status?: number
  deptId?: SnowflakeId | null
}

/** 未认证业务码（token 失效/黑名单同码）。 */
export const CODE_UNAUTHORIZED = 40100
/** 业务成功码。 */
export const CODE_SUCCESS = 0

/** 菜单原始节点 → 前端形态（字段名兼容在此收敛）。 */
export function normalizeMenuNode(raw: RawMenuNode): MenuNode {
  const menuType = raw.menuType ?? raw.type ?? 'M'
  return {
    id: raw.id,
    parentId: raw.parentId,
    menuName: raw.menuName,
    menuType,
    path: raw.path ?? null,
    component: raw.component ?? null,
    perms: raw.perms ?? null,
    icon: raw.icon ?? null,
    moduleKey: raw.moduleKey ?? null,
    sort: raw.sort ?? 0,
    children: (raw.children ?? []).map(normalizeMenuNode),
  }
}
