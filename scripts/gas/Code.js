/**
 * ==========================================================================
 * 謎解きフェス・イベント特化型 ハシゴタイムテーブル
 * スプレッドシート自動化スクリプト (Universal Timetable Core v2.0)
 * ==========================================================================
 * 
 * 主な機能:
 * 1. 1公演1行の「公演かんたん入力」から「公演一覧」へ全自動展開
 * 2. ボタンクリック（図形描画ボタン）での手動一括反映
 * 3. 展開後の「公演一覧」での個別編集・完売設定のカスタマイズ対応
 * 4. Web API (doGet) によるJSON配信
 */

// シート名の定義（左から順：Readme → 1.設定 → 2.団体一覧 → 3.公演かんたん入力 → 4.公演一覧 → 補助タブ）
const SHEET_README = "Readme";
const SHEET_CONFIG = "1.設定";
const SHEET_GROUPS = "2.団体一覧";
const SHEET_DRAFT = "3.公演かんたん入力";
const SHEET_MAIN = "4.公演一覧";
const SHEET_CONTACTS = "運営用連絡先";
const SHEET_IMPORT_LOG = "取り込み履歴";
const SHEET_REPORT = "利用レポート";
const SHEET_RAW_LOG = "_集計ログ";
const README_IMAGE_BASE_URL = "https://raw.githubusercontent.com/nazotoki-timetable/nazotoki-timetable-core/main/docs/images";

/** 旧シート名にも対応しつつ「設定」シートを取得 */
function getConfigSheet(ss) {
  return ss.getSheetByName(SHEET_CONFIG) || ss.getSheetByName("設定");
}

/** 旧シート名にも対応しつつ「団体一覧」シートを取得 */
function getGroupsSheet(ss) {
  return ss.getSheetByName(SHEET_GROUPS) || ss.getSheetByName("団体一覧");
}

/** 旧シート名にも対応しつつ「公演かんたん入力」シートを取得 */
function getDraftSheet(ss) {
  return ss.getSheetByName(SHEET_DRAFT) ||
         ss.getSheetByName("1.公演かんたん入力") ||
         ss.getSheetByName("① 公演かんたん入力") ||
         ss.getSheetByName("入力補助シート");
}

/**
 * 公演データが格納された本番シートを取得（過去のシート名にも完全互換対応）
 */
function getMainSheet(ss) {
  return ss.getSheetByName(SHEET_MAIN) ||
         ss.getSheetByName("2.公演一覧") ||
         ss.getSheetByName("② 公演一覧") ||
         ss.getSheetByName("公演一覧") ||
         ss.getSheetByName("公演データ");
}

/** 主催スプシの表示タブを順番通り（左→右）に並べ、見分けやすいタブ色を付ける */
function arrangeOrganizerTabs_(ss) {
  const specs = [
    { sheet: ss.getSheetByName(SHEET_README), color: "#1e1b4b" },
    { sheet: getConfigSheet(ss), color: "#2563eb" },
    { sheet: getGroupsSheet(ss), color: "#0f766e" },
    { sheet: getDraftSheet(ss), color: "#16a34a" },
    { sheet: getMainSheet(ss), color: "#7c3aed" },
    { sheet: ss.getSheetByName(SHEET_CONTACTS), color: "#dc2626" },
    { sheet: ss.getSheetByName(SHEET_IMPORT_LOG), color: "#64748b" },
    { sheet: ss.getSheetByName(SHEET_REPORT), color: "#64748b" }
  ];
  let pos = 1;
  specs.forEach((sp) => {
    const sh = sp.sheet;
    if (!sh) return;
    try { if (typeof sh.setTabColor === "function") sh.setTabColor(sp.color); } catch (_) {}
    try {
      if (typeof ss.moveActiveSheet === "function") {
        ss.setActiveSheet(sh);
        ss.moveActiveSheet(pos);
      }
      pos++;
    } catch (_) {}
  });
}

/**
 * スプレッドシートを開いたときにメニューを追加
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("タイムテーブル連携")
    .addItem("【初回】全シートをセットアップ（Readme含む）", "setupDraftSheet")
    .addItem("使い方マニュアル（Readme）を更新", "refreshReadmeSheet")
    .addSeparator()
    .addItem("公演一覧へ反映する（ボタン割り当て用）", "expandDraftToTimetable")
    .addItem("Web公開用JSONをGitHubへ同期", "manualExportJsonToGitHub")
    .addSeparator()
    .addItem("【出展団体】準備する（団体一覧・運営用連絡先・取り込み履歴）", "entrySetupSheets")
    .addItem("【出展団体】記入用シートを作る（未作成の団体分）", "entryCreateSheets")
    .addItem("【出展団体】記入状況を確認する", "entryRefreshStatus")
    .addItem("【出展団体】全団体から取り込む", "entryImportAll")
    .addItem("【出展団体】「要確認」の印を消す", "entryClearCheckMarks")
    .addSeparator()
    .addItem("利用レポートを更新・表示", "refreshAnalyticsReport")
    .addItem("利用レポートの集計をリセット", "resetAnalyticsData")
    .addSeparator()
    .addItem("GitHubアクセストークンを設定", "setupGitHubToken")
    .addItem("GitHubアクセストークンを削除", "clearGitHubToken")
    .addToUi();
}

/**
 * 「設定」シートの基本設定項目（重要度: required / recommended / admin）
 */
function getConfigDefinitions_() {
  return [
    ["イベント名", "サンプル謎フェス タイムテーブル", "★必須｜ページ見出し・ブラウザタイトルに使用", "required"],
    ["サブタイトル", "2026.11.14 - 11.15 | MYSTERY FESTIVAL", "◎推奨｜タイトル上部に表示される英字・日程帯", "recommended"],
    ["開催日(YYYYMMDD)", "2026.11.14-11.15", "★必須｜開催日程の表示文字列またはYYYYMMDD", "required"],
    ["開催日数", "1", "★必須｜1〜3などの日数（複数日の場合は日程切替が出ます）", "required"],
    ["1日目のラベル", "11/14(土)", "★必須｜DAY 1 横に表示する日付ラベル", "required"],
    ["2日目のラベル", "11/15(日)", "◎2日以上の場合必須｜DAY 2 横に表示する日付ラベル", "recommended"],
    ["3日目のラベル", "", "◎3日以上の場合必須｜DAY 3 横に表示する日付ラベル（※4日以上の場合は応相談）", "recommended"],
    ["開始時間(hh:mm)", "10:00", "★必須｜タイムテーブル左軸の開始時刻", "required"],
    ["終了時間(hh:mm)", "18:00", "★必須｜タイムテーブル左軸の終了時刻", "required"],
    ["会場のモード", ENTRY_MODE_SINGLE, "★必須｜1つの建物 … 部屋割りは主催が行う（団体からは要望のみ受付） ／ 複数の建物 … 団体ごとに会場名と住所を書く", "required"],
    ["会場の部屋一覧", "ホール, 第1会議室, 第4会議室", "◎推奨（1つの建物のとき）｜主催が部屋割りするときのプルダウン候補（, 区切り）。会場マップの部屋名と一致させます", "recommended"],
    ["タイムテーブルの刻み幅(分)", "30", "◎推奨｜横罫線の刻み幅（通常は30）", "recommended"],
    ["0分移動可否", "0分移動NG", "◎推奨｜0分移動NG（前後5分バッファ必須） / 0分移動OK", "recommended"],
    ["完売公演の選択可否", "選択NG", "◎推奨｜選択NG / 選択OK", "recommended"],
    ["難易度の表し方", "1〜10", "◎推奨｜1〜10 ／ 1〜5 ／ ★1〜★5 ／ 初級・中級・上級 ／ 使わない から選択", "recommended"],
    ["SNSハッシュタグ", "#謎解きタイムテーブル", "◎推奨｜My ハシゴテーブル下部に表示するハッシュタグ", "recommended"],
    ["SNSシェアテキスト", "", "◎推奨｜Xシェア時の初期文面（未入力時はイベント名で自動生成）", "recommended"],
    ["ヘッダー画像URL", "", "◎推奨｜空欄時はデフォルト背景。GoogleドライブURLも指定可", "recommended"],
    ["ロゴ画像URL", "", "◎推奨｜My ハシゴテーブル上部に載せるロゴ画像URL（任意）", "recommended"],
    ["チケット題字画像URL", "", "◎推奨｜My ハシゴテーブルの題字を置き換える画像（任意・空欄時は文字）", "recommended"],
    ["公演形式の選択肢", "ルーム型, ホール型, カフェ型, ブース型, 周遊型, スタジアム型, その他", "◎推奨｜記入用シートの「公演形式」のプルダウン（, 区切り）", "recommended"],
    ["記入の締切", "", "◎推奨｜記入用シートの「はじめに」に表示する締切（例: 2026年12月6日(日)）", "recommended"],
    ["タイムテーブルメインカラー", "#5b21b6", "◎推奨｜Web表示のテーマメインカラー (HEX)", "recommended"],
    ["タイムテーブルアクセントカラー", "#facc15", "◎推奨｜選択中カードの強調色 (HEX)", "recommended"],
    ["チケット箔の色", "#8a1c2b", "◎推奨｜My ハシゴテーブルの外枠・題字・番号・ハッシュタグの色 (HEX)", "recommended"],
    ["チケット文字の色", "#252a40", "◎推奨｜My ハシゴテーブルの本文・消印のインク色 (HEX)", "recommended"],
    ["チケット紙の色", "#f4eedf", "◎推奨｜My ハシゴテーブルの紙の色 (HEX)。明るい色を推奨", "recommended"],
    ["非公開モード", "OFF", "⚙管理｜OFF / 非公開モードON", "admin"],
    ["非公開モード:準備中メッセージ", "タイムテーブル準備中...", "⚙管理｜非公開モードON時に表示する案内文", "admin"],
    ["保存先フォルダ", "", "⚙管理｜記入用シート・素材フォルダを作る場所（ドライブのフォルダURL）。空欄ならこのスプシと同じ場所", "admin"],
    ["GitHubリポジトリ", "", "⚙管理｜例: owner/repo-name（テスト用コピーでは必ず空欄にしてください）", "admin"],
    ["GitHubブランチ", "main", "⚙管理｜同期先ブランチ名", "admin"],
    ["GitHub保存先パス", "public/data.json", "⚙管理｜リポジトリ内の保存パス", "admin"],
    ["効果測定GAS URL", "", "⚙管理｜利用レポート集計用のGAS WebアプリURL（/exec で終わるURL）", "admin"],
    ["GA4測定ID", "", "⚙管理｜Google Analytics 4 測定ID（例: G-XXXXXXXXXX / 空欄時は無効）", "admin"],
    ["会場マップURL", "", "⚙管理｜会場マップ（venue_map.json）のURL。空欄なら移動ルート機能は出ません", "admin"]
  ];
}

/**
 * 「設定」シートに重要度色分け・入力規則・操作ガイドを整える（B列の既存値は上書きしない）
 */
function styleConfigSheet_(sheet) {
  if (!sheet) return;
  const defs = getConfigDefinitions_();
  const tierByKey = {};
  const badgeByKey = {};
  defs.forEach((d) => {
    tierByKey[d[0]] = d[3];
    badgeByKey[d[0]] = d[2];
  });

  const lastRow = sheet.getLastRow();
  if (lastRow >= 1) {
    sheet.getRange(1, 1, 1, 3).setBackground("#1f2937").setFontColor("#ffffff").setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  if (lastRow >= 2) {
    const rows = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
    rows.forEach((r, idx) => {
      const key = String(r[0] || "").trim();
      const tier = tierByKey[key];
      if (!key || !tier) return;
      const rowNo = 2 + idx;
      const valCell = sheet.getRange(rowNo, 2);
      const labelCell = sheet.getRange(rowNo, 1);
      const descCell = sheet.getRange(rowNo, 3);
      if (tier === "required") {
        labelCell.setBackground("#dbeafe").setFontColor("#1e3a8a").setFontWeight("bold");
        valCell.setBackground("#fff4b8");
      } else if (tier === "admin") {
        labelCell.setBackground("#f1f5f9").setFontColor("#475569").setFontWeight("normal");
        valCell.setBackground("#f8fafc");
      } else {
        labelCell.setBackground("#ffffff").setFontColor("#1f2937").setFontWeight("normal");
        valCell.setBackground("#ffffff");
      }
      const curDesc = String(r[2] || "").trim();
      if (!curDesc || !/^(★|◎|⚙)/.test(curDesc)) {
        descCell.setValue(badgeByKey[key] || curDesc);
      }
      if (key === "会場のモード") {
        valCell.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList([ENTRY_MODE_SINGLE, ENTRY_MODE_MULTI], true).build());
      } else if (key === "難易度の表し方") {
        valCell.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(ENTRY_DIFFICULTY_PRESETS, true).build());
      } else if (key === "0分移動可否") {
        valCell.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(["0分移動NG", "0分移動OK"], true).setAllowInvalid(true).build());
      } else if (key === "完売公演の選択可否") {
        valCell.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(["選択NG", "選択OK"], true).setAllowInvalid(true).build());
      } else if (key === "非公開モード") {
        valCell.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(["OFF", "非公開モードON"], true).setAllowInvalid(true).build());
      }
    });
  }

  // 右側（E1:G5）にステップ案内と色の凡例を配置（A〜C列の設定読込を妨げない）
  try { sheet.getRange("E1:G5").breakApart().clearContent(); } catch (_) {}
  sheet.getRange("E1:G1").merge()
    .setValue("【STEP 1】基本設定ガイド")
    .setBackground("#1e3a8a").setFontColor("#ffffff").setFontWeight("bold").setHorizontalAlignment("center");
  sheet.getRange("E2:G5").setValues([
    ["① 黄色のセル（★必須）をすべて記入してください", "", ""],
    ["② （◎推奨）はお好みで変更できます", "", ""],
    ["③ 灰色（⚙管理）は初期設定済みのため通常触らなくてOK", "", ""],
    ["④ 終わったら「" + SHEET_GROUPS + "」タブへ進み、団体を登録してください", "", ""]
  ]);
  ["E2:G2", "E3:G3", "E4:G4", "E5:G5"].forEach((rng, i) => {
    const bg = i === 0 ? "#fff4b8" : i === 1 ? "#ffffff" : i === 2 ? "#f8fafc" : "#dbeafe";
    sheet.getRange(rng).merge().setBackground(bg).setFontWeight(i === 0 || i === 3 ? "bold" : "normal");
  });
  if (SpreadsheetApp.BorderStyle) {
    sheet.getRange("E1:G5").setBorder(true, true, true, true, true, true, "#cbd5e1", SpreadsheetApp.BorderStyle.SOLID);
  }
  sheet.setColumnWidth(1, 220);
  sheet.setColumnWidth(2, 260);
  sheet.setColumnWidth(3, 460);
  sheet.setColumnWidth(5, 160);
  sheet.setColumnWidth(6, 160);
  sheet.setColumnWidth(7, 160);
}

/**
 * 「1.公演かんたん入力」の1行目操作バー・色分け・列グループ・内部列非表示を整える
 */
function styleDraftSheet_(draftSheet, diffPreset, rooms) {
  if (!draftSheet) return;
  try { draftSheet.getRange("A1:S1").breakApart().clearContent(); } catch (_) {}
  draftSheet.getRange("A1:B1").merge()
    .setValue("【STEP 3】確認・手直し")
    .setBackground("#1e3a8a")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  draftSheet.getRange("C1:E1").merge()
    .setValue("【ボタン⑤ 配置エリア】\n要確認の印を消す\n(関数: entryClearCheckMarks)")
    .setBackground("#fde68a")
    .setFontColor("#78350f")
    .setFontWeight("bold")
    .setFontSize(9)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setWrap(true);

  draftSheet.getRange("F1:H1").merge()
    .setValue("➔ 【ボタン⑥ 配置エリア】\n" + SHEET_MAIN + "へ反映＆Web公開\n(関数: expandDraftToTimetable)")
    .setBackground("#dbeafe")
    .setFontColor("#1e40af")
    .setFontWeight("bold")
    .setFontSize(9)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setWrap(true);

  draftSheet.getRange("I1:S1").merge()
    .setValue("色の見方：濃い黄色＝団体と変更が衝突（要確認）／ 水色＝主催が手直し済（メモに元の値） ※右の＋で詳細列を開閉できます")
    .setBackground("#f8fafc")
    .setFontColor("#475569")
    .setFontSize(9)
    .setVerticalAlignment("middle")
    .setWrap(true);

  draftSheet.setRowHeight(1, 48);

  const headers = [
    "日程", "団体名", "公演名", "会場(部屋)", "開始時間リスト (例: 10:30, 12:00 / 随時: 10:00-12:00, 13:00-18:00)",
    "所要時間(分)", "参加料金", "定員", "予約形式", "難易度",
    "内容目安 (・区切りでタグ)", "予約URL", "公演ビジュアルURL",
    "所要時間優先テキスト", "受付終了時間", "完全終了時間", "最終フェーズ表示名", "ノイズ演出", "南京錠パスワード"
  ];
  draftSheet.getRange(2, 1, 1, headers.length).setValues([headers]);
  draftSheet.setRowHeight(2, 34);
  draftSheet.getRange("A2:E2").setBackground("#2563eb").setFontColor("#ffffff").setFontWeight("bold");
  draftSheet.getRange("F2:H2").setBackground("#16a34a").setFontColor("#ffffff").setFontWeight("bold");
  draftSheet.getRange("I2:M2").setBackground("#d97706").setFontColor("#ffffff").setFontWeight("bold");
  draftSheet.getRange("N2:S2").setBackground("#7c3aed").setFontColor("#ffffff").setFontWeight("bold");
  draftSheet.setFrozenRows(2);

  // プルダウン設定
  const ruleDay = SpreadsheetApp.newDataValidation()
    .requireValueInList(["1日目", "2日目", "3日目"], true)
    .setAllowInvalid(true)
    .build();
  draftSheet.getRange("A3:A200").setDataValidation(ruleDay);

  if (rooms && rooms.length) {
    const roomList = ["未定"].concat(rooms.filter((r) => r !== "未定"));
    const ruleRoom = SpreadsheetApp.newDataValidation()
      .requireValueInList(roomList, true)
      .setAllowInvalid(true)
      .build();
    draftSheet.getRange("D3:D200").setDataValidation(ruleRoom);
  }

  const ruleType = SpreadsheetApp.newDataValidation()
    .requireValueInList(["事前予約", "当日受付(ファミレス式)", "事前予約(時間自由)"], true)
    .setAllowInvalid(true)
    .build();
  draftSheet.getRange("I3:I200").setDataValidation(ruleType);

  const diffSpec = entryDifficultySpec(diffPreset);
  const diffList = diffSpec.options.indexOf("-") === -1 ? ["-"].concat(diffSpec.options) : diffSpec.options;
  const ruleDiff = SpreadsheetApp.newDataValidation()
    .requireValueInList(diffList, true)
    .setAllowInvalid(true)
    .build();
  draftSheet.getRange("J3:J200").setDataValidation(ruleDiff);

  // 特殊設定 (N〜S列: 14〜19列) をグループ化して折りたたみ
  if (draftSheet.getMaxColumns() >= 19) {
    try {
      const depth = typeof draftSheet.getColumnGroupDepth === "function"
        ? draftSheet.getColumnGroupDepth(14)
        : 0;
      if (depth === 0) {
        draftSheet.getRange(1, 14, 1, 6).shiftColumnGroupDepth(1);
      }
      draftSheet.collapseAllColumnGroups();
    } catch (_) {}
  }
}

/**
 * 入力シートを含む全シートを初期セットアップ（Readme・設定・団体一覧・入力・一覧・レポート）
 */
function setupDraftSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1.「3.公演かんたん入力」を作成または整備（旧シート名は自動リネーム）
  let draftSheet = getDraftSheet(ss);
  if (!draftSheet) {
    draftSheet = ss.insertSheet(SHEET_DRAFT, 0);
  } else if (draftSheet.getName() !== SHEET_DRAFT) {
    draftSheet.setName(SHEET_DRAFT);
  }

  // 「1.設定」シートを自動生成・移行し、全設定項目を初期配置・色分け
  let configSheet = getConfigSheet(ss);
  if (!configSheet) {
    configSheet = ss.insertSheet(SHEET_CONFIG);
  } else if (configSheet.getName() !== SHEET_CONFIG) {
    configSheet.setName(SHEET_CONFIG);
  }
  if (configSheet.getLastRow() === 0) {
    configSheet.getRange(1, 1, 1, 3).setValues([["設定項目", "設定値", "説明・入力例"]]);
  }
  const configData = configSheet.getDataRange().getValues();
  const existingKeys = new Set(configData.map(r => String(r[0] || "").trim()));
  getConfigDefinitions_().forEach(def => {
    if (!existingKeys.has(def[0])) {
      configSheet.appendRow([def[0], def[1], def[2]]);
    }
  });
  styleConfigSheet_(configSheet);

  const cfg = entryReadConfig_(ss);
  styleDraftSheet_(draftSheet, cfg.difficultyPreset, cfg.rooms);

  // 見本サンプルデータ（未入力の場合のみ挿入）
  if (draftSheet.getLastRow() <= 2) {
    const sampleRows = [
      [
        "1日目", "謎解き研究所", "からくり時計塔からの脱出", "メインホール(1F)",
        "10:30, 12:00, 13:20, 14:40, 16:00, 17:20",
        60, 2500, "4名×1チーム", "事前予約", 5,
        "・ストーリー重視・初心者歓迎", "https://example.com/reserve1", "", "", "", "", "", "", ""
      ],
      [
        "1日目", "ミステリーギルド", "電脳都市の暗号プロトコル", "ルームA(2F)",
        "10:30, 11:10, 11:50, 12:30, 13:10, 13:50, 15:00, 15:40, 16:20, 17:00, 17:40",
        30, 2000, "2名", "事前予約", "-",
        "・スコアアタック・謎解き経験者向け", "https://example.com/reserve2", "", "", "", "", "", "", ""
      ],
      [
        "2日目", "あおぞら探偵団", "星空キャンプと消えたコンパス", "メインホール(1F)",
        "11:30, 13:30, 15:30, 17:30, 19:30",
        90, 2500, "4人", "事前予約", 3,
        "・初心者歓迎・ファミリー向け", "https://example.com/reserve3", "", "", "", "", "", "", ""
      ],
      [
        "1日目", "なぞ解きカフェ", "秘密の角砂糖と迷宮ラテ", "カフェスペース(1F)",
        "10:00-12:00, 13:00-18:00",
        30, 1000, "1〜2名", "当日受付(ファミレス式)", 2,
        "・初心者歓迎・カフェ謎", "", "", "", "", "", "", "", ""
      ]
    ];
    draftSheet.getRange(3, 1, sampleRows.length, sampleRows[0].length).setValues(sampleRows);
  }

  draftSheet.autoResizeColumns(1, 19);
  draftSheet.setColumnWidth(5, 260);
  entryEnsureDraftHeaders_(ss);

  // 2.「2.公演一覧」シート存在確認
  let mainSheet = getMainSheet(ss);
  if (!mainSheet) {
    mainSheet = ss.insertSheet(SHEET_MAIN);
  } else {
    mainSheet.setName(SHEET_MAIN);
  }

  // 3. 出展団体シート群の初期準備
  entryEnsureEntryBookSheets_(ss);

  // 4. 利用レポート・Readme 更新・タブ並びと色統一
  ensureReportSheet(ss);
  renderReportSheet(ss);
  const readmeSheet = setupReadmeSheet(ss);
  arrangeOrganizerTabs_(ss);
  if (readmeSheet) ss.setActiveSheet(readmeSheet);

  SpreadsheetApp.getUi().alert(
    "全シートのセットアップ完了",
    "使い方ガイド（" + SHEET_README + "）および手順順のシート一式をセットアップしました。\n\n" +
    "【迷わない進め方】\n" +
    "1.「" + SHEET_CONFIG + "」シートの黄色セル（★必須）を入力\n" +
    "2.「" + SHEET_GROUPS + "」シートの黄色セルに団体名とGoogleメールを入力\n" +
    "3. 各シート1行目の青い【ボタン配置エリア】に図形ボタンを置いて順に押すだけ！\n\n" +
    "詳しい図解は先頭の「" + SHEET_README + "」シートをご覧ください。",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * メニュー用：Readme シートのみ最新化する
 */
function refreshReadmeSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const readme = setupReadmeSheet(ss);
  ss.setActiveSheet(readme);
  SpreadsheetApp.getUi().alert("更新完了", "「" + SHEET_README + "」シートを最新の手順・図解に更新しました。", SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * 「Readme」シートをイラスト図解・基本4ステップ・色凡例・＋αガイド付きで自動作成する
 */
function setupReadmeSheet(ss) {
  const targetSs = ss || SpreadsheetApp.getActiveSpreadsheet();
  let sheet = targetSs.getSheetByName(SHEET_README);
  if (!sheet) {
    sheet = targetSs.insertSheet(SHEET_README, 0);
  }
  try { sheet.getDataRange().breakApart(); } catch (_) {}
  sheet.clear();

  const solidBorder = (rng, color) => {
    if (SpreadsheetApp.BorderStyle) {
      rng.setBorder(true, true, true, true, true, true, color || "#cbd5e1", SpreadsheetApp.BorderStyle.SOLID);
    }
  };

  // タイトル＆リード文
  sheet.getRange("A1:F1").merge()
    .setValue("謎解きフェス タイムテーブル管理ガイド（使い方）")
    .setBackground("#1e1b4b").setFontColor("#ffffff").setFontWeight("bold").setFontSize(16)
    .setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.setRowHeight(1, 52);

  sheet.getRange("A2:F2").merge()
    .setValue("主催も出展者も「1回書いて、ボタンを押すだけ」。まずは下の【基本の4ステップ】だけ見ればOK！")
    .setBackground("#ede9fe").setFontColor("#312e81").setFontWeight("bold").setFontSize(11)
    .setHorizontalAlignment("center").setWrap(true).setVerticalAlignment("middle");
  sheet.setRowHeight(2, 38);
  sheet.setRowHeight(3, 10);

  // イラスト図解バナー（=IMAGE）
  sheet.getRange("A4:F4").merge()
    .setValue('=IMAGE("' + README_IMAGE_BASE_URL + '/readme-organizer-flow.png", 1)')
    .setBackground("#ffffff").setHorizontalAlignment("center").setVerticalAlignment("middle");
  solidBorder(sheet.getRange("A4:F4"), "#e2e8f0");
  sheet.setRowHeight(4, 240);
  sheet.setRowHeight(5, 14);

  // メインゾーン：基本4ステップ（専門用語・英語関数名ゼロ）
  sheet.getRange("A6:F6").merge()
    .setValue("★ まずはこれだけ！ 公開までの基本 4 ステップ")
    .setBackground("#1e3a8a").setFontColor("#ffffff").setFontWeight("bold").setFontSize(13)
    .setVerticalAlignment("middle");
  sheet.setRowHeight(6, 36);

  const mainSteps = [
    {
      badge: "STEP 1\nイベントの基本設定",
      bg: "#dbeafe", fg: "#1e3a8a",
      body: "「" + SHEET_CONFIG + "」シートを開き、セル（イベント名・開催日数・開始/終了時間・会場の部屋など）を埋めるだけ！\n入力例やプルダウンがあるので、上から順に選んでいけば迷いません。",
      btn: "使うボタン：なし\n（「" + SHEET_CONFIG + "」タブに入力するだけ）",
      hint: "● 会場が複数の建物に分かれる／難易度の表し方を変えたいとき → 下の「＋α 機能ガイド ①②」へ"
    },
    {
      badge: "STEP 2\nシートを配る",
      bg: "#dbeafe", fg: "#1e3a8a",
      body: "「" + SHEET_GROUPS + "」シートの黄色い列に、1公演1行で「団体名」と「担当者のGmail」を並べて右上のボタンを押します。\n団体ごとの専用記入シートと画像フォルダが自動で作られるので、表示されたリンクを各団体に送ってください。",
      btn: "押すボタン（" + SHEET_GROUPS + " 右上）：\n▶【記入用シートを作る】",
      hint: "● 1団体が複数公演を出すとき → 1公演ごとに1行ずつ並べてOK（シートも自動で分かれます）"
    },
    {
      badge: "STEP 3\n待って取り込む",
      bg: "#dcfce7", fg: "#14532d",
      body: "出展団体には専用シートを1回だけ入力してもらいます（修正も同じシートで完結します）。\n締切前後に状況を確認し、提出が揃ったらボタンで一括取り込み！\n※担当者名や緊急連絡先は自動で「" + SHEET_CONTACTS + "」へ分けられ、Webサイトには一切出ません。",
      btn: "押すボタン（" + SHEET_GROUPS + " 右上）：\n①【記入状況を確認する】\n②【全団体から取り込む】",
      hint: "● 提出後に団体が内容を直した／主催側で誤字などを直接直したいとき → 下の「＋α 機能ガイド ③」へ"
    },
    {
      badge: "STEP 4\n確認してWeb公開！",
      bg: "#ede9fe", fg: "#581c87",
      body: "「" + SHEET_DRAFT + "」に全団体の公演が一覧で並びます。気になるところや会場(部屋)の割り当ては、このシート上で直接直してOK（直したセルは水色になり再取り込みでも消えません）！\n最後にボタンを押せば本番の「" + SHEET_MAIN + "」へ整理され、Webタイムテーブルが公開されます。",
      btn: "押すボタン（" + SHEET_DRAFT + " 上部）：\n▶【" + SHEET_MAIN + "へ反映＆Web公開】",
      hint: "● イベント当日に「完売」を反映したい／特定回だけ定員を変えたいとき → 下の「＋α 機能ガイド ②④」へ"
    }
  ];

  let curRow = 7;
  mainSteps.forEach((st, idx) => {
    sheet.getRange(curRow, 1).setValue(st.badge)
      .setBackground(st.bg).setFontColor(st.fg).setFontWeight("bold").setFontSize(11)
      .setHorizontalAlignment("center").setVerticalAlignment("middle").setWrap(true);
    sheet.getRange(curRow, 2, 1, 3).merge().setValue(st.body)
      .setBackground("#ffffff").setFontColor("#1e293b").setFontSize(10.5)
      .setVerticalAlignment("middle").setWrap(true);
    sheet.getRange(curRow, 5, 1, 2).merge().setValue(st.btn)
      .setBackground("#f8fafc").setFontColor("#0f172a").setFontWeight("bold").setFontSize(10)
      .setHorizontalAlignment("center").setVerticalAlignment("middle").setWrap(true);
    solidBorder(sheet.getRange(curRow, 1, 1, 6));
    sheet.setRowHeight(curRow, 66);
    curRow++;

    sheet.getRange(curRow, 1, 1, 6).merge().setValue(st.hint)
      .setBackground("#f8fafc").setFontColor("#64748b").setFontSize(9.5)
      .setVerticalAlignment("middle").setWrap(true);
    sheet.setRowHeight(curRow, 24);
    curRow++;

    if (idx < mainSteps.length - 1) {
      sheet.getRange(curRow, 1, 1, 6).merge().setValue("↓")
        .setHorizontalAlignment("center").setVerticalAlignment("middle")
        .setFontWeight("bold").setFontSize(12).setFontColor("#64748b");
      sheet.setRowHeight(curRow, 22);
      curRow++;
    }
  });

  // セルの色のルール（基本ゾーンと＋αゾーンの共通凡例）
  curRow++; // 余白行
  sheet.setRowHeight(curRow - 1, 16);

  sheet.getRange(curRow, 1, 1, 6).merge()
    .setValue("■ セルの色のルール（説明を聞かなくても色でわかります）")
    .setBackground("#1f2937").setFontColor("#ffffff").setFontWeight("bold").setFontSize(11)
    .setVerticalAlignment("middle");
  sheet.setRowHeight(curRow, 30);
  curRow++;

  sheet.getRange(curRow, 1, 1, 6).setValues([["色", "この色の意味", "どこに出るか・どうすればいいか", "", "", ""]]);
  sheet.getRange(curRow, 3, 1, 4).merge();
  sheet.getRange(curRow, 1, 1, 6).setBackground("#334155").setFontColor("#ffffff").setFontWeight("bold").setVerticalAlignment("middle");
  sheet.setRowHeight(curRow, 26);
  curRow++;

  const legend = [
    ["薄い黄色", "#fff4b8", "#78350f", "あなたが書く場所", "ここだけ埋めれば動きます（" + SHEET_CONFIG + " の★必須欄・" + SHEET_GROUPS + " の団体名/メール・" + SHEET_MAIN + " の完売設定 など）"],
    ["薄い水色", "#dbeafe", "#1e3a8a", "主催が修正済", "主催が手直ししたセルに自動で付きます。団体が別の場所を直して再取り込みしても消えません（メモに団体の元の値あり）"],
    ["濃い黄色", "#fde68a", "#78350f", "要確認（変更が衝突）", "主催と団体が同じセルを別の値に直した場所。メモの比較を見て決めたあと、【要確認の印を消す】ボタンで消せます"],
    ["薄いピンク", "#fde2e2", "#991b1b", "非公開（運営専用）", "担当者名・メール・緊急電話・連絡事項など。「" + SHEET_CONTACTS + "」にだけ入り、公開サイトには一切出ません"],
    ["薄いグレー", "#f1f5f9", "#475569", "自動入力・管理用", "システムが自動で埋める欄や初期設定済みの欄。普段は触らなくて大丈夫です"]
  ];
  legend.forEach((item) => {
    sheet.getRange(curRow, 1).setValue(item[0])
      .setBackground(item[1]).setFontColor(item[2]).setFontWeight("bold")
      .setHorizontalAlignment("center").setVerticalAlignment("middle");
    sheet.getRange(curRow, 2).setValue(item[3])
      .setFontWeight("bold").setFontColor("#1e293b").setVerticalAlignment("middle");
    sheet.getRange(curRow, 3, 1, 4).merge().setValue(item[4])
      .setFontColor("#334155").setWrap(true).setVerticalAlignment("middle");
    solidBorder(sheet.getRange(curRow, 1, 1, 6));
    sheet.setRowHeight(curRow, 34);
    curRow++;
  });

  // 明確な仕切り（余白2行）
  sheet.setRowHeight(curRow, 24);
  sheet.setRowHeight(curRow + 1, 24);
  curRow += 2;

  // 下半分：＋α機能ガイド（読まなくても公開できることを明記）
  sheet.getRange(curRow, 1, 1, 6).merge()
    .setValue("▼ ここから先は ＋α 機能ガイド（読まなくても公開できます！）")
    .setBackground("#475569").setFontColor("#ffffff").setFontWeight("bold").setFontSize(12)
    .setVerticalAlignment("middle");
  sheet.setRowHeight(curRow, 36);
  curRow++;

  sheet.getRange(curRow, 1, 1, 6).merge()
    .setValue("上の4ステップだけでタイムテーブルは完成します。「もっと細かくこだわりたい」「こういうケースはどうするの？」というときだけ、必要な項目をのぞいてみてください。")
    .setBackground("#f1f5f9").setFontColor("#334155").setFontSize(10).setWrap(true).setVerticalAlignment("middle");
  solidBorder(sheet.getRange(curRow, 1, 1, 6));
  sheet.setRowHeight(curRow, 34);
  curRow++;

  const plusAlphas = [
    [
      "① 会場・マップのこだわり",
      "・1つの建物での部屋割り（標準）：団体シートでは任意の「会場（部屋）についての要望・希望」（非公開・" + SHEET_CONTACTS + " へ集約）だけを聞き、公開される「会場(部屋)」は初期値「未定」で取り込まれます。取り込み後に「" + SHEET_DRAFT + "」のD列プルダウンから部屋を割り当ててください（水色になり、再取り込みでも消えません）。\n" +
      "・複数の建物を使うフェス：「" + SHEET_CONFIG + "」タブの「会場のモード」を「複数の建物」に切り替えると、団体ごとに建物名と住所を書いてもらえます。\n" +
      "・会場内マップ連携：「" + SHEET_CONFIG + "」の「会場の部屋一覧」を会場マップの部屋名と同じにしておくと、アプリ上で部屋までのルート案内が自動でつながります。",
      74
    ],
    [
      "② 公演データの細かい設定",
      "・難易度の表し方：「" + SHEET_CONFIG + "」で「1〜10」「1〜5」「★1〜★5」「初級・中級・上級」「使わない」の5通りから選べます（「使わない」にすると記入シートから欄自体が消えます）。\n" +
      "・回ごとの定員違い：出展者シートのスケジュール欄で特定の回だけ定員を変えると、その回だけ違う定員で公開されます。\n" +
      "・カフェ謎・周遊（随時受付）：予約形式を「当日受付(ファミレス式)」にし、開始時間リストを「10:00-12:00, 13:00-18:00」のように書きます。\n" +
      "・24時を超える深夜公演：時刻は「25:30」のようにそのまま記入でき、「" + SHEET_CONFIG + "」の終了時刻も「26:00」等に広げられます。",
      88
    ],
    [
      "③ 取り込み後の手直し＆\n　 衝突（濃い黄色）の扱い",
      "・「" + SHEET_DRAFT + "」で主催が誤字や時間などを直接直した場合、そのセルは薄い水色に変わり、次に団体データを取り込んでも上書きされません。\n" +
      "・もし同じセルを団体も別の内容に直していたときは濃い黄色（要確認）になり、「" + SHEET_GROUPS + "」にも「要確認 N か所」と出ます。セルのメモで両方の値を見比べて整えたら、上部の【要確認の印を消す】ボタンを押せば確認済みになります。",
      68
    ],
    [
      "④ イベント当日のライブ運用",
      "・当日「完売」が出たら：「" + SHEET_MAIN + "」シートで該当回の「完売設定」（黄色セル）を選び、右上の【Web公開データを同期】ボタンを押すだけで即反映されます。\n" +
      "・開催後のふりかえり：「" + SHEET_REPORT + "」タブを見ると、どの公演や機能がどれくらい見られたか集計結果を確認できます。",
      56
    ],
    [
      "⑤ 見た目カスタム・特殊演出",
      "・テーマカラーやロゴ、チケット風シェア画像を変えたいときは「" + SHEET_CONFIG + "」シートの「◎推奨」セル（白）を自由に変更できます。\n" +
      "・「" + SHEET_DRAFT + "」の右側にある「＋」マークを開くと、終了時間の上書き表示や特殊な演出表記（ノイズ演出・南京錠パスワードなど）も設定できます。\n" +
      "・メインビジュアル画像はGoogleドライブの共有設定を「リンクを知っている全員（閲覧者）」にするとWebに表示されます。",
      70
    ]
  ];

  plusAlphas.forEach((item) => {
    sheet.getRange(curRow, 1, 1, 2).merge().setValue(item[0])
      .setBackground("#f8fafc").setFontColor("#334155").setFontWeight("bold").setFontSize(10)
      .setVerticalAlignment("middle").setWrap(true);
    sheet.getRange(curRow, 3, 1, 4).merge().setValue(item[1])
      .setBackground("#ffffff").setFontColor("#334155").setFontSize(9.5)
      .setVerticalAlignment("middle").setWrap(true);
    solidBorder(sheet.getRange(curRow, 1, 1, 6));
    sheet.setRowHeight(curRow, item[2]);
    curRow++;
  });

  // 詳細リファレンス表 1：「1.設定」シートの推奨・公開制御・管理項目
  sheet.setRowHeight(curRow, 14);
  curRow++;

  sheet.getRange(curRow, 1, 1, 6).merge()
    .setValue("■ 「" + SHEET_CONFIG + "」シート 詳細項目リファレンス（◎推奨・公開制御・⚙管理）")
    .setBackground("#1f2937").setFontColor("#ffffff").setFontWeight("bold").setFontSize(11)
    .setVerticalAlignment("middle");
  sheet.setRowHeight(curRow, 30);
  curRow++;

  sheet.getRange(curRow, 1, 1, 6).setValues([["項目名", "", "区分", "何に効くか・使い方のコツ", "", ""]]);
  sheet.getRange(curRow, 1, 1, 2).merge();
  sheet.getRange(curRow, 4, 1, 3).merge();
  sheet.getRange(curRow, 1, 1, 6).setBackground("#334155").setFontColor("#ffffff").setFontWeight("bold").setVerticalAlignment("middle");
  sheet.setRowHeight(curRow, 26);
  curRow++;

  const configDetails = [
    [
      "0分移動可否", "◎推奨",
      "終了時刻と次の開演時刻がぴったりのとき、ハシゴ計画として組めるようにするかの設定です。\n" +
      "「0分移動NG」＝前後5分以上の余裕が必要 ／ 「0分移動OK」＝同じ建物内などで0分移動を許可します。",
      48
    ],
    [
      "完売公演の選択可否", "◎推奨",
      "「選択NG」＝完売になった回はアプリ上で選べなくなります。\n" +
      "「選択OK」＝すでにチケット購入済みの来場者が、自分の予定表（Myハシゴテーブル）には組めるようにします。",
      48
    ],
    [
      "タイムテーブルの\n刻み幅(分)", "◎推奨",
      "タイムテーブル縦軸の目盛り間隔です（標準は「30」）。\n" +
      "短い公演が多くて細かく並べたいときは「15」、全体を1画面にぎゅっと収めたいときは「60」にします。",
      48
    ],
    [
      "非公開モード /\n準備中メッセージ", "⚙公開制御",
      "公開解禁前やメンテナンス中にタイムテーブル画面を一時的に隠せます。\n" +
      "「非公開モードON」にすると下に書いた「準備中メッセージ」だけが表示され、本番公開前にデータを先行同期しても安心です。",
      56
    ],
    [
      "タイムテーブルメインカラー /\nアクセントカラー", "◎推奨",
      "Webアプリ全体のテーマ色（ヘッダーや選択中の強調色など）を「#5b21b6」のようなカラーコードで変更できます。\n" +
      "イベントのキービジュアルに合わせて配色を揃えたいときに使います。",
      48
    ],
    [
      "ヘッダー画像URL /\nロゴ画像URL /\nチケット題字画像URL", "◎推奨",
      "画面最上部の背景画像・ハシゴチケット上のロゴ・題字文字をオリジナル画像へ差し替えられます。\n" +
      "Googleドライブに置いた画像URLを使うときは、共有設定を「リンクを知っている全員（閲覧者）」にしてください。",
      58
    ],
    [
      "チケット箔の色 /\n文字の色 / 紙の色", "◎推奨",
      "Xシェア用「My ハシゴテーブル」チケット画像の箔押し色・本文インク色・背景紙色をカスタマイズできます。\n" +
      "文字が読みやすくなるよう、紙の色は明るめの色がおすすめです。",
      48
    ],
    [
      "SNSハッシュタグ /\nSNSシェアテキスト", "◎推奨",
      "来場者が予定表をX（旧Twitter）へシェアするときのハッシュタグと初期文面を設定します。\n" +
      "シェアテキストが空欄のときはイベント名から自動で作られます。",
      48
    ],
    [
      "難易度の表し方 /\n公演形式の選択肢 /\n記入の締切", "◎推奨",
      "出展団体へ配る記入用シートの項目を切り替えます。\n" +
      "「難易度の表し方」を「使わない」にすると記入シートから欄ごと消えます。「記入の締切」は出展者用シートの「はじめに」に表示されます。",
      56
    ],
    [
      "保存先フォルダ", "⚙管理",
      "団体へ配る記入用シートと素材フォルダを作る親フォルダ（GoogleドライブURL）です。\n" +
      "空欄ならこのスプレッドシートと同じフォルダに自動でフォルダが作られます（マイドライブ直下には作りません）。",
      48
    ],
    [
      "会場マップURL /\nGitHub連携 /\n効果測定・GA4", "⚙管理",
      "テンプレート管理者用の接続設定です（会場マップ json のURL・Web公開先GitHub・集計GAS・GA4測定ID）。\n" +
      "※テスト用コピーでは「GitHubリポジトリ」を必ず空欄にしてください。",
      52
    ]
  ];

  configDetails.forEach((cd) => {
    const badgeStyle = cd[1] === "◎推奨"
      ? ["#fefce8", "#78350f"]
      : cd[1] === "⚙公開制御"
        ? ["#ede9fe", "#4c1d95"]
        : ["#f1f5f9", "#475569"];
    sheet.getRange(curRow, 1, 1, 2).merge().setValue(cd[0])
      .setBackground("#f8fafc").setFontColor("#1e293b").setFontWeight("bold").setFontSize(9.5)
      .setVerticalAlignment("middle").setWrap(true);
    sheet.getRange(curRow, 3).setValue(cd[1])
      .setBackground(badgeStyle[0]).setFontColor(badgeStyle[1]).setFontWeight("bold").setFontSize(9.5)
      .setHorizontalAlignment("center").setVerticalAlignment("middle");
    sheet.getRange(curRow, 4, 1, 3).merge().setValue(cd[2])
      .setBackground("#ffffff").setFontColor("#334155").setFontSize(9.5)
      .setVerticalAlignment("middle").setWrap(true);
    solidBorder(sheet.getRange(curRow, 1, 1, 6));
    sheet.setRowHeight(curRow, cd[3]);
    curRow++;
  });

  // 詳細リファレンス表 2：「3.公演かんたん入力」の折りたたみ列（特殊設定・演出）
  sheet.setRowHeight(curRow, 14);
  curRow++;

  sheet.getRange(curRow, 1, 1, 6).merge()
    .setValue("■ 「" + SHEET_DRAFT + "」の「＋」折りたたみ列（特殊設定・演出リファレンス）")
    .setBackground("#1f2937").setFontColor("#ffffff").setFontWeight("bold").setFontSize(11)
    .setVerticalAlignment("middle");
  sheet.setRowHeight(curRow, 30);
  curRow++;

  sheet.getRange(curRow, 1, 1, 6).setValues([["列名（＋を開くと出現）", "", "何を入れるとアプリ上でどう動くか", "", "", ""]]);
  sheet.getRange(curRow, 1, 1, 2).merge();
  sheet.getRange(curRow, 3, 1, 4).merge();
  sheet.getRange(curRow, 1, 1, 6).setBackground("#334155").setFontColor("#ffffff").setFontWeight("bold").setVerticalAlignment("middle");
  sheet.setRowHeight(curRow, 26);
  curRow++;

  const draftCollapseDetails = [
    [
      "所要時間優先テキスト",
      "分の数値計算とは別に、カード上に表示する時間表記を好きな言葉に変えたいときに入れます（例：「約45〜60分」「出入り自由」）。",
      44
    ],
    [
      "受付終了時間",
      "カフェ謎や周遊などの随時受付公演で、最終受付時刻を指定したいときに使います。\n（開始時間リストに「10:00-17:00」と書いた場合は自動で読み込まれます）",
      48
    ],
    [
      "完全終了時間 /\n最終フェーズ表示名",
      "随時受付などで「受付終了」のあと解説やエンディングで完全に会場を閉める時刻までカード枠を伸ばせます。\n「最終フェーズ表示名」に文字を入れると、その時間帯にラベル表示（既定は「受付終了」）が出ます。",
      58
    ],
    [
      "ノイズ演出",
      "「TRUE」と入れると、Webタイムテーブル上の該当公演カードや詳細画面にミステリアスなシマー／ノイズ演出がかかります（正体不明・シークレット公演向け）。",
      46
    ],
    [
      "南京錠パスワード",
      "合言葉（パスワード）を設定するとカードに鍵マークが付きます。\n来場者が会場や事前謎で合言葉を見つけて入力するまで、公演詳細や隠し予約URLが開けない仕掛けを作れます。",
      54
    ],
    [
      "右側の詳細列\n（キャッチコピー・紹介文 等）",
      "団体記入シートから自動取り込みされる補足情報（キャッチコピー・公演紹介文・制限時間・チーム人数・料金の補足・注意事項・SNSアカウント・会場住所など）です。公開不要・微調整したいときだけ＋で開いて編集できます。",
      56
    ]
  ];

  draftCollapseDetails.forEach((dc) => {
    sheet.getRange(curRow, 1, 1, 2).merge().setValue(dc[0])
      .setBackground("#f8fafc").setFontColor("#1e293b").setFontWeight("bold").setFontSize(9.5)
      .setVerticalAlignment("middle").setWrap(true);
    sheet.getRange(curRow, 3, 1, 4).merge().setValue(dc[1])
      .setBackground("#ffffff").setFontColor("#334155").setFontSize(9.5)
      .setVerticalAlignment("middle").setWrap(true);
    solidBorder(sheet.getRange(curRow, 1, 1, 6));
    sheet.setRowHeight(curRow, dc[2]);
    curRow++;
  });

  // 制作クレジット・ご利用時のご連絡お願い（任意）
  sheet.setRowHeight(curRow, 14);
  curRow++;

  sheet.getRange(curRow, 1, 1, 6).merge()
    .setValue("■ このテンプレートについて・制作クレジット")
    .setBackground("#1f2937").setFontColor("#ffffff").setFontWeight("bold").setFontSize(11)
    .setVerticalAlignment("middle");
  sheet.setRowHeight(curRow, 30);
  curRow++;

  sheet.getRange(curRow, 1, 1, 2).merge().setValue("制作・配布\n（MITライセンス）")
    .setBackground("#f8fafc").setFontColor("#1e293b").setFontWeight("bold").setFontSize(9.5)
    .setHorizontalAlignment("center").setVerticalAlignment("middle").setWrap(true);
  sheet.getRange(curRow, 3, 1, 4).merge().setValue(
    "制作：テレスコープ（X：@kizunan / https://x.com/kizunan）\n" +
    "MITライセンスのため連絡不要・無料で自由にお使いいただけます（画面下部の「Developed by テレスコープ」表記はできれば残していただけると励みになります）。\n" +
    "もしよろしければ「〇〇で使います！」と X（@kizunan）のDMで一報いただけるととても嬉しいです！公式Xでの告知協力（リポスト等）や、ご希望に応じて導入事例として紹介させていただきます。"
  )
    .setBackground("#ffffff").setFontColor("#334155").setFontSize(9.5)
    .setVerticalAlignment("middle").setWrap(true);
  solidBorder(sheet.getRange(curRow, 1, 1, 6));
  sheet.setRowHeight(curRow, 68);
  curRow++;

  // 最下部の極小管理者メモ（1行）
  sheet.setRowHeight(curRow, 12);
  curRow++;
  sheet.getRange(curRow, 1, 1, 6).merge()
    .setValue("※ テンプレート管理者の方へ：初回セットアップ・図形ボタンの割り当て関数一覧は docs/ENTRY_SHEETS.md をご覧ください。（テスト用コピーでは「" + SHEET_CONFIG + "」の「GitHubリポジトリ」を必ず空欄にしてください）")
    .setBackground("#ffffff").setFontColor("#64748b").setFontSize(9).setWrap(true).setVerticalAlignment("middle");
  sheet.setRowHeight(curRow, 28);

  sheet.setColumnWidth(1, 130);
  sheet.setColumnWidth(2, 170);
  sheet.setColumnWidth(3, 200);
  sheet.setColumnWidth(4, 210);
  sheet.setColumnWidth(5, 210);
  sheet.setColumnWidth(6, 190);
  return sheet;
}

/**
 * 入力シートのデータを「2.公演一覧」シートへ展開
 * （図形描画ボタンまたはメニューから呼び出されます）
 */
function expandDraftToTimetable() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const draftSheet = getDraftSheet(ss);
  if (!draftSheet) {
    ui.alert("「" + SHEET_DRAFT + "」シートが見つかりません。先に初期セットアップを実行してください。");
    return;
  }

  // 本番シートの取得（なければ作成、既存があれば名前を統一）
  let mainSheet = getMainSheet(ss);
  if (!mainSheet) {
    mainSheet = ss.insertSheet(SHEET_MAIN, 1);
  } else {
    mainSheet.setName(SHEET_MAIN);
  }

  const lastRow = draftSheet.getLastRow();
  if (lastRow <= 2) {
    ui.alert("「" + SHEET_DRAFT + "」シートに公演データが入力されていません。3行目以降に入力してください。");
    return;
  }

  // 上書き・個別編集への注意喚起ダイアログ
  const res = ui.alert(
    "公演一覧への反映確認",
    "「" + SHEET_DRAFT + "」の内容を「" + SHEET_MAIN + "」へ展開します。\n\n" +
    "【ご注意】\n" +
    "「" + SHEET_MAIN + "」シートで個別に修正した内容（完売設定など）は上書きされます。\n" +
    "反映を実行してよろしいですか？",
    ui.ButtonSet.YES_NO
  );
  if (res !== ui.Button.YES) return;

  // 3行目以降のデータを取得（20列目以降は出展団体の記入用シートから取り込んだ追加の列）
  const cfg = entryReadConfig_(ss);
  const draftWidth = Math.max(19, draftSheet.getLastColumn());
  const draftAll = draftSheet.getRange(3, 1, lastRow - 2, draftWidth).getValues();
  const draftData = draftAll.map(r => r.slice(0, 19));
  const draftHeaderRow = draftSheet.getRange(2, 1, 1, draftWidth).getValues()[0];
  const draftHeaderNames = draftHeaderRow.map(h => String(h || "").trim());
  const slotCapColIdx = draftHeaderNames.indexOf(ENTRY_SLOT_CAPACITY_HEADER);
  const extraCols = entryExtraColumns(draftHeaderRow);

  // 本番シート用のヘッダー定義
  const mainHeaders = [
    "日程", "団体名", "公演名", "会場(部屋)", "開始時間(hh:mm)",
    "所要時間(分)", "定員", "予約URL", "公演ビジュアルURL", "完売設定",
    "参加料金", "予約形式", "難易度", "内容目安", "所要時間:優先表示テキスト",
    "受付終了時間", "完全終了時間", "最終フェーズ表示名", "ノイズ演出", "南京錠パスワード"
  ].concat(extraCols.map(c => c.header));

  const expandedRows = [];

  draftData.forEach((row, rowIdx) => {
    const extraValues = extraCols.map(c => draftAll[rowIdx][c.index]);
    const slotCapMap = slotCapColIdx >= 0 ? entryParseSlotCapacities(draftAll[rowIdx][slotCapColIdx]) : {};
    const day = row[0];
    const groupName = row[1];
    const title = row[2];
    const room = row[3];
    const timeListStr = String(row[4] || "").trim();
    const duration = row[5];
    const fee = row[6];
    const capacity = row[7];
    const reserveType = row[8] || "事前予約";
    const difficulty = row[9];
    const tags = row[10];
    const reserveUrl = row[11];
    const visualUrl = row[12];
    const overrideDurationText = row[13];
    const acceptEnd = row[14];
    const totalEnd = row[15];
    const phaseTitle = row[16];
    const noise = row[17];
    const password = row[18];

    // タイトルまたは団体名が空の行はスキップ
    if (!title && !groupName) return;

    // 開始時間リストのパース (単一時刻 / 時間帯範囲 10:00-12:00 / 随時対応)
    let timeSlots = [];
    if (timeListStr === "" || timeListStr === "随時") {
      timeSlots = [{ start: "随時", acceptEnd: acceptEnd }];
    } else {
      const normalizedTimeList = String(timeListStr || "")
        .replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
        .replace(/：/g, ":")
        .replace(/\s*[-〜～~ー−–—]\s*/g, "-");
      const rawTokens = normalizedTimeList.split(/[\r\n,、\s]+/);
      rawTokens.forEach(t => {
        const token = t.trim();
        if (!token) return;
        const rangeMatch = token.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
        if (rangeMatch) {
          timeSlots.push({ start: rangeMatch[1], acceptEnd: rangeMatch[2] });
        } else {
          timeSlots.push({ start: token, acceptEnd: acceptEnd });
        }
      });
      if (timeSlots.length === 0) {
        timeSlots = [{
          start: reserveType === "当日受付(ファミレス式)" ? "随時" : "10:00",
          acceptEnd: acceptEnd
        }];
      }
    }

    // 各開始時間（または時間帯枠）ごとに1行展開
    timeSlots.forEach(slot => {
      const normalizedStart = entryTime_(slot.start) || slot.start;
      const slotCapacity = slotCapMap[normalizedStart] || capacity;
      expandedRows.push([
        day,                    // 日程
        groupName,              // 団体名
        title,                  // 公演名
        room,                   // 会場(部屋)
        slot.start,             // 開始時間(hh:mm)
        duration,               // 所要時間(分)
        slotCapacity,           // 定員（回ごとの指定があれば優先）
        reserveUrl,             // 予約URL
        visualUrl,              // 公演ビジュアルURL
        "",                     // 完売設定 (初期値は空)
        fee,                    // 参加料金
        reserveType,            // 予約形式
        difficulty,             // 難易度
        tags,                   // 内容目安
        overrideDurationText,   // 所要時間:優先表示テキスト
        slot.acceptEnd,         // 受付終了時間
        totalEnd,               // 完全終了時間
        phaseTitle,             // 最終フェーズ表示名
        noise,                  // ノイズ演出
        password                // 南京錠パスワード
      ].concat(extraValues));
    });
  });

  // 本番シートへ一括書き込み
  mainSheet.clearContents();
  mainSheet.getRange(1, 1, 1, mainHeaders.length).setValues([mainHeaders]);
  mainSheet.getRange(1, 1, 1, mainHeaders.length).setBackground("#1f2937").setFontColor("#ffffff").setFontWeight("bold");
  mainSheet.getRange(1, mainHeaders.length + 1)
    .setValue("【STEP 4 ボタン配置】\nWeb公開データを同期\n(関数: manualExportJsonToGitHub)")
    .setBackground("#f3e8ff").setFontColor("#581c87").setFontWeight("bold").setFontSize(9).setWrap(true).setVerticalAlignment("middle");
  mainSheet.setRowHeight(1, 44);
  mainSheet.setFrozenRows(1);

  if (expandedRows.length > 0) {
    const rowCount = expandedRows.length;
    mainSheet.getRange(2, 1, rowCount, mainHeaders.length).setValues(expandedRows);
    // 当日変更しやすい「完売設定」（J列）を黄色で目立たせる
    mainSheet.getRange(2, 10, rowCount, 1).setBackground("#fff4b8");
    
    // プルダウン設定（展開後の公演一覧でも手動設定不要で自動付与）
    // 1. 日程 (A列)
    const ruleDay = SpreadsheetApp.newDataValidation()
      .requireValueInList(["1日目", "2日目", "3日目"], true)
      .setAllowInvalid(true)
      .build();
    mainSheet.getRange(2, 1, rowCount, 1).setDataValidation(ruleDay);

    // 2. 完売設定 (J列)
    const ruleSoldOut = SpreadsheetApp.newDataValidation()
      .requireValueInList(["完売", "SOLD OUT", "空席あり"], true)
      .setAllowInvalid(true)
      .build();
    mainSheet.getRange(2, 10, rowCount, 1).setDataValidation(ruleSoldOut);

    // 3. 予約形式 (L列)
    const ruleType = SpreadsheetApp.newDataValidation()
      .requireValueInList(["事前予約", "当日受付(ファミレス式)", "事前予約(時間自由)"], true)
      .setAllowInvalid(true)
      .build();
    mainSheet.getRange(2, 12, rowCount, 1).setDataValidation(ruleType);

    // 4. 難易度 (M列)
    const diffSpec = entryDifficultySpec(cfg.difficultyPreset);
    const diffList = diffSpec.options.indexOf("-") === -1 ? ["-"].concat(diffSpec.options) : diffSpec.options;
    const ruleDiff = SpreadsheetApp.newDataValidation()
      .requireValueInList(diffList, true)
      .setAllowInvalid(true)
      .build();
    mainSheet.getRange(2, 13, rowCount, 1).setDataValidation(ruleDiff);
  }

  mainSheet.autoResizeColumns(1, mainHeaders.length);
  mainSheet.setColumnWidth(mainHeaders.length + 1, 210);
  // 特殊演出・付随情報列（15列目以降）を折りたたみ、STEP 4 ボタンとコア列を見やすくする
  if (mainHeaders.length >= 15) {
    try {
      const depth = typeof mainSheet.getColumnGroupDepth === "function" ? mainSheet.getColumnGroupDepth(15) : 0;
      if (depth === 0) {
        mainSheet.getRange(1, 15, 1, mainHeaders.length - 14).shiftColumnGroupDepth(1);
      }
      mainSheet.collapseAllColumnGroups();
    } catch (_) {}
  }

  // 利用レポートシートの公演マスタ・タグ一覧も最新化
  ensureReportSheet(ss);
  renderReportSheet(ss);

  // 展開後、「2.公演一覧」シートを前面に表示
  ss.setActiveSheet(mainSheet);

  ui.alert(
    "反映完了",
    draftData.filter(r => r[2]).length + " 件の公演情報から、計 " + expandedRows.length + " 行のタイムテーブルデータを「" + SHEET_MAIN + "」へ展開しました。\n\n" +
    "必要に応じて、この「" + SHEET_MAIN + "」シートで公演回ごとの完売設定や微調整を行ってください。",
    ui.ButtonSet.OK
  );

  // GitHub連携が設定されている場合は静的JSONを自動同期
  exportJsonToGitHub(true);
}

/**
 * スプレッドシートから最新のJSON用データ構造を生成
 */
function generateExportData(ss) {
  const ssTz = (typeof ss.getSpreadsheetTimeZone === "function" ? ss.getSpreadsheetTimeZone() : "")
    || (typeof Session !== "undefined" && typeof Session.getScriptTimeZone === "function" ? Session.getScriptTimeZone() : "")
    || "Asia/Tokyo";

  // 1. 設定シートの読み込み
  const configSheet = getConfigSheet(ss);
  const config = {};
  if (configSheet) {
    const configData = configSheet.getDataRange().getValues();
    configData.forEach(row => {
      const key = String(row[0] || "").trim();
      if (!key || key === "設定項目" || key.indexOf("■") === 0 || key.indexOf("▼") === 0) return;
      const val = row[1];
      if (val instanceof Date) {
        if (val.getFullYear() <= 1900 || key.indexOf("時間") !== -1) {
          config[key] = entryTime_(val, ssTz);
        } else {
          config[key] = Utilities.formatDate(val, ssTz, "yyyy/MM/dd");
        }
      } else {
        config[key] = val !== undefined && val !== null ? String(val) : "";
      }
    });
  }

  // 2. 公演一覧シートの読み込み（過去の「公演データ」シート名にも完全互換対応）
  const mainSheet = getMainSheet(ss);
  const shows = [];
  
  if (mainSheet && mainSheet.getLastRow() > 1) {
    const data = mainSheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).trim());
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const showObj = {};
      let hasData = false;
      
      headers.forEach((h, colIdx) => {
        if (h && h.indexOf("【") !== 0) {
          let val = row[colIdx];
          if (val instanceof Date) {
            val = entryTime_(val, ssTz);
          }
          showObj[h] = val !== undefined && val !== null ? String(val).trim() : "";
          if (showObj[h]) hasData = true;
        }
      });
      
      if (hasData && (showObj["公演名"] || showObj["団体名"])) {
        shows.push(showObj);
      }
    }
  }

  return {
    config: config,
    shows: shows
  };
}

