# Размеры картинок и превью для карточек ленты (blog.PostImages).
#
# Зачем:
#   • в карточке картинка показывается целиком, без пустых полей: старое превью image_thumbnail
#     вписано в 290×210 / 290×340 с прозрачной заливкой (mat_color), а блок картинки на сайте —
#     фиксированной высоты 210/320 с object-fit: contain;
#   • лента заранее знает пропорции — masonry не прыгает, пока картинки грузятся;
#   • orientation() и thumbnail() больше не открывают оригинал с диска на каждую карточку
#     (self.image.width/height у ImageField без сохранённых размеров читает файл).
#
# Только добавления, старый сайт работает как раньше.
#
#   1. blog/models.py — поля, спека, сохранение размеров (п. 1)
#   2. python manage.py makemigrations blog && python manage.py migrate blog
#   3. blog/management/commands/fill_image_sizes.py (п. 2), затем для уже загруженных картинок:
#        python manage.py fill_image_sizes            # все без размеров, пачками по 500
#        python manage.py fill_image_sizes --limit 2000   # попробовать на части
#      Читается только заголовок файла (Pillow), сами картинки не декодируются.


# ── 1. blog/models.py ─────────────────────────────────────────────────────────
# Ниже — фрагменты для class PostImages (1а–1в) и функция image_size (1г) до него.

class PostImages(models.Model):  # фрагменты — добавить в существующий класс

    # 1а. Поля — рядом с date_created:

    # Размеры картинки, как её видит читатель (с учётом поворота EXIF) — после уменьшения
    # в save(). Пусто — ещё не заполнены (fill_image_sizes).
    width = models.PositiveIntegerField("Ширина", null=True, blank=True, editable=False)
    height = models.PositiveIntegerField("Высота", null=True, blank=True, editable=False)

    # 1б. Превью для карточки ленты — рядом с остальными ImageSpecField (импорты там уже есть):
    #     вписано в 560 по ширине (карточка ~280px, ×2 для ретины), без заливки — пропорции как
    #     у оригинала; высота до 1400 — очень вытянутые вертикали не раздуваются.

    image_card = ImageSpecField([Transpose(), ResizeToFit(560, 1400, upscale=False)], source="image",
                                format="WEBP", options={"quality": 82})

    # 1в. save() — заменить: после resize_image записать размеры (update(), без повторного save()):

    def save(self, *args, **kwargs):
        super(PostImages, self).save(*args, **kwargs)
        resize_image(self.image.path, POST_IMAGE_SIZE)
        self.store_size()

    def store_size(self):
        """Ширина и высота файла с учётом поворота EXIF → поля width/height. -> (w, h) | None."""
        size = image_size(self.image.path) if self.image else None
        if size:
            self.width, self.height = size
            PostImages.objects.filter(pk=self.pk).update(width=size[0], height=size[1])
        return size

# 1г. Функция — в blog/models.py до class PostImages:

def image_size(path):
    """(ширина, высота) картинки как её видит читатель: при повороте EXIF 5–8 стороны меняются.
    Pillow читает только заголовок файла. Ошибка (нет файла, не картинка) — None."""
    from PIL import Image
    try:
        with Image.open(path) as im:
            w, h = im.size
            orientation = im.getexif().get(0x0112)
    except Exception:
        return None
    return (h, w) if orientation in (5, 6, 7, 8) else (w, h)


# ── 2. blog/management/commands/fill_image_sizes.py ───────────────────────────
#    (папки management/ и management/commands/ — с пустыми __init__.py, если их ещё нет)

from django.core.management.base import BaseCommand

from blog.models import PostImages, image_size


class Command(BaseCommand):
    help = "Заполнить width/height у картинок, где их нет (читает заголовки файлов пачками)."

    def add_arguments(self, parser):
        parser.add_argument("--batch", type=int, default=500)
        parser.add_argument("--limit", type=int, default=0, help="не больше стольких картинок (0 — все)")

    def handle(self, *args, batch, limit, **options):
        done = failed = 0
        last_id = 0
        while True:
            qs = (PostImages.objects.filter(width__isnull=True, id__gt=last_id)
                  .order_by("id").only("id", "image")[:batch])
            images = list(qs)
            if not images:
                break
            changed = []
            for img in images:
                last_id = img.id
                size = image_size(img.image.path) if img.image else None
                if size:
                    img.width, img.height = size
                    changed.append(img)
                else:
                    failed += 1
            PostImages.objects.bulk_update(changed, ["width", "height"])
            done += len(changed)
            self.stdout.write(f"  …{done} готово, {failed} без файла (последний id {last_id})")
            if limit and done + failed >= limit:
                break
        self.stdout.write(self.style.SUCCESS(f"Готово: {done}, без файла или не картинка: {failed}"))
