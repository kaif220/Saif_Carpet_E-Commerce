from decimal import Decimal
from django.conf import settings
from django.db import models
from django.utils import timezone

_User = settings.AUTH_USER_MODEL


class Category(models.Model):
    name = models.CharField(max_length=80, unique=True)
    def __str__(self): return self.name
    class Meta: verbose_name_plural = "categories"


class Product(models.Model):
    code = models.CharField("Design code", max_length=30, unique=True)
    name = models.CharField(max_length=160)
    category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.SET_NULL, related_name="products")
    description = models.TextField(blank=True)
    quality = models.CharField(max_length=80, blank=True)
    size = models.CharField(max_length=60, blank=True)
    color = models.CharField(max_length=80, blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2, help_text="Price per piece (INR)")
    stock = models.PositiveIntegerField(default=10)
    image = models.ImageField(upload_to="products/", blank=True)
    featured = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta: ordering = ["-created_at", "-id"]
    def __str__(self): return f"{self.code} - {self.name}"

    def active_discount(self):
        now = timezone.now()
        best = 0
        for s in Sale.objects.filter(is_active=True, starts_at__lte=now, ends_at__gte=now):
            if not s.products.exists() or s.products.filter(pk=self.pk).exists():
                best = max(best, s.percent)
        return best

    def final_price(self):
        d = self.active_discount()
        return (self.price * (100 - d) / Decimal(100)).quantize(Decimal("0.01"))


class Review(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="reviews")
    user = models.ForeignKey(_User, on_delete=models.CASCADE, related_name="reviews")
    rating = models.PositiveSmallIntegerField()
    title = models.CharField(max_length=120, blank=True)
    comment = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        ordering = ["-created_at"]
        unique_together = ("product", "user")


class Event(models.Model):
    title = models.CharField(max_length=160)
    description = models.TextField(blank=True)
    location = models.CharField(max_length=200, blank=True)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField(null=True, blank=True)
    banner = models.ImageField(upload_to="events/", blank=True)
    is_active = models.BooleanField(default=True)
    class Meta: ordering = ["starts_at"]
    def __str__(self): return self.title


class Sale(models.Model):
    title = models.CharField(max_length=120)
    percent = models.PositiveSmallIntegerField(help_text="Discount %")
    products = models.ManyToManyField(Product, blank=True, help_text="Leave empty = applies to ALL products")
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    is_active = models.BooleanField(default=True)
    def __str__(self): return f"{self.title} ({self.percent}%)"


class Order(models.Model):
    PAYMENT = [("COD", "Cash on Delivery"), ("UPI", "UPI"), ("CARD", "Card")]
    STATUS = [("PLACED", "Placed"), ("CONFIRMED", "Confirmed"), ("SHIPPED", "Shipped"),
              ("DELIVERED", "Delivered"), ("CANCELLED", "Cancelled")]
    user = models.ForeignKey(_User, on_delete=models.CASCADE, related_name="orders")
    full_name = models.CharField(max_length=120)
    phone = models.CharField(max_length=20)
    address = models.TextField()
    city = models.CharField(max_length=80)
    pincode = models.CharField(max_length=12)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    delivery_date = models.DateField()
    delivery_slot = models.CharField(max_length=30)
    payment_method = models.CharField(max_length=5, choices=PAYMENT, default="COD")
    payment_status = models.CharField(max_length=10, default="PENDING")
    transaction_ref = models.CharField(max_length=60, blank=True)
    status = models.CharField(max_length=10, choices=STATUS, default="PLACED")
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta: ordering = ["-created_at"]


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, null=True, on_delete=models.SET_NULL)
    product_name = models.CharField(max_length=160)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    quantity = models.PositiveIntegerField()