/**
 * Web API (doGet) - WebサイトへのJSONデータ配信（フォールバック用）
 */
function doGet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const result = generateExportData(ss);

  return ContentService.createTextOutput(JSON.stringify(result, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * GitHubアクセストークン（PAT）の設定
 */
function setupGitHubToken() {
  const ui = SpreadsheetApp.getUi();
  const prop = PropertiesService.getScriptProperties();
  const currentToken = prop.getProperty("GITHUB_PAT");
  const promptMsg = currentToken
    ? "現在GitHubアクセストークンが保存されています。\n新しいトークンを入力すると上書き更新されます:"
    : "GitHub Personal Access Token (PAT) を入力してください。\n（必要な権限: 対象リポジトリの Contents: Read and write）:";

  const res = ui.prompt("GitHubアクセストークン設定", promptMsg, ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() === ui.Button.OK) {
    const token = res.getResponseText().trim();
    if (token) {
      prop.setProperty("GITHUB_PAT", token);
      ui.alert("設定完了", "アクセストークンを安全にスクリプトプロパティへ保存しました。", ui.ButtonSet.OK);
    } else {
      ui.alert("未入力", "トークンが入力されなかったため設定を保持しました。", ui.ButtonSet.OK);
    }
  }
}

/**
 * GitHubアクセストークン（PAT）の削除
 */
function clearGitHubToken() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.alert("確認", "保存されているGitHubアクセストークンを削除しますか？", ui.ButtonSet.YES_NO);
  if (res === ui.Button.YES) {
    PropertiesService.getScriptProperties().deleteProperty("GITHUB_PAT");
    ui.alert("削除完了", "アクセストークンを削除しました。", ui.ButtonSet.OK);
  }
}

/**
 * メニュー用：Web公開用JSONの手動同期実行
 */
function manualExportJsonToGitHub() {
  exportJsonToGitHub(false);
}

/**
 * スプレッドシートのデータを静的JSONとしてGitHubリポジトリへ直接コミット・同期
 * @param {boolean} isSilent - 自動同期時はtrue（エラーダイアログを抑制）
 */
function exportJsonToGitHub(isSilent) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const prop = PropertiesService.getScriptProperties();
  let token = prop.getProperty("GITHUB_PAT");

  // トークン未設定時
  if (!token) {
    if (isSilent) return;
    const res = ui.prompt(
      "GitHubアクセストークンが必要です",
      "GitHub Personal Access Token (PAT) が設定されていません。\nトークンを入力してください（Contents: Read & write権限）:",
      ui.ButtonSet.OK_CANCEL
    );
    if (res.getSelectedButton() !== ui.Button.OK) return;
    token = res.getResponseText().trim();
    if (!token) return;
    prop.setProperty("GITHUB_PAT", token);
  }

  // 設定シートからGitHubリポジトリ設定を取得
  const configSheet = getConfigSheet(ss);
  let repo = "";
  let branch = "main";
  let filePath = "public/data.json";

  if (configSheet) {
    const data = configSheet.getDataRange().getValues();
    data.forEach(row => {
      const key = String(row[0] || "").trim();
      const val = String(row[1] !== undefined ? row[1] : "").trim();
      if (key === "GitHubリポジトリ" && val) repo = val;
      if (key === "GitHubブランチ" && val) branch = val;
      if (key === "GitHub保存先パス" && val) filePath = val;
    });
  }

  if (repo) {
    repo = repo
      .replace(/^https?:\/\/github\.com\//i, "")
      .replace(/\.git$/i, "")
      .replace(/^\/+|\/+$/g, "");
  }

  if (!repo) {
    if (isSilent) return;
    ui.alert(
      "設定エラー",
      "「" + SHEET_CONFIG + "」シートに「GitHubリポジトリ」（例: owner/repo-name）が設定されていません。\n設定シートに入力してから再度実行してください。",
      ui.ButtonSet.OK
    );
    return;
  }

  try {
    // 1. 最新JSONデータの生成
    const exportData = generateExportData(ss);
    const jsonString = JSON.stringify(exportData, null, 2);
    const base64Content = Utilities.base64Encode(jsonString, Utilities.Charset.UTF_8);

    // 2. 既存ファイルのSHAを取得（GitHub APIでのファイル更新に必須）
    const apiUrl = "https://api.github.com/repos/" + repo + "/contents/" + filePath + "?ref=" + branch;
    const headers = {
      "Authorization": "token " + token,
      "Accept": "application/vnd.github+json",
      "User-Agent": "Universal-Timetable-GAS"
    };

    let existingSha = null;
    try {
      const getRes = UrlFetchApp.fetch(apiUrl, {
        method: "get",
        headers: headers,
        muteHttpExceptions: true
      });
      const getCode = getRes.getResponseCode();
      if (getCode === 200) {
        const fileJson = JSON.parse(getRes.getContentText());
        existingSha = fileJson.sha;
      }
    } catch (err) {
      console.warn("既存ファイルSHA取得失敗（新規作成として処理します）:", err);
    }

    // 3. GitHub API (PUT) でファイルを直接コミット
    const putPayload = {
      message: "data: タイムテーブルデータをスプレッドシートから自動同期",
      content: base64Content,
      branch: branch
    };
    if (existingSha) {
      putPayload.sha = existingSha;
    }

    const putUrl = "https://api.github.com/repos/" + repo + "/contents/" + filePath;
    const putRes = UrlFetchApp.fetch(putUrl, {
      method: "put",
      headers: headers,
      contentType: "application/json",
      payload: JSON.stringify(putPayload),
      muteHttpExceptions: true
    });

    const putCode = putRes.getResponseCode();
    if (putCode === 200 || putCode === 201) {
      if (!isSilent) {
        ui.alert(
          "GitHub同期完了",
          "リポジトリ「" + repo + "」（" + branch + " ブランチ）の " + filePath + " へ最新データを保存しました。\nWebサイト側が初回から0.1秒台で高速表示されます。",
          ui.ButtonSet.OK
        );
      }
    } else {
      const errorText = putRes.getContentText();
      console.error("GitHub API エラー:", putCode, errorText);
      if (!isSilent) {
        ui.alert(
          "GitHub同期エラー (HTTP " + putCode + ")",
          "同期に失敗しました。\n詳細: " + errorText,
          ui.ButtonSet.OK
        );
      }
    }
  } catch (e) {
    console.error("GitHub同期例外:", e);
    if (!isSilent) {
      ui.alert("同期処理例外", "処理中にエラーが発生しました: " + e.message, ui.ButtonSet.OK);
    }
  }
}


/**
 * ==========================================================================
 * 効果測定・利用レポート（人気タグランキング・公演別組込数集計）機能
 * ==========================================================================
 */

function getDefaultAnalyticsMeta() {
  return {
    totalPageViews: 0,
    openScheduleCount: 0,
    findGapsCount: 0,
    addGapShowCount: 0,
    viewPassCount: 0,
    saveImageCount: 0,
    copyPlanCount: 0,
    shareSnsCount: 0,
    filterTagCounts: {}
  };
}

/**
 * 内部集計用シート（_集計ログ）を初期化・取得
 */
function ensureRawLogSheet(ss) {
  let rawSheet = ss.getSheetByName(SHEET_RAW_LOG);
  if (!rawSheet) {
    rawSheet = ss.insertSheet(SHEET_RAW_LOG);
    rawSheet.hideSheet();
  }
  if (rawSheet.getLastRow() === 0 || !String(rawSheet.getRange(1, 1).getValue() || "").trim()) {
    rawSheet.getRange(1, 1).setValue(JSON.stringify(getDefaultAnalyticsMeta()));
  }
  if (rawSheet.getLastRow() < 2 || !String(rawSheet.getRange(2, 1).getValue() || "").trim()) {
    rawSheet.getRange(2, 1, 1, 5).setValues([[
      "visitorId", "selectedIdsJson", "updatedAt", "selectedTitlesJson", "tagCountsJson"
    ]]);
  }
  return rawSheet;
}

/**
 * 利用レポートシートを取得または作成
 */
function ensureReportSheet(ss) {
  let reportSheet = ss.getSheetByName(SHEET_REPORT);
  if (!reportSheet) {
    reportSheet = ss.insertSheet(SHEET_REPORT);
  }
  return reportSheet;
}

/**
 * 内容目安文字列をタグ配列へ分割（フロントエンド Parser.parseTags と同一ルール）
 */
function parseReportTags(rawText) {
  if (!rawText) return [];
  return String(rawText)
    .split(/[・、,/\n\r]+/)
    .map(function (t) { return t.trim(); })
    .filter(function (t) { return t.length > 0 && t !== "-" && t !== "特になし" && t !== "なし"; });
}

/**
 * Web アプリ POST 受信（doPost） - 行動計測と「利用レポート」更新
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  let acquired = false;
  try {
    acquired = lock.tryLock(5000);
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "empty body" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const payload = JSON.parse(e.postData.contents);
    const visitorId = String(payload.visitorId || "").trim();
    const action = String(payload.action || "").trim();

    if (!visitorId) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "missing visitorId" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const rawSheet = ensureRawLogSheet(ss);

    // 1. メタ集計カウンタ読込・更新
    let meta = getDefaultAnalyticsMeta();
    try {
      const rawMeta = String(rawSheet.getRange(1, 1).getValue() || "").trim();
      if (rawMeta) {
        const parsedMeta = JSON.parse(rawMeta);
        Object.keys(meta).forEach(function (k) {
          if (parsedMeta[k] !== undefined) meta[k] = parsedMeta[k];
        });
        if (!meta.filterTagCounts || typeof meta.filterTagCounts !== "object") {
          meta.filterTagCounts = {};
        }
      }
    } catch (_) {
      meta = getDefaultAnalyticsMeta();
    }

    if (action === "page_view") meta.totalPageViews += 1;
    else if (action === "open_schedule") meta.openScheduleCount += 1;
    else if (action === "find_gaps") meta.findGapsCount += 1;
    else if (action === "add_gap_show") meta.addGapShowCount += 1;
    else if (action === "view_pass") meta.viewPassCount += 1;
    else if (action === "save_image") meta.saveImageCount += 1;
    else if (action === "copy_plan") meta.copyPlanCount += 1;
    else if (action === "share_sns") meta.shareSnsCount += 1;
    else if (action === "filter_tag") {
      const ft = String(payload.filterTag || "").trim();
      if (ft) {
        meta.filterTagCounts[ft] = (meta.filterTagCounts[ft] || 0) + 1;
      }
    }

    rawSheet.getRange(1, 1).setValue(JSON.stringify(meta));

    // 2. 訪問者ごとの最新選択状態（3行目以降）を更新
    const lastRow = rawSheet.getLastRow();
    let targetRow = -1;
    if (lastRow >= 3) {
      const idValues = rawSheet.getRange(3, 1, lastRow - 2, 1).getValues();
      for (var i = 0; i < idValues.length; i++) {
        if (String(idValues[i][0] || "").trim() === visitorId) {
          targetRow = i + 3;
          break;
        }
      }
    }

    const nowIso = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss");
    const shouldUpdatePlan = action !== "page_view" && action !== "filter_tag" && Array.isArray(payload.selectedIds);

    if (targetRow === -1) {
      const initIds = shouldUpdatePlan ? JSON.stringify(payload.selectedIds) : "[]";
      const initTitles = shouldUpdatePlan ? JSON.stringify(payload.selectedTitles || []) : "[]";
      const initTagCounts = shouldUpdatePlan ? JSON.stringify(payload.tagCounts || {}) : "{}";
      rawSheet.appendRow([visitorId, initIds, nowIso, initTitles, initTagCounts]);
    } else {
      rawSheet.getRange(targetRow, 3).setValue(nowIso);
      if (shouldUpdatePlan) {
        rawSheet.getRange(targetRow, 2).setValue(JSON.stringify(payload.selectedIds));
        rawSheet.getRange(targetRow, 4).setValue(JSON.stringify(payload.selectedTitles || []));
        rawSheet.getRange(targetRow, 5).setValue(JSON.stringify(payload.tagCounts || {}));
      }
    }

    renderReportSheet(ss);

    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    console.error("doPost analytics error:", err);
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    if (acquired) {
      try { lock.releaseLock(); } catch (_) {}
    }
  }
}

/**
 * メニュー用：利用レポートを再集計して前面表示
 */
function refreshAnalyticsReport() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const reportSheet = renderReportSheet(ss);
  ss.setActiveSheet(reportSheet);
  SpreadsheetApp.getUi().alert("更新完了", "「" + SHEET_REPORT + "」シートを最新データで更新しました。", SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * メニュー用：集計ログとレポートをリセット
 */
function resetAnalyticsData() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.alert(
    "利用レポート集計リセット確認",
    "これまで記録されたアクセス数・人気タグ・公演別選択数の集計データをすべて 0 に戻します。\nテストデータを消して本番公開前にリセットする場合に実行してください。\nよろしいですか？",
    ui.ButtonSet.YES_NO
  );
  if (res !== ui.Button.YES) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const rawSheet = ensureRawLogSheet(ss);
  rawSheet.clearContents();
  rawSheet.getRange(1, 1).setValue(JSON.stringify(getDefaultAnalyticsMeta()));
  rawSheet.getRange(2, 1, 1, 5).setValues([[
    "visitorId", "selectedIdsJson", "updatedAt", "selectedTitlesJson", "tagCountsJson"
  ]]);
  renderReportSheet(ss);
  ui.alert("リセット完了", "利用レポートの集計データをリセットしました。", ui.ButtonSet.OK);
}

/**
 * 「利用レポート」シートへ全体サマリー・人気タグランキング・公演別ランキングを出力
 */
function renderReportSheet(ss) {
  const targetSs = ss || SpreadsheetApp.getActiveSpreadsheet();
  const reportSheet = ensureReportSheet(targetSs);
  const rawSheet = ensureRawLogSheet(targetSs);
  const mainSheet = getMainSheet(targetSs);

  // 1. 「2.公演一覧」からマスタ構築
  const showIdToMeta = {};
  const titleOrder = [];
  const titleInfoMap = {};
  const tagProgramSetMap = {};

  if (mainSheet && mainSheet.getLastRow() > 1) {
    const mainValues = mainSheet.getDataRange().getValues();
    const headers = mainValues[0].map(function (h) { return String(h || "").trim(); });
    const colDay = headers.indexOf("日程");
    const colGroup = headers.indexOf("団体名");
    const colTitle = headers.indexOf("公演名");
    const colTags = headers.indexOf("内容目安");

    var showIndex = 0;
    for (var r = 1; r < mainValues.length; r++) {
      var row = mainValues[r];
      var day = colDay >= 0 ? String(row[colDay] || "").trim() : "";
      var groupName = colGroup >= 0 ? String(row[colGroup] || "").trim() : "";
      var title = colTitle >= 0 ? String(row[colTitle] || "").trim() : "";
      var rawTags = colTags >= 0 ? String(row[colTags] || "").trim() : "";
      if (!title && !groupName) continue;

      showIndex += 1;
      var showId = "show-" + showIndex;
      var tags = parseReportTags(rawTags);
      showIdToMeta[showId] = { day: day, groupName: groupName, title: title, tags: tags };

      if (!titleInfoMap[title]) {
        titleInfoMap[title] = {
          day: day || "1日目",
          groupName: groupName,
          title: title,
          tags: {},
          tagList: []
        };
        titleOrder.push(title);
      }
      tags.forEach(function (t) {
        if (!titleInfoMap[title].tags[t]) {
          titleInfoMap[title].tags[t] = true;
          titleInfoMap[title].tagList.push(t);
        }
        if (!tagProgramSetMap[t]) tagProgramSetMap[t] = {};
        tagProgramSetMap[t][title] = true;
      });
    }
  }

  // 2. 「_集計ログ」からメトリクス集計
  let meta = getDefaultAnalyticsMeta();
  try {
    const metaStr = String(rawSheet.getRange(1, 1).getValue() || "").trim();
    if (metaStr) {
      const parsed = JSON.parse(metaStr);
      Object.keys(meta).forEach(function (k) {
        if (parsed[k] !== undefined) meta[k] = parsed[k];
      });
      if (!meta.filterTagCounts || typeof meta.filterTagCounts !== "object") {
        meta.filterTagCounts = {};
      }
    }
  } catch (_) {}

  var totalAccessUsers = 0;
  var planCreators = 0;
  var totalSelectedSlots = 0;
  var titleUserSetMap = {};
  var tagUserSetMap = {};
  var tagSlotCountMap = {};

  const rawLastRow = rawSheet.getLastRow();
  if (rawLastRow >= 3) {
    const logRows = rawSheet.getRange(3, 1, rawLastRow - 2, 5).getValues();
    logRows.forEach(function (row) {
      var visitorId = String(row[0] || "").trim();
      if (!visitorId) return;
      totalAccessUsers += 1;

      var ids = [];
      var savedTitles = [];
      var savedTagCounts = {};
      try { ids = JSON.parse(row[1] || "[]"); } catch (_) { ids = []; }
      try { savedTitles = JSON.parse(row[3] || "[]"); } catch (_) { savedTitles = []; }
      try { savedTagCounts = JSON.parse(row[4] || "{}"); } catch (_) { savedTagCounts = {}; }
      if (!Array.isArray(ids)) ids = [];
      if (!Array.isArray(savedTitles)) savedTitles = [];
      if (!savedTagCounts || typeof savedTagCounts !== "object") savedTagCounts = {};

      var slotCount = ids.length > 0 ? ids.length : savedTitles.length;
      if (slotCount > 0) {
        planCreators += 1;
        totalSelectedSlots += slotCount;
      }

      var resolvedAllIds = ids.length > 0 && ids.every(function (id) { return Boolean(showIdToMeta[id]); });
      var visitorTitleSet = {};
      var visitorTagCounts = {};

      if (resolvedAllIds) {
        ids.forEach(function (id) {
          var m = showIdToMeta[id];
          visitorTitleSet[m.title] = true;
          m.tags.forEach(function (t) {
            visitorTagCounts[t] = (visitorTagCounts[t] || 0) + 1;
          });
        });
      } else {
        savedTitles.forEach(function (t) {
          if (t) visitorTitleSet[t] = true;
        });
        Object.keys(savedTagCounts).forEach(function (t) {
          var c = Number(savedTagCounts[t]) || 0;
          if (c > 0) visitorTagCounts[t] = c;
        });
        // ID が部分的に一致するケースも補完
        ids.forEach(function (id) {
          var m = showIdToMeta[id];
          if (m) visitorTitleSet[m.title] = true;
        });
      }

      Object.keys(visitorTitleSet).forEach(function (title) {
        if (!titleUserSetMap[title]) titleUserSetMap[title] = {};
        titleUserSetMap[title][visitorId] = true;
        if (!titleInfoMap[title]) {
          titleInfoMap[title] = { day: "-", groupName: "-", title: title, tags: {}, tagList: [] };
          titleOrder.push(title);
        }
      });

      Object.keys(visitorTagCounts).forEach(function (tag) {
        if (!tagUserSetMap[tag]) tagUserSetMap[tag] = {};
        tagUserSetMap[tag][visitorId] = true;
        tagSlotCountMap[tag] = (tagSlotCountMap[tag] || 0) + (visitorTagCounts[tag] || 1);
      });
    });
  }

  var avgSelected = planCreators > 0 ? Math.round((totalSelectedSlots / planCreators) * 10) / 10 : 0;

  // 3. 人気タグランキングデータ構築
  var allTagSet = {};
  Object.keys(tagProgramSetMap).forEach(function (t) { allTagSet[t] = true; });
  Object.keys(tagUserSetMap).forEach(function (t) { allTagSet[t] = true; });
  Object.keys(meta.filterTagCounts || {}).forEach(function (t) { allTagSet[t] = true; });

  var tagRows = Object.keys(allTagSet).map(function (tag) {
    var uniqueUsers = tagUserSetMap[tag] ? Object.keys(tagUserSetMap[tag]).length : 0;
    var slotTotal = tagSlotCountMap[tag] || 0;
    var filterTaps = (meta.filterTagCounts && meta.filterTagCounts[tag]) ? meta.filterTagCounts[tag] : 0;
    var programCount = tagProgramSetMap[tag] ? Object.keys(tagProgramSetMap[tag]).length : 0;
    return { tag: tag, uniqueUsers: uniqueUsers, slotTotal: slotTotal, filterTaps: filterTaps, programCount: programCount };
  });

  tagRows.sort(function (a, b) {
    if (b.uniqueUsers !== a.uniqueUsers) return b.uniqueUsers - a.uniqueUsers;
    if (b.filterTaps !== a.filterTaps) return b.filterTaps - a.filterTaps;
    if (b.slotTotal !== a.slotTotal) return b.slotTotal - a.slotTotal;
    return b.programCount - a.programCount;
  });

  // 4. 公演別ハシゴ組込数ランキングデータ構築
  var programRows = titleOrder.map(function (title) {
    var info = titleInfoMap[title];
    var userCount = titleUserSetMap[title] ? Object.keys(titleUserSetMap[title]).length : 0;
    var rate = planCreators > 0 ? Math.round((userCount / planCreators) * 1000) / 10 : 0;
    return {
      day: info.day,
      groupName: info.groupName,
      title: info.title,
      tagStr: info.tagList.join(" / "),
      userCount: userCount,
      rateStr: rate.toFixed(1) + "%"
    };
  });

  programRows.sort(function (a, b) {
    return b.userCount - a.userCount;
  });

  // 5. 「利用レポート」シートへ描画
  reportSheet.clear();
  var updatedLabel = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy/MM/dd HH:mm:ss");

  reportSheet.getRange("A1:J1").merge()
    .setValue("利用レポート・効果測定（依頼者報告・出展団体フィードバック用）  |  最終更新: " + updatedLabel)
    .setBackground("#1e1b4b")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setFontSize(11)
    .setVerticalAlignment("middle");
  reportSheet.setRowHeight(1, 34);

  // 【1. 全体利用サマリー】 A3:C15
  reportSheet.getRange("A3:C3").merge()
    .setValue("【1. 全体利用サマリー】")
    .setBackground("#ede9fe")
    .setFontColor("#4c1d95")
    .setFontWeight("bold");
  reportSheet.getRange("A4:C4").setValues([["指標名", "数値", "補足・報告用の見方"]])
    .setBackground("#1f2937").setFontColor("#ffffff").setFontWeight("bold");

  var summaryRows = [
    ["総アクセス人数（UU）", totalAccessUsers, "タイムテーブルページを開いたユニーク人数"],
    ["総ページ表示回数（PV）", meta.totalPageViews || 0, "ページが開かれた合計回数"],
    ["ハシゴ計画作成人数", planCreators, "1公演以上を選択して予定を組んだユニーク人数"],
    ["1人あたり平均選択公演数", avgSelected, "計画作成者1人あたりの平均ハシゴ公演数"],
    ["「自分の予定・ハシゴ表」確認回数", meta.openScheduleCount || 0, "予定一覧モーダルを開いた回数"],
    ["「スキマ時間探索」実行回数", meta.findGapsCount || 0, "空き時間に入れる公演を検索した回数"],
    ["スキマ候補からの公演追加回数", meta.addGapShowCount || 0, "検索結果の追加ボタンから回遊・追加された回数"],
    ["「My ハシゴテーブル」表示回数", meta.viewPassCount || 0, "ハシゴパス表示画面へ進んだ回数"],
    ["「My ハシゴテーブル」画像保存回数", meta.saveImageCount || 0, "画像として保存ボタンを押した回数"],
    ["「予定をコピー」実行回数", meta.copyPlanCount || 0, "共有URL付きテキストコピーの実行回数"],
    ["「Xでシェア」実行回数", meta.shareSnsCount || 0, "Xでシェアボタンの実行回数"]
  ];
  reportSheet.getRange(5, 1, summaryRows.length, 3).setValues(summaryRows);
  reportSheet.getRange(5, 2, summaryRows.length, 1).setNumberFormat("#,##0");
  reportSheet.getRange(8, 2).setNumberFormat("0.0");
  reportSheet.getRange(4, 1, summaryRows.length + 1, 3).setBorder(true, true, true, true, true, true, "#cbd5e1", SpreadsheetApp.BorderStyle.SOLID);

  // 【2. 人気タグランキング】 E3:J...
  reportSheet.getRange("E3:J3").merge()
    .setValue("【2. 人気タグランキング（出展団体フィードバック用）】")
    .setBackground("#ede9fe")
    .setFontColor("#4c1d95")
    .setFontWeight("bold");
  reportSheet.getRange("E4:J4").setValues([[
    "順位", "タグ名", "ハシゴ組込人数(ユニーク)", "ハシゴ組込延べ枠数", "絞り込みタップ回数", "該当演目数"
  ]]).setBackground("#1f2937").setFontColor("#ffffff").setFontWeight("bold");

  if (tagRows.length > 0) {
    var tagValues = tagRows.map(function (t, idx) {
      return [idx + 1, t.tag, t.uniqueUsers, t.slotTotal, t.filterTaps, t.programCount];
    });
    reportSheet.getRange(5, 5, tagValues.length, 6).setValues(tagValues);
    reportSheet.getRange(5, 7, tagValues.length, 4).setNumberFormat("#,##0");
    reportSheet.getRange(4, 5, tagValues.length + 1, 6).setBorder(true, true, true, true, true, true, "#cbd5e1", SpreadsheetApp.BorderStyle.SOLID);
  } else {
    reportSheet.getRange("E5:J5").merge().setValue("（「" + SHEET_MAIN + "」に内容目安タグが登録されると表示されます）");
  }

  // 【3. 公演別ハシゴ組込数ランキング】 A17〜（タグ数に応じて自動下方シフト）
  var progStartRow = Math.max(17, 5 + tagRows.length + 2);
  reportSheet.getRange(progStartRow, 1, 1, 7).merge()
    .setValue("【3. 公演別ハシゴ組込数ランキング（出展団体フィードバック用）】")
    .setBackground("#ede9fe")
    .setFontColor("#4c1d95")
    .setFontWeight("bold");
  reportSheet.getRange(progStartRow + 1, 1, 1, 7).setValues([[
    "順位", "日程", "団体名", "公演名", "内容目安タグ", "ハシゴ組込人数(ユニーク)", "組込率(対計画作成者)"
  ]]).setBackground("#1f2937").setFontColor("#ffffff").setFontWeight("bold");

  if (programRows.length > 0) {
    var progValues = programRows.map(function (p, idx) {
      return [idx + 1, p.day, p.groupName, p.title, p.tagStr, p.userCount, p.rateStr];
    });
    reportSheet.getRange(progStartRow + 2, 1, progValues.length, 7).setValues(progValues);
    reportSheet.getRange(progStartRow + 2, 6, progValues.length, 1).setNumberFormat("#,##0");
    reportSheet.getRange(progStartRow + 1, 1, progValues.length + 1, 7).setBorder(true, true, true, true, true, true, "#cbd5e1", SpreadsheetApp.BorderStyle.SOLID);
  } else {
    reportSheet.getRange(progStartRow + 2, 1, 1, 7).merge().setValue("（「" + SHEET_MAIN + "」に公演が登録されると表示されます）");
  }

  reportSheet.autoResizeColumns(1, 10);
  reportSheet.setColumnWidth(4, 24);
  return reportSheet;
}


/**
 * ==========================================================================
 * 出展団体の一括記入シート（段階 1）
 * ==========================================================================
 * 団体ごとに記入用スプレッドシートを配り、提出された内容を主催スプシへまとめて取り込む。
 *   主催：「団体一覧」に団体名と担当者メールを書く →【記入用シートを作る】
 *   団体：記入用シートの黄色のセルを書き、「提出する」にチェック
 *   主催：【記入状況を確認する】→【全団体から取り込む】→ 今ある【公演一覧へ反映する】
 * 公開する情報は「1.公演かんたん入力」へ、連絡先は公開データに出ない「運営用連絡先」へ振り分ける。
 * 会場のモード（「設定」の「会場のモード」）：1つの建物 … 部屋をプルダウンで選ぶ／複数の建物 … 会場名と住所を書く。
 *
 * 前半（entry* で始まる純粋な関数）はスプレッドシートに触れない。tests/gas-entry.test.js で確かめている。
 */

const ENTRY_TAB_GUIDE = "はじめに";
const ENTRY_TAB_PROFILE = "1_公演概要";
const ENTRY_TAB_SCHEDULE = "2_公演スケジュール";
const ENTRY_TAB_CHECK = "確認";
const ENTRY_SCHEDULE_ROWS = 30;
const ENTRY_MODE_SINGLE = "1つの建物";
const ENTRY_MODE_MULTI = "複数の建物";
const ENTRY_RESERVE_TYPES = ["事前予約", "当日受付(ファミレス式)", "事前予約(時間自由)"];
const ENTRY_DIFFICULTIES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "未定"];
const ENTRY_DIFFICULTY_PRESETS = ["1〜10", "1〜5", "★1〜★5", "初級・中級・上級", "使わない"];

