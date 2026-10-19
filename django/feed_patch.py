# Лента постов v2 — остров React (главная, затем рубрики и разделы). Бэк — api/feed/, параллельно
# старому (archive POST method=get-posts, postinger, Post.get_posts не трогаем).
#
# Перенесено: главная Альтерлита, Литпоток, рубрики (в том числе «Конкурсы» целиком), рецензии на
# публикацию, лента профиля и рецензии профиля.
#
#   GET /api/v1/feed/?section=index               — первая страница + блоки над лентой + права смотрящего
#   GET /api/v1/feed/?section=index&before=<id>   — следующая (id последнего показанного поста)
#   GET /api/v1/feed/?section=category:litpotok   — Литпоток (/archive/category/litpotok/): стихи и проза
#   GET /api/v1/feed/?section=category:<slug>     — рубрика /archive/category/<slug>/;
#                                                   category:konkursy — все подрубрики «Конкурсов»
#   GET /api/v1/feed/?section=reviews:<post_id>   — рецензии на публикацию (/archive/reviews/<id>/)
#   GET /api/v1/feed/?section=profile:<username>  — публикации пользователя (/profile/<username>/):
#       свой профиль — все статусы, кроме «отказано», и отложенные; is_staff в чужом — «опубликовано»,
#       «в профиле», «на модерации», «скрыта» (и отложенные); остальные — «опубликовано», «в профиле».
#       Рецензий в этой ленте нет.
#   GET /api/v1/feed/?section=profile:<username>:reviews — рецензии пользователя (?posts=reviews):
#       «опубликовано» и «опубликовано в профиле» для всех.
#       → {"posts": [...], "more": bool, "viewer": {...},
#          на первой странице: "blocks": [...] (главная), "section": {"name", "title"}}
#   Сайт — request.mode. 404 {"code": "not_migrated"} — раздел ещё не перенесён (главная AltCG и др.);
#   404 {"code": "not_found"} — рубрики нет, она другого сайта или картиночная (/archive/images/);
#   нет публикации (рецензии) или пользователя (профиль).
#
# Отличия от старого:
#   • правила разделов — в одном месте (sections.py), а не ветками postinger/get_posts;
#   • курсор по (date, id): посты с одинаковой датой на стыке страниц не теряются и не дублируются;
#   • рубрики — подзапросом EXISTS вместо JOIN + distinct();
#   • счётчики лайков/комментариев/рецензий — 4 агрегирующих запроса на страницу, а не загрузка
#     всех комментариев и лайков каждого поста ради len();
#   • блоки главной — одна реализация (blocks.py) вместо двух копий; типизированный JSON вместо
#     «фальшивых» Post(title="iod", …).
#
#   • только данные, без HTML: старые get_name_html, get_category_html, scope_avatar.html, get_date,
#     get_excerpt не вызываются. Их правила перенесены сюда (отметки у имени, фильтр рубрик) и на
#     клиент (вид имени, круг Ярмарки тщеславия, «Сегодня в 11:55» из ISO-даты).
#   • случайные цитаты (ears) — без ORDER BY RAND(): список id постов с цитатой кэшируется на
#     15 минут (Django cache), 6 случайных выбираются в Python и забираются по pk; ear__gt=''
#     вместо exclude(ear='') — пустые NULL-цитаты не попадут. Если в CACHES стоит DummyCache,
#     список будет собираться на каждый заход, как раньше.
#
# Права смотрящего (viewer): id, is_staff, can_change, can_delete, can_add (can_hide больше нет).
#
# Подключение: пакет api/feed/ (п. 1–6), в api/urls.py — path('feed/', include('api.feed.urls')),
# в INSTALLED_APPS не добавлять. Места «ПРОВЕРЬТЕ» — допущения, которые нужно сверить с кодом.

# ── 1. api/feed/__init__.py — пустой файл ───────────────────────────────────


