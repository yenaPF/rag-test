-- 샘플 테이블 메타데이터 삽입
INSERT INTO table_metadata (schema_name, table_name, business_domain, description, business_rules, status_reference_logic, unused_columns, primary_status_table) VALUES
('local_rag_test', 'contracts', '계약관리', '계약 기본 정보 테이블', '실제 계약 상태는 contract_details 테이블을 참조해야 함. contracts.status는 레거시 필드로 사용하지 않음', 'contract_details.status를 우선 참조, 활성 계약 확인은 contract_details.status = "ACTIVE" AND contract_details.end_date > NOW()로 판단', '["old_status", "legacy_contract_type"]', FALSE),

('local_rag_test', 'contract_details', '계약관리', '계약 상세 및 실제 상태 관리 테이블', '계약 상태의 실제 소스 테이블. 모든 계약 상태 조회는 이 테이블을 기준으로 해야 함', '이 테이블의 status가 실제 계약 상태를 나타냄. ACTIVE, INACTIVE, PENDING, CANCELLED 값 사용', '[]', TRUE),

('local_rag_test', 'users', '사용자관리', '사용자 기본 정보 테이블', '사용자 활성 상태는 user_profiles 테이블을 참조해야 함. 일부 레거시 컬럼은 사용하지 않음', 'user_profiles.status를 실제 활성 상태로 사용. users.status는 참고용', '["deprecated_field", "old_email_backup"]', FALSE),

('local_rag_test', 'user_profiles', '사용자관리', '사용자 프로필 및 실제 상태 관리', '사용자의 실제 활성 상태를 관리하는 테이블', '이 테이블의 status가 실제 사용자 활성 상태를 나타냄', '[]', TRUE),

('local_rag_test', 'orders', '주문관리', '주문 기본 정보 테이블', '주문 상태는 order_status_history의 최신 레코드를 참조해야 함', 'SELECT status FROM order_status_history WHERE order_id = orders.id ORDER BY created_at DESC LIMIT 1', '["old_payment_status", "legacy_shipping_status"]', FALSE),

('local_rag_test', 'products', '상품관리', '상품 정보 테이블', '상품 재고는 product_inventory 테이블을 참조. 가격 정보는 product_prices 테이블 참조', 'products.stock_quantity는 캐시용, 실제 재고는 product_inventory.quantity 사용', '["old_price", "deprecated_category_id"]', FALSE)

ON DUPLICATE KEY UPDATE
  business_domain = VALUES(business_domain),
  description = VALUES(description),
  business_rules = VALUES(business_rules),
  status_reference_logic = VALUES(status_reference_logic),
  unused_columns = VALUES(unused_columns),
  primary_status_table = VALUES(primary_status_table),
  updated_at = CURRENT_TIMESTAMP;

-- 샘플 컬럼 메타데이터 삽입
INSERT INTO column_metadata (schema_name, table_name, column_name, business_description, is_deprecated, deprecation_reason, replacement_column, usage_notes) VALUES
('local_rag_test', 'contracts', 'old_status', '레거시 상태 필드', TRUE, '새로운 상태 관리 로직으로 변경됨', 'contract_details.status', '절대 사용하지 말고 contract_details.status 참조할 것'),

('local_rag_test', 'contracts', 'legacy_contract_type', '구 계약 타입 분류', TRUE, '비즈니스 요구사항 변경으로 분류 체계 개편', 'contract_details.contract_category', '새로운 분류는 contract_details.contract_category 사용'),

('local_rag_test', 'users', 'deprecated_field', '더 이상 사용하지 않는 필드', TRUE, '개인정보보호 정책 변경', NULL, '완전히 사용 중단됨. 데이터 무시할 것'),

('local_rag_test', 'users', 'old_email_backup', '이메일 백업 필드', TRUE, '중복 저장 방식 개선', 'users.email', '현재는 users.email만 사용'),

('local_rag_test', 'contract_details', 'status', '실제 계약 상태 필드', FALSE, NULL, NULL, 'ACTIVE(활성), INACTIVE(비활성), PENDING(대기), CANCELLED(취소) 값만 사용. 계약 상태 확인 시 반드시 이 컬럼 참조'),

('local_rag_test', 'user_profiles', 'status', '실제 사용자 활성 상태', FALSE, NULL, NULL, 'ACTIVE(활성), INACTIVE(비활성), SUSPENDED(정지) 값 사용. 사용자 상태 확인 시 이 컬럼이 우선'),

('local_rag_test', 'orders', 'old_payment_status', '구 결제 상태 필드', TRUE, '결제 시스템 개편', 'order_payments.status', 'order_payments 테이블의 최신 상태 참조'),

('local_rag_test', 'products', 'old_price', '구 가격 필드', TRUE, '동적 가격 정책 도입', 'product_prices.current_price', 'product_prices 테이블에서 현재 가격 조회'),

('local_rag_test', 'products', 'stock_quantity', '재고 수량 캐시', FALSE, NULL, 'product_inventory.quantity', '캐시용 데이터. 실제 재고는 product_inventory.quantity 참조')

ON DUPLICATE KEY UPDATE
  business_description = VALUES(business_description),
  is_deprecated = VALUES(is_deprecated),
  deprecation_reason = VALUES(deprecation_reason),
  replacement_column = VALUES(replacement_column),
  usage_notes = VALUES(usage_notes),
  updated_at = CURRENT_TIMESTAMP;

-- 샘플 비즈니스 관계 삽입
INSERT INTO table_business_relationships (source_schema, source_table, target_schema, target_table, relationship_type, business_rule, priority) VALUES
('local_rag_test', 'contracts', 'shopping_mall', 'contract_details', 'status_reference', '계약 상태 확인 시 contract_details.status를 우선 참조해야 함', 1),

('local_rag_test', 'users', 'shopping_mall', 'user_profiles', 'status_reference', '사용자 활성 상태는 user_profiles.status를 참조해야 함', 1),

('local_rag_test', 'orders', 'shopping_mall', 'order_status_history', 'status_reference', '주문 상태는 order_status_history의 최신 레코드를 참조', 1),

('local_rag_test', 'products', 'shopping_mall', 'product_inventory', 'data_source', '실제 재고 정보는 product_inventory 테이블에서 조회', 1),

('local_rag_test', 'products', 'shopping_mall', 'product_prices', 'data_source', '현재 가격 정보는 product_prices 테이블에서 조회', 1)

ON DUPLICATE KEY UPDATE
  business_rule = VALUES(business_rule),
  priority = VALUES(priority),
  is_active = VALUES(is_active),
  updated_at = CURRENT_TIMESTAMP;
