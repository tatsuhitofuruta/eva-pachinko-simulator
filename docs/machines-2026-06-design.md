# 新機種追加設計書（2026-06: 大海5・北斗無双4・リゼロ2）

作成日: 2026-06-11
ステータス: 設計確定・実装待ち（Codex に引き継ぎ）

## 参照元

- [一撃 - リゼロ2](https://1geki.jp/pachinko/e_re0season2/)
- [p-town - リゼロ2](https://p-town.dmm.com/machines/4457)
- [一撃 - 北斗無双4](https://1geki.jp/pachinko/p_sinhmusou4/1/)
- [一撃 - 大海物語5](https://1geki.jp/pachinko/p_oumi5/)
- [p-town - 大海物語5](https://p-town.dmm.com/machines/4293)

## 共通方針

- 出玉はすべて **実獲得値**（払い出し × 14/15、`netPayout()` でラップ）
- `<select id="machine">` に 3 option を追加し、`SPECS` / `getRushName` に定義を追加
- 公称値との整合は各節の「検算」を参照。シミュレーター内の自己整合性を優先する

## エンジン拡張（3 点）

既存エンジンに以下の汎用フィールドを追加する。未定義の機種では従来挙動。

1. **`jitanHitProb`**: 時短中の当選確率の上書き（未定義なら `hitProb`）。
   北斗無双4 の幻闘RUSH（時短100回）は 1/288.7 で回るため必要。
2. **LT転落後の時短遷移**: LT 機種（`isLT: true`）で継続判定に失敗したとき、
   `jitanSpins > 0` なら時短へ遷移する（大海物語5 の通常大当り後時短100回）。
   既存 LT 機種（garo/garo12）は `jitanSpins: 0` のため挙動不変。
3. **連撃ループ（北斗の無双連撃チャレンジ）**: 振り分けエントリに `renzoku: true`
   が付いた大当りを引いたら、`renzokuRate` の確率で `renzokuPayout` を上乗せし
   続けるループに入る。ループ終了後は通常どおり RUSH（ST）へ。
   連チャン数カウントには上乗せ 1 回を 1 連として加算する。

---

## oumi5（P大海物語5）

### 公式スペック

| 項目 | 値 |
|------|-----|
| 大当たり確率 | 1/319.6（確変中 1/31.9） |
| 確変突入率 | 60%（ヘソ・電チュー共通） |
| 確変継続 | 次回大当りまで電サポ（ループ型） |
| 大当たり出玉 | 全て 10R 1,500個 |
| 時短 | 通常大当り後 100回 |
| 遊タイム | なし |

### 出玉振り分け

ヘソ・電チュー共通: 100% が 1,500個（実獲得 1,400発）。確変 60% ⁄ 通常 40%。

### システムマッピング

確変ループ型。**LT 型の枠組み**（継続率判定）で表現する。

- 確変中は次の大当りが確定（1/31.9 + 無限電サポ）なので、1 判定 = 1 大当り。
  確変中の回転消費は電サポ・持ち玉のため収支に影響せず、モデル上省略する
- 継続判定 60% → 継続時 1,400 発獲得して再判定、転落時も 1,400 発獲得
  （転落 = その大当りが通常だった）して **時短 100 回**へ（エンジン拡張 2）
- 時短中は `hitProb`（1/319.6）のまま。引き戻し率 1-(1-1/319.6)^100 ≈ 26.9%。
  引き戻した大当りも同じ 60/40 振り分け

### SPECS 実装

```js
oumi5: {
    name: "P大海物語5",
    shortName: "大海5",
    hitProb: 1 / 319.6,
    stHitProb: 1.0,                 // 確変中は次回当選確定
    hesoPayouts: [
        { prob: 0.60, payout: netPayout(1500), st: true },
        { prob: 0.40, payout: netPayout(1500), st: false }   // 通常 → 時短100へ
    ],
    denchuPayouts: [
        { prob: 1.0, payout: netPayout(1500) }
    ],
    stSpins: 1,
    jitanSpins: 100,                // 通常大当り後・LT転落後の時短
    jitanRotation1k: 30,
    zanhoCount: 0,
    chargeProb: 0, chargePayout: 0, chargeStRate: 0,
    isLT: true,                     // 継続率判定型
    ltChallengeRate: 0,             // 突入60%はヘソ振り分けで表現済み
    ltFirstPayout: 0,
    ltEndPayout: netPayout(1500),   // 転落時（通常当り）も1500個
    stContinueRate: 0.60            // 確変継続率
}
```

注意: ヘソ通常 40% とLT転落の両方が出玉 1,400 発 + 時短100 になるよう実装する
（ヘソ通常時は payout を二重計上しないこと。`st: false` 側の payout と
`ltEndPayout` は別経路で、1 回の大当りに対しどちらか一方のみ支払われる）。

### 検算

- トータル継続率（時短込み）: 0.60 + 0.40 × 0.269 × … → 約 70.8%（公称と一致）
- BIG3000BONUS は内部的な保留連の演出表現のため、個別実装は不要
  （ループ連チャンとして自然に再現される）

---

## hokuto4（P真・北斗無双 第4章）

### 公式スペック

| 項目 | 値 |
|------|-----|
| 大当たり確率 | 1/319.7 |
| 真・幻闘RUSH中確率 | 1/70.7（時短100回ベースのST相当） |
| 幻闘RUSH（時短100）中確率 | 1/288.7 |
| RUSH突入率 | 約65.4%（時短引き戻し含む） |
| RUSH継続率 | 約75.9% |
| 遊タイム | なし |

### 出玉振り分け

ヘソ（特図1）:

| 振り分け | 出玉（実獲得） | 行き先 |
|----------|------|--------|
| 5% | 3,000個（2,800発） | 無双連撃チャレンジ（33%ループ）→ 真・幻闘RUSH |
| 46% | 900個（840発） | 真・幻闘RUSH |
| 49% | 900個（840発） | 幻闘RUSH（時短100回） |

電チュー（真・幻闘RUSH中）:

| 振り分け | 出玉（実獲得） | 行き先 |
|----------|------|--------|
| 26% | 3,000個（2,800発） | 無双連撃チャレンジ（33%ループ）→ 真・幻闘RUSH |
| 54% | 1,500個（1,400発） | 真・幻闘RUSH |
| 20% | 出玉なし | ST回復（真・幻闘RUSH継続） |

無双連撃チャレンジ: 突入時 3,000 個（1,500×2）確定。以降 33% で 1,500 個
（実獲得 1,400 発）を上乗せループ。

### システムマッピング

ST 型 + 時短引き戻し + 連撃ループ。

- 真・幻闘RUSH = `stSpins: 100`, `stHitProb: 1/70.7`。
  検算: 1-(1-1/70.7)^100 = 76.0% ≒ 公称 75.9% ✓
- 幻闘RUSH = 時短100回を `jitanHitProb: 1/288.7` で消化（エンジン拡張 1）。
  検算: 引き戻し率 1-(1-1/288.7)^100 = 29.3% ✓（公称突入率 65.4% ≒ 51% + 49%×29.3% ✓）
- 時短中の当りは 100% RUSH 突入（既存の時短引き戻し実装と同様）。
  出玉は st:true 振り分けの正規化（5/51 → 2,800発+連撃、46/51 → 840発）を使用
- 無双連撃チャレンジ = エンジン拡張 3（`renzoku: true` + ループ）
- 簡略化して無視するもの: 時短状態でのヘソ当り時の時短400回付与

### SPECS 実装

```js
hokuto4: {
    name: "P真・北斗無双 第4章",
    shortName: "北斗無双4",
    hitProb: 1 / 319.7,
    stHitProb: 1 / 70.7,
    hesoPayouts: [
        { prob: 0.05, payout: netPayout(3000), st: true, renzoku: true },
        { prob: 0.46, payout: netPayout(900), st: true },
        { prob: 0.49, payout: netPayout(900), st: false }   // 幻闘RUSH(時短100)へ
    ],
    denchuPayouts: [
        { prob: 0.26, payout: netPayout(3000), renzoku: true },
        { prob: 0.54, payout: netPayout(1500) },
        { prob: 0.20, payout: 0 }                            // ST回復
    ],
    stSpins: 100,
    jitanSpins: 100,
    jitanHitProb: 1 / 288.7,        // 幻闘RUSH中確率（エンジン拡張1）
    jitanRotation1k: 30,
    zanhoCount: 0,
    chargeProb: 0, chargePayout: 0, chargeStRate: 0,
    renzokuRate: 0.33,              // 無双連撃ループ継続率（エンジン拡張3）
    renzokuPayout: netPayout(1500),
    isLT: false,
    ltChallengeRate: 0, ltFirstPayout: 0, ltEndPayout: 0,
    stContinueRate: 0.759           // 表示用参考値
}
```

---

## rezero2（e Re:ゼロから始める異世界生活 season2）

### 公式スペック

| 項目 | 値 |
|------|-----|
| 大当たり確率 | 1/349.9 |
| ST中確率 | 1/99.9 |
| ST回転数 | 145回 |
| RUSH突入率 | 55% |
| RUSH継続率 | 約77% |
| ラッキートリガー | 非搭載（スマパチ版） |
| 時短 | なし（電サポ 0 or 145） |

### 出玉振り分け

ヘソ（特図1）:

| 振り分け | 出玉（実獲得） | 行き先 |
|----------|------|--------|
| 55% | 3,000個（2,800発） | 超強欲3000BONUS → RUSH突入 |
| 45% | 1,500個（1,400発） | 通常へ |

電チュー（ST中）:

| 振り分け | 出玉（実獲得） |
|----------|------|
| 25% | 3,000個（2,800発） |
| 75% | 1,500個（1,400発） |

簡略化して無視するもの: ST 中の 2R 300 個（保留内連チャン用、振り分け公表なし）。

### システムマッピング

既存 ST 型に完全フィット。エンジン拡張は不要。

検算: 1-(1-1/99.9)^145 = 76.7% ≒ 公称 77% ✓

### SPECS 実装

```js
rezero2: {
    name: "e Re:ゼロから始める異世界生活 season2",
    shortName: "リゼロ2",
    hitProb: 1 / 349.9,
    stHitProb: 1 / 99.9,
    hesoPayouts: [
        { prob: 0.55, payout: netPayout(3000), st: true },
        { prob: 0.45, payout: netPayout(1500), st: false }
    ],
    denchuPayouts: [
        { prob: 0.25, payout: netPayout(3000) },
        { prob: 0.75, payout: netPayout(1500) }
    ],
    stSpins: 145,
    jitanSpins: 0,
    jitanRotation1k: 30,
    zanhoCount: 0,
    chargeProb: 0, chargePayout: 0, chargeStRate: 0,
    isLT: false,
    ltChallengeRate: 0, ltFirstPayout: 0, ltEndPayout: 0,
    stContinueRate: 0.77
}
```

---

## RUSH 名称（getRushName）

| 機種 | RUSH名 |
|------|--------|
| oumi5 | 確変 |
| hokuto4 | 真・幻闘RUSH |
| rezero2 | 強欲RUSH |

## 受け入れ条件

1. 3 機種がセレクトに表示され、1日実行・自動実行とも完走しコンソールエラーなし
2. 各機種 90 日自動実行（speed 10）で以下が公称値 ±3pt 程度に収束する
   - 大海5: RUSH（確変）突入率 ≈ 60%、北斗無双4: RUSH 継続率 ≈ 76%、
     リゼロ2: RUSH 突入率 ≈ 55%・継続率 ≈ 77%
   - 確認は実行ログ（初当り回数・突入回数・連チャン分布）の集計で行う
3. 既存 5 機種の挙動が変わらない（エンジン拡張はすべて未定義時に従来挙動）
4. 機種別テーマ: 新機種は既定のアクセントのままで良い（テーマ追加は対象外）
5. スコープ別データ管理（machine:rotation1k）が新機種でも機能する
