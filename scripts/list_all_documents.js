// scripts/list_all_documents.js

const { OllamaEmbeddings } = require('@langchain/community/embeddings/ollama');
const { Chroma } = require('@langchain/community/vectorstores/chroma');

// 환경 변수 로드
require('dotenv').config();

/**
 * 벡터 DB에 저장된 모든 문서를 조회합니다.
 */
async function listAllDocuments() {
    //console.log('\n--- 벡터 DB에 저장된 모든 문서 조회 ---');

    try {
        // 임베딩 모델 로드
        const embeddings = new OllamaEmbeddings({
            baseUrl: process.env.OLLAMA_BASE_URL,
            model: process.env.OLLAMA_MODEL,
        });

        // ChromaDB 연결
        const collectionName = 'schema_documents';
        
        const vectorStore = new Chroma(embeddings, {
            collectionName: collectionName,
        });

        // 모든 문서 조회 (매우 일반적인 쿼리로 많은 결과 가져오기)
        const results = await vectorStore.similaritySearch("테이블", 100); // 최대 100개 문서

        if (results.length === 0) {
            //console.log('저장된 문서가 없습니다.');
            return;
        }

        //console.log(`\n총 ${results.length}개의 문서가 저장되어 있습니다:`);
        //console.log('='.repeat(60));

        results.forEach((doc, index) => {
            //console.log(`\n${index + 1}. 테이블: ${doc.metadata.tableName}`);
            //console.log('-'.repeat(40));
            //console.log(doc.pageContent);
            //console.log('='.repeat(60));
        });

        // 컬렉션 정보 조회 (가능한 경우)
        try {
            //console.log('\n--- 컬렉션 정보 ---');
            //console.log(`컬렉션 이름: ${collectionName}`);
            //console.log(`문서 개수: ${results.length}`);
        } catch (infoError) {
            //console.log('컬렉션 정보를 가져올 수 없습니다.');
        }

    } catch (error) {
        //console.error('문서 조회 중 오류 발생:', error.message);
        
        if (error.message.includes('collection') || error.message.includes('not found')) {
            //console.log('\n💡 벡터 DB가 아직 생성되지 않았거나 컬렉션이 존재하지 않습니다.');
            //console.log('다음 명령으로 벡터 DB를 먼저 생성해주세요:');
            //console.log('npm run build-db');
        }
    }
}

// 스크립트 실행
listAllDocuments().catch(//console.error);