from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from django.views.generic import TemplateView

urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/", include("shop.urls")),
    path("", TemplateView.as_view(template_name="app.html"), name="home"),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
