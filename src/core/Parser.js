/**
 * 現場の自由記述・表記揺れを泥臭く吸収・正規化するファジーパーサー
 */
export class Parser {
  /**
   * Google Drive の共有リンクをサムネイル/直リンクURLに変換
   */
  static convertDriveUrl(url, asThumbnail = false) {
    if (!url) return "";
    let id = "";
    if (url.includes("drive.google.com")) {
      const fileDMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (fileDMatch) {
        id = fileDMatch[1];
      } else {
        const openIdMatch = url.match(/[\?&]id=([a-zA-Z0-9_-]+)/);
        if (openIdMatch) {
          id = openIdMatch[1];
        }
      }
    }
    if (id) {
      const size = asThumbnail ? "w1000" : "w2000";
      return `https://drive.google.com/thumbnail?id=${id}&sz=${size}`;
    }
    return url;
  }

  /**
   * 時間文字列 (HH:MM) を 00:00 からの経過分数に変換
   */
  static timeToMinutes(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    const parts = timeStr.trim().split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return h * 60 + m;
  }

  /**
   * 00:00 からの経過分数を "HH:MM" 形式に変換
   */
  static minutesToTime(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  /**
   * 所要時間のファジーパース
   * @param {string|number} rawDuration 
   * @returns {{ durationMin: number, displayDuration: string }}
   */
  static parseDuration(rawDuration, overrideText = '') {
    if (overrideText && String(overrideText).trim()) {
      const match = String(rawDuration).match(/\d+/);
      const min = match ? parseInt(match[0], 10) : 30;
      return { durationMin: min, displayDuration: String(overrideText).trim() };
    }

    const rawStr = String(rawDuration || '').trim();
    if (!rawStr) return { durationMin: 30, displayDuration: '30分' };

    // 数値のみ、あるいは先頭の数値を抽出
    const match = rawStr.match(/\d+/);
    const min = match ? parseInt(match[0], 10) : 30;

    // 表示用テキスト：ユーザーの入力を尊重（「約60分」などの文字があればそのまま）
    const display = rawStr.includes('分') || rawStr.includes('時間') ? rawStr : `${rawStr}分`;
    return { durationMin: min, displayDuration: display };
  }

  /**
   * 難易度のファジーパース
   * @param {string|number} rawDifficulty 
   * @returns {{ isNumeric: boolean, value: number, displayText: string }}
   */
  static parseDifficulty(rawDifficulty) {
    const rawStr = String(rawDifficulty || '').trim();
    if (!rawStr || rawStr === '-' || rawStr === '未定' || rawStr === '非公開') {
      return { isNumeric: false, value: 0, displayText: rawStr || '未定' };
    }

    const num = parseInt(rawStr, 10);
    if (!isNaN(num) && num >= 1 && num <= 10) {
      return { isNumeric: true, value: num, displayText: String(num) };
    }

    // 数値化できない独自難易度（例: "★3", "中級", "激ムズ"）
    return { isNumeric: false, value: 0, displayText: rawStr };
  }

  /**
   * 完売状態のファジー判定
   * 空白以外なら何でも完売とみなす
   */
  static parseSoldOut(rawSoldOut) {
    const str = String(rawSoldOut || '').trim();
    if (!str) return false;
    const lower = str.toLowerCase();
    return lower !== 'false' && lower !== '0' && lower !== 'no' && lower !== '空席あり' && lower !== 'off';
  }

  /**
   * 内容目安・タグの自動分割
   * 区切り文字: 中黒(・)、読点(、)、カンマ(,)、スラッシュ(/)、改行(\n)
   */
  static parseTags(rawText) {
    if (!rawText) return [];
    return String(rawText)
      .split(/[・、,/\n\r]+/)
      .map(t => t.trim())
      .filter(t => t.length > 0 && t !== '-');
  }

  /**
   * 単一の公演オブジェクトの正規化
   */
  static normalizeShow(rawShow, index) {
    const startTimeStr = (rawShow['開始時間(hh:mm)'] || '10:00').trim();
    const startMinutes = this.timeToMinutes(startTimeStr);

    const { durationMin, displayDuration } = this.parseDuration(
      rawShow['所要時間(分)'],
      rawShow['所要時間:優先表示テキスト']
    );

    const endMinutes = startMinutes + durationMin;
    const endTimeStr = rawShow.endTime || this.minutesToTime(endMinutes);

    const difficulty = this.parseDifficulty(rawShow['難易度']);
    const isSoldOut = this.parseSoldOut(rawShow['完売設定'] || rawShow['完売表示']);
    const tags = this.parseTags(rawShow['内容目安']);

    const visualUrl = this.convertDriveUrl(rawShow['公演ビジュアルURL'] || rawShow['ビジュアルURL']);
    const visualThumbnail = this.convertDriveUrl(rawShow['公演ビジュアルURL'] || rawShow['ビジュアルURL'], true);

    return {
      id: rawShow.id || `show-${index + 1}`,
      raw: rawShow, // 元データを保持（後方互換・エスケープ用）
      day: rawShow['日程'] || '1日目',
      groupName: rawShow['団体名'] || rawShow['団体の名称'] || '',
      title: rawShow['公演名'] || rawShow['タイトル'] || '無題の公演',
      room: rawShow['会場(部屋)'] || rawShow['場所(階)'] || '会場',
      startTime: startTimeStr,
      endTime: endTimeStr,
      startMinutes,
      endMinutes,
      durationMin,
      displayDuration,
      capacity: rawShow['定員'] || '',
      reserveUrl: rawShow['予約URL'] || '',
      visualUrl,
      visualThumbnail,
      isSoldOut,
      fee: rawShow['参加料金'] || rawShow['参加費'] || '',
      reserveType: rawShow['予約形式'] || '',
      difficulty,
      tags,
      previewText: rawShow['プレビュー用テキスト'] || '',
      // 特殊演出・イースターエッグ系
      noiseEffect: rawShow['ノイズ演出'] || '',
      password: rawShow['南京錠パスワード'] || rawShow['解除パスワード'] || '',
      finalPhaseTitle: rawShow['最終フェーズ表示名'] || ''
    };
  }

  /**
   * コンフィグの正規化
   */
  static normalizeConfig(rawConfig) {
    const rawDateStr = rawConfig['開催日(YYYYMMDD)'] || rawConfig['開催日'] || '';
    return {
      raw: rawConfig,
      title: rawConfig['イベント名'] || 'タイムテーブル',
      subtitle: rawConfig['サブタイトル'] || '',
      date: String(rawDateStr).replace(/[^a-zA-Z0-9-]/g, ''),
      displayDate: String(rawDateStr).trim(),
      startHour: parseInt((rawConfig['開始時間(hh:mm)'] || '10:00').split(':')[0], 10),
      endHour: parseInt((rawConfig['終了時間(hh:mm)'] || '20:00').split(':')[0], 10),
      headerUrl: rawConfig['ヘッダー画像URL'] || rawConfig['背景画像URL'] || '',
      stepMin: parseInt(rawConfig['タイムテーブルの刻み幅(分)'] || '30', 10),
      logoUrl: rawConfig['ロゴ画像URL'] || './logo.png',
      hashtag: rawConfig['SNSハッシュタグ'] || '#ハッシュタグ',
      shareText: rawConfig['SNSシェアテキスト'] || '',
      allowZeroMinTransfer: String(rawConfig['0分移動可否'] || '').trim() === '0分移動OK',
      allowSoldOutSelect: String(rawConfig['完売公演の選択可否'] || '').trim() === '選択OK',
      isMaintenance: String(rawConfig['非公開モード'] || '').trim() === '非公開モードON',
      maintenanceMessage: rawConfig['非公開モード:準備中メッセージ'] || 'タイムテーブルメンテナンス中…⌛️',
      numDays: parseInt(rawConfig['開催日数'] || '1', 10),
      dayLabels: [
        rawConfig['1日目のラベル'] || rawConfig['1日目日程名称'] || 'Day 1',
        rawConfig['2日目のラベル'] || rawConfig['2日目日程名称'] || 'Day 2',
        rawConfig['3日目のラベル'] || rawConfig['3日目日程名称'] || 'Day 3'
      ],
      mainColor: rawConfig['タイムテーブルメインカラー'] || '#1f2937',
      accentColor: rawConfig['タイムテーブルアクセントカラー'] || '#facc15'
    };
  }
}
