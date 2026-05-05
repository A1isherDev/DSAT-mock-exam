import logging

from django.db.models.signals import post_delete, pre_save
from django.dispatch import receiver
from django.utils import timezone

from .models import PracticeTest, Question
from .question_ordering import dense_compact_module_orders_locked

logger = logging.getLogger(__name__)


@receiver(post_delete, sender=Question)
def question_normalize_after_delete(sender, instance, **kwargs):
    from django.conf import settings

    if not getattr(settings, "EXAM_QUESTION_COMPACT_ON_DELETE", False):
        return
    dense_compact_module_orders_locked(instance.module_id)


@receiver(pre_save, sender=PracticeTest)
def practicetest_audit_pastpaper_detach(sender, instance, **kwargs):
    """
    When a section is removed from a pastpaper pack, freeze an audit snapshot (no silent drift).
    Bulk QuerySet.update(...) bypasses this — use model save or log separately.
    """
    if not instance.pk:
        return
    snapshot = PracticeTest.objects.filter(pk=instance.pk).values("pastpaper_pack_id").first()
    if snapshot is None:
        return

    prev_pack_id = snapshot.get("pastpaper_pack_id")
    new_pack_id = instance.pastpaper_pack_id

    if prev_pack_id is not None and new_pack_id is None:
        instance.pastpaper_detached_at = timezone.now()
        instance.pastpaper_detached_pack_id = int(prev_pack_id)
        logger.warning(
            "pastpaper_section_detached practice_test_id=%s pastpaper_pack_id_was=%s",
            instance.pk,
            prev_pack_id,
        )
        return

    if new_pack_id is not None:
        instance.pastpaper_detached_at = None
        instance.pastpaper_detached_pack_id = None
