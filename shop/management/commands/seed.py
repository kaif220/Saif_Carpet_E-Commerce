import json, re
from datetime import timedelta
from pathlib import Path
from django.conf import settings
from django.utils import timezone
from django.core.management.base import BaseCommand
from shop.models import *
from django.contrib.auth.models import User


def area_sqft(size):
    s = size.upper()
    m = re.search(r"(\d+)\s*X\s*(\d+)", s)
    if m: return int(m[1]) * int(m[2]) / 929.03
    m = re.search(r"(\d+)\s*CM", s)
    if m:
        r = int(m[1]) / 2
        return 3.14159 * r * r / 929.03
    return 12


class Command(BaseCommand):
    help = "Load products from the PPT catalog + demo admin/user/events/sale"

    def handle(self, *a, **k):
        data = json.load(open(Path(settings.BASE_DIR) / "products_seed.json"))
        for d in data:
            cat_name = "Braided Printed Rugs" if "PRINTED" in (d["item"] or "") else \
                       "Crochet Rugs" if "CROCHET" in (d["item"] or "") else "Braided Rugs"
            cat, _ = Category.objects.get_or_create(name=cat_name)
            rate = int(d["price"]) if d["price"] else 50
            price = round(rate * area_sqft(d["size"] or "") / 10) * 10
            Product.objects.update_or_create(code=f"ARS{d['code']}", defaults=dict(
                name=f"{(d['item'] or 'Braided Rug').title()} - {(d['color'] or '').title()}",
                category=cat, quality=d["quality"] or "", size=d["size"] or "", color=d["color"] or "",
                price=max(price, 299), stock=15, image=d["img"], featured=d["slide"] % 5 == 0,
                description=f"Handcrafted {d['quality']} rug, size {d['size']}, colour {d['color']}. "
                            "Natural jute, durable and eco-friendly - adds a cozy, laid-back feel to any floor."))
        if not User.objects.filter(username="admin").exists():
            User.objects.create_superuser("admin", "admin@saifcarpet.com", "admin123")
        if not User.objects.filter(username="demo").exists():
            User.objects.create_user("demo", "demo@saifcarpet.com", "demo1234")
        now = timezone.now()
        Event.objects.get_or_create(title="Diwali Carpet Mela", defaults=dict(
            description="Live weaving demo + flat 15% on jute rugs.", location="Saif Carpet Showroom",
            starts_at=now + timedelta(days=7), ends_at=now + timedelta(days=10)))
        Sale.objects.get_or_create(title="Festive Sale", defaults=dict(
            percent=10, starts_at=now - timedelta(days=1), ends_at=now + timedelta(days=30)))
        self.stdout.write(self.style.SUCCESS(f"Seeded {Product.objects.count()} products. admin/admin123, demo/demo1234"))
