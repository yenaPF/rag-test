# Setting

### 1. 환경 설정

이 단계에서는 Node.js 개발을 위한 기본적인 환경을 세팅하고, RAG 벡터 DB 구축에 필요한 핵심 라이브러리들을 설치합니다.

#### 1.1.1 프로젝트 초기화 및 Node.js 환경 설정

먼저 새로운 Node.js 프로젝트 폴더를 만들고 초기화합니다.

```bash
# 새 프로젝트 폴더 생성 및 이동
mkdir my-rag-schema-db
cd my-rag-schema-db

# Node.js 프로젝트 초기화 (package.json 파일 생성)
npm init -y
```

#### 1.1.2 필요한 라이브러리 설치

LangChain.js와 임베딩 모델, 벡터 저장소, 그리고 데이터베이스 연결을 위한 라이브러리들을 설치합니다.

* **LangChain.js 코어 라이브러리:**
    * `@langchain/core`: LangChain의 핵심 컴포넌트들을 제공합니다.
    * `@langchain/community`: LangChain 커뮤니티에서 제공하는 추가적인 통합 기능들 (예: 다양한 임베딩 모델, 벡터 저장소)을 포함합니다.

    ```bash
    npm install @langchain/core @langchain/community
    ```

* **임베딩 모델 라이브러리:**
    * **`@langchain/community`:** 이 패키지 안에 `OllamaEmbeddings`나 `HuggingFaceEmbeddings` 등 다양한 임베딩 모델 통합이 포함되어 있습니다. 별도로 설치할 필요 없이 `@langchain/community` 설치로 충분합니다.
    * **OpenAI Embeddings (선택 사항):** 만약 OpenAI의 임베딩 모델(`text-embedding-ada-002`, `text-embedding-3-small` 등)을 사용하고 싶다면 추가로 `@langchain/openai`를 설치하고 API 키를 설정해야 합니다.

    ```bash
    # OpenAI Embeddings를 사용할 경우 추가 설치
    npm install @langchain/openai
    ```

* **벡터 저장소 라이브러리:**
    * **ChromaDB:** 로컬 파일 시스템에 데이터를 저장할 수 있는 경량 벡터 DB입니다. `chromadb` 패키지를 사용합니다.
    * **FAISS (Node.js용):** FAISS는 주로 Python에서 사용되지만, Node.js 환경에서 FAISS를 직접 사용하는 것은 복잡합니다. 일반적으로 ChromaDB와 같은 순수 JavaScript/TypeScript 기반의 벡터 DB나, FAISS 서버를 별도로 구축하고 API로 연동하는 방식을 고려해야 합니다. 여기서는 **ChromaDB를 기본으로 추천**합니다.

    ```bash
    # ChromaDB 설치 (가장 추천하는 로컬 벡터 DB)
    npm install chromadb
    # LangChain과 ChromaDB 연동을 위한 패키지
    npm install @langchain/community
    pip install chromadb
    ```

* **데이터베이스 연결 라이브러리:**
    * 사용하려는 데이터베이스 종류에 맞춰 설치합니다.
        * **PostgreSQL:** `pg` (Node.js용 PostgreSQL 클라이언트)
        * **MySQL:** `mysql2` (Node.js용 MySQL 클라이언트)
        * **SQLite:** `sqlite3` (Node.js용 SQLite 클라이언트)

    ```bash
    # 예시: PostgreSQL을 사용할 경우
    # npm install pg

    # 예시: MySQL을 사용할 경우
    npm install mysql2

    # 예시: SQLite를 사용할 경우
    # npm install sqlite3
    ```

* **환경 변수 관리 라이브러리:**
    * `.env` 파일에 환경 변수를 저장하고 불러오기 위해 `dotenv`를 설치합니다.

    ```bash
    npm install dotenv
    ```

# RAG 벡터 DB 검색 시스템 개발 프로젝트

## 프로젝트 개요
MySQL 데이터베이스 스키마를 벡터화하여 자연어로 검색할 수 있는 RAG(Retrieval-Augmented Generation) 시스템을 구축하고, Claude Desktop에서 MCP(Model Context Protocol)를 통해 사용할 수 있도록 개발한 프로젝트입니다.

