// Ответ GET /api/v1/feed/ — только данные; всю разметку рисует остров.

export type MarkKind = 'admin' | 'chief_editor' | 'owner' | 'closed' | 'antipod';

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
  /** размеры картинки (с учётом поворота EXIF); есть — блок сразу нужных пропорций, src — превью без полей */
  width?: number;
  height?: number;
  src: string;
  full?: string;
  preload: string;
}

export interface Poll {
  id: number;
  title: string;
  description: string;
  url: string;
  /** голосование окончено — кнопка «Результаты» */
  ended?: boolean;
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
    /** стихи — класс poem у карточки */
    is_poem?: boolean;
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
  /** блок «действия администратора» на чужих постах */
  is_staff: boolean;
}

export interface AnnouncementsBlock {
  type: 'announcements';
  items: { url: string; date: string; title: string; text: string }[];
}

export interface IodBlock {
  type: 'iod';
  /** width/height — размеры картинки: блок по самой высокой, остальные по центру */
  items: {
    id: number;
    src: string;
    full: string;
    preload: string;
    href: string;
    descr: string;
    width?: number;
    height?: number;
  }[];
}

export interface EarsBlock {
  type: 'ears';
  /** цитата, ссылка на пост; title и author — подпись «откуда» */
  items: { url: string; text: string; title?: string; author?: string }[];
}

export interface Widget1Block {
  type: 'widget1';
  title: string;
  url: string;
  posts: { url: string; title: string; date: string; author: Author }[];
  more_count: number;
}

export interface PinBlock {
  type: 'pin';
  post: Card;
}

export type Block = AnnouncementsBlock | IodBlock | EarsBlock | Widget1Block | PinBlock;

export interface FeedPage {
  posts: Card[];
  more: boolean;
  viewer: Viewer;
  /** только на первой странице: блоки главной */
  blocks?: Block[];
  /** только на первой странице: имя раздела и заголовок (рубрика, «Литпоток»; у главной — null) */
  section?: { name: string; title: string | null };
}

/** Голосование в посте (шорткод vote-N в тексте): GET/POST /api/v1/voting/<id>/ */
export interface VoteChoice {
  id: number;
  /** свой текст или сущность сайта */
  kind: 'text' | 'post' | 'comment' | 'user';
  text: string;
  url?: string;
  image?: string | null;
  avatar?: string | null;
  mine: boolean;
  /** null — результаты ещё скрыты (не голосовал, голосование идёт) */
  votes: number | null;
}

export interface Vote {
  id: number;
  title: string;
  description: string;
  /** можно выбрать несколько вариантов */
  multiple: boolean;
  /** можно снять свой голос */
  can_revote: boolean;
  ended: boolean;
  date_execute: string | null;
  voted: boolean;
  show_results: boolean;
  total: number;
  /** страница голосования /vote/<id>/ */
  url: string;
  choices: VoteChoice[];
}