/** 「1.公演かんたん入力」の右側に足す列（末尾 2 列はシステム用で非公開・非表示） */
const ENTRY_SLOT_CAPACITY_HEADER = "回ごとの定員";
const ENTRY_DRAFT_EXTRA_HEADERS = [
  "キャッチコピー", "公演紹介文", "制限時間(分)", "1チームの人数", "料金の補足", "参加にあたっての注意事項",
  "公演ハッシュタグ", "団体のXアカウント", "団体ハッシュタグ", "タイトルのよみがな", "会場住所",
  ENTRY_SLOT_CAPACITY_HEADER
];
const ENTRY_SOURCE_HEADER = "取り込み元(記入用シートID)";
/** 公開データ（2.公演一覧・data.json）に出さない「1.公演かんたん入力」の列 */
const ENTRY_NOT_PUBLISHED_HEADERS = [ENTRY_SOURCE_HEADER, ENTRY_SLOT_CAPACITY_HEADER];

/** 難易度の表し方プリセットを解決する */
function entryDifficultySpec(preset) {
  const p = entryText_(preset);
  if (p === "1〜5") {
    return { preset: "1〜5", enabled: true, options: ["1", "2", "3", "4", "5", "未定"], hint: "1（やさしい）〜5（難しい）", ex: "3" };
  }
  if (p === "★1〜★5") {
    return { preset: "★1〜★5", enabled: true, options: ["★1", "★2", "★3", "★4", "★5", "未定"], hint: "★1（やさしい）〜★5（難しい）", ex: "★3" };
  }
  if (p === "初級・中級・上級") {
    return { preset: "初級・中級・上級", enabled: true, options: ["初級", "中級", "上級", "未定"], hint: "プルダウンから選択", ex: "中級" };
  }
  if (p === "使わない") {
    return { preset: "使わない", enabled: false, options: ["-"], hint: "", ex: "-" };
  }
  return { preset: "1〜10", enabled: true, options: ENTRY_DIFFICULTIES, hint: "1（やさしい）〜10（とても難しい）", ex: "5" };
}

