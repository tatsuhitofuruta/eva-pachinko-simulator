# 機種×千円回転数別データ管理 設計書

作成日: 2026-06-10
更新日: 2026-08-06
ステータス: 実装済み

## 目的

累計収支・個人記録・セッション履歴（カレンダー/グラフ）を、現在は全条件合算で
1 つに記録している。これを「機種 × 千円回転数」の組み合わせ（以下スコープ）ごとに
分離し、回転率による期待値の違いを条件別に検証できるようにする。

## 確定済みの要件

| 論点 | 決定 |
|------|------|
| 「回転数」の意味 | 千円回転数（16〜20回転）。総回転数は分離しない |
| 表示方式 | 選択中の機種・回転数セレクトに全パネルが追従して切り替わる |
| 既存データ | v2 を読み込み、次回の保存成功時に v3 へ変換する |
| リセットボタンの単位 | 3 種すべて「現在スコープのみ」を対象にする |
| 実行中のセレクト | シミュレーション中は機種・回転数セレクトを disabled |

## データ構造

localStorage キーは単一キーに集約する。

```js
// localStorage キー: 'pachinko_data_v2'
{
  version: 3,
  scopes: {
    // スコープキー = `${machineKey}:${rotation1k}` 例 "eva15:18"
    "eva15:18": {
      // 短縮キーは保存時だけ使い、読み込み後は従来のオブジェクト契約に展開する。
      s: { sessions: 0, invest: 0, payout: 0 },
      h: [[invest, payout, profit, spins, expected, analyticalExpected, deviation]],
      r: { bestProfit: null, worstProfit: null, maxChain: null, maxPayout: null }
    }
  }
}
```

- スコープは初回書き込み時に遅延生成する（5機種×5回転数=25通りだが、遊んだ組み合わせのみ作られる）
- 仮想日付（2026-01-01 起点、1 稼働=1 日）は **スコープごとに独立して進む**。
  `day = scope.history.length + 1` で採番する
- 日付と day は履歴配列の添字から復元する。各スコープの 2026-01-01 起点の連番は維持する。
- v2 の疎な履歴と完全な履歴を読み込める。補正と v3 変換は読み込み時に書き戻さず、次回の明示的な保存成功時だけ行う。
- 読み込み済みデータはメモリキャッシュを使う。未対応版、破損データ、読み込みエラーは保存可能な空データとして扱わず、元の値を上書きしない。
- セッションは対象スコープを複製し、stats、history、ranking をまとめて `setItem` 1 回で保存する。失敗時は保存値とキャッシュを変更しない。

### 旧キーの扱い

起動時（DOMContentLoaded）に以下を `removeItem` して仕切り直す。

```
pachinko_cumulative_stats
pachinko_session_history
pachinko_ranking_stats
```

`migrateToVirtualDates()` は旧データ専用のため、関数本体と呼び出しを削除する。

## ストレージ層 API

既存の load/save 関数を以下の薄いラッパーに書き換える。

```js
const DATA_KEY = 'pachinko_data_v2';

function currentScopeKey() {
    return `${document.getElementById('machine').value}:${document.getElementById('rotation1k').value}`;
}

function loadAllData()        // 展開済み { version: 3, scopes: {} } をキャッシュして返す
function saveAllData(data)

function defaultScope()       // 上記構造の空スコープを返す
function loadScope(scopeKey = currentScopeKey())   // scopes[scopeKey] ?? defaultScope()
function saveScope(scopeKey, scope)                // scopes[scopeKey] に代入して saveAllData

// 表示用のラッパーはスコープ対応でキャッシュを読む
loadCumulativeStats(scopeKey)  → loadScope(scopeKey).stats
loadSessionHistory(scopeKey)   → loadScope(scopeKey).history
loadRankingStats(scopeKey)     → loadScope(scopeKey).ranking
```

