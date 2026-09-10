/**
 * ==========================================================================
 * 謎解きフェス・イベント特化型 ハシゴタイムテーブル
 * スプレッドシート自動化スクリプト (Universal Timetable Core v2.0)
 * ==========================================================================
 * 
 * 主な機能:
 * 1. 1公演1行の「入力補助シート」から、本番「公演一覧」シートへ全自動展開
 * 2. 開始時間の複数入力（カンマ・改行・スペース区切り）の自動解析
 * 3. Web API (doGet) によるJSON配信
 */

// シート名の定義
const SHEET_CONFIG = "設定";
const SHEET_MAIN = "公演一覧";
const SHEET_DRAFT = "📝入力補助シート";

/**
 * スプレッドシートを開いたときにメニューを追加
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("🚀 タイムテーブル便利機能")
    .addItem("✨ 【初回】入力補助シートを自動作成する", "setupDraftSheet")
    .addSeparator()
    .addItem("⚡ 入力補助シートから【公演一覧】へ自動展開する", "expandDraftToTimetable")
    .addToUi();
}

/**
 * 入力補助シートを初期セットアップ（ヘッダー・色分け・入力例の自動作成）
 */
function setupDraftSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let draftSheet = ss.getSheetByName(SHEET_DRAFT);
  
  if (!draftSheet) {
    draftSheet = ss.insertSheet(SHEET_DRAFT, 0);
  }

  // ヘッダー定義
  const headers = [
    "日程", "団体名", "公演名", "会場(部屋)", "開始時間リスト (カンマや改行で複数記入)",
    "所要時間(分)", "参加料金", "定員", "予約形式", "難易度",
    "内容目安 (・で区切るとタグ)", "予約URL", "公演ビジュアルURL",
    "所要時間優先テキスト", "受付終了時間", "完全終了時間", "最終フェーズ表示名", "ノイズ演出", "南京錠パスワード"
  ];

  draftSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  
  // スタイル設定
  draftSheet.getRange("A1:E1").setBackground("#dbeafe").setFontColor("#1e3a8a").setFontWeight("bold"); // 必須(青)
  draftSheet.getRange("F1:H1").setBackground("#dcfce7").setFontColor("#14532d").setFontWeight("bold"); // 基本(緑)
  draftSheet.getRange("I1:M1").setBackground("#fef9c3").setFontColor("#713f12").setFontWeight("bold"); // 詳細(黄)
  draftSheet.getRange("N1:S1").setBackground("#f3e8ff").setFontColor("#581c87").setFontWeight("bold"); // 演出(紫)
  draftSheet.setFrozenRows(1);

  // 見本サンプルデータ（未入力の場合のみ挿入）
  if (draftSheet.getLastRow() <= 1) {
    const sampleRows = [
      [
        "1日目", "ShareKOBE", "タンクトップバトラー！袖無", "第1会議室(1F)",
        "10:30, 12:00, 13:20, 14:40, 16:00, 17:20",
        60, 2500, "4名×1チーム", "事前予約", 3,
        "・ワチャワチャ系", "https://tiget.net/events/sample1", "", "", "", "", "", "", ""
      ],
      [
        "1日目", "NAZONE", "ギリギリダンシャリ", "第3会議室(1F)",
        "10:30, 11:10, 11:50, 12:30, 13:10, 13:50, 15:00, 15:40, 16:20, 17:00, 17:40",
        30, 2000, "2名", "事前予約", "-",
        "・ワチャワチャ系・スコアアタック", "https://tiget.net/events/sample2", "", "", "", "", "", "", ""
      ],
      [
        "2日目", "ナゾトキズナ", "ひゃくにんと ともだちになろう", "第1会議室(1F)",
        "11:30, 13:30, 15:30, 17:30, 19:30",
        90, 2500, "4人", "事前予約", 9,
        "初心者歓迎", "https://tiget.net/events/sample3", "", "", "", "", "", "", ""
      ],
      [
        "1日目", "謎カフェ", "迷宮カフェラテと角砂糖", "ロビー(1F)",
        "随時",
        30, 1000, "1〜2名", "当日受付(ファミレス式)", 2,
        "・初心者歓迎・カフェ謎", "", "", "", "", "", "", "", ""
      ]
    ];
    draftSheet.getRange(2, 1, sampleRows.length, sampleRows[0].length).setValues(sampleRows);
  }

  // 予約形式のプルダウン設定
  const ruleType = SpreadsheetApp.newDataValidation()
    .requireValueInList(["事前予約", "当日受付(ファミレス式)", "事前予約(時間自由)"], true)
    .setAllowInvalid(true) // 自由記述も拒否せず警告のみ
    .build();
  draftSheet.getRange("I2:I100").setDataValidation(ruleType);

  // 列幅の自動調整
  draftSheet.autoResizeColumns(1, headers.length);
  draftSheet.setColumnWidth(5, 260); // 時間リストは見やすく広めに

  SpreadsheetApp.getUi().alert("✨ 【入力補助シート】をセットアップしました！\nサンプルデータが入っていますので、自由に書き換えて使ってください。");
}

