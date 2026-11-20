// 出展団体の一括記入シート：スプレッドシート・ドライブを簡易的にまねた環境で、流れを通しで動かす
//   準備 → 記入用シートを作る → 団体が記入・提出 → 取り込み → 直して再取り込み → 公演一覧へ反映 → 公開データ
//   node --test tests/gas-entry-flow.test.js
// 本物の Google の動き（共有・権限・入力規則の効き方）までは確かめられない。行と列の位置、振り分け、差分、公開範囲を見る。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

/* ─────────── まね（スプレッドシート） ─────────── */
const colNum = (letters) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const parseA1 = (a1) => {
  const [a, b] = a1.split(':');
  const p = (s) => { const m = s.match(/^([A-Z]+)(\d+)$/); return [Number(m[2]), colNum(m[1])]; };
  const [r1, c1] = p(a);
  const [r2, c2] = b ? p(b) : [r1, c1];
  return [r1, c1, r2 - r1 + 1, c2 - c1 + 1];
};
const chain = () => new Proxy(function () {}, { get: (t, k) => (k === 'then' ? undefined : chain()), apply: () => chain() });

class Sheet {
  constructor(name) { this.name = name; this.cells = []; this.notes = []; this.bgs = []; this.maxCols = 26; this.hidden = false; this.hiddenCols = new Set(); this.tabColor = null; }
  _meta(store, r, c, v) { while (store.length < r) store.push([]); if (v === undefined) return (store[r - 1] || [])[c - 1] ?? ''; store[r - 1][c - 1] = v; return v; }
  hideSheet() { this.hidden = true; }
  hideColumns(c, n = 1) { for (let i = 0; i < n; i++) this.hiddenCols.add(c + i); }
  setTabColor(c) { this.tabColor = c; return this; }
  _get(r, c) { return (this.cells[r - 1] || [])[c - 1] ?? ''; }
  _set(r, c, v) { while (this.cells.length < r) this.cells.push([]); this.cells[r - 1][c - 1] = v; if (c > this.maxCols) this.maxCols = c; }
  getLastRow() { for (let r = this.cells.length; r > 0; r--) if ((this.cells[r - 1] || []).some((v) => v !== '' && v !== undefined && v !== null)) return r; return 0; }
  getLastColumn() { let m = 0; this.cells.forEach((row) => row.forEach((v, i) => { if (v !== '' && v !== undefined && v !== null) m = Math.max(m, i + 1); })); return m; }
  getMaxColumns() { return this.maxCols; }
  insertColumnsAfter(_, n) { this.maxCols += n; }
  getName() { return this.name; }
  setName(n) { this.name = n; }
  appendRow(row) { const r = this.getLastRow() + 1; row.forEach((v, i) => this._set(r, i + 1, v)); }
  deleteRow(r) { this.cells.splice(r - 1, 1); this.notes.splice(r - 1, 1); this.bgs.splice(r - 1, 1); }
  clear() { this.cells = []; this.notes = []; this.bgs = []; }
  clearContents() { this.cells = []; }
  getDataRange() { return this.getRange(1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  getFormUrl() { return null; }
  getRange(a, b, nr = 1, nc = 1) {
    const [r, c, h, w] = typeof a === 'string' ? parseA1(a) : [a, b, nr, nc];
    const sheet = this;
    let p;
    const range = {
      getValues: () => Array.from({ length: h }, (_, i) => Array.from({ length: w }, (_, j) => sheet._get(r + i, c + j))),
      getValue: () => sheet._get(r, c),
      setValues: (vals) => { assert.equal(vals.length, h, `行数が合わない（${sheet.name} ${r},${c}）`); vals.forEach((row, i) => { assert.equal(row.length, w, `列数が合わない（${sheet.name}）`); row.forEach((v, j) => sheet._set(r + i, c + j, v)); }); return p; },
      setValue: (v) => { sheet._set(r, c, v); return p; },
      insertCheckboxes: () => { sheet._set(r, c, false); return p; },
      getNote: () => sheet._meta(sheet.notes, r, c),
      getNotes: () => Array.from({ length: h }, (_, i) => Array.from({ length: w }, (_, j) => sheet._meta(sheet.notes, r + i, c + j))),
      setNote: (v) => { sheet._meta(sheet.notes, r, c, v); return p; },
      setBackground: (v) => { for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) sheet._meta(sheet.bgs, r + i, c + j, v ?? ''); return p; },
    };
    // setBackground などの見た目の指定は何もせず自分を返す（つなぎ書き用）
    p = new Proxy(range, { get: (t, k) => (k in t ? t[k] : () => p) });
    return p;
  }
}
const sheetProxy = (s) => new Proxy(s, { get: (t, k) => (k in t ? (typeof t[k] === 'function' ? t[k].bind(t) : t[k]) : () => sheetProxy(s)) });

let idSeq = 0;
class Book {
  constructor(name) { this.name = name; this.id = `book${++idSeq}`; this.sheets = [new Sheet('シート1')]; this.editors = []; this.activeSheet = this.sheets[0]; }
  getSheets() { return this.sheets.map(sheetProxy); }
  getSheetByName(n) { const s = this.sheets.find((x) => x.name === n); return s ? sheetProxy(s) : null; }
  insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return sheetProxy(s); }
  getId() { return this.id; }
  getUrl() { return `https://docs.google.com/spreadsheets/d/${this.id}`; }
  getName() { return this.name; }
  addEditor(e) { this.editors.push(e); }
  setActiveSheet(s) {
    const targetName = s && (typeof s.getName === 'function' ? s.getName() : s.name);
    const target = this.sheets.find((x) => x.name === targetName);
    if (target) this.activeSheet = target;
    return s;
  }
  moveActiveSheet(pos) {
    const idx = this.sheets.indexOf(this.activeSheet);
    if (idx < 0) return;
    this.sheets.splice(idx, 1);
    const to = Math.max(0, Math.min(pos - 1, this.sheets.length));
    this.sheets.splice(to, 0, this.activeSheet);
  }
}

