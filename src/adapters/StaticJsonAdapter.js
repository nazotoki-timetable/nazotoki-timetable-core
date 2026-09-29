import { DataAdapter } from './DataAdapter.js';

/**
 * 静的JSONファイル（data.json等）からデータを高速取得するアダプター
 * 初回アクセス時でもGASのコールドスタートを回避し、CDNから0.1秒台でデータを配信します。
 */
export class StaticJsonAdapter extends DataAdapter {
  /**
   * @param {string} jsonPath - 取得対象の静的JSONパス（デフォルト: './data.json'）
   */
  constructor(jsonPath = './data.json') {
    super();
    this.jsonPath = jsonPath;
  }

  async fetchData() {
    // ブラウザキャッシュによる古いデータの取得を防ぐため、タイムスタンプを付与
    const cacheBuster = `?t=${Date.now()}`;
    const url = `${this.jsonPath}${this.jsonPath.includes('?') ? '&' : cacheBuster}`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`静的JSON取得エラー: HTTP ${response.status} (${response.statusText})`);
    }

    const data = await response.json();
    if (!data || (!data.shows && !data.config)) {
      throw new Error('静的JSONのデータフォーマットが不正です。');
    }

    return data;
  }
}
