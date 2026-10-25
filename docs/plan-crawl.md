# Plan crawl một năm và chốt trường mô hình

Cửa sổ: **25/10/2025 00:00 đến 24/10/2026 23:00**, múi `Asia/Ho_Chi_Minh`. Kho OpenAQ ghi file khoảng 72 giờ sau nửa đêm địa phương, nên ngày cuối thực tế là ngày archive đã có, không điền giờ chưa phát hành.

Mục tiêu của đợt này là một bảng giờ theo trạm khu vực Hà Nội, vẽ độ phủ của từng trường, rồi khóa bộ cột đưa vào mô hình t+1. Nhãn chỉ là PM2.5 trạm. CAMS và ERA5 không được ghi vào cột nhãn.

## Phạm vi đợt này

Lấy ba nguồn. Các nguồn còn lại trong `docs/nguon-du-lieu.md` không tham gia crawl một năm.

| Nguồn | Việc | Khóa |
| --- | --- | --- |
| OpenAQ v3 | Tìm trạm, giấy phép, cảm biến | `OPENAQ_API_KEY` |
| OpenAQ AWS | Tải measurement theo ngày của các location đã chọn | Không |
| Open-Meteo Archive | Thời tiết ERA5 tại tọa độ từng trạm | Không |
| Open-Meteo Air Quality | CAMS Global tại một điểm Hà Nội, làm đặc trưng nền | Không |

Để sau, không tải trong đợt này:

- WAQI và Google Air Quality: demo hoặc lớp bản đồ, không phải kho train. Token vẫn để sẵn trong `.env`.
- Copernicus ADS, MERRA-2, lưới năm, Sentinel-5P: sai độ phân giải hoặc sai tần suất cho mô hình giờ.
- Zenodo và CSV bốn thành phố: trùng CAMS, không phải trạm.
- File Kaggle 2024–2026: có khoảng trống và lẫn WAQI. Crawl mới thay file đó cho cửa sổ một năm.
- HealthyAir: TP.HCM, giai đoạn khác, chỉ dùng khi kiểm tra ngoài Hà Nội.

## Trạm

Hộp tọa độ khu vực Hà Nội, thứ tự OpenAQ `minLon,minLat,maxLon,maxLat`:

`105.28,20.56,106.05,21.40`

Ô này phủ nội thành và ngoại thành, có thể dính điểm sát biên của tỉnh bên cạnh. Giữ điểm khi tên địa phương hoặc khoảng cách tới tâm Hà Nội (21.028, 105.854) cho thấy nó thuộc thành phố. Bỏ điểm di động nếu metadata ghi là mobile.

Một trạm vào bảng khi có cảm biến PM2.5 và còn measurement trong cửa sổ. Lưu `location_id`, tên, lat, lon, nhà cung cấp, `license_id`, và các cờ giấy phép. Chưa gọi API nên chưa có danh sách id.

## Các bước

1. Điền `OPENAQ_API_KEY` trong `.env`. Các khóa khác để trống.
2. `GET /v3/locations` với bbox ở trên, phân trang đến hết. Ghi `data/raw/openaq/locations.json`.
3. Với từng location, đọc sensors và `GET /v3/licenses/{id}`. Ghi bảng trạm ra `data/interim/stations.csv`.
4. Với mỗi `location_id` và mỗi ngày trong cửa sổ, tải

   `s3://openaq-data-archive/records/csv.gz/locationid={id}/year={YYYY}/month={MM}/location-{id}-{YYYYMMDD}.csv.gz`

   Vùng `us-east-1`, cờ `--no-sign-request`. File thiếu nghĩa là ngày đó không có số, không coi là số 0.
5. Đổi `datetime` sang `Asia/Ho_Chi_Minh`, làm tròn xuống giờ. Nếu một giờ có nhiều mẫu của cùng sensor, lấy trung bình và giữ số mẫu. Nếu một location có nhiều sensor cùng thông số, giữ sensor có nhiều giờ nhất, không trộn máy.
6. Xoay thành cột `pm25`, `pm10`, `no2`, `o3`, `so2`, `co` theo đơn vị gốc. Đổi về µg/m³ khi OpenAQ ghi đơn vị khác, và ghi hệ số đã dùng.
7. Trên từng trạm gọi `asfreq("h")`. Giờ không có file thành giá trị rỗng.
8. Thời tiết: `https://archive-api.open-meteo.com/v1/archive` tại lat/lon từng trạm, `timezone=Asia/Ho_Chi_Minh`, cùng ngày. Gộp nhiều tọa độ trong một request khi API cho phép. Nghỉ giữa các request.
9. CAMS: một request `https://air-quality-api.open-meteo.com/v1/air-quality` tại 21.028, 105.854, `domains=cams_global`. Lưới khoảng 45 km nên không tải lại cho từng quận. Chỉ lấy giá trị tại giờ t, không lấy giờ t+1.
10. Nối theo `location_id` + giờ. CAMS nối theo giờ, lặp cho mọi trạm. Ghi `data/interim/hourly_hanoi.parquet` và một cột `source` cho từng nhóm trường.
11. Vẽ, áp quy tắc giữ/bỏ, ghi quyết định vào cuối file này.