/* ─────────── まね（ドライブ・その他） ─────────── */
const books = new Map();
const folders = new Map();
const alerts = [];
const iter = (arr) => { const list = [...arr]; return { hasNext: () => list.length > 0, next: () => list.shift() }; };
class Folder {
  constructor(name) { this.name = name; this.id = `folder${++idSeq}`; this.files = []; this.editors = []; this.children = []; this.moved = []; folders.set(this.id, this); }
  getId() { return this.id; }
  getName() { return this.name; }
  getUrl() { return `https://drive.google.com/drive/folders/${this.id}`; }
  createFolder(n) { const f = new Folder(n); this.children.push(f); return f; }
  getFoldersByName(n) { return iter(this.children.filter((f) => f.name === n)); }
  addEditor(e) { this.editors.push(e); }
  getFiles() { const list = [...this.files]; return { hasNext: () => list.length > 0, next: () => list.shift() }; }
}
const props = new Map();
const organizer = new Book('サンプル謎フェス 管理');
let activeOrg = organizer;
let activeProps = props;
// 主催スプシが置かれているフォルダ（ルート直下には何も作らないことを確かめる）
const myRoot = new Folder('マイドライブ');
const festFolder = myRoot.createFolder('謎フェス2026');
const fileParent = new Map([[organizer.id, festFolder]]);
const env = {
  console,
  SpreadsheetApp: {
    getActiveSpreadsheet: () => activeOrg,
    create: (n) => { const b = new Book(n); books.set(b.id, b); return b; },
    openById: (id) => books.get(id),
    getUi: () => ({ alert: (...a) => { alerts.push(a); return 'YES'; }, ButtonSet: { OK: 'OK', YES_NO: 'YES_NO' }, Button: { YES: 'YES' } }),
    BorderStyle: { SOLID: 'SOLID' },
    newDataValidation: () => chain(),
    newConditionalFormatRule: () => chain(),
    flush: () => {},
  },
  DriveApp: {
    createFolder: (n) => myRoot.createFolder(n),
    getRootFolder: () => myRoot,
    getFolderById: (id) => { if (!folders.has(id)) throw new Error('not found'); return folders.get(id); },
    getFileById: (id) => ({
      moveTo: (f) => { fileParent.set(id, f); f.moved.push(id); },
      getParents: () => iter(fileParent.has(id) ? [fileParent.get(id)] : [myRoot]),
      getLastUpdated: () => new Date(2026, 10, 18, 12, 0),
    }),
    Access: { ANYONE_WITH_LINK: 'A' }, Permission: { VIEW: 'V' },
  },
  PropertiesService: { getDocumentProperties: () => ({ getProperty: (k) => activeProps.get(k) ?? null, setProperty: (k, v) => activeProps.set(k, v) }) },
  Session: { getScriptTimeZone: () => 'Asia/Tokyo' },
  Utilities: { formatDate: (d) => String(d) },
};
const code = fs.readFileSync(new URL('../scripts/gas/Code.js', import.meta.url), 'utf8');
const ctx = vm.createContext(env);
vm.runInContext(code, ctx);
// 公演一覧へ反映した後のレポート作成・GitHub 同期は、この検査の対象外
vm.runInContext('ensureReportSheet = () => {}; renderReportSheet = () => {}; exportJsonToGitHub = () => {};', ctx);
const call = (fn) => vm.runInContext(`${fn}()`, ctx);

/* ─────────── 主催スプシの初期状態（今の「設定」と「1.公演かんたん入力」） ─────────── */
const cfg = organizer.insertSheet('設定');
[['設定項目', '設定値'], ['イベント名', 'サンプル謎フェス'], ['開催日数', '2'], ['1日目のラベル', '11/14(土)'], ['2日目のラベル', '11/15(日)']]
  .forEach((r) => cfg.appendRow(r));
const draft = organizer.insertSheet('1.公演かんたん入力');
draft.getRange(2, 1, 1, 19).setValues([[
  '日程', '団体名', '公演名', '会場(部屋)', '開始時間リスト (例: 10:30, 12:00 / 随時: 10:00-12:00, 13:00-18:00)', '所要時間(分)', '参加料金', '定員', '予約形式', '難易度',
  '内容目安 (・区切りでタグ)', '予約URL', '公演ビジュアルURL', '所要時間優先テキスト', '受付終了時間', '完全終了時間', '最終フェーズ表示名', 'ノイズ演出', '南京錠パスワード']]);
// 主催が手で入れた既存の公演（取り込みで消えてはいけない）
draft.getRange(3, 1, 1, 13).setValues([['1日目', '主催', 'オープニング謎', 'ホール', '10:00', 30, 0, '自由', '当日受付(ファミレス式)', 2, '・誰でも', '', '']]);

