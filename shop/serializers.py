import uuid
from datetime import date
from decimal import Decimal
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.db.models import Avg, Count
from rest_framework import serializers
from .models import *


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)
    class Meta:
        model = User
        fields = ("username", "email", "password", "first_name")
    def validate_email(self, v):
        if v and User.objects.filter(email__iexact=v).exists():
            raise serializers.ValidationError("Email already registered.")
        return v
    def create(self, data):
        return User.objects.create_user(**data)


class UserSerializer(serializers.ModelSerializer):
    is_admin = serializers.BooleanField(source="is_staff", read_only=True)
    class Meta:
        model = User
        fields = ("id", "username", "email", "first_name", "is_admin")


class CategorySerializer(serializers.ModelSerializer):
    class Meta: model = Category; fields = "__all__"


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    final_price = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    discount = serializers.IntegerField(source="active_discount", read_only=True)
    avg_rating = serializers.SerializerMethodField()
    review_count = serializers.SerializerMethodField()
    class Meta:
        model = Product
        fields = "__all__"
    def get_avg_rating(self, o):
        v = o.reviews.aggregate(a=Avg("rating"))["a"]
        return round(v, 1) if v else 0
    def get_review_count(self, o):
        return o.reviews.count()


class ReviewSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    mine = serializers.SerializerMethodField()
    class Meta:
        model = Review
        fields = ("id", "username", "rating", "title", "comment", "created_at", "mine")
        read_only_fields = ("id", "created_at")
    def get_mine(self, o):
        r = self.context.get("request")
        return bool(r and r.user.is_authenticated and r.user.id == o.user_id)
    def validate_rating(self, v):
        if not 1 <= v <= 5:
            raise serializers.ValidationError("Rating must be 1-5.")
        return v


class EventSerializer(serializers.ModelSerializer):
    class Meta: model = Event; fields = "__all__"


class SaleSerializer(serializers.ModelSerializer):
    class Meta: model = Sale; fields = "__all__"


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = ("product", "product_name", "unit_price", "quantity")
        read_only_fields = ("product_name", "unit_price")


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True)
    username = serializers.CharField(source="user.username", read_only=True)
    class Meta:
        model = Order
        fields = "__all__"
        read_only_fields = ("user", "total", "payment_status", "transaction_ref", "status", "created_at")

    def validate_delivery_date(self, v):
        if v < date.today():
            raise serializers.ValidationError("Delivery date cannot be in the past.")
        return v

    def validate_items(self, v):
        if not v:
            raise serializers.ValidationError("Cart is empty.")
        return v

    @transaction.atomic
    def create(self, data):
        items = data.pop("items")
        order = Order.objects.create(user=self.context["request"].user, **data)
        total = Decimal(0)
        for it in items:
            p = Product.objects.select_for_update().get(pk=it["product"].pk)
            q = it["quantity"]
            if not p.is_active or p.stock < q:
                raise serializers.ValidationError(f"'{p.name}' has only {p.stock} in stock.")
            price = p.final_price()
            OrderItem.objects.create(order=order, product=p, product_name=p.name, unit_price=price, quantity=q)
            p.stock -= q; p.save(update_fields=["stock"])
            total += price * q
        order.total = total
        # Payment is SIMULATED: plug in Razorpay/Stripe here. No card data is stored.
        if order.payment_method != "COD":
            order.payment_status = "PAID"
            order.transaction_ref = "TXN" + uuid.uuid4().hex[:10].upper()
        order.save()
        return order
