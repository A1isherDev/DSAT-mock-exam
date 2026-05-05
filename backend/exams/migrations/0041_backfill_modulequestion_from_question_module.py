from django.db import migrations


def backfill_module_questions(apps, schema_editor):
    Module = apps.get_model("exams", "Module")
    Question = apps.get_model("exams", "Question")
    ModuleQuestion = apps.get_model("exams", "ModuleQuestion")

    # Idempotent: if links already exist, do not duplicate.
    existing = set(
        ModuleQuestion.objects.values_list("module_id", "question_id")
    )

    for mid in Module.objects.values_list("id", flat=True).iterator(chunk_size=200):
        qs = list(
            Question.objects.filter(module_id=mid).order_by("order", "id").values_list("id", flat=True)
        )
        if not qs:
            continue

        batch = []
        for idx, qid in enumerate(qs):
            key = (int(mid), int(qid))
            if key in existing:
                continue
            batch.append(
                ModuleQuestion(module_id=int(mid), question_id=int(qid), order=int(idx))
            )

        if batch:
            ModuleQuestion.objects.bulk_create(batch, ignore_conflicts=True, batch_size=1000)

        # Normalize dense ordering for both tables (legacy mirror).
        # Use UPDATE-in-place; safe even if some rows already existed.
        links = list(
            ModuleQuestion.objects.filter(module_id=mid).order_by("order", "id").values_list("id", "question_id")
        )
        # Re-write orders to 0..n-1 stable by (order,id).
        for idx, (link_id, qid) in enumerate(links):
            ModuleQuestion.objects.filter(id=link_id).update(order=idx)
            Question.objects.filter(id=qid).update(order=idx)

        Module.objects.filter(id=mid).update(question_order_high_water=max(0, len(links) - 1))


class Migration(migrations.Migration):
    dependencies = [
        ("exams", "0040_category_modulequestion_and_more"),
    ]

    operations = [
        migrations.RunPython(backfill_module_questions, migrations.RunPython.noop),
    ]

