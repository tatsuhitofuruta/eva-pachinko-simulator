# 期待値乖離ランキング 設計書

作成日: 2026-06-11
ステータス: 設計確定・実装待ち（Codex に引き継ぎ）
前提: docs/scoped-stats-design.md（スコープ別データ管理）実装済み、
docs/machines-2026-06-design.md（3機種追加）と同時または後に実装

## 目的

各セッション（1 稼働日）の実収支が、その条件（機種 × 千円回転数 × 総回転数）の
理論期待収支からどれだけ乖離したか（上振れ・下振れ）を記録・表示する。

## 期待値の定義と計算

### 方針

理論期待収支は **SPECS から解析的に導出**する（モンテカルロ定数の埋め込みは
行わない）。新機種を追加しても定数測定なしで自動追従させるため。

シミュレーターは等価 4 円（購入 250 玉/千円・換金 4 円/玉）なので、
期待収支は「玉の期待増減 × 4円」に一致する（千円単位購入の端数切り上げ、
totalSpins 到達時の打ち切り境界の影響は誤差として許容する）。

### 期待収支関数

```js
// 1セッションの理論期待収支（円）
function expectedProfitYen(machineKey, rotation1k, totalSpins)
```

構成要素（すべて実獲得ベース、SPECS の値をそのまま使う）:

1. **V = 1 初当りの期待トータル出玉（発）**
   - ST 型: ST中継続率 q = 1-(1-stHitProb)^stSpins、
     E[連チャン出玉] = q/(1-q) × E[電チュー1回の出玉]
     （電チュー振り分けに renzoku があれば
     E[renzoku分] = renzokuPayout × renzokuRate/(1-renzokuRate) を当該エントリに加算）
   - LT 型: q = stContinueRate、E[連チャン出玉] = q/(1-q) × E[電チュー] + 転落時 ltEndPayout
     （garo12 の ltChallengeRate / ltFirstPayout も既存ロジックどおり式に反映）
   - 時短引き戻しの再帰は 1 本の線形方程式で閉形式に解く:
     V = E_direct + P(時短経路) × q_jitan × V_rebound 形（機種により
     V_rebound が V 自身になる場合は V について解く）。
     q_jitan = 1-(1-(jitanHitProb ?? hitProb))^jitanSpins
   - 残保留（zanhoCount）・チャージ（chargeProb 系）も既存シミュレーション
     ロジックと同じ確率構造で式に含める
2. **消費側**: 通常時 1 回転あたり 250/rotation1k 発。
   時短滞在分は 250/jitanRotation1k 発に軽減されるため、
   期待時短回転数 E_jitan = 初当り回数 × P(時短経路) × (1-(1-p_j)^J)/p_j
   （打ち切り込み幾何分布の期待滞在数）で補正する
3. **期待収支** =
   4円 × ( N_normal × hitProb × V + N_normal × chargeProb × chargePayout
   − N_normal × 250/rotation1k − E_jitan_total × 250/jitanRotation1k )
   ここで N = totalSpins は通常+時短回転の合計（session.rotations と同義）、
   N_normal = N − E_jitan_total

導出の細部（確変中の回転を消費しない等）は **シミュレーション実装の挙動を正**
として合わせること。受け入れ条件のモンテカルロ照合がその検証になる。

### 乖離

```
deviation = session.profit − expectedProfitYen(機種, 回転数, 総回転数)
```

機種・回転数・総回転数はすべて **セッション開始時のスナップショット**を使う。

## データスキーマ変更（pachinko_data_v2）

### history エントリに追加

```js
{ date, day, invest, payout, profit,
  spins: 2000,        // 開始時の totalSpins 設定
  expected: -12340,   // 理論期待収支（円・丸め）
  deviation: 45120 }  // profit - expected
```

旧エントリ（フィールド欠損）はランキング集計から除外する（undefined ガード）。

### ranking に追加

