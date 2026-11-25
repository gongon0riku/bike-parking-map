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