/**
 * 記入用シートの「1_公演概要」の項目。モードと難易度の表し方で出す項目が変わる。
 * req: true=必須 / false=任意 / "warn"=無くても取り込むが知らせる / "unlessWalkIn"=当日受付のみなら任意
 * private: true の項目は「運営用連絡先」にだけ入り、公開データには出ない
 */
function entryFieldSpec(mode, diffPreset) {
  const multi = mode === ENTRY_MODE_MULTI;
  const diff = entryDifficultySpec(diffPreset);
  const f = [
    { sec: "団体情報" },
    { key: "group", label: "団体名（掲示名称）", req: true, type: "auto", hint: "主催が入力済みです。違っていたら運営へ連絡してください", ex: "謎解き研究所" },
    { key: "contactName", label: "担当者名", req: true, private: true, hint: "公演情報の確認窓口になる方（公開しません）", ex: "山田 太郎" },
    { key: "contactEmail", label: "連絡先メールアドレス", req: true, private: true, type: "email", hint: "公開しません", ex: "yamada@example.com" },
    { key: "contactTel", label: "当日の緊急連絡先（電話）", req: true, private: true, hint: "開催当日につながる番号（公開しません）", ex: "090-0000-0000" },
    { key: "xAccount", label: "団体のXアカウント", req: false, hint: "@から始まるID", ex: "@example_nazo" },
    { key: "groupTag", label: "団体ハッシュタグ", req: false, hint: "#から記入", ex: "#謎解き研究所" },
    { sec: "公演内容" },
    { key: "title", label: "公演タイトル", req: true, hint: "タイムテーブルに載る正式名称", ex: "からくり時計塔からの脱出" },
    { key: "kana", label: "タイトルのよみがな", req: false, ex: "からくりどけいとうからのだっしゅつ" },
    { key: "catch", label: "キャッチコピー", req: true, hint: "30字程度", ex: "止まった時計が、真実を指す。" },
    { key: "intro", label: "公演紹介文", req: true, type: "long", hint: "200字程度。公演紹介に使います", ex: "町はずれの時計塔の針が、ある日から動かなくなった。残されたのは歯車と奇妙なメモだけ。チームで手がかりを集め、制限時間内に時計塔の秘密を解き明かそう。初心者も楽しめる王道のルーム型公演です。" },
    { key: "showTag", label: "公演ハッシュタグ", req: false, hint: "#から記入。複数ある場合は空白で区切る", ex: "#からくり時計塔" },
    { key: "format", label: "公演形式", req: true, type: "list:format", hint: "プルダウンから選択", ex: "ルーム型" },
    { key: "premiere", label: "新作／再演", req: false, type: "list", options: ["新作", "再演", "リメイク"], hint: "プルダウンから選択", ex: "新作" },
    { key: "tags", label: "内容目安（タグ）", req: false, hint: "「・」区切り。絞り込みに使います", ex: "初心者歓迎・ストーリー重視" },
    { key: "duration", label: "所要時間（分）", req: true, type: "int", hint: "開演から解説終了まで。終演の自動計算に使います", ex: "60" },
    { key: "limit", label: "うち制限時間（分）", req: false, type: "int", hint: "謎解き本編の時間", ex: "45" },
    { key: "capacity", label: "1回あたりの定員（人）", req: true, type: "int", ex: "24" },
    { key: "team", label: "1チームの人数", req: false, hint: "例：4人、1〜6人", ex: "最大6人" },
  ];
  if (diff.enabled) {
    f.push({ key: "difficulty", label: "難易度", req: true, type: "list", options: diff.options, hint: diff.hint, ex: diff.ex });
  }
  f.push(
    { sec: "チケット" },
    { key: "fee", label: "料金（円・税込）", req: true, type: "int", hint: "1人あたり。無料は 0", ex: "2500" },
    { key: "feeNote", label: "料金の補足", req: false, hint: "グループ券・学割など", ex: "グループ券（6名）13,800円" },
    { key: "reserveType", label: "予約形式", req: true, type: "list", options: ENTRY_RESERVE_TYPES, hint: "プルダウンから選択", ex: "事前予約" },
    { key: "reserveUrl", label: "予約（チケット）URL", req: "unlessWalkIn", type: "url", hint: "https:// から。当日受付のみなら空欄で可", ex: "https://example.com/ticket" },
    { sec: "会場" },
    multi
      ? { key: "room", label: "会場名", req: true, hint: "未確定の場合は「調整中」", ex: "◯◯ビル 4F スタジオA" }
      : { key: "roomRequest", label: "会場（部屋）についての要望・希望", req: false, private: true, type: "long", hint: "希望する部屋・広さ・設備（暗転可・プロジェクター等）があれば記入。割り当ては運営が決定します（公開しません）", ex: "暗転できる広めの部屋希望／特に希望なし" }
  );
  if (multi) f.push({ key: "address", label: "会場住所", req: true, hint: "公開します", ex: "大阪市中央区◯◯ 1-2-3" });
  f.push(
    { sec: "素材・その他" },
    { key: "visual", label: "メインビジュアル画像", req: "warn", type: "folder", hint: "左のURLのフォルダにメインビジュアル画像を1枚入れてください（縦長推奨）", ex: "main_visual.png" },
    { key: "notice", label: "参加にあたっての注意事項", req: false, hint: "年齢制限、階段のみ、暗所あり、など", ex: "小学生以下は保護者同伴" },
    { key: "opsNote", label: "運営への連絡事項", req: false, private: true, type: "long", hint: "搬入時間、時間調整の希望など（公開しません）", ex: "1日目は14時以降のみ開催可能です" },
    { sec: "提出" },
    { key: "submit", label: "提出する", req: false, type: "checkbox", hint: "記入が終わったらチェック。チェック後に内容を修正した場合は、自動では反映されないため必ず運営へ「更新しました」とご連絡ください" }
  );
  return f;
}

/** 文字の正規化（全角数字・前後の空白） */
function entryText_(v) {
  if (v === null || v === undefined) return "";
  return String(v).replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).trim();
}

/** セルの時刻（Date・数値・"13:30"）を "HH:mm" に。タイムゾーン差でずれないようスプレッドシートのタイムゾーンを使う */
function entryTime_(v, tz) {
  if (v === null || v === undefined || v === "") return "";
  if (Object.prototype.toString.call(v) === "[object Date]") {
    if (typeof Utilities !== "undefined" && typeof Utilities.formatDate === "function") {
      let resolvedTz = tz || "";
      if (!resolvedTz && typeof SpreadsheetApp !== "undefined" && typeof SpreadsheetApp.getActiveSpreadsheet === "function") {
        try {
          const active = SpreadsheetApp.getActiveSpreadsheet();
          if (active && typeof active.getSpreadsheetTimeZone === "function") {
            resolvedTz = active.getSpreadsheetTimeZone();
          }
        } catch (_) {}
      }
      if (!resolvedTz && typeof Session !== "undefined" && typeof Session.getScriptTimeZone === "function") {
        try { resolvedTz = Session.getScriptTimeZone(); } catch (_) {}
      }
      resolvedTz = resolvedTz || "Asia/Tokyo";
      try {
        const formatted = Utilities.formatDate(v, resolvedTz, "HH:mm");
        if (/^\d{2}:\d{2}$/.test(formatted)) return formatted;
      } catch (_) {}
    }
    return String(v.getHours()).padStart(2, "0") + ":" + String(v.getMinutes()).padStart(2, "0");
  }
  if (typeof v === "number" && v >= 0 && v < 1) {
    const m = Math.round(v * 1440);
    return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  }
  const s = entryText_(v).replace(/：/g, ":");
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return "";
  return m[1].padStart(2, "0") + ":" + m[2];
}

/** 「1日目（11/14(土)）」「2日目」→ "2日目"。読めなければ "" */
function entryDay_(v) {
  const m = entryText_(v).match(/^(\d)\s*日目/);
  return m ? m[1] + "日目" : "";
}

/** 公演形式・新作／再演・タグを「・」区切りのタグにまとめる（重複は除く） */
function entryTags_(format, premiere, tags) {
  const seen = new Set();
  const out = [];
  [format, premiere].concat(entryText_(tags).split(/[・、,，/／\s]+/)).forEach((t) => {
    const s = entryText_(t);
    if (s && !seen.has(s)) { seen.add(s); out.push(s); }
  });
  return out.length ? "・" + out.join("・") : "";
}

/** 回ごとの定員メモ文字（例: "11:00=20, 14:00=18"）を { "11:00": "20", ... } に展開 */
function entryParseSlotCapacities(text) {
  const map = {};
  entryText_(text).split(/[,、\n]+/).forEach((part) => {
    const m = part.trim().match(/^(\d{1,2}:\d{2})\s*=\s*(.+)$/);
    if (m) map[entryTime_(m[1]) || m[1]] = m[2].trim();
  });
  return map;
}

/**
 * 記入用シートの値から、「1.公演かんたん入力」の行（日程ごとに 1 行）と運営用連絡先を作る。
 * values: { key: セルの値 }（entryFieldSpec の key）、schedule: [{ day, start, acceptEnd, capacity, note }]
 * ctx: { mode, difficultyPreset, sourceId, visualUrl, tz }
 * 返り値: { rows, contact, errors, warnings, notes }。errors があるときは取り込まない
 */
function entryBuildDraftRows(values, schedule, ctx) {
  const v = (k) => entryText_(values[k]);
  const diffSpec = entryDifficultySpec(ctx && ctx.difficultyPreset);
  const spec = entryFieldSpec(ctx && ctx.mode, diffSpec.preset).filter((f) => f.key);
  const errors = [];
  const warnings = [];
  const notes = [];
  const tz = ctx && ctx.tz;

  const walkIn = /^当日受付/.test(v("reserveType"));
  spec.forEach((f) => {
    const filled = f.key === "visual" ? Boolean(ctx && ctx.visualUrl) : v(f.key) !== "";
    if (filled) return;
    if (f.req === true) errors.push("未記入：" + f.label);
    else if (f.req === "unlessWalkIn" && !walkIn) errors.push("未記入：" + f.label);
    else if (f.req === "warn") warnings.push("未提出：" + f.label);
  });
  ["duration", "capacity", "fee", "limit"].forEach((k) => {
    if (v(k) !== "" && !/^\d+$/.test(v(k))) errors.push("数字で記入してください：" + spec.find((f) => f.key === k).label);
  });
  if (v("reserveUrl") !== "" && !/^https?:\/\//.test(v("reserveUrl"))) errors.push("https:// から記入してください：予約（チケット）URL");

  // 公演の回：日程ごとにまとめ、開演の早い順に並べる
  const byDay = {};
  const order = [];
  (schedule || []).forEach((r, i) => {
    const startRaw = r.start;
    if ((startRaw === "" || startRaw === null || startRaw === undefined) && !entryText_(r.day)) return;
    const day = entryDay_(r.day);
    const start = entryTime_(startRaw, tz);
    const end = entryTime_(r.acceptEnd, tz);
    if (!day) { errors.push("スケジュール " + (i + 1) + " 行目：日程を選んでください"); return; }
    if (!start) { errors.push("スケジュール " + (i + 1) + " 行目：開演を 13:30 の形で記入してください"); return; }
    if (!byDay[day]) { byDay[day] = []; order.push(day); }
    const cap = entryText_(r.capacity);
    const slotCap = cap && cap !== v("capacity") ? cap : "";
    byDay[day].push({ start, token: end ? start + "-" + end : start, capacity: slotCap });
    if (cap && cap !== v("capacity")) notes.push(day + " " + start + " の回は定員 " + cap + " 人（基本は " + v("capacity") + " 人）");
    if (entryText_(r.note)) notes.push(day + " " + start + "：" + entryText_(r.note));
  });
  if (!order.length) errors.push("公演スケジュールが 1 回も記入されていません");

  const isMulti = Boolean(ctx && ctx.mode === ENTRY_MODE_MULTI);
  const roomReq = !isMulti ? v("roomRequest") : "";
  if (roomReq) notes.push("会場（部屋）の要望・希望：" + roomReq);
  const publicRoom = isMulti ? v("room") : "未定";
  const combinedOpsNote = [roomReq ? "【会場希望】" + roomReq : "", v("opsNote")].filter(Boolean).join("\n");

  const tags = entryTags_(v("format"), v("premiere"), v("tags"));
  const diffValue = diffSpec.enabled ? v("difficulty") : "-";
  const rows = order.sort().map((day) => {
    const sorted = byDay[day].sort((a, b) => a.start.localeCompare(b.start));
    const times = sorted.map((t) => t.token).join(", ");
    const slotCaps = sorted.filter((t) => t.capacity).map((t) => t.start + "=" + t.capacity).join(", ");
    return [
      day, v("group"), v("title"), publicRoom, times,
      v("duration"), v("fee"), v("capacity"), v("reserveType") || "事前予約", diffValue,
      tags, v("reserveUrl"), (ctx && ctx.visualUrl) || "",
      "", "", "", "", "", "",
      v("catch"), v("intro"), v("limit"), v("team"), v("feeNote"), v("notice"),
      v("showTag"), v("xAccount"), v("groupTag"), v("kana"), isMulti ? v("address") : "",
      slotCaps,
      (ctx && ctx.sourceId) || ""
    ];
  });

  return {
    rows,
    contact: {
      group: v("group"), title: v("title"), name: v("contactName"), email: v("contactEmail"),
      tel: v("contactTel"), note: combinedOpsNote, roomRequest: roomReq, sourceId: (ctx && ctx.sourceId) || ""
    },
    errors, warnings, notes,
  };
}

/** 「1.公演かんたん入力」の見出し行から、公演一覧へ引き継ぐ追加の列（20 列目以降・公開してよいものだけ）を選ぶ */
function entryExtraColumns(headerRow) {
  const out = [];
  (headerRow || []).forEach((h, i) => {
    const name = String(h || "").trim();
    if (i < 19 || !name || ENTRY_NOT_PUBLISHED_HEADERS.indexOf(name) !== -1) return;
    out.push({ header: name, index: i });
  });
  return out;
}

/** 「1.公演かんたん入力」の列名（取り込みが書く順） */
function entryDraftHeaders() {
  return [
    "日程", "団体名", "公演名", "会場(部屋)", "開始時間リスト", "所要時間(分)", "参加料金", "定員", "予約形式", "難易度",
    "内容目安", "予約URL", "公演ビジュアルURL", "所要時間優先テキスト", "受付終了時間", "完全終了時間", "最終フェーズ表示名", "ノイズ演出", "南京錠パスワード"
  ].concat(ENTRY_DRAFT_EXTRA_HEADERS, [ENTRY_SOURCE_HEADER]);
}

/** 比べるための値：時刻のセル（1899 年の Date）は "HH:mm"、日付は "yyyy/m/d"、数値は文字に */
function entryNorm_(v, tz) {
  if (Object.prototype.toString.call(v) === "[object Date]") {
    if (v.getFullYear() < 1900) return entryTime_(v, tz);
    if (typeof Utilities !== "undefined" && typeof Utilities.formatDate === "function") {
      const resolvedTz = tz || (typeof Session !== "undefined" && typeof Session.getScriptTimeZone === "function" ? Session.getScriptTimeZone() : "") || "Asia/Tokyo";
      try {
        const ymd = Utilities.formatDate(v, resolvedTz, "yyyy/M/d");
        const hm = Utilities.formatDate(v, resolvedTz, "HH:mm");
        if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(ymd)) {
          return ymd + (hm && hm !== "00:00" ? " " + hm : "");
        }
      } catch (_) {}
    }
    return v.getFullYear() + "/" + (v.getMonth() + 1) + "/" + v.getDate() + (v.getHours() || v.getMinutes() ? " " + entryTime_(v, tz) : "");
  }
  return entryText_(v);
}

const ENTRY_KIND_APPLIED = "反映";
const ENTRY_KIND_CHECK = "要確認";
const ENTRY_NOTE_MARK = "【取り込み・要確認】";
const ENTRY_EDITED_MARK = "【主催が修正済】";

