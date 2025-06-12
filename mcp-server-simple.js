#!/usr/bin/env node

// 간단한 MCP 서버 - 벡터 DB 없이 테스트용
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

class SimpleRAGServer {
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
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'search_schema',
            description: '데이터베이스 스키마 정보를 검색합니다 (테스트 버전)',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: '검색할 쿼리',
                },
              },
              required: ['query'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      console.error(`[Simple RAG] 요청 받음: ${name}, 쿼리: ${args.query}`);

      try {
        if (name === 'search_schema') {
          // 하드코딩된 응답 (벡터 DB 없이)
          return {
            content: [
              {
                type: 'text',
                text: `🔍 "${args.query}" 검색 결과 (테스트 모드):\n\n1. **테이블: users**\n- user_id (PK)\n- email\n- name\n- created_at\n\n2. **테이블: products**\n- product_id (PK)\n- name\n- price\n- category_id\n\n이것은 테스트 응답입니다.`,
              },
            ],
          };
        }
      } catch (error) {
        console.error(`[Simple RAG] 오류: ${error.message}`);
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

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Simple RAG Vector Search MCP Server가 시작되었습니다');
  }
}

const server = new SimpleRAGServer();
server.run().catch((error) => {
  console.error('서버 시작 실패:', error);
  process.exit(1);
});