表示系（`updateCumulativeDisplay` / `updateRankingDisplay` / `renderCalendar` /
収支グラフ描画 / `getUniqueDaysCount`）は load 系経由でデータを読んでいるため、
load 系がスコープ対応になれば引数なし呼び出しで「現在スコープ」に自動追従する。

## 書き込み側の変更

シミュレーション中にセレクトが変わっても書き込み先がブレないよう、
**開始時にスコープキーをスナップショット**して引数で引き回す。

- `startSimulation()` / `startAutoSimulation()` 冒頭で `const scopeKey = currentScopeKey()`
- `recordSessionOutcome(result, scopeKey)` — 統計、履歴、ランキングを 1 回の保存で更新
- 自動実行中は日別の結果・ログだけを更新し、累計・カレンダー・期待値偏差・ランキング・グラフの全件再計算は完了、停止、保存失敗時に 1 回だけ行う。
- 保存失敗時はその日を追加せずに自動実行を停止する。単日・自動実行とも finally で実行状態と操作ボタンを復旧する。

セレクト disabled 制御は実行状態の切り替え箇所（startBtn/autoBtn の is-stop 切替と
同じ場所）で `machine` / `rotation1k` の disabled を同期する。

## UI 変更

### スコープバッジ

「どの条件のデータを見ているか」を常時明示する。

- `SPECS` 各機種に `shortName` を追加: エヴァ15 / エヴァ17 / 牙狼XX / 牙狼12 / 東京喰種
- 累計収支パネルのヘッダーとカレンダーパネルのヘッダーに
  `<span class="scope-badge" id="...">エヴァ15 ⁄ 18回転</span>` を表示
- スタイルは Share Tech Mono の小さめバッジ（既存の `panel-title small` に準じる）

### スコープ切り替え

`onScopeChange()` を新設し、以下を順に実行:

1. スコープバッジ更新
2. `updateCumulativeDisplay()`
3. `updateRankingDisplay()`
4. `moveToLatestSession()` + `renderCalendar()`（そのスコープの最新月へ移動）
5. 収支グラフ再描画

`machine` の既存 change リスナー（テーマ切替）に追記し、`rotation1k` には
新規で change リスナーを付ける。

### リセット 3 種

すべて現在スコープのみを対象に変更し、confirm にスコープ名を含める。

| ボタン | 対象 | confirm 例 |
|--------|------|-----------|
| 累計収支リセット | scope.stats | 「エヴァ15 ⁄ 18回転 の累計収支をリセットしますか？」 |
| 個人記録リセット | scope.ranking | 同上（個人記録） |
| カレンダー全リセット | スコープ一式（stats+history+ranking） | 「エヴァ15 ⁄ 18回転 の全データをリセットしますか？」 |

## 受け入れ条件

1. eva15:18 で 1 日実行 → garo12:19 に切り替えると累計・記録・カレンダー・グラフが
   すべて空になり、eva15:18 に戻すと記録が再表示される
2. 同一機種でも回転数が違えばデータが分離される（eva15:18 と eva15:19 は別物）
3. リセット 3 種が現在スコープのみに効き、他スコープのデータは残る
4. シミュレーション実行中（1日実行・自動実行とも）は機種・回転数セレクトが
   disabled になり、終了で解除される
5. 実行完了時の書き込みが開始時点のスコープに入る
6. リロード後もスコープ別データが保持され、36,525 セッションの v3 保存値は 5 MiB 未満である
7. コンソールエラーなし。既存の演出・チャート描画が全機種で動作する

## 実装メモ

- index.html 単一ファイル構成。JS は `<script>` ブロック内（2000行台前後）
- 表示パネルの DOM 構造・クラス名は変更しない（NERVコンソールデザインを維持）
- カレンダーの `currentYear` / `currentMonth` グローバルは既存のまま流用可
- 保存形式は v3 の圧縮タプル、メモリ上では既存のオブジェクト形式を使う。
