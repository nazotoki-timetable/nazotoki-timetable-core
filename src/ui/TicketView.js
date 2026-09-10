import * as htmlToImage from 'html-to-image';
import { Parser } from '../core/Parser.js';

/**
 * チケットパス風ハシゴテーブルモーダル & 画像書き出し (PNG/SNS共有)
 */
export class TicketView {
  constructor() {
    this.config = {};
    this.shows = [];
    this.selectedIds = [];
    this.cachedLogoBase64 = null;
  }

  setContext(config, shows, selectedIds) {
    this.config = config;
    this.shows = shows;
    this.selectedIds = selectedIds;
  }

  async preloadLogo(src) {
    if (!src) return null;
    try {
      const resp = await fetch(src);
      const blob = await resp.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.warn('Logo preload failed:', e);
      return null;
    }
  }

  formatFesDate(rawDateStr) {
    if (!rawDateStr) return '---';
    const trimmed = String(rawDateStr).trim();
    if (!trimmed) return '---';

    const formatSingle = (str) => {
      const s = (str || '').trim();
      const digits = s.replace(/\D/g, '');
      if (digits.length === 8 && /^\d{4}[\.\-\/]?\d{2}[\.\-\/]?\d{2}$/.test(s)) {
        return `${digits.substring(0, 4)}.${digits.substring(4, 6)}.${digits.substring(6, 8)}`;
      }
      return s;
    };

    let parts = null;
    if (/[\s]+[-~～][\s]+|[~～]/.test(trimmed)) {
      parts = trimmed.split(/[\s]+[-~～][\s]+|[~～]/);
    } else if (/^\d{8}-\d{8}$/.test(trimmed)) {
      parts = trimmed.split('-');
    } else if (/^\d{4}[\.\/]\d{1,2}[\.\/]\d{1,2}-\d{1,2}[\.\/]\d{1,2}/.test(trimmed) || /^\d{4}[\.\/]\d{1,2}[\.\/]\d{1,2}-\d{4}/.test(trimmed)) {
      const firstDash = trimmed.indexOf('-');
      parts = [trimmed.substring(0, firstDash), trimmed.substring(firstDash + 1)];
    }

    if (parts && parts.length > 1) {
      return parts.map(p => formatSingle(p.trim())).join(' - ');
    }
    return formatSingle(trimmed);
  }

