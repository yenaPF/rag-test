// scripts/chunker.js

const { formatSchemaAsDocuments } = require('./schema_formatter');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter'); // LangChain 텍스트 스플리터 임포트
// tiktoken (토큰 길이 계산)을 사용하려면 아래 임포트
// const { Tiktoken } = require('@dqbd/tiktoken');
// const { get_encoding } = require('@dqbd/tiktoken');

/**
 * 스키마 정보를 청크(Chunk)로 분할합니다.
 * 이 시나리오에서는 3단계에서 각 테이블 정보가 이미 하나의 의미 있는 청크로 포맷팅되었습니다.
 * 따라서, 추가적인 분할이 필요하지 않거나, 단지 컨텍스트 윈도우 제한을 위한 보조적인 분할만 수행합니다.
 * @returns {Promise<Document[]>} 분할(또는 그대로 전달)된 LangChain Document 객체 배열
 */
async function chunkSchemaDocuments() {
    console.log('스키마 Document 청킹 시작...');
    const rawDocuments = await formatSchemaAsDocuments(); // 3단계에서 포맷팅된 Document 가져오기

    // ### 시나리오 1: 각 테이블 Document가 이미 적절한 청크 크기라고 판단될 경우 (추가 분할 없음)
    // 이 경우, 3단계에서 생성된 Document들을 그대로 반환합니다.
    console.log("각 테이블 Document가 이미 의미 단위로 청킹되어 추가 분할을 건너뜁니다.");
    return rawDocuments;


    // ### 시나리오 2: 각 테이블 Document가 너무 길어져 추가 분할이 필요한 경우
    // 이 경우, RecursiveCharacterTextSplitter를 사용하여 분할합니다.
    /*
    console.log("테이블 Document가 너무 길 경우를 대비하여 RecursiveCharacterTextSplitter를 사용합니다.");

    // 토큰 카운팅을 위한 인코더 설정 (OpenAI 모델과 유사한 토큰 분할)
    // const tokenizer = get_encoding("cl100k_base"); // gpt-4, gpt-3.5-turbo 등이 사용하는 인코딩
    // const getLength = (text) => tokenizer.encode(text).length;

    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000, // 각 청크의 최대 토큰/문자 수
        chunkOverlap: 100, // 청크 간 중복되는 토큰/문자 수
        // lengthFunction: getLength, // 토큰 기반으로 길이 계산 (선택 사항)
        // separators: ["\n### 테이블명:", "\n**컬럼 정보**:", "\n**데이터 샘플**:", "\n\n", "\n", " ", ""], // Markdown 구조를 활용한 분할
    });

    const splitDocuments = [];
    for (const doc of rawDocuments) {
        const chunks = await splitter.splitDocuments([doc]);
        // 분할된 각 청크에도 원본 Document의 메타데이터를 유지
        chunks.forEach(chunk => {
            chunk.metadata = { ...doc.metadata, ...chunk.metadata }; // 기존 메타데이터 유지
            splitDocuments.push(chunk);
        });
    }

    console.log(`총 ${rawDocuments.length}개의 원본 Document를 ${splitDocuments.length}개의 청크로 분할 완료.`);
    return splitDocuments;
    */
}

module.exports = { chunkSchemaDocuments };