```js
{ bestProfit, worstProfit, maxChain, maxPayout,
  bestUpswing: null,      // deviation の最大（プラス乖離）
  worstDownswing: null }  // deviation の最小（マイナス乖離）
```

更新条件: bestUpswing は deviation > 0 かつ既存値超え、
worstDownswing は deviation < 0 かつ既存値割れ（既存 best/worst と同パターン）。

## UI

### 1. 個人記録パネル（ranking-grid）に 2 項目追加

既存 4 項目（最高収支・最低収支・最大連チャン・一撃最高出玉）に続けて:

- 「最大上振れ」 id=rankBestUpswing 値は `+xx,xxx円` 形式、cum-plus 色
- 「最大下振れ」 id=rankWorstDownswing 値は `-xx,xxx円` 形式、cum-minus 色

grid は 2 列のまま 3 行（計 6 セル）になる。未記録時は `---`。

### 2. 乖離ランキングパネル（TOP5 リスト）

カレンダーパネル内・収支グラフの下に `<details>` で追加（デフォルト閉）。
デスクトップの 100vh グリッドを溢れさせないための措置。

```html
<details class="deviation-panel" id="deviationPanel">
    <summary>
        <span class="panel-title">乖離ランキング<small>DEVIATION</small></span>
        <span class="deviation-expected" id="deviationExpected">期待値/日: ---</span>
    </summary>
    <div class="deviation-grid">
        <div>上振れ TOP5（日付 + 乖離額）</div>
        <div>下振れ WORST5（日付 + 乖離額）</div>
    </div>
</details>
```

- データソースは現在スコープの history（deviation 持ちエントリのみ）を
  ソートして描画。ranking への TOP5 永続化はしない
- summary 右側に現在スコープの理論期待収支
  `expectedProfitYen(現在機種, 現在回転数, 現在totalSpins設定)` を
  `期待値/日: -12,345円` 形式で常時表示し、スコープ・総回転数変更で更新
- リスト行は `01/03  +45,120円` 形式（Share Tech Mono、上振れ=success色、
  下振れ=danger色）。5 件未満なら埋まっている分だけ表示、0 件は `NO DATA`
- スタイルは既存 NERV テーマに合わせる（線・配色は CSS 変数を使用。
  summary は calendar-summary と同トーン、開閉マーカーは ▸/▾ 程度の簡素なもの）

### 3. スコープ切り替え・セッション確定時の再描画

`onScopeChange()` と セッション確定処理（addSessionResult 後）に
乖離パネル・個人記録 2 項目の更新を追加する。

## 受け入れ条件

1. **期待値関数の妥当性（モンテカルロ照合）**: 各機種 × rate=18 で
   自動実行 90 日 ×3 回（speed 10）の平均収支が、`expectedProfitYen` の
   理論値に対して概ね ±5%（理論値の絶対値が小さい機種は ±1,500円/日）に
   収まること。全 8 機種で確認する
2. 1 日実行ごとに history へ spins/expected/deviation が記録される
3. 個人記録に最大上振れ・最大下振れが表示・更新され、リセットで消える
4. 乖離パネルに上振れ TOP5・下振れ WORST5 が現在スコープのデータで表示され、
   スコープ切り替えに追従する
5. 期待値/日 表示が機種・回転数・総回転数の変更に追従する
6. デスクトップ（1440×900）で details 閉時のレイアウトが従来どおり溢れない
7. 旧スキーマの history エントリ（deviation なし）が混在してもエラーにならない
8. コンソールエラーなし

## エンジニアリング評価

perfectly-engineered 狙い: 期待値は解析関数 1 つで全機種に自動追従し、
ランキング永続化は最大値 2 つのみ（TOP5 は history から都度導出）。
モンテカルロ定数テーブル（over: 機種×rate×spins の3次元管理が必要）や
グラフ化・標準偏差バンド表示（YAGNI）は採用しない。
