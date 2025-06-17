// scripts/build_vector_db.ts

import { config } from 'dotenv';
import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import { ChromaClient } from 'chromadb';
import { extractSchemaMetadata } from './schema_extractor';
import { SchemaRAG } from './schema_rag';
import { closeDbPool } from './db_client';
import { EmbeddingConfig, VectorStoreConfig } from '../types';

// 환경 변수 로드
config();

/**
 * 벡터 DB 구축 설정을 환경 변수에서 로드합니다.
 */
function loadConfig(): { embedding: EmbeddingConfig; vectorStore: VectorStoreConfig } {
  return {
    embedding: {
      modelName: process.env.OLLAMA_MODEL || 'nomic-embed-text',
      dimension: parseInt(process.env.EMBEDDING_DIMENSION || '768', 10),
      chunkSize: parseInt(process.env.CHUNK_SIZE || '1000', 10),
      chunkOverlap: parseInt(process.env.CHUNK_OVERLAP || '200', 10)
    },
    vectorStore: {
      type: 'chroma',
      collectionName: process.env.COLLECTION_NAME || 'schema_documents',
      url: process.env.CHROMA_URL || 'http://localhost:8000',
      config: {
        path: process.env.CHROMA_DB_PATH || './chroma'
      }
    }
  };
}

/**
 * 벡터 DB 구축 메인 함수
 */
async function buildVectorDb(): Promise<void> {
  console.log('\n=== 고도화된 벡터 DB 구축 시작 ===');
  
  try {
    const config = loadConfig();
    console.log('설정 로드 완료:', {
      model: config.embedding.modelName,
      collection: config.vectorStore.collectionName,
      dimension: config.embedding.dimension
    });

    // 1. 임베딩 모델 초기화
    console.log('\n1. 임베딩 모델 초기화...');
    const embeddings = new OllamaEmbeddings({
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      model: config.embedding.modelName,
      // keepAlive: '5m', // 모델을 메모리에 5분간 유지
    });
    console.log(`Ollama 임베딩 모델 로드 완료: ${config.embedding.modelName}`);

    // 2. ChromaDB 클라이언트 초기화
    console.log('\n2. ChromaDB 클라이언트 초기화...');
    const chromaClient = new ChromaClient({
      path: config.vectorStore.config?.path || './chroma'
    });
    console.log('ChromaDB 클라이언트 초기화 완료');

    // 3. SchemaRAG 인스턴스 생성 및 초기화
    console.log('\n3. SchemaRAG 시스템 초기화...');
    const schemaRAG = new SchemaRAG(chromaClient, embeddings);
    await schemaRAG.initialize(config.vectorStore.collectionName);
    console.log('SchemaRAG 시스템 초기화 완료');

    // 4. 스키마 메타데이터 추출
    console.log('\n4. 스키마 메타데이터 추출...');
    const schemaMetadata = await extractSchemaMetadata();
    console.log(`스키마 추출 완료: ${schemaMetadata.totalTables}개 테이블, ${schemaMetadata.totalRelationships}개 관계`);

    // 5. 스키마 인덱싱
    console.log('\n5. 스키마 벡터 인덱싱...');
    await schemaRAG.indexSchema(schemaMetadata);
    console.log('스키마 인덱싱 완료');

    // 6. 벡터 DB 무결성 테스트
    console.log('\n6. 벡터 DB 무결성 테스트...');
    await performIntegrityTests(schemaRAG);

    // 7. 성능 테스트
    console.log('\n7. 성능 테스트...');
    await performPerformanceTests(schemaRAG);

    // 8. 캐시 통계 출력
    console.log('\n8. 캐시 통계:');
    const cacheStats = schemaRAG.getCacheStats();
    console.log(`- 테이블 캐시: ${cacheStats.tables.count}개 엔트리, ${cacheStats.tables.totalHits}회 히트`);
    console.log(`- 관계 캐시: ${cacheStats.relationships.count}개 엔트리, ${cacheStats.relationships.totalHits}회 히트`);
    console.log(`- 검색 결과 캐시: ${cacheStats.searchResults.count}개 엔트리, ${cacheStats.searchResults.totalHits}회 히트`);

    console.log('\n✅ 고도화된 벡터 DB 구축 완료!');

  } catch (error) {
    console.error('❌ 벡터 DB 구축 중 오류 발생:', error);
    throw error;
  } finally {
    await closeDbPool();
    console.log('데이터베이스 연결 풀 종료');
  }
}

