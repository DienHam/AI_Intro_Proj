đọc phát biết cài luôn

## 🛠️ Technologies

- React
- Vite
- JavaScript
- React Leaflet
- Leaflet
- Recharts
- Open-Meteo Air Quality API
- CSS

## 📋 Requirements

Trước khi chạy project, cần cài:

- **Node.js**
- **npm**
- Git

Kiểm tra phiên bản:

```bash
node -v
npm -v
git --version
```

Khuyến nghị sử dụng Node.js phiên bản LTS.

## 🚀 Installation

### 1. Clone repository

```bash
git clone <REPOSITORY_URL>
```

Ví dụ:

```bash
git clone https://github.com/DienHam/Air-Quality-Prediction-2026.git
```

Di chuyển vào thư mục project:

```bash
cd Air-Quality-Prediction-2026
```

Nếu project nằm trong một branch cụ thể:

```bash
git checkout dashboard_test
```

Hoặc nếu branch chưa được tải về local:

```bash
git fetch origin
git checkout -b dashboard_test origin/dashboard_test
```

### 2. Cài dependencies

Không cần tự cài React, Vite hay các thư viện khác từng cái một.

Chỉ cần:

```bash
npm install
```

npm sẽ đọc `package.json` và tự động cài các dependencies cần thiết.

Sau khi cài đặt, thư mục `node_modules/` sẽ được tạo tự động.

### 3. Chạy project

```bash
npm run dev
```

Terminal sẽ hiển thị địa chỉ local, ví dụ:

```text
Local: http://localhost:5173/
```

Mở địa chỉ đó trên trình duyệt.

## 🔄 Development

Sau khi chạy:

```bash
npm run dev
```

có thể tiếp tục chỉnh sửa code trong VS Code.

Vite hỗ trợ **Hot Module Replacement (HMR)**, vì vậy khi lưu file:

```text
VS Code
   ↓
Ctrl + S
   ↓
Vite phát hiện thay đổi
   ↓
Browser tự cập nhật
```

Không cần chạy lại `npm run dev` sau mỗi lần sửa code.

## 🧪 Build Production

Để tạo bản build production:

```bash
npm run build
```

Các file build sẽ được tạo trong:

```text
dist/
```

Có thể kiểm tra bản build bằng:

```bash
npm run preview
```

## ⚠️ Troubleshooting

### `npm` không được nhận diện

Kiểm tra:

```bash
node -v
npm -v
```

Nếu không có version, hãy cài Node.js LTS rồi mở lại terminal.

### `npm install` bị lỗi

Thử:

```bash
npm cache verify
npm install
```

Nếu vẫn lỗi, kiểm tra phiên bản Node.js:

```bash
node -v
```

### Localhost không hiển thị

Kiểm tra terminal xem Vite có đang chạy không:

```bash
npm run dev
```

Sau đó mở URL được Vite cung cấp, ví dụ:

```text
http://localhost:5173/
```

### Map không hiển thị

Kiểm tra:

- Browser có Internet không.
- Leaflet đã được cài chưa.
- CSS của Leaflet đã được import.
- Browser Console có báo lỗi JavaScript không.

### API không trả dữ liệu

Kiểm tra Internet và thử mở API endpoint trong trình duyệt.

API trả về JSON là bình thường; endpoint API không phải một trang web có giao diện.

## 🤝 Development Workflow

Khi làm việc nhóm:

```bash
git pull
```

Sau khi chỉnh sửa:

```bash
git add .
git commit -m "Describe your changes"
git push
```

Khuyến nghị tạo branch riêng cho từng feature:

```bash
git checkout -b feature/your-feature
```

Ví dụ:

```bash
git checkout -b feature/areas
```

Sau đó push:

```bash
git push -u origin feature/areas
```

## 🚫 Files Not Committed

Không commit các thư mục/file được tạo tự động:

```text
node_modules/
dist/
```

Các dependency cần thiết được quản lý thông qua:

```text
package.json
package-lock.json
```

Người khác chỉ cần chạy:

```bash
npm install
```

để tạo lại `node_modules`.