# ── 2. api/feed/sections.py ─────────────────────────────────────────────────
"""
Разделы ленты — ЕДИНСТВЕННОЕ место, где описано, какие посты попадают в каждый раздел.

Имя раздела (параметр section):
    index              — главная Альтерлита (как postinger в archive(type="index"));
    category:<slug>    — рубрика /archive/category/<slug>/;
    category:litpotok  — Литпоток (/archive/category/litpotok/): стихи и проза; то же — litpotok;
    category:konkursy  — все подрубрики «Конкурсов» (parent = konkursy) и сама рубрика;
    reviews:<post_id>  — рецензии на публикацию (/archive/reviews/<post_id>/);
    profile:<username> — публикации пользователя (/profile/<username>/), статусы — по смотрящему;
    profile:<username>:reviews — его рецензии (/profile/<username>/?posts=reviews).
Везде новые сверху, по дате.
Остальные (главная AltCG, «Мимо главной», избранное, автор, теги…) добавляются сюда же.
"""
from django.contrib.contenttypes.models import ContentType
from django.db.models import Exists, OuterRef, Q
from django.utils import timezone as tz

from blog.models import Post

PAGE_SIZE = 21  # settings.POSTS_LIMIT

# Главная Альтерлита (postinger): проза, стихи, IMHOch, Fresh Trash и т. д. + блоги с флагом «на главную»
INDEX_ALTERLIT_CATEGORIES = [3, 4, 6, 7, 44, 54, 59]
BLOG_CATEGORY = 10

# Литпоток — стихи и проза
LITPOTOK_CATEGORIES = [6, 7]
# Рубрика, у которой лента — посты всех её подрубрик (и её самой)
PARENT_SECTIONS = {'konkursy'}

SITES = {'alterlit': ['AL', 'ALL'], 'altcg': ['ALT', 'ALL']}
# Типы публикаций в лентах: везде — обычные и Ярмарка тщеславия; рецензии — только в своих
# разделах (рецензии на публикацию и рецензии профиля). «Опубликовано в профиле» видно только
# в профиле автора.
FEED_POST_TYPES = ['post', 'story']
REVIEW_POST_TYPES = ['review']
ARCHIVE_STATUSES = ['published']


# Профиль: что видно в ленте автора. «Отказано в публикации» (rejected) — никому.
PROFILE_STATUSES_OWN = ['published', 'profile', 'draft', 'moderate', 'hidden']   # свой профиль
PROFILE_STATUSES_STAFF = ['published', 'profile', 'moderate', 'hidden']          # is_staff в чужом
PROFILE_STATUSES_OTHERS = ['published', 'profile']                               # остальные и гости


class SectionNotFound(Exception):
    """Раздел есть, но такой рубрики нет (или она не этого сайта) — 404 «не найдено»,
    в отличие от «раздел ещё не перенесён»."""


class Section:
    """Описание раздела: какие посты, с каких сайтов, какие блоки над лентой."""

    def __init__(self, name, sites, post_types, statuses, where, blocks_param=None, title=None,
                 future=False):
        self.name = name
        self.future = future              # показывать отложенные (дата в будущем) — свой профиль, staff
        self.title = title                # заголовок раздела (рубрика) — для страницы
        self.sites = sites                # Post.site
        self.post_types = post_types      # Post.post_type
        self.statuses = statuses          # Post.status
        self.where = where                # функция () -> Q с правилами раздела (рубрики и т. п.)
        self.blocks_param = blocks_param  # ключ в SiteParams "index_fixed_blocks"

    def queryset(self):
        qs = (Post.objects
              .filter(site__in=self.sites, post_type__in=self.post_types, status__in=self.statuses,
                      author__is_active=True)
              .filter(self.where()))
        return qs if self.future else qs.filter(date__lt=tz.now())


def _in_categories(ids):
    """Есть хотя бы одна из рубрик — подзапросом EXISTS, без JOIN и distinct()."""
    through = Post.category.through
    return Exists(through.objects.filter(post_id=OuterRef('pk'), category_id__in=ids))


def _index_alterlit():
    return Q(_in_categories(INDEX_ALTERLIT_CATEGORIES)) | (Q(_in_categories([BLOG_CATEGORY])) & Q(in_mainpage=True))


SECTIONS = {
    ('index', 'alterlit'): Section(
        'index', sites=['AL', 'ALL'], post_types=FEED_POST_TYPES, statuses=['published'],
        where=_index_alterlit, blocks_param='alterlit',
    ),
}