/**
 * 取り込みの合わせ方。日程（先頭の列）ごとに、セルを 3 つ比べる。
 *   base … 前回取り込んだ団体の値（取り込み控え）
 *   cur  … 今「1.公演かんたん入力」にある値（主催が直しているかもしれない）
 *   next … 今回の団体の値
 * 主催だけが直したセルは主催の値を残す（organizerEdited に記録）。団体だけが直したセルは団体の値にする。
 * 両方が別の値に直したセルは主催の値を残し、要確認として返す。
 * 主催が日程セルを書き換えて1対1に対応が決まる場合は、主催の日程を残して同じ行として扱う。
 * 前回の控えが無い行（控えを取る前に取り込んだ行）は、違うセルをすべて要確認として主催の値を残す。
 * 返り値の行はすべて entryDraftHeaders() の並び。curIndex は cur の何行目か。
 */
function entryMergeRows(baseRows, curRows, nextRows) {
  const headers = entryDraftHeaders();
  const src = headers.indexOf(ENTRY_SOURCE_HEADER);
  const day = (r) => entryText_(r[0]);
  const baseMap = {};
  (baseRows || []).forEach((r) => { if (!(day(r) in baseMap)) baseMap[day(r)] = r; });
  const curMap = {};
  const orphans = [];
  (curRows || []).forEach((r, i) => {
    if (day(r) in curMap) orphans.push(i); else curMap[day(r)] = i;
  });
  const out = { updates: [], adds: [], deletes: [], log: [], checks: 0 };
  const isNew = !(baseRows || []).length && !(curRows || []).length;
  const matchedPairs = [];
  const unmatchedNext = [];
  const seenCurDays = new Set();

  (nextRows || []).forEach((n) => {
    const d = day(n);
    if (d in curMap) {
      seenCurDays.add(d);
      matchedPairs.push({ n, ci: curMap[d], b: baseMap[d] });
    } else {
      unmatchedNext.push(n);
    }
  });

  const unmatchedCurDays = Object.keys(curMap).filter((d) => !seenCurDays.has(d));
  // 主催が日程セルを1件だけ書き換えた場合：曖昧さが無ければ1対1で結び付け、重複追加を防ぐ
  if (
    unmatchedNext.length === 1 &&
    unmatchedCurDays.length === 1 &&
    orphans.length === 0 &&
    baseMap[day(unmatchedNext[0])] &&
    !baseMap[unmatchedCurDays[0]]
  ) {
    const n = unmatchedNext.pop();
    const cd = unmatchedCurDays.pop();
    seenCurDays.add(cd);
    matchedPairs.push({ n, ci: curMap[cd], b: baseMap[day(n)] });
  }

  unmatchedNext.forEach((n) => {
    const d = day(n);
    const b = baseMap[d];
    out.adds.push(n.slice());
    const column = isNew ? "（新規）" : b ? "（消えていた行を入れ直し）" : "（日程を追加）";
    out.log.push({ day: d, column, before: "", after: entryText_(n[4]), kind: ENTRY_KIND_APPLIED });
  });

  matchedPairs.forEach(({ n, ci, b }) => {
    const d = day(n);
    const c = curRows[ci];
    const logDay = day(c) || d;
    const values = c.slice();
    const conflicts = [];
    const changed = [];
    const matched = [];
    const organizerEdited = [];
    headers.forEach((h, k) => {
      if (k === src) { if (entryNorm_(c[k]) !== entryNorm_(n[k])) { values[k] = n[k]; changed.push(k); } return; }
      const cv = entryNorm_(c[k]);
      const nv = entryNorm_(n[k]);
      if (cv === nv) {
        matched.push(k);
        return;
      }
      const bv = b ? entryNorm_(b[k]) : null;
      if (b && cv === bv) {
        values[k] = n[k];
        changed.push(k);
        out.log.push({ day: logDay, column: h, before: cv, after: nv, kind: ENTRY_KIND_APPLIED });
      } else if (b && nv === bv) {
        // 主催だけが直したセル：そのまま残し、水色ハイライト対象として記録
        organizerEdited.push({ k, mine: cv, base: bv });
      } else {
        conflicts.push({ k, mine: cv, theirs: nv });
        out.log.push({ day: logDay, column: h + "（主催の値を残しました）", before: cv, after: nv, kind: ENTRY_KIND_CHECK });
        out.checks++;
      }
    });
    out.updates.push({ curIndex: ci, values, changed, conflicts, matched, organizerEdited });
  });

  unmatchedCurDays.forEach((d) => {
    const ci = curMap[d];
    const b = baseMap[d];
    if (!b) {
      orphans.push(ci);
      return;
    }
    const edited = headers.some((h, k) => k !== src && entryNorm_(curRows[ci][k]) !== entryNorm_(b[k]));
    out.deletes.push(ci);
    out.log.push({
      day: d, column: edited ? "（日程を削除・主催が直していた行）" : "（日程を削除）",
      before: entryText_(curRows[ci][4]), after: "", kind: edited ? ENTRY_KIND_CHECK : ENTRY_KIND_APPLIED,
    });
    if (edited) out.checks++;
  });
  orphans.forEach((ci) => {
    out.log.push({ day: day(curRows[ci]), column: "（記入用シートに無い日程の行・そのまま残しました）", before: entryText_(curRows[ci][4]), after: "", kind: ENTRY_KIND_CHECK });
    out.checks++;
  });
  return out;
}

/** 記入内容の指紋（前回の取り込みから変わったかを見る） */
function entryFingerprint(values, schedule, tz) {
  const s = JSON.stringify([values, (schedule || []).map((r) => [entryText_(r.day), entryTime_(r.start, tz), entryTime_(r.acceptEnd, tz), entryText_(r.capacity), entryText_(r.note)])]);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

/** 記入状況の文言 */
function entryStatus(submitted, built, fingerprint, lastFingerprint, anyInput, rowsPresent, checkCount) {
  if (!anyInput) return "未着手";
  if (!submitted) return "記入中";
  if (built.errors.length) return "提出済み（未記入あり・取り込めません）";
  if (!lastFingerprint) return "提出済み（未取り込み）";
  if (fingerprint !== lastFingerprint) return "提出後に変更あり";
  // 主催が「1.公演かんたん入力」から行を消した場合は、もう一度取り込める
  if (rowsPresent === false) return "取り込み済みの行が消えています（もう一度取り込めます）";
  return checkCount > 0 ? "取り込み済み（要確認 " + checkCount + " か所）" : "取り込み済み";
}

/** 「1.公演かんたん入力」に、記入用シートごとの行がいくつあるか（取り込み元の列で数える） */
function entryCountBySource(header, rows) {
  const col = header.map((h) => String(h || "").trim()).indexOf(ENTRY_SOURCE_HEADER);
  const counts = {};
  if (col < 0) return counts;
  rows.forEach((r) => {
    const id = entryText_(r[col]);
    if (id) counts[id] = (counts[id] || 0) + 1;
  });
  return counts;
}

/** 「1.公演かんたん入力」の要確認メモ（【取り込み・要確認】）が記入用シートごとに何件残っているか数える */
function entryCheckCountsBySource(header, rows, notes) {
  const col = (header || []).map((h) => String(h || "").trim()).indexOf(ENTRY_SOURCE_HEADER);
  const counts = {};
  if (col < 0) return counts;
  (rows || []).forEach((r, ri) => {
    const id = entryText_(r[col]);
    if (!id) return;
    const rowNotes = (notes && notes[ri]) || [];
    let c = 0;
    rowNotes.forEach((n) => {
      if (String(n || "").indexOf(ENTRY_NOTE_MARK) === 0) c++;
    });
    if (c > 0) counts[id] = (counts[id] || 0) + c;
  });
  return counts;
}

/* ─────────── ここからスプレッドシート・ドライブを操作する部分 ─────────── */

/** 「設定」から記入用シートに要る値を読む */
function entryReadConfig_(ss) {
  const sheet = getConfigSheet(ss);
  const map = {};
  if (sheet) sheet.getDataRange().getValues().forEach((r) => { map[String(r[0] || "").trim()] = r[1]; });
  const list = (k) => entryText_(map[k]).split(/[,、，\n]+/).map((s) => s.trim()).filter(Boolean);
  const days = Math.max(1, Number(entryText_(map["開催日数"])) || 1);
  const dayOptions = [];
  for (let i = 1; i <= days; i++) {
    const label = entryText_(map[i + "日目のラベル"]);
    dayOptions.push(label ? i + "日目（" + label + "）" : i + "日目");
  }
  return {
    mode: entryText_(map["会場のモード"]) === ENTRY_MODE_MULTI ? ENTRY_MODE_MULTI : ENTRY_MODE_SINGLE,
    rooms: list("会場の部屋一覧"),
    formats: list("公演形式の選択肢").length ? list("公演形式の選択肢") : ["ルーム型", "ホール型", "テーブル型", "周遊型", "その他"],
    difficultyPreset: entryDifficultySpec(map["難易度の表し方"]).preset,
    deadline: entryText_(map["記入の締切"]),
    saveFolder: entryText_(map["保存先フォルダ"]),
    eventName: entryText_(map["イベント名"]) || ss.getName(),
    dayOptions,
  };
}

/** 「設定」に出展団体まわりの設定を足す（無い項目だけ・旧シート名は自動移行） */
function entryEnsureConfig_(ss) {
  let sheet = getConfigSheet(ss);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_CONFIG);
    sheet.getRange(1, 1, 1, 3).setValues([["設定項目", "設定値", "説明・入力例"]]);
  } else if (sheet.getName() !== SHEET_CONFIG) {
    sheet.setName(SHEET_CONFIG);
  }
  const keys = new Set(sheet.getDataRange().getValues().map((r) => String(r[0] || "").trim()));
  [
    ["会場のモード", ENTRY_MODE_SINGLE, "★必須｜1つの建物 … 部屋割りは主催が行う（団体からは要望のみ受付） ／ 複数の建物 … 団体ごとに会場名と住所を書いてもらう"],
    ["会場の部屋一覧", "", "◎推奨（1つの建物のとき）｜主催が部屋割りするときのプルダウン候補（, 区切り）。会場マップの部屋名と一致させます"],
    ["公演形式の選択肢", "ルーム型, ホール型, カフェ型, ブース型, 周遊型, スタジアム型, その他", "◎推奨｜記入用シートの「公演形式」のプルダウン（, 区切り）"],
    ["難易度の表し方", "1〜10", "◎推奨｜1〜10 ／ 1〜5 ／ ★1〜★5 ／ 初級・中級・上級 ／ 使わない から選択"],
    ["記入の締切", "", "◎推奨｜記入用シートの「はじめに」に表示する締切（例: 2026年12月6日(日)）"],
    ["保存先フォルダ", "", "⚙管理｜記入用シート・素材フォルダを作る場所（ドライブのフォルダURL）。空欄ならこのスプシと同じ場所"],
  ].forEach((row) => { if (!keys.has(row[0])) sheet.appendRow(row); });
  styleConfigSheet_(sheet);
}

/** 「3.公演かんたん入力」の右側に、出展団体の項目の列を足す（無い列だけ）＋ 折りたたみ・内部列非表示（旧シート名は自動移行） */
function entryEnsureDraftHeaders_(ss) {
  const sheet = getDraftSheet(ss);
  if (!sheet) throw new Error("「" + SHEET_DRAFT + "」シートがありません。先に【初回】入力シートをセットアップしてください。");
  if (sheet.getName() !== SHEET_DRAFT) sheet.setName(SHEET_DRAFT);
  const cfg = entryReadConfig_(ss);
  styleDraftSheet_(sheet, cfg.difficultyPreset, cfg.rooms);

  const lastCol = Math.max(sheet.getLastColumn(), 19);
  const current = sheet.getRange(2, 1, 1, lastCol).getValues()[0].map((h) => String(h || "").trim());
  let col = Math.max(lastCol, 19) + 1;
  ENTRY_DRAFT_EXTRA_HEADERS.concat([ENTRY_SOURCE_HEADER]).forEach((h) => {
    if (current.indexOf(h) !== -1) return;
    if (sheet.getMaxColumns() < col) sheet.insertColumnsAfter(sheet.getMaxColumns(), col - sheet.getMaxColumns());
    const isHiddenMeta = ENTRY_NOT_PUBLISHED_HEADERS.indexOf(h) !== -1;
    sheet.getRange(2, col).setValue(h).setBackground(isHiddenMeta ? "#94a3b8" : "#0f766e").setFontColor("#ffffff").setFontWeight("bold");
    col++;
  });

  // 最新の見出しを読み直して、詳細列のグループ折りたたみ＆内部管理列の非表示を適用
  const finalLastCol = Math.max(sheet.getLastColumn(), 19);
  const finalHeaders = sheet.getRange(2, 1, 1, finalLastCol).getValues()[0].map((h) => String(h || "").trim());
  const extraVisibleCols = finalHeaders
    .map((h, i) => ({ h, c: i + 1 }))
    .filter((x) => x.c > 19 && x.h && ENTRY_NOT_PUBLISHED_HEADERS.indexOf(x.h) === -1);
  if (extraVisibleCols.length) {
    try {
      const startC = extraVisibleCols[0].c;
      const depth = typeof sheet.getColumnGroupDepth === "function" ? sheet.getColumnGroupDepth(startC) : 0;
      if (depth === 0) {
        sheet.getRange(1, startC, 1, extraVisibleCols.length).shiftColumnGroupDepth(1);
      }
      sheet.collapseAllColumnGroups();
    } catch (_) {}
  }
  ENTRY_NOT_PUBLISHED_HEADERS.forEach((h) => {
    const idx = finalHeaders.indexOf(h);
    if (idx >= 0) {
      try { sheet.hideColumns(idx + 1, 1); } catch (_) {}
    }
  });
  return sheet;
}

function entrySheet_(ss, name, headers, color, aliases) {
  let sheet = ss.getSheetByName(name);
  if (!sheet && aliases && aliases.length) {
    for (let i = 0; i < aliases.length; i++) {
      sheet = ss.getSheetByName(aliases[i]);
      if (sheet) {
        sheet.setName(name);
        break;
      }
    }
  }
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setBackground(color).setFontColor("#ffffff").setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

const ENTRY_GROUP_HEADERS = ["団体名", "担当者のメールアドレス（Googleアカウント）", "記入用シート", "素材フォルダ", "状態", "未記入など", "記入用シートの最終更新", "最終取り込み", "メモ", "_シートID", "_フォルダID", "_指紋"];
const ENTRY_CONTACT_HEADERS = ["団体名", "公演タイトル", "担当者名", "連絡先メールアドレス", "当日の緊急連絡先", "運営への連絡事項", "最終取り込み", "_シートID"];
const ENTRY_LOG_HEADERS = ["日時", "団体名", "公演タイトル", "日程", "項目", "変更前", "変更後", "扱い"];
const SHEET_IMPORT_BASE = "_取り込み控え";

/** 出展団体用の 3 シートを作成・配色・ボタン配置バー・非表示列を整える（UIダイアログは出さない） */
function entryEnsureEntryBookSheets_(ss) {
  const groups = entrySheet_(ss, SHEET_GROUPS, ENTRY_GROUP_HEADERS, "#0f766e", ["団体一覧"]);
  const contacts = entrySheet_(ss, SHEET_CONTACTS, ENTRY_CONTACT_HEADERS, "#b91c1c");
  const log = entrySheet_(ss, SHEET_IMPORT_LOG, ENTRY_LOG_HEADERS, "#475569");

  // 団体一覧：1行目に順序付きボタン配置バー、2行目以降は黄色＝記入欄・灰＝自動欄に色分け（値が入る前の行も視認可能にする。値は書かない）
  groups.getRange("A1:B1").setBackground("#2563eb").setFontColor("#ffffff").setFontWeight("bold");
  groups.getRange("C1:H1").setBackground("#0f766e").setFontColor("#ffffff").setFontWeight("bold");
  groups.getRange("I1").setBackground("#2563eb").setFontColor("#ffffff").setFontWeight("bold");
  groups.getRange("A1").setNote("【STEP 2-①】ここに 1 公演 1 行で団体名を記入してください（黄色の列）");
  groups.getRange("B1").setNote("【STEP 2-①】各団体の担当者の Google アカウントを記入してください（この人だけに共有されます）");
  groups.getRange("M1").setValue("【ボタン② 配置】\n記入用シートを作る\n(entryCreateSheets)")
    .setBackground("#dbeafe").setFontColor("#1e3a8a").setFontWeight("bold").setFontSize(9).setHorizontalAlignment("center").setVerticalAlignment("middle").setWrap(true);
  groups.getRange("N1").setValue("➔").setHorizontalAlignment("center").setVerticalAlignment("middle").setFontWeight("bold");
  groups.getRange("O1").setValue("【ボタン③ 配置】\n記入状況を確認する\n(entryRefreshStatus)")
    .setBackground("#dbeafe").setFontColor("#1e3a8a").setFontWeight("bold").setFontSize(9).setHorizontalAlignment("center").setVerticalAlignment("middle").setWrap(true);
  groups.getRange("P1").setValue("➔").setHorizontalAlignment("center").setVerticalAlignment("middle").setFontWeight("bold");
  groups.getRange("Q1").setValue("【ボタン④ 配置】\n全団体から取り込む\n(entryImportAll)")
    .setBackground("#dcfce7").setFontColor("#14532d").setFontWeight("bold").setFontSize(9).setHorizontalAlignment("center").setVerticalAlignment("middle").setWrap(true);
  groups.setRowHeight(1, 50);
  groups.setFrozenRows(1);
  groups.getRange("A2:B100").setBackground("#fff4b8");
  groups.getRange("C2:H100").setBackground("#f8fafc");
  groups.getRange("I2:I100").setBackground("#fff4b8");
  groups.setColumnWidth(1, 180);
  groups.setColumnWidth(2, 240);
  groups.setColumnWidth(5, 210);
  groups.setColumnWidth(13, 165);
  groups.setColumnWidth(14, 28);
  groups.setColumnWidth(15, 165);
  groups.setColumnWidth(16, 28);
  groups.setColumnWidth(17, 165);
  groups.hideColumns(10, 3);

  // 運営用連絡先：内部ID列を隠し、非公開であることを明示
  contacts.getRange("I1").setValue("※ 非公開シート（公開データ・data.json には一切出力されません）")
    .setBackground("#fde2e2").setFontColor("#991b1b").setFontWeight("bold");
  try { contacts.hideColumns(8, 1); } catch (_) {}

  // 取り込み履歴：要確認は黄色・反映は緑の条件付き書式
  try {
    const rangeH = log.getRange("H2:H500");
    log.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(ENTRY_KIND_CHECK).setBackground("#fde68a").setRanges([rangeH]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(ENTRY_KIND_APPLIED).setBackground("#dcfce7").setRanges([rangeH]).build(),
    ]);
  } catch (_) {}

  return { groups, contacts, log };
}

/** メニュー：団体一覧・運営用連絡先・取り込み履歴を用意する */
function entrySetupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  entryEnsureConfig_(ss);
  entryEnsureDraftHeaders_(ss);
  const existingMain = getMainSheet(ss);
  if (existingMain && existingMain.getName() !== SHEET_MAIN) existingMain.setName(SHEET_MAIN);
  const { groups } = entryEnsureEntryBookSheets_(ss);
  setupReadmeSheet(ss);
  arrangeOrganizerTabs_(ss);
  ss.setActiveSheet(groups);
  ui.alert(
    "出展団体の準備ができました",
    "1.「" + SHEET_CONFIG + "」の黄色セル（★必須：会場のモードなど）を書いてください。\n" +
      "2.「" + SHEET_GROUPS + "」の黄色列（A列：団体名、B列：Googleメール）を 1 公演 1 行で書いてください。\n" +
      "3. 右上の【ボタン② 配置】にある【記入用シートを作る】から作成・共有し、以降はボタン③・④を順番に押すだけです。\n\n" +
      "「" + SHEET_CONTACTS + "」は公開データに出ません。図解は「" + SHEET_README + "」をご覧ください。",
    ui.ButtonSet.OK
  );
}