const setConfig = (key, value) => {
  const rows = cfg.getDataRange().getValues();
  const i = rows.findIndex((r) => r[0] === key);
  cfg.getRange(i + 1, 2).setValue(value);
};
/** 記入用シートの「1_公演概要」で、項目名の行の C 列を書く */
const fill = (book, label, value) => {
  const prof = book.getSheetByName('1_公演概要');
  const rows = prof.getRange(1, 2, prof.getLastRow(), 1).getValues();
  const i = rows.findIndex((r) => String(r[0]).replace('　※必須', '') === label);
  assert.ok(i >= 0, `項目が無い：${label}`);
  prof.getRange(i + 1, 3).setValue(value);
};
const t = (h, m) => new Date(1899, 11, 30, h, m);

test('通し：準備 → 作成 → 記入 → 取り込み → 再取り込み → 公演一覧 → 公開データ', () => {
  call('entrySetupSheets');
  // 旧シート名（設定 / 1.公演かんたん入力）が自動で新しい番号付きシート名へ移行される
  assert.ok(organizer.getSheetByName('1.設定'), '「設定」が「1.設定」へ移行されていない');
  assert.ok(!organizer.getSheetByName('設定'), '旧シート名「設定」が残っている');
  assert.ok(organizer.getSheetByName('3.公演かんたん入力'), '「1.公演かんたん入力」が「3.公演かんたん入力」へ移行されていない');
  assert.ok(!organizer.getSheetByName('1.公演かんたん入力'), '旧シート名「1.公演かんたん入力」が残っている');

  const readme = organizer.getSheetByName('Readme');
  assert.ok(readme, 'Readme シートが作られていない');
  const readmeText = readme.getDataRange().getValues().flat().join('\n');
  assert.ok(readmeText.includes('STEP 1') && readmeText.includes('STEP 4'), 'Readme に基本4ステップが無い');
  assert.ok(readmeText.includes('1.設定') && readmeText.includes('2.団体一覧') && readmeText.includes('3.公演かんたん入力') && readmeText.includes('4.公演一覧'), 'Readme に新シート名が揃っていない');
  assert.ok(readmeText.includes('＋α'), 'Readme に＋αガイドの案内が無い');
  assert.ok(['0分移動可否', '完売公演の選択可否', '非公開モード', 'ノイズ演出', '南京錠パスワード'].every((k) => readmeText.includes(k)), 'Readme に詳細設定・演出リファレンスが無い');
  assert.ok(readmeText.includes('=IMAGE(') && readmeText.includes('readme-organizer-flow.png'), 'Readme にイラスト画像の数式が無い');
  assert.ok(!readmeText.includes('ポスター'), 'Readme に旧表記「ポスター」が残っている');
  assert.ok(!readmeText.includes('entryImportAll') && !readmeText.includes('setupDraftSheet'), '主催向け Readme に英語の関数名が混ざっている');
  assert.ok(readmeText.includes('テレスコープ') && readmeText.includes('@kizunan'), 'Readme に制作クレジット・連絡先（@kizunan）が無い');

  const tabColorOf = (name) => organizer.sheets.find((x) => x.name === name)?.tabColor;
  assert.equal(tabColorOf('Readme'), '#1e1b4b');
  assert.equal(tabColorOf('1.設定'), '#2563eb');
  assert.equal(tabColorOf('2.団体一覧'), '#0f766e');
  assert.equal(tabColorOf('3.公演かんたん入力'), '#16a34a');
  assert.equal(tabColorOf('運営用連絡先'), '#dc2626');

  const groupsRaw = organizer.sheets.find((x) => x.name === '2.団体一覧');
  assert.ok([10, 11, 12].every((c) => groupsRaw.hiddenCols.has(c)), '団体一覧の内部ID列が非表示でない');
  const contactsRaw = organizer.sheets.find((x) => x.name === '運営用連絡先');
  assert.ok(contactsRaw.hiddenCols.has(8), '運営用連絡先のシートID列が非表示でない');

  setConfig('会場の部屋一覧', 'ホール, 第1会議室, 第4会議室');
  const groups = organizer.getSheetByName('2.団体一覧');
  groups.appendRow(['謎解き研究所', 'lab@example.com']);
  groups.appendRow(['ミステリーギルド', 'guild@example.com']);

  call('entryCreateSheets');
  const g = groups.getDataRange().getValues();
  assert.equal(g[1][4], '未着手');
  const book = books.get(g[1][9]);
  assert.ok(book, '記入用シートが作られていない');
  // 作る前に保存先を見せて確かめる
  const confirm = alerts.find((a) => String(a[0]).startsWith('記入用シートを 2 件作ります'));
  assert.ok(confirm && String(confirm[1]).includes('「謎フェス2026」（このスプシと同じフォルダ）'), '保存先の確認が出ていない');
  // 保存先：主催スプシと同じフォルダ ／ 出展団体_<イベント名> ／ 記入用シート・素材。マイドライブ直下には何も作らない
  assert.deepEqual(myRoot.children.map((f) => f.name), ['謎フェス2026']);
  const work = festFolder.children.find((f) => f.name === '出展団体_サンプル謎フェス');
  assert.ok(work, '出展団体のフォルダが無い');
  assert.deepEqual(work.children.map((f) => f.name), ['記入用シート', '素材']);
  assert.deepEqual(work.children[0].moved, [g[1][9], g[2][9]]);
  assert.deepEqual(work.children[1].children.map((f) => f.id), [g[1][10], g[2][10]]);
  // 団体を足してもう一度押しても、フォルダは増えない
  groups.appendRow(['謎屋', 'nazoya@example.com']);
  call('entryCreateSheets');
  assert.equal(festFolder.children.filter((f) => f.name === '出展団体_サンプル謎フェス').length, 1);
  assert.equal(work.children.length, 2);
  assert.equal(work.children[0].moved.length, 3);
  assert.deepEqual(book.editors, ['lab@example.com']);
  assert.ok(folders.get(g[1][10]).editors.includes('lab@example.com'));
  assert.deepEqual(book.getSheets().map((s) => s.getName()), ['はじめに', '1_公演概要', '2_公演スケジュール', '確認']);
  const guide = book.getSheetByName('はじめに');
  const guideText = guide.getDataRange().getValues().flat().join('\n');
  assert.ok(guideText.includes('STEP 1') && guideText.includes('STEP 3'), '出展者向けはじめにに3ステップが無い');
  assert.ok(guideText.includes('=IMAGE(') && guideText.includes('readme-exhibitor-flow.png'), '出展者向けはじめににイラスト画像の数式が無い');
  assert.ok(guideText.includes('迷ったとき'), '出展者向けはじめにに迷ったときQ&Aが無い');
  assert.ok(['予約形式の選び方', 'うち制限時間', 'Webサイトに公開されない項目'].every((k) => guideText.includes(k)), '出展者向けはじめにに迷いやすい項目の説明が無い');
  assert.ok(guideText.includes('必ず運営へ'), '提出後の修正時に運営へ連絡する案内が無い');
  assert.ok(!guideText.includes('ポスター'), '出展者向けはじめにに旧表記「ポスター」が残っている');
  const profSheet = book.getSheetByName('1_公演概要');
  const profRaw = book.sheets.find((x) => x.name === '1_公演概要');
  const groupIdx = profSheet.getRange(1, 2, 60, 1).getValues().findIndex((r) => String(r[0]).includes('団体名'));
  assert.equal(profRaw.bgs[groupIdx][2], '#f1f5f9', '自動欄の背景色が薄いグレー(#f1f5f9)に統一されていない');
  assert.ok(!profRaw.bgs.flat().includes('#dcecfb'), '古い水色(#dcecfb)が残っている');
  // 1つの建物モード：住所や公開会場の必須欄は無く、非公開の要望・希望欄がある
  const labels = book.getSheetByName('1_公演概要').getRange(1, 2, 60, 1).getValues().flat().join('|');
  assert.ok(!labels.includes('会場住所'));
  assert.ok(labels.includes('会場（部屋）についての要望・希望'));
  assert.ok(!labels.includes('会場（部屋）　※必須'));
  const roomReqIdx = profSheet.getRange(1, 2, 60, 1).getValues().findIndex((r) => String(r[0]).includes('会場（部屋）についての要望・希望'));
  assert.equal(profRaw.bgs[roomReqIdx][2], '#fde2e2', '会場の要望欄が非公開ピンク(#fde2e2)になっていない');
  // 団体名は配る時点で入っている
  assert.ok(book.getSheetByName('1_公演概要').getRange(1, 3, 60, 1).getValues().flat().includes('謎解き研究所'));
  // メインビジュアル画像の行：C列にフォルダURLが直接入り、D列にわかりやすい補足がある
  const visualRow = profSheet.getRange(1, 2, 60, 4).getValues().find((r) => String(r[0]) === 'メインビジュアル画像');
  assert.ok(visualRow, '1_公演概要に「メインビジュアル画像」行が無い');
  assert.equal(visualRow[1], g[1][3], '1_公演概要のC列に団体専用フォルダURLが入っていない');
  assert.ok(String(visualRow[2]).includes('左のURLのフォルダにメインビジュアル画像を1枚入れてください') && !String(visualRow[2]).includes('下のフォルダ') && !String(visualRow[2]).includes('ポスター'), 'メインビジュアル画像の補足が更新されていない');
  // 配布直後（フォルダURLが事前入力済みでも未記入状態）の状況確認は「未着手」のまま
  call('entryRefreshStatus');
  assert.equal(groups.getDataRange().getValues()[1][4], '未着手');

  // 団体が記入する
  const v = {
    '担当者名': '山田 太郎', '連絡先メールアドレス': 'yamada@example.com', '当日の緊急連絡先（電話）': '090-1111-2222',
    '公演タイトル': 'からくり時計塔からの脱出', 'キャッチコピー': '止まった時計が、真実を指す。', '公演紹介文': '紹介文',
    '公演形式': 'ルーム型', '所要時間（分）': 60, '1回あたりの定員（人）': 24, '難易度': '5', '料金（円・税込）': 2500,
    '予約形式': '事前予約', '予約（チケット）URL': 'https://example.com/t', '会場（部屋）についての要望・希望': '第1会議室希望（暗転あり）',
    '運営への連絡事項': '搬入は9時以降',
  };
  Object.entries(v).forEach(([k, val]) => fill(book, k, val));
  const sched = book.getSheetByName('2_公演スケジュール');
  sched.getRange(6, 3, 3, 2).setValues([['1日目（11/14(土)）', t(14, 0)], ['1日目（11/14(土)）', t(11, 0)], ['2日目（11/15(日)）', t(10, 30)]]);
  sched.getRange(7, 7).setValue(20);
  folders.get(g[1][10]).files.push({ getMimeType: () => 'image/png', setSharing: () => {}, getUrl: () => 'https://drive.google.com/file/d/POSTER/view' });

  // 提出前は取り込まない
  call('entryRefreshStatus');
  assert.equal(groups.getDataRange().getValues()[1][4], '記入中');
  call('entryImportAll');
  assert.equal(draft.getLastRow(), 3, '提出前なのに取り込まれた');

  fill(book, '提出する', true);
  call('entryRefreshStatus');
  assert.equal(groups.getDataRange().getValues()[1][4], '提出済み（未取り込み）');
  call('entryImportAll');

  const head = draft.getRange(2, 1, 1, draft.getLastColumn()).getValues()[0];
  const rows = draft.getRange(3, 1, draft.getLastRow() - 2, head.length).getValues();
  assert.equal(rows.length, 3, '既存 1 行 ＋ 取り込み 2 日分');
  assert.equal(rows[0][2], 'オープニング謎', '主催が手で入れた行が消えた');
  const col = (h) => head.indexOf(h);
  const day1 = rows.find((r) => r[0] === '1日目' && r[1] === '謎解き研究所');
  assert.equal(day1[3], '未定');
  assert.equal(day1[4], '11:00, 14:00');
  assert.equal(day1[12], 'https://drive.google.com/file/d/POSTER/view');
  assert.equal(day1[col('キャッチコピー')], '止まった時計が、真実を指す。');
  assert.equal(day1[col('回ごとの定員')], '11:00=20');
  assert.equal(day1[col('取り込み元(記入用シートID)')], book.getId());
  const draftRaw = organizer.sheets.find((x) => x.name === '3.公演かんたん入力');
  assert.ok(draftRaw.hiddenCols.has(col('回ごとの定員') + 1), '回ごとの定員列が非表示でない');
  assert.ok(draftRaw.hiddenCols.has(col('取り込み元(記入用シートID)') + 1), '取り込み元列が非表示でない');
  assert.equal(groups.getDataRange().getValues()[1][4], '取り込み済み');

  const contacts = organizer.getSheetByName('運営用連絡先').getDataRange().getValues();
  assert.equal(contacts.length, 2);
  assert.equal(contacts[1][3], 'yamada@example.com');
  assert.ok(contacts[1][5].includes('【会場希望】第1会議室希望（暗転あり）') && contacts[1][5].includes('搬入は9時以降'));

  // 変更なしなら何もしない
  const logLen = organizer.getSheetByName('取り込み履歴').getLastRow();
  call('entryImportAll');
  assert.equal(organizer.getSheetByName('取り込み履歴').getLastRow(), logLen);

  // 主催が取り込んだ行を消しても、もう一度取り込める（記入用シートは変えていない）
  const ourRows = () => draft.getRange(3, 1, draft.getLastRow() - 2, draft.getLastColumn()).getValues()
    .map((r, k) => ({ r, k })).filter((x) => x.r[1] === '謎解き研究所');
  ourRows().reverse().forEach((x) => draft.deleteRow(3 + x.k));
  assert.equal(ourRows().length, 0);
  call('entryRefreshStatus');
  assert.equal(groups.getDataRange().getValues()[1][4], '取り込み済みの行が消えています（もう一度取り込めます）');
  call('entryImportAll');
  assert.equal(ourRows().length, 2, '消した行が入れ直されていない');
  assert.equal(groups.getDataRange().getValues()[1][4], '取り込み済み');
  const relog = organizer.getSheetByName('取り込み履歴').getDataRange().getValues();
  assert.deepEqual(relog.filter((r) => r[4] === '（消えていた行を入れ直し）').map((r) => [r[3], r[7]]), [['1日目', '反映'], ['2日目', '反映']]);
  // 2 日分のうち 1 行だけ消した場合も、重複させずに 2 行へ戻す
  draft.deleteRow(3 + ourRows()[0].k);
  call('entryImportAll');
  assert.equal(ourRows().length, 2);
  // そろっていれば、また何もしない
  const logLen2 = organizer.getSheetByName('取り込み履歴').getLastRow();
  call('entryImportAll');
  assert.equal(organizer.getSheetByName('取り込み履歴').getLastRow(), logLen2);

  // 差し替え：料金を直し、2日目をやめる
  fill(book, '料金（円・税込）', 3000);
  sched.getRange(8, 3, 1, 2).setValues([['', '']]);
  call('entryRefreshStatus');
  assert.equal(groups.getDataRange().getValues()[1][4], '提出後に変更あり');
  call('entryImportAll');
  const rows2 = draft.getRange(3, 1, draft.getLastRow() - 2, head.length).getValues();
  assert.equal(rows2.filter((r) => r[1] === '謎解き研究所').length, 1, '前回の行が残って重複した');
  assert.equal(String(rows2.find((r) => r[1] === '謎解き研究所')[6]), '3000');
  const log = organizer.getSheetByName('取り込み履歴').getDataRange().getValues();
  assert.ok(log.some((r) => r[4] === '参加料金' && String(r[5]) === '2500' && String(r[6]) === '3000'));
  assert.ok(log.some((r) => r[4] === '（日程を削除）' && r[3] === '2日目'));
  assert.equal(organizer.getSheetByName('運営用連絡先').getDataRange().getValues().length, 2, '連絡先が重複した');

  // 公演一覧へ反映 → 公開データ
  call('expandDraftToTimetable');
  const main = organizer.getSheetByName('4.公演一覧');
  const mainHead = main.getRange(1, 1, 1, main.getLastColumn()).getValues()[0];
  assert.ok(mainHead.includes('キャッチコピー'));
  assert.ok(!mainHead.includes('取り込み元(記入用シートID)'), '照合用の列が公開側に出た');
  assert.ok(!mainHead.includes('回ごとの定員'), '回ごとの定員列が公開側に出た');
  const exported = vm.runInContext('generateExportData(SpreadsheetApp.getActiveSpreadsheet())', ctx);
  const json = JSON.stringify(exported);
  assert.ok(!json.includes('回ごとの定員'), '公開データに回ごとの定員の見出しが入った');
  assert.ok(!Object.keys(exported.config).some((k) => k.startsWith('■') || k.startsWith('▼')), '設定の区切り行が config に入った');
  for (const secret of ['山田 太郎', 'yamada@example.com', '090-1111-2222', '搬入は9時以降', '第1会議室希望（暗転あり）', book.getId()]) {
    assert.ok(!json.includes(secret), `公開データに ${secret} が入っている`);
  }
  const show = exported.shows.find((s) => s['公演名'] === 'からくり時計塔からの脱出' && s['開始時間(hh:mm)'] === '11:00');
  const show14 = exported.shows.find((s) => s['公演名'] === 'からくり時計塔からの脱出' && s['開始時間(hh:mm)'] === '14:00');
  assert.ok(!Object.keys(show).some((k) => k.startsWith('【')), 'ボタン配置見出しが公開データに入った');
  assert.equal(show['定員'], '20');
  assert.equal(show14['定員'], '24');
  assert.equal(show['キャッチコピー'], '止まった時計が、真実を指す。');
  assert.equal(show['参加料金'], '3000');
  assert.ok(exported.shows.some((s) => s['公演名'] === 'オープニング謎'));

  // 主催が「1.公演かんたん入力」で直した値は、団体が別の所を直して取り込み直しても消えない
  const labRowNo = () => 3 + draft.getRange(3, 1, draft.getLastRow() - 2, 2).getValues().findIndex((r) => r[1] === '謎解き研究所');
  const before = labRowNo();
  const catchCol = head.indexOf('キャッチコピー') + 1;
  draft.getRange(before, 3).setValue('からくり時計塔からの脱出！');          // 主催だけが直す：公演名
  draft.getRange(before, 4).setValue('第1会議室');                          // 主催だけが割り当てる：会場(部屋)
  draft.getRange(before, catchCol).setValue('止まった時計が、真実を指し示す。'); // 主催も団体も直す：キャッチコピー
  fill(book, '所要時間（分）', 70);                                          // 団体だけが直す：所要時間
  fill(book, 'キャッチコピー', '時計が止まった、その理由。');
  alerts.length = 0;
  call('entryImportAll');
  const rowNo = labRowNo();
  assert.equal(rowNo, before, '行の位置が変わった（主催の並び順を崩さない）');
  const lab = draft.getRange(rowNo, 1, 1, head.length).getValues()[0];
  assert.equal(lab[2], 'からくり時計塔からの脱出！', '主催が直した公演名が戻された');
  assert.equal(lab[3], '第1会議室', '主催が割り当てた会場(部屋)が戻された');
  assert.equal(draft.bgs[rowNo - 1][2], '#dbeafe', '主催だけが修正したセルが水色になっていない');
  assert.equal(draft.bgs[rowNo - 1][3], '#dbeafe', '主催が割り当てた会場(部屋)セルが水色になっていない');
  const titleNote = String(draft.getRange(rowNo, 3).getNote());
  assert.ok(titleNote.startsWith('【主催が修正済】') && titleNote.includes('からくり時計塔からの脱出'));
  assert.equal(String(lab[5]), '70', '団体が直した所要時間が入っていない');
  assert.equal(lab[catchCol - 1], '止まった時計が、真実を指し示す。', 'ぶつかったセルは主催の値を残す');
  const catchCell = draft.getRange(rowNo, catchCol);
  assert.ok(String(catchCell.getNote()).startsWith('【取り込み・要確認】') && String(catchCell.getNote()).includes('時計が止まった、その理由。'));
  assert.equal(draft.bgs[rowNo - 1][catchCol - 1], '#fde68a');
  assert.equal(groups.getDataRange().getValues()[1][4], '取り込み済み（要確認 1 か所）');
  call('entryRefreshStatus');
  assert.equal(groups.getDataRange().getValues()[1][4], '取り込み済み（要確認 1 か所）');
  const log3 = organizer.getSheetByName('取り込み履歴').getDataRange().getValues();
  assert.equal(log3[0][7], '扱い');
  assert.ok(log3.some((r) => r[4] === 'キャッチコピー（主催の値を残しました）' && r[5] === '止まった時計が、真実を指し示す。' && r[6] === '時計が止まった、その理由。' && r[7] === '要確認'));
  assert.ok(log3.some((r) => r[4] === '所要時間(分)' && String(r[6]) === '70' && r[7] === '反映'));
  assert.ok(!log3.some((r) => String(r[4]).startsWith('公演名')), '主催だけが直したセルを履歴に出した');
  assert.ok(String(alerts[0][1]).includes('要確認：1 か所'));
  // 控えは隠しシート
  assert.ok(organizer.sheets.find((x) => x.name === '_取り込み控え').hidden);

  // 主催が団体の値を受け入れて書き換えた後、団体が別の所を直したら、印は外れ、主催の公演名は残る
  draft.getRange(rowNo, catchCol).setValue('時計が止まった、その理由。');
  fill(book, '料金（円・税込）', 3500);
  call('entryImportAll');
  const lab2 = draft.getRange(rowNo, 1, 1, head.length).getValues()[0];
  assert.equal(String(lab2[6]), '3500');
  assert.equal(lab2[2], 'からくり時計塔からの脱出！');
  // 料金のセルは要確認の印が無いので、印の扱いは変わらない。キャッチコピーの印は、そのセルを団体が次に直したときに外れる
  fill(book, 'キャッチコピー', '時計が止まった。その理由を探せ。');
  call('entryImportAll');
  assert.equal(draft.getRange(rowNo, catchCol).getValue(), '時計が止まった。その理由を探せ。');
  assert.equal(draft.getRange(rowNo, catchCol).getNote(), '');
  assert.equal(draft.bgs[rowNo - 1][catchCol - 1], '');
  assert.equal(groups.getDataRange().getValues()[1][4], '取り込み済み');

  // もう一度ぶつけた後、entryClearCheckMarks() で確認済みにできる（主催修正済みの水色は残る）
  draft.getRange(rowNo, catchCol).setValue('主催の別案コピー');
  fill(book, 'キャッチコピー', '団体の別案コピー');
  call('entryImportAll');
  assert.equal(groups.getDataRange().getValues()[1][4], '取り込み済み（要確認 1 か所）');
  assert.equal(draft.bgs[rowNo - 1][catchCol - 1], '#fde68a');
  call('entryClearCheckMarks');
  assert.equal(draft.getRange(rowNo, catchCol).getValue(), '主催の別案コピー');
  assert.equal(draft.getRange(rowNo, catchCol).getNote(), '');
  assert.equal(draft.bgs[rowNo - 1][catchCol - 1], '');
  assert.equal(groups.getDataRange().getValues()[1][4], '取り込み済み');
  assert.equal(draft.bgs[rowNo - 1][2], '#dbeafe');
  assert.ok(String(draft.getRange(rowNo, 3).getNote()).startsWith('【主催が修正済】'));
});