def _category_section(name, slug, mode):
    """Рубрика по slug. Картиночные рубрики (родитель «images») — это /archive/images/, не посты."""
    from blog.models import Category
    sites = SITES.get(mode, SITES['alterlit'])
    cat = (Category.objects.select_related('parent')
           .filter(slug=slug, site__in=sites).first())
    if cat is None or (cat.parent_id and cat.parent.slug == 'images') or slug == 'images':
        raise SectionNotFound('Рубрика не найдена')
    ids = [cat.id]
    if slug in PARENT_SECTIONS:
        ids += list(Category.objects.filter(parent=cat).values_list('id', flat=True))
    return Section(name, sites=sites, post_types=FEED_POST_TYPES, statuses=ARCHIVE_STATUSES,
                   where=lambda: Q(_in_categories(ids)), title=cat.title)


def _reviews_section(name, post_id, sites):
    """Рецензии на публикацию: опубликованные посты-рецензии с review_of = post_id."""
    target = Post.objects.filter(pk=post_id).values('id', 'title').first()
    if target is None:
        raise SectionNotFound('Публикация не найдена')
    return Section(name, sites=sites, post_types=REVIEW_POST_TYPES, statuses=ARCHIVE_STATUSES,
                   where=lambda: Q(review_of_id=post_id), title=target['title'])


def _profile_section(name, username, reviews, sites, user):
    """Лента профиля. Свой — все статусы, кроме «отказано», и отложенные; staff в чужом — ещё
    «на модерации» и «скрыта»; остальные — «опубликовано» и «опубликовано в профиле».
    Рецензии профиля (?posts=reviews) — «опубликовано» и «опубликовано в профиле» для всех."""
    from django.contrib.auth.models import User
    author = User.objects.filter(username=username, is_active=True).values('id', 'username').first()
    if author is None:
        raise SectionNotFound('Пользователь не найден')
    own = bool(user and user.is_authenticated and user.id == author['id'])
    staff = bool(user and user.is_authenticated and user.is_staff)
    author_id = author['id']
    if reviews:
        return Section(name, sites=sites, post_types=REVIEW_POST_TYPES, statuses=PROFILE_STATUSES_OTHERS,
                       where=lambda: Q(author_id=author_id), title=author['username'])
    statuses = PROFILE_STATUSES_OWN if own else PROFILE_STATUSES_STAFF if staff else PROFILE_STATUSES_OTHERS
    return Section(name, sites=sites, post_types=FEED_POST_TYPES, statuses=statuses,
                   where=lambda: Q(author_id=author_id), title=author['username'], future=own or staff)


def get_section(name, mode, user=None):
    """Раздел по имени. -> Section | None (не перенесён). Рубрики, поста, автора нет — SectionNotFound.
    user — кто смотрит: от него зависят статусы в ленте профиля."""
    if (name, mode) in SECTIONS:
        return SECTIONS[(name, mode)]
    sites = SITES.get(mode)
    if sites is None:
        return None
    if name.startswith('reviews:'):
        post_id = name.split(':', 1)[1]
        if not post_id.isdigit():
            raise SectionNotFound('Публикация не найдена')
        return _reviews_section(name, int(post_id), sites)
    if name.startswith('profile:'):
        parts = name.split(':')
        if len(parts) not in (2, 3) or not parts[1] or (len(parts) == 3 and parts[2] != 'reviews'):
            return None
        return _profile_section(name, parts[1], len(parts) == 3, sites, user)
    if name in ('litpotok', 'category:litpotok'):
        return Section(name, sites=sites, post_types=FEED_POST_TYPES, statuses=ARCHIVE_STATUSES,
                       where=lambda: Q(_in_categories(LITPOTOK_CATEGORIES)), title='Литпоток')
    if name.startswith('category:'):
        slug = name.split(':', 1)[1].strip().lower()
        if not slug:
            return None
        return _category_section(name, slug, mode)
    return None


def page(section, before=None, limit=PAGE_SIZE):
    """Страница раздела, новые сверху. before — id последнего показанного поста (курсор по (date, id):
    посты с одинаковой датой на стыке страниц не теряются и не дублируются). -> (посты, есть ли ещё)."""
    qs = section.queryset()
    if before:
        last = Post.objects.filter(pk=before).values('date').first()
        if last:
            qs = qs.filter(Q(date__lt=last['date']) | Q(date=last['date'], pk__lt=before))
    posts = list(cards_queryset(qs).order_by('-date', '-id')[:limit + 1])
    return posts[:limit], len(posts) > limit


