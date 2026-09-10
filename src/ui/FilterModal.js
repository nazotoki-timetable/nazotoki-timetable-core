/**
 * 公演フィルターモーダル（難易度ピッカー＆機会均等タグ検索）
 */
export class FilterModal {
  constructor(onApplyCallback) {
    this.onApplyCallback = onApplyCallback;
    this.shows = [];
    this.activeDay = '1日目';
    this.filterTargetDiff = 'ALL';
    this.filterDiffOp = 'GTE';
    this.currentDiffStepVal = 3;
    this.selectedFilterTags = new Set();
    this.allExtractedTags = [];
    this.currentTagRotationOffset = 0;

    this.initEventListeners();
  }

  setContext(shows, activeDay) {
    this.shows = shows;
    this.activeDay = activeDay;
  }

  gcd(a, b) {
    while (b !== 0) {
      let t = b;
      b = a % b;
      a = t;
    }
    return a;
  }

  extractUniqueTags() {
    const tagSet = new Set();
    this.shows.forEach(s => {
      const tags = s.tags && s.tags.length > 0 ? s.tags :
        String(s['内容目安'] || '').split(/[\r\n、,，/／・]+/).map(t => t.trim()).filter(t => t && t !== '特になし' && t !== 'なし');
      tags.forEach(t => tagSet.add(t));
    });
    this.allExtractedTags = Array.from(tagSet).sort((a, b) => a.localeCompare(b, 'ja'));
  }

  getEvenlyDistributedTags() {
    const total = this.allExtractedTags.length;
    if (total <= 1) return [...this.allExtractedTags];

    let step = Math.floor(total * 0.6180339887) || 1;
    if (step <= 0) step = 1;
    while (this.gcd(step, total) !== 1) {
      step = (step + 1) % total || 1;
    }

    this.currentTagRotationOffset = (this.currentTagRotationOffset + step) % total;
    const result = [];
    for (let i = 0; i < total; i++) {
      const idx = (this.currentTagRotationOffset + i * step) % total;
      result.push(this.allExtractedTags[idx]);
    }
    return result;
  }

  open() {
    this.extractUniqueTags();
    this.renderFilterTagsEvenly();
    this.updateDiffUI();
    this.updateMatchCountPreview();
    const modal = document.getElementById('filter-modal');
    if (modal) modal.classList.remove('hidden');
  }

  close() {
    this.closeDiffPicker();
    const modal = document.getElementById('filter-modal');
    if (modal) modal.classList.add('hidden');
  }

  renderFilterTagsEvenly() {
    const container = document.getElementById('filter-tags-container');
    if (!container) return;
    container.innerHTML = '';

    const tagsToDisplay = this.getEvenlyDistributedTags();
    tagsToDisplay.forEach(tag => {
      const isSelected = this.selectedFilterTags.has(tag);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = isSelected
        ? 'px-2.5 py-1 rounded text-[11px] font-black bg-[#9333ea] text-white border border-[#9333ea] shadow-sm cursor-pointer transition-all'
        : 'px-2.5 py-1 rounded text-[11px] font-black bg-white text-[#16131e] border border-[#dcd5e7] hover:border-[#16131e] shadow-sm cursor-pointer transition-all';
      btn.innerText = '・' + tag;
      btn.onclick = () => {
        if (this.selectedFilterTags.has(tag)) {
          this.selectedFilterTags.delete(tag);
        } else {
          this.selectedFilterTags.add(tag);
        }
        this.updateTagButtonStyles();
        this.updateMatchCountPreview();
      };
      btn.setAttribute('data-tag', tag);
      container.appendChild(btn);
    });
  }

  updateTagButtonStyles() {
    const btns = document.querySelectorAll('#filter-tags-container button');
    btns.forEach(btn => {
      const tag = btn.getAttribute('data-tag');
      const isSelected = this.selectedFilterTags.has(tag);
      btn.className = isSelected
        ? 'px-2.5 py-1 rounded text-[11px] font-black bg-[#9333ea] text-white border border-[#9333ea] shadow-sm cursor-pointer transition-all'
        : 'px-2.5 py-1 rounded text-[11px] font-black bg-white text-[#16131e] border border-[#dcd5e7] hover:border-[#16131e] shadow-sm cursor-pointer transition-all';
    });
  }