/** 記入用シートの中身を作る */
function entryBuildTemplate_(book, cfg, groupName, folderUrl) {
  const spec = entryFieldSpec(cfg.mode, cfg.difficultyPreset);
  const Y = "#fff4b8", AUTO = "#f1f5f9", G = "#f1f5f9", P = "#fde2e2";
  book.getSheets()[0].setName(ENTRY_TAB_GUIDE);
  const guide = book.getSheetByName(ENTRY_TAB_GUIDE);
  const prof = book.insertSheet(ENTRY_TAB_PROFILE);
  const sched = book.insertSheet(ENTRY_TAB_SCHEDULE);
  const check = book.insertSheet(ENTRY_TAB_CHECK);

  const solidBorder = (rng, color) => {
    if (SpreadsheetApp.BorderStyle) {
      rng.setBorder(true, true, true, true, true, true, color || "#cbd5e1", SpreadsheetApp.BorderStyle.SOLID);
    }
  };

  // はじめに（イラスト図解・基本3ステップ・統一色凡例・迷ったときQ&A＋詳細項目ガイド）
  try { guide.getDataRange().breakApart(); } catch (_) {}
  guide.clear();

  guide.getRange("A1:E1").merge()
    .setValue(cfg.eventName + "　公演情報シート（出展団体さま記入用）")
    .setBackground("#1e1b4b").setFontColor("#ffffff").setFontWeight("bold").setFontSize(15)
    .setHorizontalAlignment("center").setVerticalAlignment("middle");
  guide.setRowHeight(1, 48);

  guide.getRange("A2:E2").merge()
    .setValue("このシートを1回ご記入いただくだけで、タイムテーブル掲載と運営への連絡がすべて完了します！")
    .setBackground("#ede9fe").setFontColor("#312e81").setFontWeight("bold").setFontSize(11)
    .setHorizontalAlignment("center").setWrap(true).setVerticalAlignment("middle");
  guide.setRowHeight(2, 36);
  guide.setRowHeight(3, 10);

  // 提出期限・メインビジュアル画像フォルダカード
  guide.getRange("A4:B4").merge().setValue("提出期限")
    .setBackground("#fff4b8").setFontColor("#78350f").setFontWeight("bold")
    .setHorizontalAlignment("center").setVerticalAlignment("middle");
  guide.getRange("C4:E4").merge().setValue(cfg.deadline || "運営からの案内をご確認ください")
    .setBackground("#fffbeb").setFontColor("#1e293b").setFontWeight("bold").setWrap(true).setVerticalAlignment("middle");
  guide.setRowHeight(4, 34);

  guide.getRange("A5:B5").merge().setValue("メインビジュアル画像フォルダ")
    .setBackground("#f1f5f9").setFontColor("#334155").setFontWeight("bold")
    .setHorizontalAlignment("center").setVerticalAlignment("middle");
  guide.getRange("C5:E5").merge()
    .setValue((folderUrl || "（運営からの案内をご確認ください）") + "\n※ このフォルダにメインビジュアル画像を1枚入れてください（縦長推奨）")
    .setBackground("#ffffff").setFontColor("#1e293b").setWrap(true).setVerticalAlignment("middle");
  guide.setRowHeight(5, 46);
  solidBorder(guide.getRange("A4:E5"));
  guide.setRowHeight(6, 12);

  // イラスト図解バナー（=IMAGE）
  guide.getRange("A7:E7").merge()
    .setValue('=IMAGE("' + README_IMAGE_BASE_URL + '/readme-exhibitor-flow.png", 1)')
    .setBackground("#ffffff").setHorizontalAlignment("center").setVerticalAlignment("middle");
  solidBorder(guide.getRange("A7:E7"), "#e2e8f0");
  guide.setRowHeight(7, 210);
  guide.setRowHeight(8, 12);

  // メインゾーン：基本3ステップ
  guide.getRange("A9:E9").merge()
    .setValue("★ 提出までの基本 3 ステップ（これだけで完了！）")
    .setBackground("#1e3a8a").setFontColor("#ffffff").setFontWeight("bold").setFontSize(12)
    .setVerticalAlignment("middle");
  guide.setRowHeight(9, 34);

  const exhibitorSteps = [
    ["STEP 1", "#fff4b8", "#78350f", "「" + ENTRY_TAB_PROFILE + "」タブの黄色いセルを記入する\n※必須マークのある項目と、ピンク色の連絡先（非公開）を埋めてください。メインビジュアル画像は上のフォルダへ1枚入れます。"],
    ["STEP 2", "#fff4b8", "#78350f", "「" + ENTRY_TAB_SCHEDULE + "」タブに開催回を記入する\n1回の開催につき1行ずつ記入します。開演時刻を入れれば、終演時刻は「所要時間」から自動で計算されます。"],
    ["STEP 3", "#dcfce7", "#14532d", "「" + ENTRY_TAB_CHECK + "」タブをチェック →「提出する」にチェック！\n「未記入」が無くなっているのを確認し、「" + ENTRY_TAB_PROFILE + "」一番下の「提出する」にチェックを入れたら完了です。"]
  ];
  exhibitorSteps.forEach((st, idx) => {
    const r = 10 + idx;
    guide.getRange(r, 1).setValue(st[0])
      .setBackground(st[1]).setFontColor(st[2]).setFontWeight("bold").setFontSize(11)
      .setHorizontalAlignment("center").setVerticalAlignment("middle");
    guide.getRange(r, 2, 1, 4).merge().setValue(st[3])
      .setBackground("#ffffff").setFontColor("#1e293b").setFontSize(10).setWrap(true).setVerticalAlignment("middle");
    guide.setRowHeight(r, 48);
  });
  solidBorder(guide.getRange("A10:E12"));
  guide.setRowHeight(13, 14);

  // セルの色の見方（統一ルール）
  guide.getRange("A14:E14").merge()
    .setValue("■ セルの色の見方")
    .setBackground("#1f2937").setFontColor("#ffffff").setFontWeight("bold").setFontSize(11)
    .setVerticalAlignment("middle");
  guide.setRowHeight(14, 30);

  const guideLegend = [
    ["薄い黄色", Y, "#78350f", "あなたが入力する場所", "この色のセルを埋めてください"],
    ["薄いピンク", P, "#991b1b", "運営だけが見る連絡先（非公開）", "担当者名・連絡先・緊急電話・連絡事項など。Webサイトには一切公開されません"],
    ["薄いグレー", AUTO, "#475569", "自動入力・記入例", "システムが自動で計算・表示する欄や記入例です。触らなくて大丈夫です"]
  ];
  guideLegend.forEach((item, idx) => {
    const r = 15 + idx;
    guide.getRange(r, 1).setValue(item[0])
      .setBackground(item[1]).setFontColor(item[2]).setFontWeight("bold")
      .setHorizontalAlignment("center").setVerticalAlignment("middle");
    guide.getRange(r, 2, 1, 2).merge().setValue(item[3])
      .setBackground("#ffffff").setFontColor("#1e293b").setFontWeight("bold").setVerticalAlignment("middle");
    guide.getRange(r, 4, 1, 2).merge().setValue(item[4])
      .setBackground("#ffffff").setFontColor("#334155").setWrap(true).setVerticalAlignment("middle");
    solidBorder(guide.getRange(r, 1, 1, 5));
    guide.setRowHeight(r, 32);
  });

  // 仕切り余白
  guide.setRowHeight(18, 20);
  guide.setRowHeight(19, 20);

  // 迷ったとき・各項目のくわしい説明（必要なときだけ）
  guide.getRange("A20:E20").merge()
    .setValue("▼ 迷ったとき・各項目のくわしい説明（必要なときだけ見てください）")
    .setBackground("#475569").setFontColor("#ffffff").setFontWeight("bold").setFontSize(11)
    .setVerticalAlignment("middle");
  guide.setRowHeight(20, 32);

  const qas = [
    ["提出後に直したくなったら？", "このシートをそのまま書き直してください（別ファイルを作ったり送り直す必要はありません）。ただし書き換えただけではWebに反映されないため、修正したあとは必ず運営へ「更新しました」と一言ご連絡ください。"],
    ["まだ決まっていない項目があるときは？", "空欄のままで構いません。決まり次第、追記してください（ただし必須項目が埋まっていないと取り込めないので、仮でも入力できるものは埋めておくとスムーズです）。"],
    ["カフェ謎・周遊など随時受付の書き方は？", "「予約形式」で「当日受付(ファミレス式)」などを選び、「" + ENTRY_TAB_SCHEDULE + "」では「開演」に受付開始、「随時受付の終了」に最終受付時刻を入れてください。"],
    ["特定の回だけ定員が違う場合は？", "基本の定員を「" + ENTRY_TAB_PROFILE + "」に書いたうえで、異なる回だけ「" + ENTRY_TAB_SCHEDULE + "」の「定員（任意）」欄に人数を書いてください。"],
    ["24時を超える深夜公演の場合は？", "「25:30」のように24時以降もそのまま半角・24時間表記（時刻は「13:30」の形式）で入力できます。"]
  ];
  qas.forEach((qa, idx) => {
    const r = 21 + idx;
    guide.getRange(r, 1, 1, 2).merge().setValue(qa[0])
      .setBackground("#f8fafc").setFontColor("#1e293b").setFontWeight("bold").setWrap(true).setVerticalAlignment("middle");
    guide.getRange(r, 3, 1, 3).merge().setValue(qa[1])
      .setBackground("#ffffff").setFontColor("#334155").setWrap(true).setVerticalAlignment("middle");
    solidBorder(guide.getRange(r, 1, 1, 5));
    guide.setRowHeight(r, 42);
  });

  // 迷いやすい項目の説明
  guide.setRowHeight(26, 14);
  guide.getRange("A27:E27").merge()
    .setValue("■ 「" + ENTRY_TAB_PROFILE + "」「" + ENTRY_TAB_SCHEDULE + "」迷いやすい項目の説明")
    .setBackground("#334155").setFontColor("#ffffff").setFontWeight("bold").setFontSize(10.5)
    .setVerticalAlignment("middle");
  guide.setRowHeight(27, 28);

  const exhibitorFieldDetails = [
    [
      "予約形式の選び方（3種類）",
      "・「事前予約」：開始時刻を決めてチケットを取ってもらう通常の公演です。\n" +
      "・「当日受付(ファミレス式)」：開催時間内に並んだ順などで参加する公演です（予約URLは空欄でOK）。\n" +
      "・「事前予約(時間自由)」：事前チケットは必要ですが、好きな時刻に参加できる周遊型などに向いています。",
      68
    ],
    [
      "「所要時間」と\n「うち制限時間」の違い",
      "・「所要時間（分）」は受付〜解説終了までの合計時間です（タイムテーブル枠と終演時刻の自動計算に使います）。\n" +
      "・「うち制限時間（分）」は謎解き本編だけの時間（任意）です。例：制限45分・全体60分。",
      54
    ],
    [
      "内容目安（タグ）の書き方",
      "「初心者歓迎・ストーリー重視」のように「・」で区切って書くと、Webタイムテーブル上で来場者がタグ絞り込みに使えるようになります。",
      44
    ],
    [
      "メインビジュアル画像の出し方",
      "「" + ENTRY_TAB_GUIDE + "」上段、または「" + ENTRY_TAB_PROFILE + "」のメインビジュアル画像欄にある専用フォルダURLへ画像を1枚アップロードしてください（縦長推奨）。運営の取り込み時にWebタイムテーブルへ自動反映されます。",
      54
    ],
    [
      "Webサイトに公開されない項目",
      "ピンク色のセル（担当者名・連絡先メール・緊急電話・会場についての要望・運営への連絡事項）に加えて、「" + ENTRY_TAB_SCHEDULE + "」シート右端の「備考」列も運営確認専用であり、Webサイトには一切公開されません。",
      54
    ]
  ];
  exhibitorFieldDetails.forEach((fd, idx) => {
    const r = 28 + idx;
    guide.getRange(r, 1, 1, 2).merge().setValue(fd[0])
      .setBackground("#f8fafc").setFontColor("#1e293b").setFontWeight("bold").setWrap(true).setVerticalAlignment("middle");
    guide.getRange(r, 3, 1, 3).merge().setValue(fd[1])
      .setBackground("#ffffff").setFontColor("#334155").setWrap(true).setVerticalAlignment("middle");
    solidBorder(guide.getRange(r, 1, 1, 5));
    guide.setRowHeight(r, fd[2]);
  });

  guide.setColumnWidth(1, 130);
  guide.setColumnWidth(2, 140);
  guide.setColumnWidth(3, 210);
  guide.setColumnWidth(4, 210);
  guide.setColumnWidth(5, 210);

  // 1_公演概要：B 項目／C 記入欄／D 補足／E 記入例
  prof.getRange("A1").setValue("1. 公演概要").setFontSize(14).setFontWeight("bold");
  prof.getRange("B3:E3").setValues([["項目", "記入欄", "補足", "記入例"]]).setFontWeight("bold").setBackground("#334155").setFontColor("#ffffff");
  const rows = [];
  spec.forEach((f) => rows.push(f.sec ? ["■ " + f.sec, "", "", ""] : [f.label + (f.req === true ? "　※必須" : ""), f.key === "group" ? groupName : "", f.hint || "", f.ex || ""]));
  prof.getRange(4, 2, rows.length, 4).setValues(rows);
  prof.setColumnWidth(2, 220); prof.setColumnWidth(3, 360); prof.setColumnWidth(4, 300); prof.setColumnWidth(5, 280);
  prof.getRange(4, 2, rows.length, 4).setWrap(true).setVerticalAlignment("top");
  const rowOf = {};
  spec.forEach((f, i) => {
    const r = 4 + i;
    if (f.sec) { prof.getRange(r, 2, 1, 4).setBackground("#e2e8f0").setFontWeight("bold"); return; }
    rowOf[f.key] = r;
    const cell = prof.getRange(r, 3);
    prof.getRange(r, 5).setBackground(G).setFontColor("#555555");
    cell.setBackground(f.type === "auto" || f.type === "folder" ? AUTO : f.private ? P : Y);
    if (f.type === "folder") {
      if (folderUrl) cell.setValue(folderUrl);
      else cell.setValue("（運営からの案内をご確認ください）").setFontColor("#555555");
    }
    let rule = null;
    const list = f.type === "list:format" ? cfg.formats : f.type === "list:rooms" ? cfg.rooms : f.options;
    if (list && list.length) rule = SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build();
    else if (f.type === "int") rule = SpreadsheetApp.newDataValidation().requireNumberGreaterThanOrEqualTo(0).setAllowInvalid(false).setHelpText("半角の整数で入力してください").build();
    else if (f.type === "email") rule = SpreadsheetApp.newDataValidation().requireTextIsEmail().setAllowInvalid(false).build();
    else if (f.type === "url") rule = SpreadsheetApp.newDataValidation().requireTextIsUrl().setAllowInvalid(false).build();
    if (rule) cell.setDataValidation(rule);
    if (f.type === "checkbox") cell.insertCheckboxes();
    if (f.type === "long") prof.setRowHeight(r, 90);
  });
  prof.setFrozenRows(3);

  // 2_公演スケジュール：B 回／C 日程／D 開演／E 終演(自動)／F 随時受付の終了／G 定員(任意)／H 備考
  sched.getRange("A1").setValue("2. 公演スケジュール").setFontSize(14).setFontWeight("bold");
  sched.getRange("A2").setValue("1回の公演につき1行。終演は「所要時間」から自動で計算されます。カフェ謎など随時受付の公演は、開演に受付開始、「随時受付の終了」に受付終了を書いてください。");
  sched.getRange("B4:H4").setValues([["回", "日程", "開演", "終演（自動）", "随時受付の終了", "定員（任意）", "備考"]]).setFontWeight("bold").setBackground("#334155").setFontColor("#ffffff");
  sched.getRange("B5:H5").setValues([["例", cfg.dayOptions[0], "11:00", "12:00", "", "", "記入例の行です（消さなくて大丈夫です）"]]).setBackground(G).setFontColor("#555555");
  const durCell = "'" + ENTRY_TAB_PROFILE + "'!$C$" + rowOf.duration;
  const body = [];
  for (let i = 0; i < ENTRY_SCHEDULE_ROWS; i++) {
    const r = 6 + i;
    body.push([i + 1, "", "", '=IF(OR(D' + r + '="",' + durCell + '=""),"",D' + r + "+" + durCell + "/1440)", "", "", ""]);
  }
  sched.getRange(6, 2, ENTRY_SCHEDULE_ROWS, 7).setValues(body);
  sched.getRange(6, 3, ENTRY_SCHEDULE_ROWS, 2).setBackground(Y);
  sched.getRange(6, 6, ENTRY_SCHEDULE_ROWS, 3).setBackground(Y);
  sched.getRange(6, 5, ENTRY_SCHEDULE_ROWS, 1).setBackground(AUTO);
  sched.getRange(5, 4, ENTRY_SCHEDULE_ROWS + 1, 3).setNumberFormat("HH:mm");
  sched.getRange(6, 3, ENTRY_SCHEDULE_ROWS, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(cfg.dayOptions, true).setAllowInvalid(false).build());
  const timeRule = (col) => SpreadsheetApp.newDataValidation()
    .requireFormulaSatisfied("=OR(ISBLANK(" + col + "6),AND(ISNUMBER(" + col + "6)," + col + "6<1))")
    .setAllowInvalid(false).setHelpText("13:30 のように半角・24時間表記で入力してください").build();
  sched.getRange(6, 4, ENTRY_SCHEDULE_ROWS, 1).setDataValidation(timeRule("D"));
  sched.getRange(6, 6, ENTRY_SCHEDULE_ROWS, 1).setDataValidation(timeRule("F"));
  sched.getRange(6, 7, ENTRY_SCHEDULE_ROWS, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireNumberGreaterThanOrEqualTo(0).setAllowInvalid(false).build());
  sched.setFrozenRows(4);
  sched.setColumnWidth(3, 170); sched.setColumnWidth(8, 360);

  // 確認：必須項目の記入状況と回数
  check.getRange("A1").setValue("確認（自動）").setFontSize(14).setFontWeight("bold");
  check.getRange("A2").setValue("「未記入」が無くなったら、「" + ENTRY_TAB_PROFILE + "」の「提出する」にチェックしてください。");
  check.getRange("B4:C4").setValues([["項目", "状態"]]).setFontWeight("bold").setBackground("#334155").setFontColor("#ffffff");
  const checks = [];
  spec.forEach((f) => {
    if (!f.key || (f.req !== true && f.req !== "unlessWalkIn")) return;
    if (f.type === "auto") return;
    const ref = "'" + ENTRY_TAB_PROFILE + "'!C" + rowOf[f.key];
    const formula = f.req === "unlessWalkIn"
      ? '=IF(OR(LEN(' + ref + ')>0,LEFT(\'' + ENTRY_TAB_PROFILE + "'!C" + rowOf.reserveType + ',4)="当日受付"),"OK","未記入")'
      : '=IF(LEN(' + ref + ')>0,"OK","未記入")';
    checks.push([f.label, formula]);
  });
  checks.push(["公演スケジュールの回数", '=COUNT(\'' + ENTRY_TAB_SCHEDULE + "'!D6:D" + (5 + ENTRY_SCHEDULE_ROWS) + ')&" 回"']);
  check.getRange(5, 2, checks.length, 2).setValues(checks);
  check.setColumnWidth(2, 260); check.setColumnWidth(3, 120);
  const cond = SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("未記入").setBackground("#fecaca").setRanges([check.getRange(5, 3, checks.length, 1)]).build();
  check.setConditionalFormatRules([cond]);
  return rowOf;
}

/** 記入用シートから値を読む（項目名で探すので、行がずれても読める） */
function entryReadSheet_(book, mode, diffPreset) {
  const spec = entryFieldSpec(mode, diffPreset).filter((f) => f.key);
  const byLabel = {};
  spec.forEach((f) => { byLabel[f.label] = f.key; byLabel[f.label + "　※必須"] = f.key; });
  const values = {};
  const prof = book.getSheetByName(ENTRY_TAB_PROFILE);
  prof.getRange(4, 2, Math.max(1, prof.getLastRow() - 3), 2).getValues().forEach((r) => {
    const key = byLabel[String(r[0] || "").trim()];
    if (key) values[key] = r[1];
  });
  const sched = book.getSheetByName(ENTRY_TAB_SCHEDULE);
  const schedule = sched.getRange(6, 3, ENTRY_SCHEDULE_ROWS, 6).getValues().map((r) => ({ day: r[0], start: r[1], acceptEnd: r[3], capacity: r[4], note: r[5] }));
  const submitted = values.submit === true || String(values.submit).toUpperCase() === "TRUE";
  delete values.submit;
  const anyInput = Object.keys(values).some((k) => k !== "group" && k !== "visual" && entryText_(values[k]) !== "") || schedule.some((r) => entryText_(r.start) !== "");
  const tz = typeof book.getSpreadsheetTimeZone === "function" ? book.getSpreadsheetTimeZone() : "";
  return { values, schedule, submitted, anyInput, tz };
}

/** 素材フォルダの最初の画像の URL（公開リンクにする） */
function entryVisualUrl_(folderId) {
  if (!folderId) return "";
  try {
    const files = DriveApp.getFolderById(folderId).getFiles();
    while (files.hasNext()) {
      const file = files.next();
      if (/^image\//.test(file.getMimeType())) {
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        return file.getUrl();
      }
    }
  } catch (e) {
    console.warn("素材フォルダを読めませんでした:", e);
  }
  return "";
}

/** フォルダの URL（…/folders/ID、?id=ID）か ID そのものから ID を取り出す。読めなければ "" */
function entryFolderId_(text) {
  const t = entryText_(text);
  if (!t) return "";
  const m = t.match(/\/folders\/([A-Za-z0-9_-]{10,})/) || t.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(t) ? t : "";
}

/** 作る前の確認用：保存先フォルダの名前。読めなければ error に理由 */
function entryBaseFolderName_(ss, cfg) {
  try {
    if (cfg.saveFolder) {
      const id = entryFolderId_(cfg.saveFolder);
      if (!id) throw new Error("「" + SHEET_CONFIG + "」の「保存先フォルダ」が読めません。ドライブでフォルダを開き、アドレス欄の URL を貼ってください。");
      return { name: "「" + DriveApp.getFolderById(id).getName() + "」（設定の保存先フォルダ）" };
    }
    const parents = DriveApp.getFileById(ss.getId()).getParents();
    if (!parents.hasNext()) throw new Error("このスプシのフォルダを読めません。「" + SHEET_CONFIG + "」の「保存先フォルダ」にフォルダの URL を書いてください。");
    return { name: "「" + parents.next().getName() + "」（このスプシと同じフォルダ）" };
  } catch (e) {
    return { error: String(e && e.message || e).indexOf("「" + SHEET_CONFIG + "」") !== -1 ? e.message : "「" + SHEET_CONFIG + "」の「保存先フォルダ」を開けません。URL と、あなたにそのフォルダの編集権限があるかを確かめてください。" };
  }
}

/** 名前でフォルダを探し、無ければ作る（何度実行しても 1 つだけ） */
function entryChildFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/**
 * 出展団体まわりのファイルを置く場所。
 *   <保存先>/出展団体_<イベント名>/記入用シート ・ 素材
 * 保存先は「設定」の「保存先フォルダ」。空欄なら主催スプシと同じフォルダ
 */
function entryWorkFolders_(ss, cfg) {
  let base = null;
  if (cfg.saveFolder) {
    const id = entryFolderId_(cfg.saveFolder);
    if (!id) throw new Error("「" + SHEET_CONFIG + "」の「保存先フォルダ」が読めません。ドライブでフォルダを開き、アドレス欄の URL を貼ってください。");
    try { base = DriveApp.getFolderById(id); } catch (e) {
      throw new Error("「" + SHEET_CONFIG + "」の「保存先フォルダ」を開けません。URL と、あなたにそのフォルダの編集権限があるかを確かめてください。");
    }
  } else {
    try {
      const parents = DriveApp.getFileById(ss.getId()).getParents();
      if (parents.hasNext()) base = parents.next();
    } catch (_) { /* 親を読めないときは下で止める */ }
    if (!base) throw new Error("このスプシのフォルダを読めません。「" + SHEET_CONFIG + "」の「保存先フォルダ」にフォルダの URL を書いてください。");
  }
  const root = entryChildFolder_(base, "出展団体_" + cfg.eventName);
  return { base, root, sheets: entryChildFolder_(root, "記入用シート"), assets: entryChildFolder_(root, "素材") };
}

