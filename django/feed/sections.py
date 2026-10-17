"""
Разделы ленты — ЕДИНСТВЕННОЕ место, где описано, какие посты попадают в каждый раздел.
Сейчас перенесена главная Альтерлита (как postinger в archive(type="index")); остальные разделы
(главная AltCG, рубрики, литпоток, «Мимо главной», избранное, автор, теги…) добавляются сюда же.
"""
from django.contrib.contenttypes.models import ContentType
from django.db.models import Exists, OuterRef, Q
from django.utils import timezone as tz

from blog.models import Post

PAGE_SIZE = 21  # settings.POSTS_LIMIT

# Главная Альтерлита (postinger): проза, стихи, IMHOch, Fresh Trash и т. д. + блоги с флагом «на главную»
INDEX_ALTERLIT_CATEGORIES = [3, 4, 6, 7, 44, 54, 59]
BLOG_CATEGORY = 10


class Section:
    """Описание раздела: какие посты, с каких сайтов, какие блоки над лентой."""

    def __init__(self, name, sites, post_types, statuses, where, blocks_param=None):
        self.name = name
        self.sites = sites                # Post.site
        self.post_types = post_types      # Post.post_type
        self.statuses = statuses          # Post.status
        self.where = where                # функция () -> Q с правилами раздела (рубрики и т. п.)
        self.blocks_param = blocks_param  # ключ в SiteParams "index_fixed_blocks"

    def queryset(self):
        return (Post.objects
                .filter(site__in=self.sites, post_type__in=self.post_types, status__in=self.statuses,
                        author__is_active=True, date__lt=tz.now())
                .filter(self.where()))


def _in_categories(ids):
    """Есть хотя бы одна из рубрик — подзапросом EXISTS, без JOIN и distinct()."""
    through = Post.category.through
    return Exists(through.objects.filter(post_id=OuterRef('pk'), category_id__in=ids))


def _index_alterlit():
    return Q(_in_categories(INDEX_ALTERLIT_CATEGORIES)) | (Q(_in_categories([BLOG_CATEGORY])) & Q(in_mainpage=True))


SECTIONS = {
    ('index', 'alterlit'): Section(
        'index', sites=['AL', 'ALL'], post_types=['post', 'story', 'mem'], statuses=['published'],
        where=_index_alterlit, blocks_param='alterlit',
    ),
}


def get_section(name, mode):
    return SECTIONS.get((name, mode))


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