ERA5 cùng giờ là tái phân tích, không phải dự báo đã ban hành trước giờ t. Với bài tập t+1 thì dùng được, và báo cáo phải nói rõ điều đó.

## Trường kéo về

Đơn vị để so sánh là µg/m³ với chất ô nhiễm, °C, %, m/s, mm, hPa, m.

| Cột | Nguồn | Vai trò |
| --- | --- | --- |
| `pm25` | OpenAQ | Nhãn sau khi dịch +1 giờ. Cột gốc giữ ở giờ t |
| `pm10`, `no2`, `o3`, `so2`, `co` | OpenAQ | Đặc trưng cùng trạm, chỉ nếu độ phủ đạt ngưỡng |
| `temperature_2m` | ERA5 | Đặc trưng |
| `relative_humidity_2m` | ERA5 | Đặc trưng |
| `surface_pressure` | ERA5 | Đặc trưng |
| `wind_speed_10m` | ERA5 | Đặc trưng, có trong mô hình v1 |
| `wind_direction_10m` | ERA5 | Đổi thành `wind_u`, `wind_v` rồi bỏ cột độ |
| `precipitation` | ERA5 | Đặc trưng |
| `boundary_layer_height` | ERA5 | Đặc trưng |
| `cams_pm25`, `cams_pm10`, `cams_no2`, `cams_o3`, `cams_dust`, `cams_aod` | CAMS Global | Nền thành phố tại giờ t. Không đưa vào nhãn |
| `hour`, `day_of_week`, `month`, `is_dry_season` | Lịch | `is_dry_season` = tháng 11–4. Giờ và thứ đưa vào mô hình dạng sin/cos |

Lag và rolling không tải từ API. Tính sau `asfreq("h")`, riêng từng trạm:

- `pm25_lag1`, `pm25_lag24`, `pm25_lag168`
- `pm25_roll_3h`, `pm25_roll_24h`, `pm25_roll_24h_std`

Bỏ dòng mà cửa sổ lag cắt qua giờ rỗng. Không nội suy khoảng trống để tạo PM2.5.

Không lưu AQI (US, châu Âu, `vnm_vea`), giá trị WAQI, điểm lưới năm, cột khí Sentinel-5P.

## Chốt cho mô hình v1

Ba mô hình trong README dùng cùng các cột sau. Nhãn là `pm25` của giờ tiếp theo, đơn vị µg/m³.

| Mô hình | Cột đưa vào |
| --- | --- |
| Baseline | `pm25` tại t |
| Hồi quy | `pm25_lag1`, `pm25_lag24`, `wind_speed_10m` |
| Gradient boosting | cùng ba cột đó |

Bảng parquet vẫn giữ các trường ERA5, chất khác và CAMS. Chúng chưa vào ba mô hình này. Sau biểu đồ, một trường được thêm vào boosting chỉ khi đủ cả ba điều kiện:

- Ít nhất 70% số giờ của các trạm giữ lại có giá trị, tính trên trục đã `asfreq("h")`.
- Không trùng một trường đã giữ: hệ số tương quan tuyệt đối dưới 0,95. Hướng gió thô và điểm sương dễ rơi vào nhóm này.
- Không phải giá trị của giờ t+1.

Trạm có dưới 60% số giờ PM2.5 trong cửa sổ thì ra khỏi tập train, vẫn hiện trên bản đồ độ phủ.

Tập test là các tháng cuối của từng trạm, không xáo hàng.

## Biểu đồ cần có trước khi thêm cột

Lưu dưới `reports/field-review/`.

- Bản đồ trạm, màu theo PM2.5 trung bình.
- Tỉ lệ giờ có PM2.5 theo trạm và theo tháng.
- Thanh khoảng trống của từng trạm: số khoảng, khoảng dài nhất.
- Mỗi trường số: histogram, boxplot theo giờ trong ngày, tỉ lệ thiếu theo trạm.
- Ma trận tương quan trên các giờ đủ PM2.5.
- Scatter PM2.5 trạm với `cams_pm25` cùng giờ, để thấy hai chuỗi không thay nhau.
- Một bảng `coverage.csv`: trường, nguồn, số trạm có sensor, tỉ lệ giờ không rỗng, quyết định giữ hoặc bỏ.

