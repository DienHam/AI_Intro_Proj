# Xem xét bộ dữ liệu và API

Ghi ngày 25/10/2026 trên nhánh `review/datasets-apis`.

Mục tiêu của repo vẫn là dự báo PM2.5 giờ tiếp theo tại Hà Nội từ số đo theo giờ, kèm heatmap, chatbot và lớp bản đồ. Kết quả là cảnh báo ngắn hạn, không thay trạm quan trắc. Tài liệu này chọn nguồn nào được làm **nhãn**, nguồn nào chỉ được làm **đặc trưng hoặc bản đồ**, và nguồn nào chỉ dành cho **demo**.

Ba lớp không được trộn khi chấm MAE/RMSE:

| Lớp | Ý nghĩa | Dùng làm nhãn t+1? |
| --- | --- | --- |
| Thực đo | Cảm biến hoặc trạm mặt đất | Có, sau khi kiểm tra giờ thiếu và giấy phép |
| Mô hình | CAMS, ERA5, MERRA-2, GEOS-Chem | Không. Chỉ làm baseline hoặc đặc trưng, và phải ghi là đầu ra mô hình |
| Cột khí / lưới năm | Sentinel-5P, PM2.5 trung bình năm | Không. Làm bản đồ hoặc bối cảnh không gian |

Giấy phép ghi trên một file CSV không xóa giấy phép của dữ liệu gốc. Gói CC0 vẫn phải ghi nguồn Open-Meteo, Copernicus hoặc GeoNames nếu bên trong là dữ liệu của họ. Dữ liệu lấy từ WAQI không được đem phát hành lại chỉ vì file bọc ngoài ghi CC0.

## Kết luận