test('未記入があると取り込まず、理由を団体一覧に出す', () => {
  const groups = organizer.getSheetByName('2.団体一覧');
  const g = groups.getDataRange().getValues();
  const book = books.get(g[2][9]); // ミステリーギルド
  fill(book, '公演タイトル', '電脳都市の暗号');
  fill(book, '提出する', true);
  const before = draft.getLastRow();
  call('entryImportAll');
  assert.equal(draft.getLastRow(), before);
  const row = groups.getDataRange().getValues()[2];
  assert.equal(row[4], '提出済み（未記入あり・取り込めません）');
  assert.ok(String(row[5]).includes('未記入：キャッチコピー'));
});

test('setupDraftSheet 初期化と難易度プリセット（★1〜★5・使わない）', () => {
  const fresh = new Book('新規フェス 管理');
  fileParent.set(fresh.id, festFolder);
  activeOrg = fresh;
  activeProps = new Map();
  try {
    call('setupDraftSheet');
    const freshDraft = fresh.getSheetByName('3.公演かんたん入力');
    const freshCfg = fresh.getSheetByName('1.設定');
    const freshGroups = fresh.getSheetByName('2.団体一覧');
    const freshMain = fresh.getSheetByName('4.公演一覧');
    assert.ok(freshCfg && fresh.getSheetByName('Readme') && freshGroups && freshMain && fresh.getSheetByName('運営用連絡先') && fresh.getSheetByName('取り込み履歴'));
    assert.deepEqual(
      fresh.getSheets().map((s) => s.getName()).slice(0, 7),
      ['Readme', '1.設定', '2.団体一覧', '3.公演かんたん入力', '4.公演一覧', '運営用連絡先', '取り込み履歴'],
      'タブの並び順が手順通りでない',
    );
    assert.equal(fresh.sheets.find((x) => x.name === '4.公演一覧')?.tabColor, '#7c3aed');
    assert.equal(freshDraft.getLastRow(), 6, '初期サンプル4件＋見出し2行が入っていない');

    // styleConfigSheet_：◎推奨の値セルは白(#ffffff)、カスタムの「◎2日以上〜」説明も上書きしない
    const freshCfgRaw = fresh.sheets.find((x) => x.name === '1.設定');
    const subRow = freshCfg.getDataRange().getValues().findIndex((row) => String(row[0] || '').trim() === 'サブタイトル');
    assert.equal(freshCfgRaw.bgs[subRow][1], '#ffffff', '◎推奨セルの背景色が白(#ffffff)でない');
    const day2Row = freshCfg.getDataRange().getValues().findIndex((row) => String(row[0] || '').trim() === '2日目のラベル');
    assert.ok(String(freshCfg.getRange(day2Row + 1, 3).getValue()).startsWith('◎2日以上の場合必須'));
    freshCfg.getRange(day2Row + 1, 3).setValue('◎2日以上の場合必須｜カスタム説明テスト');
    vm.runInContext('styleConfigSheet_(getConfigSheet(SpreadsheetApp.getActiveSpreadsheet()))', ctx);
    assert.equal(freshCfg.getRange(day2Row + 1, 3).getValue(), '◎2日以上の場合必須｜カスタム説明テスト');

    const setFreshCfg = (k, val) => {
      const r = freshCfg.getDataRange().getValues().findIndex((row) => String(row[0] || '').trim() === k);
      assert.ok(r >= 0, `設定項目が無い: ${k}`);
      freshCfg.getRange(r + 1, 2).setValue(val);
    };
    setFreshCfg('会場の部屋一覧', '');
    setFreshCfg('難易度の表し方', '★1〜★5');

    freshGroups.appendRow(['星劇団', 'star@example.com']);
    call('entryCreateSheets'); // 部屋一覧が空でも配布できること
    const gStar = freshGroups.getDataRange().getValues()[1];
    const bookStar = books.get(gStar[9]);
    const starLabels = bookStar.getSheetByName('1_公演概要').getRange(1, 2, 60, 1).getValues().flat().join('|');
    assert.ok(starLabels.includes('難易度'), '★1〜★5 では難易度の欄が必要');
    [
      ['担当者名', '星 太郎'], ['連絡先メールアドレス', 'star@example.com'], ['当日の緊急連絡先（電話）', '090-2222-3333'],
      ['公演タイトル', '星の迷宮'], ['キャッチコピー', '星を辿れ。'], ['公演紹介文', '紹介文です'],
      ['公演形式', 'ルーム型'], ['所要時間（分）', 45], ['1回あたりの定員（人）', 12], ['難易度', '★3'],
      ['料金（円・税込）', 2000], ['予約形式', '事前予約'], ['予約（チケット）URL', 'https://example.com/star'],
      ['提出する', true],
    ].forEach(([k, val]) => fill(bookStar, k, val));
    bookStar.getSheetByName('2_公演スケジュール').getRange(6, 3, 1, 2).setValues([['1日目（11/14(土)）', t(12, 0)]]);
    call('entryImportAll');
    const starDraftRow = freshDraft.getDataRange().getValues().find((r) => r[1] === '星劇団');
    assert.equal(starDraftRow[3], '未定');
    assert.equal(starDraftRow[9], '★3');

    // 「使わない」に切り替えて新しい団体用シートを作ると難易度欄が消え、"-" としてエラーなく取り込まれる
    setFreshCfg('難易度の表し方', '使わない');
    freshGroups.appendRow(['無難劇団', 'none@example.com']);
    call('entryCreateSheets');
    const gNone = freshGroups.getDataRange().getValues()[2];
    const bookNone = books.get(gNone[9]);
    const noneLabels = bookNone.getSheetByName('1_公演概要').getRange(1, 2, 60, 1).getValues().flat().join('|');
    assert.ok(!noneLabels.includes('難易度'), '「使わない」設定なのに難易度の欄が出ている');
    [
      ['担当者名', '無 太郎'], ['連絡先メールアドレス', 'none@example.com'], ['当日の緊急連絡先（電話）', '090-4444-5555'],
      ['公演タイトル', '記号なき謎'], ['キャッチコピー', '難易度表記なし公演。'], ['公演紹介文', '紹介文です'],
      ['公演形式', 'ルーム型'], ['所要時間（分）', 30], ['1回あたりの定員（人）', 10],
      ['料金（円・税込）', 1500], ['予約形式', '事前予約'], ['予約（チケット）URL', 'https://example.com/none'],
      ['提出する', true],
    ].forEach(([k, val]) => fill(bookNone, k, val));
    bookNone.getSheetByName('2_公演スケジュール').getRange(6, 3, 1, 2).setValues([['1日目（11/14(土)）', t(15, 0)]]);
    call('entryImportAll');
    assert.equal(freshGroups.getDataRange().getValues()[2][4], '取り込み済み');
    const noneDraftRow = freshDraft.getDataRange().getValues().find((r) => r[1] === '無難劇団');
    assert.equal(noneDraftRow[9], '-');
  } finally {
    activeOrg = organizer;
    activeProps = props;
  }
});

