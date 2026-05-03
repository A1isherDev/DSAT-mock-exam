from __future__ import annotations

import datetime as pydt
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from access import constants as acc_const
from access.models import UserAccess
from vocabulary.models import ReviewLog, UserWordProgress, Word, WordDefinition
from vocabulary.scheduling import apply_spaced_repetition

User = get_user_model()


class VocabSchedulingTests(TestCase):
    def test_again_resets_and_short_delay(self):
        t = timezone.now()
        u = apply_spaced_repetition(
            ease_factor=2.5, interval_days=10, repetitions=4, result="again", reviewed_at=t
        )
        self.assertEqual(u.repetitions, 0)
        self.assertEqual(u.interval_days, 0)
        self.assertLess(u.next_review_at, t + timedelta(hours=1))

    def test_good_increases_interval_classic_sm2(self):
        t = timezone.now()
        u0 = apply_spaced_repetition(
            ease_factor=2.5, interval_days=0, repetitions=0, result="good", reviewed_at=t
        )
        self.assertEqual(u0.interval_days, 1)
        u1 = apply_spaced_repetition(
            ease_factor=u0.ease_factor,
            interval_days=u0.interval_days,
            repetitions=u0.repetitions,
            result="good",
            reviewed_at=t,
        )
        self.assertEqual(u1.interval_days, 6)
        u2 = apply_spaced_repetition(
            ease_factor=u1.ease_factor,
            interval_days=u1.interval_days,
            repetitions=u1.repetitions,
            result="good",
            reviewed_at=t,
        )
        self.assertGreaterEqual(u2.interval_days, u1.interval_days)

    def test_easy_boosts_vs_good(self):
        t = timezone.now()
        g = apply_spaced_repetition(
            ease_factor=2.5, interval_days=6, repetitions=2, result="good", reviewed_at=t
        )
        e = apply_spaced_repetition(
            ease_factor=2.5, interval_days=6, repetitions=2, result="easy", reviewed_at=t
        )
        self.assertGreaterEqual(e.interval_days, g.interval_days)


