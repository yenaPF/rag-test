// MCP 서버 - RAG 벡터 DB 검색 도구 제공 (CommonJS 버전)
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const { OllamaEmbeddings } = require('@langchain/community/embeddings/ollama');
const { Chroma } = require('@langchain/community/vectorstores/chroma');
require('dotenv').config();

class RAGServer {
  constructor() {
    this.server = new Server(
      {
        name: 'rag-vector-search',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  setupToolHandlers() {
    // 사용 가능한 도구 목록 제공
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'search_schema',
            description: 'RAG 벡터 DB에서 데이터베이스 스키마 정보를 검색합니다.',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: '검색할 자연어 쿼리 (예: "사용자 정보", "주문 테이블", "상품 데이터")',
                },
                limit: {
                  type: 'number',
                  description: '반환할 결과 개수 (기본값: 3)',
                  default: 3,
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'list_all_tables',
            description: '벡터 DB에 저장된 모든 테이블 정보를 조회합니다.',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
        ],
      };
    });

    // 도구 실행 핸들러
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'search_schema':
            return await this.searchSchema(args.query, args.limit || 3);
          
          case 'list_all_tables':
            return await this.listAllTables();
          
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `오류 발생: ${error.message}`,
            },
          ],
        };
      }
    });
  }

  async searchSchema(query, limit) {
    try {
      console.error(`[RAG] 검색 시작: "${query}", limit: ${limit}`);
      
      // 임베딩 모델 로드
      console.error('[RAG] Ollama 임베딩 모델 로드 중...');
      const embeddings = new OllamaEmbeddings({
        baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        model: process.env.OLLAMA_MODEL || 'nomic-embed-text',
        requestOptions: {
          timeout: 10000, // 10초 타임아웃
        },
      });

      // ChromaDB 연결
      console.error('[RAG] ChromaDB 연결 중...');
      const vectorStore = new Chroma(embeddings, {
        collectionName: 'schema_documents',
      });

      // 유사도 검색 수행
      console.error('[RAG] 벡터 검색 수행 중...');
      const results = await Promise.race([
        vectorStore.similaritySearch(query, limit),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('검색 타임아웃 (30초)')), 30000)
        )
      ]);

      if (results.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `"${query}"에 대한 검색 결과가 없습니다. 벡터 DB가 구축되었는지 확인해주세요.`,
            },
          ],
        };
      }

      // 검색 결과 포맷팅
      let resultText = `🔍 "${query}" 검색 결과 (${results.length}개):\n\n`;
      
      results.forEach((doc, index) => {
        resultText += `${index + 1}. **테이블: ${doc.metadata.tableName}**\n`;
        resultText += `${doc.pageContent}\n`;
        resultText += `${'='.repeat(50)}\n\n`;
      });

      return {
        content: [
          {
            type: 'text',
            text: resultText,
          },
        ],
      };
    } catch (error) {
      throw new Error(`벡터 검색 실패: ${error.message}`);
    }
  }

  async listAllTables() {
    try {
      // 임베딩 모델 로드
      const embeddings = new OllamaEmbeddings({
        baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        model: process.env.OLLAMA_MODEL || 'nomic-embed-text',
      });

      // ChromaDB 연결
      const vectorStore = new Chroma(embeddings, {
        collectionName: 'schema_documents',
      });

      // 모든 테이블 조회 (일반적인 쿼리로 많은 결과 가져오기)
      const results = await vectorStore.similaritySearch('테이블', 50);

      if (results.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: '저장된 테이블 정보가 없습니다. 벡터 DB를 먼저 구축해주세요.',
            },
          ],
        };
      }

      // 테이블 목록 생성
      const tableNames = results.map(doc => doc.metadata.tableName);
      const uniqueTableNames = [...new Set(tableNames)];

      let resultText = `📊 데이터베이스 테이블 목록 (총 ${uniqueTableNames.length}개):\n\n`;
      uniqueTableNames.forEach((tableName, index) => {
        resultText += `${index + 1}. ${tableName}\n`;
      });

      resultText += `\n💡 특정 테이블의 상세 정보를 보려면 'search_schema' 도구를 사용하세요.\n`;
      resultText += `예: search_schema({"query": "users 테이블"})`;

      return {
        content: [
          {
            type: 'text',
            text: resultText,
          },
        ],
      };
    } catch (error) {
      throw new Error(`테이블 목록 조회 실패: ${error.message}`);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('RAG Vector Search MCP Server가 시작되었습니다');
  }
}

// 서버 시작
const server = new RAGServer();
server.run().catch((error) => {
  console.error('서버 시작 실패:', error);
  process.exit(1);
});