def cards_queryset(qs):
    """То, что нужно карточке, — заранее: автор, рубрики, рецензируемый пост."""
    from django.db.models import Prefetch
    from django.contrib.auth.models import Group
    from blog.models import Category
    return (qs
            .select_related('author', 'author__profile', 'review_of')
            .prefetch_related(
                Prefetch('category', queryset=Category.objects.select_related('parent'), to_attr='v2_category'),
                Prefetch('author__groups', queryset=Group.objects.only('name'), to_attr='v2_groups'),
            ))


POST_CT = None


def post_ct():
    global POST_CT
    if POST_CT is None:
        POST_CT = ContentType.objects.get_for_model(Post)
    return POST_CT


# ── 3. api/feed/cards.py ────────────────────────────────────────────────────
"""
Карточка поста для ленты — всё, что рисует article.post из parts/post_list_v2.html.

Только данные — никакого HTML и старых методов, которые его собирают (get_name_html,
get_category_html, scope_avatar.html, get_date). Имя с отметками, рубрики, круг Ярмарки
тщеславия, «Сегодня в 11:55» рисует клиент по этим данным.

Счётчики — отдельными агрегирующими запросами по списку id (4 коротких запроса на страницу),
а не Prefetch всех комментариев и лайков каждого поста ради len().
"""
import html
import re

from django.db.models import Count
from django.utils.html import strip_tags
from django.utils.text import Truncator

from blog.models import Comment, Like, Post, PostImages

from api.feed.sections import post_ct

RE_VOTE = re.compile(r'/\*vote-(\d+)\*/')
PINNED_NOT_TOGGLE = {39021, 45249}  # закреплённые посты, которые не сворачиваются (как в postinger)


def _first_images(posts):
    """Картинки из текста поста в порядке появления (как api.posts.utils.SelectImages, но
    атрибут ставится всем постам — и тем, где картинок нет)."""
    wanted = {p.id: [int(i) for i in Post.RE_IMAGES.findall(p.content or '')] for p in posts}
    ids = {i for lst in wanted.values() for i in lst}
    images = {img.id: img for img in PostImages.objects.filter(id__in=ids)} if ids else {}
    for p in posts:
        p.v2_images = [images[i] for i in wanted[p.id] if i in images]


def _counts(posts, sites, user):
    """Лайки, комментарии, рецензии и «я лайкнул» — по сайтам ленты (AL+ALL или ALT+ALL)."""
    ids = [p.id for p in posts]
    likes = dict(Like.objects.filter(content_type=post_ct(), object_id__in=ids, like=True, site__in=sites)
                 .values_list('object_id').annotate(c=Count('pk')))
    comments = dict(Comment.objects.filter(content_type=post_ct(), object_id__in=ids, status='published',
                                           site__in=sites, is_banned=False)
                    .values_list('object_id').annotate(c=Count('pk')))
    reviews = dict(Post.objects.filter(review_of_id__in=ids, status__in=['published', 'profile'], site__in=sites)
                   .values_list('review_of_id').annotate(c=Count('pk')))
    liked = set()
    if user and user.is_authenticated:
        liked = set(Like.objects.filter(content_type=post_ct(), object_id__in=ids, like=True, site__in=sites,
                                        user=user).values_list('object_id', flat=True))
    return likes, comments, reviews, liked


def _polls(posts):
    """Опрос в посте — первый шорткод /*vote-N*/ (как фильтр has_voting)."""
    first = {}
    for p in posts:
        m = RE_VOTE.search(p.content or '')
        if m:
            first[p.id] = int(m.group(1))
    if not first:
        return {}
    from voting.models import voteQuestion
    votes = {v.id: v for v in voteQuestion.objects.filter(id__in=set(first.values()))
             .only('title', 'description', 'date_execute')}
    res = {}
    for post_id, vote_id in first.items():
        v = votes.get(vote_id)
        if v:
            # ended — голосование окончено: в карточке кнопка «Результаты» вместо «Голосовать»
            res[post_id] = {'id': v.id, 'title': v.title, 'description': v.description or '', 'url': v.get_url(),
                            'ended': v.is_execute}
    return res


