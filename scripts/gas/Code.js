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

// シート名の定義
const SHEET_DRAFT = "1.公演かんたん入力";
const SHEET_MAIN = "2.公演一覧";
const SHEET_CONFIG = "設定";

/**
 * スプレッドシートを開いたときにメニューを追加
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("タイムテーブル連携")
    .addItem("【初回】入力シートをセットアップする", "setupDraftSheet")
    .addSeparator()
    .addItem("公演一覧へ反映する（ボタン割り当て用）", "expandDraftToTimetable")
    .addToUi();
}

/**
 * 入力シートを初期セットアップ（ヘッダー・ボタン配置エリア・色分け・入力例の自動作成）
 */
function setupDraftSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 旧シート名があればリネーム、無ければ新規作成
  let draftSheet = ss.getSheetByName(SHEET_DRAFT) || 
                   ss.getSheetByName("① 公演かんたん入力") || 
                   ss.getSheetByName("入力補助シート") ||
                   ss.getSheetByName("\uD83D\uDCDD入力補助シート");
  if (!draftSheet) {
    draftSheet = ss.insertSheet(SHEET_DRAFT, 0);
  } else {
    draftSheet.setName(SHEET_DRAFT);
  }

  // 1行目: 操作コントロール・ボタン配置用バナー
  draftSheet.getRange("A1:C1").merge()
    .setValue("公演かんたん入力")
    .setBackground("#1e3a8a")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  draftSheet.getRange("D1:F1").merge()
    .setValue("【ボタン配置エリア】")
    .setBackground("#dbeafe")
    .setFontColor("#1e40af")
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  draftSheet.getRange("G1:S1").merge()
    .setValue("入力完了後、左のボタンを押すと「2.公演一覧」へ一括反映されます（スクロール時も常時固定表示）")
    .setBackground("#f8fafc")
    .setFontColor("#64748b")
    .setFontSize(9)
    .setVerticalAlignment("middle");

  draftSheet.setRowHeight(1, 45);

  // 2行目: ヘッダー定義
  const headers = [
    "日程", "団体名", "公演名", "会場(部屋)", "開始時間リスト (カンマや改行で複数記入)",
    "所要時間(分)", "参加料金", "定員", "予約形式", "難易度",
    "内容目安 (・区切りでタグ)", "予約URL", "公演ビジュアルURL",
    "所要時間優先テキスト", "受付終了時間", "完全終了時間", "最終フェーズ表示名", "ノイズ演出", "南京錠パスワード"
  ];

  draftSheet.getRange(2, 1, 1, headers.length).setValues([headers]);
  draftSheet.setRowHeight(2, 32);
  
  // スタイル設定（色分け）
  draftSheet.getRange("A2:E2").setBackground("#2563eb").setFontColor("#ffffff").setFontWeight("bold"); // 必須(青)
  draftSheet.getRange("F2:H2").setBackground("#16a34a").setFontColor("#ffffff").setFontWeight("bold"); // 基本(緑)
  draftSheet.getRange("I2:M2").setBackground("#d97706").setFontColor("#ffffff").setFontWeight("bold"); // 詳細(橙)
  draftSheet.getRange("N2:S2").setBackground("#7c3aed").setFontColor("#ffffff").setFontWeight("bold"); // 演出(紫)
  
  // 1〜2行目を固定（スクロールしてもボタンと列名が常に常駐）
  draftSheet.setFrozenRows(2);

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
        "随時",
        30, 1000, "1〜2名", "当日受付(ファミレス式)", 2,
        "・初心者歓迎・カフェ謎", "", "", "", "", "", "", "", ""
      ]
    ];
    draftSheet.getRange(3, 1, sampleRows.length, sampleRows[0].length).setValues(sampleRows);
  }

  // 予約形式のプルダウン設定
  const ruleType = SpreadsheetApp.newDataValidation()
    .requireValueInList(["事前予約", "当日受付(ファミレス式)", "事前予約(時間自由)"], true)
    .setAllowInvalid(true)
    .build();
  draftSheet.getRange("I3:I100").setDataValidation(ruleType);

  // 列幅の自動調整
  draftSheet.autoResizeColumns(1, headers.length);
  draftSheet.setColumnWidth(5, 260);

  // 「2.公演一覧」シートも存在確認またはリネーム
  let mainSheet = ss.getSheetByName(SHEET_MAIN) || 
                  ss.getSheetByName("② 公演一覧") || 
                  ss.getSheetByName("公演一覧");
  if (!mainSheet) {
    mainSheet = ss.insertSheet(SHEET_MAIN, 1);
  } else {
    mainSheet.setName(SHEET_MAIN);
  }

  SpreadsheetApp.getUi().alert(
    "セットアップ完了",
    "「" + SHEET_DRAFT + "」シートをセットアップしました。\n\n" +
    "【ボタンの設置手順】\n" +
    "1. メニューの「挿入」>「描画」をクリック\n" +
    "2. 四角形を描き、「公演一覧に反映する」と入力して「保存して閉じる」\n" +
    "3. ボタンをD1セルの位置に配置し、右上のメニューから「スクリプトを割り当て」を選択\n" +
    "4. 「expandDraftToTimetable」と入力して確定してください。",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * 入力シートのデータを「2.公演一覧」シートへ展開
 * （図形描画ボタンまたはメニューから呼び出されます）
 */
function expandDraftToTimetable() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const draftSheet = ss.getSheetByName(SHEET_DRAFT) || 
                     ss.getSheetByName("① 公演かんたん入力") || 
                     ss.getSheetByName("入力補助シート") ||
                     ss.getSheetByName("\uD83D\uDCDD入力補助シート");
  if (!draftSheet) {
    ui.alert("「" + SHEET_DRAFT + "」シートが見つかりません。先に初期セットアップを実行してください。");
    return;
  }

  // 本番シートの取得（なければ作成）
  let mainSheet = ss.getSheetByName(SHEET_MAIN) || 
                  ss.getSheetByName("② 公演一覧") || 
                  ss.getSheetByName("公演一覧");
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

  // 3行目以降のデータを取得
  const draftData = draftSheet.getRange(3, 1, lastRow - 2, 19).getValues();

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
  mainSheet.setRowHeight(1, 35);
  mainSheet.setFrozenRows(1);

  if (expandedRows.length > 0) {
    mainSheet.getRange(2, 1, expandedRows.length, mainHeaders.length).setValues(expandedRows);
    
    // 完売設定のプルダウン（警告のみ・編集可能）
    const ruleSoldOut = SpreadsheetApp.newDataValidation()
      .requireValueInList(["完売", "SOLD OUT", "空席あり"], true)
      .setAllowInvalid(true)
      .build();
    mainSheet.getRange(2, 10, expandedRows.length, 1).setDataValidation(ruleSoldOut);
  }

  mainSheet.autoResizeColumns(1, mainHeaders.length);

  // 展開後、「2.公演一覧」シートを前面に表示
  ss.setActiveSheet(mainSheet);

  ui.alert(
    "反映完了",
    draftData.filter(r => r[2]).length + " 件の公演情報から、計 " + expandedRows.length + " 行のタイムテーブルデータを「" + SHEET_MAIN + "」へ展開しました。\n\n" +
    "必要に応じて、この「" + SHEET_MAIN + "」シートで公演回ごとの完売設定や微調整を行ってください。",
    ui.ButtonSet.OK
  );
}

/**
 * Web API (doGet) - WebサイトへのJSONデータ配信
 */
function doGet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. 設定シートの読み込み
  const configSheet = ss.getSheetByName(SHEET_CONFIG);
  const config = {};
  if (configSheet) {
    const configData = configSheet.getDataRange().getValues();
    configData.forEach(row => {
      const key = String(row[0] || "").trim();
      if (key) {
        config[key] = row[1] !== undefined ? String(row[1]) : "";
      }
    });
  }

  // 2. 公演一覧シートの読み込み
  const mainSheet = ss.getSheetByName(SHEET_MAIN) || 
                    ss.getSheetByName("② 公演一覧") || 
                    ss.getSheetByName("公演一覧");
  const shows = [];
  
  if (mainSheet && mainSheet.getLastRow() > 1) {
    const data = mainSheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).trim());
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const showObj = {};
      let hasData = false;
      
      headers.forEach((h, colIdx) => {
        if (h) {
          let val = row[colIdx];
          if (val instanceof Date) {
            const hours = String(val.getHours()).padStart(2, '0');
            const minutes = String(val.getMinutes()).padStart(2, '0');
            val = hours + ":" + minutes;
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

  const result = {
    config: config,
    shows: shows
  };

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}