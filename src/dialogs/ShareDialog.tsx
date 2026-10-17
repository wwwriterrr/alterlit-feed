import { useState } from 'react';
import type { Card } from '../types';
import Dialog from './Dialog';
import s from './Dialog.module.css';

/** «Поделиться» — те же ссылки, что в старом окне (_post_share_action). */
export default function ShareDialog({ card, onClose }: { card: Card; onClose: () => void }) {
  const url = `${window.location.origin}${card.url}`;
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(card.title);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard?.writeText(url).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      },
      () => {},
    );
  };

  return (
    <Dialog title="Поделиться" onClose={onClose}>
      <button type="button" className={s.link} onClick={copy}>
        {url}
      </button>
      <p className={s.linkHint}>{copied ? 'Ссылка скопирована в буфер обмена' : 'Если хотите скопировать ссылку, кликните на неё'}</p>
      <ul className={s.share}>
        <li>
          <a href={`https://vk.com/share.php?url=${u}&title=${t}`} target="_blank" rel="noopener noreferrer">
            ВКонтакте
          </a>
        </li>
        <li>
          <a href={`https://passport.yandex.ru/auth?origin=zen_pubs&retpath=${u}&text=${t}`} target="_blank" rel="noopener noreferrer">
            Дзен
          </a>
        </li>
        <li>
          <a href={`https://api.whatsapp.com/send?text=${u}&utm_source=share2`} target="_blank" rel="noopener noreferrer">
            WhatsApp
          </a>
        </li>
        <li>
          <a href={`https://t.me/share/url?url=${u}`} target="_blank" rel="noopener noreferrer">
            Telegram
          </a>
        </li>
      </ul>
    </Dialog>
  );
}
