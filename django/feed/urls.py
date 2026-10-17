from django.urls import path

from api.feed import views

# в api/urls.py: path('feed/', include('api.feed.urls')),
urlpatterns = [
    path('', views.FeedView.as_view(), name='feed'),
]
