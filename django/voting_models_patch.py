# voting/models.py — две правки, без миграций:
#   1. счётчик voteChoice.votes — увеличивать и уменьшать в базе (F()), а не из значения в памяти:
#      при одновременных голосах прибавки терялись;
#   2. проверка даты окончания (question_pre_save) — только когда дату задают или меняют:
#      сейчас оконченное голосование нельзя сохранить в админке даже ради опечатки в названии.
# Плюс разовый пересчёт счётчиков, если они уже разошлись с голосами (п. 3).


# ── 1. Счётчик голосов ────────────────────────────────────────────────────────
# В импорт в начале файла добавить F:
#     from django.db.models import Max, Count, Sum, Exists, OuterRef, F
#
# и заменить два обработчика в конце файла:

@receiver(post_save, sender=voteRelationship)
def vote_counter_plus(sender, instance, created, *args, **kwargs):
    if created and instance.choice_id:
        # +1 прямо в базе: два голоса одновременно — обе прибавки учтены
        voteChoice.objects.filter(pk=instance.choice_id).update(votes=F("votes") + 1)


@receiver(post_delete, sender=voteRelationship)
def vote_counter_minus(sender, instance, *args, **kwargs):
    if instance.choice_id:
        # при удалении самого варианта (каскад) строки уже нет — update просто ничего не изменит
        voteChoice.objects.filter(pk=instance.choice_id, votes__gt=0).update(votes=F("votes") - 1)


# ── 2. Дата окончания голосования ─────────────────────────────────────────────
# Заменить question_pre_save:

@receiver(pre_save, sender=voteQuestion)
def question_pre_save(sender, instance, raw, *args, **kwargs):
    if instance.date_execute and instance.date_execute <= dt.now():
        # прошедшую дату нельзя ЗАДАТЬ; сохранить оконченное голосование с прежней датой — можно
        old = (sender.objects.filter(pk=instance.pk).values_list("date_execute", flat=True).first()
               if instance.pk else None)
        if old != instance.date_execute:
            raise ValueError("Дата окончания голосования не может быть меньше даты создания голосования")

    if instance.meta_json:
        try:
            json.loads(instance.meta_json)
        except Exception as ex:
            raise ValueError("Необходимо указать мета параметры в формате JSON")


# ── 3. Разовый пересчёт счётчиков (python manage.py shell) ────────────────────
# Счётчики могли уже разойтись с настоящим числом голосов. Посмотреть (только чтение):
#
#   from django.db.models import Count
#   from voting.models import voteChoice
#   bad = [(c.id, c.votes, c.n) for c in voteChoice.objects.annotate(n=Count("relationships")) if c.votes != c.n]
#   print(len(bad), bad[:20])
#
# Пересчитать (запись):
#
#   for c in voteChoice.objects.annotate(n=Count("relationships")):
#       if c.votes != c.n:
#           voteChoice.objects.filter(pk=c.pk).update(votes=c.n)
