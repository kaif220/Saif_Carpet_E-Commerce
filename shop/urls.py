from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from . import views

router = DefaultRouter()
router.register("products", views.ProductViewSet, basename="product")
router.register("categories", views.CategoryViewSet)
router.register("events", views.EventViewSet, basename="event")
router.register("sales", views.SaleViewSet, basename="sale")
router.register("orders", views.OrderViewSet, basename="order")

urlpatterns = [
    path("auth/register/", views.register),
    path("auth/login/", TokenObtainPairView.as_view()),
    path("auth/refresh/", TokenRefreshView.as_view()),
    path("auth/logout/", views.logout),
    path("auth/me/", views.me),
    path("reviews/<int:pk>/", views.ReviewDetail.as_view()),
    path("admin/stats/", views.stats),
    path("", include(router.urls)),
]
