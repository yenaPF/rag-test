// scripts/schema_rag.ts

import { TableInfo, SchemaMetadata, SearchResult, QueryOptions, SchemaCache, CacheEntry } from '../types';
import { QdrantClient } from '@qdrant/js-client-rest';
import { HuggingFaceEmbeddings } from './huggingface_embeddings';

/**
 * 고도화된 스키마 RAG 시스템
 * 파이썬 버전의 SchemaRAG 클래스를 TypeScript로 구현
 */
export class SchemaRAG {
  private vectorClient: QdrantClient;
  private collectionName: string | null = null;
  private cache: SchemaCache;
  private embeddingModel: HuggingFaceEmbeddings;
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
    } catch (error) {
      await this.vectorClient.createCollection(collectionName, {
        vectors: {
          size: 384, // all-MiniLM-L6-v2 임베딩 차원
          distance: 'Cosine'
        }
      });
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

      // Qdrant는 숫자 ID 또는 UUID만 허용하므로 해시 기반 숫자 ID 생성
      const tableId = this.generateNumericId(`${tableInfo.schemaName}.${tableInfo.tableName}`);
      
      points.push({
        id: tableId,
        vector: embedding[0],
        payload: {
          ...payload,
          table_full_name: `${tableInfo.schemaName}.${tableInfo.tableName}` // 원본 이름 유지
        }
      });

      // 캐시에도 저장
      this.cacheTableInfo(tableName, tableInfo);
    }

    // 기존 데이터 삭제 후 새로 추가
    try {
      await this.vectorClient.deleteCollection(this.collectionName);
      
      await this.vectorClient.createCollection(this.collectionName, {
        vectors: {
          size: 384,
          distance: 'Cosine'
        }
      });
    } catch (error) {
      // 컬렉션 재생성 중 오류 (무시 가능)
    }

    // 새 데이터 추가
    await this.vectorClient.upsert(this.collectionName, {
      wait: true,
      points
    });

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
      return cachedResult;
    }

    // 쿼리 임베딩 생성
    console.error(`[DEBUG] 쿼리 임베딩 생성 시작: "${userQuery}"`);
    const queryEmbedding = await this.embeddingModel.embedQuery(userQuery);
    console.error(`[DEBUG] 임베딩 생성 완료: 차원=${queryEmbedding.length}, 첫 3개 값=[${queryEmbedding.slice(0, 3).join(', ')}]`);

    // 필터 구성
    const filter: any = {};
    if (opts.domains && opts.domains.length > 0) {
      filter.business_domain = { $in: opts.domains };
    }
    if (opts.tableNames && opts.tableNames.length > 0) {
      filter.table_name = { $in: opts.tableNames };
    }
    console.error(`[DEBUG] 필터: ${JSON.stringify(filter)}`);

    // 벡터 검색 실행
    console.error(`[DEBUG] 벡터 검색 시작 - topK=${opts.topK}, threshold=${opts.threshold}`);
    const searchResults = await this.vectorClient.search(this.collectionName, {
      vector: queryEmbedding,
      limit: opts.topK,
      filter: Object.keys(filter).length > 0 ? filter : undefined,
      with_payload: true,
      with_vector: false
    });
    console.error(`[DEBUG] 벡터 검색 완료: ${searchResults.length}개 결과`);
    
    if (searchResults.length > 0) {
      console.error(`[DEBUG] 첫 번째 결과 점수: ${searchResults[0].score}, 임계값: ${opts.threshold}`);
    }

    const results: SearchResult[] = [];
    
    for (const hit of searchResults) {
      const score = hit.score;
      const payload = hit.payload as any;
      
      console.error(`[DEBUG] 처리 중인 결과: table_name=${payload.table_name}, score=${score}`);

      if (score >= opts.threshold) {
        console.error(`[DEBUG] 임계값 통과, 캐시에서 테이블 정보 조회 시작`);
        // 캐시에서 테이블 정보 조회 (없으면 payload에서 재구성)
        const tableInfo = await this.getTableInfo(payload.table_name, payload);
        console.error(`[DEBUG] 캐시 조회 결과: ${tableInfo ? '성공' : '실패'}`);
        
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
          console.error(`[DEBUG] 결과 추가됨: ${tableInfo.tableName}`);
        } else {
          console.error(`[DEBUG] 테이블 정보 없음: ${payload.table_name}, 캐시 크기: ${this.cache.tables.size}`);
        }
      } else {
        console.error(`[DEBUG] 임계값 미달: ${score} < ${opts.threshold}`);
      }
    }

    // 결과 캐시
    this.cacheSearchResults(cacheKey, results);

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
   * 캐시에서 테이블 정보를 조회하고, 없으면 payload에서 재구성합니다.
   */
  private async getTableInfo(tableName: string, payload?: any): Promise<TableInfo | null> {
    const cacheEntry = this.cache.tables.get(tableName);
    if (cacheEntry && this.isCacheValid(cacheEntry)) {
      cacheEntry.hitCount++;
      return cacheEntry.data;
    }
    
    // 캐시에 없으면 payload에서 TableInfo 재구성
    if (payload) {
      console.error(`[DEBUG] 캐시에 없어서 payload에서 테이블 정보 재구성: ${tableName}`);
      const tableInfo: TableInfo = {
        tableName: payload.table_name,
        schemaName: payload.schema_name || 'unknown',
        description: payload.document?.split(' | ')[1]?.replace('설명: ', '') || 'No description',
        businessDomain: payload.business_domain || 'general',
        columns: this.parseColumnsFromDocument(payload.document || ''),
        relationships: [],
        commonQueries: [],
        rowCount: parseInt(payload.row_count?.toString() || '0'),
        indexedColumns: payload.indexed_columns || [],
        engine: payload.engine || 'Unknown',
        lastUpdated: new Date(),
        sampleData: []
      };
      
      // 캐시에 저장
      this.cacheTableInfo(tableName, tableInfo);
      return tableInfo;
    }
    
    return null;
  }
  
  /**
   * document 문자열에서 컬럼 정보를 파싱합니다.
   */
  private parseColumnsFromDocument(document: string): any[] {
    const columns: any[] = [];
    const parts = document.split(' | ');
    const columnPart = parts.find(part => part.startsWith('컬럼: '));
    
    if (columnPart) {
      const columnText = columnPart.replace('컬럼: ', '');
      const columnStrs = columnText.split(', ');
      
      for (const colStr of columnStrs) {
        const match = colStr.match(/^(\w+) \(([^)]+)\)(?:: (.+))?/);
        if (match) {
          columns.push({
            name: match[1],
            dataType: match[2],
            description: match[3] || '',
            isPrimaryKey: false,
            isForeignKey: false,
            isNullable: true,
            foreignKeyReference: null
          });
        }
      }
    }
    
    return columns;
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
   * 문자열을 숫자 ID로 변환합니다 (해시 기반).
   * @param str 변환할 문자열
   * @returns 32비트 양의 정수
   */
  private generateNumericId(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 32비트 정수로 변환
    }
    return Math.abs(hash);
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