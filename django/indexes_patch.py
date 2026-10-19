# Индексы для лент (blog.Post, blog.Like). Только добавления в class Meta обеих моделей,
# поведение кода не меняется. Обе модели в приложении blog — одна миграция:
#
#   python manage.py makemigrations blog
#   python manage.py migrate blog
#
# InnoDB строит индексы без блокировки чтения; на таблицах такого размера — секунды.
# Проверить до и после (только чтение):
#
#   from api.feed.sections import get_section
#   s = get_section('category:stihi', 'alterlit')
#   print(s.queryset().order_by('-date', '-id')[:22].explain())
#   # до: Using filesort, rows — десятки тысяч; после: индекс post_status_date, без filesort


# ── 1. blog.Post — добавить в class Meta ──────────────────────────────────────

class Meta:
    ordering = ["-date"]
    get_latest_by = "date"
    verbose_name = "Публикация"
    verbose_name_plural = "Публикации"
    indexes = [
        # Все ленты (главная, рубрики, Литпоток, рецензии): status + сортировка по дате.
        # MySQL читает посты сразу в порядке даты и останавливается, набрав страницу,
        # вместо сортировки всех опубликованных (id в индексе InnoDB есть и так).
        # site и post_type сюда не входят: условие «IN (…)» по ним в середине индекса
        # лишило бы MySQL готового порядка.
        models.Index(fields=["status", "date"], name="post_status_date"),
        # Лента профиля: посты автора по дате (авторы с тысячами публикаций).
        models.Index(fields=["author", "date"], name="post_author_date"),
    ]


# ── 2. blog.Like — добавить в class Meta ──────────────────────────────────────

class Meta:
    verbose_name = 'Лайк'
    verbose_name_plural = 'Лайки'
    indexes = [
        # Число лайков постов страницы (и картинок, комментариев):
        #   content_type + object_id IN (…) + site + like, группировка по object_id.
        # Все условия в индексе — считается по одному индексу, без чтения строк таблицы.
        # Сейчас по одному object_id в выборку попадают и лайки комментариев и картинок
        # с теми же номерами.
        models.Index(fields=["content_type", "object_id", "site", "like"], name="like_object_site"),
        # «Лайкнул ли я» на странице ленты и переключение лайка:
        #   user + content_type + object_id (+ site).
        # Сейчас по индексу user читаются все лайки пользователя.
        models.Index(fields=["user", "content_type", "object_id"], name="like_user_object"),
    ]

# Старый одиночный индекс object_id (db_index=True) после этого не нужен — все запросы идут
# с content_type, — но убирать его не обязательно: лишний индекс только замедляет запись,
# а лайки пишутся редко. Если решите убрать — db_index=False у object_id в той же миграции.
#
# На будущее, не обязательно сейчас: у Comment счётчики лент — content_type + object_id IN (…)
# + status + site + is_banned; там тоже помог бы Index(fields=["content_type", "object_id"]).