  toggleDiffPicker(event) {
    if (event) event.stopPropagation();
    const popup = document.getElementById('diff-picker-popup');
    if (popup) popup.classList.toggle('hidden');
  }

  closeDiffPicker() {
    const popup = document.getElementById('diff-picker-popup');
    if (popup) popup.classList.add('hidden');
  }

  pickDifficulty(num) {
    this.closeDiffPicker();
    this.currentDiffStepVal = num;
    this.filterTargetDiff = String(num);
    this.updateDiffUI();
    this.updateMatchCountPreview();
  }

  stepDifficulty(delta) {
    this.closeDiffPicker();
    if (this.filterTargetDiff === 'ALL') {
      this.filterTargetDiff = String(this.currentDiffStepVal);
    } else {
      this.currentDiffStepVal = Math.max(1, Math.min(10, this.currentDiffStepVal + delta));
      this.filterTargetDiff = String(this.currentDiffStepVal);
    }
    this.updateDiffUI();
    this.updateMatchCountPreview();
  }

  selectDifficulty(diff) {
    this.closeDiffPicker();
    this.filterTargetDiff = diff;
    this.updateDiffUI();
    this.updateMatchCountPreview();
  }

  selectDiffOp(op) {
    this.filterDiffOp = op;
    this.updateDiffUI();
    this.updateMatchCountPreview();
  }

  updateDiffUI() {
    const allBtn = document.getElementById('diff-all-btn');
    const stepperBox = document.getElementById('diff-stepper-box');
    const numSpan = document.getElementById('diff-current-num');
    const summary = document.getElementById('filter-diff-summary');
    const opGroup = document.getElementById('diff-op-group');
    const gteBtn = document.getElementById('op-gte-btn');
    const lteBtn = document.getElementById('op-lte-btn');

    if (numSpan) numSpan.innerText = this.currentDiffStepVal;

    if (this.filterTargetDiff === 'ALL') {
      if (allBtn) allBtn.className = 'px-3 py-1.5 rounded text-[11px] font-black border border-[#16131e] bg-[#16131e] text-white shadow-sm cursor-pointer transition-all';
      if (stepperBox) stepperBox.className = 'flex items-center bg-white rounded border border-[#e2dceb] opacity-60 transition-all overflow-hidden shadow-sm';
      if (summary) {
        summary.innerText = '指定なし';
        summary.className = 'text-[10px] text-slate-500 font-bold';
      }
      if (opGroup) opGroup.classList.add('opacity-40', 'pointer-events-none');
    } else {
      if (allBtn) allBtn.className = 'px-3 py-1.5 rounded text-[11px] font-black border border-[#e2dceb] bg-white text-slate-600 hover:bg-[#f3e8ff] cursor-pointer transition-all';
      if (stepperBox) stepperBox.className = 'flex items-center bg-white rounded border-2 border-[#16131e] shadow-[2px_2px_0px_#16131e] opacity-100 transition-all overflow-hidden';
      const opText = this.filterDiffOp === 'GTE' ? '以上' : '以下';
      if (summary) {
        summary.innerText = `難易度 ${this.filterTargetDiff} ${opText}`;
        summary.className = 'text-[10px] text-[#9333ea] font-black';
      }
      if (opGroup) opGroup.classList.remove('opacity-40', 'pointer-events-none');
    }

    if (gteBtn && lteBtn) {
      if (this.filterDiffOp === 'GTE') {
        gteBtn.className = 'px-2.5 py-1.5 text-[10px] font-black bg-[#16131e] text-white cursor-pointer';
        lteBtn.className = 'px-2.5 py-1.5 text-[10px] font-black bg-white text-slate-600 cursor-pointer';
      } else {
        gteBtn.className = 'px-2.5 py-1.5 text-[10px] font-black bg-white text-slate-600 cursor-pointer';
        lteBtn.className = 'px-2.5 py-1.5 text-[10px] font-black bg-[#16131e] text-white cursor-pointer';
      }
    }

    document.querySelectorAll('.picker-num-btn').forEach(btn => {
      const v = parseInt(btn.getAttribute('data-val'), 10);
      if (this.filterTargetDiff !== 'ALL' && v === this.currentDiffStepVal) {
        btn.className = 'picker-num-btn py-1 rounded text-xs font-black border border-[#16131e] bg-[#16131e] text-white cursor-pointer';
      } else {
        btn.className = 'picker-num-btn py-1 rounded text-xs font-black border border-[#e2dceb] hover:bg-[#f3e8ff] hover:border-[#16131e] cursor-pointer text-slate-700';
      }
    });
  }

