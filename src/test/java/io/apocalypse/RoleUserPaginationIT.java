package io.apocalypse;

import io.apocalypse.system.role.dto.response.RoleUserResp;
import io.apocalypse.system.role.mapper.SysRoleMapper;
import io.apocalypse.system.user.entity.SysUserEntity;
import io.apocalypse.system.user.mapper.SysUserMapper;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.LongStream;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;

/** Equal creation timestamps must not duplicate or omit users across assignment pages. */
class RoleUserPaginationIT extends AbstractIntegrationTest {

  private static final long USER_ID_BASE = 9_092_220_000_000_000L;

  private static final long ROLE_ID = USER_ID_BASE + 1_000;

  private static final String USER_PREFIX = "rolepagingtie20260922";

  @Autowired private SysUserMapper userMapper;

  @Autowired private SysRoleMapper roleMapper;

  @Test
  @Transactional
  void tiedCreationTimesHaveUniqueCompleteCandidateAndAssignedPages() {
    jdbcTemplate.update(
        "INSERT INTO sys_role (id, role_name, role_key) VALUES (?, ?, ?)",
        ROLE_ID,
        "Pagination fixture",
        USER_PREFIX);
    jdbcTemplate.update(
        """
        INSERT INTO sys_user (id, username, password, status, create_time)
        SELECT ? + entry, ? || entry::text, '{test-fixture-disabled}', 0,
               TIMESTAMP '2026-09-01 12:00:00'
        FROM generate_series(1, 405) AS entry
        """,
        USER_ID_BASE,
        USER_PREFIX);
    jdbcTemplate.update(
        """
        INSERT INTO sys_user_role (user_id, role_id)
        SELECT id, ? FROM sys_user WHERE username LIKE ?
        """,
        ROLE_ID,
        USER_PREFIX + "%");

    List<Long> candidates = new ArrayList<>();
    List<Long> assigned = new ArrayList<>();
    for (int page = 1; page <= 3; page++) {
      var candidatePage = userMapper.pageByKeyword(page, 200, USER_PREFIX);
      var assignedPage = roleMapper.pageUsers(ROLE_ID, page, 200);
      assertThat(candidatePage.total()).isEqualTo(405);
      assertThat(assignedPage.total()).isEqualTo(405);
      assertThat(candidatePage.page()).isEqualTo(page);
      assertThat(assignedPage.page()).isEqualTo(page);
      assertThat(candidatePage.list()).hasSize(page == 3 ? 5 : 200);
      assertThat(assignedPage.list()).hasSize(page == 3 ? 5 : 200);
      candidates.addAll(candidatePage.list().stream().map(SysUserEntity::getId).toList());
      assigned.addAll(assignedPage.list().stream().map(RoleUserResp::id).toList());
    }

    List<Long> expected =
        LongStream.rangeClosed(1, 405).map(offset -> USER_ID_BASE + 406 - offset).boxed().toList();
    assertThat(candidates).doesNotHaveDuplicates().containsExactlyElementsOf(expected);
    assertThat(assigned).doesNotHaveDuplicates().containsExactlyElementsOf(expected);
  }
}
