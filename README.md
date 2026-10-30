# 日々の予定

ライブ、通院、日々の約束を管理する日本語のカレンダーアプリです。画面はReact、予定の取得・登録・編集・削除はFastAPIで実装しています。データはSQLiteに保存され、初回起動時に日本時間の当月・今日・直近のサンプル予定を作成します。

## 必要な環境

- Python 3.12以上
- Node.js 22.12以上、または24系
- npm

## 起動

以下のコマンドはすべて保存先のルートディレクトリで実行します。

```bash
cd /workspace/nitte_kanri
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
npm ci
npm run build
.venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

FastAPIが8000番ポートで画面とAPIを配信します。稼働確認は次のコマンドで行えます。

```bash
curl --fail http://127.0.0.1:8000/api/health
```

## 開発時の自動更新

別々のターミナルで次のコマンドを実行します。

```bash
.venv/bin/uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

```bash
npm run dev
```

Viteの開発サーバーは`/api`へのリクエストをFastAPIの8000番ポートへ転送します。画面の変更はViteが、Pythonの変更はUvicornが自動反映します。

## 使い方

- 月間カレンダーで日付を選ぶと、その日の予定を確認できます。
- 「予定を追加」から予定名・日付・開始時間・終了時間・種類・場所を入力します。
- 種類は「ライブ」「通院」「その他」です。
- 予定を選ぶと詳細を表示し、編集・削除できます。
- 種類ごとの絞り込みと予定一覧の表示に対応しています。

終了時間と場所は省略できます。終了時間を入力する場合は、同日の開始時間より後に設定します。

## データの保存

初回起動時に`data/calendar.sqlite3`を作成します。登録した予定はサーバーを再起動しても残ります。すべての予定を削除した後も、サンプル予定が自動で復活することはありません。

保存先は環境変数`CALENDAR_DB_PATH`で変更できます。サンプルからやり直す場合は、サーバーを停止し、必要な予定を保管したうえでデータベースファイルを削除してから再起動します。

認証や外部カレンダー連携は含まれていません。個人用の開発・動作確認を想定した構成です。

## 検証

```bash
.venv/bin/python -m pytest backend/tests -q
npm test
npm run build
```

APIの検証では、一時データベースで予定の登録・更新・削除、再起動後の保存、入力値の検証、サンプルの初期化、静的ファイルの配信を確認します。

## API

| メソッド | パス | 処理 |
| --- | --- | --- |
| GET | `/api/health` | 稼働状態を確認 |
| GET | `/api/events` | 日付・時間順に予定を取得 |
| POST | `/api/events` | 予定を登録 |
| PUT | `/api/events/{id}` | 予定を更新 |
| DELETE | `/api/events/{id}` | 予定を削除 |

予定の項目は`id`、`title`、`date`、`start`、`end`、`category`、`location`です。`id`はサーバーが生成します。日付は`YYYY-MM-DD`、時間は`HH:MM`形式です。種類の送信値は`live`（ライブ）、`medical`（通院）、`other`（その他）です。
