-- V2：订单表（order 模块示例）
CREATE TABLE order_info (
    id          BIGINT PRIMARY KEY,
    order_no    VARCHAR(32)   NOT NULL,
    user_id     BIGINT        NOT NULL,
    amount      NUMERIC(12,2) NOT NULL,
    status      VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
    remark      VARCHAR(255),
    create_time TIMESTAMP     NOT NULL DEFAULT now(),
    update_time TIMESTAMP     NOT NULL DEFAULT now(),
    create_by   VARCHAR(64),
    update_by   VARCHAR(64),
    version     INT           NOT NULL DEFAULT 0,
    deleted     INT           NOT NULL DEFAULT 0
);
COMMENT ON TABLE  order_info IS '订单';
COMMENT ON COLUMN order_info.id IS '主键（应用层雪花 ID）';
COMMENT ON COLUMN order_info.order_no IS '订单号';
COMMENT ON COLUMN order_info.user_id IS '买家用户 ID';
COMMENT ON COLUMN order_info.amount IS '订单金额';
COMMENT ON COLUMN order_info.status IS '状态：PENDING=待处理 CANCELLED=已取消';
COMMENT ON COLUMN order_info.remark IS '备注';
COMMENT ON COLUMN order_info.create_time IS '创建时间';
COMMENT ON COLUMN order_info.update_time IS '更新时间';
COMMENT ON COLUMN order_info.create_by IS '创建人';
COMMENT ON COLUMN order_info.update_by IS '更新人';
COMMENT ON COLUMN order_info.version IS '乐观锁版本';
COMMENT ON COLUMN order_info.deleted IS '逻辑删除：0=正常 1=已删除';
CREATE UNIQUE INDEX uk_order_info_order_no ON order_info (order_no);
CREATE INDEX idx_order_info_user_id ON order_info (user_id);
