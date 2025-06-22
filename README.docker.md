# 🐳 RAG Vector Search Docker Guide

Docker Compose를 사용하여 RAG Vector Search 시스템을 쉽게 실행할 수 있습니다.

## 📋 구성 요소

- **RAG Service**: Node.js + TypeScript로 구현된 RAG 검색 서비스
- **Qdrant**: 벡터 데이터베이스 (컨테이너)
- **MySQL**: 외부 MySQL 데이터베이스 (별도 설치 필요)

## 🚀 빠른 시작

### 1. 환경 설정

```bash
# 환경 변수 파일 복사
cp .env.docker .env

# .env 파일 편집 (MySQL 정보 입력)
vim .env  # 또는 원하는 에디터 사용
```

**필수 설정 항목:**
```bash
DB_HOST=your_mysql_host        # MySQL 서버 주소
DB_USER=your_mysql_user        # MySQL 사용자명  
DB_PASSWORD=your_password      # MySQL 비밀번호
DB_NAME=your_database         # 데이터베이스 이름
```

### 2. 서비스 실행

```bash
# 백그라운드에서 서비스 실행
docker-compose up -d

# 로그 확인
docker-compose logs -f rag-service
```

### 3. 벡터 DB 구축

```bash
# 벡터 데이터베이스 구축 (한 번만 실행)
docker-compose exec rag-service npm run build-db
```

### 4. 테스트 실행

```bash
# 벡터 검색 테스트
docker-compose exec rag-service npm run query-db
```

## 🔧 상세 사용법

### 컨테이너 관리

```bash
# 서비스 시작
docker-compose up -d

# 서비스 중지
docker-compose stop

# 서비스 완전 제거 (데이터 보존)
docker-compose down

# 서비스 + 볼륨 완전 제거 (데이터 삭제)
docker-compose down -v

# 로그 확인
docker-compose logs rag-service
docker-compose logs qdrant

# 컨테이너 상태 확인
docker-compose ps
```

### 벡터 DB 관리

```bash
# 벡터 DB 구축
docker-compose exec rag-service npm run build-db

# 벡터 검색 테스트
docker-compose exec rag-service npm run query-db

# MCP 서버 실행 (Claude Desktop 연동용)
docker-compose exec rag-service npm run mcp-server
```

### 데이터 관리

```bash
# Qdrant 데이터 백업
docker-compose exec qdrant tar -czf /tmp/qdrant-backup.tar.gz /qdrant/storage
docker cp rag-qdrant:/tmp/qdrant-backup.tar.gz ./qdrant-backup.tar.gz

# Qdrant 데이터 복원
docker cp ./qdrant-backup.tar.gz rag-qdrant:/tmp/
docker-compose exec qdrant tar -xzf /tmp/qdrant-backup.tar.gz -C /
```

## 🔗 Claude Desktop 연동

### 1. MCP 서버 실행 모드

```bash
# MCP 서버를 별도 터미널에서 실행
docker-compose run --rm rag-service npm run mcp-server
```

### 2. Claude Desktop 설정

`claude_desktop_config.json`에 추가:

```json
{
  "mcpServers": {
    "rag-vector-search": {
      "command": "docker-compose",
      "args": [
        "-f", "/path/to/your/project/docker-compose.yml",
        "run", "--rm", "rag-service", "npm", "run", "mcp-server"
      ],
      "cwd": "/path/to/your/project"
    }
  }
}
```

## 🛠️ 트러블슈팅

### MySQL 연결 오류

```
❌ MySQL 연결 실패 (타임아웃)
```

**해결 방법:**
1. `.env` 파일의 MySQL 설정 확인
2. MySQL 서버가 실행 중인지 확인
3. 방화벽 설정 확인
4. Docker에서 호스트 접근: `DB_HOST=host.docker.internal` (Windows/Mac)

### Qdrant 연결 오류

```bash
# Qdrant 컨테이너 상태 확인
docker-compose ps qdrant

# Qdrant 로그 확인
docker-compose logs qdrant

# Qdrant 재시작
docker-compose restart qdrant
```

### 벡터 DB 구축 실패

```bash
# 상세 로그와 함께 다시 실행
docker-compose exec rag-service npm run build-db

# MySQL 스키마 확인
docker-compose exec rag-service node -e "
const { extractSchemaMetadata } = require('./scripts/schema_extractor.js');
extractSchemaMetadata().then(console.log).catch(console.error);
"
```

### 메모리 부족

```bash
# Docker 메모리 설정 확인
docker system info | grep Memory

# 불필요한 컨테이너/이미지 정리
docker system prune -a
```

## 📊 모니터링

### 서비스 상태 확인

```bash
# 전체 서비스 상태
docker-compose ps

# 리소스 사용량
docker stats

# Qdrant 상태
curl http://localhost:6333/health
```

### 로그 관리

```bash
# 실시간 로그 확인
docker-compose logs -f

# 로그 크기 제한
docker-compose logs --tail=100 rag-service

# 특정 시간 이후 로그
docker-compose logs --since="2024-01-01T00:00:00" rag-service
```

## 🚧 고급 설정

### 환경 변수 커스터마이징

```bash
# 자동 벡터 DB 구축 활성화
AUTO_BUILD_VECTOR_DB=true docker-compose up -d

# 다른 HuggingFace 모델 사용
HF_MODEL=sentence-transformers/all-MiniLM-L6-v2 docker-compose up -d

# Qdrant API 키 설정
QDRANT_API_KEY=your-api-key docker-compose up -d
```

### 포트 변경

```yaml
# docker-compose.yml에서 포트 수정
services:
  qdrant:
    ports:
      - "7333:6333"  # 로컬 포트 7333으로 변경
      - "7334:6334"
```

### 외부 Qdrant 사용

```bash
# 외부 Qdrant 서버 사용 시
QDRANT_URL=http://your-qdrant-server:6333 docker-compose up -d
```

## 💡 팁과 권장사항

1. **처음 실행 시**: 벡터 DB 구축에 시간이 걸릴 수 있습니다 (DB 크기에 따라)
2. **데이터 백업**: 정기적으로 Qdrant 데이터를 백업하세요
3. **로그 모니터링**: 프로덕션 환경에서는 로그 수집 시스템 구성 권장
4. **리소스 모니터링**: CPU/메모리 사용량을 정기적으로 확인하세요
5. **보안**: 프로덕션 환경에서는 API 키와 비밀번호를 적절히 관리하세요

## 📞 지원

문제가 발생하거나 기능 요청이 있으시면 이슈를 등록해주세요.