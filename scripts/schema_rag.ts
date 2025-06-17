// scripts/schema_rag.ts

import { TableInfo, SchemaMetadata, SearchResult, QueryOptions, SchemaCache, CacheEntry } from '../types';
import { QdrantClient } from '@qdrant/js-client-rest';

/**
 * 고도화된 스키마 RAG 시스템
 * 파이썬 버전의 SchemaRAG 클래스를 TypeScript로 구현
 */
export class SchemaRAG {
  private vectorClient: QdrantClient;
  private collectionName: string | null = null;
  private cache: SchemaCache;
  private embeddingModel: any; // Ollama embedding model
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5분

  constructor(vectorClient: QdrantClient, embeddingModel: any) {
    this.vectorClient = vectorClient;
    this.embeddingModel = embeddingModel;
    this.cache = {
      tables: new Map(),
      relationships: new Map(),
      searchResults: new Map()
    };
  }

  /**
   * 컬렉션을 초기화합니다.
   * @param collectionName 컬렉션 이름
   */
  async initialize(collectionName: string = 'schema_documents'): Promise<void> {
    this.collectionName = collectionName;
    
    try {
      const collectionInfo = await this.vectorClient.getCollection(collectionName);
      console.log(`기존 컬렉션 '${collectionName}' 연결 완료`);
    } catch (error) {
      console.log(`컬렉션 '${collectionName}' 생성 중...`);
      await this.vectorClient.createCollection(collectionName, {
        vectors: {
          size: 768, // nomic-embed-text 임베딩 차원
          distance: 'Cosine'
        }
      });
      console.log(`새 컬렉션 '${collectionName}' 생성 완료`);
    }
  }

  /**
   * 테이블 정보를 임베딩용 텍스트로 변환합니다.
   * @param tableInfo 테이블 정보
   * @returns 임베딩용 종합 텍스트
   */
  private prepareEmbeddingText(tableInfo: TableInfo): string {
    const parts: string[] = [
      `테이블: ${tableInfo.tableName}`,
      `설명: ${tableInfo.description}`
    ];

    // 컬럼 정보 추가 (간결하게)
    if (tableInfo.columns.length > 0) {
      const columnTexts: string[] = [];
      for (const col of tableInfo.columns) {
        let colText = `${col.name} (${col.dataType})`;
        if (col.description) {
          colText += `: ${col.description}`;
        }
        columnTexts.push(colText);
      }
      parts.push(`컬럼: ${columnTexts.join(', ')}`);
    }

    // 비즈니스 도메인 추가
    if (tableInfo.businessDomain) {
      parts.push(`도메인: ${tableInfo.businessDomain}`);
    }

    // 일반적인 쿼리 패턴 추가
    if (tableInfo.commonQueries.length > 0) {
      const queries = tableInfo.commonQueries.map(q => q.description);
      parts.push(`사용 예시: ${queries.join(', ')}`);
    }

    // 관계 정보 추가
    if (tableInfo.relationships.length > 0) {
      const relationships = tableInfo.relationships.map(rel => 
        `${rel.relatedTable} (${rel.relationshipType})`
      );
      parts.push(`관련 테이블: ${relationships.join(', ')}`);
    }

    return parts.join(' | ');
  }

