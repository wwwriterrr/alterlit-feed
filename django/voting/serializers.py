"""
Голосования для островов (окно голосования в ленте и т. п.) — данные без HTML.

Видимость результатов — как на странице поста: число голосов по вариантам видно после своего
голоса и когда голосование окончено; до этого — только варианты (votes: null).
"""
from django.db.models import Count
from django.utils.html import strip_tags
from django.utils.text import Truncator

from voting.models import voteRelationship


def _plain(value, chars=None):
    text = ' '.join(strip_tags(value or '').split())
    return Truncator(text).chars(chars) if chars else text


def ChoiceToJson(choice, mine, show_results):
    """Вариант: свой текст (raw_choice) или сущность сайта — публикация, комментарий, пользователь
    (как voteChoice.get_text, но данными)."""
    item = {
        "id": choice.id,
        "kind": "text",
        "text": _plain(choice.raw_choice),
        "mine": mine,
        # votes_count — из annotate во VoteToJson: голоса по связям, а не счётчик voteChoice.votes
        "votes": choice.votes_count if show_results else None,
    }
    if choice.raw_choice or not choice.content_type_id:
        return item
    obj = choice.object
    if obj is None:
        return item
    model = choice.content_type.model
    if model == "post":
        item.update(kind="post", text=_plain(obj.title, 150), url=obj.get_url())
    elif model == "comment":
        image = obj.images.first()
        item.update(kind="comment", text=_plain(obj.content, 100), url=obj.get_url(),
                    image=image.image.url if image else None)
    elif model == "user":
        profile = getattr(obj, "profile", None)
        avatar = getattr(profile, "avatar", None)
        item.update(kind="user", text=obj.get_name(), url=obj.get_url(), avatar=avatar.url if avatar else None)
    return item


def VoteToJson(vote, user):
    choices = list(vote.choices.annotate(votes_count=Count("relationships"))
                   .select_related("content_type").order_by("-id"))
    mine = set()
    if user and user.is_authenticated:
        mine = set(voteRelationship.objects.filter(choice__question=vote, user=user)
                   .values_list("choice_id", flat=True))
    ended = vote.is_execute
    show = bool(mine) or ended
    return {
        "id": vote.id,
        "title": _plain(vote.title),
        "description": _plain(vote.description),
        "multiple": vote.is_multivariate,
        "can_revote": vote.is_accept_delete,
        "ended": ended,
        "date_execute": vote.date_execute.isoformat() if vote.date_execute else None,
        "voted": bool(mine),
        "show_results": show,
        "total": vote.votes_count,
        "url": vote.get_url(),
        "choices": [ChoiceToJson(c, c.id in mine, show) for c in choices],
    }