def _image(img):
    """Картинка карточки. Есть размеры (images_patch.py, fill_image_sizes) — новое превью без полей
    (image_card), пропорции и размытая подложка, файл с диска не читается. Нет — как раньше:
    превью 290×210 / 290×340 и ориентация по файлу."""
    w, h = getattr(img, 'width', None), getattr(img, 'height', None)
    if w and h:
        gif = img.image.name.lower().endswith('.gif')
        card = img.image if gif or not hasattr(img, 'image_card') else img.image_card
        return {
            'id': img.id,
            'orientation': 'vertical' if w < h else 'horizontal',
            'width': w,
            'height': h,
            'src': card.url,
            'full': img.image.url,
            # размытое мини-превью тех же пропорций (PreloadImg) — подложка, пока грузится src
            'preload': img.full_preload_webp_url,
        }
    return {
        'id': img.id,
        'orientation': img.orientation(),
        'src': img.thumbnail().url,
        'full': img.image.url,
        'preload': img.image_preload.url,
    }


def _mem_image(img):
    return {
        'id': img.id,
        'orientation': img.orientation(),
        'src': img.mem_url,
        'preload': img.full_preload_webp_url,
    }


RE_SHORTCODE = re.compile(r'/\*(?:vote|audio|file|preorder)-\d+\*/')
RE_ENTITY = re.compile(r'&[\w#]+;')


def _plain(value):
    """Текст без HTML и шорткодов, сущности раскрыты, пробелы схлопнуты."""
    text = RE_SHORTCODE.sub('', strip_tags(value or ''))
    return ' '.join(html.unescape(text).split())


def _excerpt(p):
    """Превью карточки — те же правила, что у шаблона (preview|striptags|strip_shortcodes|truncatechars:240
    или Post.get_excerpt: абзацы — переносами, 40 слов, не длиннее 300 символов)."""
    if p.preview:
        return Truncator(_plain(p.preview)).chars(240)
    text = (p.content or '').replace('<br>', '\n').replace('<br />', '\n').replace('<p>', '').replace('</p>', '\n')
    text = RE_SHORTCODE.sub('', strip_tags(RE_ENTITY.sub(' ', text)))
    text = Truncator(text).words(40, truncate=' ...')
    text = re.sub(r'[\n\r]+', '\n', text)
    return Truncator(text).chars(300).strip()


# ── автор ──────────────────────────────────────────────────────────────────
CHIEF_EDITOR_ID = 79691  # шеф-редактор — красный значок
OWNER_ID = 35717         # владелец сайта — свой значок (achieve_5)
STAFF_TITLE = 'Администрация сайта'  # как в чате и комментариях


def _author_marks(user):
    """Отметки у имени — данными: [{"kind", "title"}]. Подписи — как в чате и комментариях."""
    profile = getattr(user, 'profile', None)
    marks = []
    if user.id == CHIEF_EDITOR_ID:
        marks.append({'kind': 'chief_editor', 'title': 'Шеф-редактор'})
    elif user.id == OWNER_ID:
        marks.append({'kind': 'owner', 'title': 'Владелец сайта'})
    elif user.is_staff:
        marks.append({'kind': 'admin', 'title': STAFF_TITLE})
    if profile is not None and getattr(profile, 'profile_type', None) == 'CLOSED':
        marks.append({'kind': 'closed', 'title': 'Это закрытый аккаунт'})
    if any(g.name == 'antipod' for g in getattr(user, 'v2_groups', [])):
        marks.append({'kind': 'antipod', 'title': 'Финалист конкурса «Антиподы»'})
    return marks


def _author(user):
    profile = getattr(user, 'profile', None)
    nickname = (getattr(profile, 'nickname', None) or '').strip()
    avatar = getattr(profile, 'avatar', None)
    return {
        'id': user.id,
        'username': user.username,
        'nickname': nickname or None,          # есть — имя жирным (u-fname), нет — логин (u-uname)
        'avatar': avatar.url if avatar else None,  # нет — клиент ставит заглушку
        'url': f'/profile/{user.username}/',
        'marks': _author_marks(user),
    }


# ── рубрики ────────────────────────────────────────────────────────────────
SKIP_CATEGORY_SLUGS = {'avtorskie-kolonki', 'konkurs-images', 'projects'}
SKIP_CATEGORY_PARENTS = {'new_critics_releases', 'interview'}


