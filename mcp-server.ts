// MCP 서버 - 고도화된 RAG 벡터 DB 검색 도구 제공 (TypeScript 버전)

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { config } from 'dotenv';
import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import { ChromaClient } from 'chromadb';
import { SchemaRAG } from './scripts/schema_rag';
import { MCPServerConfig, MCPResponse, SearchResult, QueryOptions } from './types';

// 환경 변수 로드
config();

/**
 * 고도화된 RAG MCP 서버
 */
class EnhancedRAGServer {
  private server: Server;
  private schemaRAG: SchemaRAG | null = null;
  private chromaClient: ChromaClient | null = null;
  private config: MCPServerConfig;

  constructor() {
    this.config = {
      name: 'enhanced-rag-vector-search',
      version: '2.0.0',
      timeout: parseInt(process.env.MCP_TIMEOUT || '30000', 10)
    };

    this.server = new Server(
      {
        name: this.config.name,
        version: this.config.version,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  /**
   * 도구 핸들러를 설정합니다.
   */
  private setupToolHandlers(): void {
    // 사용 가능한 도구 목록 제공
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = [
        {
          name: 'search_schema',
          description: '고도화된 RAG 벡터 DB에서 데이터베이스 스키마 정보를 검색합니다. 관련 테이블 자동 포함, 캐싱, 고급 필터링 지원.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: '검색할 자연어 쿼리 (예: "사용자 정보", "주문 테이블", "상품 데이터")',
              },
              topK: {
                type: 'number',
                description: '반환할 결과 개수 (기본값: 5)',
                default: 5,
              },
              includeRelated: {
                type: 'boolean',
                description: '관련 테이블 자동 포함 여부 (기본값: true)',
                default: true,
              },
              threshold: {
                type: 'number',
                description: '최소 유사도 임계값 (기본값: 0.1)',
                default: 0.1,
              },
              domains: {
                type: 'array',
                items: { type: 'string' },
                description: '특정 비즈니스 도메인으로 필터링 (예: ["user_management", "commerce"])',
              },
              tableNames: {
                type: 'array',
                items: { type: 'string' },
                description: '특정 테이블명으로 필터링',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'list_all_tables',
          description: '벡터 DB에 저장된 모든 테이블 정보를 조회합니다. 비즈니스 도메인별 분류 포함.',
          inputSchema: {
            type: 'object',
            properties: {
              groupByDomain: {
                type: 'boolean',
                description: '비즈니스 도메인별로 그룹화 여부 (기본값: true)',
                default: true,
              },
              includeStats: {
                type: 'boolean',
                description: '테이블 통계 정보 포함 여부 (기본값: true)',
                default: true,
              },
            },
          },
        },
        {
          name: 'get_table_relationships',
          description: '특정 테이블의 관계 정보를 상세히 조회합니다.',
          inputSchema: {
            type: 'object',
            properties: {
              tableName: {
                type: 'string',
                description: '조회할 테이블명',
              },
              depth: {
                type: 'number',
                description: '관계 탐색 깊이 (기본값: 2)',
                default: 2,
              },
            },
            required: ['tableName'],
          },
        },
        {
          name: 'get_cache_stats',
          description: '시스템 캐시 통계 및 성능 정보를 조회합니다.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ];

      return { tools };
    });

    // 도구 실행 핸들러
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        await this.ensureInitialized();

        switch (name) {
          case 'search_schema':
            return await this.searchSchema(args);
          
          case 'list_all_tables':
            return await this.listAllTables(args);
          
          case 'get_table_relationships':
            return await this.getTableRelationships(args);
          
          case 'get_cache_stats':
            return await this.getCacheStats();
          
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        console.error(`[RAG] Tool execution error for ${name}:`, error);
        return this.createErrorResponse(`오류 발생: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  /**
   * SchemaRAG 인스턴스가 초기화되었는지 확인하고 필요시 초기화합니다.
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.schemaRAG) {
      console.error('[RAG] SchemaRAG 초기화 중...');
      
      // ChromaDB 클라이언트 생성
      this.chromaClient = new ChromaClient({
        path: process.env.CHROMA_DB_PATH || './chroma'
      });

      // 임베딩 모델 생성
      const embeddings = new OllamaEmbeddings({
        baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        model: process.env.OLLAMA_MODEL || 'nomic-embed-text',
        requestOptions: {
          timeout: this.config.timeout,
        },
      });

      // SchemaRAG 인스턴스 생성 및 초기화
      this.schemaRAG = new SchemaRAG(this.chromaClient, embeddings);
      await this.schemaRAG.initialize(process.env.COLLECTION_NAME || 'schema_documents');
      
      console.error('[RAG] SchemaRAG 초기화 완료');
    }
  }

  /**
   * 스키마 검색을 수행합니다.
   */
  private async searchSchema(args: any): Promise<MCPResponse> {
    const {
      query,
      topK = 5,
      includeRelated = true,
      threshold = 0.1,
      domains,
      tableNames
    } = args;

    console.error(`[RAG] 고도화된 검색 시작: "${query}"`);

    const options: Partial<QueryOptions> = {
      topK,
      includeRelated,
      threshold,
      domains,
      tableNames
    };

    const startTime = Date.now();
    const results: SearchResult[] = await this.schemaRAG!.searchRelevantSchemas(query, options);
    const endTime = Date.now();
    const responseTime = endTime - startTime;

    if (results.length === 0) {
      return this.createResponse(`"${query}"에 대한 검색 결과가 없습니다. 검색 조건을 조정해보세요.`);
    }

    // 검색 결과 포맷팅
    let resultText = `🔍 "${query}" 고도화된 검색 결과 (${results.length}개, ${responseTime}ms):\n\n`;
    
    results.forEach((result, index) => {
      const table = result.table;
      resultText += `**${index + 1}. 테이블: ${table.tableName}** (점수: ${result.score.toFixed(3)})\n`;
      resultText += `📂 도메인: ${table.businessDomain}\n`;
      resultText += `📊 행 수: ${table.rowCount.toLocaleString()}\n`;
      resultText += `🔧 엔진: ${table.engine || 'Unknown'}\n`;
      resultText += `📝 설명: ${table.description}\n\n`;
      
      // 컬럼 정보
      resultText += `**컬럼 정보 (${table.columns.length}개):**\n`;
      table.columns.slice(0, 10).forEach(col => {
        let colInfo = `- ${col.name} (${col.dataType})`;
        if (col.isPrimaryKey) colInfo += ' [PK]';
        if (col.isForeignKey) colInfo += ` [FK → ${col.foreignKeyReference}]`;
        if (!col.isNullable) colInfo += ' [NOT NULL]';
        colInfo += `: ${col.description}`;
        resultText += colInfo + '\n';
      });
      
      if (table.columns.length > 10) {
        resultText += `... 및 ${table.columns.length - 10}개 추가 컬럼\n`;
      }

      // 관계 정보
      if (table.relationships.length > 0) {
        resultText += `\n**관계 정보 (${table.relationships.length}개):**\n`;
        table.relationships.forEach(rel => {
          resultText += `- ${rel.relationshipName}: ${rel.relatedTable} (${rel.relationshipType})\n`;
        });
      }

      // 관련 테이블
      if (result.relatedTables && result.relatedTables.length > 0) {
        resultText += `\n**관련 테이블:** ${result.relatedTables.map(t => t.tableName).join(', ')}\n`;
      }

      // 인덱스 정보
      if (table.indexedColumns.length > 0) {
        resultText += `\n**인덱스된 컬럼:** ${table.indexedColumns.join(', ')}\n`;
      }

      resultText += `\n${'='.repeat(80)}\n\n`;
    });

    return this.createResponse(resultText);
  }

  /**
   * 모든 테이블 목록을 조회합니다.
   */
  private async listAllTables(args: any = {}): Promise<MCPResponse> {
    const { groupByDomain = true, includeStats = true } = args;

    console.error('[RAG] 테이블 목록 조회 중...');

    // 전체 테이블 검색
    const allResults = await this.schemaRAG!.searchRelevantSchemas('테이블', {
      topK: 100,
      includeRelated: false,
      threshold: 0.0
    });

    if (allResults.length === 0) {
      return this.createResponse('저장된 테이블 정보가 없습니다. 벡터 DB를 먼저 구축해주세요.');
    }

    let resultText = `📊 데이터베이스 테이블 목록 (총 ${allResults.length}개):\n\n`;

    if (groupByDomain) {
      // 도메인별 그룹화
      const domainGroups: { [domain: string]: SearchResult[] } = {};
      allResults.forEach(result => {
        const domain = result.table.businessDomain;
        if (!domainGroups[domain]) {
          domainGroups[domain] = [];
        }
        domainGroups[domain].push(result);
      });

      for (const [domain, tables] of Object.entries(domainGroups)) {
        resultText += `**📁 ${domain.toUpperCase()} (${tables.length}개 테이블):**\n`;
        tables.forEach((result, index) => {
          const table = result.table;
          resultText += `  ${index + 1}. ${table.tableName}`;
          if (includeStats) {
            resultText += ` (${table.rowCount.toLocaleString()}행, ${table.columns.length}컬럼)`;
          }
          resultText += `\n     └ ${table.description}\n`;
        });
        resultText += '\n';
      }
    } else {
      // 단순 목록
      allResults.forEach((result, index) => {
        const table = result.table;
        resultText += `${index + 1}. **${table.tableName}**`;
        if (includeStats) {
          resultText += ` (${table.businessDomain}, ${table.rowCount.toLocaleString()}행)`;
        }
        resultText += `\n   ${table.description}\n`;
      });
    }

    if (includeStats) {
      // 통계 정보 추가
      const totalRows = allResults.reduce((sum, result) => sum + result.table.rowCount, 0);
      const totalColumns = allResults.reduce((sum, result) => sum + result.table.columns.length, 0);
      const totalRelationships = allResults.reduce((sum, result) => sum + result.table.relationships.length, 0);

      resultText += `\n📈 **데이터베이스 통계:**\n`;
      resultText += `- 총 행 수: ${totalRows.toLocaleString()}\n`;
      resultText += `- 총 컬럼 수: ${totalColumns.toLocaleString()}\n`;
      resultText += `- 총 관계 수: ${totalRelationships}\n`;
    }

    resultText += `\n💡 특정 테이블의 상세 정보를 보려면 'search_schema' 도구를 사용하세요.\n`;

    return this.createResponse(resultText);
  }

  /**
   * 테이블 관계 정보를 조회합니다.
   */
  private async getTableRelationships(args: any): Promise<MCPResponse> {
    const { tableName, depth = 2 } = args;

    console.error(`[RAG] 테이블 관계 조회: ${tableName}, 깊이: ${depth}`);

    const searchResults = await this.schemaRAG!.searchRelevantSchemas(tableName, {
      topK: 1,
      includeRelated: false,
      threshold: 0.0
    });

    if (searchResults.length === 0) {
      return this.createResponse(`테이블 "${tableName}"을 찾을 수 없습니다.`);
    }

    const table = searchResults[0].table;
    const relatedTables = await this.schemaRAG!.findRelatedTables(table, depth);

    let resultText = `🔗 **${table.tableName}** 테이블 관계 정보:\n\n`;
    
    // 직접 관계
    if (table.relationships.length > 0) {
      resultText += `**직접 관계 (${table.relationships.length}개):**\n`;
      table.relationships.forEach(rel => {
        resultText += `- **${rel.relationshipName}**\n`;
        resultText += `  └ ${rel.relatedTable} (${rel.relationshipType})\n`;
        resultText += `  └ ${rel.localColumn} → ${rel.foreignColumn}\n`;
        resultText += `  └ 소유자: ${rel.isOwner ? 'Yes' : 'No'}\n\n`;
      });
    }

    // 관련 테이블 (깊이 탐색)
    if (relatedTables.length > 0) {
      resultText += `**관련 테이블 (${depth}단계 깊이, ${relatedTables.length}개):**\n`;
      relatedTables.forEach((relTable, index) => {
        resultText += `${index + 1}. **${relTable.tableName}** (${relTable.businessDomain})\n`;
        resultText += `   └ ${relTable.description}\n`;
        resultText += `   └ ${relTable.rowCount.toLocaleString()}행, ${relTable.columns.length}컬럼\n\n`;
      });
    }

    // 외래키 분석
    const foreignKeys = table.columns.filter(col => col.isForeignKey);
    if (foreignKeys.length > 0) {
      resultText += `**외래키 컬럼 (${foreignKeys.length}개):**\n`;
      foreignKeys.forEach(fk => {
        resultText += `- ${fk.name} → ${fk.foreignKeyReference}\n`;
      });
      resultText += '\n';
    }

    // 참조되는 컬럼 (역관계)
    const referencingTables = relatedTables.filter(rt => 
      rt.relationships.some(rel => rel.relatedTable === table.tableName)
    );
    if (referencingTables.length > 0) {
      resultText += `**이 테이블을 참조하는 테이블 (${referencingTables.length}개):**\n`;
      referencingTables.forEach(rt => {
        const refs = rt.relationships.filter(rel => rel.relatedTable === table.tableName);
        refs.forEach(ref => {
          resultText += `- ${rt.tableName}.${ref.localColumn} → ${table.tableName}.${ref.foreignColumn}\n`;
        });
      });
    }

    return this.createResponse(resultText);
  }

  /**
   * 캐시 통계 정보를 조회합니다.
   */
  private async getCacheStats(): Promise<MCPResponse> {
    console.error('[RAG] 캐시 통계 조회 중...');

    const stats = this.schemaRAG!.getCacheStats();
    
    let resultText = `📊 **시스템 캐시 통계:**\n\n`;
    
    resultText += `**테이블 캐시:**\n`;
    resultText += `- 저장된 엔트리: ${stats.tables.count}개\n`;
    resultText += `- 총 히트 수: ${stats.tables.totalHits}회\n\n`;
    
    resultText += `**관계 캐시:**\n`;
    resultText += `- 저장된 엔트리: ${stats.relationships.count}개\n`;
    resultText += `- 총 히트 수: ${stats.relationships.totalHits}회\n\n`;
    
    resultText += `**검색 결과 캐시:**\n`;
    resultText += `- 저장된 엔트리: ${stats.searchResults.count}개\n`;
    resultText += `- 총 히트 수: ${stats.searchResults.totalHits}회\n\n`;

    const totalEntries = stats.tables.count + stats.relationships.count + stats.searchResults.count;
    const totalHits = stats.tables.totalHits + stats.relationships.totalHits + stats.searchResults.totalHits;
    
    resultText += `**전체 통계:**\n`;
    resultText += `- 총 캐시 엔트리: ${totalEntries}개\n`;
    resultText += `- 총 캐시 히트: ${totalHits}회\n`;
    resultText += `- 평균 히트율: ${totalEntries > 0 ? (totalHits / totalEntries).toFixed(2) : '0.00'}회/엔트리\n\n`;

    resultText += `💡 캐시 정리를 위해서는 서버를 재시작하세요.`;

    return this.createResponse(resultText);
  }

  /**
   * 응답 객체를 생성합니다.
   */
  private createResponse(text: string): MCPResponse {
    return {
      success: true,
      content: [
        {
          type: 'text',
          text,
        },
      ],
    };
  }

  /**
   * 오류 응답 객체를 생성합니다.
   */
  private createErrorResponse(errorMessage: string): MCPResponse {
    return {
      success: false,
      content: [
        {
          type: 'text',
          text: errorMessage,
        },
      ],
    };
  }

  /**
   * 서버를 시작합니다.
   */
  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`${this.config.name} v${this.config.version}가 시작되었습니다`);
    
    // 정기적으로 캐시 정리
    setInterval(() => {
      if (this.schemaRAG) {
        this.schemaRAG.cleanupCache();
      }
    }, 5 * 60 * 1000); // 5분마다
  }
}

// 서버 시작
const server = new EnhancedRAGServer();
server.run().catch((error) => {
  console.error('서버 시작 실패:', error);
  process.exit(1);
});