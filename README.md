# CHADBATTLE — chadbattle.ru

Народный рейтинг чадов, часть looksmaxxing-экосистемы ([facerate.ru](https://facerate.ru), [looks-maks.ru](https://looks-maks.ru)).

- **Рейтинг** — Elo (K=32), пересчитывается после каждого голоса
- **Батл** — два близких по месту человека, выбираешь сильнейшего (← →)
- **Взлёты и падения** — каждый понедельник в 00:00 UTC cron сохраняет места (`prev_rank`); вручную кнопкой «Зафиксировать неделю» в админке
- **Страницы персон** — `#/p/<slug>`: фото, титул, место, Elo, винрейт, описание
- **Новости** — срочная новость показывается на главной
- **Заявки** — фото + описание → модерация в админке → одобрение создаёт участника
- **Админка** — `#/admin`, ключ в `.admin-key` (не в git), сохраняется в localStorage

## Устройство

| Файл | Что |
|---|---|
| `index.html` | весь фронт, vanilla JS, hash-роутинг, GitHub Pages |
| `worker.js` | API на Cloudflare Worker `chadbattle.realfactchecknews.workers.dev` |
| `schema.sql` | таблицы D1 (`persons`, `news`, `applications`, `votes`) + стартовые персоны |

Антинакрутка: батл выдаёт HMAC-токен на 10 минут, один голос на токен, не больше 60 голосов в час с IP (хеш). Заявки: не больше 3 в сутки с IP.

## Деплой

```bash
npx wrangler@4 deploy                                          # воркер
npx wrangler@4 d1 execute chadbattle --remote --file schema.sql # схема (идемпотентно)
npx wrangler@4 secret put ADMIN_KEY < .admin-key               # сменить ключ админки
```

Фронт: push в `main` → GitHub Pages. DNS на reg.ru: A `@` → 185.199.108.153 / 109.153 / 110.153 / 111.153, CNAME `www` → `realfactchecknews-eng.github.io`.