def _categories(post, mode):
    """Рубрики карточки — правила get_category_html: только рубрики своего сайта; «Объявления» —
    единственной рубрикой; служебные и подрубрики интервью/релизов НК не показываем."""
    site = {'ALT', 'ALL'} if mode == 'altcg' else {'AL', 'ALL'}
    res = []
    for c in getattr(post, 'v2_category', []):
        if c.site not in site:
            continue
        kind = 'images' if (c.parent and c.parent.slug == 'images') else 'category'
        item = {'title': c.title, 'url': f'/archive/{kind}/{c.slug}/', 'slug': c.slug}
        if c.slug == 'announcement':
            return [item]
        if c.slug in SKIP_CATEGORY_SLUGS or (c.parent and c.parent.slug in SKIP_CATEGORY_PARENTS):
            continue
        res.append(item)
    return res


def cards(posts, mode, sites, user, pinned=False):
    """Список карточек для JSON."""
    posts = list(posts)
    if not posts:
        return []
    _first_images(posts)
    likes, comments, reviews, liked = _counts(posts, sites, user)
    polls = _polls(posts)

    items = []
    for p in posts:
        images = p.v2_images
        item = {
            'id': p.id,
            'url': p.get_url(),
            'post_type': p.post_type,
            'status': p.status,
            'title': html.unescape(strip_tags(p.title or '')),
            'excerpt': _excerpt(p),
            'date': p.date.isoformat(),
            'author': _author(p.author),
            'categories': _categories(p, mode),
            # Ярмарка тщеславия: аватар в цветном круге, цвет — по первой рубрике (Post.get_author_avatar_html)
            # (у истории без рубрики — '': круг цвета по умолчанию; не история — None)
            'story_category': (cats[0].slug if (cats := getattr(p, 'v2_category', [])) else '')
            if p.post_type == 'story' else None,
            'review_of': {'title': p.review_of.title, 'url': p.review_of.get_url()} if p.review_of_id and p.review_of else None,
            'cover': _image(images[0]) if images and p.gallery_type == 'SN' and p.post_type != 'mem' else None,
            'mem': _mem_image(images[0]) if images and p.post_type == 'mem' else None,
            'poll': polls.get(p.id),
            'flags': {
                'is_gold': p.is_gold,
                'is_recommended': p.is_recommended,
                'is_voiced': bool(p.is_voiced),
                'is_18': bool(p.is_18),
                'from_cm': bool(p.from_cm),
                'drugs_notice': p.drugs_notice in ('text', 'text_icon'),
                'is_pinned': bool(p.is_pinned),
            },
            'counts': {
                'likes': likes.get(p.id, 0),
                'comments': comments.get(p.id, 0),
                'reviews': reviews.get(p.id, 0),
                'liked': p.id in liked,
            },
        }
        if pinned:
            item['pinned'] = True
            item['toggle'] = p.id not in PINNED_NOT_TOGGLE
        items.append(item)
    return items


def viewer(user):
    """Права смотрящего — для меню карточки. is_staff — блок «действия администратора» на чужих
    постах; can_change / can_delete — права Django, которые проверяют ручки правки и удаления."""
    if not user or not user.is_authenticated:
        return {'id': None, 'is_staff': False, 'can_change': False, 'can_delete': False, 'can_add': False}
    return {
        'id': user.id,
        'is_staff': bool(user.is_staff),
        'can_change': user.has_perm('blog.change_post'),
        'can_delete': user.has_perm('blog.delete_post'),
        'can_add': user.has_perm('blog.add_post'),
    }


# ── 4. api/feed/blocks.py ───────────────────────────────────────────────────
"""
Блоки над лентой главной — из SiteParams "index_fixed_blocks" (JSON по сайтам):
    {"alterlit": ["announcement_widget__92399,92359", "iod", "widget1__65"], "altcg": [...]}

Одна реализация вместо двух копий (postinger и Post.get_posts). Каждый блок — типизированный
словарь, без «фальшивых» Post. Не собрался (нет постов, ошибка в параметре) — пропускаем, как раньше.
"""
import html
import logging
import random
import re

from django.core.cache import cache
from django.urls import reverse
from django.utils import timezone as tz
from django.utils.html import strip_tags
from django.utils.text import Truncator

