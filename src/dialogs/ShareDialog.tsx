import { useEffect, useRef, useState } from 'react';
import { copyText } from '../clipboard';
import type { Card } from '../types';
import Dialog from './Dialog';
import s from './Dialog.module.css';
import { TelegramIcon, VkIcon, WhatsAppIcon, ZenIcon } from './ShareIcons';

/** «Поделиться» — те же ссылки, что в старом окне (_post_share_action). */
export default function ShareDialog({ card, onClose }: { card: Card; onClose: () => void }) {
  const url = `${window.location.origin}${card.url}`;
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(card.title);
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const linkRef = useRef<HTMLSpanElement>(null);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onCopy = async () => {
    clearTimeout(timer.current);
    if (await copyText(url)) {
      setCopy('copied');
      timer.current = window.setTimeout(() => setCopy('idle'), 2500);
    } else {
      // скопировать не вышло — выделяем ссылку, чтобы скопировать вручную
      setCopy('failed');
      const el = linkRef.current;
      if (el) window.getSelection()?.selectAllChildren(el);
    }
  };

  return (
    <Dialog title="Поделиться" onClose={onClose}>
      <button type="button" className={s.link} data-copied={copy === 'copied' || undefined} onClick={onCopy}>
        <span ref={linkRef} className={s.linkUrl}>
          {url}
        </span>
        <span className={s.linkState} aria-hidden="true">
          {copy === 'copied' ? (
            <svg viewBox="0 0 24 24">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24">
              <rect x="8" y="8" width="11" height="12" rx="2" />
              <path d="M5 15V6a2 2 0 0 1 2-2h8" />
            </svg>
          )}
        </span>
      </button>
      <p className={s.linkHint} data-state={copy} role="status" aria-live="polite">
        {copy === 'copied'
          ? 'Ссылка скопирована в буфер обмена'
          : copy === 'failed'
            ? 'Не удалось скопировать автоматически — ссылка выделена, скопируйте её (Ctrl+C или долгое нажатие)'
            : 'Нажмите на ссылку, чтобы скопировать её'}
      </p>
      <ul className={s.share}>
        <li>
          <a href={`https://vk.com/share.php?url=${u}&title=${t}`} target="_blank" rel="noopener noreferrer">
            <VkIcon />
            <span>ВКонтакте</span>
          </a>
        </li>
        <li>
          <a href={`https://passport.yandex.ru/auth?origin=zen_pubs&retpath=${u}&text=${t}`} target="_blank" rel="noopener noreferrer">
            <ZenIcon />
            <span>Дзен</span>
          </a>
        </li>
        <li>
          <a href={`https://api.whatsapp.com/send?text=${u}&utm_source=share2`} target="_blank" rel="noopener noreferrer">
            <WhatsAppIcon />
            <span>WhatsApp</span>
          </a>
        </li>
        <li>
          <a href={`https://t.me/share/url?url=${u}`} target="_blank" rel="noopener noreferrer">
            <TelegramIcon />
            <span>Telegram</span>
          </a>
        </li>
      </ul>
    </Dialog>
  );
}
