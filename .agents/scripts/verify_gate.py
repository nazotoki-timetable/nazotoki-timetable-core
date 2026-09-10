#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verify_gate.py  --  Antigravity Stop hook

目的:
    エージェントが「検証なしで完了した」ことにして停止するのを、
    プロンプトではなく制御フローで阻止する。

契約 (Antigravity hooks.json):
    stdin  : JSON (camelCase)。executionNum / terminationReason /
             transcriptPath / workspacePaths などが入る。
    stdout : JSON。{"decision": "continue", "reason": "..."} を返すと
             停止をブロックしてループへ再突入する。
             それ以外の値なら停止を許可する。

安全策:
    - MAX_RETRIES を超えたら必ず停止を許可する（無限ループ防止）。
    - terminationReason が model_stop 以外（error / max_steps_exceeded 等）
      のときは介入しない。
    - 例外が出たら必ず停止を許可する（フェイルオープン）。
      フェイルクローズにするとエディタが操作不能になるため。
"""

import json
import os
import sys

# 何回まで「まだ止まるな」と差し戻すか。2 以上にすると体感が重くなる。
MAX_RETRIES = 1

# 「編集した」と判定する手がかり（transcript 内の文字列）
EDIT_MARKERS = [
    "edit_file",
    "write_to_file",
    "replace_file_content",
    "create_file",
]

# 「検証した」と判定する手がかり（transcript 内の文字列）
VERIFY_MARKERS = [
    "browser_",
    "screenshot",
    "run_command",
    "capture",
]

REASON = (
    "停止をブロックしました。以下の検証がまだ提示されていません。\n"
    "1. 変更後のビルド／実行コマンドの実際の出力\n"
    "2. UI変更を含む場合は、ブラウザで対象画面を開いたスクリーンショット\n"
    "3. スクリーンショットに対する自己レビュー"
    "（レイアウト崩れ・要素の重なり・はみ出し・余白の整合性）\n"
    "\n"
    "いま実行して結果を提示してください。"
    "どうしても実行できない場合のみ、その理由を述べたうえで"
    "『未検証』と明記して停止してください。"
)


def allow():
    """停止を許可して終了する。"""
    print(json.dumps({"decision": "stop"}, ensure_ascii=False))
    sys.exit(0)


def block():
    """停止をブロックしてループを継続させる。"""
    print(json.dumps({"decision": "continue", "reason": REASON},
                     ensure_ascii=False))
    sys.exit(0)


def main():
    raw = sys.stdin.read()
    if not raw.strip():
        allow()

    payload = json.loads(raw)

    # --- 安全策 1: モデルの自発停止以外には介入しない ---
    if payload.get("terminationReason") != "model_stop":
        allow()

    # --- 安全策 2: 差し戻し回数の上限 ---
    if int(payload.get("executionNum", 1)) > MAX_RETRIES:
        allow()

    # --- 安全策 3: バックグラウンドタスク実行中なら触らない ---
    if payload.get("fullyIdle") is False:
        allow()

    transcript_path = payload.get("transcriptPath") or ""
    if not transcript_path or not os.path.exists(transcript_path):
        # 判定材料がないので介入しない
        allow()

    with open(transcript_path, "r", encoding="utf-8", errors="ignore") as f:
        text = f.read()

    edited = any(m in text for m in EDIT_MARKERS)
    verified = any(m in text for m in VERIFY_MARKERS)

    # 何も編集していないなら、ただの質問応答。介入しない。
    if not edited:
        allow()

    if verified:
        allow()

    block()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # フェイルオープン。フックの不具合でエージェントを止めない。
        try:
            print(json.dumps({"decision": "stop"}, ensure_ascii=False))
        except Exception:
            pass
        sys.exit(0)