/**
 * 入力補助シートのデータを本番「公演一覧」シートへ展開
 */
function expandDraftToTimetable() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const draftSheet = ss.getSheetByName(SHEET_DRAFT);
  if (!draftSheet) {
    ui.alert("⚠️ 「" + SHEET_DRAFT + "」シートが見つかりません。先に【初回セットアップ】を実行してください。");
    return;
  }

  // 本番シートの取得（なければ作成）
  let mainSheet = ss.getSheetByName(SHEET_MAIN);
  if (!mainSheet) {
    mainSheet = ss.insertSheet(SHEET_MAIN);
  }

  const lastRow = draftSheet.getLastRow();
  if (lastRow <= 1) {
    ui.alert("⚠️ 入力補助シートにデータがありません。");
    return;
  }

  // 上書き確認
  const res = ui.alert(
    "展開の確認",
    "入力補助シートのデータを「" + SHEET_MAIN + "」シートへ展開します。\n（既存の「" + SHEET_MAIN + "」の内容は上書き更新されます。よろしいですか？）",
    ui.ButtonSet.YES_NO
  );
  if (res !== ui.Button.YES) return;

  const draftData = draftSheet.getRange(2, 1, lastRow - 1, 19).getValues();

  // 本番シート用のヘッダー定義
  const mainHeaders = [
    "日程", "団体名", "公演名", "会場(部屋)", "開始時間(hh:mm)",
    "所要時間(分)", "定員", "予約URL", "公演ビジュアルURL", "完売設定",
    "参加料金", "予約形式", "難易度", "内容目安", "所要時間:優先表示テキスト",
    "受付終了時間", "完全終了時間", "最終フェーズ表示名", "ノイズ演出", "南京錠パスワード"
  ];

  const expandedRows = [];

  draftData.forEach(row => {
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

    // 開始時間リストのパース (カンマ, 読点, 改行, 空白区切り)
    let times = [];
    if (reserveType === "当日受付(ファミレス式)" || timeListStr === "随時" || timeListStr === "") {
      times = ["随時"];
    } else {
      // 時刻っぽい文字列 (例: 10:30, 9:00 など) を抽出
      const rawTokens = timeListStr.split(/[\r\n,、\s]+/);
      rawTokens.forEach(t => {
        const trimmed = t.trim();
        if (trimmed) times.push(trimmed);
      });
      if (times.length === 0) times = ["10:00"];
    }

    // 各開始時間ごとに1行展開
    times.forEach(t => {
      expandedRows.push([
        day,                    // 日程
        groupName,              // 団体名
        title,                  // 公演名
        room,                   // 会場(部屋)
        t,                      // 開始時間(hh:mm)
        duration,               // 所要時間(分)
        capacity,               // 定員
        reserveUrl,             // 予約URL
        visualUrl,              // 公演ビジュアルURL
        "",                     // 完売設定 (初期値は空)
        fee,                    // 参加料金
        reserveType,            // 予約形式
        difficulty,             // 難易度
        tags,                   // 内容目安
        overrideDurationText,   // 所要時間:優先表示テキスト
        acceptEnd,              // 受付終了時間
        totalEnd,               // 完全終了時間
        phaseTitle,             // 最終フェーズ表示名
        noise,                  // ノイズ演出
        password                // 南京錠パスワード
      ]);
    });
  });

  // 本番シートへ一括書き込み
  mainSheet.clearContents();
  mainSheet.getRange(1, 1, 1, mainHeaders.length).setValues([mainHeaders]);
  mainSheet.getRange(1, 1, 1, mainHeaders.length).setBackground("#1f2937").setFontColor("#ffffff").setFontWeight("bold");
  mainSheet.setFrozenRows(1);

  if (expandedRows.length > 0) {
    mainSheet.getRange(2, 1, expandedRows.length, mainHeaders.length).setValues(expandedRows);
    
    // 完売設定のプルダウン（警告のみ）
    const ruleSoldOut = SpreadsheetApp.newDataValidation()
      .requireValueInList(["完売", "SOLD OUT", "空席あり"], true)
      .setAllowInvalid(true)
      .build();
    mainSheet.getRange(2, 10, expandedRows.length, 1).setDataValidation(ruleSoldOut);
  }

  mainSheet.autoResizeColumns(1, mainHeaders.length);

  ui.alert(
    "🎉 展開完了！",
    draftData.filter(r => r[2]).length + " 件の公演情報から、計 " + expandedRows.length + " 行のタイムテーブルデータを生成しました！\n\n「" + SHEET_MAIN + "」シートを確認してください。",
    ui.ButtonSet.OK
  );
}