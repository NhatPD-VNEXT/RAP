# package/ — case data (KHÔNG commit)

Mỗi case RAP = 1 thư mục con, sinh bởi `/rap-new`:

```
package/<CaseName>/
├── docs/      ← BD / spec đầu vào (PDF, MD) — tài liệu khách hàng
├── designs/   ← Coding Design Document (10 mục) — nguồn sự thật cho /rap-gen
├── abap/      ← snapshot class local + manual instruction (sinh bởi /rap-gen)
└── reviews/   ← output /rap-review
```

Toàn bộ nội dung `package/*` bị `.gitignore` (trừ file README này): case chứa tài liệu
nghiệp vụ khách hàng, không đẩy lên GitHub. Muốn version case riêng → tạo repo private
riêng cho `package/<CaseName>/`.
