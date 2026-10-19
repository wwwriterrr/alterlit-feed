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
