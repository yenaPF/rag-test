// scripts/schema_extractor.js

const { getDbPool, closeDbPool } = require('./db_client');

/**
 * MySQL 데이터베이스에서 스키마 메타데이터를 추출합니다.
 * @returns {Promise<Object>} 테이블 이름을 키로 하는 스키마 정보 객체
 */
async function extractSchemaMetadata() {
    const pool = await getDbPool();
    const schema = {};
    let connection;

    try {
        connection = await pool.getConnection(); // 풀에서 연결 하나 가져오기
        console.log('스키마 메타데이터 추출 시작...');

        const dbName = process.env.DB_NAME; // .env에서 설정한 DB_NAME 사용

        // 1. 모든 테이블 목록 및 코멘트(설명) 추출
        const [tablesRes] = await connection.query(`
            SELECT
                TABLE_NAME,
                TABLE_COMMENT AS table_description
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
            ORDER BY TABLE_NAME;
        `, [dbName]);

        for (const row of tablesRes) {
            schema[row.TABLE_NAME] = {
                description: row.table_description || `Table containing ${row.TABLE_NAME} related data.`,
                columns: [],
                foreignKeys: [],
                sampleData: [] // 나중에 추가될 예정
            };
        }

        // 2. 모든 컬럼 정보 추출
        const [columnsRes] = await connection.query(`
            SELECT
                TABLE_NAME,
                COLUMN_NAME,
                DATA_TYPE,
                IS_NULLABLE,
                COLUMN_KEY, -- 'PRI' for Primary Key
                COLUMN_COMMENT AS column_description
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = ?
            ORDER BY TABLE_NAME, ORDINAL_POSITION;
        `, [dbName]);

        for (const col of columnsRes) {
            if (schema[col.TABLE_NAME]) {
                schema[col.TABLE_NAME].columns.push({
                    name: col.COLUMN_NAME,
                    type: col.DATA_TYPE,
                    isNullable: col.IS_NULLABLE === 'YES',
                    isPrimaryKey: col.COLUMN_KEY === 'PRI', // 'PRI'는 Primary Key를 의미
                    description: col.column_description || `Column for ${col.COLUMN_NAME}.`
                });
            }
        }

        // 3. 외래 키(FK) 관계 추출
        const [fkRes] = await connection.query(`
            SELECT
                kcu.TABLE_NAME,
                kcu.COLUMN_NAME,
                kcu.REFERENCED_TABLE_NAME AS foreign_table_name,
                kcu.REFERENCED_COLUMN_NAME AS foreign_column_name
            FROM information_schema.KEY_COLUMN_USAGE AS kcu
            WHERE kcu.TABLE_SCHEMA = ?
            AND kcu.REFERENCED_TABLE_NAME IS NOT NULL; -- 참조하는 테이블이 있는 경우 (FK)
        `, [dbName]);

        for (const fk of fkRes) {
            if (schema[fk.TABLE_NAME]) {
                schema[fk.TABLE_NAME].foreignKeys.push({
                    column: fk.COLUMN_NAME,
                    referencesTable: fk.foreign_table_name,
                    referencesColumn: fk.foreign_column_name
                });
            }
        }

        console.log('스키마 메타데이터 추출 완료.');
        return schema;

    } catch (error) {
        console.error('스키마 메타데이터 추출 중 오류 발생:', error.message);
        throw error;
    } finally {
        if (connection) {
            connection.release(); // 풀에 연결 반환
        }
    }
}

module.exports = { extractSchemaMetadata };