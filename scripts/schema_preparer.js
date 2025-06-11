// scripts/schema_preparer.js

const { getDbPool, closeDbPool } = require('./db_client');
const { extractSchemaMetadata } = require('./schema_extractor');

/**
 * 추출된 스키마 메타데이터에 상세 설명과 샘플 데이터를 추가합니다.
 * @returns {Promise<Object>} 상세 설명과 샘플 데이터가 추가된 스키마 객체
 */
async function prepareSchemaForRAG() {
    const pool = await getDbPool(); // 풀에서 연결 가져오기
    let connection;

    try {
        const schema = await extractSchemaMetadata(); // 기본 메타데이터 추출

        console.log('스키마에 상세 설명 및 샘플 데이터 추가 시작...');
        connection = await pool.getConnection(); // 샘플 데이터 추출을 위해 연결 사용

        for (const tableName in schema) {
            const tableInfo = schema[tableName];

            // 1. 실제 데이터 샘플 추출 (각 테이블의 상위 2행)
            try {
                const [sampleRows] = await connection.query(`SELECT * FROM \`${tableName}\` LIMIT 2;`);
                if (sampleRows.length > 0) {
                    // 컬럼 헤더 추가
                    const headers = Object.keys(sampleRows[0]);
                    tableInfo.sampleData.push(headers);
                    // 데이터 행 추가
                    sampleRows.forEach(row => {
                        tableInfo.sampleData.push(Object.values(row));
                    });
                }
                console.log(`- \`${tableName}\` 테이블 샘플 데이터 추출 완료.`);
            } catch (err) {
                console.warn(`- 경고: \`${tableName}\` 테이블 샘플 데이터 추출 실패 (${err.message}). 샘플 데이터를 생략합니다.`);
                tableInfo.sampleData = []; // 오류 발생 시 빈 배열로 설정
            }

            // 2. 추가적인 자연어 설명 및 코드성 데이터 의미 부여 (가장 중요한 부분)
            // 이 부분은 개발자가 직접 코드에 정의하거나, 외부 JSON/YAML 파일에서 로드하여 병합해야 합니다.
            // MySQL의 TABLE_COMMENT 및 COLUMN_COMMENT를 활용하면 이 부분을 줄일 수 있습니다.
            // 아래는 예시를 위한 하드코딩된 설명입니다. 실제 프로젝트에서는 별도 관리 권장.

            if (tableName === 'orders') {
                // 기존 추출된 description이 있다면 그대로 사용하고, 없다면 기본값 제공
                tableInfo.description = tableInfo.description || "고객이 웹사이트에서 구매한 상품에 대한 주문 내역을 기록하는 마스터 테이블입니다. 'users' 테이블의 user_id와 연결됩니다.";
                tableInfo.columns.forEach(col => {
                    // 기존 추출된 description이 있다면 그대로 사용하고, 없다면 기본값 제공
                    if (col.name === 'id') col.description = col.description || "주문의 고유 식별자 (Primary Key)입니다.";
                    if (col.name === 'user_id') col.description = col.description || "주문한 사용자의 ID. 'users' 테이블의 'id' 컬럼을 참조하는 외래 키(FK)입니다.";
                    if (col.name === 'order_date') col.description = col.description || "주문이 이루어진 날짜와 시간입니다.";
                    if (col.name === 'total_amount') col.description = col.description || "주문 총액. 통화 단위는 KRW입니다.";
                    if (col.name === 'status') col.description = col.description || "주문의 현재 처리 상태를 나타냅니다. 가능한 값: 0(대기), 1(처리 중), 2(완료), 3(취소).";
                });
            } else if (tableName === 'users') {
                tableInfo.description = tableInfo.description || "웹사이트에 가입한 사용자들의 기본 정보입니다. 이름, 이메일 주소, 가입일 등 개인 식별 정보를 포함합니다.";
                tableInfo.columns.forEach(col => {
                    if (col.name === 'id') col.description = col.description || "사용자의 고유 식별자 (Primary Key)입니다.";
                    if (col.name === 'email') col.description = col.description || "사용자의 이메일 주소. 로그인 시 ID로 사용되며 중복될 수 없습니다.";
                    if (col.name === 'created_at') col.description = col.description || "사용자 계정이 생성된 일시입니다.";
                });
            }
            // ... 다른 테이블들도 유사하게 추가 설명 ...
        }

        console.log('스키마에 상세 설명 및 샘플 데이터 추가 완료.');
        return schema;

    } catch (error) {
        console.error('스키마 준비 중 오류 발생:', error.message);
        throw error;
    } finally {
        if (connection) {
            connection.release(); // 풀에 연결 반환
        }
        // 이 스크립트 실행 후에는 풀을 종료하지 않습니다.
        // 왜냐하면 다음 단계에서 풀을 다시 사용할 수도 있기 때문입니다.
        // 메인 스크립트에서 마지막에 closeDbPool()을 호출하는 것이 좋습니다.
    }
}

module.exports = { prepareSchemaForRAG };