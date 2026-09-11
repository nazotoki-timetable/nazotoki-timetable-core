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

  /**
   * チケット画像（Blob）の共通生成処理
   */
  async createPassBlob(area) {
    await document.fonts.ready;
    await new Promise(resolve => setTimeout(resolve, 200));

    const targetHeight = area.scrollHeight;
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const logoImg = area.querySelector('img');

    // iOSかつロゴ画像が存在する場合のCanvas後合成処理（透過PNGバグ回避）
    if (isIOS && logoImg && logoImg.src && !logoImg.classList.contains('hidden')) {
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

      return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    }

    // Android / PC / ロゴなし環境
    return htmlToImage.toBlob(area, {
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

  /**
   * 画像保存処理
   */
  async downloadImage() {
    const btn = document.getElementById('download-btn');
    const area = document.getElementById('capture-area');
    if (!btn || !area) return;
    const originalText = btn.innerHTML;

    btn.innerText = '画像生成中...';
    btn.disabled = true;

    try {
      const blob = await this.createPassBlob(area);
      if (!blob) throw new Error('画像の生成に失敗しました。');

      const fileName = `my-hashigo-pass-${this.config.date || 'fes'}.png`;
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = fileName;
      link.href = objectUrl;
      link.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
    } catch (error) {
      console.error('画像保存エラー:', error);
      alert('保存に失敗しました。詳細: ' + error.message);
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  }

  /**
   * SNSシェア処理（iOS / Android / PC 最適化）
   */
  async shareImage() {
    const btn = document.getElementById('share-btn');
    const area = document.getElementById('capture-area');
    const guideContainer = document.getElementById('ios-share-guide');
    if (!btn || !area) return;
    const originalText = btn.innerHTML;

    btn.innerHTML = '<span>画像生成中...</span>';
    btn.disabled = true;
    if (guideContainer) {
      guideContainer.classList.add('hidden');
      guideContainer.innerHTML = '';
    }

    try {
      const blob = await this.createPassBlob(area);
      if (!blob) throw new Error('画像の生成に失敗しました。');

      const fileName = `my-hashigo-pass-${this.config.date || 'fes'}.png`;
      const defaultText = `${this.config.title || 'ハシゴ計画'}のスケジュールを作成しました！`;
      const baseText = this.config.shareText || defaultText;
      const hashtag = this.config.hashtag ? `${this.config.hashtag}\n` : '';
      const shareText = `${baseText}\n${hashtag}${window.location.href}`;
      const xIntentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;

      const ua = navigator.userAgent || '';
      const isIOS = /iPhone|iPad|iPod/i.test(ua);
      const isAndroid = /Android/i.test(ua);

      // 1. iOS環境:
      // iOS Safariでは Web Share API で画像とテキストを同時送信するとXアプリ側でテキストが破棄される仕様上の問題、
      // および重いレンダリング処理後の navigator.share が User Activation 失効でブロックされる問題があるため、
      // 画像を自動ダウンロードしつつ、確実にX投稿画面へ誘導する。
      if (isIOS) {
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = fileName;
        link.href = objectUrl;
        link.click();

        if (guideContainer) {
          guideContainer.innerHTML = `
            <div class="text-xs font-bold text-slate-800 leading-normal text-left">
              画像をダウンロードしました。<br>
              下のボタンからXを開き、保存した画像を添付してポストしてください。<br>
              <span class="text-[10px] text-slate-500">※自動保存されない場合は、下のプレビュー画像を長押しして「写真に追加」してください。</span>
            </div>
            <img src="${objectUrl}" alt="Pass Preview" class="max-h-40 mx-auto rounded-xl shadow-md border border-slate-200 object-contain my-1">
            <a href="${xIntentUrl}" target="_blank" rel="noopener noreferrer"
              class="w-full bg-black text-white py-3 rounded-xl font-bold text-sm shadow-md active:scale-95 transition-all flex justify-center items-center gap-2">
              <span>Xを開いてポストする</span>
            </a>
          `;
          guideContainer.classList.remove('hidden');
          guideContainer.scrollIntoView({ behavior: 'smooth' });
        }
        return;
      }

      // 2. Android環境（Web Share API によるダイレクト共有）
      if (isAndroid && navigator.share && navigator.canShare) {
        const file = new File([blob], fileName, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              text: shareText
            });
            return;
          } catch (shareErr) {
            if (shareErr.name === 'AbortError') return;
            console.warn('Web Share共有中断または失敗:', shareErr);
          }
        }
      }

      // 3. PC環境（クリップボードコピー + Xインテント起動）
      try {
        if (navigator.clipboard && window.ClipboardItem) {
          const item = new ClipboardItem({ [blob.type]: blob });
          await navigator.clipboard.write([item]);
          alert('画像をクリップボードにコピーしました。\nOKを押すとXの投稿画面が開きますので、投稿欄に貼り付け（Ctrl+V / Cmd+V）してください。');
        } else {
          const objectUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.download = fileName;
          link.href = objectUrl;
          link.click();
          setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
        }
      } catch (clipErr) {
        console.warn('クリップボード非対応:', clipErr);
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = fileName;
        link.href = objectUrl;
        link.click();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
      }

      window.open(xIntentUrl, '_blank');

    } catch (error) {
      console.error('シェア処理エラー:', error);
      alert('画像の生成または共有に失敗しました。詳細: ' + error.message);
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  }
}
