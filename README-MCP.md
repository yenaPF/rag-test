# RAG Vector Search MCP Server

이 프로젝트는 벡터 데이터베이스를 활용한 고도화된 RAG(Retrieval-Augmented Generation) 시스템을 MCP(Model Context Protocol) 서버로 제공합니다.

## 주요 기능

### 🔍 스키마 검색 (`search_schema`)
- 자연어 쿼리로 데이터베이스 스키마 정보 검색
- 관련 테이블 자동 포함
- 고급 필터링 (도메인, 테이블명)
- 캐싱을 통한 성능 최적화

### 📊 테이블 목록 조회 (`list_all_tables`)
- 전체 테이블 정보 조회
- 비즈니스 도메인별 그룹화
- 통계 정보 포함

### 🔗 관계 정보 조회 (`get_table_relationships`)
- 특정 테이블의 관계 정보 상세 조회
- 다단계 관계 탐색
- 외래키 및 참조 관계 분석

### 📈 캐시 통계 (`get_cache_stats`)
- 시스템 성능 및 캐시 상태 모니터링

## 설치 및 설정

### 1. 의존성 설치
```bash
npm install
```

### 2. 환경 변수 설정
`.env` 파일을 생성하고 다음 설정을 추가하세요:

```bash
cp .env.example .env
# .env 파일을 편집하여 데이터베이스 정보를 입력
```

### 3. Qdrant 벡터 데이터베이스 실행
```bash
docker run -p 6333:6333 -p 6334:6334 qdrant/qdrant
```

### 4. 벡터 DB 구축
```bash
npm run build-db-ts
```

### 5. MCP 서버 실행
```bash
npm run mcp-server-ts
```

## Claude Desktop 설정

1. Claude Desktop 설정 파일을 열어주세요:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%/Claude/claude_desktop_config.json`

2. 다음 설정을 추가하세요:
```json
{
  "mcpServers": {
    "enhanced-rag-vector-search": {
      "command": "node",
      "args": ["/path/to/your/project/mcp-server.js"],
      "env": {
        "QDRANT_URL": "http://localhost:6333",
        "COLLECTION_NAME": "schema_documents",
        "HF_MODEL": "jhgan/ko-sroberta-multitask",
        "EMBEDDING_DIMENSION": "768",
        "MCP_TIMEOUT": "60000"
      }
    }
  }
}
```

3. 경로를 실제 프로젝트 경로로 수정하세요.

4. Claude Desktop을 재시작하세요.

## 사용 예시

### 스키마 검색
```
"사용자 정보를 담고 있는 테이블을 찾아주세요"
"주문과 관련된 테이블들을 보여주세요"
"상품 카테고리 데이터는 어디에 저장되나요?"
```

### 테이블 목록 조회
```
"데이터베이스에 있는 모든 테이블을 도메인별로 보여주세요"
"테이블 통계 정보를 포함해서 전체 테이블 목록을 알려주세요"
```

### 관계 정보 조회
```
"users 테이블과 관련된 모든 테이블들을 2단계까지 찾아주세요"
"orders 테이블의 외래키 관계를 분석해주세요"
```

## 기술 스택

- **Vector Database**: Qdrant
- **Embedding Model**: Hugging Face (한국어 지원)
- **MCP SDK**: @modelcontextprotocol/sdk
- **Language**: TypeScript
- **Runtime**: Node.js

## 트러블슈팅

### Qdrant 연결 오류
```
Error: connection refused
```
→ Qdrant 서버가 실행 중인지 확인하세요 (`docker ps`)

### 컬렉션 없음 오류
```
Collection not found
```
→ 벡터 DB를 먼저 구축하세요 (`npm run build-db-ts`)

### 임베딩 모델 로딩 오류
→ 네트워크 연결을 확인하고 `.env` 파일의 `HF_MODEL` 설정을 확인하세요

## 지원

문제가 발생하거나 기능 요청이 있으시면 이슈를 등록해주세요.