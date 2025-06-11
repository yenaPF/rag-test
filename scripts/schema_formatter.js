// scripts/schema_formatter.js

const { prepareSchemaForRAG } = require('./schema_preparer');
const { Document } = require('@langchain/core/documents'); // LangChain Document 임포트

/**
 * 준비된 스키마 정보를 LLM이 이해하기 쉬운 구조화된 텍스트(Markdown)로 포맷팅합니다.
 * 각 테이블별로 하나의 Document 객체를 생성합니다.
 * @returns {Promise<Document[]>} 포맷팅된 스키마 정보가 담긴 LangChain Document 객체 배열
 */
async function formatSchemaAsDocuments() {
    console.log('스키마 정보를 Document 형태로 포맷팅 시작...');
    const schema = await prepareSchemaForRAG(); // 2단계에서 준비된 상세 스키마 정보 가져오기
    const documents = [];

    for (const tableName in schema) {
        const tableInfo = schema[tableName];
        let content = `
### 테이블명: ${tableName}

**테이블 설명**: ${tableInfo.description || '설명 없음.'}
`;

        // 컬럼 정보 추가
        content += `
**컬럼 정보**:
`;
        tableInfo.columns.forEach(col => {
            const pk = col.isPrimaryKey ? ' (PK)' : '';
            const nullable = col.isNullable ? ' (NULL 허용)' : ' (NULL 불허)';
            content += `- **${col.name}** (${col.type}${pk}${nullable}): ${col.description || '설명 없음.'}\n`;
        });

        // 테이블 관계(FK) 정보 추가
        if (tableInfo.foreignKeys && tableInfo.foreignKeys.length > 0) {
            content += `
**테이블 관계**:
`;
            tableInfo.foreignKeys.forEach(fk => {
                content += `- **${fk.column}** 컬럼은 **${fk.referencesTable}** 테이블의 **${fk.referencesColumn}** 컬럼을 참조합니다.\n`;
            });
        }

        // 데이터 샘플 추가
        if (tableInfo.sampleData && tableInfo.sampleData.length > 1) { // 헤더 포함 최소 2행
            content += `
**데이터 샘플**:
`;
            const headers = tableInfo.sampleData[0];
            const rows = tableInfo.sampleData.slice(1);

            // Markdown 테이블 형식으로 변환
            content += `| ${headers.join(' | ')} |\n`;
            content += `| ${headers.map(() => '---').join(' | ')} |\n`;
            rows.forEach(row => {
                content += `| ${row.join(' | ')} |\n`;
            });
        } else if (tableInfo.sampleData.length === 1) { // 헤더만 있는 경우 (데이터 없음)
            content += `\n**데이터 샘플**: 데이터가 존재하지 않습니다.\n`;
        }


        // 최종 Document 객체 생성
        documents.push(new Document({
            pageContent: content.trim(), // 앞뒤 공백 제거
            metadata: {
                tableName: tableName,
                source: 'database_schema',
                // 필요하다면 다른 유용한 메타데이터 추가
            },
        }));
    }

    console.log(`총 ${documents.length}개의 스키마 Document 생성 완료.`);
    return documents;
}

module.exports = { formatSchemaAsDocuments };