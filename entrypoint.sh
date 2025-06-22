#!/bin/sh

# RAG Vector Search Service Entrypoint Script

set -e

echo "🚀 RAG Vector Search Service 시작 중..."
echo "=================================="

# 환경 변수 확인
echo "📋 환경 설정 확인:"
echo "  - MySQL Host: ${DB_HOST:-NOT_SET}"
echo "  - MySQL Database: ${DB_NAME:-NOT_SET}"
echo "  - Qdrant URL: ${QDRANT_URL:-NOT_SET}"
echo "  - Collection: ${COLLECTION_NAME:-NOT_SET}"
echo "  - HF Model: ${HF_MODEL:-NOT_SET}"
echo "  - Node Environment: ${NODE_ENV:-NOT_SET}"

# MySQL 연결 대기
echo ""
echo "⏳ MySQL 연결 대기 중..."
timeout=60
counter=0

# 간단한 MySQL 연결 테스트 (node로)
while [ $counter -lt $timeout ]; do
    if node -e "
        const mysql = require('mysql2/promise');
        const config = {
            host: process.env.DB_HOST,
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            connectTimeout: 5000
        };
        mysql.createConnection(config)
            .then(conn => { conn.end(); console.log('OK'); process.exit(0); })
            .catch(err => { console.log('FAIL'); process.exit(1); });
    " 2>/dev/null; then
        echo "✅ MySQL 연결 성공!"
        break
    fi
    
    counter=$((counter + 1))
    if [ $counter -eq $timeout ]; then
        echo "❌ MySQL 연결 실패 (타임아웃)"
        echo "💡 확인 사항:"
        echo "   - .env 파일의 MySQL 설정이 올바른지 확인"
        echo "   - MySQL 서버가 실행 중인지 확인"
        echo "   - 네트워크 연결이 가능한지 확인"
        exit 1
    fi
    
    echo "   MySQL 연결 시도 중... ($counter/$timeout)"
    sleep 1
done

# Qdrant 연결 대기
echo ""
echo "⏳ Qdrant 연결 대기 중..."
timeout=60
counter=0

while [ $counter -lt $timeout ]; do
    if wget -q --spider "${QDRANT_URL}/health" 2>/dev/null; then
        echo "✅ Qdrant 연결 성공!"
        break
    fi
    
    counter=$((counter + 1))
    if [ $counter -eq $timeout ]; then
        echo "❌ Qdrant 연결 실패 (타임아웃)"
        exit 1
    fi
    
    echo "   Qdrant 연결 시도 중... ($counter/$timeout)"
    sleep 1
done

# 로그 디렉토리 생성
mkdir -p /app/logs

echo ""
echo "🎯 초기화 완료!"
echo "=================================="

# 벡터 DB 자동 구축 옵션 (환경 변수로 제어)
if [ "${AUTO_BUILD_VECTOR_DB:-false}" = "true" ]; then
    echo ""
    echo "🔧 벡터 DB 자동 구축 중..."
    npm run build-db || echo "⚠️  벡터 DB 구축 실패 - 수동으로 실행하세요: docker-compose exec rag-service npm run build-db"
fi

echo ""
echo "🚀 명령어 실행: $@"
echo "=================================="

# 전달받은 명령어 실행
exec "$@"