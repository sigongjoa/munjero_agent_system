// FIX: Removed circular self-import of `MediaFile` which was causing a conflict with its local declaration.
// --- Types for Classic Editor ---
export type AspectRatio = '1:1' | '9:16' | '16:9';
export type Template = 'classic-dark' | 'mobi-light' | 'exam-korean';

export interface MediaFile {
  id: string;
  file: File;
  objectUrl: string;
  duration?: number;
}

export interface Clip {
  id:string;
  image?: MediaFile;
  audio?: MediaFile;
  subtitle?: string;
  backgroundType: 'image' | 'color';
  backgroundColor: string;
}

export interface ProjectSettings {
  aspectRatio: AspectRatio;
  template: Template;
  topGuideline: number; // percentage
  bottomGuideline: number; // percentage
  ctaGuideline: number; // percentage
  titleLine1: string;
  titleLine1FontSize: number;
  titleLine1StrokeSize: number;
  titleLine2: string;
  titleLine2FontSize: number;
  titleLine2StrokeSize: number;
  subtitleFontSize: number;
  subtitleStrokeSize: number;
  ctaFontSize: number;
  ctaStrokeSize: number;
  ctaText: string;
  examTitle: string;
  examTitleFontSize: number;
  examTitleLine2: string;
  examTitleLine2FontSize: number;
  examName: string;
  examSubject: string;
  examInfoFontSize: number;
}

export type ParsedTextPart = {
  text: string;
  color: string;
};

export interface InitialShortData {
  script: {
    hook: string;
    immersion: string;
    body: string;
    cta: string;
  };
  images: string[];
}

export interface GeneratedClip {
  script: string;
  imagePrompt: string;
}

export interface GeneratedScript {
  title: string;
  cta: string;
  clips: GeneratedClip[];
}


// FIX: Removed incomplete WebCodecs API type declarations.
// These were conflicting with the standard TypeScript DOM library types,
// causing errors due to structural incompatibility (e.g., for EncodedVideoChunk).
// The project uses `/// <reference lib="dom" />`, so the correct types are available globally.

// Add to window object for checks like `if (!window.VideoEncoder)`
declare global {
  interface Window {
    // FIX: Changed WebCodecs types to `any` to avoid compilation errors if the
    // environment's DOM library version does not include these experimental APIs.
    VideoEncoder: any;
    AudioEncoder: any;
    AudioData: any;
  }
}
