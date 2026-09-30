package io.apocalypse.system.authorization.dto.response;

import java.util.List;

/** 当前具体操作的服务端部门范围，不接受客户端范围表达式。 */
public record DataScopeResp(boolean all, List<Long> departmentIds) {
  public boolean permits(Long departmentId) {
    return all || (departmentId != null && departmentIds.contains(departmentId));
  }
}
