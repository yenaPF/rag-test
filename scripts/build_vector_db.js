// scripts/build_vector_db.js (메인 스크립트 역할)

const { OllamaEmbeddings } = require('@langchain/community/embeddings/ollama');
const { Chroma } = require('@langchain/community/vectorstores/chroma');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter'); // 청킹을 위해 필요할 수 있음
const { formatSchemaAsDocuments } = require('./schema_formatter'); // 3단계 결과물
const { closeDbPool } = require('./db_client'); // DB 연결 풀 종료

// 환경 변수 로드
require('dotenv').config();

async function buildVectorDb() {
    console.log('\n--- 5. 벡터화 및 저장 시작 ---');

    // 5.1.1 임베딩 모델 로드
    // OllamaEmbeddings 인스턴스 생성
    const embeddings = new OllamaEmbeddings({
        baseUrl: process.env.OLLAMA_BASE_URL, // .env 파일에서 설정한 Ollama 서버 주소
        model: process.env.OLLAMA_MODEL,     // .env 파일에서 설정한 Ollama 모델 이름
        // 기타 옵션 (예: keep_alive 등)
    });
    console.log(`Ollama 임베딩 모델 로드 완료: ${process.env.OLLAMA_MODEL}`);

    // 4단계에서 포맷팅된 스키마 Document 가져오기
    // 이 시나리오에서는 각 테이블 정보가 이미 하나의 의미 있는 청크로 간주됩니다.
    // 만약 더 긴 청크가 필요하다면, 이 단계에서 RecursiveCharacterTextSplitter를 사용하여
    // documents를 한 번 더 처리할 수 있습니다.
    const documents = await formatSchemaAsDocuments();
    console(`총 ${documents.length}개의 스키마 Document 준비 완료.`);

    // ChromaDB가 저장될 로컬 경로 정의
    const collectionName = 'schema_documents'; // ChromaDB 컬렉션 이름
    const chromaDbPath = './chroma_db'; // 벡터 DB가 저장될 로컬 폴더

    // 5.1.2 벡터 저장소 초기화 및 5.1.3 청크 벡터 변환 및 저장
    console(`벡터 DB 초기화 및 Document 저장 시작: ${chromaDbPath}/${collectionName}`);
    try {
        const vectorStore = await Chroma.fromDocuments(documents, embeddings, {
            collectionName: collectionName,
            url: chromaDbPath, // 로컬 파일 시스템에 저장할 경로 (ChromaDB의 경우 `url` 옵션 사용)
        });
        console('벡터 DB에 Document 및 벡터 저장 완료!');
        console(`ChromaDB가 ${chromaDbPath} 경로에 저장되었습니다.`);

        // 6.1.1 벡터 DB 데이터 무결성 확인 (간단한 테스트)
        console('\n--- 6.1.1 벡터 DB 데이터 무결성 확인 (간단한 테스트) ---');
        const testQuery = "사용자 정보에 대한 테이블을 찾아줘";
        console(`테스트 쿼리: "${testQuery}"`);
        const results = await vectorStore.similaritySearch(testQuery, 1); // 가장 유사한 문서 1개 검색

        if (results.length > 0) {
            console('검색 결과:', results[0].metadata.tableName); // 검색된 테이블 이름
            // console.log('검색된 문서 내용의 일부:', results[0].pageContent.substring(0, 200) + '...');
        } else {
            console('검색 결과가 없습니다. 벡터 DB 구축에 문제가 있을 수 있습니다.');
        }

    } catch (error) {
        console.error('벡터 DB 구축 및 저장 중 오류 발생:', error.message);
        throw error;
    } finally {
        await closeDbPool(); // 데이터베이스 풀 종료
        console('\n--- 벡터 DB 구축 프로세스 완료 ---');
    }
}

// 스크립트 실행
buildVectorDb().catch(console.error);

// package.json "scripts" 에 추가
// "build-db": "node scripts/build_vector_db.js"