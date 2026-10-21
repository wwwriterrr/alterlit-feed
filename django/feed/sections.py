"""
Разделы ленты — ЕДИНСТВЕННОЕ место, где описано, какие посты попадают в каждый раздел.

Имя раздела (параметр section):
    index              — главная Альтерлита (как postinger в archive(type="index"));
    category:<slug>    — рубрика /archive/category/<slug>/ (вместо slug может быть id рубрики);
    category:litpotok  — Литпоток (/archive/category/litpotok/): стихи и проза; то же — litpotok;
    category:konkursy  — все подрубрики «Конкурсов» (parent = konkursy) и сама рубрика;
    favorites          — Избранное (/archive/favorites/all/): опубликованные с is_gold;
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
    """Рубрика по slug или id: /archive/category/stihi/ и /archive/category/65/ (так, по id,
    ссылается «Виджет 1»). Сначала slug — вдруг у рубрики числовой slug, потом id.
    Картиночные рубрики (родитель «images») — это /archive/images/, не посты."""
    from blog.models import Category
    sites = SITES.get(mode, SITES['alterlit'])
    found = Category.objects.select_related('parent').filter(site__in=sites)
    cat = found.filter(slug=slug).first()
    if cat is None and slug.isdigit():
        cat = found.filter(id=int(slug)).first()
    if cat is None or cat.slug == 'images' or (cat.parent_id and cat.parent.slug == 'images'):
        raise SectionNotFound('Рубрика не найдена')
    ids = [cat.id]
    if cat.slug in PARENT_SECTIONS:
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
    if name == 'favorites':
        return Section(name, sites=sites, post_types=FEED_POST_TYPES, statuses=ARCHIVE_STATUSES,
                       where=lambda: Q(is_gold=True), title='Избранное')
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
