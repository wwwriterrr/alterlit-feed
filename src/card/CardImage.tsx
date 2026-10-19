import { useEffect, useRef, useState } from 'react';
import type { CoverImage } from '../types';

/**
 * Пропорции блока (ширина / высота):
 *   альбомная и квадратная — как у картинки: во всю ширину и высоту, ничего не срезано;
 *   вертикальная — не выше 3:4 (высота ≤ ширина × 4/3), лишнее срезается.
 */
const MIN_RATIO = 3 / 4;

/**
 * Картинка карточки с известными размерами: блок сразу нужной высоты (masonry не прыгает),
 * пока картинка грузится — размытое мини-превью, потом картинка проявляется.
 */
export default function CardImage({
  image,
  extraClass,
  href,
  onOpen,
}: {
  image: CoverImage & { width: number; height: number };
  extraClass: string;
  href: string;
  onOpen: () => void;
}) {
  const own = image.width / image.height;
  const ratio = Math.max(MIN_RATIO, own);
  const ref = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  // из кэша браузера картинка может загрузиться раньше, чем React повесит onLoad
  useEffect(() => {
    if (ref.current?.complete && ref.current.naturalWidth) setLoaded(true);
  }, [image.src]);

  return (
    <div className={`post-image alp-img${extraClass}`} style={{ aspectRatio: ratio }} data-href={href} onClick={onOpen}>
      <img className="alp-img-blur" src={image.preload} alt="" aria-hidden="true" />
      <img
        ref={ref}
        id={`image-${image.id}`}
        className={`alp-img-main${loaded ? ' is-loaded' : ''}`}
        data-fullsrc={image.full ?? image.src}
        data-src={image.src}
        src={image.src}
        width={image.width}
        height={image.height}
        loading="lazy"
        decoding="async"
        alt=""
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
