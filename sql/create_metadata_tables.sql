-- 테이블 메타데이터 관리 테이블
CREATE TABLE IF NOT EXISTS table_metadata (
    id INT AUTO_INCREMENT PRIMARY KEY,
    schema_name VARCHAR(64) NOT NULL,
    table_name VARCHAR(64) NOT NULL,
    business_domain VARCHAR(100),
    description TEXT,
    business_rules TEXT,
    status_reference_logic TEXT,
    unused_columns JSON,
    primary_status_table BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_table (schema_name, table_name)
);

-- 컬럼별 메타데이터 테이블
CREATE TABLE IF NOT EXISTS column_metadata (
    id INT AUTO_INCREMENT PRIMARY KEY,
    schema_name VARCHAR(64) NOT NULL,
    table_name VARCHAR(64) NOT NULL,
    column_name VARCHAR(64) NOT NULL,
    business_description TEXT,
    is_deprecated BOOLEAN DEFAULT FALSE,
    deprecation_reason TEXT,
    replacement_column VARCHAR(64),
    usage_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_column (schema_name, table_name, column_name)
);

-- 테이블 간 비즈니스 관계 정의
CREATE TABLE IF NOT EXISTS table_business_relationships (
    id INT AUTO_INCREMENT PRIMARY KEY,
    source_schema VARCHAR(64) NOT NULL,
    source_table VARCHAR(64) NOT NULL,
    target_schema VARCHAR(64) NOT NULL,
    target_table VARCHAR(64) NOT NULL,
    relationship_type ENUM('status_reference', 'data_source', 'deprecated_by', 'extends') NOT NULL,
    business_rule TEXT,
    priority INT DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 메타데이터 관리용 뷰
CREATE OR REPLACE VIEW v_table_business_info AS
SELECT 
  tm.schema_name,
  tm.table_name,
  tm.business_domain,
  tm.description,
  tm.business_rules,
  tm.status_reference_logic,
  tm.unused_columns,
  tm.primary_status_table,
  COUNT(cm.id) as metadata_columns_count,
  tm.updated_at
FROM table_metadata tm
LEFT JOIN column_metadata cm ON tm.schema_name = cm.schema_name 
  AND tm.table_name = cm.table_name
GROUP BY tm.id, tm.schema_name, tm.table_name, tm.business_domain, tm.description, 
         tm.business_rules, tm.status_reference_logic, tm.unused_columns, 
         tm.primary_status_table, tm.updated_at
ORDER BY tm.schema_name, tm.table_name;

-- 간편한 메타데이터 업데이트 프로시저
DELIMITER //
CREATE PROCEDURE UpdateTableMetadata(
  IN p_schema_name VARCHAR(64),
  IN p_table_name VARCHAR(64),
  IN p_business_domain VARCHAR(100),
  IN p_description TEXT,
  IN p_business_rules TEXT,
  IN p_status_reference_logic TEXT,
  IN p_unused_columns JSON
)
BEGIN
  INSERT INTO table_metadata (
    schema_name, table_name, business_domain, description, 
    business_rules, status_reference_logic, unused_columns
  ) VALUES (
    p_schema_name, p_table_name, p_business_domain, p_description,
    p_business_rules, p_status_reference_logic, p_unused_columns
  )
  ON DUPLICATE KEY UPDATE
    business_domain = p_business_domain,
    description = p_description,
    business_rules = p_business_rules,
    status_reference_logic = p_status_reference_logic,
    unused_columns = p_unused_columns,
    updated_at = CURRENT_TIMESTAMP;
END //
DELIMITER ;
