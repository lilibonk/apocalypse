package io.apocalypse.framework.security;

import java.time.Instant;

/** system 提供的只读授权端口；身份、版本、角色、授予和部门集合必须来自同一个数据库快照。 */
public interface UserAuthorizationQuery {
  AuthorizationSnapshot read(Long userId, String username, Instant evaluatedAt);
}
