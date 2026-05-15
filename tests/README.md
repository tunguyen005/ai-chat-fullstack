# Test Suite — AI Chat (Vitest)

## Cài đặt

```bash
# Từ root project
npm install --save-dev vitest @vitest/coverage-v8 @vitest/ui supertest
```

## Chạy tests

```bash
# Chạy tất cả 1 lần
npm test

# Watch mode (tự chạy lại khi sửa file)
npm run test:watch

# Chỉ unit tests
npm run test:unit

# Chỉ integration tests  
npm run test:integration

# Coverage report (mở browser xem từng dòng)
npm run test:coverage

# UI mode (browser GUI rất đẹp)
npm run test:ui
```

## Cấu trúc tests

```
tests/
├── unit/
│   ├── fileExtractor.test.js    # Test đọc PDF/DOCX/XLSX/CSV/OCR
│   ├── imageGenerator.test.js   # Test detectFlow + image gen patterns
│   └── messageList.test.js      # Test detectExportableContent, langToExt
└── integration/
    └── messageAPI.test.js       # Test REST endpoints với mock DB
```

## Test cases tổng hợp

### fileExtractor (28 test cases)
- PDF: extract text, detect by extension, empty PDF
- DOCX: markdown output, .doc extension
- XLSX: markdown table format, multiple sheets
- CSV: markdown table conversion
- Text files: .txt, .json, .md
- Image OCR: JPEG, PNG via Tesseract
- Unsupported: video/mp4 returns supported=false
- File not found: graceful error
- Truncation: long files bị cắt đúng cách
- buildFileContext: format output, empty input, missing files

### imageGenerator / detectFlow (20 test cases)
- Vision flow: ảnh upload luôn → vision (kể cả text look-alike)
- Vision flow: mixed attachments (PDF + image) → vision
- Imagegen flow: English patterns (generate/create/draw/make)
- Imagegen flow: Vietnamese (tạo ảnh/vẽ)
- Normal flow: chat thường, code questions, "ảnh này" không có attachment
- buildPollinationsUrl: encoding, params, Vietnamese chars
- extractImagePromptFromMessage: positive + negative cases

### messageList (18 test cases)
- langToExt: 19 ngôn ngữ + unknown + empty
- detectExportableContent: code blocks, multiple blocks, tiny blocks ignored
- Exportable: code → yes, long structured → yes, short → no, long unstructured → no

### messageAPI integration (11 test cases)
- GET: valid conv, 404, pagination
- POST: normal flow, empty content 400, auto-create conv, imagegen trigger, vision flow
- DELETE: success, 404

## Coverage target
- Branches: 70%
- Functions: 75%
- Lines: 75%
