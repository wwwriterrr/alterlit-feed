/**
 * Заглушка карточки, пока грузятся публикации: та же article.post (ширина, отступы, шапка —
 * стили сайта), внутри — полосы на месте автора, картинки, заголовка, текста и счётчиков.
 * Варианты чередуются, чтобы колонки не выглядели одинаково.
 */
const VARIANTS = [
  { image: 'h', lines: 3 },
  { image: null, lines: 4 },
  { image: 'v', lines: 2 },
  { image: null, lines: 3 },
  { image: 'h', lines: 2 },
  { image: null, lines: 5 },
] as const;

export default function Skeleton({ variant = 0 }: { variant?: number }) {
  const v = VARIANTS[variant % VARIANTS.length];
  return (
    <article className="post alp-skel" aria-hidden="true">
      <div className="post-head">
        <h2>
          <span className="alp-skel-bar alp-skel-head" />
        </h2>
      </div>
      <div className="alp-skel-user">
        <span className="alp-skel-bar alp-skel-av" />
        <span className="alp-skel-who">
          <span className="alp-skel-bar" style={{ width: '55%' }} />
          <span className="alp-skel-bar alp-skel-small" style={{ width: '30%' }} />
        </span>
      </div>
      {v.image && <span className={`alp-skel-bar alp-skel-img alp-skel-img-${v.image}`} />}
      <span className="alp-skel-bar alp-skel-title" />
      <div className="alp-skel-text">
        {Array.from({ length: v.lines }, (_, i) => (
          <span key={i} className="alp-skel-bar" style={{ width: i === v.lines - 1 ? '60%' : '100%' }} />
        ))}
      </div>
      <div className="alp-skel-counts">
        <span className="alp-skel-bar" />
        <span className="alp-skel-bar" />
        <span className="alp-skel-bar" />
      </div>
    </article>
  );
}
