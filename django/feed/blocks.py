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