## 시스템 아키텍처

### 데이터 처리 파이프라인
```
MySQL DB → 스키마 추출 → 데이터 준비 → 문서 포맷팅 → 청킹 → 벡터화 → ChromaDB 저장
```

### 검색 시스템
```
사용자 질문 → Claude Desktop → MCP Server → Ollama 임베딩 → ChromaDB 검색 → 결과 반환
```

## 구현된 기능

### 1. 데이터베이스 스키마 벡터화 시스템
- **스키마 추출** (`scripts/schema_extractor.js`): MySQL DB에서 테이블/컬럼 메타데이터 추출
- **데이터 준비** (`scripts/schema_preparer.js`): 샘플 데이터 추가 및 상세 설명 보강
- **문서 포맷팅** (`scripts/schema_formatter.js`): Markdown 형태로 구조화된 문서 생성
- **청킹 처리** (`scripts/chunker.js`): 텍스트 분할 (현재는 테이블 단위로 유지)
- **벡터화 및 저장** (`scripts/build_vector_db.js`): Ollama 임베딩으로 ChromaDB에 저장

### 2. 벡터 검색 시스템
- **검색 스크립트** (`scripts/query_vector_db.js`): 자연어 쿼리로 벡터 DB 검색
- **전체 조회** (`scripts/list_all_documents.js`): 저장된 모든 문서 조회

### 3. MCP 서버 구현
- **MCP 서버** (`mcp-server.js`): Claude Desktop과 연동하는 MCP 서버
- **도구 제공**: `search_schema`, `list_all_tables` 기능
- **Claude Desktop 통합**: 설정 파일을 통한 연동

## 기술 스택

### 핵심 라이브러리
- **LangChain**: 문서 처리 및 텍스트 분할 (`@langchain/community`, `@langchain/core`)
- **ChromaDB**: 벡터 저장소 (`chromadb`)
- **Ollama**: 로컬 임베딩 모델 (`nomic-embed-text`)
- **MySQL**: 원본 데이터베이스 (`mysql2`)
- **MCP SDK**: Claude Desktop 연동 (`@modelcontextprotocol/sdk`)

### 환경 설정
```bash
# 주요 의존성
npm install @langchain/community @langchain/core @modelcontextprotocol/sdk chromadb mysql2 dotenv langchain
```

## 프로젝트 구조
```
rag-test/
├── scripts/
│   ├── build_vector_db.js      # 벡터 DB 구축 메인 스크립트
│   ├── schema_extractor.js     # MySQL 스키마 메타데이터 추출
│   ├── schema_preparer.js      # 샘플 데이터 및 상세 설명 추가
│   ├── schema_formatter.js     # Markdown 문서 포맷팅
│   ├── chunker.js             # 텍스트 청킹 (현재 비활성화)
│   ├── query_vector_db.js     # 벡터 검색 테스트
│   └── list_all_documents.js  # 전체 문서 조회
├── mcp-server.js              # Claude Desktop용 MCP 서버
├── mcp-server-simple.js       # 테스트용 간단한 MCP 서버
├── .env                       # 환경 변수 설정
├── package.json
└── README.md
```

## 사용 방법

### 1. 환경 설정
```bash
# .env 파일 설정
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=rootpassword
DB_NAME=shopping_mall
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=Llama3.2
```

### 2. 벡터 DB 구축
```bash
chroma run --host localhost --port 8000 (chromadb 실행 시)
npm run build-db
```

### 3. 검색 테스트
```bash
node scripts/query_vector_db.js "사용자 정보가 들어있는 테이블"
node scripts/list_all_documents.js
```

### 4. Claude Desktop 연동
Claude Desktop 설정 파일 (`~/Library/Application Support/Claude/claude_desktop_config.json`)에 추가:
```json
{
  "mcpServers": {
    "rag-vector-search": {
      "command": "/Users/pyn/.nvm/versions/node/v20.18.0/bin/node",
      "args": ["/Users/pyn/Documents/GitHub/rag-test/mcp-server.js"],
      "env": {
        "NODE_PATH": "/Users/pyn/Documents/GitHub/rag-test/node_modules",
        "PATH": "/Users/pyn/.nvm/versions/node/v20.18.0/bin:/usr/bin:/bin"
      }
    }
  }
}
```