test('2.団体一覧：見えるリンク(C列)を消せば、非表示の _シートID(J列) が残っていても作り直せる', () => {
  const fresh = new Book('再作成テスト 管理');
  fileParent.set(fresh.id, festFolder);
  activeOrg = fresh;
  activeProps = new Map();
  try {
    call('setupDraftSheet');
    const freshCfg = fresh.getSheetByName('1.設定');
    const r = freshCfg.getDataRange().getValues().findIndex((row) => String(row[0] || '').trim() === '会場の部屋一覧');
    freshCfg.getRange(r + 1, 2).setValue('A室');
    const freshGroups = fresh.getSheetByName('2.団体一覧');
    freshGroups.appendRow(['テスト団体β', 'beta@example.com']);

    call('entryCreateSheets');
    const created = freshGroups.getDataRange().getValues()[1];
    const oldId = created[9];
    assert.ok(created[2] && oldId);

    // 主催が見える列（C〜I列）を消去し、非表示の J〜L 列（_シートID・_フォルダID・_指紋）だけが残った状態を再現
    freshGroups.getRange(2, 3, 1, 7).setValues([['', '', '', '', '', '', '']]);
    freshGroups.getRange(2, 12).setValue('7cc9d134');

    // 状況確認は古い非表示IDを勝手に拾わない
    call('entryRefreshStatus');
    assert.equal(freshGroups.getRange(2, 5).getValue(), '');

    // 記入用シートを作る → 新しいシートが作成され、C列と J〜L列 が新しくなる
    call('entryCreateSheets');
    const recreated = freshGroups.getDataRange().getValues()[1];
    assert.notEqual(recreated[9], oldId, '古い _シートID のまま作り直されていない');
    assert.ok(String(recreated[2]).includes(recreated[9]), '新しいシートURLがC列に入っていない');
    assert.equal(recreated[4], '未着手');
    assert.equal(recreated[11], '', '古い _指紋 がクリアされていない');
  } finally {
    activeOrg = organizer;
    activeProps = props;
  }
});
