"""Phase A read-only Question Bank API — auth gate, filters, serializer contracts."""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from questionbank.models import (
    BankDomain,
    BankPassage,
    BankSkill,
    ImportBatch,
    QuestionStatus,
    SourceType,
    Subject,
)
from questionbank.services import create_bank_question, create_version

User = get_user_model()


class QbReadonlyApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.eng_domain = BankDomain.objects.create(subject=Subject.ENGLISH, name="Information & Ideas", code="info-ideas")
        cls.eng_skill = BankSkill.objects.create(domain=cls.eng_domain, name="Central Ideas", code="central-ideas")
        cls.math_domain = BankDomain.objects.create(subject=Subject.MATH, name="Algebra", code="algebra")
        cls.math_skill = BankSkill.objects.create(domain=cls.math_domain, name="Linear functions", code="linear-functions")

        cls.batch = ImportBatch.objects.create(source_type=SourceType.PDF_IMPORT, filename="sat.pdf")
        cls.passage = BankPassage.objects.create(subject=Subject.ENGLISH, passage_text="A long stimulus about ecology.")

        # Approved English question with full taxonomy.
        cls.q_eng = create_bank_question(
            subject=Subject.ENGLISH, question_type="MULTIPLE_CHOICE",
            question_text="What is the central idea?", status=QuestionStatus.APPROVED,
            domain=cls.eng_domain, skill=cls.eng_skill, difficulty="MEDIUM",
            option_a="One", option_b="Two", correct_answer="A",
            passage=cls.passage, source_type=SourceType.MANUAL,
        )
        # Triage Math question carrying an advisory AI suggestion, from a batch.
        cls.q_math = create_bank_question(
            subject=Subject.MATH, question_type="MULTIPLE_CHOICE",
            question_text="Solve 2x = 4.", status=QuestionStatus.TRIAGE,
            option_a="1", option_b="2", correct_answer="B",
            source_type=SourceType.PDF_IMPORT, import_batch=cls.batch,
            suggested_domain=cls.math_domain, suggested_skill=cls.math_skill,
            suggested_difficulty="EASY", suggestion_confidence=0.82,
            suggestion_model="claude-test", suggestion_rationale="Mentions a linear equation.",
        )
        # A second version on the English question for the lineage test.
        cls.q_eng.question_text = "Edited central idea?"
        cls.q_eng.save(update_fields=["question_text"])
        create_version(cls.q_eng)

        cls.admin = User.objects.create_user(
            email="qb-admin@example.com", password="pw",
            role="super_admin", is_staff=True, is_superuser=True,
        )
        cls.student = User.objects.create_user(
            email="qb-student@example.com", password="pw", role="student",
        )

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    # ── Auth gate ────────────────────────────────────────────────────────────
    def test_anonymous_denied(self):
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(reverse("questionbank:question-list")).status_code, (401, 403))

    def test_non_staff_denied(self):
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get(reverse("questionbank:question-list")).status_code, 403)

    # ── Questions list / filters / search ────────────────────────────────────
    def test_list_returns_paginated_envelope(self):
        res = self.client.get(reverse("questionbank:question-list"))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["count"], 2)
        self.assertIn("results", res.data)

    def test_filter_by_subject_status_source_and_batch(self):
        url = reverse("questionbank:question-list")
        self.assertEqual(self.client.get(url, {"subject": "MATH"}).data["count"], 1)
        self.assertEqual(self.client.get(url, {"status": "APPROVED"}).data["count"], 1)
        self.assertEqual(self.client.get(url, {"source": "PDF_IMPORT"}).data["count"], 1)
        self.assertEqual(self.client.get(url, {"import_batch": self.batch.id}).data["count"], 1)
        self.assertEqual(self.client.get(url, {"domain": self.eng_domain.id}).data["count"], 1)
        self.assertEqual(self.client.get(url, {"difficulty": "MEDIUM"}).data["count"], 1)

    def test_search_matches_qb_id_and_text(self):
        url = reverse("questionbank:question-list")
        self.assertEqual(self.client.get(url, {"search": "Solve 2x"}).data["count"], 1)
        self.assertEqual(self.client.get(url, {"search": self.q_math.qb_id}).data["count"], 1)

    def test_bad_int_filter_does_not_500(self):
        res = self.client.get(reverse("questionbank:question-list"), {"domain": "not-an-int"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["count"], 2)  # ignored, not applied

    def test_list_suggestion_is_advisory_and_compact(self):
        res = self.client.get(reverse("questionbank:question-list"), {"subject": "MATH"})
        row = res.data["results"][0]
        self.assertTrue(row["suggestion"]["advisory"])
        self.assertEqual(row["suggestion"]["skill"]["name"], "Linear functions")
        self.assertNotIn("rationale", row["suggestion"])  # detail-only

    # ── Question detail ──────────────────────────────────────────────────────
    def test_detail_exposes_full_fields_and_nested_taxonomy(self):
        res = self.client.get(reverse("questionbank:question-detail", args=[self.q_eng.id]))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["qb_id"], self.q_eng.qb_id)
        self.assertEqual(res.data["domain"]["code"], "info-ideas")
        self.assertEqual(res.data["passage"]["id"], self.passage.id)
        self.assertEqual(res.data["version_count"], 2)
        self.assertEqual(res.data["current_version_number"], 2)

    def test_detail_suggestion_includes_rationale(self):
        res = self.client.get(reverse("questionbank:question-detail", args=[self.q_math.id]))
        self.assertTrue(res.data["suggestion"]["advisory"])
        self.assertEqual(res.data["suggestion"]["rationale"], "Mentions a linear equation.")

    # ── Passages ─────────────────────────────────────────────────────────────
    def test_passages_list_and_detail(self):
        self.assertEqual(self.client.get(reverse("questionbank:passage-list")).data["count"], 1)
        res = self.client.get(reverse("questionbank:passage-detail", args=[self.passage.id]))
        self.assertEqual(res.data["question_count"], 1)

    # ── Versions ─────────────────────────────────────────────────────────────
    def test_versions_filter_and_snapshot_opt_in(self):
        url = reverse("questionbank:version-list")
        base = self.client.get(url, {"bank_question": self.q_eng.id})
        self.assertEqual(base.data["count"], 2)
        self.assertNotIn("snapshot_json", base.data["results"][0])
        opted = self.client.get(url, {"bank_question": self.q_eng.id, "include_snapshot": "true"})
        self.assertIn("snapshot_json", opted.data["results"][0])

    # ── Taxonomy ─────────────────────────────────────────────────────────────
    def test_domains_unpaginated_and_subject_filter(self):
        res = self.client.get(reverse("questionbank:domain-list"))
        self.assertIsInstance(res.data, list)
        self.assertEqual(len(res.data), 2)
        self.assertEqual(len(self.client.get(reverse("questionbank:domain-list"), {"subject": "MATH"}).data), 1)

    def test_skills_filter_by_domain_and_subject(self):
        url = reverse("questionbank:skill-list")
        self.assertEqual(len(self.client.get(url, {"domain": self.math_domain.id}).data), 1)
        self.assertEqual(len(self.client.get(url, {"subject": "ENGLISH"}).data), 1)
