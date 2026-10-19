from django.urls import path

from api.voting import views

# в api/urls.py: path('voting/', include('api.voting.urls')),
urlpatterns = [
    path('<int:vote_id>/', views.VoteSession.as_view(), name='api_v1_voting'),
]