  doesShowMatchFilter(show) {
    if (this.filterTargetDiff !== 'ALL') {
      const targetNum = parseInt(this.filterTargetDiff, 10);
      const showDiffNum = show.difficulty && show.difficulty.isNumeric ? show.difficulty.value : parseInt(show['難易度'] || '', 10);
      // 数値パースできない公演は除外せず常にパス
      if (!isNaN(showDiffNum)) {
        if (this.filterDiffOp === 'GTE' && showDiffNum < targetNum) return false;
        if (this.filterDiffOp === 'LTE' && showDiffNum > targetNum) return false;
      }
    }

    if (this.selectedFilterTags.size > 0) {
      const tags = show.tags && show.tags.length > 0 ? show.tags :
        String(show['内容目安'] || '').split(/[\r\n、,，/／・]+/).map(t => t.trim()).filter(Boolean);
      const hasAny = Array.from(this.selectedFilterTags).some(t => tags.includes(t));
      if (!hasAny) return false;
    }

    return true;
  }

  updateMatchCountPreview() {
    let count = 0;
    const targetShows = this.shows.filter(s => (s.day || s['日程'] || '1日目') === this.activeDay);
    const titles = [...new Set(targetShows.map(s => s.title || s['公演名']))].filter(Boolean);

    titles.forEach(title => {
      const group = targetShows.filter(s => (s.title || s['公演名']) === title);
      if (this.doesShowMatchFilter(group[0])) count++;
    });

    const badge = document.getElementById('filter-match-count');
    if (badge) badge.innerText = `${count}公演`;
  }

  apply() {
    this.close();
    this.updateTriggerBtn();
    if (this.onApplyCallback) this.onApplyCallback();
  }

  reset() {
    this.closeDiffPicker();
    this.filterTargetDiff = 'ALL';
    this.currentDiffStepVal = 3;
    this.filterDiffOp = 'GTE';
    this.selectedFilterTags.clear();
    this.updateDiffUI();
    this.updateTagButtonStyles();
    this.updateMatchCountPreview();
  }

  updateTriggerBtn() {
    const isFiltered = (this.filterTargetDiff !== 'ALL') || (this.selectedFilterTags.size > 0);
    const badge = document.getElementById('filter-active-badge');
    const btn = document.getElementById('open-filter-modal-btn');

    if (isFiltered) {
      const targetShows = this.shows.filter(s => (s.day || s['日程'] || '1日目') === this.activeDay);
      const titles = [...new Set(targetShows.map(s => s.title || s['公演名']))].filter(Boolean);
      let matchCount = 0;
      titles.forEach(title => {
        const group = targetShows.filter(s => (s.title || s['公演名']) === title);
        if (this.doesShowMatchFilter(group[0])) matchCount++;
      });

      if (badge) {
        badge.innerText = `適用中 (${matchCount}公演)`;
        badge.classList.remove('hidden');
      }
      if (btn) btn.classList.add('bg-[#faf9fd]', 'border-[#9333ea]');
    } else {
      if (badge) badge.classList.add('hidden');
      if (btn) btn.classList.remove('bg-[#faf9fd]', 'border-[#9333ea]');
    }
  }

  initEventListeners() {
    document.addEventListener('click', (e) => {
      const popup = document.getElementById('diff-picker-popup');
      const btn = document.getElementById('diff-num-btn');
      if (popup && !popup.classList.contains('hidden')) {
        if (!popup.contains(e.target) && !btn?.contains(e.target)) {
          this.closeDiffPicker();
        }
      }
    });
  }
}
