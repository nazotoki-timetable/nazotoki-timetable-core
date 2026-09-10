import { DataAdapter } from './DataAdapter.js';

/**
 * Escape ID API連携用アダプター（将来のAPI公開時に実装）
 */
export class EscapeIdAdapter extends DataAdapter {
  constructor(apiKey, eventId) {
    super();
    this.apiKey = apiKey;
    this.eventId = eventId;
  }

  async fetchData() {
    // 将来の仕様公開時に接続ロジックを実装
    throw new Error('Escape ID API連携は現在開発中です。');
  }
}
