# 테스트 코드 작성 명세 (프로젝트 기준)

## 1. 테스트 환경 기본 규칙

*   **런타임:** Node.js 18 (ESM 모드)
*   **테스트 러너:** Jest
*   **트랜스파일러:** ts-jest
*   **실행 환경:** Docker 컨테이너 안에서 실행 (Redis, Backend API 포함)

## 2. Jest 환경 세팅

`package.json`:

```json
{
  "type": "module",
  "jest": {
    "preset": "ts-jest/presets/default-esm",
    "testEnvironment": "node",
    "extensionsToTreatAsEsm": [".ts"]
  }
}
```

**필수 `import`:**
ESM 모드에서는 `jest` 전역 객체가 자동 주입되지 않으므로, 항상 테스트 코드 최상단에 다음을 추가해야 합니다:

```typescript
import { jest } from "@jest/globals";
```

## 3. 테스트 파일 구조

*   **위치:** `backend/tests/*.test.ts`
*   **이름 규칙:**
    *   `*.test.ts` (단위 테스트)
    *   `*.integration.test.ts` (통합 테스트)

*   **계층:**

    ```typescript
    describe("Feature", () => {
      beforeAll() { /* Redis 연결, mock 준비 */ }
      afterAll() { /* 자원 정리 */ }
      beforeEach() { /* 초기 상태 */ }
      afterEach() { /* mock reset */ }

      it("should …", async () => { /* 테스트 로직 */ });
    });
    ```

## 4. Mocking 원칙

*   **외부 API (GCP, YouTube):** `jest.mock`을 사용하여 모듈 전체 대체
*   **Redis/Puppeteer:** `jest.spyOn(redisClient, "method")` 후 더미 응답 반환
*   **파일 입출력:** `fs.unlink`, `fs.readFile` 등은 mock 처리
*   **업로드/이미지:** dummy fixture 파일 사용 (`backend/tests/fixtures/…`)

## 5. 테스트 시나리오 예시

### 단위 테스트 (`report.test.ts`)

*   Redis 연결 확인
*   Report API 호출 시 정상 JSON 리턴
*   Redis에 데이터 없으면 500 반환

### 통합 테스트 (`integration.test.ts`)

*   프로젝트 생성 (`POST /api/projects`)
*   쇼츠 생성 (`POST /api/projects/:id/shorts`) – Mock YouTube 데이터 사용
*   파일 업로드 – 더미 PNG/Mp3 fixture 파일 사용
*   PDF 리포트 요청 (`GET …/report/pdf`) – Puppeteer mock으로 더미 PDF 리턴
*   Redis 작업 검증 (`lPush`, `get` 호출 여부 확인)