/** メニュー：「2.団体一覧」のうち、まだ記入用シートが無い行の分を作って共有する */
function entryCreateSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const groups = getGroupsSheet(ss);
  if (!groups) { ui.alert("先にメニューの【出展団体の準備】を実行してください。"); return; }
  const cfg = entryReadConfig_(ss);
  const data = groups.getDataRange().getValues();
  // 見える「記入用シート」リンク（C列）または非表示の「_シートID」（J列）が空なら未作成扱い（C列を消して作り直すケースにも対応）
  const isPending = (r) => entryText_(r[0]) && (!entryText_(r[2]) || !entryText_(r[9]));
  const pending = data.slice(1).filter(isPending).length;
  if (!pending) { ui.alert("作る分はありません", "「" + SHEET_GROUPS + "」の団体は、すべて記入用シートが作成済みです。", ui.ButtonSet.OK); return; }
  const base = entryBaseFolderName_(ss, cfg);
  if (base.error) { ui.alert("保存先を確かめてください", base.error, ui.ButtonSet.OK); return; }
  const ok = ui.alert(
    "記入用シートを " + pending + " 件作ります",
    "保存先：" + base.name + " ／ 出展団体_" + cfg.eventName + "\n" +
      "　├ 記入用シート（団体ごとのスプシ）\n" +
      "　└ 素材（団体ごとのフォルダ）\n\n" +
      "各団体の担当者に、その団体の分だけを編集権限で共有します。\n" +
      "保存先を変えるときは「いいえ」を押し、「" + SHEET_CONFIG + "」の「保存先フォルダ」にフォルダの URL を書いてください。\n\n作りますか？",
    ui.ButtonSet.YES_NO
  );
  if (ok !== ui.Button.YES) return;
  const work = entryWorkFolders_(ss, cfg);
  const started = Date.now();
  let made = 0;
  const problems = [];
  for (let i = 1; i < data.length; i++) {
    const name = entryText_(data[i][0]);
    const email = entryText_(data[i][1]);
    if (!isPending(data[i])) continue;
    if (Date.now() - started > 4.5 * 60 * 1000) { problems.push("時間切れのため、残りはもう一度実行してください"); break; }
    const folder = work.assets.createFolder("素材_" + name);
    const book = SpreadsheetApp.create(cfg.eventName + "_公演情報_" + name);
    DriveApp.getFileById(book.getId()).moveTo(work.sheets);
    entryBuildTemplate_(book, cfg, name, folder.getUrl());
    if (email) {
      try { book.addEditor(email); folder.addEditor(email); } catch (e) { problems.push(name + "：" + email + " に共有できませんでした（Googleアカウントか確認してください）"); }
    } else {
      problems.push(name + "：メールアドレスが空なので共有していません");
    }
    groups.getRange(i + 1, 3, 1, 3).setValues([[book.getUrl(), folder.getUrl(), "未着手"]]);
    groups.getRange(i + 1, 10, 1, 3).setValues([[book.getId(), folder.getId(), ""]]);
    made++;
    SpreadsheetApp.flush();
  }
  ui.alert("記入用シートを作りました", made + " 件作りました。\n保存先：" + work.root.getUrl() + (problems.length ? "\n\n" + problems.join("\n") : "") + "\n\n「記入用シート」の列のリンクを各団体に知らせてください。", ui.ButtonSet.OK);
}

/** 1 行分の記入用シートを読み、組み立てまで行う */
function entryLoadRow_(row, cfg) {
  const book = SpreadsheetApp.openById(row[9]);
  const read = entryReadSheet_(book, cfg.mode, cfg.difficultyPreset);
  const visualUrl = entryVisualUrl_(row[10]);
  const built = entryBuildDraftRows(read.values, read.schedule, {
    mode: cfg.mode,
    difficultyPreset: cfg.difficultyPreset,
    sourceId: row[9],
    visualUrl,
    tz: read.tz,
  });
  const fingerprint = entryFingerprint(Object.assign({ _visual: visualUrl }, read.values), read.schedule, read.tz);
  const updated = DriveApp.getFileById(row[9]).getLastUpdated();
  return { read, built, fingerprint, updated };
}

/** 主催スプシの「3.公演かんたん入力」を読み、記入用シートごとの行数を返す */
function entryDraftCounts_(ss) {
  const draft = getDraftSheet(ss);
  if (!draft || draft.getLastRow() < 3) return {};
  const width = draft.getLastColumn();
  return entryCountBySource(draft.getRange(2, 1, 1, width).getValues()[0], draft.getRange(3, 1, draft.getLastRow() - 2, width).getValues());
}

/** 主催スプシの「3.公演かんたん入力」を読み、記入用シートごとの要確認メモ数を返す */
function entryDraftCheckCounts_(ss) {
  const draft = getDraftSheet(ss);
  if (!draft || draft.getLastRow() < 3) return {};
  const height = draft.getLastRow() - 2;
  const width = draft.getLastColumn();
  const header = draft.getRange(2, 1, 1, width).getValues()[0];
  const rows = draft.getRange(3, 1, height, width).getValues();
  const range = draft.getRange(3, 1, height, width);
  let notes = null;
  if (typeof range.getNotes === "function") {
    const raw = range.getNotes();
    if (Array.isArray(raw)) notes = raw;
  }
  if (!notes) {
    notes = Array.from({ length: height }, (_, ri) =>
      Array.from({ length: width }, (_, ci) => draft.getRange(3 + ri, 1 + ci).getNote())
    );
  }
  return entryCheckCountsBySource(header, rows, notes);
}

/** メニュー：記入状況を確認する（取り込みはしない） */
function entryRefreshStatus() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const groups = getGroupsSheet(ss);
  if (!groups) { SpreadsheetApp.getUi().alert("先にメニューの【出展団体の準備】を実行してください。"); return; }
  const cfg = entryReadConfig_(ss);
  const data = groups.getDataRange().getValues();
  const counts = entryDraftCounts_(ss);
  const checkCounts = entryDraftCheckCounts_(ss);
  for (let i = 1; i < data.length; i++) {
    if (!entryText_(data[i][0]) || !entryText_(data[i][2]) || !entryText_(data[i][9])) continue;
    try {
      const sid = String(data[i][9]);
      const x = entryLoadRow_(data[i], cfg);
      const status = entryStatus(x.read.submitted, x.built, x.fingerprint, entryText_(data[i][11]), x.read.anyInput, (counts[sid] || 0) > 0, checkCounts[sid] || 0);
      groups.getRange(i + 1, 5, 1, 3).setValues([[status, x.built.errors.concat(x.built.warnings).join(" ／ "), x.updated]]);
    } catch (e) {
      groups.getRange(i + 1, 5, 1, 2).setValues([["読めません", String(e.message || e)]]);
    }
  }
  ss.setActiveSheet(groups);
}

/** メニュー・ボタン：「1.公演かんたん入力」の【取り込み・要確認】の印（黄色とメモ）を消して確認済みにする */
function entryClearCheckMarks() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const draft = getDraftSheet(ss);
  if (!draft) { ui.alert("「" + SHEET_DRAFT + "」シートが見つかりません。"); return; }
  const lastRow = draft.getLastRow();
  const lastCol = draft.getLastColumn();
  if (lastRow < 3 || lastCol < 1) {
    ui.alert("確認済み", "「要確認」の印はありませんでした。", ui.ButtonSet.OK);
    return;
  }

  const height = lastRow - 2;
  const range = draft.getRange(3, 1, height, lastCol);
  const notes = (typeof range.getNotes === "function" && Array.isArray(range.getNotes()))
    ? range.getNotes()
    : Array.from({ length: height }, (_, ri) =>
        Array.from({ length: lastCol }, (_, ci) => draft.getRange(3 + ri, 1 + ci).getNote())
      );

  const targets = [];
  for (let ri = 0; ri < height; ri++) {
    for (let ci = 0; ci < lastCol; ci++) {
      if (String(notes[ri][ci] || "").indexOf(ENTRY_NOTE_MARK) === 0) {
        targets.push({ rowNo: 3 + ri, colNo: 1 + ci });
      }
    }
  }
  if (!targets.length) {
    ui.alert("確認済み", "「要確認」の印はありませんでした。", ui.ButtonSet.OK);
    return;
  }

  const ok = ui.alert(
    "「要確認」の印を消しますか？",
    "「" + SHEET_DRAFT + "」にある " + targets.length + " か所の要確認の印（濃い黄色とメモ）を消します。\n" +
      "※ セルの値そのものは今のまま残ります。\nよろしいですか？",
    ui.ButtonSet.YES_NO
  );
  if (ok !== ui.Button.YES) return;

  targets.forEach((t) => {
    draft.getRange(t.rowNo, t.colNo).setNote("").setBackground(null);
  });

  // 団体一覧の「状態」から要確認の表示を更新
  const groups = getGroupsSheet(ss);
  if (groups) {
    const gData = groups.getDataRange().getValues();
    const counts = entryDraftCounts_(ss);
    const checkCounts = entryDraftCheckCounts_(ss);
    for (let i = 1; i < gData.length; i++) {
      const sid = gData[i][9] ? String(gData[i][9]) : "";
      if (!sid) continue;
      const st = String(gData[i][4] || "");
      if (st.indexOf("取り込み済み") === 0 && (counts[sid] || 0) > 0) {
        const c = checkCounts[sid] || 0;
        const nextSt = c > 0 ? "取り込み済み（要確認 " + c + " か所）" : "取り込み済み";
        if (nextSt !== st) groups.getRange(i + 1, 5).setValue(nextSt);
      }
    }
  }

  ui.alert("印を消しました", targets.length + " か所の「要確認」の印を消しました。続けて【公演一覧へ反映＆Web公開】を押せます。", ui.ButtonSet.OK);
}

/** メニュー：提出済みの記入用シートを全部取り込む */
function entryImportAll() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const groups = getGroupsSheet(ss);
  if (!groups) { ui.alert("先にメニューの【出展団体の準備】を実行してください。"); return; }
  const cfg = entryReadConfig_(ss);
  const draft = entryEnsureDraftHeaders_(ss);
  const contacts = entrySheet_(ss, SHEET_CONTACTS, ENTRY_CONTACT_HEADERS, "#b91c1c");
  const log = entrySheet_(ss, SHEET_IMPORT_LOG, ENTRY_LOG_HEADERS, "#475569");

  const draftHeaders = draft.getRange(2, 1, 1, draft.getLastColumn()).getValues()[0].map((h) => String(h || "").trim());
  const colOf = (h) => draftHeaders.indexOf(h);
  const sourceCol = colOf(ENTRY_SOURCE_HEADER);
  const ourHeaders = entryDraftHeaders();
  const toSheetRow = (r) => {
    const out = new Array(draftHeaders.length).fill("");
    ourHeaders.forEach((h, k) => {
      // 先頭 19 列は位置で（見出しに例の文言が付いているため）、追加の列は見出しで探す
      const idx = k < 19 ? k : colOf(h);
      if (idx >= 0) out[idx] = r[k];
    });
    return out;
  };
  const fromSheetRow = (r) => ourHeaders.map((h, k) => (k < 19 ? r[k] : (colOf(h) >= 0 ? r[colOf(h)] : "")));

  // 取り込み控え（前回取り込んだ団体の値）。主催が直したセルを見分けるのに使う。隠しシート
  let baseSheet = ss.getSheetByName(SHEET_IMPORT_BASE);
  const expectedBaseHeader = ["_シートID"].concat(ourHeaders);
  if (!baseSheet) {
    baseSheet = ss.insertSheet(SHEET_IMPORT_BASE);
    baseSheet.getRange(1, 1, 1, expectedBaseHeader.length).setValues([expectedBaseHeader]);
    baseSheet.hideSheet();
  } else if (baseSheet.getLastColumn() > 0) {
    // 列が追加された旧版からの自動アップグレード（見出し名で並べ直す）
    const curBaseW = Math.max(baseSheet.getLastColumn(), 1);
    const curBaseH = baseSheet.getRange(1, 1, 1, curBaseW).getValues()[0].map((h) => String(h || "").trim());
    if (curBaseH.join("|") !== expectedBaseHeader.join("|")) {
      const bRowsN = baseSheet.getLastRow();
      const idxMap = ourHeaders.map((h) => curBaseH.indexOf(h));
      const oldRows = bRowsN >= 2 ? baseSheet.getRange(2, 1, bRowsN - 1, curBaseW).getValues() : [];
      if (baseSheet.getMaxColumns() < expectedBaseHeader.length) {
        baseSheet.insertColumnsAfter(baseSheet.getMaxColumns(), expectedBaseHeader.length - baseSheet.getMaxColumns());
      }
      baseSheet.getRange(1, 1, 1, expectedBaseHeader.length).setValues([expectedBaseHeader]);
      if (oldRows.length) {
        const migrated = oldRows.map((r) => [r[0]].concat(idxMap.map((idx) => (idx >= 0 ? r[idx] : ""))));
        baseSheet.getRange(2, 1, migrated.length, expectedBaseHeader.length).setNumberFormat("@").setValues(migrated);
      }
    }
  }
  const baseOf = (id) => {
    const n = baseSheet.getLastRow();
    if (n < 2) return [];
    return baseSheet.getRange(2, 1, n - 1, expectedBaseHeader.length).getValues()
      .filter((r) => entryText_(r[0]) === String(id)).map((r) => r.slice(1));
  };
  const saveBase = (id, rows, tz) => {
    const n = baseSheet.getLastRow();
    if (n >= 2) {
      const ids = baseSheet.getRange(2, 1, n - 1, 1).getValues();
      for (let r = ids.length - 1; r >= 0; r--) if (entryText_(ids[r][0]) === String(id)) baseSheet.deleteRow(2 + r);
    }
    if (!rows.length) return;
    // 文字のまま残す（"10:30" が時刻に化けないように）
    baseSheet.getRange(baseSheet.getLastRow() + 1, 1, rows.length, expectedBaseHeader.length)
      .setNumberFormat("@").setValues(rows.map((r) => [String(id)].concat(r.map((v) => entryNorm_(v, tz)))));
  };
  // 前の版で作った取り込み履歴にも「扱い」の見出しを足す
  log.getRange(1, 1, 1, ENTRY_LOG_HEADERS.length).setValues([ENTRY_LOG_HEADERS]);

  const data = groups.getDataRange().getValues();
  const now = new Date();
  const summary = { imported: 0, unchanged: 0, skipped: [], checks: 0 };
  for (let i = 1; i < data.length; i++) {
    const sheetId = entryText_(data[i][9]);
    if (!entryText_(data[i][0]) || !entryText_(data[i][2]) || !sheetId) continue;
    const name = entryText_(data[i][0]);
    let x;
    try { x = entryLoadRow_(data[i], cfg); } catch (e) { summary.skipped.push(name + "：読めません（" + (e.message || e) + "）"); continue; }
    if (!x.read.submitted) continue;
    if (x.built.errors.length) {
      groups.getRange(i + 1, 5, 1, 2).setValues([["提出済み（未記入あり・取り込めません）", x.built.errors.join(" ／ ")]]);
      summary.skipped.push(name + "：" + x.built.errors.join("、"));
      continue;
    }
    // 今「1.公演かんたん入力」にある、この記入用シートの行
    const lastRow = draft.getLastRow();
    const existing = lastRow > 2 ? draft.getRange(3, 1, lastRow - 2, draftHeaders.length).getValues() : [];
    const curIdx = [];
    existing.forEach((r, k) => { if (sourceCol >= 0 && entryText_(r[sourceCol]) === String(sheetId)) curIdx.push(k); });
    const curRows = curIdx.map((k) => fromSheetRow(existing[k]));
    const curDays = new Set(curRows.map((r) => entryText_(r[0])));
    // 中身が同じで、日程の行もそろっていれば何もしない（主催が行を消していたら入れ直す）
    if (x.fingerprint === entryText_(data[i][11]) && x.built.rows.every((r) => curDays.has(entryText_(r[0])))) { summary.unchanged++; continue; }

    const merged = entryMergeRows(baseOf(sheetId), curRows, x.built.rows);
    // 1) 今ある行をその場で直す（主催の並び順・数式の入った列は触らない。変わったセルだけ書く）
    merged.updates.forEach((u) => {
      const rowNo = 3 + curIdx[u.curIndex];
      u.changed.forEach((k) => {
        const col = k < 19 ? k : colOf(ourHeaders[k]);
        if (col < 0) return;
        const cell = draft.getRange(rowNo, col + 1).setValue(u.values[k]);
        const note = String(cell.getNote() || "");
        if (note.indexOf(ENTRY_NOTE_MARK) === 0 || note.indexOf(ENTRY_EDITED_MARK) === 0) cell.setNote("").setBackground(null);
      });
      // 主催が団体の値と一致させたセルは、残っていた要確認・修正済の印を自動で消す
      (u.matched || []).forEach((k) => {
        const col = k < 19 ? k : colOf(ourHeaders[k]);
        if (col < 0) return;
        const cell = draft.getRange(rowNo, col + 1);
        const note = String(cell.getNote() || "");
        if (note.indexOf(ENTRY_NOTE_MARK) === 0 || note.indexOf(ENTRY_EDITED_MARK) === 0) {
          cell.setNote("").setBackground(null);
        }
      });
      // 主催だけが修正したセル：薄い水色＋元の団体の値のメモで一目でわかるようにする
      (u.organizerEdited || []).forEach((oe) => {
        const col = oe.k < 19 ? oe.k : colOf(ourHeaders[oe.k]);
        if (col < 0) return;
        const cell = draft.getRange(rowNo, col + 1);
        const note = String(cell.getNote() || "");
        cell.setBackground("#dbeafe");
        if (!note || note.indexOf(ENTRY_NOTE_MARK) === 0 || note.indexOf(ENTRY_EDITED_MARK) === 0) {
          cell.setNote(ENTRY_EDITED_MARK + "\n団体の記入値：" + (oe.base || "（空欄）"));
        }
      });
      u.conflicts.forEach((cf) => {
        const col = cf.k < 19 ? cf.k : colOf(ourHeaders[cf.k]);
        if (col < 0) return;
        draft.getRange(rowNo, col + 1).setBackground("#fde68a").setNote(
          ENTRY_NOTE_MARK + "\n団体の新しい値：" + (cf.theirs || "（空欄）") + "\n主催が直した値を残しています。団体の値にするときは書き換えてください。");
      });
    });
    // 2) 団体がやめた日程の行を消す（下から）
    merged.deletes.map((ci) => 3 + curIdx[ci]).sort((a, b) => b - a).forEach((rowNo) => draft.deleteRow(rowNo));
    // 3) 増えた日程・消えていた行を足す
    if (merged.adds.length) {
      const newRows = merged.adds.map(toSheetRow);
      draft.getRange(draft.getLastRow() + 1, 1, newRows.length, draftHeaders.length).setValues(newRows);
    }
    saveBase(sheetId, x.built.rows, x.read.tz);

    const notes = x.built.notes.map((n) => ({ day: "", column: "（メモ）", before: "", after: n, kind: "" }));
    const logRows = merged.log.concat(notes).map((c) => [now, name, x.built.contact.title, c.day, c.column, c.before, c.after, c.kind]);
    if (logRows.length) log.getRange(log.getLastRow() + 1, 1, logRows.length, ENTRY_LOG_HEADERS.length).setValues(logRows);
    summary.checks += merged.checks;

    // 運営用連絡先（非公開）を更新
    const c = x.built.contact;
    const cData = contacts.getDataRange().getValues();
    const cIdx = cData.findIndex((r, k) => k > 0 && String(r[7]) === String(sheetId));
    const cRow = [c.group, c.title, c.name, c.email, c.tel, c.note, now, sheetId];
    if (cIdx > 0) contacts.getRange(cIdx + 1, 1, 1, cRow.length).setValues([cRow]);
    else contacts.appendRow(cRow);

    groups.getRange(i + 1, 5, 1, 4).setValues([["取り込み済み", x.built.warnings.join(" ／ "), x.updated, now]]);
    groups.getRange(i + 1, 12).setValue(x.fingerprint);
    summary.imported++;
  }

  // 要確認メモの残数に応じて「団体一覧」の状態を更新
  const checkCounts = entryDraftCheckCounts_(ss);
  const gAfter = groups.getDataRange().getValues();
  for (let i = 1; i < gAfter.length; i++) {
    const sid = gAfter[i][9] ? String(gAfter[i][9]) : "";
    if (!sid) continue;
    const st = String(gAfter[i][4] || "");
    if (st.indexOf("取り込み済み") === 0 && st.indexOf("消えています") === -1) {
      const c = checkCounts[sid] || 0;
      const nextSt = c > 0 ? "取り込み済み（要確認 " + c + " か所）" : "取り込み済み";
      if (nextSt !== st) groups.getRange(i + 1, 5).setValue(nextSt);
    }
  }

  ui.alert(
    "取り込み完了",
    "取り込み・更新：" + summary.imported + " 件　変更なし：" + summary.unchanged + " 件" +
      (summary.checks ? "\n\n⚠ 要確認：" + summary.checks + " か所。主催が直した値と団体の新しい値がぶつかった所などです。主催の値を残し、濃い黄色にしてメモを付けました。「" + SHEET_IMPORT_LOG + "」の「扱い」が「要確認」の行を見てください。" : "") +
      (summary.skipped.length ? "\n\n取り込めなかったもの：\n" + summary.skipped.join("\n") : "") +
      "\n\n取り込み先：\n" +
      "・公演の情報 →「" + SHEET_DRAFT + "」の一番下（日程ごとに 1 行。詳細列は右の＋で開けます）\n" +
      "・担当者の連絡先 →「" + SHEET_CONTACTS + "」（公開されません）\n" +
      "・前回から変わった所 →「" + SHEET_IMPORT_LOG + "」\n\n" +
      "まだタイムテーブルには出ていません。確認できたら【公演一覧へ反映＆Web公開】を押してください。",
    ui.ButtonSet.OK
  );
}
