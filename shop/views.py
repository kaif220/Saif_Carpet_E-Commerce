from django.contrib.auth.models import User
from django.db.models import Count, Sum
from django.utils import timezone
from rest_framework import generics, permissions, status, viewsets, filters
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from .models import *
from .serializers import *


class IsAdminOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.method in permissions.SAFE_METHODS or bool(request.user and request.user.is_staff)


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def register(request):
    s = RegisterSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    user = s.save()
    r = RefreshToken.for_user(user)
    return Response({"access": str(r.access_token), "refresh": str(r), "user": UserSerializer(user).data}, status=201)


@api_view(["POST"])
def logout(request):
    try:
        RefreshToken(request.data.get("refresh")).blacklist()
    except Exception:
        pass
    return Response({"detail": "Logged out."})


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def me(request):
    return Response(UserSerializer(request.user).data)


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsAdminOrReadOnly]
    pagination_class = None


class ProductViewSet(viewsets.ModelViewSet):
    serializer_class = ProductSerializer
    permission_classes = [IsAdminOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "code", "color", "quality", "description", "category__name"]
    ordering_fields = ["price", "created_at", "name"]

    def get_queryset(self):
        qs = Product.objects.select_related("category")
        u = self.request.user
        if not (u.is_authenticated and u.is_staff):
            qs = qs.filter(is_active=True)
        p = self.request.query_params
        if p.get("category"): qs = qs.filter(category_id=p["category"])
        if p.get("featured"): qs = qs.filter(featured=True)
        if p.get("min_price"): qs = qs.filter(price__gte=p["min_price"])
        if p.get("max_price"): qs = qs.filter(price__lte=p["max_price"])
        return qs

    @action(detail=True, methods=["get", "post"], url_path="reviews",
            permission_classes=[permissions.IsAuthenticatedOrReadOnly])
    def reviews(self, request, pk=None):
        product = self.get_object()
        if request.method == "GET":
            qs = product.reviews.select_related("user")
            return Response(ReviewSerializer(qs, many=True, context={"request": request}).data)
        if product.reviews.filter(user=request.user).exists():
            return Response({"detail": "You already reviewed this product."}, status=400)
        s = ReviewSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        s.save(product=product, user=request.user)
        return Response(s.data, status=201)


class ReviewDetail(generics.DestroyAPIView):
    queryset = Review.objects.all()
    permission_classes = [permissions.IsAuthenticated]
    def perform_destroy(self, obj):
        if obj.user_id != self.request.user.id and not self.request.user.is_staff:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Not your review.")
        obj.delete()


class EventViewSet(viewsets.ModelViewSet):
    serializer_class = EventSerializer
    permission_classes = [IsAdminOrReadOnly]
    pagination_class = None
    def get_queryset(self):
        qs = Event.objects.all()
        u = self.request.user
        return qs if (u.is_authenticated and u.is_staff) else qs.filter(is_active=True)


class SaleViewSet(viewsets.ModelViewSet):
    serializer_class = SaleSerializer
    permission_classes = [IsAdminOrReadOnly]
    pagination_class = None
    def get_queryset(self):
        qs = Sale.objects.all()
        u = self.request.user
        if u.is_authenticated and u.is_staff: return qs
        now = timezone.now()
        return qs.filter(is_active=True, starts_at__lte=now, ends_at__gte=now)


class OrderViewSet(viewsets.ModelViewSet):
    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        qs = Order.objects.prefetch_related("items").select_related("user")
        return qs if self.request.user.is_staff else qs.filter(user=self.request.user)

    def partial_update(self, request, *args, **kwargs):
        order = self.get_object()
        new = request.data.get("status")
        if request.user.is_staff:
            if new in dict(Order.STATUS): order.status = new
            if request.data.get("payment_status"): order.payment_status = request.data["payment_status"]
        elif new == "CANCELLED" and order.status == "PLACED":
            order.status = "CANCELLED"
            for i in order.items.all():
                if i.product: i.product.stock += i.quantity; i.product.save(update_fields=["stock"])
        else:
            return Response({"detail": "Not allowed."}, status=403)
        order.save()
        return Response(OrderSerializer(order).data)


@api_view(["GET"])
@permission_classes([permissions.IsAdminUser])
def stats(request):
    o = Order.objects.exclude(status="CANCELLED")
    return Response({
        "products": Product.objects.count(),
        "orders": Order.objects.count(),
        "users": User.objects.count(),
        "reviews": Review.objects.count(),
        "revenue": o.aggregate(t=Sum("total"))["t"] or 0,
        "low_stock": list(Product.objects.filter(stock__lte=3).values("id", "code", "name", "stock")),
    })
