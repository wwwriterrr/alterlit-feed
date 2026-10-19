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
    votes = {v.id: v for v in voteQuestion.objects.filter(id__in=set(first.values())).only('title', 'description')}
    res = {}
    for post_id, vote_id in first.items():
        v = votes.get(vote_id)
        if v:
            res[post_id] = {'id': v.id, 'title': v.title, 'description': v.description or '', 'url': v.get_url()}
    return res


def _image(img):
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
