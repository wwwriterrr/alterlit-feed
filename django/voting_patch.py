# Голосования для островов — отдельный API api/voting/ (окно голосования в ленте постов).
# По образцу voting.views.Vote, старый код не трогаем.
#
#   GET  /api/v1/voting/<id>/   — голосование: варианты, «я голосовал», результаты (гостю тоже)
#   POST /api/v1/voting/<id>/   — {"choice_id": N} — голос; ответ — то же, что GET
#
#   {"id", "title", "description", "multiple", "can_revote", "ended", "date_execute",
#    "voted", "show_results", "total", "url",
#    "choices": [{"id", "kind": "text"|"post"|"comment"|"user", "text", "url"?, "image"?, "avatar"?,
#                 "mine", "votes": число | null — пока результаты скрыты}]}
#
# Результаты видны после своего голоса и когда голосование окончено (как на странице поста).
# Голос — voteQuestion.create_vote, правила прежние. Отличия от старого Vote: вариант ищется
# только среди вариантов этого голосования; ошибки — текстом правила, без «Ошибка сохранения…».
#
# Подключение: пакет api/voting/ (п. 1–4), в api/urls.py —
#   path('voting/', include('api.voting.urls')),
# в INSTALLED_APPS не добавлять.

# ── 1. api/voting/__init__.py — пустой файл ─────────────────────────────────


# ── 2. api/voting/serializers.py ────────────────────────────────────────────
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


# ── 3. api/voting/views.py ──────────────────────────────────────────────────
"""
Голосование для островов — по образцу voting.views.Vote, сессионная авторизация.

    GET  /api/v1/voting/<id>/   — голосование (гостю тоже)
    POST /api/v1/voting/<id>/   — {"choice_id": N} — голос; ответ — то же, что GET

Голос записывает voteQuestion.create_vote — правила прежние: повторный голос за свой вариант
снимает его (если is_accept_delete или право blog.add_post), в голосовании с одним вариантом
голос переносится, после date_execute голоса не принимаются; устройство и IP — как раньше.
Отличие от старого Vote: вариант ищется только среди вариантов этого голосования.
"""
import logging

from rest_framework import parsers
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from api.voting.serializers import VoteToJson
from voting.models import voteQuestion

logger = logging.getLogger("alterlit")


class VoteSession(APIView):
    allowed_methods = ["GET", "POST"]
    parser_classes = [parsers.JSONParser]
    authentication_classes = [SessionAuthentication]
    permission_classes = [AllowAny]

    def get(self, request, vote_id):
        vote = voteQuestion.objects.filter(id=vote_id).first()
        if vote is None:
            return Response({"detail": "Голосование не найдено"}, status=404)
        return Response(VoteToJson(vote, request.user))

    def post(self, request, vote_id):
        if not request.user.is_authenticated:
            return Response({"detail": "Голосовать могут только зарегистрированные пользователи"}, status=403)
        block = request.user.check_block()
        if block and block.block_type == "FULL":
            return Response({"detail": "Ваш аккаунт заблокирован"}, status=403)
        vote = voteQuestion.objects.filter(id=vote_id).first()
        if vote is None:
            return Response({"detail": "Голосование не найдено"}, status=404)
        try:
            choice_id = int(request.data.get("choice_id"))
        except (TypeError, ValueError):
            return Response({"detail": "Не выбран вариант"}, status=400)
        choice = vote.choices.filter(id=choice_id).first()
        if choice is None:
            return Response({"detail": "Вариант ответа не найден"}, status=404)
        try:
            # create_vote читает user_agent и IP из HttpRequest — передаём исходный запрос Django
            voteQuestion.create_vote(request._request, vote, choice)
        except Exception as ex:
            # правила голосования (pre_save и create_vote): «нельзя отменить голос», «окончено»…
            logger.info("voting: vote %s choice %s user %s: %s", vote.id, choice.id, request.user.id, ex)
            return Response({"detail": str(ex.args[0]) if ex.args else "Голос не принят"}, status=400)
        return Response(VoteToJson(vote, request.user))


# ── 4. api/voting/urls.py ───────────────────────────────────────────────────
from django.urls import path

from api.voting import views

# в api/urls.py: path('voting/', include('api.voting.urls')),
urlpatterns = [
    path('<int:vote_id>/', views.VoteSession.as_view(), name='api_v1_voting'),
]
