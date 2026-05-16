from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("assessments", "0015_assessment_question_explanation"),
    ]

    operations = [
        migrations.AddField(
            model_name="assessmentquestion",
            name="question_image",
            field=models.ImageField(blank=True, null=True, upload_to="assessment_questions/"),
        ),
        migrations.AddField(
            model_name="assessmentquestion",
            name="option_a_image",
            field=models.ImageField(blank=True, null=True, upload_to="assessment_questions/"),
        ),
        migrations.AddField(
            model_name="assessmentquestion",
            name="option_b_image",
            field=models.ImageField(blank=True, null=True, upload_to="assessment_questions/"),
        ),
        migrations.AddField(
            model_name="assessmentquestion",
            name="option_c_image",
            field=models.ImageField(blank=True, null=True, upload_to="assessment_questions/"),
        ),
        migrations.AddField(
            model_name="assessmentquestion",
            name="option_d_image",
            field=models.ImageField(blank=True, null=True, upload_to="assessment_questions/"),
        ),
    ]
