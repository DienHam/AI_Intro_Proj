# Air Quality Prediction 2026

Dự báo nồng độ PM2.5 ở giờ tiếp theo tại Hà Nội, Việt Nam, kèm bản đồ nhiệt, chatbot hỏi đáp và bản đồ tương tác trên Google Earth. Kết quả dùng để cảnh báo ngắn hạn, không thay thế trạm quan trắc.

## Mục tiêu

- Dự báo PM2.5 tại t+1 từ số đo theo giờ.
- Heatmap nồng độ PM2.5 theo không gian và thời gian.
- Chatbot trả lời câu hỏi về chất lượng không khí và trực quan hóa dữ liệu.
- Phân tích xu hướng theo giờ, ngày, mùa và theo trạm.
- Xuất dữ liệu sang Google Earth để xem tương tác.

## Dữ liệu

Số đo PM2.5 theo giờ của các trạm ở Hà Nội lấy từ [OpenAQ](https://openaq.org/). Thời tiết lấy từ Open-Meteo (ERA5). Nguồn nào được làm nhãn, nguồn nào chỉ là mô hình hoặc bản đồ, nằm trong [docs/nguon-du-lieu.md](docs/nguon-du-lieu.md). Cách tải một năm gần nhất và bộ cột của mô hình nằm trong [docs/plan-crawl.md](docs/plan-crawl.md).

Ban đầu dự án thử trên [Beijing Multi-Site Air Quality](https://archive.ics.uci.edu/dataset/501/beijing+multi+site+air+quality+data) (UCI id 501) để dựng quy trình, sau đó chuyển sang Hà Nội.

## Phương pháp

- Sắp theo thời gian, xử lý giờ thiếu bằng nội suy hoặc bỏ (ghi rõ cách chọn).
- Nhãn là PM2.5 tại t+1.
- Những tháng cuối làm tập test, không chia ngẫu nhiên để tránh rò rỉ giữa các giờ kề nhau.

Ba mô hình so sánh:

1. Baseline: giờ sau bằng giờ này.
2. Hồi quy với lag 1 giờ, lag 24 giờ và tốc độ gió.
3. Gradient boosting trên cùng ba đặc trưng đó.

Metric: MAE và RMSE (µg/m³).

## Trạng thái

Đang trong giai đoạn lên kế hoạch, chưa có code.
