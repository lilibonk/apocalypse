package io.apocalypse.framework.mybatis;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.baomidou.mybatisplus.annotation.DbType;
import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.BlockAttackInnerInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.OptimisticLockerInnerInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.PaginationInnerInterceptor;

/** MyBatis-Plus 装配：分页、防全表删改、乐观锁三个内置插件；统一扫描各模块 mapper 包与 DDD 模块的 infrastructure.persistence 包。 */
@Configuration
@MapperScan({"io.apocalypse.**.mapper", "io.apocalypse.**.persistence"})
public class MybatisPlusConfig {

  @Bean
  public MybatisPlusInterceptor mybatisPlusInterceptor() {
    MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();
    // 分页（PostgreSQL 方言）
    PaginationInnerInterceptor pagination = new PaginationInnerInterceptor(DbType.POSTGRE_SQL);
    pagination.setMaxLimit(200L);
    interceptor.addInnerInterceptor(pagination);
    // 禁止全表 update/delete
    interceptor.addInnerInterceptor(new BlockAttackInnerInterceptor());
    // 乐观锁（配合 BaseEntity @Version）
    interceptor.addInnerInterceptor(new OptimisticLockerInnerInterceptor());
    return interceptor;
  }
}
