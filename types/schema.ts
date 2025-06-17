/**
 * Database schema related type definitions
 */

export interface ColumnInfo {
  /** Column name */
  name: string;
  /** Data type (e.g., 'VARCHAR', 'INT', 'DATETIME') */
  dataType: string;
  /** Human-readable description of the column */
  description: string;
  /** Whether the column allows NULL values */
  isNullable: boolean;
  /** Whether this column is a primary key */
  isPrimaryKey: boolean;
  /** Whether this column is a foreign key */
  isForeignKey: boolean;
  /** Reference to the foreign table and column (e.g., 'users.id') */
  foreignKeyReference?: string;
  /** Sample values from the actual data */
  sampleValues: string[];
  /** Column constraints (e.g., 'UNIQUE', 'AUTO_INCREMENT') */
  constraints: string[];
  /** Default value if any */
  defaultValue?: string;
  /** Character maximum length for string types */
  characterMaximumLength?: number;
  /** Numeric precision for decimal types */
  numericPrecision?: number;
  /** Numeric scale for decimal types */
  numericScale?: number;
}

export interface TableRelationship {
  /** Type of relationship */
  relationshipType: 'one-to-one' | 'one-to-many' | 'many-to-many' | 'many-to-one';
  /** Name of the related table */
  relatedTable: string;
  /** Local column name in this table */
  localColumn: string;
  /** Foreign column name in the related table */
  foreignColumn: string;
  /** Descriptive name of the relationship */
  relationshipName: string;
  /** Whether this is the owning side of the relationship */
  isOwner: boolean;
}

export interface TableInfo {
  /** Table name */
  tableName: string;
  /** Schema name (database name) */
  schemaName: string;
  /** Human-readable description of the table */
  description: string;
  /** List of columns in this table */
  columns: ColumnInfo[];
  /** Relationships with other tables */
  relationships: TableRelationship[];
  /** Approximate number of rows */
  rowCount: number;
  /** When the table was last updated */
  lastUpdated: Date;
  /** Business domain this table belongs to */
  businessDomain: string;
  /** Common query patterns for this table */
  commonQueries: Array<{
    description: string;
    frequency: number;
    exampleSql?: string;
  }>;
  /** List of indexed columns */
  indexedColumns: string[];
  /** Partition key if the table is partitioned */
  partitionKey?: string;
  /** Sample data rows (first few rows) */
  sampleData: Array<Array<any>>;
  /** Table engine type (e.g., 'InnoDB', 'MyISAM') */
  engine?: string;
  /** Table collation */
  collation?: string;
  /** Table creation timestamp */
  createTime?: Date;
  /** Table size in bytes */
  dataLength?: number;
  /** Index size in bytes */
  indexLength?: number;
}

export interface SchemaMetadata {
  /** Map of table name to table info */
  tables: { [tableName: string]: TableInfo };
  /** Database name */
  databaseName: string;
  /** Schema extraction timestamp */
  extractedAt: Date;
  /** Database version */
  databaseVersion?: string;
  /** Total number of tables */
  totalTables: number;
  /** Total number of relationships */
  totalRelationships: number;
}

export interface SearchResult {
  /** Table information */
  table: TableInfo;
  /** Similarity score (0-1) */
  score: number;
  /** Matched content snippet */
  matchedContent: string;
  /** Related tables that were automatically included */
  relatedTables?: TableInfo[];
}

export interface QueryOptions {
  /** Maximum number of results to return */
  topK: number;
  /** Whether to include related tables automatically */
  includeRelated: boolean;
  /** Minimum similarity score threshold */
  threshold: number;
  /** Specific business domains to search in */
  domains?: string[];
  /** Specific table names to limit search to */
  tableNames?: string[];
}

export interface CacheEntry<T> {
  /** Cached data */
  data: T;
  /** Cache timestamp */
  timestamp: Date;
  /** Time-to-live in milliseconds */
  ttl: number;
  /** Cache hit count */
  hitCount: number;
}

export interface SchemaCache {
  /** Table info cache */
  tables: Map<string, CacheEntry<TableInfo>>;
  /** Relationship cache */
  relationships: Map<string, CacheEntry<TableRelationship[]>>;
  /** Search results cache */
  searchResults: Map<string, CacheEntry<SearchResult[]>>;
}

export interface EmbeddingConfig {
  /** Embedding model name */
  modelName: string;
  /** Embedding dimension */
  dimension: number;
  /** Chunk size for processing */
  chunkSize: number;
  /** Chunk overlap */
  chunkOverlap: number;
}

export interface VectorStoreConfig {
  /** Vector store type */
  type: 'chroma' | 'pinecone' | 'weaviate' | 'qdrant';
  /** Collection/Index name */
  collectionName: string;
  /** Connection URL */
  url?: string;
  /** API key if required */
  apiKey?: string;
  /** Additional configuration */
  config?: Record<string, any>;
}