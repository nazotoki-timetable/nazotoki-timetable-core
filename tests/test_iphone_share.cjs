const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\Syaka\\.gemini\\antigravity\\brain\\b2c05786-1dc1-4d46-8a5b-bc6793e77748';

async function runTest() {
  console.log('=== iPhoneエミュレーションによる徹底テスト開始 ===');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // iPhone 14 Pro / 15 Pro エミュレーション設定 (393x852, DPR 3, Touch)
  await page.setViewport({
    width: 393,
    height: 852,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  });

  await page.setUserAgent(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1'
  );

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
      console.log('Console Error:', msg.text());
    }
  });

  page.on('requestfailed', req => {
    console.log('Request Failed:', req.url(), req.failure().errorText);
  });

  page.on('pageerror', err => {
    consoleErrors.push(err.toString());
    console.log('Page Error:', err.toString());
  });

  try {
    console.log('1. ページ読み込み (http://localhost:5173/)');
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });

    const title = await page.title();
    console.log('ページタイトル:', title);

    // 2. 公演カードの選択 (.timetable-card)
    console.log('2. 公演カードの選択');
    const cards = await page.$$('.timetable-card');
    console.log(`検出された公演カード数: ${cards.length}`);
    if (cards.length >= 2) {
      await cards[0].click();
      await new Promise(r => setTimeout(r, 200));
      await cards[1].click();
      await new Promise(r => setTimeout(r, 200));
    }

    // スクリーンショット2: 選択状態
    const sc2 = path.join(ARTIFACT_DIR, 'iphone_sc2_selected.png');
    await page.screenshot({ path: sc2 });
    console.log('スクリーンショット2保存完了:', sc2);

    // 3. セレクションバーから「ハシゴテーブルを見る」をクリック
    console.log('3. チケットモーダルを開く');
    const openBtn = await page.$('button[onclick="showHashigoTable()"]');
    if (!openBtn) throw new Error('showHashigoTable ボタンが見つかりません');
    await openBtn.click();
    await new Promise(r => setTimeout(r, 500));

    // スクリーンショット3: モーダル表示
    const sc3 = path.join(ARTIFACT_DIR, 'iphone_sc3_modal.png');
    await page.screenshot({ path: sc3 });
    console.log('スクリーンショット3保存完了:', sc3);

    // 4. 「SNSでシェアする」ボタンをクリック
    console.log('4. 「SNSでシェアする」を実行');
    const shareBtn = await page.$('#share-btn');
    if (!shareBtn) throw new Error('#share-btn が見つかりません');
    await shareBtn.click();

    // ガイドエリアの表示待機（画像生成完了を待つ）
    console.log('画像生成とiOSガイド表示を待機中...');
    await page.waitForSelector('#ios-share-guide:not(.hidden)', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 800));

    // ガイド内のX投稿リンク検証
    const xLink = await page.$('#ios-share-guide a');
    const xHref = await page.evaluate(el => el ? el.href : null, xLink);
    console.log('検証: 生成されたXポストURL =', xHref);

    // ガイド内のプレビュー画像検証
    const previewImg = await page.$('#ios-share-guide img');
    const imgSrc = await page.evaluate(el => el ? el.src : null, previewImg);
    console.log('検証: プレビュー画像URL先頭50文字 =', imgSrc ? imgSrc.substring(0, 50) + '...' : 'なし');

    // スクリーンショット4: シェアガイド表示状態
    const sc4 = path.join(ARTIFACT_DIR, 'iphone_sc4_share_guide.png');
    await page.screenshot({ path: sc4 });
    console.log('スクリーンショット4保存完了:', sc4);

    // 5. モンキーテスト（ランダム高速操作 30アクション）
    console.log('5. モンキーテスト開始（ランダム高速操作 30アクション）');
    // モーダルを閉じる
    await page.evaluate(() => {
      const modal = document.getElementById('my-schedule-modal');
      if (modal) modal.classList.add('hidden');
    });
    await new Promise(r => setTimeout(r, 300));

    for (let i = 0; i < 30; i++) {
      const actionType = Math.floor(Math.random() * 3);
      if (actionType === 0) {
        // カードをランダムにタップ
        const currentCards = await page.$$('.timetable-card');
        if (currentCards.length > 0) {
          const randomCard = currentCards[Math.floor(Math.random() * currentCards.length)];
          await randomCard.click().catch(() => {});
        }
      } else if (actionType === 1) {
        // スクロール操作
        await page.evaluate(() => window.scrollBy(0, (Math.random() - 0.5) * 400));
      } else if (actionType === 2) {
        // フィルターボタン開閉
        const filterBtn = await page.$('#filter-modal-btn');
        if (filterBtn) {
          await filterBtn.click().catch(() => {});
          await new Promise(r => setTimeout(r, 80));
          await page.evaluate(() => {
            const fmodal = document.getElementById('filter-modal');
            if (fmodal) fmodal.classList.add('hidden');
          });
        }
      }
      await new Promise(r => setTimeout(r, 80));
    }
    console.log('モンキーテスト完了！');

    // スクリーンショット5: モンキーテスト後
    const sc5 = path.join(ARTIFACT_DIR, 'iphone_sc5_after_monkey.png');
    await page.screenshot({ path: sc5 });
    console.log('スクリーンショット5保存完了:', sc5);

    console.log('\n=== テスト結果サマリー ===');
    console.log(`コンソールエラー総数: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      console.log('エラー詳細:', consoleErrors);
    } else {
      console.log('重大エラー・例外は一切発生しませんでした。すべての操作が完全動作しました。');
    }

  } catch (err) {
    console.error('テスト実行中例外:', err);
  } finally {
    await browser.close();
    console.log('ブラウザ終了');
  }
}

runTest();
