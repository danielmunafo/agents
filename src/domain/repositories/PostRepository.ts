import type { Post } from "../entities/Post.js";
import type { Area } from "../value-objects/Area.js";

export interface PostRepository {
  save(
    weekNumber: number,
    year: number,
    area: Area,
    posts: Post[]
  ): Promise<void>;
  load(weekNumber: number, year: number, area: Area): Promise<Post[] | null>;
}
