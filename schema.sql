CREATE TABLE IF NOT EXISTS persons (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  title TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  photo TEXT DEFAULT '',
  kind TEXT DEFAULT 'media',
  elo REAL DEFAULT 1200,
  wins INTEGER DEFAULT 0,
  battles INTEGER DEFAULT 0,
  prev_rank INTEGER,
  created INTEGER DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  breaking INTEGER DEFAULT 0,
  created INTEGER DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  contact TEXT NOT NULL,
  bio TEXT DEFAULT '',
  photo TEXT NOT NULL,
  ip TEXT,
  created INTEGER DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS votes (
  tok TEXT PRIMARY KEY,
  ip TEXT,
  created INTEGER
);
CREATE INDEX IF NOT EXISTS votes_ip ON votes(ip, created);

INSERT OR IGNORE INTO persons (slug, name, title, bio, kind) VALUES
 ('clavicular','Clavicular','Избранный','Один из самых обсуждаемых лиц looksmaxxing-сцены.','media'),
 ('zeta','Zeta','Генетический апекс','Модель и контент-мейкер, регулярный участник топов.','media'),
 ('androgenic','Androgenic','Тера-титан','Стример и лицо сообщества.','media'),
 ('jordan-barrett','Jordan Barrett','Икона подиума','Австралийская модель, эталон эпохи.','media'),
 ('chico-lachowski','Chico Lachowski','Pretty Boy','Бразильская модель, с которой многие начали looksmaxxing.','media'),
 ('sean-opry','Sean O''Pry','Самая успешная модель','Одна из самых узнаваемых мужских моделей.','media'),
 ('david-laid','David Laid','Король эстетики','Фитнес-блогер, символ aesthetics.','media'),
 ('jeff-seid','Jeff Seid','Чад старой школы','Фитнес-модель и предприниматель.','media');
INSERT INTO news (title, body, breaking)
 SELECT 'CHADBATTLE открыт','Голосуй в батлах — рейтинг пересчитывается после каждого голоса. Взлёты и падения фиксируются каждый понедельник.',1
 WHERE NOT EXISTS (SELECT 1 FROM news);
