// scripts/query_vector_db.js

const { OllamaEmbeddings } = require('@langchain/community/embeddings/ollama');
const { Chroma } = require('@langchain/community/vectorstores/chroma');

// 환경 변수 로드
require('dotenv').config();

/**
 * 벡터 DB에서 유사한 스키마 정보를 검색합니다.
 * @param {string} query - 검색할 자연어 쿼리
 * @param {number} k - 반환할 문서 개수 (기본값: 3)
 * @returns {Promise<void>}
 */
async function queryVectorDb(query, k = 3) {
    console.log(`\n--- 벡터 DB 쿼리: "${query}" ---`);

    try {
        // 임베딩 모델 로드
        const embeddings = new OllamaEmbeddings({
            baseUrl: process.env.OLLAMA_BASE_URL,
            model: process.env.OLLAMA_MODEL,
        });

        // ChromaDB 연결
        const collectionName = 'schema_documents';
        const chromaDbPath = './chroma_db';

        const vectorStore = new Chroma(embeddings, {
            collectionName: collectionName,
            url: "http://localhost:8000",
        });

        // 유사도 검색 수행
        const results = await vectorStore.similaritySearch(query, k);

        if (results.length === 0) {
            console.log('검색 결과가 없습니다.');
            return;
        }

        console.log(`\n검색 결과 (상위 ${results.length}개):`);
        console.log('=' .repeat(50));

        results.forEach((doc, index) => {
            console.log(`\n${index + 1}. 테이블: ${doc.metadata.tableName}`);
            console.log('-'.repeat(30));
            console.log(doc.pageContent);
        });

    } catch (error) {
        console.error('벡터 DB 쿼리 중 오류 발생:', error.message);
        
        if (error.message.includes('ENOENT') || error.message.includes('not found')) {
            console.log('\n💡 벡터 DB가 아직 생성되지 않았습니다.');
            console.log('다음 명령으로 벡터 DB를 먼저 생성해주세요:');
            console.log('npm run build-db');
        }
    }
}

// 명령행 인수 처리
const args = process.argv.slice(2);
if (args.length === 0) {
    console.log('사용법: node scripts/query_vector_db.js "검색할 쿼리"');
    console.log('예시: node scripts/query_vector_db.js "사용자 정보를 담고 있는 테이블은 무엇인가요?"');
    process.exit(1);
}

const query = args[0];
const k = args[1] ? parseInt(args[1], 10) : 3;

// 쿼리 실행
queryVectorDb(query, k).catch(console.error);