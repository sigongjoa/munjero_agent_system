
export interface YouTubeVideoDetails {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnailUrl: string;
  channelTitle: string;
  tags: string[];
  duration: string; // ISO 8601 format
  viewCount: string;
  likeCount: string;
  commentCount: string;
}

export enum ShortStatus {
  IDEA = 'Idea',
  SCRIPTING = 'Scripting',
  DRAFT_GENERATED = 'Draft Generated',
  REVISED = 'Revised',
  UPLOADED = 'Uploaded',
}

export interface Script {
  idea: string;
  draft: string;
  hook: string;
  immersion: string;
  body: string;
  cta: string;
}

export interface Metadata {
  tags: string;
  cta: string;
  imageIdeas: string;
  audioNotes: string;
}

export interface Short {
  id: string;
  projectId: string;
  title: string;
  description?: string; // Added description field
  status: ShortStatus;
  script: Script;
  metadata: Metadata;
  images?: string[];
  titleLine1?: string;
  titleLine2?: string;
  youtubeUrl?: string;
  youtubeViewCount?: string;
  youtubeLikeCount?: string;
  youtubeCommentCount?: string;
  youtubeDuration?: string;
}

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

export interface Project {
  id: string;
  name: string;
  description: string;
  shorts: Short[];
}
