# Web/Python 共通 machine-specs.json 移行設計書

作成日: 2026-06-18
ステータス: 設計案

## 目的

Web 版の `SPECS` と Python CLI の `MachineSpec` が別々に機種スペックを持っているため、
今後の機種追加や検証で値の転記漏れが起きやすい。共通の `machine-specs.json` を導入し、
最終的には Web と Python CLI の両方が同じ機種データから runtime 用の定義を作れる状態にする。

ただし、移行中に既存挙動を変えないことを最優先にする。

## 守る制約

- localStorage のキー、スコープキー、保存済み history/ranking の形は変更しない。
  - `pachinko_data_v2`
  - `scopes["${machine}:${rotation1k}"]`
- `expectedProfitYen(...)` の式と入力フィールドの意味は変更しない。
- 既存の機種キーは変更しない。
  - Web: `eva15`, `eva17`, `garo`, `garo12`, `ghoul`, `oumi5`, `hokuto4`, `rezero2`
  - Python CLI: 現状は `eva15`, `eva17`, `garo12`
- 公式表記の払い出しではなく、シミュレーターが使う純増値を runtime 値として維持する。
- GitHub Pages とローカル静的ファイルで壊れない方式にする。実行時 `fetch("machine-specs.json")`
  だけに依存すると `file://` 確認で壊れるため、生成済み JS またはインライン生成を使う。

## 現状整理

### Web 側

`index.html` の `SPECS` は 8 機種を持ち、期待値計算とシミュレーションが直接参照している。

主なフィールド:

- `name`, `shortName`
- `hitProb`, `stHitProb`, `stContinueRate`
- `hesoPayouts`, `denchuPayout`, `denchuPayouts`
- `stSpins`, `jitanSpins`, `jitanHitProb`, `jitanRotation1k`
- `zanhoCount`
- `chargeProb`, `chargePayout`, `chargeStRate`
- `isLT`, `ltChallengeRate`, `ltFirstPayout`, `ltEndPayout`
- `renzokuRate`, `renzokuPayout`

`verify.js` は `index.html` の `<script>` を VM で読み、`SPECS`、`expectedProfitYen`、
`simulateFastSession` を取り出して Monte Carlo 検証を行っている。

### Python CLI 側

`eva_simulator.py` の `MachineSpec` は dataclass で、現状は `EVA15`, `EVA17`, `GARO12`
を定義している。

Web 側と違う点:

- フィールド名が snake_case。
- `heso_payouts` と `denchu_payouts` は tuple 配列。
- Web 側の `jitanHitProb`, `renzokuRate`, `renzokuPayout`, `isLT` 相当はまだ持っていない。
- CLI の `--machine` choices は `eva15`, `eva17`, `garo12` のみ。
- Python の ST/LT 実装は Web と完全同一ではないため、いきなり 8 機種対応へ広げると挙動差が出る。

## 共通 JSON の役割

`machine-specs.json` は「人が編集する正本」にする。ただし導入直後は runtime の正本にしない。
最初は既存 `SPECS` とのミラー検証だけを行い、差分がゼロであることを確認してから runtime 参照へ進める。

JSON は Web 側の runtime 形をそのまま保存しすぎない。特に `1 / 319.7` のような式は JSON に書けないため、
分母を保存し、アダプタで確率値へ解決する。

想定する v1 形:

```json
{
  "schemaVersion": 1,
  "payoutBasis": "netBalls",
  "machines": {
    "eva15": {
      "name": "P新世紀エヴァンゲリオン15 未来への咆哮",
      "shortName": "エヴァ15",
      "rushName": "インパクトモード",
      "challengeName": null,
      "probabilities": {
        "hitDenominator": 319.7,
        "stHitDenominator": 99.4,
        "jitanHitDenominator": null,
        "stContinueRate": 0.807
      },
      "payouts": {
        "heso": [
          { "prob": 0.03, "netPayout": 1400, "st": true },
          { "prob": 0.56, "netPayout": 420, "st": true },
          { "prob": 0.41, "netPayout": 420, "st": false }
        ],
        "denchu": [
          { "prob": 1.0, "netPayout": 1400 }
        ]
      },
      "systems": {
        "stSpins": 163,
        "jitanSpins": 100,
        "jitanRotation1k": 30,
        "zanhoCount": 4,
        "charge": {
          "denominator": null,
          "netPayout": 0,
          "stRate": 0
        },
        "lt": {
          "enabled": false,
          "challengeRate": 0,
          "firstPayout": 0,
          "endPayout": 0
        },
        "renzoku": {
          "rate": null,
          "netPayout": 0
        }
      },
      "runtime": {
        "webEnabled": true,
        "pythonEnabled": true
      },
      "notes": [
        "runtime の出玉は純増値"
      ]
    }
  }
}
```

## アダプタ方針

### Web アダプタ

JSON から現行 `SPECS` 互換の object を生成する。

- `hitProb = 1 / probabilities.hitDenominator`
- `stHitProb = stHitDenominator ? 1 / stHitDenominator : 0`
- `jitanHitProb = jitanHitDenominator ? 1 / jitanHitDenominator : undefined`
- `chargeProb = charge.denominator ? 1 / charge.denominator : 0`
- `hesoPayouts[].payout = netPayout`
- `denchuPayouts[].payout = netPayout`
- `denchuPayout` は互換用に、denchu が 1 件だけのときだけ生成してよい
- `isLT = systems.lt.enabled`

`expectedProfitYen(...)` は生成後の `SPECS` を読むだけにし、式は触らない。

### Python アダプタ

JSON から `MachineSpec` へ変換する。

