// scripts/huggingface_embeddings.ts

import { pipeline } from '@xenova/transformers';

/**
 * Hugging Face 임베딩 클래스
 * Python의 sentence_transformers와 유사한 인터페이스 제공
 */
export class HuggingFaceEmbeddings {
  private model: any = null;
  private modelName: string;
  private dimension: number;

  constructor(options: {
    modelName?: string;
    dimension?: number;
  } = {}) {
    this.modelName = options.modelName || 'Xenova/all-MiniLM-L6-v2';
    this.dimension = options.dimension || 384;
  }

  /**
   * 모델을 초기화합니다.
   */
  async initialize(): Promise<void> {
    if (!this.model) {
      console.log(`Hugging Face 모델 로딩 중: ${this.modelName}`);
      
      try {
        // feature-extraction 파이프라인 생성
        this.model = await pipeline('feature-extraction', this.modelName, {
          // 로컬 캐시 사용
          local_files_only: false,
        });
        
        console.log(`모델 로딩 완료: ${this.modelName}`);
      } catch (error) {
        console.error('모델 로딩 실패:', error);
        
        // 대체 모델 시도
        console.log('대체 모델 시도: Xenova/all-MiniLM-L6-v2');
        this.model = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        this.modelName = 'Xenova/all-MiniLM-L6-v2';
        this.dimension = 384; // MiniLM 모델의 차원
        
        console.log('대체 모델 로딩 완료');
      }
    }
  }

  /**
   * 단일 문서를 임베딩합니다.
   * @param text 임베딩할 텍스트
   * @returns 임베딩 벡터
   */
  async embedQuery(text: string): Promise<number[]> {
    await this.initialize();
    
    if (!this.model) {
      throw new Error('모델이 초기화되지 않았습니다.');
    }

    try {
      // 임베딩 생성 (pooling과 normalize 옵션 사용)
      const result = await this.model(text, {
        pooling: 'mean',
        normalize: true
      });

      console.log('Raw embedding result:', typeof result, Array.isArray(result), result?.constructor?.name);
      console.log('Result shape:', result?.dims || result?.shape);
      
      // 결과를 1차원 배열로 변환
      let embedding: number[];
      
      if (result && typeof result === 'object' && 'data' in result) {
        // Tensor 객체인 경우 - pooled 결과여야 함
        const tensorData = result.data as Float32Array;
        
        // Tensor 차원 확인
        const dims = result.dims || result.shape;
        console.log('Tensor dimensions:', dims);
        
        if (dims && dims.length === 2 && dims[0] === 1) {
          // [1, 384] 형태인 경우 - 정상적인 pooled embedding
          embedding = Array.from(tensorData.slice(0, dims[1]));
        } else if (dims && dims.length === 1) {
          // [384] 형태인 경우 - 이미 pooled
          embedding = Array.from(tensorData);
        } else {
          // 다차원 tensor인 경우 마지막 384차원만 가져오기
          const embeddingSize = this.dimension;
          const startIdx = Math.max(0, tensorData.length - embeddingSize);
          embedding = Array.from(tensorData.slice(startIdx, startIdx + embeddingSize));
        }
      } else if (Array.isArray(result)) {
        // 배열인 경우
        if (result.length > 0 && Array.isArray(result[0])) {
          // 2차원 배열인 경우 첫 번째 행 사용
          embedding = result[0];
        } else {
          // 1차원 배열인 경우
          embedding = result;
        }
      } else {
        console.error('Unexpected result format:', result);
        throw new Error(`예상치 못한 결과 형식: ${typeof result}`);
      }

      // 차원 검증 및 조정
      if (embedding.length !== this.dimension) {
        console.warn(`임베딩 차원 불일치: 예상 ${this.dimension}, 실제 ${embedding.length}`);
        if (embedding.length > this.dimension) {
          // 차원이 크면 앞부분만 사용
          embedding = embedding.slice(0, this.dimension);
        } else {
          // 차원이 작으면 0으로 패딩
          embedding = [...embedding, ...new Array(this.dimension - embedding.length).fill(0)];
        }
      }

      if (!embedding || embedding.length === 0) {
        throw new Error('임베딩 결과가 비어있습니다.');
      }

      console.log(`임베딩 생성 완료: ${embedding.length}차원`);
      return embedding;
    } catch (error) {
      console.error('임베딩 생성 실패:', error);
      throw error;
    }
  }

  /**
   * 여러 문서를 배치로 임베딩합니다.
   * @param texts 임베딩할 텍스트 배열
   * @returns 임베딩 벡터 배열
   */
  async embedDocuments(texts: string[]): Promise<number[][]> {
    await this.initialize();
    
    if (!this.model) {
      throw new Error('모델이 초기화되지 않았습니다.');
    }

    const embeddings: number[][] = [];
    
    // 배치 크기 설정 (메모리 효율성을 위해)
    const batchSize = 8;
    
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      console.log(`임베딩 생성 중: ${i + 1}-${Math.min(i + batchSize, texts.length)}/${texts.length}`);
      
      // 각 텍스트를 개별적으로 처리
      for (const text of batch) {
        try {
          const embedding = await this.embedQuery(text);
          embeddings.push(embedding);
        } catch (error) {
          console.error(`텍스트 임베딩 실패: "${text.substring(0, 50)}..."`, error);
          // 에러가 발생한 경우 0 벡터 추가
          embeddings.push(new Array(this.dimension).fill(0));
        }
      }
    }

    return embeddings;
  }

  /**
   * 모델 정보를 반환합니다.
   */
  getModelInfo(): {
    modelName: string;
    dimension: number;
    isInitialized: boolean;
  } {
    return {
      modelName: this.modelName,
      dimension: this.dimension,
      isInitialized: this.model !== null
    };
  }

  /**
   * 리소스를 정리합니다.
   */
  async cleanup(): Promise<void> {
    if (this.model) {
      // Transformers.js는 자동으로 정리되므로 특별한 정리 작업이 필요하지 않음
      this.model = null;
      console.log('임베딩 모델 정리 완료');
    }
  }
}