  /**
   * 스키마 정보를 벡터 DB에 인덱싱합니다.
   * @param schemaMetadata 스키마 메타데이터
   */
  async indexSchema(schemaMetadata: SchemaMetadata): Promise<void> {
    if (!this.collectionName) {
      throw new Error('Collection not initialized. Call initialize() first.');
    }

    console.log('스키마 벡터 인덱싱 시작...');
    
    const points: any[] = [];

    for (const [tableName, tableInfo] of Object.entries(schemaMetadata.tables)) {
      // 임베딩 텍스트 생성
      const embeddingText = this.prepareEmbeddingText(tableInfo);
      
      // 임베딩 생성
      const embedding = await this.embeddingModel.embedDocuments([embeddingText]);
      
      // 메타데이터 준비
      const payload = {
        table_name: tableInfo.tableName,
        schema_name: tableInfo.schemaName,
        business_domain: tableInfo.businessDomain,
        column_names: tableInfo.columns.map(col => col.name),
        has_relationships: tableInfo.relationships.length > 0,
        row_count: tableInfo.rowCount,
        indexed_columns: tableInfo.indexedColumns,
        engine: tableInfo.engine,
        primary_keys: tableInfo.columns.filter(col => col.isPrimaryKey).map(col => col.name),
        foreign_keys: tableInfo.columns.filter(col => col.isForeignKey).map(col => col.name),
        document: embeddingText
      };

      points.push({
        id: `${tableInfo.schemaName}.${tableInfo.tableName}`,
        vector: embedding[0],
        payload
      });

      // 캐시에도 저장
      this.cacheTableInfo(tableName, tableInfo);
    }

    // 기존 데이터 삭제 후 새로 추가
    try {
      await this.vectorClient.deleteCollection(this.collectionName);
      console.log('기존 컬렉션 삭제');
      
      await this.vectorClient.createCollection(this.collectionName, {
        vectors: {
          size: 768,
          distance: 'Cosine'
        }
      });
      console.log('새 컬렉션 생성');
    } catch (error) {
      console.log('컬렉션 재생성 중 오류 (무시 가능):', error);
    }

    // 새 데이터 추가
    await this.vectorClient.upsert(this.collectionName, {
      wait: true,
      points
    });

    console.log(`${points.length}개 테이블 벡터 인덱싱 완료`);
  }

  /**
   * 사용자 쿼리와 관련된 스키마를 검색합니다.
   * @param userQuery 사용자 쿼리
   * @param options 검색 옵션
   * @returns 관련 테이블 정보 배열
   */
  async searchRelevantSchemas(
    userQuery: string, 
    options: Partial<QueryOptions> = {}
  ): Promise<SearchResult[]> {
    if (!this.collectionName) {
      throw new Error('Collection not initialized. Call initialize() first.');
    }

    const opts: QueryOptions = {
      topK: options.topK || 5,
      includeRelated: options.includeRelated !== false,
      threshold: options.threshold || 0.1,
      domains: options.domains,
      tableNames: options.tableNames
    };

    // 캐시 확인
    const cacheKey = JSON.stringify({ query: userQuery, options: opts });
    const cachedResult = this.getCachedSearchResults(cacheKey);
    if (cachedResult) {
      console.log('캐시된 검색 결과 반환');
      return cachedResult;
    }

    console.log(`스키마 검색 실행: "${userQuery}"`);

    // 쿼리 임베딩 생성
    const queryEmbedding = await this.embeddingModel.embedDocuments([userQuery]);

    // 필터 구성
    const filter: any = {};
    if (opts.domains && opts.domains.length > 0) {
      filter.business_domain = { $in: opts.domains };
    }
    if (opts.tableNames && opts.tableNames.length > 0) {
      filter.table_name = { $in: opts.tableNames };
    }

    // 벡터 검색 실행
    const searchResults = await this.vectorClient.search(this.collectionName, {
      vector: queryEmbedding[0],
      limit: opts.topK,
      filter: Object.keys(filter).length > 0 ? filter : undefined,
      with_payload: true,
      with_vector: false
    });

    const results: SearchResult[] = [];
    
    for (const hit of searchResults) {
      const score = hit.score;
      const payload = hit.payload as any;

      if (score >= opts.threshold) {
        // 캐시에서 테이블 정보 조회
        const tableInfo = await this.getTableInfo(payload.table_name);
        if (tableInfo) {
          const result: SearchResult = {
            table: tableInfo,
            score,
            matchedContent: payload.document || '',
            relatedTables: []
          };

          // 관련 테이블 자동 포함
          if (opts.includeRelated && tableInfo.relationships.length > 0) {
            const relatedTables: TableInfo[] = [];
            for (const rel of tableInfo.relationships) {
              const relatedTable = await this.getTableInfo(rel.relatedTable);
              if (relatedTable && !results.some(r => r.table.tableName === relatedTable.tableName)) {
                relatedTables.push(relatedTable);
              }
            }
            result.relatedTables = relatedTables;
          }

          results.push(result);
        }
      }
    }

    // 결과 캐시
    this.cacheSearchResults(cacheKey, results);

    console.log(`검색 완료: ${results.length}개 테이블 발견`);
    return results;
  }

