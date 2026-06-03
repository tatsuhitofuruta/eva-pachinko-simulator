# ヘッドレスパチンコ

[![CI](https://github.com/tatsuhitofuruta/pachinko-simulator/actions/workflows/ci.yml/badge.svg)](https://github.com/tatsuhitofuruta/pachinko-simulator/actions/workflows/ci.yml)
[![CodeQL](https://github.com/tatsuhitofuruta/pachinko-simulator/actions/workflows/codeql.yml/badge.svg)](https://github.com/tatsuhitofuruta/pachinko-simulator/actions/workflows/codeql.yml)
[![OSSF Scorecard](https://github.com/tatsuhitofuruta/pachinko-simulator/actions/workflows/scorecard.yml/badge.svg)](https://github.com/tatsuhitofuruta/pachinko-simulator/actions/workflows/scorecard.yml)

パチンコ機種の収支シミュレーション、ボーダー計算、確率分析ツール

## 🎮 Webシミュレーター

**👉 [今すぐブラウザで試す](https://tatsuhitofuruta.github.io/pachinko-simulator/)**

インストール不要！ブラウザだけで体験できます。

## 機能

- 🎰 **収支シミュレーション**: 指定回転数での収支分布を計算
- 📊 **機種比較**: 複数機種の比較
- 📈 **ハマり確率**: 各回転数でのハマり確率を計算
- ⏱️ **勝率収束**: 期待勝率に収束するまでの必要回転数を計算
- 📊 **累計収支**: 稼働ごとの収支を自動記録（localStorage）
- 🏆 **個人記録**: 最高/最低収支、最大連チャンを記録

## インストール

```bash
git clone https://github.com/tatsuhitofuruta/pachinko-simulator.git
cd pachinko-simulator
pip install -r requirements.txt
```

## 使い方

### 機種比較

```bash
python eva_simulator.py --mode compare --rotation 18
```

### ハマり確率比較

```bash
python eva_simulator.py --mode hamari
```

### 勝率収束計算

```bash
python eva_simulator.py --mode convergence
```

### 単一機種シミュレーション

```bash
# P新世紀エヴァンゲリオン15 未来への咆哮
python eva_simulator.py --mode single --machine eva15 --rotation 18 --spins 2000

# e 新世紀エヴァンゲリオン ～はじまりの記憶～
python eva_simulator.py --mode single --machine eva17 --rotation 18 --spins 2000

# e牙狼12黄金騎士極限
python eva_simulator.py --mode single --machine garo12 --rotation 17 --spins 2000
```

### 当たり履歴の表示

```bash
# 1回の稼働を詳細に見る
python eva_simulator.py --mode single --machine eva15 --sims 1

# 多数回でも詳細表示を強制
python eva_simulator.py --mode single --sims 100 --detail

# 少数回でも詳細を省略
python eva_simulator.py --mode single --sims 5 --no-detail
```

## オプション

| オプション | 説明 | デフォルト |
|------------|------|------------|
| `--mode` | 実行モード (compare/hamari/convergence/single) | compare |
| `--rotation` | 千円あたり回転数 | 18.0 |
| `--spins` | 総回転数 | 2000 |
| `--sims` | シミュレーション回数 | 50000 |
| `--machine` | 機種 (eva15/eva17/garo12) | eva15 |
| `--detail` / `-d` | 当たり履歴を強制表示 | - |
| `--no-detail` | 当たり履歴を非表示 | - |

※ 当たり履歴は `--sims` が10以下の場合に自動表示されます

## 開発・メンテナンス

このリポジトリはGitHub ActionsでPython CLI、静的Webシミュレーター、依存関係、セキュリティスキャンを継続チェックします。

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m pip install ruff

ruff check .
python -m compileall eva_simulator.py tests scripts
python -m unittest discover -s tests -v
python scripts/validate_static_site.py
```

機種スペックを変更する場合は、確率・出玉振り分け・モード名の参照元をPRに記載してください。

## スペック情報

### P新世紀エヴァンゲリオン15 未来への咆哮

| 項目 | 数値 |
|------|------|
| 大当り確率 | 1/319.7 |
| ST突入率 | 70% |
| ST継続率 | 81% |
| 初当たり出玉 | 3%で1,400発 / 97%で420発 |
| ST中出玉 | 1,400発 |
| 等価ボーダー | 17.0回転 |

※出玉は実増え（15賞玉-1発=14発/カウント）

### e 新世紀エヴァンゲリオン ～はじまりの記憶～

| 項目 | 数値 |
|------|------|
| 大当り確率 | 1/399.9 |
| ST突入率 | 61% |
| ST継続率 | 80% |
| 初当たり出玉 | 0.5%で1,400発 / 99.5%で280発 |
| ST中出玉 | 2,240発 |
| 等価ボーダー | 16.8回転 |

※出玉は実増え（15賞玉-1発=14発/カウント）

### e牙狼12黄金騎士極限

| 項目 | 数値 |
|------|------|
| 大当り確率 | 1/437.49 |
| LTチャレンジ突入率 | 50% |
| LT継続率 | 76% |
| LT継続時出玉 | 25%で7,000発 / 51%で1,400発 |
| LT転落時出玉 | 1,400発 |
| 等価ボーダー | 17.2回転 |

※LTシステム: 初当たり1,400発→50%でLTチャレンジ→継続時に出玉振り分け
※出玉は実増え（15賞玉-1発=14発/カウント）

## 出力例

### 統計情報

```
【P新世紀エヴァンゲリオン15 未来への咆哮】
  勝率: 50.3%
  平均収支: +15,629円
  中央値: +689円
  標準偏差: 85,105円

  初当たり回転数:
    平均: 320回転
    中央値: 220回転

  連チャン数:
    平均: 4.2連
    最大: 15連
    分布: 1連:30% 2連:14% 3連:11% ...
```

### 当たり履歴（--sims 1 の場合）

```
==================================================
【当たり履歴】
==================================================

  ▶ 当たり1: 230回転目 (累計230回転)
    初当たり: 420発 → ST非突入（単発）
    → 合計出玉: 420発

  ▶ 当たり2: 162回転目 (累計392回転)
    初当たり: 420発 → ST突入 → 6連
      2連目: 1,400発
      3連目: 1,400発
      4連目: 1,400発
      5連目: 1,400発
      6連目: 1,400発
    → 合計出玉: 7,420発

  ----------------------------------------
  初当り回数: 2回
  総獲得出玉: 7,840発
  最終収支: +10,249円
```

## 更新履歴

### v1.6.0 (2025-01-08)
- **収支カレンダー機能追加**
  - セッション履歴をカレンダー形式で表示
  - 仮想日付システム（1回のシミュレーション = 1日進行）
  - カレンダーが最新セッション月に自動移動
  - 既存データの自動マイグレーション対応
- **e 東京喰種 機種追加**
  - 大当たり確率1/399.9のLT機種
  - LT突入率51%、継続率75%
  - チャージ機能（公式300個、収支計算は純増280発）
- **一日平均収支表示**
  - 累計パネルに平均収支を追加

### v1.5.0 (2025-01-07)
- **累計収支機能追加**
  - localStorageで稼働ごとの収支を自動記録
  - 累計投資/出玉/収支を表示
- **個人記録機能追加**
  - 最高収支/最低収支/最大連チャン/一撃最高出玉を記録
- **機種名変更**
  - P新世紀エヴァンゲリオン15/e 新世紀エヴァンゲリオン/e牙狼12に変更

### v1.4.1 (2025-01-06)
- **e牙狼12黄金騎士極限 スペック修正**
  - LT継続率を76%に修正（25%+51%）
  - LT継続時の出玉振り分けを実装（25%で7,000発、51%で1,400発）
  - 等価ボーダーを17.2回転に修正

### v1.4.0 (2025-01-06)
- **e牙狼12黄金騎士極限 追加**
  - 大当たり確率1/437.49のLT機種
  - LTシステム: 50%でLTチャレンジ
  - `--machine garo12` で選択可能
- **LT機種対応**
  - LTチャレンジ/転落を正しく表示
  - 転落時出玉にも対応

### v1.3.0 (2025-01-06)
- **GitHub Pages対応**
  - ブラウザでシミュレーション体験可能

### v1.2.2 (2025-01-06)
- **時短引き戻し回転数を表示**
  - 履歴表示で「時短32回転目」のように表示

### v1.2.1 (2025-01-05)
- **残保留数を修正**

### v1.2.0 (2025-01-05)
- **インタラクティブモード追加** (`--play`)
  - 回転数リアルタイムカウントアップ表示
  - 持ち玉優先消費システム（持ち玉→追加投資の順）
  - ST中の当たり回転数表示（「ST67回転目で当たり」等）
  - `--fast`で高速モード
- **出玉計算を実増えに修正**
  - 15賞玉 - 1発(入賞) = 14発/カウント

### v1.1.0 (2025-01-05)
- 残保留引き戻し機能
- チャージ・暴走モード
- 時短引き戻し機能
- 正確なラウンド振り分け（特図1/特図2分離）

### v1.0.0
- 初回リリース
- 収支シミュレーション
- 機種比較
- ハマり確率計算
- 勝率収束計算

## ライセンス

MIT License

## 注意事項

- このツールは学習・研究目的で作成されています
- 実際の遊技結果を保証するものではありません
- ギャンブルは計画的に
