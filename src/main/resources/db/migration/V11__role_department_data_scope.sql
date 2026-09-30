-- Existing roles retain the pre-release ALL behavior; administrators must explicitly narrow them.
ALTER TABLE sys_role ADD COLUMN data_scope VARCHAR(24) NOT NULL DEFAULT 'ALL';
ALTER TABLE sys_role ADD CONSTRAINT ck_sys_role_data_scope
    CHECK (data_scope IN ('ALL', 'DEPT', 'DEPT_AND_CHILDREN'));
ALTER TABLE sys_role ALTER COLUMN data_scope SET DEFAULT 'DEPT';
COMMENT ON COLUMN sys_role.data_scope IS 'Operation-specific role scope: ALL / DEPT / DEPT_AND_CHILDREN';
