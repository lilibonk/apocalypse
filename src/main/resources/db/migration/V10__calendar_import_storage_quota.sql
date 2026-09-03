-- Calendar 导入累计配额需要稳定上传者标识，不能依赖可变的用户名。
ALTER TABLE cal_data_import
    ADD COLUMN uploader_user_id BIGINT;

UPDATE cal_data_import i
SET uploader_user_id = u.id
FROM sys_user u
WHERE i.uploader_user_id IS NULL
  AND i.create_by = u.username;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cal_data_import WHERE uploader_user_id IS NULL) THEN
        RAISE EXCEPTION 'Cannot resolve uploader_user_id for existing cal_data_import rows';
    END IF;
END
$$;

ALTER TABLE cal_data_import
    ALTER COLUMN uploader_user_id SET NOT NULL,
    ADD CONSTRAINT fk_cal_data_import_uploader
        FOREIGN KEY (uploader_user_id) REFERENCES sys_user (id) ON DELETE RESTRICT;

CREATE INDEX idx_cal_data_import_uploader_created
    ON cal_data_import (uploader_user_id, create_time DESC);
