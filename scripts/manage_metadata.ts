// scripts/manage_metadata.ts
// 메타데이터 관리를 위한 유틸리티 스크립트

import { getDbPool } from './db_client';
import { Pool, PoolConnection } from 'mysql2/promise';

interface TableMetadata {
  schemaName: string;
  tableName: string;
  businessDomain?: string;
  description?: string;
  businessRules?: string;
  statusReferenceLogic?: string;
  unusedColumns?: string[];
  primaryStatusTable?: boolean;
}

interface ColumnMetadata {
  schemaName: string;
  tableName: string;
  columnName: string;
  businessDescription?: string;
  isDeprecated?: boolean;
  deprecationReason?: string;
  replacementColumn?: string;
  usageNotes?: string;
}

/**
 * 테이블 메타데이터를 업데이트합니다.
 */
export async function updateTableMetadata(metadata: TableMetadata): Promise<void> {
  const pool: Pool = await getDbPool();
  let connection: PoolConnection | undefined;

  try {
    connection = await pool.getConnection();
    
    const unusedColumnsJson = metadata.unusedColumns ? JSON.stringify(metadata.unusedColumns) : null;
    
    await connection.execute(`
      INSERT INTO table_metadata (
        schema_name, table_name, business_domain, description, 
        business_rules, status_reference_logic, unused_columns, primary_status_table
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        business_domain = VALUES(business_domain),
        description = VALUES(description),
        business_rules = VALUES(business_rules),
        status_reference_logic = VALUES(status_reference_logic),
        unused_columns = VALUES(unused_columns),
        primary_status_table = VALUES(primary_status_table),
        updated_at = CURRENT_TIMESTAMP
    `, [
      metadata.schemaName,
      metadata.tableName,
      metadata.businessDomain,
      metadata.description,
      metadata.businessRules,
      metadata.statusReferenceLogic,
      unusedColumnsJson,
      metadata.primaryStatusTable || false
    ]);

    console.log(`테이블 메타데이터 업데이트 완료: ${metadata.schemaName}.${metadata.tableName}`);
    
  } catch (error) {
    console.error('테이블 메타데이터 업데이트 중 오류:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * 컬럼 메타데이터를 업데이트합니다.
 */
export async function updateColumnMetadata(metadata: ColumnMetadata): Promise<void> {
  const pool: Pool = await getDbPool();
  let connection: PoolConnection | undefined;

  try {
    connection = await pool.getConnection();
    
    await connection.execute(`
      INSERT INTO column_metadata (
        schema_name, table_name, column_name, business_description,
        is_deprecated, deprecation_reason, replacement_column, usage_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        business_description = VALUES(business_description),
        is_deprecated = VALUES(is_deprecated),
        deprecation_reason = VALUES(deprecation_reason),
        replacement_column = VALUES(replacement_column),
        usage_notes = VALUES(usage_notes),
        updated_at = CURRENT_TIMESTAMP
    `, [
      metadata.schemaName,
      metadata.tableName,
      metadata.columnName,
      metadata.businessDescription,
      metadata.isDeprecated || false,
      metadata.deprecationReason,
      metadata.replacementColumn,
      metadata.usageNotes
    ]);

    console.log(`컬럼 메타데이터 업데이트 완료: ${metadata.schemaName}.${metadata.tableName}.${metadata.columnName}`);
    
  } catch (error) {
    console.error('컬럼 메타데이터 업데이트 중 오류:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * 모든 테이블 메타데이터를 조회합니다.
 */
export async function getAllTableMetadata(): Promise<any[]> {
  const pool: Pool = await getDbPool();
  let connection: PoolConnection | undefined;

  try {
    connection = await pool.getConnection();
    
    const [rows] = await connection.query(`
      SELECT * FROM v_table_business_info
      ORDER BY schema_name, table_name
    `);

    return rows as any[];
    
  } catch (error) {
    console.error('테이블 메타데이터 조회 중 오류:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * 특정 테이블의 컬럼 메타데이터를 조회합니다.
 */
export async function getColumnMetadata(schemaName: string, tableName: string): Promise<any[]> {
  const pool: Pool = await getDbPool();
  let connection: PoolConnection | undefined;

  try {
    connection = await pool.getConnection();
    
    const [rows] = await connection.query(`
      SELECT * FROM column_metadata
      WHERE schema_name = ? AND table_name = ?
      ORDER BY column_name
    `, [schemaName, tableName]);

    return rows as any[];
    
  } catch (error) {
    console.error('컬럼 메타데이터 조회 중 오류:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * 메타데이터 테이블을 초기화합니다.
 */
export async function initializeMetadataTables(): Promise<void> {
  const pool: Pool = await getDbPool();
  let connection: PoolConnection | undefined;

  try {
    connection = await pool.getConnection();
    
    // 메타데이터 테이블 생성 SQL 실행
    const createTablesSql = `
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
    `;

    const statements = createTablesSql.split(';').filter(stmt => stmt.trim());
    for (const statement of statements) {
      if (statement.trim()) {
        await connection.execute(statement);
      }
    }

    console.log('메타데이터 테이블 초기화 완료');
    
  } catch (error) {
    console.error('메타데이터 테이블 초기화 중 오류:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

// CLI 실행 부분
if (require.main === module) {
  const command = process.argv[2];
  
  switch (command) {
    case 'init':
      initializeMetadataTables()
        .then(() => console.log('메타데이터 테이블 초기화 완료'))
        .catch(console.error);
      break;
      
    case 'list':
      getAllTableMetadata()
        .then(rows => {
          console.log('=== 테이블 메타데이터 목록 ===');
          rows.forEach(row => {
            console.log(`${row.schema_name}.${row.table_name}: ${row.business_domain} (${row.metadata_columns_count}개 컬럼 메타데이터)`);
          });
        })
        .catch(console.error);
      break;
      
    case 'columns':
      const schemaName = process.argv[3];
      const tableName = process.argv[4];
      if (!schemaName || !tableName) {
        console.error('사용법: ts-node manage_metadata.ts columns <schema_name> <table_name>');
        process.exit(1);
      }
      getColumnMetadata(schemaName, tableName)
        .then(rows => {
          console.log(`=== ${schemaName}.${tableName} 컬럼 메타데이터 ===`);
          rows.forEach(row => {
            console.log(`${row.column_name}: ${row.business_description || 'N/A'} ${row.is_deprecated ? '[DEPRECATED]' : ''}`);
          });
        })
        .catch(console.error);
      break;
      
    default:
      console.log(`
사용법:
  ts-node manage_metadata.ts init                           # 메타데이터 테이블 초기화
  ts-node manage_metadata.ts list                           # 모든 테이블 메타데이터 조회
  ts-node manage_metadata.ts columns <schema> <table>       # 특정 테이블의 컬럼 메타데이터 조회
      `);
  }
}
