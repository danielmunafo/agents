export interface Post {
  id: string;
  content: string;
  author: string;
  authorUrl?: string;
  date: Date;
  engagement: {
    likes: number;
    comments: number;
    shares: number;
  };
  url: string;
  area: string;
}

export interface ScrapedPost {
  content: string;
  author: string;
  authorUrl?: string;
  date: string;
  engagement: {
    likes: number;
    comments: number;
    shares: number;
  };
  url: string;
}
