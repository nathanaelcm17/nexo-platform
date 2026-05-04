/**
 * Adaptador de almacenamiento S3-compatible.
 * Implementación completa en Fase 1 (final) o Fase 2.
 */
export interface StoragePort {
  put(key: string, data: Buffer, contentType: string): Promise<string>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getSignedUrl(key: string, ttlSec: number): Promise<string>;
}

export class LocalStorageAdapter implements StoragePort {
  constructor(private readonly _basePath: string) {}
  async put(): Promise<string> { throw new Error('Not implemented'); }
  async get(): Promise<Buffer> { throw new Error('Not implemented'); }
  async delete(): Promise<void> { throw new Error('Not implemented'); }
  async getSignedUrl(): Promise<string> { throw new Error('Not implemented'); }
}