/**
 * 벡터 DB 무결성 테스트를 수행합니다.
 */
async function performIntegrityTests(schemaRAG: SchemaRAG): Promise<void> {
  const testQueries = [
    '사용자 정보에 대한 테이블을 찾아줘',
    '주문 관련 데이터는 어떤 테이블에 있나요?',
    '외래키 관계가 있는 테이블들을 보여주세요',
    'primary key가 있는 컬럼들을 찾아주세요'
  ];

  for (const query of testQueries) {
    console.log(`\n테스트 쿼리: "${query}"`);
    const startTime = Date.now();
    
    const results = await schemaRAG.searchRelevantSchemas(query, {
      topK: 3,
      includeRelated: true,
      threshold: 0.1
    });

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    if (results.length > 0) {
      console.log(`✅ 검색 완료 (${responseTime}ms): ${results.length}개 결과`);
      results.forEach((result, index) => {
        console.log(`  ${index + 1}. ${result.table.tableName} (점수: ${result.score.toFixed(3)}, 도메인: ${result.table.businessDomain})`);
        if (result.relatedTables && result.relatedTables.length > 0) {
          console.log(`     관련 테이블: ${result.relatedTables.map(t => t.tableName).join(', ')}`);
        }
      });
    } else {
      console.log('⚠️  검색 결과 없음');
    }
  }
}

/**
 * 성능 테스트를 수행합니다.
 */
async function performPerformanceTests(schemaRAG: SchemaRAG): Promise<void> {
  const testQuery = '사용자와 주문 정보를 연결하는 테이블들';
  const iterations = 5;
  const times: number[] = [];

  console.log(`성능 테스트: "${testQuery}" (${iterations}회 실행)`);

  for (let i = 0; i < iterations; i++) {
    const startTime = Date.now();
    
    await schemaRAG.searchRelevantSchemas(testQuery, {
      topK: 5,
      includeRelated: true
    });
    
    const endTime = Date.now();
    times.push(endTime - startTime);
  }

  const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);

  console.log(`평균 응답 시간: ${avgTime.toFixed(2)}ms`);
  console.log(`최소 응답 시간: ${minTime}ms`);
  console.log(`최대 응답 시간: ${maxTime}ms`);

  // 캐시 효과 확인
  console.log('\n캐시 효과 테스트...');
  const cacheTestStartTime = Date.now();
  await schemaRAG.searchRelevantSchemas(testQuery, { topK: 5 });
  const cacheTestEndTime = Date.now();
  
  console.log(`캐시된 결과 응답 시간: ${cacheTestEndTime - cacheTestStartTime}ms`);
}

/**
 * 관련 테이블 탐색 테스트
 */
async function testRelatedTableDiscovery(schemaRAG: SchemaRAG): Promise<void> {
  console.log('\n관련 테이블 자동 탐색 테스트...');
  
  const searchResults = await schemaRAG.searchRelevantSchemas('사용자 테이블', {
    topK: 1,
    includeRelated: false
  });

  if (searchResults.length > 0) {
    const primaryTable = searchResults[0].table;
    console.log(`주 테이블: ${primaryTable.tableName}`);
    
    const relatedTables = await schemaRAG.findRelatedTables(primaryTable, 2);
    console.log(`관련 테이블 (2단계 깊이): ${relatedTables.map(t => t.tableName).join(', ')}`);
    
    // 관계 정보 출력
    console.log('\n관계 정보:');
    primaryTable.relationships.forEach(rel => {
      console.log(`- ${rel.relationshipName}: ${rel.relatedTable} (${rel.relationshipType})`);
    });
  }
}

// 스크립트 실행
if (require.main === module) {
  buildVectorDb()
    .then(() => {
      console.log('\n🎉 모든 작업이 성공적으로 완료되었습니다!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 작업 중 오류가 발생했습니다:', error);
      process.exit(1);
    });
}

export { buildVectorDb, performIntegrityTests, performPerformanceTests };