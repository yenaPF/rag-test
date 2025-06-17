// scripts/query_vector_db.ts

import { QdrantClient } from '@qdrant/js-client-rest';
import { HuggingFaceEmbeddings } from './huggingface_embeddings';
import dotenv from 'dotenv';

// 환경 변수 로드
dotenv.config();

/**
 * 벡터 DB에서 유사한 스키마 정보를 검색합니다.
 * @param query - 검색할 자연어 쿼리
 * @param k - 반환할 문서 개수 (기본값: 3)
 * @returns Promise<void>
 */
async function queryVectorDb(query: string, k: number = 3): Promise<void> {
    console.log(`\n--- 벡터 DB 쿼리: "${query}" ---`);

    try {
        // Qdrant 클라이언트 초기화
        const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
        const vectorClient = new QdrantClient({ url: qdrantUrl });
        
        // 컬렉션 이름
        const collectionName = process.env.COLLECTION_NAME || 'schema_documents';

        // Hugging Face 임베딩 모델 초기화
        const hfModel = process.env.HF_MODEL || 'jhgan/ko-sroberta-multitask';
        const embeddingDimension = parseInt(process.env.EMBEDDING_DIMENSION || '768');
        
        const embeddings = new HuggingFaceEmbeddings({
            modelName: hfModel,
            dimension: embeddingDimension
        });

        // 쿼리 임베딩 생성
        console.log('쿼리 임베딩 생성 중...');
        const queryEmbedding = await embeddings.embedQuery(query);

        // 벡터 검색 실행
        console.log('벡터 검색 실행 중...');
        const searchResults = await vectorClient.search(collectionName, {
            vector: queryEmbedding,
            limit: k,
            with_payload: true,
            with_vector: false
        });

        if (searchResults.length === 0) {
            console.log('검색 결과가 없습니다.');
            return;
        }

        console.log(`\n검색 결과 (상위 ${searchResults.length}개):`);
        console.log('='.repeat(50));

        searchResults.forEach((result, index) => {
            const payload = result.payload as any;
            const score = result.score || 0;
            const tableName = payload.table_name || 'Unknown';
            const document = payload.document || '';

            console.log(`\n${index + 1}. 테이블: ${tableName} (유사도: ${score.toFixed(4)})`);
            console.log('-'.repeat(30));
            console.log(document);
            
            // 추가 메타데이터 표시 (있는 경우)
            if (payload.business_domain) {
                console.log(`도메인: ${payload.business_domain}`);
            }
            if (payload.column_names && Array.isArray(payload.column_names)) {
                console.log(`컬럼: ${payload.column_names.join(', ')}`);
            }
            if (payload.row_count) {
                console.log(`행 수: ${payload.row_count}`);
            }
        });

        // 임베딩 모델 정리
        await embeddings.cleanup();

    } catch (error: any) {
        console.error('벡터 DB 쿼리 중 오류 발생:', error.message);
        
        if (error.message.includes('Collection') && error.message.includes('not found')) {
            console.log('\n💡 벡터 DB 컬렉션이 아직 생성되지 않았습니다.');
            console.log('다음 명령으로 벡터 DB를 먼저 생성해주세요:');
            console.log('npm run build-db-ts');
        } else if (error.message.includes('connection') || error.message.includes('ECONNREFUSED')) {
            console.log('\n💡 Qdrant 서버에 연결할 수 없습니다.');
            console.log('다음 명령으로 Qdrant 서버를 먼저 실행해주세요:');
            console.log('docker run -p 6333:6333 -p 6334:6334 qdrant/qdrant');
        }
    }
}

// 명령행 인수 처리
const args = process.argv.slice(2);
if (args.length === 0) {
    console.log('사용법: node scripts/query_vector_db.ts "검색할 쿼리"');
    console.log('또는: ts-node scripts/query_vector_db.ts "검색할 쿼리"');
    console.log('예시: ts-node scripts/query_vector_db.ts "사용자 정보를 담고 있는 테이블은 무엇인가요?"');
    console.log('\n환경 변수 설정:');
    console.log('- QDRANT_URL: Qdrant 서버 URL (기본값: http://localhost:6333)');
    console.log('- COLLECTION_NAME: 컬렉션 이름 (기본값: schema_documents)');
    console.log('- HF_MODEL: Hugging Face 모델 (기본값: jhgan/ko-sroberta-multitask)');
    console.log('- EMBEDDING_DIMENSION: 임베딩 차원 (기본값: 768)');
    process.exit(1);
}

const query = args[0];
const k = args[1] ? parseInt(args[1], 10) : 3;

// 쿼리 실행
queryVectorDb(query, k).catch(console.error);