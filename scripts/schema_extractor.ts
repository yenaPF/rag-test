// scripts/schema_extractor.ts

import { getDbPool } from './db_client';
import { TableInfo, ColumnInfo, TableRelationship, SchemaMetadata } from '../types';
import { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';

interface TableRow extends RowDataPacket {
  TABLE_NAME: string;
  table_description: string;
  TABLE_COMMENT: string;
  ENGINE: string;
  TABLE_COLLATION: string;
  CREATE_TIME: Date;
  DATA_LENGTH: number;
  INDEX_LENGTH: number;
  TABLE_ROWS: number;
}

interface ColumnRow extends RowDataPacket {
  TABLE_NAME: string;
  COLUMN_NAME: string;
  DATA_TYPE: string;
  IS_NULLABLE: string;
  COLUMN_KEY: string;
  column_description: string;
  COLUMN_COMMENT: string;
  COLUMN_DEFAULT: string;
  CHARACTER_MAXIMUM_LENGTH: number;
  NUMERIC_PRECISION: number;
  NUMERIC_SCALE: number;
}

interface ForeignKeyRow extends RowDataPacket {
  TABLE_NAME: string;
  COLUMN_NAME: string;
  foreign_table_name: string;
  foreign_column_name: string;
  REFERENCED_TABLE_NAME: string;
  REFERENCED_COLUMN_NAME: string;
}

interface IndexRow extends RowDataPacket {
  TABLE_NAME: string;
  COLUMN_NAME: string;
  INDEX_NAME: string;
  NON_UNIQUE: number;
}

/**
 * MySQL 데이터베이스에서 스키마 메타데이터를 추출합니다.
 * 메타데이터 테이블에서 비즈니스 로직 정보도 함께 추출합니다.
 * @returns Promise<SchemaMetadata> 완전한 스키마 메타데이터 객체
 */
export async function extractSchemaMetadata(): Promise<SchemaMetadata> {
  const pool: Pool = await getDbPool();
  const tables: { [tableName: string]: TableInfo } = {};
  let connection: PoolConnection | undefined;

  try {
    connection = await pool.getConnection();
    //console.log('스키마 메타데이터 추출 시작...');

    const dbName = process.env.DB_NAME;
    if (!dbName) {
      throw new Error('DB_NAME environment variable is required');
    }

    // 1. 모든 테이블 목록 및 상세 정보 추출
    const [tablesRes] = await connection.query<TableRow[]>(`
      SELECT
        TABLE_NAME,
        COALESCE(TABLE_COMMENT, '') AS table_description,
        ENGINE,
        TABLE_COLLATION,
        CREATE_TIME,
        DATA_LENGTH,
        INDEX_LENGTH,
        TABLE_ROWS
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME;
    `, [dbName]);

    for (const row of tablesRes) {
      tables[row.TABLE_NAME] = {
        tableName: row.TABLE_NAME,
        schemaName: dbName,
        description: row.table_description || `Table containing ${row.TABLE_NAME} related data.`,
        columns: [],
        relationships: [],
        rowCount: row.TABLE_ROWS || 0,
        lastUpdated: new Date(),
        businessDomain: 'general', // Will be enhanced later
        commonQueries: [],
        indexedColumns: [],
        sampleData: [],
        engine: row.ENGINE,
        collation: row.TABLE_COLLATION,
        createTime: row.CREATE_TIME,
        dataLength: row.DATA_LENGTH,
        indexLength: row.INDEX_LENGTH
      };
    }

    // 2. 모든 컬럼 정보 추출
    const [columnsRes] = await connection.query<ColumnRow[]>(`
      SELECT
        TABLE_NAME,
        COLUMN_NAME,
        DATA_TYPE,
        IS_NULLABLE,
        COLUMN_KEY,
        COALESCE(COLUMN_COMMENT, '') AS column_description,
        COLUMN_DEFAULT,
        CHARACTER_MAXIMUM_LENGTH,
        NUMERIC_PRECISION,
        NUMERIC_SCALE
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME, ORDINAL_POSITION;
    `, [dbName]);

    for (const col of columnsRes) {
      if (tables[col.TABLE_NAME]) {
        const columnInfo: ColumnInfo = {
          name: col.COLUMN_NAME,
          dataType: col.DATA_TYPE,
          description: col.column_description || `Column for ${col.COLUMN_NAME}.`,
          isNullable: col.IS_NULLABLE === 'YES',
          isPrimaryKey: col.COLUMN_KEY === 'PRI',
          isForeignKey: false, // Will be updated in FK processing
          sampleValues: [],
          constraints: [],
          defaultValue: col.COLUMN_DEFAULT,
          characterMaximumLength: col.CHARACTER_MAXIMUM_LENGTH,
          numericPrecision: col.NUMERIC_PRECISION,
          numericScale: col.NUMERIC_SCALE
        };

        // Add constraints
        if (col.COLUMN_KEY === 'PRI') {
          columnInfo.constraints.push('PRIMARY KEY');
        }
        if (col.COLUMN_KEY === 'UNI') {
          columnInfo.constraints.push('UNIQUE');
        }
        if (col.COLUMN_DEFAULT === 'CURRENT_TIMESTAMP') {
          columnInfo.constraints.push('DEFAULT CURRENT_TIMESTAMP');
        }

        tables[col.TABLE_NAME].columns.push(columnInfo);
      }
    }

    // 3. 외래 키(FK) 관계 추출
    const [fkRes] = await connection.query<ForeignKeyRow[]>(`
      SELECT
        kcu.TABLE_NAME,
        kcu.COLUMN_NAME,
        kcu.REFERENCED_TABLE_NAME AS foreign_table_name,
        kcu.REFERENCED_COLUMN_NAME AS foreign_column_name
      FROM information_schema.KEY_COLUMN_USAGE AS kcu
      WHERE kcu.TABLE_SCHEMA = ?
      AND kcu.REFERENCED_TABLE_NAME IS NOT NULL;
    `, [dbName]);

    for (const fk of fkRes) {
      if (tables[fk.TABLE_NAME]) {
        // Update column to mark it as foreign key
        const column = tables[fk.TABLE_NAME].columns.find(col => col.name === fk.COLUMN_NAME);
        if (column) {
          column.isForeignKey = true;
          column.foreignKeyReference = `${fk.foreign_table_name}.${fk.foreign_column_name}`;
          column.constraints.push('FOREIGN KEY');
        }

        // Create relationship
        const relationship: TableRelationship = {
          relationshipType: 'many-to-one', // Default, can be refined later
          relatedTable: fk.foreign_table_name,
          localColumn: fk.COLUMN_NAME,
          foreignColumn: fk.foreign_column_name,
          relationshipName: `${fk.TABLE_NAME}_${fk.COLUMN_NAME}_fk`,
          isOwner: true
        };

        tables[fk.TABLE_NAME].relationships.push(relationship);

        // Add reverse relationship to referenced table
        if (tables[fk.foreign_table_name]) {
          const reverseRelationship: TableRelationship = {
            relationshipType: 'one-to-many',
            relatedTable: fk.TABLE_NAME,
            localColumn: fk.foreign_column_name,
            foreignColumn: fk.COLUMN_NAME,
            relationshipName: `${fk.foreign_table_name}_${fk.TABLE_NAME}_reverse`,
            isOwner: false
          };
          tables[fk.foreign_table_name].relationships.push(reverseRelationship);
        }
      }
    }

    // 4. 인덱스 정보 추출
    const [indexRes] = await connection.query<IndexRow[]>(`
      SELECT
        TABLE_NAME,
        COLUMN_NAME,
        INDEX_NAME,
        NON_UNIQUE
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ?
      AND INDEX_NAME != 'PRIMARY'
      ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;
    `, [dbName]);

    for (const idx of indexRes) {
      if (tables[idx.TABLE_NAME]) {
        if (!tables[idx.TABLE_NAME].indexedColumns.includes(idx.COLUMN_NAME)) {
          tables[idx.TABLE_NAME].indexedColumns.push(idx.COLUMN_NAME);
        }
      }
    }

    // 5. 메타데이터 테이블에서 비즈니스 정보 조회 및 병합
    await enrichWithBusinessMetadata(connection, dbName, tables);

    // 6. 기본 비즈니스 도메인 분류 (메타데이터가 없는 경우 폴백)
    for (const tableName in tables) {
      const table = tables[tableName];
      if (!table.businessDomain || table.businessDomain === 'general') {
        if (tableName.includes('user') || tableName.includes('account')) {
          table.businessDomain = 'user_management';
        } else if (tableName.includes('order') || tableName.includes('purchase') || tableName.includes('payment')) {
          table.businessDomain = 'commerce';
        } else if (tableName.includes('product') || tableName.includes('item') || tableName.includes('inventory')) {
          table.businessDomain = 'catalog';
        } else if (tableName.includes('log') || tableName.includes('audit') || tableName.includes('event')) {
          table.businessDomain = 'logging';
        } else {
          table.businessDomain = 'general';
        }
      }
    }

    const schemaMetadata: SchemaMetadata = {
      tables,
      databaseName: dbName,
      extractedAt: new Date(),
      totalTables: Object.keys(tables).length,
      totalRelationships: Object.values(tables).reduce((sum, table) => sum + table.relationships.length, 0)
    };

    //console.log(`스키마 메타데이터 추출 완료. 테이블 ${schemaMetadata.totalTables}개, 관계 ${schemaMetadata.totalRelationships}개`);
    return schemaMetadata;

  } catch (error) {
    //console.error('스키마 메타데이터 추출 중 오류 발생:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * 메타데이터 테이블에서 비즈니스 정보를 조회하여 테이블 정보를 보강합니다.
 */
async function enrichWithBusinessMetadata(
  connection: PoolConnection, 
  dbName: string, 
  tables: { [tableName: string]: TableInfo }
): Promise<void> {
  try {
    // 1. 테이블 메타데이터 조회
    const [metadataRows] = await connection.query<any[]>(`
      SELECT 
        tm.schema_name,
        tm.table_name,
        tm.business_domain,
        tm.description as business_description,
        tm.business_rules,
        tm.status_reference_logic,
        tm.unused_columns,
        tm.primary_status_table
      FROM table_metadata tm
      WHERE tm.schema_name = ?
    `, [dbName]);

    const metadataMap = new Map();
    for (const row of metadataRows) {
      const key = `${row.schema_name}.${row.table_name}`;
      metadataMap.set(key, row);
    }

    // 2. 컬럼 메타데이터 조회
    const [columnMetadataRows] = await connection.query<any[]>(`
      SELECT 
        cm.schema_name,
        cm.table_name,
        cm.column_name,
        cm.business_description,
        cm.is_deprecated,
        cm.deprecation_reason,
        cm.replacement_column,
        cm.usage_notes
      FROM column_metadata cm
      WHERE cm.schema_name = ?
    `, [dbName]);

    const columnMetadataMap = new Map();
    for (const row of columnMetadataRows) {
      const key = `${row.schema_name}.${row.table_name}.${row.column_name}`;
      columnMetadataMap.set(key, row);
    }

    // 3. 테이블 정보에 메타데이터 병합
    for (const [tableName, tableInfo] of Object.entries(tables)) {
      const metadataKey = `${tableInfo.schemaName}.${tableInfo.tableName}`;
      const metadata = metadataMap.get(metadataKey);
      
      if (metadata) {
        // 비즈니스 도메인 정보 추가
        if (metadata.business_domain) {
          tableInfo.businessDomain = metadata.business_domain;
        }
        
        // 기존 설명에 비즈니스 설명 추가
        const descriptionParts = [tableInfo.description];
        
        if (metadata.business_description) {
          descriptionParts.push(`비즈니스: ${metadata.business_description}`);
        }
        
        if (metadata.business_rules) {
          descriptionParts.push(`규칙: ${metadata.business_rules}`);
        }
        
        if (metadata.status_reference_logic) {
          descriptionParts.push(`상태참조: ${metadata.status_reference_logic}`);
        }
        
        // 사용하지 않는 컬럼 정보 추가
        if (metadata.unused_columns) {
          try {
            const unusedCols = JSON.parse(metadata.unused_columns);
            if (Array.isArray(unusedCols) && unusedCols.length > 0) {
              descriptionParts.push(`미사용컬럼: ${unusedCols.join(', ')}`);
            }
          } catch (e) {
            // JSON 파싱 실패 시 무시
          }
        }
        
        if (metadata.primary_status_table) {
          descriptionParts.push(`주요상태테이블: 이 테이블이 실제 상태 정보를 관리함`);
        }
        
        tableInfo.description = descriptionParts.join(' | ');
      }
      
      // 4. 컬럼별 메타데이터 추가
      for (const column of tableInfo.columns) {
        const columnKey = `${tableInfo.schemaName}.${tableInfo.tableName}.${column.name}`;
        const columnMeta = columnMetadataMap.get(columnKey);
        
        if (columnMeta) {
          const columnDescParts = [column.description || ''];
          
          if (columnMeta.business_description) {
            columnDescParts.push(columnMeta.business_description);
          }
          
          if (columnMeta.is_deprecated) {
            columnDescParts.push(`[DEPRECATED: ${columnMeta.deprecation_reason || '사용 중단됨'}]`);
            if (columnMeta.replacement_column) {
              columnDescParts.push(`대신 ${columnMeta.replacement_column} 사용`);
            }
          }
          
          if (columnMeta.usage_notes) {
            columnDescParts.push(`참고: ${columnMeta.usage_notes}`);
          }
          
          column.description = columnDescParts.filter(part => part.trim()).join(' ');
        }
      }
    }

    console.log(`비즈니스 메타데이터 병합 완료: 테이블 ${metadataRows.length}개, 컬럼 ${columnMetadataRows.length}개`);
    
  } catch (error) {
    // 메타데이터 테이블이 없거나 오류가 발생해도 기본 스키마 추출은 계속 진행
    console.warn('비즈니스 메타데이터 조회 중 오류 (무시하고 계속 진행):', error);
  }
}