  /**
   * 테이블 정보를 캐시에 저장합니다.
   */
  private cacheTableInfo(tableName: string, tableInfo: TableInfo): void {
    const cacheEntry: CacheEntry<TableInfo> = {
      data: tableInfo,
      timestamp: new Date(),
      ttl: this.CACHE_TTL,
      hitCount: 0
    };
    this.cache.tables.set(tableName, cacheEntry);
  }

  /**
   * 캐시에서 테이블 정보를 조회합니다.
   */
  private async getTableInfo(tableName: string): Promise<TableInfo | null> {
    const cacheEntry = this.cache.tables.get(tableName);
    if (cacheEntry && this.isCacheValid(cacheEntry)) {
      cacheEntry.hitCount++;
      return cacheEntry.data;
    }
    return null;
  }

  /**
   * 검색 결과를 캐시에 저장합니다.
   */
  private cacheSearchResults(cacheKey: string, results: SearchResult[]): void {
    const cacheEntry: CacheEntry<SearchResult[]> = {
      data: results,
      timestamp: new Date(),
      ttl: this.CACHE_TTL,
      hitCount: 0
    };
    this.cache.searchResults.set(cacheKey, cacheEntry);
  }

  /**
   * 캐시에서 검색 결과를 조회합니다.
   */
  private getCachedSearchResults(cacheKey: string): SearchResult[] | null {
    const cacheEntry = this.cache.searchResults.get(cacheKey);
    if (cacheEntry && this.isCacheValid(cacheEntry)) {
      cacheEntry.hitCount++;
      return cacheEntry.data;
    }
    return null;
  }

  /**
   * 캐시 엔트리가 유효한지 확인합니다.
   */
  private isCacheValid<T>(cacheEntry: CacheEntry<T>): boolean {
    return (Date.now() - cacheEntry.timestamp.getTime()) < cacheEntry.ttl;
  }

  /**
   * 만료된 캐시 엔트리를 정리합니다.
   */
  public cleanupCache(): void {
    const now = Date.now();
    
    // 테이블 캐시 정리
    for (const [key, entry] of this.cache.tables.entries()) {
      if ((now - entry.timestamp.getTime()) >= entry.ttl) {
        this.cache.tables.delete(key);
      }
    }

    // 관계 캐시 정리
    for (const [key, entry] of this.cache.relationships.entries()) {
      if ((now - entry.timestamp.getTime()) >= entry.ttl) {
        this.cache.relationships.delete(key);
      }
    }

    // 검색 결과 캐시 정리
    for (const [key, entry] of this.cache.searchResults.entries()) {
      if ((now - entry.timestamp.getTime()) >= entry.ttl) {
        this.cache.searchResults.delete(key);
      }
    }

    console.log('캐시 정리 완료');
  }

  /**
   * 캐시 통계를 반환합니다.
   */
  public getCacheStats(): {
    tables: { count: number; totalHits: number };
    relationships: { count: number; totalHits: number };
    searchResults: { count: number; totalHits: number };
  } {
    const getStats = <T>(cache: Map<string, CacheEntry<T>>) => ({
      count: cache.size,
      totalHits: Array.from(cache.values()).reduce((sum, entry) => sum + entry.hitCount, 0)
    });

    return {
      tables: getStats(this.cache.tables),
      relationships: getStats(this.cache.relationships),
      searchResults: getStats(this.cache.searchResults)
    };
  }

  /**
   * 관련 테이블들을 자동으로 찾아 포함시킵니다.
   * @param primaryTable 주 테이블
   * @param depth 탐색 깊이 (기본값: 1)
   * @returns 관련 테이블 배열
   */
  public async findRelatedTables(primaryTable: TableInfo, depth: number = 1): Promise<TableInfo[]> {
    const relatedTables = new Set<TableInfo>();
    const visited = new Set<string>();
    
    const findRelated = async (table: TableInfo, currentDepth: number) => {
      if (currentDepth >= depth || visited.has(table.tableName)) {
        return;
      }
      
      visited.add(table.tableName);
      
      for (const rel of table.relationships) {
        const relatedTable = await this.getTableInfo(rel.relatedTable);
        if (relatedTable && !relatedTables.has(relatedTable)) {
          relatedTables.add(relatedTable);
          await findRelated(relatedTable, currentDepth + 1);
        }
      }
    };

    await findRelated(primaryTable, 0);
    return Array.from(relatedTables);
  }
}