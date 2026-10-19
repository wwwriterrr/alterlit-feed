/**
 * Скопировать текст в буфер обмена. -> удалось ли.
 * navigator.clipboard есть только на защищённых адресах (https, localhost); иначе — запасной
 * способ через выделение во временном поле. Поле кладём в открытое модальное окно, если оно
 * есть: за пределами <dialog showModal> выделение и фокус браузер не даёт.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* запасной способ ниже */
  }
  const host = document.querySelector('dialog[open]') ?? document.body;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  Object.assign(ta.style, { position: 'fixed', top: '0', left: '0', opacity: '0', pointerEvents: 'none' });
  host.append(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}
