## 개발 환경 가이드

### 1. Node & TypeScript 버전

- **Node.js**: v18 이상 (ESM + CommonJS 혼합 지원)
- **TypeScript**: v5.x 이상

### 2. TypeScript 설정 (단일 기준)

모든 환경(`tsconfig.json`, `tsconfig.node.json`, `jest.config.cjs`)은 동일한 규칙을 따라야 한다.

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",

    // CommonJS 패키지(default import 허용)
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,

    // ts-jest + NodeNext 호환성
    "isolatedModules": true,

    // 경로 alias
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    },

    // 품질 옵션
    "strict": true,
    "skipLibCheck": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["backend/**/*.ts", "src/**/*.ts"]
}
```

### 3. 경로 Alias 규칙

- **표준**: `@/*` → `src/*`
- **사용 예시**:
  ```typescript
  import { Project } from "@/types/youtube-shorts-content-factory/types";
  ```
- **금지**: `@/src/...` 같이 중복된 표현

Jest, tsconfig, IDE 모두 이 규칙에 맞춰야 한다.

### 4. Jest 설정

```javascript
/** @type {import('jest').Config} */
module.exports = {
  roots: ["<rootDir>/backend", "<rootDir>/src"],

  transform: {
    "^.+\.(ts|tsx)$": "ts-jest",
  },

  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },

  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  testEnvironment: "node",
  testMatch: [
    "<rootDir>/backend/**/*.test.(ts|js)",
    "<rootDir>/src/**/*.test.(ts|js)"
  ],
  detectOpenHandles: true,
};
```

### 5. CommonJS 패키지 import 규칙

`supertest`, `express`, `cors`, `multer`, `fs`, `path` 등 CJS 기반 패키지는 `esModuleInterop: true` 설정으로 default import 허용.

즉, 다음 방식 사용:

```typescript
import express from "express";
import request from "supertest";
import cors from "cors";
```

`import * as …` 형태는 피한다.

### 6. Docker 환경

- `Dockerfile.backend`에서는 `CMD ["node", "/app/dist/backend/server.js"]` 실행.
- `outDir`은 항상 `./dist`로 설정.
- 빌드 후 결과물은 `/app/dist/...` 구조를 따른다.

### 7. 실행 & 테스트

- **개발 실행**:
  ```bash
  npm run dev
  ```
- **단위 테스트**:
  ```bash
  npm test
  ```
- **Docker 빌드 & 테스트**:
  ```bash
  docker-compose -f docker-compose.test.yml up --build --remove-orphans
  ```

이 문서를 팀 내 표준으로 두면, 더 이상 tsconfig / Jest / Docker가 서로 충돌하지 않습니다.

```