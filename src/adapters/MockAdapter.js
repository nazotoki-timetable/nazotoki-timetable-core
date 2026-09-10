import { DataAdapter } from './DataAdapter.js';

/**
 * ローカルの mock_data.json からデータを取得するアダプター（配布・オフライン用）
 */
export class MockAdapter extends DataAdapter {
  constructor(mockPath = './mock_data.json') {
    super();
    this.mockPath = mockPath;
  }

  async fetchData() {
    const response = await fetch(this.mockPath);
    if (!response.ok) {
      throw new Error(`モックデータ取得エラー: HTTP ${response.status} (${this.mockPath})`);
    }
    return await response.json();
  }
}
