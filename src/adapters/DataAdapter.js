/**
 * データ取得アダプターの基底クラス
 */
export class DataAdapter {
  /**
   * タイムテーブルデータを取得する
   * @returns {Promise<{config: Object, shows: Array, heatmap?: Object, easterEgg?: Object}>}
   */
  async fetchData() {
    throw new Error('fetchData() must be implemented by subclass');
  }
}