from blog.models import Category, Post, PostImages, SiteParams

from api.feed.cards import _author

logger = logging.getLogger('alterlit')

RE_WIDGET1 = re.compile(r'^widget1__(?P<ids>[^_]*)(?:__title:(?P<title>.*))?$')
RE_PIN = re.compile(r'^pin_post__(\d+)')


def _plain(value, chars):
    return Truncator(html.unescape(strip_tags(value or ''))).chars(chars)


def _announcements(spec):
    ids = [int(i) for i in spec.split('__', 1)[1].split(',') if i.strip().isdigit()]
    posts = {p.id: p for p in Post.objects.filter(id__in=ids).only('date', 'title', 'content', 'preview', 'status')}
    items = [{
        'url': p.get_url(),
        'date': p.date.isoformat(),
        'title': html.unescape(strip_tags(p.title)),
        'text': _plain(p.preview or p.content, 150),
    } for p in (posts.get(i) for i in ids) if p]
    return {'type': 'announcements', 'items': items} if items else None


IOD_CATEGORY = 5  # «Картинка дня»


def _iod(mode):
    """4 последние картинки рубрики «Картинка дня» (запланированные на будущее — не показываем)."""
    items = list(PostImages.objects
                 .filter(category__id=IOD_CATEGORY, date_created__lte=tz.now())
                 .only('image', 'descr', 'date_created').order_by('-date_created')[:4])
    if not items:
        return None
    return {'type': 'iod', 'items': [{
        'id': i.id,
        'src': i.dayimage_thumbnail(),
        'full': i.image.url,
        'preload': i.image_preload.url,
        'href': reverse('archive', kwargs={'type': 'image', 'object_id': i.id}),
        'descr': Truncator(i.descr).chars(140) if (i.descr and mode == 'alterlit') else '',
    } for i in items]}


EARS_LIMIT = 6
EARS_IDS_TTL = 15 * 60  # список постов с цитатами пересобирается раз в 15 минут


def _ears_queryset(sites):
    # ear__gt='' отсекает и пустую строку, и NULL (exclude(ear='') пропустил бы NULL)
    return Post.objects.filter(site__in=sites, status='published', ear__gt='')


def _ears(sites):
    """Случайные цитаты. Без ORDER BY RAND() (перебор всех опубликованных на каждый заход главной):
    id постов с цитатой — из кэша на 15 минут, 6 случайных выбираются в Python и забираются по pk.
    Цитату, которую администратор добавил только что, блок покажет после обновления кэша."""
    key = 'feed:ears_ids:' + ','.join(sorted(sites))
    ids = cache.get(key)
    if ids is None:
        # order_by() — без сортировки по дате из Meta.ordering: нужен только список id
        ids = list(_ears_queryset(sites).order_by().values_list('id', flat=True))
        cache.set(key, ids, EARS_IDS_TTL)
    if len(ids) < 2:
        return None
    picked = random.sample(ids, min(EARS_LIMIT, len(ids)))
    # повторная проверка: за 15 минут цитату могли убрать, а пост — снять с публикации
    posts = {p.id: p for p in (_ears_queryset(sites).filter(id__in=picked)
                               .select_related('author', 'author__profile')
                               .only('ear', 'status', 'title', 'author__username', 'author__profile__nickname'))}
    items = [
        {
            'url': p.get_url(),
            'text': Truncator(html.unescape(strip_tags(p.ear))).words(25),
            # откуда цитата — подпись под ней
            'title': html.unescape(strip_tags(p.title or '')),
            'author': ((getattr(p.author, 'profile', None) and p.author.profile.nickname) or p.author.username).strip(),
        }
        for p in (posts.get(i) for i in picked) if p
    ]
    return {'type': 'ears', 'items': items} if len(items) > 1 else None


def _widget1(spec):
    m = RE_WIDGET1.match(spec)
    ids = [int(i) for i in m.group('ids').split(',') if i.strip().isdigit()]
    if not ids:
        return None
    title = m.group('title') or Category.objects.filter(id=ids[0]).values_list('title', flat=True).first()
    limit = 6
    qs = Post.objects.filter(category__id__in=ids, status__in=['published', 'profile'])
    total = qs.count()
    if total < limit:
        return None
    from api.feed.sections import cards_queryset  # автор с профилем и группами — для отметок у имени
    posts = cards_queryset(qs.order_by('-date'))[:limit]
    return {
        'type': 'widget1',
        'title': title,
        'url': reverse('archive', kwargs={'type': 'category', 'object_id': ids[0]}),
        'posts': [{
            'url': p.get_url(),
            'title': html.unescape(strip_tags(p.title)),
            'date': p.date.isoformat(),
            'author': _author(p.author),
        } for p in posts],
        'more_count': total - limit,
    }


