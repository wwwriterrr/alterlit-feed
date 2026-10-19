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