## Chỗ để khóa

`/.env.example` là bản ghi trong git. `/.env` cùng nội dung, đã bị gitignore, điền giá trị tại máy.

| Biến | Khi nào cần | Đợt crawl này |
| --- | --- | --- |
| `OPENAQ_API_KEY` | Tìm trạm và giấy phép. Gửi header `X-API-Key`. Lấy tại https://explore.openaq.org/ | Bắt buộc trước bước 2 |
| `WAQI_TOKEN` | AQI hiện tại cho demo. Không tải lịch sử vào tập train. https://aqicn.org/data-platform/token/ | Để trống |
| `GOOGLE_MAPS_API_KEY` | Heatmap và `vnm_vea` sau này. Cần bật Air Quality API và billing. Lịch sử chỉ 30 ngày | Để trống |
| `CDSAPI_URL`, `CDSAPI_KEY` | CAMS EAC4 trên ADS, nếu làm chương xu hướng dài hạn. https://ads.atmosphere.copernicus.eu/ | Để trống |
| `EARTHDATA_USERNAME`, `EARTHDATA_PASSWORD` | MERRA-2 sau này. https://urs.earthdata.nasa.gov/ | Để trống |

Open-Meteo và kho S3 OpenAQ không có biến khóa. Không commit `.env`, CSV thô, hay parquet.

## Thư mục

```
data/raw/openaq/          # json trạm, csv.gz theo ngày
data/raw/openmeteo/       # json thời tiết và CAMS
data/interim/stations.csv
data/interim/hourly_hanoi.parquet
reports/field-review/     # hình và coverage.csv
```

`data/` không đưa lên git.

## Kết quả lần chạy 25/10/2026

Đã gọi OpenAQ API v3 với `OPENAQ_API_KEY`. Trong bbox có 43 location có PM2.5. Chỉ 6 location còn file trong cửa sổ 25/10/2025–24/10/2026. Trục giờ đủ có 8.760 giờ mỗi trạm.

| location id | Tên | Độ phủ PM2.5 | Số khoảng trống | Khoảng dài nhất | Tập train |
| --- | --- | --- | --- | --- | --- |
| 4946812 | Công viên Nhân Chính, Khuất Duy Tiến | 94,4% | 52 | 86 giờ | Có |
| 4946813 | ĐH Bách Khoa, cổng Parabol, Giải Phóng | 91,9% | 119 | 135 giờ | Có |
| 6123215 | OceanPark, AirGradient | 92,7% | 42 | 349 giờ | Có |
| 4946811 | 556 Nguyễn Văn Cừ | 59,9% | 93 | 2.430 giờ | Không. Mất số từ khoảng 07/2026 |
| 2161292 | 46 Lưu Quang Vũ | 38,7% | 187 | 859 giờ | Không |
| 2161306 | Minh Khai, Bắc Từ Liêm | 17,5% | 131 | 2.232 giờ | Không |

Ba trạm train cho 23.449 dòng đủ nhãn t+1, lag 1 giờ, lag 24 giờ và tốc độ gió.

Giấy phép: OceanPark là CC BY 4.0, cảm biến AirGradient, không phải trạm chuẩn. Năm trạm Hanoi Air Quality Monitoring Network trả `licenses: null`. File thô của mạng này chỉ để local, không commit, không phát hành lại cho đến khi có giấy phép.

Tương quan PM2.5 trạm với CAMS cùng giờ là 0,46. Scatter trong `reports/field-review/pm25_vs_cams.png` nằm lệch khỏi đường chéo, nên CAMS không thay nhãn.

Quy tắc 70% và tương quan 0,95, tính trên ba trạm train:

Giữ cho mô hình v1: `pm25_lag1`, `pm25_lag24`, `wind_speed_10m`.

Đủ điều kiện thêm vào boosting: `hour_sin`, `hour_cos`, `dow_sin`, `dow_cos`, `is_dry_season`, `month`, `temperature_2m`, `relative_humidity_2m`, `surface_pressure`, `wind_u`, `wind_v`, `precipitation`, `boundary_layer_height`, `cams_pm25`, `cams_no2`, `cams_o3`, `cams_dust`, `cams_aod`.

Bỏ: `pm10`, `no2`, `o3`, `so2`, `co` vì OceanPark không đo các khí này, độ phủ gộp dưới 70%. `cams_pm10` trùng `cams_pm25` (tương quan 1,00).

Ba mô hình trong README vẫn chỉ dùng bộ v1. Bảng giờ nằm ở `data/interim/hourly_hanoi.parquet`. Biểu đồ và `coverage.csv` nằm ở `reports/field-review/`. Chạy lại bằng `python scripts/crawl_hanoi_year.py`.