def _pin(spec, mode, sites, user):
    from api.feed.cards import cards
    from api.feed.sections import cards_queryset
    post_id = int(RE_PIN.match(spec).group(1))
    posts = list(cards_queryset(Post.objects.filter(id=post_id)))
    if not posts:
        return None
    return {'type': 'pin', 'post': cards(posts, mode, sites, user, pinned=True)[0]}


def index_blocks(mode, sites, user):
    """Блоки главной сайта в порядке из SiteParams. Блок с ошибкой — пропускается (в лог)."""
    try:
        specs = (SiteParams.get_param('index_fixed_blocks') or {}).get(mode) or []
    except Exception:
        specs = []
    blocks = []
    for spec in specs:
        try:
            if spec.startswith('announcement_widget'):
                block = _announcements(spec)
            elif spec == 'iod':
                block = _iod(mode)
            elif spec == 'ears':
                block = _ears(sites)
            elif RE_WIDGET1.match(spec):
                block = _widget1(spec)
            elif RE_PIN.match(spec):
                block = _pin(spec, mode, sites, user)
            else:
                block = None  # voting__, voting_post__ — в живом шаблоне не выводятся
            if block:
                blocks.append(block)
        except Exception:
            logger.exception('feed: index block %s', spec)
    return blocks


# ── 5. api/feed/views.py ────────────────────────────────────────────────────
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from api.feed.blocks import index_blocks
from api.feed.cards import cards, viewer
from api.feed.sections import SectionNotFound, get_section, page


class FeedView(APIView):
    """
    GET /api/v1/feed/?section=index                — первая страница + блоки над лентой + права смотрящего
    GET /api/v1/feed/?section=index&before=<id>    — следующая страница (id последнего показанного поста)
    GET /api/v1/feed/?section=litpotok             — Литпоток
    GET /api/v1/feed/?section=category:<slug>      — рубрика (category:konkursy — все конкурсы)
    GET /api/v1/feed/?section=reviews:<post_id>    — рецензии на публикацию
    GET /api/v1/feed/?section=profile:<username>   — публикации пользователя (статусы — по смотрящему)
    GET /api/v1/feed/?section=profile:<username>:reviews — его рецензии
        → {"posts": [...карточки], "more": bool, "viewer": {...},
           на первой странице: "blocks": [...] (главная), "section": {"name", "title"}}
    Сайт — по request.mode. 404 {"code": "not_migrated"} — раздел ещё не перенесён (старая лента
    работает как раньше); 404 {"code": "not_found"} — такой рубрики нет.
    """
    authentication_classes = [SessionAuthentication]
    permission_classes = [AllowAny]

    def get(self, request):
        mode = getattr(request, 'mode', 'alterlit')
        try:
            section = get_section(request.query_params.get('section', 'index'), mode, request.user)
        except SectionNotFound as ex:
            return Response({'detail': str(ex) or 'Не найдено', 'code': 'not_found'}, status=404)
        if section is None:
            return Response({'detail': 'Раздел пока не перенесён', 'code': 'not_migrated'}, status=404)
        before = request.query_params.get('before')
        before = int(before) if before and before.isdigit() else None

        posts, more = page(section, before=before)
        data = {
            'posts': cards(posts, mode, section.sites, request.user),
            'more': more,
            'viewer': viewer(request.user),
        }
        if not before:
            data['section'] = {'name': section.name, 'title': section.title}
            if section.blocks_param:
                data['blocks'] = index_blocks(section.blocks_param, section.sites, request.user)
        return Response(data)


# ── 6. api/feed/urls.py ─────────────────────────────────────────────────────
from django.urls import path

from api.feed import views

# в api/urls.py: path('feed/', include('api.feed.urls')),
urlpatterns = [
    path('', views.FeedView.as_view(), name='feed'),
]