@override_settings(VOCAB_MAX_NEW_PER_DAY=10, VOCAB_MAX_REVIEW_PER_DAY=50)
class VocabSrApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.student = User.objects.create_user(
            email="vocab_sr_student@example.com",
            password="x",
            role=acc_const.ROLE_STUDENT,
        )
        UserAccess.objects.create(
            user=self.student,
            subject=acc_const.DOMAIN_MATH,
            classroom=None,
            granted_by=self.student,
        )
        self.w = Word.objects.create(text="aberration", language="en")
        WordDefinition.objects.create(
            word=self.w,
            definition="a departure from normal",
            example="The aberration in the data was noted.",
            order=0,
        )
        self.client.force_authenticate(user=self.student)

    def test_review_creates_unique_progress_and_review_log(self):
        r = self.client.post("/api/vocab/review/", {"word_id": self.w.id, "result": "good"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(UserWordProgress.objects.filter(user=self.student, word=self.w).count(), 1)
        self.assertEqual(ReviewLog.objects.filter(user=self.student, word=self.w).count(), 1)

        r2 = self.client.post("/api/vocab/review/", {"word_id": self.w.id, "result": "good"}, format="json")
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(UserWordProgress.objects.filter(user=self.student, word=self.w).count(), 1)
        self.assertEqual(ReviewLog.objects.filter(user=self.student, word=self.w).count(), 2)

    def test_first_successful_review_sets_intro_schedule_and_introduced_at(self):
        fixed = timezone.make_aware(pydt.datetime(2026, 5, 3, 12, 0, 0), timezone.get_current_timezone())
        with patch("vocabulary.vocab_views.timezone.now", return_value=fixed):
            r = self.client.post("/api/vocab/review/", {"word_id": self.w.id, "result": "easy"}, format="json")
        self.assertEqual(r.status_code, 200)
        p = UserWordProgress.objects.get(user=self.student, word=self.w)
        self.assertEqual(p.repetitions, 1)
        self.assertEqual(p.interval, 1)
        self.assertEqual(p.next_review_at, fixed + timedelta(days=1))
        self.assertEqual(p.introduced_at, fixed)
        self.assertTrue(p.learning_phase)

    def test_first_again_uses_short_delay_not_one_day(self):
        fixed = timezone.make_aware(pydt.datetime(2026, 5, 3, 12, 0, 0), timezone.get_current_timezone())
        with patch("vocabulary.vocab_views.timezone.now", return_value=fixed):
            r = self.client.post("/api/vocab/review/", {"word_id": self.w.id, "result": "again"}, format="json")
        self.assertEqual(r.status_code, 200)
        p = UserWordProgress.objects.get(user=self.student, word=self.w)
        self.assertEqual(p.repetitions, 0)
        self.assertEqual(p.interval, 0)
        self.assertLess(p.next_review_at, fixed + timedelta(hours=1))
        self.assertIsNone(p.introduced_at)

    def test_today_lists_new_words_without_progress(self):
        t = self.client.get("/api/vocab/today/")
        self.assertEqual(t.status_code, 200)
        body = t.json()
        self.assertIn("review", body)
        self.assertIn("new", body)
        self.assertEqual(body["review"], [])
        self.assertEqual(len(body["new"]), 1)
        self.assertEqual(body["new"][0]["id"], self.w.id)

    def test_today_review_queue_respects_next_review_at(self):
        p = UserWordProgress.objects.create(
            user=self.student,
            word=self.w,
            ease_factor=2.5,
            interval=0,
            repetitions=0,
            next_review_at=None,
        )
        t = self.client.get("/api/vocab/today/")
        self.assertEqual(t.status_code, 200)
        self.assertEqual(len(t.json()["review"]), 1)
        self.assertEqual(t.json()["new"], [])

        p.next_review_at = timezone.now() + timedelta(days=100)
        p.save(update_fields=["next_review_at"])
        t2 = self.client.get("/api/vocab/today/")
        self.assertEqual(t2.json()["review"], [])
        self.assertEqual(t2.json()["new"], [])

        a = self.client.get("/api/vocab/all/")
        self.assertEqual(a.status_code, 200)
        self.assertGreaterEqual(a.json()["count"], 1)

    def test_today_prioritizes_overdue_before_due_today(self):
        # Fixed midday in project TZ so +3h/+6h does not spill past ``local_day_end``.
        frozen = timezone.make_aware(pydt.datetime(2026, 5, 3, 10, 0, 0))
        w2 = Word.objects.create(text="bolster", language="en")
        w3 = Word.objects.create(text="candid", language="en")
        UserWordProgress.objects.create(
            user=self.student,
            word=self.w,
            ease_factor=2.5,
            interval=10,
            repetitions=2,
            next_review_at=frozen + timedelta(days=30),
        )
        UserWordProgress.objects.create(
            user=self.student,
            word=w2,
            ease_factor=2.5,
            interval=1,
            repetitions=1,
            next_review_at=frozen + timedelta(hours=6),
        )
        UserWordProgress.objects.create(
            user=self.student,
            word=w3,
            ease_factor=2.5,
            interval=0,
            repetitions=1,
            next_review_at=frozen - timedelta(hours=1),
        )

        with patch("vocabulary.vocab_views.timezone.now", return_value=frozen):
            t = self.client.get("/api/vocab/today/?max_review=2")
        self.assertEqual(t.status_code, 200)
        order = [x["word"]["id"] for x in t.json()["review"]]
        self.assertEqual(order, [w3.id, w2.id])

    @override_settings(VOCAB_MAX_NEW_PER_DAY=2)
    def test_today_caps_new_words(self):
        Word.objects.create(text="delta", language="en")
        Word.objects.create(text="epsilon", language="en")
        Word.objects.create(text="zeta", language="en")

        t = self.client.get("/api/vocab/today/")
        self.assertEqual(len(t.json()["new"]), 2)
        self.assertEqual(t.json()["limits"]["ceilings"]["max_new_per_day"], 2)
        self.assertEqual(t.json()["consumption_today"]["new_words_introduced"], 0)

    @override_settings(VOCAB_MAX_REVIEW_PER_DAY=5)
    def test_today_subtracts_reviews_logged_today(self):
        frozen = timezone.make_aware(pydt.datetime(2026, 5, 3, 10, 0, 0))
        w2 = Word.objects.create(text="bolster_sr", language="en")
        w3 = Word.objects.create(text="candid_sr", language="en")
        UserWordProgress.objects.create(
            user=self.student,
            word=self.w,
            ease_factor=2.5,
            interval=1,
            repetitions=1,
            next_review_at=frozen - timedelta(hours=1),
        )
        UserWordProgress.objects.create(
            user=self.student,
            word=w2,
            ease_factor=2.5,
            interval=1,
            repetitions=1,
            next_review_at=frozen - timedelta(hours=2),
        )
        UserWordProgress.objects.create(
            user=self.student,
            word=w3,
            ease_factor=2.5,
            interval=1,
            repetitions=1,
            next_review_at=frozen - timedelta(hours=3),
        )
        for _ in range(3):
            log = ReviewLog.objects.create(user=self.student, word=self.w, result=ReviewLog.RESULT_GOOD)
            ReviewLog.objects.filter(pk=log.pk).update(created_at=frozen)

        with patch("vocabulary.vocab_views.timezone.now", return_value=frozen):
            t = self.client.get("/api/vocab/today/?max_review=5")
        body = t.json()
        self.assertEqual(body["consumption_today"]["reviews_logged"], 3)
        self.assertEqual(body["limits"]["review_slots_remaining"], 2)
        self.assertEqual(len(body["review"]), 2)

    @override_settings(VOCAB_MAX_NEW_PER_DAY=2)
    def test_today_new_slots_remaining_after_introductions_today(self):
        frozen = timezone.make_aware(pydt.datetime(2026, 7, 1, 14, 0, 0))
        w_intro = Word.objects.create(text="intro_a", language="en")
        w_intro2 = Word.objects.create(text="intro_b", language="en")
        Word.objects.create(text="still_new", language="en")
        UserWordProgress.objects.create(
            user=self.student,
            word=w_intro,
            ease_factor=2.5,
            interval=0,
            repetitions=0,
            next_review_at=None,
            introduced_at=frozen,
        )
        UserWordProgress.objects.create(
            user=self.student,
            word=w_intro2,
            ease_factor=2.5,
            interval=0,
            repetitions=0,
            next_review_at=None,
            introduced_at=frozen,
        )

        with patch("vocabulary.vocab_views.timezone.now", return_value=frozen):
            t = self.client.get("/api/vocab/today/")
        body = t.json()
        self.assertEqual(body["consumption_today"]["new_words_introduced"], 2)
        self.assertEqual(body["limits"]["new_slots_remaining"], 0)
        self.assertEqual(body["new"], [])

    @override_settings(VOCAB_MAX_REVIEW_PER_DAY=2)
    def test_post_returns_429_when_daily_review_cap_reached(self):
        frozen = timezone.make_aware(pydt.datetime(2026, 8, 1, 15, 0, 0))
        for _ in range(2):
            log = ReviewLog.objects.create(user=self.student, word=self.w, result=ReviewLog.RESULT_GOOD)
            ReviewLog.objects.filter(pk=log.pk).update(created_at=frozen)

        with patch("vocabulary.vocab_views.timezone.now", return_value=frozen):
            r = self.client.post("/api/vocab/review/", {"word_id": self.w.id, "result": "good"}, format="json")
        self.assertEqual(r.status_code, 429)

    @override_settings(VOCAB_MAX_NEW_PER_DAY=1)
    def test_post_returns_429_when_daily_new_intro_cap_reached(self):
        w2 = Word.objects.create(text="second_new", language="en")
        frozen = timezone.make_aware(pydt.datetime(2026, 9, 10, 9, 0, 0))
        UserWordProgress.objects.create(
            user=self.student,
            word=w2,
            ease_factor=2.5,
            interval=0,
            repetitions=0,
            next_review_at=None,
            introduced_at=frozen,
        )

        with patch("vocabulary.vocab_views.timezone.now", return_value=frozen):
            r = self.client.post("/api/vocab/review/", {"word_id": self.w.id, "result": "good"}, format="json")
        self.assertEqual(r.status_code, 429)

    @override_settings(VOCAB_MAX_NEW_PER_DAY=0)
    def test_first_again_allowed_when_new_intros_disabled(self):
        """``again`` on an unseen word is not a ``good``/``easy`` introduction."""
        frozen = timezone.make_aware(pydt.datetime(2026, 10, 1, 11, 0, 0))
        with patch("vocabulary.vocab_views.timezone.now", return_value=frozen):
            r = self.client.post("/api/vocab/review/", {"word_id": self.w.id, "result": "again"}, format="json")
        self.assertEqual(r.status_code, 200)

    @override_settings(VOCAB_MAX_NEW_PER_DAY=1)
    def test_first_again_then_good_consumes_new_slot_not_first_again(self):
        frozen = timezone.make_aware(pydt.datetime(2026, 10, 2, 11, 0, 0))
        w_other = Word.objects.create(text="other_vocab", language="en")
        with patch("vocabulary.vocab_views.timezone.now", return_value=frozen):
            r = self.client.post("/api/vocab/review/", {"word_id": self.w.id, "result": "again"}, format="json")
        self.assertEqual(r.status_code, 200)
        t = self.client.get("/api/vocab/today/")
        self.assertEqual(t.json()["consumption_today"]["new_words_introduced"], 0)

        with patch("vocabulary.vocab_views.timezone.now", return_value=frozen):
            r2 = self.client.post("/api/vocab/review/", {"word_id": self.w.id, "result": "good"}, format="json")
        self.assertEqual(r2.status_code, 200)
        self.assertIsNotNone(UserWordProgress.objects.get(user=self.student, word=self.w).introduced_at)

        with patch("vocabulary.vocab_views.timezone.now", return_value=frozen):
            t2 = self.client.get("/api/vocab/today/")
        self.assertEqual(t2.json()["consumption_today"]["new_words_introduced"], 1)

        with patch("vocabulary.vocab_views.timezone.now", return_value=frozen):
            r3 = self.client.post("/api/vocab/review/", {"word_id": w_other.id, "result": "easy"}, format="json")
        self.assertEqual(r3.status_code, 429)
