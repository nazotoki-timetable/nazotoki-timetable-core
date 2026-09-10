/**
 * 公演の表示・非表示設定モーダル
 */
export class HideShowsModal {
  constructor(onApplyCallback) {
    this.onApplyCallback = onApplyCallback;
    this.shows = [];
    this.hiddenTitles = new Set();
  }

  setShows(shows) {
    this.shows = shows;
  }

  open() {
    this.renderList();
    const modal = document.getElementById('hide-shows-modal');
    if (modal) modal.classList.remove('hidden');
  }

  close() {
    const modal = document.getElementById('hide-shows-modal');
    if (modal) modal.classList.add('hidden');
  }

  renderList() {
    const container = document.getElementById('hide-shows-list');
    if (!container) return;
    container.innerHTML = '';

    const uniqueShows = [];
    const seenTitles = new Set();
    this.shows.forEach(s => {
      const title = s.title || s['公演名'];
      if (title && !seenTitles.has(title)) {
        seenTitles.add(title);
        uniqueShows.push({
          title,
          circle: s.groupName || s['団体名'] || s['サークル名'] || '不明'
        });
      }
    });

    uniqueShows.sort((a, b) => a.circle.localeCompare(b.circle) || a.title.localeCompare(b.title));

    uniqueShows.forEach((show, index) => {
      const isChecked = !this.hiddenTitles.has(show.title);
      const checkboxId = `hide-show-check-${index}`;
      const labelId = `hide-show-label-${index}`;
      const opacityClass = isChecked ? 'bg-white border-slate-200/80' : 'opacity-50 bg-slate-200/40 border-transparent shadow-none';

      const label = document.createElement('label');
      label.id = labelId;
      label.htmlFor = checkboxId;
      label.className = `flex items-start gap-3 p-3 rounded-md cursor-pointer transition-all border select-none shadow-sm ${opacityClass}`;

      label.innerHTML = `
        <input type="checkbox" id="${checkboxId}" data-title="${show.title.replace(/"/g, '&quot;')}" ${isChecked ? 'checked' : ''}
          class="mt-1.5 w-4.5 h-4.5 text-main bg-gray-100 border-gray-300 rounded focus:ring-main focus:ring-2 accent-main">
        <div class="flex-1">
          <div class="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-0.5">${show.circle}</div>
          <div class="text-xs font-bold text-main leading-tight">${show.title}</div>
        </div>
      `;

      const input = label.querySelector('input');
      input.onchange = (e) => this.toggleLabelStyle(index, e.target.checked);
      container.appendChild(label);
    });
  }

  toggleLabelStyle(index, isChecked) {
    const label = document.getElementById(`hide-show-label-${index}`);
    if (label) {
      if (isChecked) {
        label.classList.remove('opacity-50', 'bg-slate-200/40', 'border-transparent', 'shadow-none');
        label.classList.add('bg-white', 'border-slate-200/80');
      } else {
        label.classList.add('opacity-50', 'bg-slate-200/40', 'border-transparent', 'shadow-none');
        label.classList.remove('bg-white', 'border-slate-200/80');
      }
    }
  }

  reset() {
    const checkboxes = document.querySelectorAll('#hide-shows-list input[type="checkbox"]');
    checkboxes.forEach((cb, index) => {
      cb.checked = true;
      this.toggleLabelStyle(index, true);
    });
  }

  apply() {
    const checkboxes = document.querySelectorAll('#hide-shows-list input[type="checkbox"]');
    this.hiddenTitles.clear();
    checkboxes.forEach(cb => {
      if (!cb.checked) {
        this.hiddenTitles.add(cb.getAttribute('data-title'));
      }
    });

    this.close();
    this.updateButtonText();
    if (this.onApplyCallback) this.onApplyCallback(this.hiddenTitles);
  }

  updateButtonText() {
    const btnText = document.getElementById('hide-shows-btn-text');
    if (!btnText) return;
    const count = this.hiddenTitles.size;
    if (count > 0) {
      btnText.innerText = `公演の表示・非表示設定 (${count}件非表示)`;
    } else {
      btnText.innerText = '公演の表示・非表示設定';
    }
  }
}
