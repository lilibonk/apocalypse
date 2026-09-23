package io.apocalypse;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.system.dept.dto.request.DeptSaveReq;
import io.apocalypse.system.dept.entity.SysDeptEntity;
import io.apocalypse.system.dept.mapper.SysDeptMapper;
import io.apocalypse.system.dept.service.DeptService;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;

/** 部门层级不变量：真实独立事务不能互相改挂成环，历史循环数据查询必须终止。 */
class DeptHierarchyIT extends AbstractIntegrationTest {

  @Autowired private DeptService deptService;

  @Autowired private SysDeptMapper sysDeptMapper;

  @Autowired private PlatformTransactionManager transactionManager;

  @AfterEach
  void cleanup() {
    jdbcTemplate.update("DELETE FROM sys_dept WHERE dept_name LIKE 'it-dept-hierarchy-%'");
  }

  @Test
  void concurrentMutualReparentingWaitsForCommitAndRejectsTheCycle() throws Exception {
    Long firstId = create(0L, "concurrent-first");
    Long secondId = create(0L, "concurrent-second");
    CountDownLatch firstUpdated = new CountDownLatch(1);
    CountDownLatch releaseFirst = new CountDownLatch(1);
    TransactionTemplate transaction = new TransactionTemplate(transactionManager);

    try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
      var first =
          executor.submit(
              () ->
                  transaction.execute(
                      status -> {
                        deptService.update(firstId, request(secondId, "concurrent-first"));
                        firstUpdated.countDown();
                        awaitLatch(releaseFirst);
                        return null;
                      }));
      try {
        assertThat(firstUpdated.await(10, TimeUnit.SECONDS)).isTrue();
        var second =
            executor.submit(
                () -> {
                  try {
                    deptService.update(secondId, request(firstId, "concurrent-second"));
                    return 0;
                  } catch (BizException exception) {
                    return exception.getCode();
                  }
                });

        // Observe the actual database wait, rather than relying on thread timing or a sleep.
        await()
            .atMost(Duration.ofSeconds(5))
            .untilAsserted(
                () -> {
                  assertThat(
                          jdbcTemplate.queryForObject(
                              """
                              SELECT EXISTS (
                                SELECT 1 FROM pg_locks
                                WHERE locktype = 'advisory' AND NOT granted
                                  AND objid = (hashtext('system-dept-hierarchy')::bigint
                                    & 4294967295)::oid
                              )
                              """,
                              Boolean.class))
                      .isTrue();
                  assertThat(second.isDone()).isFalse();
                });
        releaseFirst.countDown();
        first.get(10, TimeUnit.SECONDS);
        assertThat(second.get(10, TimeUnit.SECONDS)).isEqualTo(ErrorCode.BIZ_ERROR.getCode());
      } finally {
        releaseFirst.countDown();
      }
    }

    assertThat(sysDeptMapper.selectById(firstId).getParentId()).isEqualTo(secondId);
    assertThat(sysDeptMapper.selectById(secondId).getParentId()).isZero();
    assertThat(sysDeptMapper.selectSubTree(secondId))
        .extracting(SysDeptEntity::getId)
        .containsExactlyInAnyOrder(firstId, secondId);
  }

  @Test
  void corruptCycleQueryTerminatesRejectsCyclicMoveAndAllowsExplicitRootRepair() {
    Long firstId = create(0L, "corrupt-first");
    Long secondId = create(firstId, "corrupt-second");
    jdbcTemplate.update("UPDATE sys_dept SET parent_id = ? WHERE id = ?", secondId, firstId);

    List<SysDeptEntity> subtree =
        new TransactionTemplate(transactionManager)
            .execute(
                status -> {
                  // Before the fix PostgreSQL cancels this unbounded recursive CTE.
                  jdbcTemplate.execute("SET LOCAL statement_timeout = '2s'");
                  return sysDeptMapper.selectSubTree(firstId);
                });
    assertThat(subtree)
        .extracting(SysDeptEntity::getId)
        .containsExactlyInAnyOrder(firstId, secondId);
    assertThatThrownBy(() -> deptService.update(firstId, request(secondId, "corrupt-first")))
        .isInstanceOf(BizException.class)
        .hasMessage("父部门不能是自身或其下级部门");

    deptService.update(firstId, request(0L, "corrupt-first"));
    assertThat(sysDeptMapper.selectSubTree(firstId))
        .extracting(SysDeptEntity::getId)
        .containsExactlyInAnyOrder(firstId, secondId);
    assertThat(deptService.tree())
        .filteredOn(node -> node.id().equals(firstId))
        .singleElement()
        .satisfies(
            node ->
                assertThat(node.children())
                    .singleElement()
                    .satisfies(child -> assertThat(child.id()).isEqualTo(secondId)));
  }

  @Test
  void ordinarySubtreeMovePreservesDescendantsAndDeletionChecks() {
    Long firstRoot = create(0L, "valid-first-root");
    Long secondRoot = create(0L, "valid-second-root");
    Long child = create(firstRoot, "valid-child");
    Long grandchild = create(child, "valid-grandchild");

    deptService.update(child, request(secondRoot, "valid-child"));

    assertThat(sysDeptMapper.selectSubTree(firstRoot))
        .extracting(SysDeptEntity::getId)
        .containsExactly(firstRoot);
    assertThat(sysDeptMapper.selectSubTree(secondRoot))
        .extracting(SysDeptEntity::getId)
        .containsExactlyInAnyOrder(secondRoot, child, grandchild);
    assertThatThrownBy(() -> deptService.delete(secondRoot))
        .isInstanceOf(BizException.class)
        .hasMessage("存在子部门，不允许删除");
    assertThatThrownBy(() -> deptService.update(child, request(child, "valid-child")))
        .isInstanceOf(BizException.class)
        .hasMessage("父部门不能是自身或其下级部门");
    assertThatThrownBy(() -> deptService.create(request(Long.MAX_VALUE, "missing-parent")))
        .isInstanceOf(BizException.class)
        .hasMessage("父部门不存在");

    deptService.delete(grandchild);
    deptService.delete(child);
    deptService.delete(secondRoot);
    deptService.delete(firstRoot);
    assertThat(sysDeptMapper.selectSubTree(secondRoot)).isEmpty();
  }

  private Long create(Long parentId, String name) {
    return deptService.create(request(parentId, name));
  }

  private static DeptSaveReq request(Long parentId, String name) {
    return new DeptSaveReq(parentId, "it-dept-hierarchy-" + name, null, null, 99, 1, null);
  }

  private static void awaitLatch(CountDownLatch latch) {
    try {
      if (!latch.await(15, TimeUnit.SECONDS)) {
        throw new IllegalStateException("Timed out waiting for transaction release");
      }
    } catch (InterruptedException exception) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException(exception);
    }
  }
}
