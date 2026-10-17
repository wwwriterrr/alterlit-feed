// Ответ GET /api/v1/feed/ — только данные; всю разметку рисует остров.

export type MarkKind = 'admin' | 'chief_editor' | 'editor_in_chief' | 'closed' | 'antipod';

export interface Author {
  id: number;
  username: string;
  /** есть — имя жирным (b.u-fname), нет — логин (b.u-uname) */
  nickname: string | null;
  /** нет — заглушка сайта */
  avatar: string | null;
  url: string;
  marks: { kind: MarkKind; title: string }[];
}

export interface Category {
  title: string;
  url: string;
  slug: string;
}

export interface CoverImage {
  id: number;
  orientation: 'horizontal' | 'vertical' | string;
  src: string;
  full?: string;
  preload: string;
}

export interface Poll {
  id: number;
  title: string;
  description: string;
  url: string;
}

export type PostStatus = 'draft' | 'published' | 'moderate' | 'profile' | 'rejected' | 'hidden';

export interface Card {
  id: number;
  url: string;
  post_type: 'post' | 'review' | 'special' | 'story' | 'creative' | 'mem';
  status: PostStatus;
  title: string;
  excerpt: string;
  /** ISO, без пояса — время сервера (Москва) */
  date: string;
  author: Author;
  categories: Category[];
  /** Ярмарка тщеславия: slug первой рубрики — цвет круга вокруг аватара; не история — null */
  story_category: string | null;
  review_of: { title: string; url: string } | null;
  cover: CoverImage | null;
  mem: CoverImage | null;
  poll: Poll | null;
  flags: {
    is_gold: boolean;
    is_recommended: boolean;
    is_voiced: boolean;
    is_18: boolean;
    from_cm: boolean;
    drugs_notice: boolean;
    is_pinned: boolean;
  };
  counts: { likes: number; comments: number; reviews: number; liked: boolean };
  /** закреплённый пост над лентой (блок pin) */
  pinned?: boolean;
  /** сворачивается ли (кнопка-стрелка в шапке) */
  toggle?: boolean;
}

export interface Viewer {
  id: number | null;
  can_change: boolean;
  can_delete: boolean;
  can_add: boolean;
  can_hide: boolean;
}

export interface AnnouncementsBlock {
  type: 'announcements';
  items: { url: string; date: string; title: string; text: string }[];
}

export interface IodBlock {
  type: 'iod';
  items: { id: number; src: string; full: string; preload: string; href: string; descr: string }[];
}

export interface EarsBlock {
  type: 'ears';
  items: { url: string; text: string }[];
}

export interface Widget1Block {
  type: 'widget1';
  title: string;
  url: string;
  posts: { url: string; title: string; date: string; author: Author }[];
  more_count: number;
}

export interface Widget2Block {
  type: 'widget2';
  title: string;
  url: string;
  images: { id: number; src: string; href: string }[];
  more_count: number;
  instruction_url: string | null;
}

export interface PinBlock {
  type: 'pin';
  post: Card;
}

export type Block = AnnouncementsBlock | IodBlock | EarsBlock | Widget1Block | Widget2Block | PinBlock;

export interface FeedPage {
  posts: Card[];
  more: boolean;
  viewer: Viewer;
  /** только на первой странице */
  blocks?: Block[];
}
