# バイク駐車場マップ

排気量で絞れる、バイク専用の駐車場マップです。東京23区の駅周辺にあるバイク駐車場を、対応排気量・料金・屋根の有無で探せます。

## 画面

1. **エリアを探す**：駅名・地名・路線で検索して駅を選ぶ
2. **地図＋リスト**：駅周辺の駐車場を地図ピンとカードで表示。排気量フィルター（すべて／125ccまで／250ccまで／大型OK）
3. **詳細**：料金・営業時間・台数・屋根・対応排気量・住所・情報源リンク

## データ

- 駅データ：`data/stations.json`（東京23区489駅。出典：国土交通省「国土数値情報（鉄道データ）」、OpenStreetMap）
- 駐車場データ：`data/parking/<station_id>.json`（駅ごと）。仕様は `docs/DATA_SCHEMA.md`
- データの追加・修正はブランチ＋Pull Requestで行います

## 公開（Cloudflare Pages）

ビルド不要の静的サイトです。Cloudflare Pagesでこのリポジトリを接続し、以下でデプロイします。

- Framework preset: None
- Build command: （空欄）
- Build output directory: `/`（リポジトリルート）

## ローカルで確認

```bash
python3 -m http.server 8000
# http://localhost:8000 を開く
```

地図表示：Leaflet + OpenStreetMap（© OpenStreetMap contributors）

## 収益化（Google AdSense前提）

- 広告枠は「エリア画面の下部」と「詳細画面の下部」に設置済みです。設定は `ads.json` で管理し、AdSenseのクライアントIDとスロットIDを設定するまでは何も表示されません
- プライバシーポリシーは独立ページ（アプリ内フッターから遷移）として用意済みです
- アフィリエイトリンクの枠も併設しています（設定は `affiliate.json`）

### 公開から審査申請までの順番

1. PRをマージしてCloudflare Pagesで公開する
2. 独自ドメインを取得して接続する（**ユーザーの判断待ち・未取得**。〜.pages.dev のサブドメインではAdSenseに登録できません）
3. 駐車場データをある程度揃える
4. AdSenseに申請し、発行されたIDを `ads.json` に設定する（あわせて `ads.txt` を設置する）