1. **Nhãn huấn luyện:** PM2.5 theo giờ của trạm Hà Nội trên OpenAQ. Lấy hàng loạt từ kho AWS, dùng API v3 để lấy metadata, đơn vị và giấy phép từng nhà cung cấp.
2. **Tập thử pipeline:** [Hanoi Air Quality (PM2.5) + Weather Data 2024–2026](https://www.kaggle.com/datasets/diabolicfox/hanoi-air-quality-pm2-5-weather-data-2024-2026). Không dùng cột lag và rolling có sẵn. Dựng lại trục giờ rồi tính lại.
3. **Thời tiết:** Open-Meteo Historical Weather (ERA5), ghi nguồn CC BY 4.0.
4. **Baseline mô hình:** CAMS Global qua Open-Meteo, so với trạm. Không đưa giá trị CAMS vào cột nhãn.
5. **Kiểm tra ngoài Hà Nội:** HealthyAir, TP.HCM, tách riêng khỏi tập train Hà Nội.
6. **Bản đồ:** lưới năm V5.GL.04 cho so sánh dài hạn đến năm 2022; Sentinel-5P cho điểm nóng NO2 và aerosol. Google Air Quality API chỉ khi ứng dụng cần lưới 500 m và có billing.
7. **Demo hiện tại:** WAQI cho AQI tức thời và bản đồ. Không lưu thành tập train và không phân phối lại.

Việc chưa làm trong lần rà này: chưa gọi OpenAQ vì chưa có API key, chưa tải lại các CSV. Số khoảng trống của file Kaggle là kết quả kiểm tra file hiện tại của nhóm; file đó không nằm trong repo.

## Bộ dữ liệu

### 1. OpenAQ API v3 và kho AWS

Nguồn đúng cho nhãn thực đo. API v3 yêu cầu header `X-API-Key`. Giấy phép không có một giấy chung: `GET /v3/licenses` trả về từng giấy, gồm quyền thương mại, ghi nguồn, share-alike, sửa và phân phối lại. Phải lưu `license id` theo từng location trước khi công bố mô hình.

Kho công khai không cần tài khoản AWS, vùng `us-east-1`, cờ `--no-sign-request`:

`s3://openaq-data-archive/records/csv.gz/locationid={id}/year={YYYY}/month={MM}/location-{id}-{YYYYMMDD}.csv.gz`

Mỗi file là một ngày của một location, dạng hẹp: `location_id`, `sensor_id`, `location`, `datetime`, `lat`, `lon`, `parameter`, `unit`, `value`. Thông số có thể là PM2.5, PM10, NO2, O3 hoặc thông số khác tùy trạm. File được ghi khoảng 72 giờ sau nửa đêm theo múi giờ trạm và có thể được vá sau.

Việc kế tiếp là liệt kê location Hà Nội còn PM2.5 trong cửa sổ dự án, đo tỉ lệ giờ thiếu của từng trạm, rồi mới tải kho AWS. Chưa có bảng location id trong repo.

- Tài liệu API: https://docs.openaq.org/
- Giấy phép: https://docs.openaq.org/resources/licenses
- Kho AWS: https://docs.openaq.org/aws/about

### 2. Hanoi PM2.5 + Weather 2024–2026

Bộ dễ mở nhất để dựng pipeline, chưa đủ để làm kết quả báo cáo.

| Mục | Giá trị trên thẻ dữ liệu |
| --- | --- |
| Địa chỉ | https://www.kaggle.com/datasets/diabolicfox/hanoi-air-quality-pm2-5-weather-data-2024-2026 |
| Dòng | 14.451 |
| Cửa sổ | 14/02/2024 đến 26/01/2026 |
| Cột | PM2.5, 7 biến thời gian, 7 lag/rolling, 15 biến thời tiết |
| PM2.5 trung bình | 35,92 µg/m³ |
| Giấy phép gói | CC0 |
| Nguồn khai báo | PM2.5 từ OpenAQ và WAQI; thời tiết từ Open-Meteo ERA5 |

Thẻ ghi không có giá trị thiếu và lag đã được shift đúng. Điều đó chỉ đúng bên trong các dòng hiện có. Trục thời gian không liên tục.

Nếu chuỗi đủ mọi giờ từ 2024-02-14 00:00 đến 2026-01-26 23:00 thì có **17.112** mốc. File thiếu khoảng **2.661** giờ, độ phủ khoảng **84,5%**. Kiểm tra file hiện tại thấy **98** khoảng trống, khoảng lớn nhất **860** giờ (khoảng 35,8 ngày). Lag 1, lag 24, lag 168 và rolling 7 ngày tính trên bảng đã bỏ giờ trống sẽ nhảy qua các khoảng đó.

Cách dùng:

- Đặt `datetime` làm index, gọi `asfreq("h")`, để giờ thiếu thành giá trị rỗng.
- Tính lại lag và rolling trên trục đã đủ giờ.
- Bỏ mọi dòng huấn luyện mà cửa sổ lag cắt qua giờ rỗng. Không nội suy khoảng trống dài để tạo nhãn.
- Khoảng trống ngắn, nếu có nội suy, phải ghi rõ ngưỡng trong báo cáo.
- Không commit CSV này vào repo khi phần PM2.5 còn lẫn WAQI. Điều khoản WAQI cấm phân phối lại dữ liệu đã lưu.

### 3. Hanoi Air Quality Dataset trên Zenodo

Bộ ngày cho một điểm Hà Nội, không phải trạm.

| Mục | Giá trị |
| --- | --- |
| Bản ghi | https://zenodo.org/records/18673906 |
| DOI | https://doi.org/10.5281/zenodo.18673906 |
| Bản Kaggle cùng nội dung | https://www.kaggle.com/datasets/nitirajkulkarni/hanoi-vn-1581130 |
| Cửa sổ | 01/08/2022 đến 18/02/2026 |
| Tần suất | Ngày. File CSV khoảng 225 KB, không phải chuỗi giờ |
| Biến | PM2.5, PM10, CO, NO2, SO2, O3, AOD, bụi, US AQI, European AQI, metadata thành phố |
| Giấy phép gói | CC0 |
| Nguồn | Open-Meteo, domain `cams_global` |

CAMS Global trên Open-Meteo có lưới khoảng 0,4° (khoảng 45 km) và bước gốc 3 giờ. Một chuỗi ngày tại một tọa độ không tách được các quận. Một số ngày đầu đang rỗng và cần loại khi đọc file; lần rà này chưa tải lại CSV để đếm số ngày đó.

Dùng để xem mức CAMS theo ngày hoặc làm baseline thô. Không dùng làm nhãn thực đo. Khi công bố, ghi cả Open-Meteo và Copernicus dù gói Zenodo là CC0. Metadata thành phố đi từ GeoNames, cũng cần ghi nguồn.

### 4. Vietnam Air Quality Forecasting

Mô tả đưa vào đợt rà: CSV Hà Nội, Hải Phòng, Đà Nẵng và TP.HCM, mỗi thành phố khoảng 17.521 giờ trong 2023–2024, biến thời tiết cùng PM2.5, PM10, NO2, O3, giấy phép MIT, toàn bộ lấy từ Open-Meteo.

Lần rà này chưa tìm thấy URL công khai đúng bộ đó. Hai năm lịch 2023–2024, tính đến 2024-12-31 23:00, có **17.544** giờ vì 2024 là năm nhuận. 17.521 giờ thiếu 23 giờ so với chuỗi đủ, nên mô tả “gần đủ hai năm” là hợp lý, nhưng cần gắn file trước khi train.

Nếu đúng là Open-Meteo thì đây là dữ liệu mô hình, cùng độ phân giải khoảng 45 km. MIT của file bọc không thay CC BY 4.0 của Open-Meteo và Copernicus. Hợp để thử mô hình đa thành phố khi mọi thành phố cùng một nguồn và báo cáo nói rõ đó là CAMS. Không hợp để kết luận mô hình dự báo được số đo trạm ở bốn thành phố.

### 5. CAMS Global Reanalysis EAC4

Phù hợp xu hướng dài hạn miền Bắc, không phù hợp dự báo theo giờ ở nội thành.

| Mục | Giá trị |
| --- | --- |
| Trang | https://ads.atmosphere.copernicus.eu/datasets/cams-global-reanalysis-eac4 |
| Cửa sổ | 2003–2025 |
| Lưới | 0,75° × 0,75°, khoảng 80 km |
| Bước thời gian | 3 giờ |
| Định dạng | GRIB, có thể đổi NetCDF |
| Giấy phép | CC BY |
| Cập nhật | Khoảng hai lần mỗi năm, trễ 4–6 tháng |
| PM2.5 | `particulate_matter_2.5um` (`pm2p5`), đơn vị kg/m³ |

Đổi sang µg/m³ bằng cách nhân 10⁹. Ở vĩ độ Hà Nội, một ô phủ cả thành phố và các tỉnh kề, nên không tách quận. Cần tài khoản Atmosphere Data Store. Chỉ tải biến bề mặt cần dùng, không tải toàn bộ khí và mức thẳng đứng.

### 6. NASA MERRA-2 M2T1NXAER

Dùng cho mùa, bụi đường dài và cháy sinh khối. Không có trường PM2.5 làm sẵn.

| Mục | Giá trị |
| --- | --- |
| Catalog | https://www.earthdata.nasa.gov/data/catalog/ges-disc-m2t1nxaer-5.12.4 |
| Collection | `tavg1_2d_aer_Nx`, phiên bản 5.12.4 |
| Cửa sổ | 1980 đến hiện tại, trễ khoảng 3 tuần sau khi hết tháng |
| Lưới | 0,5° × 0,625° |
| Bước thời gian | Trung bình từng giờ, mốc giữa giờ (00:30 UTC, 01:30 UTC, …) |

Công thức khô, theo Buchard và cộng sự (2017), các thành phần đang là kg/m³:

`PM2.5 = (DUSMASS25 + OCSMASS + BCSMASS + SSSMASS25 + SO4SMASS × 1,375) × 1e9`

Hệ số 1,375 đổi sulfate ion sang ammonium sulfate. Bản có độ ẩm trong tài liệu GEOS nhân thêm hệ số tăng trưởng theo RH cho carbon, muối biển và sulfate; bụi không nhân hệ số đó. Hệ số độ ẩm nằm trong tài liệu bổ sung của GMAO, không có sẵn thành một cột.

Lưới vẫn khoảng 55–65 km. Kết quả là tái phân tích aerosol, không phải số đo lề đường.

### 7. Global Annual PM2.5 Grids V5.GL.04

Đúng việc lập bản đồ và so sánh dài hạn Hà Nội, Bắc Ninh, Hải Phòng, Quảng Ninh. Sai việc dự báo theo giờ.

| Mục | Giá trị |
| --- | --- |
| DOI | https://doi.org/10.7927/as2r-9p42 |
| Catalog | https://www.earthdata.nasa.gov/data/catalog/sedac-ciesin-sedac-sdei-gwrpm25-mmsvaod-5gl04-5.04 |
| Khoa học | https://sites.wustl.edu/acag/satpm/surface-pm-archive/ |
| Cửa sổ | Trung bình năm 1998–2022. Nguồn gốc cũng có trung bình tháng |
| Lưới | 0,01° ở bản NetCDF khoa học; SEDAC còn bản 0,1°. GeoTIFF và NetCDF |
| Cách tạo | AOD vệ tinh, GEOS-Chem, rồi hiệu chỉnh bằng đo mặt đất (GWR) |
| Đơn vị | µg/m³ |

Nhóm tác giả nói lưới 0,01° không tách hết gradient địa phương vì nguồn đầu vào thô hơn. Chuỗi dừng năm 2022 nên không phủ cửa sổ dự báo 2024–2026. Kho SatPM đã có thế hệ V6; lần này chỉ chốt V5.GL.04 như yêu cầu. Khi vẽ bản đồ thì trích Việt Nam hoặc miền Bắc, không kéo cả lưới toàn cầu vào git.

### 8. Sentinel-5P NO2 và Aerosol Index

Đặc trưng không gian và bản đồ điểm nóng từ giữa năm 2018. Không phải PM2.5 mặt đất.

| Sản phẩm | Collection Earth Engine | Có từ |
| --- | --- | --- |
| NO2 offline | `COPERNICUS/S5P/OFFL/L3_NO2` | 28/06/2018 |
| UV Aerosol Index offline | `COPERNICUS/S5P/OFFL/L3_AER_AI` | 04/07/2018 |

Ô lưới khoảng 1.113 m. NO2 dùng cho phân tích là cột tầng đối lưu, đơn vị mol/m², không phải nồng độ µg/m³ sát mặt đất. AAI không thứ nguyên; giá trị dương chỉ aerosol hấp thụ UV như bụi và khói. Vệ tinh không cho chuỗi giờ đều, và NO2 phụ thuộc mây. Bản offline phù hợp nghiên cứu hơn bản gần thời gian thực. Lọc QA theo hướng dẫn collection: khoảng 75% cho cột NO2 tầng đối lưu và 80% cho AER_AI. Giữ giá trị cột âm nhỏ; chỉ loại outlier dưới −0,001 mol/m².

Ghi nguồn Copernicus. Dùng làm lớp Google Earth hoặc đặc trưng ngày, rồi căn giờ sang chuỗi giờ của trạm. Không đổi AAI thành PM2.5 bằng một hệ số cố định.

### 9. HealthyAir, TP.HCM

Bộ thực đo tốt để kiểm tra mô hình ngoài Hà Nội, không phải tập bổ sung cho Hà Nội.

| Mục | Giá trị |
| --- | --- |
| Dữ liệu | https://data.mendeley.com/datasets/pk6tzrjks8/1 |
| DOI | https://doi.org/10.17632/pk6tzrjks8.1 |
| Bài mô tả | https://doi.org/10.1016/j.dib.2022.108774 |
| Tên trên kho | “HelthyAir” |
| Quy mô | 52.549 bản ghi, 6 trạm, giữa 02/2021 đến giữa 06/2022 |
| Biến | PM2.5, TSP, SO2, O3, NO2, CO, nhiệt độ, độ ẩm |
| Bối cảnh trạm | Giao thông, dân cư, công nghiệp |

Bài Data in Brief phát hành theo CC BY 4.0. Nên xem lại giấy phép của chính file trên Mendeley trước khi đóng gói lại. Dữ liệu phút đã được quy về giờ; CO, SO2, NO2 gốc theo ppm và O3 theo ppb, bản công bố đã đổi sang µg/m³. Khí hậu, nguồn thải và giai đoạn khác Hà Nội 2024–2026. Đánh giá transfer trên tập này phải báo cáo riêng, không trộn vào tập test Hà Nội.

## API

### Open-Meteo Air Quality

Dùng khi cần một chuỗi tại tọa độ bất kỳ ở miền Bắc, từ 08/2022, không cần key.

- Tài liệu: https://open-meteo.com/en/docs/air-quality-api
- Giấy phép API: CC BY 4.0, https://open-meteo.com/en/license
- Bắt buộc có link kiểu “Weather data by Open-Meteo.com” chỗ hiển thị số liệu
- Trang API còn nút non-commercial / commercial / self-hosted. Đọc lại mục đó trước khi gắn vào sản phẩm thu phí
- Việt Nam nằm ngoài miền CAMS châu Âu. Gọi `domains=cams_global`
- Lưới toàn cầu khoảng 0,4° và bước gốc 3 giờ. Chuỗi giờ API trả về có thể đã được nội suy, không phải quan trắc từng giờ
- Dự báo trên API tối đa 7 ngày. `past_days` chỉ lùi tối đa 92 ngày; lịch sử dài dùng `start_date` và `end_date`
- Thời tiết ERA5 là API khác, không nằm trong các biến chất lượng không khí

Endpoint dạng `https://air-quality-api.open-meteo.com/v1/air-quality`.

### OpenAQ API v3

Dùng để chọn trạm, xem đơn vị, cảm biến, giấy phép và khoảng thời gian còn số liệu. Khóa gửi bằng `X-API-Key`. Sau khi đã chốt `location id`, lịch sử dài nên lấy từ kho AWS thay vì phân trang toàn bộ measurement. Chi tiết ở mục bộ dữ liệu 1.

### WAQI API

Dùng cho AQI hiện tại, widget và demo bản đồ. Không dùng làm kho huấn luyện.

- Điều khoản API: https://aqicn.org/api/tos/
- Dữ liệu lịch sử: https://aqicn.org/data-platform/tos/
- Cần token. Quota mặc định khoảng 1.000 request mỗi phút, burst khoảng 60
- Cấm bán, cấm đưa vào ứng dụng trả phí, cấm phân phối lại dưới dạng bản cache hoặc archive
- Phải ghi World Air Quality Index Project và cơ quan nguồn
- Số lịch sử trên nền tảng dữ liệu chưa được thẩm định đầy đủ và có thể bị sửa

### Google Air Quality API

Đúng lúc ứng dụng cần lưới khoảng 500 m, heatmap, chỉ số Việt Nam và lời khuyên sức khỏe. Không đủ làm tập lịch sử của project.

- Tổng quan: https://developers.google.com/maps/documentation/air-quality/overview
- Chỉ số địa phương: https://developers.google.com/maps/documentation/air-quality/laqis
- Mã `vnm_vea` là AQI (VN), tính từ O3, CO, SO2, NO2, PM10, PM2.5. Các bậc trên tài liệu: 0–50 tốt, 51–100 trung bình, 101–150 kém, 151–200 xấu, 201–300 rất xấu, 301–500 nguy hại
- Lịch sử tối đa 30 ngày (720 giờ). Dự báo tối đa 96 giờ
- Cần Google Cloud và billing
- Điều khoản sử dụng hẹp: định tuyến theo chất lượng không khí, hoặc chỉ số rủi ro môi trường và nghiên cứu tương quan. Cache điều kiện hiện tại và dự báo chỉ được giữ khoảng một giờ
- https://cloud.google.com/maps-platform/terms/maps-service-terms

### Copernicus ADS API

Dùng khi cần CAMS đúng lưới và đúng file gốc, thay vì điểm nội suy của Open-Meteo. Tài khoản ADS, chấp nhận CC BY, rồi xử lý GRIB hoặc NetCDF. Phù hợp EAC4 và dự báo thành phần khí quyển toàn cầu. Nặng hơn Open-Meteo nhiều, nên chỉ tải ô miền Bắc và biến bề mặt đã chọn.

- EAC4: https://ads.atmosphere.copernicus.eu/datasets/cams-global-reanalysis-eac4
- Dự báo toàn cầu: https://ads.atmosphere.copernicus.eu/datasets/cams-global-atmospheric-composition-forecasts

## Việc cần chốt trước khi train

1. Lập bảng trạm OpenAQ ở Hà Nội: location id, thông số, đơn vị, ngày bắt đầu, ngày kết thúc, giấy phép, tỉ lệ giờ thiếu.
2. Tải file Kaggle số 2, dựng `asfreq("h")`, đo lại 98 khoảng trống và khoảng 860 giờ, tính lại lag trên trục mới.
3. Chia test theo các tháng cuối của trục giờ đã dựng. Không chia ngẫu nhiên.
4. Giữ một cột nguồn trên mọi bảng: `station`, `cams_global`, `era5`, `merra2`, `sentinel5p`. Metric chính chỉ tính trên `station`.
5. Gắn link bộ bốn thành phố nếu nhóm còn file, rồi ghi rõ nó là CAMS.
6. Không đưa CSV thô, khóa API hay token vào git.
