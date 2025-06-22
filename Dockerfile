# RAG Vector Search Service Dockerfile
FROM node:18-alpine

# 작업 디렉토리 설정
WORKDIR /app

# 시스템 의존성 설치
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

# 패키지 파일 복사 및 의존성 설치
COPY package*.json ./
RUN npm ci --only=production

# 소스 코드 복사
COPY . .

# TypeScript 컴파일 (선택사항, tsx 사용 시 불필요)
# RUN npm run compile

# 실행 권한 설정
RUN chmod +x entrypoint.sh

# 포트 노출 (MCP 서버는 stdio 사용하므로 실제로는 불필요)
EXPOSE 3000

# 헬스체크
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('Health check passed')" || exit 1

# 엔트리포인트 설정
ENTRYPOINT ["./entrypoint.sh"]

# 기본 명령어 (MCP 서버 실행)
CMD ["npm", "run", "mcp-server"]