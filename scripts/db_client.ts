// scripts/db_client.ts

import { config } from 'dotenv';
import { createPool, Pool } from 'mysql2/promise';
import { DatabaseConfig } from '../types';

// 환경 변수 로드
config();

/**
 * 데이터베이스 풀(Pool) 인스턴스를 관리하는 클래스
 */
class DatabaseClient {
  private static instance: DatabaseClient;
  private pool: Pool | null = null;

  private constructor() {}

  /**
   * 싱글톤 인스턴스 반환
   */
  public static getInstance(): DatabaseClient {
    if (!DatabaseClient.instance) {
      DatabaseClient.instance = new DatabaseClient();
    }
    return DatabaseClient.instance;
  }

  /**
   * 환경 변수에서 데이터베이스 설정을 읽어옵니다.
   */
  private getDatabaseConfig(): DatabaseConfig {
    const requiredEnvVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    return {
      host: process.env.DB_HOST!,
      port: parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER!,
      password: process.env.DB_PASSWORD!,
      database: process.env.DB_NAME!,
      connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10),
      acquireTimeout: parseInt(process.env.DB_ACQUIRE_TIMEOUT || '60000', 10),
      timeout: parseInt(process.env.DB_TIMEOUT || '60000', 10)
    };
  }

  /**
   * 데이터베이스 풀을 생성하고 반환합니다.
   * @returns Promise<Pool> MySQL 연결 풀
   */
  public async getPool(): Promise<Pool> {
    if (!this.pool) {
      console.log('MySQL 데이터베이스 풀 생성 시도...');
      
      const config = this.getDatabaseConfig();
      
      this.pool = createPool({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        waitForConnections: true,
        connectionLimit: config.connectionLimit,
        queueLimit: 0,
        // 추가 보안 및 성능 설정
        ssl: process.env.DB_SSL === 'true' ? {
          rejectUnauthorized: false
        } : undefined,
        dateStrings: true, // 날짜를 문자열로 반환
        supportBigNumbers: true,
        bigNumberStrings: true,
        charset: 'utf8mb4'
      });

      try {
        // 풀 연결 테스트
        const connection = await this.pool.getConnection();
        await connection.ping(); // 연결 상태 확인
        connection.release();
        console.log('MySQL 데이터베이스 연결 풀 성공적으로 생성 및 테스트 완료!');
      } catch (error) {
        console.error('MySQL 데이터베이스 연결 풀 생성 실패:', error);
        if (this.pool) {
          await this.pool.end();
          this.pool = null;
        }
        throw error;
      }
    }
    
    return this.pool;
  }

  /**
   * 데이터베이스 풀을 종료합니다.
   */
  public async closePool(): Promise<void> {
    if (this.pool) {
      try {
        await this.pool.end();
        console.log('MySQL 데이터베이스 연결 풀 종료.');
      } catch (error) {
        console.error('MySQL 데이터베이스 연결 풀 종료 중 오류:', error);
      } finally {
        this.pool = null;
      }
    }
  }

  /**
   * 연결 풀의 상태 정보를 반환합니다.
   */
  public getPoolStatus(): {
    isConnected: boolean;
    acquiredConnections?: number;
    allConnections?: number;
    freeConnections?: number;
    queuedRequests?: number;
  } {
    if (!this.pool) {
      return { isConnected: false };
    }

    // MySQL2 풀 상태 정보는 private 프로퍼티이므로 타입 단언 사용
    const poolInternal = this.pool as any;
    
    return {
      isConnected: true,
      acquiredConnections: poolInternal._acquiredConnections?.length || 0,
      allConnections: poolInternal._allConnections?.length || 0,
      freeConnections: poolInternal._freeConnections?.length || 0,
      queuedRequests: poolInternal._connectionQueue?.length || 0
    };
  }

  /**
   * 데이터베이스 연결을 확인합니다.
   */
  public async testConnection(): Promise<boolean> {
    try {
      const pool = await this.getPool();
      const connection = await pool.getConnection();
      await connection.ping();
      connection.release();
      return true;
    } catch (error) {
      console.error('데이터베이스 연결 테스트 실패:', error);
      return false;
    }
  }
}

// 편의 함수들 (기존 코드와의 호환성을 위해)
const dbClient = DatabaseClient.getInstance();

/**
 * 데이터베이스 풀을 반환합니다.
 * @returns Promise<Pool> MySQL 연결 풀
 */
export async function getDbPool(): Promise<Pool> {
  return await dbClient.getPool();
}

/**
 * 데이터베이스 풀을 종료합니다.
 */
export async function closeDbPool(): Promise<void> {
  await dbClient.closePool();
}

/**
 * 데이터베이스 연결을 테스트합니다.
 */
export async function testDbConnection(): Promise<boolean> {
  return await dbClient.testConnection();
}

/**
 * 데이터베이스 풀 상태를 반환합니다.
 */
export function getDbPoolStatus() {
  return dbClient.getPoolStatus();
}

// 기본 내보내기
export default DatabaseClient;