## 테스트 결과

### 성공 사항
- ✅ MySQL 스키마 추출 및 벡터화 완료
- ✅ ChromaDB에 스키마 정보 저장 성공
- ✅ 자연어 검색 기능 동작 확인
- ✅ 벡터 검색 결과 반환 확인

### 벡터 검색 결과 예시
```
🔍 "상품" 검색 결과 (3개):

1. 테이블: coupons
2. 테이블: products  ← 원하는 결과
3. 테이블: categories
```

## 발견된 문제점

### 1. 임베딩 모델 품질 이슈
**문제**: Ollama 로컬 임베딩 모델(`llama3.2`)의 한국어 성능 한계
- "아이폰" 검색 시 `products` 테이블이 최상위 결과로 나오지 않음
- 한국어 ↔ 영어 연관성 인식 부족 ("아이폰" vs "iPhone")
- 의미적 유사도 계산 정확도 낮음

**영향**: 
- 검색 정확도 저하
- 사용자가 원하는 정보를 찾기 어려움
- RAG 시스템의 전체적인 품질 저하

### 2. MCP 서버 성능 이슈
**문제**: Claude Desktop에서 쿼리 시 응답 시간이 매우 긴 현상
- Ollama 서버 연결 지연
- ChromaDB 접근 시간 문제
- 네트워크 타임아웃 이슈

**시도한 해결책**:
- 타임아웃 설정 추가 (10초, 30초)
- 로깅 추가로 병목 지점 파악
- 간단한 테스트 서버 구현

### 3. 스키마 설명 품질 부족
**문제**: 자동 생성된 스키마 설명이 일반적이고 구체성 부족
```javascript
// 현재: "Column for user_id"
// 필요: "사용자의 고유 식별자, 로그인 시 사용되는 기본키"
```

**영향**: 벡터화 시 의미적 정보 부족으로 검색 품질 저하

### 4. RAG 시스템의 근본적 한계
**핵심 문제**: MCP를 통한 RAG 접근 방식의 구조적 한계
```
사용자 질문 → Claude → MCP → 임베딩 모델 → 검색 → Claude
```

**한계점**:
- 임베딩 모델의 품질이 전체 시스템 성능을 결정
- Claude의 뛰어난 언어 이해 능력이 검색 단계에서 활용되지 않음
- 중간 단계가 많아 오류 전파 가능성 증가

## 개선 방안

### 1. 임베딩 모델 교체
**OpenAI 임베딩 API 사용**
```bash
npm install @langchain/openai
```
- `text-embedding-3-small` 모델 활용
- 다국어 지원 우수
- 의미적 연관성 정확도 향상

### 2. 하이브리드 검색 구현
**키워드 검색 + 벡터 검색 조합**
- 정확한 테이블명/컬럼명: 키워드 매칭
- 의미적 연관성: 벡터 검색
- 두 결과를 점수 기반으로 조합

### 3. 스키마 설명 개선
- 도메인 특화 설명 추가
- 비즈니스 컨텍스트 포함
- 사용 예시 및 관계 설명 강화

### 4. 대안 접근법 고려
**직접 DB 연결 방식**
- 기존 MySQL MCP 서버 활용
- SQL 생성 및 실행으로 정확한 결과 보장
- RAG 중간 단계 제거

## 결론 및 향후 방향

### 학습 내용
1. **RAG 시스템 구축 전 과정** 경험
2. **MCP 프로토콜** 이해 및 Claude Desktop 연동
3. **벡터 DB 활용** 실무 경험
4. **임베딩 모델의 중요성** 체감

### 핵심 발견
- **임베딩 모델 품질이 RAG 성능의 핵심**
- **로컬 모델의 한계와 클라우드 API의 필요성**
- **단순한 접근법이 때로는 더 효과적일 수 있음**

### 권장 사항
현재 프로젝트에서는:
1. **OpenAI 임베딩으로 교체** (즉시 개선 효과, 하지만 유료)
2. **기존 MySQL MCP 서버와 비교 분석**
3. **실제 업무에서는 직접 DB 연결 방식 우선 고려**
