export interface Idea {
  title: string;
  image_prompt: string;
  video_prompt: string;
  caption: string;
  hashtags: string[];
}

export interface PageConfig {
  id: string;
  name: string;
  access_token: string;
  enabled: boolean;
}

export interface PostResult {
  pageId: string;
  pageName: string;
  ok: boolean;
  at: number;
  videoId?: string;
  scheduledAt?: number;
  error?: string;
}

export type JobStatus =
  | "queued" // chờ tạo ảnh
  | "rendering" // Veo đang tạo video
  | "ready" // đã có video, chờ đăng
  | "done" // đã đăng xong
  | "failed";

export interface Job {
  id: string;
  batchId: string;
  createdAt: number;
  updatedAt: number;
  status: JobStatus;
  idea: Idea;
  imageUrl?: string;
  veoOperation?: string;
  videoUrl?: string;
  /** Page sẽ đăng + thời điểm hẹn (ms) nếu có */
  targets: { pageId: string; scheduleAt?: number }[];
  autoPost: boolean;
  posts: PostResult[];
  attempts: number;
  error?: string;
}

export interface Settings {
  channelStyle: string;
  captionLanguage: string;
  auto: {
    enabled: boolean;
    /** Giờ tạo đợt mỗi ngày (giờ VN, 0-23) */
    hour: number;
    perPage: number;
    mode: "distribute" | "same";
    /** Các giờ đăng trong ngày (giờ VN), ví dụ ["11:00", "19:00"] */
    postTimes: string[];
    autoPost: boolean;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  channelStyle: "Video ngắn corgi dễ thương, hài hước, đời thường, ánh sáng đẹp, cảm xúc ấm áp",
  captionLanguage: "vi",
  auto: {
    enabled: false,
    hour: 7,
    perPage: 2,
    mode: "distribute",
    postTimes: ["11:00", "19:00"],
    autoPost: true,
  },
};
