from django.contrib import admin
from .models import *
admin.site.register([Category, Review, Event, Sale, OrderItem])
@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "price", "stock", "featured", "is_active")
    search_fields = ("code", "name", "color")
class ItemInline(admin.TabularInline):
    model = OrderItem; extra = 0
@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "total", "payment_method", "status", "created_at")
    inlines = [ItemInline]
