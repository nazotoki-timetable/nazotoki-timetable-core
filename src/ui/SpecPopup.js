/**
 * 公演スペック詳細ポップアップ（難易度星、内容目安タグ等）
 */
export class SpecPopup {
  constructor() {
    this.currentOpenCard = null;
    this.shows = [];
    this.initEventListeners();
  }

  setShows(shows) {
    this.shows = shows;
  }

  toggle(event, encodedTitle, cardEl) {
    if (event) event.stopPropagation();
    const popover = document.getElementById('show-detail-popover');
    if (!popover) return;

    if (this.currentOpenCard === cardEl && !popover.classList.contains('hidden')) {
      this.close();
      return;
    }

    const title = decodeURIComponent(encodedTitle);
    const show = this.shows.find(s => (s.title || s['公演名']) === title);
    if (!show) return;

    const difficulty = show.difficulty ? show.difficulty.displayText : (show['難易度'] || 'ー');
    const content = show['内容目安'] || show['内容目安(雰囲気)'] || show['目安'] || '特になし';

    const badgeEl = document.getElementById('popover-diff-badge');
    if (badgeEl) badgeEl.innerText = difficulty;

    // 星表示（MAX 10）
    const diffNum = show.difficulty && show.difficulty.isNumeric ? show.difficulty.value : parseInt(difficulty, 10);
    const starsEl = document.getElementById('popover-diff-stars');
    if (starsEl) {
      if (!isNaN(diffNum) && diffNum > 0) {
        let stars = '';
        for (let i = 1; i <= 10; i++) {
          stars += i <= diffNum ? '★' : '☆';
        }
        starsEl.innerText = stars;
        starsEl.style.display = 'inline';
      } else {
        starsEl.innerText = difficulty !== 'ー' ? difficulty : '';
        starsEl.style.display = difficulty !== 'ー' ? 'inline' : 'none';
      }
    }

    // 内容目安のタグ生成
    const tagsContainer = document.getElementById('popover-content-tags');
    if (tagsContainer) {
      tagsContainer.innerHTML = '';
      const tags = show.tags && show.tags.length > 0 ? show.tags : String(content)
        .split(/[\r\n、,，/／・]+/)
        .map(t => t.trim())
        .filter(t => t && t !== '特になし' && t !== 'なし');

      if (tags.length > 0) {
        tags.forEach(tagText => {
          const tag = document.createElement('span');
          tag.className = 'text-[9.5px] font-black bg-white text-[#16131d] border border-[#d8b4fe] rounded px-1.5 py-0.5 leading-tight shadow-sm';
          tag.innerText = '・' + tagText;
          tagsContainer.appendChild(tag);
        });
      } else {
        tagsContainer.innerHTML = '<span class="text-[9px] text-slate-400 font-bold">情報なし（または設定なし）</span>';
      }
    }

    // 位置計算
    const rect = cardEl.getBoundingClientRect();
    const popWidth = 210;
    let left = rect.left + (rect.width / 2) - (popWidth / 2);
    let top = rect.bottom + 6;

    if (left < 10) left = 10;
    if (left + popWidth > window.innerWidth - 10) {
      left = window.innerWidth - popWidth - 10;
    }

    const arrow = document.getElementById('popover-arrow');
    if (arrow) {
      const cardCenter = rect.left + (rect.width / 2);
      const arrowLeft = cardCenter - left;
      arrow.style.left = Math.max(14, Math.min(popWidth - 14, arrowLeft)) + 'px';
    }

    popover.style.left = left + 'px';
    popover.style.top = top + 'px';
    popover.classList.remove('hidden');

    this.currentOpenCard = cardEl;
  }

  close() {
    const popover = document.getElementById('show-detail-popover');
    if (popover) popover.classList.add('hidden');
    this.currentOpenCard = null;
  }

  initEventListeners() {
    document.addEventListener('click', (e) => {
      const popover = document.getElementById('show-detail-popover');
      if (!popover || popover.classList.contains('hidden')) return;
      if (!popover.contains(e.target) && !e.target.closest('.show-spec-card')) {
        this.close();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });

    window.addEventListener('scroll', () => {
      this.close();
    }, true);
  }
}
