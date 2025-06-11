// scripts/db_client.js

// 환경 변수 로드 (1단계에서 설치한 dotenv 라이브러리 사용)
require('dotenv').config();

// MySQL 클라이언트 임포트
const mysql = require('mysql2/promise'); // 프로미스 기반 API를 사용

/**
 * 데이터베이스 풀(Pool) 인스턴스를 생성합니다.
 * 연결 풀은 여러 요청을 효율적으로 처리하는 데 유용합니다.
 * @returns {mysql.Pool} 연결 풀 객체
 */
let pool; // 전역 스코프에 풀 변수 선언

async function getDbPool() {
    if (!pool) {
        console.log('MySQL 데이터베이스 풀 생성 시도...');
        pool = mysql.createPool({
            host: process.env.DB_HOST,
            port: parseInt(process.env.DB_PORT, 10),
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            waitForConnections: true, // 풀에 연결이 없을 때 기다릴지 여부
            connectionLimit: 10,      // 최대 동시 연결 수
            queueLimit: 0             // 연결 풀 대기열의 최대 요청 수 (0은 무제한)
        });

        try {
            // 풀 연결 테스트
            const connection = await pool.getConnection();
            connection.release(); // 연결 반환
            console.log('MySQL 데이터베이스 연결 풀 성공적으로 생성 및 테스트 완료!');
        } catch (error) {
            console.error('MySQL 데이터베이스 연결 풀 생성 실패:', error.message);
            throw error;
        }
    }
    return pool;
}

/**
 * 데이터베이스 풀을 종료합니다.
 */
async function closeDbPool() {
    if (pool) {
        await pool.end();
        console.log('MySQL 데이터베이스 연결 풀 종료.');
        pool = null; // 풀 객체 초기화
    }
}

module.exports = { getDbPool, closeDbPool };