import type { Author as AuthorT, MarkKind } from '../types';
import { AdminMark, AntipodMark, LockMark, OwnerMark } from '../icons';

export const NO_AVATAR = '/assets/img/noavatar_3.png';

/** Truncator(...).chars(35) — длина вместе с «…». */
const truncate = (s: string, n = 35) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

const MARKS: Record<MarkKind, { cls: string; Icon: (p: { className?: string }) => React.JSX.Element }> = {
  // is_staff — синий значок «Администрация сайта»
  admin: { cls: 'admin-mark', Icon: AdminMark },
  // шеф-редактор — тот же значок, красный (цвет — стили сайта .udaff-mark)
  chief_editor: { cls: 'udaff-mark', Icon: AdminMark },
  // владелец сайта — свой значок (achieve_5)
  owner: { cls: 'sgb-mark', Icon: OwnerMark },
  closed: { cls: 'closed-mark', Icon: LockMark },
  antipod: { cls: 'antipod-mark', Icon: AntipodMark },
};

export const displayName = (a: AuthorT) => a.nickname || a.username;

/** Имя с отметками — как User.get_name_html. */
export function UserName({ author }: { author: AuthorT }) {
  return (
    <a className="user-name" href={author.url} data-username={author.username}>
      {author.nickname ? (
        <b className="u-fname">{truncate(author.nickname)}</b>
      ) : (
        <b className="u-uname">{truncate(author.username)}</b>
      )}
      {author.marks.map(({ kind, title }) => {
        const { cls, Icon } = MARKS[kind];
        return (
          <i key={kind} className={cls} title={title}>
            <Icon />
          </i>
        );
      })}
    </a>
  );
}

/** Цвет круга Ярмарки тщеславия по рубрике истории (parts/scope_avatar.html). */
const STORY_GRADIENTS: Record<string, [string, string, number, number]> = {
  // [цвет 1, цвет 2, offset 1, offset 2]
  ipsum: ['#AB2EE9', '#FF6240', 0, 0.755208],
  blog: ['#3CE977', '#48AAF1', 0.141858, 0.966434],
  stihi: ['#FDEA2C', '#F09000', 0, 0.651603],
  proza: ['#4CAFBF', '#5B48D1', 0, 0.651603],
  freshtrash: ['#93F858', '#21CE51', 0, 0.651603],
  imhoch: ['#E496F7', '#A415C7', 0, 0.651603],
};
const DEFAULT_GRADIENT: [string, string, number, number] = ['#AB2EE9', '#FF6240', 0, 0.651603];

/** Аватар автора истории в цветном круге; круг «дорисовывается» при появлении. */
function StoryAvatar({ id, src, category }: { id: number; src: string; category: string }) {
  const [c1, c2, o1, o2] = STORY_GRADIENTS[category] ?? DEFAULT_GRADIENT;
  return (
    <svg
      className="av av-svg"
      viewBox="0 0 90 90"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      xmlnsXlink="http://www.w3.org/1999/xlink"
    >
      <circle cx="45" cy="45" r="43" fill="#ffffff" />
      <circle
        className="history-circle alp-story-circle"
        cx="45"
        cy="45"
        r="41.5"
        stroke={`url(#paint0_${id})`}
        strokeWidth="4"
        strokeDasharray="262 262"
        strokeLinecap="round"
      />
      <circle cx="45" cy="45" r="37" fill={`url(#pattern_${id})`} />
      <defs>
        <pattern id={`pattern_${id}`} patternContentUnits="objectBoundingBox" width="1" height="1">
          <use xlinkHref={`#image_${id}`} transform="translate(-0.0579427) scale(0.00130208)" />
        </pattern>
        <linearGradient
          id={`paint0_${id}`}
          x1="14.505"
          y1="4.14286"
          x2="73.4564"
          y2="85.9835"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset={o1} stopColor={c1} />
          <stop offset={o2} stopColor={c2} />
        </linearGradient>
        <image
          id={`image_${id}`}
          width="857"
          height="768"
          xlinkHref={src}
          preserveAspectRatio="xMidYMid slice"
        />
      </defs>
    </svg>
  );
}

/** Аватар в карточке: у истории — в круге, у остальных — картинка (Post.get_author_avatar_html). */
export function PostAvatar({ postId, author, storyCategory }: { postId: number; author: AuthorT; storyCategory: string | null }) {
  const src = author.avatar || NO_AVATAR;
  if (storyCategory !== null) return <StoryAvatar id={postId} src={src} category={storyCategory} />;
  return <img className="av" src={src} alt={`user-${author.id}`} />;
}