- camelCase から snake_case へ変換する。
- tuple 配列へ変換する。
- `runtime.pythonEnabled === true` の機種だけを CLI choices に出す。
- Web だけが対応している `jitanHitProb` や `renzoku` は、Python engine が対応するまで読み捨てず、
  validator で「Python 未対応フィールドを持つ機種は pythonEnabled=false」と判定する。

## 段階移行案

### Phase 0: 設計のみ

このドキュメントを追加する。runtime、localStorage、期待値計算、検証結果は変えない。

検証:

```bash
python scripts/validate_static_site.py
node --check verify.js
node verify.js --machine=eva15 --trials=10 --batches=1 --json
PYTHONPATH=. python3 -m unittest discover -s tests -v
git diff --check
```

### Phase 1: JSON ミラーを追加する

`machine-specs.json` を追加するが、Web/Python はまだ読まない。

追加する検証:

```bash
python3 scripts/validate_machine_specs.py
```

`validate_machine_specs.py` の責務:

- JSON schema の必須フィールドを確認する。
- machine key が Web `SPECS` と一致することを確認する。
- JSON から生成した Web 互換 object と、既存 `index.html` 内の `SPECS` が一致することを確認する。
- 確率合計が 1.0 に近いことを確認する。
- `runtime.pythonEnabled=true` の機種が Python CLI の現行 engine で表現可能なフィールドだけを使うことを確認する。

この段階では runtime は変わらないため、既存ユーザーデータにも期待値計算にも影響しない。

### Phase 2: 生成 JS を追加する

`scripts/generate_machine_specs_js.py` を追加し、`machine-specs.json` から
`machine_specs.generated.js` を生成する。

まだ `index.html` は既存 inline `SPECS` を使う。生成物との一致だけを検証する。

検証:

```bash
python3 scripts/generate_machine_specs_js.py --check
python scripts/validate_static_site.py
node verify.js
git diff --check
```

### Phase 3: Web を生成 JS へ切り替える

`index.html` の inline `SPECS` を削除し、`machine_specs.generated.js` が定義する
`SPECS`, `RUSH_NAMES`, `CHALLENGE_NAMES` を使う。

注意:

- `<script src="machine_specs.generated.js"></script>` は main script より前に置く。
- `expectedProfitYen(...)` は変更しない。
- `getRushName()` と `getChallengeName()` は生成された map を読むだけにする。
- `verify.js` は `index.html` だけでなく `machine_specs.generated.js` も VM に読み込むようにする。

検証:

```bash
python scripts/validate_static_site.py
node verify.js
PYTHONPATH=. python3 -m unittest discover -s tests -v
git diff --check
```

可能なら Playwright で以下を確認する。

- 8 機種の選択肢が表示される。
- 3 日自動実行で history と期待値表示が更新される。
- コンソールエラーがない。

### Phase 4: Python CLI を JSON へ切り替える

Python 側に `load_machine_specs()` と `to_machine_spec()` を追加し、
`runtime.pythonEnabled=true` の機種だけを CLI choices に出す。

最初は `eva15`, `eva17`, `garo12` のみを JSON 由来にして、CLI の対象機種は広げない。
Web-only 機種の Python 対応は別タスクにする。

検証:

```bash
PYTHONPATH=. python3 -m unittest discover -s tests -v
python3 eva_simulator.py --mode single --machine eva15 --sims 3 --spins 100
python3 eva_simulator.py --mode single --machine eva17 --sims 3 --spins 100
python3 eva_simulator.py --mode single --machine garo12 --sims 3 --spins 100
python scripts/validate_static_site.py
node verify.js --machine=eva15 --trials=100 --batches=1
git diff --check
```

### Phase 5: 重複定義を削る

Web inline 定義と Python 定数が不要になったら削除する。
この段階で初めて `machine-specs.json` を両 runtime の正本とする。

## リスクと対策

| リスク | 影響 | 対策 |
|--------|------|------|
| machine key を変えてしまう | localStorage のスコープ履歴が見えなくなる | JSON key は既存 key と完全一致させる。rename は別途 migration 設計が必要 |
| 確率を小数で保存して丸め差が出る | Monte Carlo と期待値の差が出る | JSON は分母を保存し、アダプタで `1 / denominator` を計算する |
| gross 出玉と net 出玉が混ざる | 収支と期待値がずれる | `payoutBasis: "netBalls"` を必須にし、runtime 値は純増値だけにする |
| Web と Python の engine 差を隠してしまう | Python CLI の新機種結果が誤る | `runtime.pythonEnabled` を導入し、対応済み機種だけを CLI に出す |
| `fetch` 依存でローカル確認が壊れる | HTML を直接開いたときに動かない | JSON を直接 runtime fetch せず、生成 JS を commit する |
| 生成物の更新漏れ | JSON と JS がずれる | `generate_machine_specs_js.py --check` を検証コマンドに入れる |
| 期待値式へ同時に手を入れる | 回帰原因が分からなくなる | 期待値式の変更は別タスクに分離する |

## 最初に実装するべき 1 ステップ

Phase 1 の「JSON ミラー + validator」だけを実装する。

この 1 ステップでの完了条件:

1. `machine-specs.json` が追加される。
2. `scripts/validate_machine_specs.py` が追加される。
3. Web/Python runtime は一切変更しない。
4. `expectedProfitYen(...)` は変更しない。
5. `python3 scripts/validate_machine_specs.py` が、JSON と現行 Web `SPECS` の一致を検証する。
6. `node verify.js` の結果が Phase 0 から変わらない。

この順序なら、共通化の土台を作りながら、localStorage と期待値計算を触らずに安全性を確認できる。
