# API Specification: Shorts Report and PDF Generation

This document outlines the API endpoints and data structures for the Shorts Report and PDF Generation features.
It also details the relevant folder structure to ensure correct module resolution.

## 1. Folder Structure and Module Resolution

This section describes the key directories and files involved in the backend and frontend, and how modules are imported.

```
munjero_agent_system/
├── backend/ # Node.js Express Backend
│   ├── server.ts # Main Express application, API routes, Redis interaction
│   ├── index.ts  # Server startup file (imports server.ts)
│   └── tests/    # Backend test files
│       └── report.test.ts
├── services/ # Python services, Puppeteer worker
│   ├── puppeteer_worker/
│   │   ├── worker.js # Puppeteer worker for PDF generation
│   │   └── data/     # Shared volume for generated PDFs
│   └── docs/
│       └── api_spec.md # This document
├── src/ # React Frontend
│   ├── pages/
│   │   └── ShortsReportPage.tsx # Frontend page to display report
│   ├── services/
│   │   └── youtube-shorts-content-factory/projectService.ts # Frontend API calls
│   └── types/
│       └── youtube-shorts-content-factory/types.ts # Shared TypeScript types (Project, Short, ReportData)
├── tsconfig.json # Base TypeScript configuration
├── tsconfig.app.json # Frontend TypeScript configuration
├── tsconfig.node.json # Backend TypeScript configuration
├── docker-compose.test.yml # Docker Compose for test environment
└── package.json # Project dependencies and scripts
```

**Module Import Paths:**

*   **Backend (`server.ts`, `index.ts`):**
    *   Imports from `src/types/`: Use alias `@/src/types/...` (e.g., `import { Project, Short } from '@/src/types/youtube-shorts-content-factory/types';`). This alias is configured in `tsconfig.json` and `jest.config.cjs`.
    *   Internal imports: Use relative paths (e.g., `import app from './server.ts';` in `index.ts`).
*   **Frontend (`.tsx` files):**
    *   Imports from `src/types/`: Use relative paths (e.g., `import { ReportData } from '../types/youtube-shorts-content-factory/types';`).
    *   Internal imports: Use relative paths.
*   **Backend Tests (`report.test.ts`):**
    *   Imports `app` from `../server.ts`.
    *   Imports types from `src/types/` using the alias (`@/src/types/...`).

## 2. Data Models

### 2.1. `Project` (Defined in `src/types/youtube-shorts-content-factory/types.ts`)

```typescript
export interface Project {
  id: string;
  name: string;
  description: string;
  shorts: Short[];
}
```

### 2.2. `Short` (Defined in `src/types/youtube-shorts-content-factory/types.ts`)

```typescript
export interface Short {
  id: string;
  projectId: string;
  title: string;
  description?: string; // Added for report
  status: ShortStatus;
  script: Script; // Contains hook, immersion, body, cta
  metadata: Metadata;
  images?: string[]; // URLs to images for breakdown sections
  titleLine1?: string;
  titleLine2?: string;
  youtubeUrl?: string;
  youtubeViewCount?: string;
  youtubeLikeCount?: string;
  youtubeCommentCount?: string;
  youtubeDuration?: string;
}

export enum ShortStatus { /* ... */ }
export interface Script { /* ... */ }
export interface Metadata { /* ... */ }
```

### 2.3. `ReportData` (Defined in `src/types/youtube-shorts-content-factory/types.ts`)

```typescript
export interface ReportData {
  title: string;
  description: string;
  breakdown: {
    hook: { description: string; imageUrl: string; };
    immersion: { description: string; imageUrl: string; };
    body: { description: string; imageUrl: string; };
    cta: { description: string; imageUrl: string; };
  };
  performance: {
    views: string;
    viewsChange: string;
    bounceRate: string;
    bounceRateChange: string;
    likes: string;
    likesChange: string;
    comments: string;
    commentsChange: string;
    shares: string;
    sharesChange: string;
  };
}
```

## 3. API Endpoints

### 3.1. GET `/api/projects/:projectId/shorts/:shortId/report`

**Description:** Retrieves a detailed report for a specific short, including breakdown sections and performance metrics.

**Request:**
*   **Method:** `GET`
*   **URL Parameters:**
    *   `projectId` (string): The ID of the project.
    *   `shortId` (string): The ID of the short.

**Response:**
*   **Status:** `200 OK`
*   **Body:** `ReportData` object (JSON).
*   **Error Statuses:**
    *   `404 Not Found`: If `projectId` or `shortId` does not exist.
    *   `500 Internal Server Error`: For unexpected server errors.

### 3.2. GET `/api/projects/:projectId/shorts/:shortId/report/pdf`

**Description:** Generates and returns a PDF version of the shorts report.

**Request:**
*   **Method:** `GET`
*   **URL Parameters:**
    *   `projectId` (string): The ID of the project.
    *   `shortId` (string): The ID of the short.

**Response:**
*   **Status:** `200 OK`
*   **Body:** PDF file (`application/pdf`).
*   **Headers:** `Content-Disposition: attachment; filename="<report_title>_report.pdf"`
*   **Error Statuses:**
    *   `404 Not Found`: If `projectId` or `shortId` does not exist.
    *   `500 Internal Server Error`: If PDF generation fails (e.g., Puppeteer error, timeout).

