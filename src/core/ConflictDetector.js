/**
 * 公演のバッティング（時間重複・0分移動）判定ロジック
 */
export class ConflictDetector {
  /**
   * 2つの公演が時間重複しているかを判定
   * @param {Object} show1 
   * @param {Object} show2 
   * @param {boolean} allowZeroMinTransfer 
   * @returns {boolean}
   */
  static isOverlapping(show1, show2, allowZeroMinTransfer) {
    if (!show1 || !show2) return false;
    // 日程が異なる場合は重複しない
    if (show1.day !== show2.day) return false;

    // 時間自由・随時受付は除外
    if (show1.reserveType === '当日受付(ファミレス式)' || show1.reserveType === '事前予約(時間自由)' ||
        show2.reserveType === '当日受付(ファミレス式)' || show2.reserveType === '事前予約(時間自由)') {
      return false;
    }

    const s1 = show1.startMinutes;
    const e1 = show1.endMinutes;
    const s2 = show2.startMinutes;
    const e2 = show2.endMinutes;

    if (allowZeroMinTransfer) {
      // 0分移動可：完全な時間重複のみNG（端点一致 s1 === e2 はOK）
      return (s1 < e2 && e1 > s2) || (s2 < e1 && e2 > s1);
    } else {
      // 0分移動不可：端点一致（終了と同時に開始）もNG
      return (s1 <= e2 && e1 >= s2) || (s2 <= e1 && e2 >= s1);
    }
  }

  /**
   * 選択された全公演の中から、重複している公演IDのSetを返す
   * @param {Array<string>} selectedIds 
   * @param {Map<string, Object>} showsMap 
   * @param {boolean} allowZeroMinTransfer 
   * @returns {{ conflictIds: Set<string>, hasConflict: boolean }}
   */
  static findConflicts(selectedIds, showsMap, allowZeroMinTransfer) {
    const conflictIds = new Set();

    for (let i = 0; i < selectedIds.length; i++) {
      const id1 = selectedIds[i];
      const s1 = showsMap.get(id1);
      if (!s1) continue;

      for (let j = i + 1; j < selectedIds.length; j++) {
        const id2 = selectedIds[j];
        const s2 = showsMap.get(id2);
        if (!s2) continue;

        if (this.isOverlapping(s1, s2, allowZeroMinTransfer)) {
          conflictIds.add(id1);
          conflictIds.add(id2);
        }
      }
    }

    return {
      conflictIds,
      hasConflict: conflictIds.size > 0
    };
  }
}
