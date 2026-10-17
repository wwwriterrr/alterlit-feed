from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from api.feed.blocks import index_blocks
from api.feed.cards import cards, viewer
from api.feed.sections import get_section, page


class FeedView(APIView):
    """
    GET /api/v1/feed/?section=index                — первая страница + блоки над лентой + права смотрящего
    GET /api/v1/feed/?section=index&before=<id>    — следующая страница (id последнего показанного поста)
        → {"posts": [...карточки], "more": bool, "blocks": [...] (только на первой), "viewer": {...}}
    Сайт — по request.mode. Раздел, который ещё не перенесён, — 404 (старая лента работает как раньше).
    """
    authentication_classes = [SessionAuthentication]
    permission_classes = [AllowAny]

    def get(self, request):
        mode = getattr(request, 'mode', 'alterlit')
        section = get_section(request.query_params.get('section', 'index'), mode)
        if section is None:
            return Response({'detail': 'Раздел пока не перенесён'}, status=404)
        before = request.query_params.get('before')
        before = int(before) if before and before.isdigit() else None

        posts, more = page(section, before=before)
        data = {
            'posts': cards(posts, mode, section.sites, request.user),
            'more': more,
            'viewer': viewer(request.user),
        }
        if not before and section.blocks_param:
            data['blocks'] = index_blocks(section.blocks_param, section.sites, request.user)
        return Response(data)
