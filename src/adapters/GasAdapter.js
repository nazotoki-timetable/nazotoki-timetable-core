import { DataAdapter } from './DataAdapter.js';

/**
 * Google Apps Script (GAS) API経由でスプレッドシートデータを取得するアダプター
 */
export class GasAdapter extends DataAdapter {
  constructor(apiUrl) {
    super();
    this.apiUrl = apiUrl;
  }

  async fetchData() {
    if (!this.apiUrl) {
      throw new Error('API_URL が設定されていません。');
    }
    const response = await fetch(this.apiUrl);
    if (!response.ok) {
      throw new Error(`GAS API 通信エラー: HTTP ${response.status}`);
    }
    const data = await response.json();
    if (data.error) {
      throw new Error(`データ取得エラー: ${data.error}`);
    }
    return data;
  }
}