  show() {
    const list = document.getElementById('hashigo-list');
    const banner = document.getElementById('modal-conflict-banner');
    if (!list) return;
    list.innerHTML = '';

    const sel = this.shows
      .filter(s => this.selectedIds.includes(s.id))
      .sort((a, b) => {
        const dayA = a.day || a['日程'] || '1日目';
        const dayB = b.day || b['日程'] || '1日目';
        if (dayA !== dayB) return dayA.localeCompare(dayB, undefined, { numeric: true });
        const diff = a.startMinutes - b.startMinutes;
        if (diff !== 0) return diff;
        const endDiff = a.endMinutes - b.endMinutes;
        if (endDiff !== 0) return endDiff;
        return (a.title || '').localeCompare(b.title || '');
      });

    const uniqueDays = [...new Set(sel.map(s => s.day || '1日目'))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const dayLabels = uniqueDays.map(dayStr => {
      const match = dayStr.match(/(\d+)日目/);
      if (match) {
        const num = parseInt(match[1], 10);
        return this.config.dayLabels?.[num - 1] || dayStr;
      }
      return dayStr;
    });

    const baseDate = this.formatFesDate(this.config.displayDate || this.config.date);
    const dateEl = document.getElementById('modal-fes-date');
    if (dateEl) {
      dateEl.innerText = dayLabels.length > 0 ? `${baseDate} 【${dayLabels.join(' & ')}】` : baseDate;
    }

    // 重複チェック
    let overlap = false;
    const timedSel = sel.filter(s => s.reserveType !== '当日受付(ファミレス式)' && s.reserveType !== '事前予約(時間自由)');
    for (let i = 0; i < timedSel.length; i++) {
      for (let j = i + 1; j < timedSel.length; j++) {
        const s1 = timedSel[i];
        const s2 = timedSel[j];
        if (s1.day !== s2.day) continue;
        if (this.config.allowZeroMinTransfer) {
          if ((s1.startMinutes < s2.endMinutes && s1.endMinutes > s2.startMinutes) ||
              (s2.startMinutes < s1.endMinutes && s2.endMinutes > s1.startMinutes)) {
            overlap = true;
            break;
          }
        } else {
          if ((s1.startMinutes <= s2.endMinutes && s1.endMinutes >= s2.startMinutes) ||
              (s2.startMinutes <= s1.endMinutes && s2.endMinutes >= s1.startMinutes)) {
            overlap = true;
            break;
          }
        }
      }
      if (overlap) break;
    }
    if (banner) banner.classList.toggle('hidden', !overlap);

    sel.forEach(s => {
      const isFamily = s.reserveType === '当日受付(ファミレス式)';
      const displayTime = isFamily ? '随時受付' : `<span class="material-symbols-outlined text-[13px] mr-0.5">timer</span>${s.startTime} - ${s.endTime}`;
      const accentColorClass = isFamily ? 'bg-orange-500' : 'bg-rose-500';

      const card = document.createElement('div');
      card.className = 'hashigo-card bg-white p-3 rounded-lg shadow-sm border border-main/10 relative overflow-hidden text-left';
      card.innerHTML = `
        <div class="absolute left-0 top-0 bottom-0 w-1.5 ${accentColorClass}"></div>
        <div class="ml-2">
          <div class="flex justify-between items-start mb-1 gap-2">
            <div class="text-[9px] font-black text-main tracking-tighter leading-tight">${s.groupName || '不明'}</div>
            <div class="text-[10px] font-black text-main bg-slate-50 border border-slate-200 px-2 py-0.5 rounded leading-normal whitespace-nowrap flex-shrink-0 flex items-center gap-0.5">
              <span class="material-symbols-outlined text-[12px]">location_on</span>
              <span>${s.room || '未定'}</span>
            </div>
          </div>
          <div class="font-black text-sm text-main leading-tight mb-2">${(s.title || '').replace(/\n/g, '')}</div>
          <div class="text-[11px] font-black text-slate-500 tracking-tighter">${displayTime}</div>
        </div>
      `;
      list.appendChild(card);
    });

    const modal = document.getElementById('my-schedule-modal');
    if (modal) modal.classList.remove('hidden');
  }

  close() {
    const modal = document.getElementById('my-schedule-modal');
    if (modal) modal.classList.add('hidden');
    const guideContainer = document.getElementById('ios-share-guide');
    if (guideContainer) {
      guideContainer.classList.add('hidden');
      guideContainer.innerHTML = '';
    }
  }

  async downloadImage() {
    const btn = document.getElementById('download-btn');
    const area = document.getElementById('capture-area');
    if (!btn || !area) return;
    const originalText = btn.innerHTML;

    btn.innerText = '画像生成中...';
    btn.disabled = true;

    try {
      await document.fonts.ready;
      await new Promise(resolve => setTimeout(resolve, 300));

      const targetHeight = area.scrollHeight;
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const logoImg = area.querySelector('img');

      if (isIOS && logoImg) {
        const b64 = this.cachedLogoBase64 || await this.preloadLogo(logoImg.src);
        const originalOpacity = logoImg.style.opacity;
        logoImg.style.opacity = '0';

        const canvas = await htmlToImage.toCanvas(area, {
          quality: 1.0,
          pixelRatio: 3,
          cacheBust: true,
          height: targetHeight,
          style: {
            overflow: 'visible',
            maxHeight: 'none',
            height: `${targetHeight}px`,
            borderRadius: '2.5rem'
          }
        });

        logoImg.style.opacity = originalOpacity;

        if (b64) {
          const imgObj = new Image();
          await new Promise(resolve => {
            imgObj.onload = () => resolve(true);
            imgObj.onerror = () => resolve(false);
            imgObj.src = b64;
          });

          const ctx = canvas.getContext('2d');
          if (ctx) {
            const ratio = 3;
            const areaRect = area.getBoundingClientRect();
            const logoRect = logoImg.getBoundingClientRect();
            const drawX = (logoRect.left - areaRect.left + area.scrollLeft) * ratio;
            const drawY = (logoRect.top - areaRect.top + area.scrollTop) * ratio;
            const drawW = logoRect.width * ratio;
            const drawH = logoRect.height * ratio;
            ctx.drawImage(imgObj, drawX, drawY, drawW, drawH);
          }
        }

        const dataUrl = canvas.toDataURL('image/png', 1.0);
        const link = document.createElement('a');
        link.download = `my-hashigo-pass-${this.config.date || 'fes'}.png`;
        link.href = dataUrl;
        link.click();
      } else {
        const dataUrl = await htmlToImage.toPng(area, {
          quality: 1.0,
          pixelRatio: 3,
          cacheBust: true,
          height: targetHeight,
          style: {
            overflow: 'visible',
            maxHeight: 'none',
            height: `${targetHeight}px`,
            borderRadius: '2.5rem'
          }
        });
        const link = document.createElement('a');
        link.download = `my-hashigo-pass-${this.config.date || 'fes'}.png`;
        link.href = dataUrl;
        link.click();
      }
    } catch (error) {
      console.error('画像生成エラー:', error);
      alert('保存に失敗しました。詳細: ' + error.message);
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  }

  async shareImage() {
    const btn = document.getElementById('share-btn');
    const area = document.getElementById('capture-area');
    if (!btn || !area) return;
    const originalText = btn.innerHTML;

    btn.innerHTML = '<span>⏳ 準備中...</span>';
    btn.disabled = true;

    try {
      await document.fonts.ready;
      await new Promise(resolve => setTimeout(resolve, 300));

      const targetHeight = area.scrollHeight;
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const logoImg = area.querySelector('img');

      let blob;
      if (isIOS && logoImg) {
        const b64 = this.cachedLogoBase64 || await this.preloadLogo(logoImg.src);
        const originalOpacity = logoImg.style.opacity;
        logoImg.style.opacity = '0';

        const canvas = await htmlToImage.toCanvas(area, {
          quality: 1.0,
          pixelRatio: 3,
          cacheBust: true,
          height: targetHeight,
          style: {
            overflow: 'visible',
            maxHeight: 'none',
            height: `${targetHeight}px`,
            borderRadius: '2.5rem'
          }
        });

        logoImg.style.opacity = originalOpacity;

        if (b64) {
          const imgObj = new Image();
          await new Promise(resolve => {
            imgObj.onload = () => resolve(true);
            imgObj.onerror = () => resolve(false);
            imgObj.src = b64;
          });
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const ratio = 3;
            const areaRect = area.getBoundingClientRect();
            const logoRect = logoImg.getBoundingClientRect();
            const drawX = (logoRect.left - areaRect.left + area.scrollLeft) * ratio;
            const drawY = (logoRect.top - areaRect.top + area.scrollTop) * ratio;
            const drawW = logoRect.width * ratio;
            const drawH = logoRect.height * ratio;
            ctx.drawImage(imgObj, drawX, drawY, drawW, drawH);
          }
        }

        blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      } else {
        blob = await htmlToImage.toBlob(area, {
          quality: 1.0,
          pixelRatio: 3,
          cacheBust: true,
          height: targetHeight,
          style: {
            overflow: 'visible',
            maxHeight: 'none',
            height: `${targetHeight}px`,
            borderRadius: '2.5rem'
          }
        });
      }

      const defaultText = `${this.config.title || 'ハシゴ計画'}のスケジュールを作成しました！`;
      const shareText = `${this.config.shareText || defaultText}\n${this.config.hashtag || ''}\n${window.location.href}`;

      if (navigator.share && navigator.canShare && blob) {
        const file = new File([blob], `my-hashigo-pass-${this.config.date || 'fes'}.png`, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            text: shareText
          });
          return;
        }
      }

      // Web Share 非対応時: Twitter/X インテント起動 + 画像DL
      const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
      window.open(xUrl, '_blank');
      this.downloadImage();
    } catch (error) {
      console.error('シェアエラー:', error);
      alert('共有に失敗しました。詳細: ' + error.message);
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  }
}
