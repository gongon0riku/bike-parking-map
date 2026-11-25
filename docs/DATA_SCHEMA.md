# データ仕様

## 駅データ: `data/stations.json`

東京23区内の全駅（乗換駅は1つに統合）。出典：国土交通省「国土数値情報（鉄道データ）」N02-23、
区の判定はOpenStreetMapの行政界による。

```json
{
  "id": "st0168",
  "name": "錦糸町",
  "ward": "墨田区",
  "lat": 35.697218,
  "lon": 139.814787,
  "lines": [ { "line": "総武線", "operator": "東日本旅客鉄道" } ]
}
```

## 駐車場データ: `data/parking/<station_id>.json`

駅ごとに1ファイル。調査済みの駅だけファイルが存在する（無い駅は未調査または0件）。

```json
{
  "station_id": "st0168",
  "station_name": "錦糸町",
  "ward": "墨田区",
  "checked_date": "2026-11-25",
  "parkings": [
    {
      "id": "p001",
      "name": "○○バイク駐車場",
      "lat": 35.697,
      "lon": 139.815,
      "address": "東京都墨田区錦糸4-○-○",
      "cc_class": "250",
      "displacement_note": "250cc以下可と情報源に明記",
      "fees": {
        "free_minutes": 0,
        "base_minutes": 30,
        "base_yen": 100,
        "max_yen_per_day": 800,
        "note": "24時間最大800円"
      },
      "capacity": 20,
      "roof": true,
      "hours": "24時間",
      "monthly": false,
      "source_url": "https://example.co.jp/parking/...",
      "data_note": "料金は集約サイトの掲載値",
      "checked_date": "2026-11-25"
    }
  ]
}
```

### フィールド定義（駐車場1件）

| フィールド | 型 | 説明 |
|---|---|---|
| id | string | ファイル内で一意（p001〜） |
| name | string | 駐車場名（公式名称） |
| lat / lon | number | 緯度・経度 |
| address | string | 住所 |
| cc_class | string | 受け入れ可能な最大排気量の区分。`"125"`（原付まで）／`"250"`／`"400"`／`"unlimited"`（大型可・上限なしと明記）／`"unknown"`（情報源に明記なし）。推測で決めず、情報源の記載に基づいて付ける |
| displacement_note | string | 排気量条件の原文情報（例：「排気量100cc以下のバイクは不可」「原付のみ」） |
| fees.free_minutes | number \| null | 無料時間（分）。なしは 0、不明は null |
| fees.base_minutes / base_yen | number \| null | 基本料金（○分○円） |
| fees.max_yen_per_day | number \| null | 最大料金（円／24時間）。なし・不明は null |
| fees.note | string | 料金の補足（原文に近い表記） |
| capacity | number \| null | 収容台数。不明は null |
| roof | boolean \| null | 屋根あり=true、なし=false、不明=null |
| hours | string | 営業時間（例 "24時間"、"6:00-23:00"） |
| monthly | boolean \| null | 月極契約の可否。不明は null |
| source_url | string | 情報源（公式サイト優先）のURL |
| data_note | string | （任意）出典の内訳や座標精度などの注記 |
| checked_date | string | このデータをWebで確認した日（YYYY-MM-DD） |

### フィルターとの対応（アプリ側）

利用者が自分のバイクの排気量を選ぶと、受け入れ可能な駐車場だけが残る。

- 「すべて」: 全件表示（unknown も含む）
- 「125ccまで」: cc_class が `125` / `250` / `400` / `unlimited`
- 「250ccまで」: cc_class が `250` / `400` / `unlimited`
- 「大型OK」: cc_class が `unlimited`
- `unknown` は「すべて」でだけ表示し、「排気量の条件は未確認」と明示する

### 調査ルール

- 情報源は運営会社・自治体などの公式サイトを優先する
- Googleマップで「閉業」表示のものは登録しない
- 情報源URLと確認日（checked_date）を必ず付ける
- 排気量の条件は情報源の記載に基づく。明記がなければ `unknown` とし、推測で埋めない
