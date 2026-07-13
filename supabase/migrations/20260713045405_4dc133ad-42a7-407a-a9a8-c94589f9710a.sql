-- Token-Hashing (SHA-256) statt Klartext für langlebige Zugriffs-Tokens.
-- Bestehende URLs bleiben gültig: der Klartext wird in-place gehasht und
-- danach verworfen. Neue Tokens werden serverseitig ausschließlich als
-- Hash gespeichert; der Klartext verlässt den Server nur einmal (One-Shot).
--
-- Zusätzlich: REVOKE SELECT ON public.leave_requests FROM anon — der Grant
-- aus einer alten Migration ist nur durch RLS entschärft und wird jetzt
-- explizit widerrufen.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) access_tokens (Kalender-Feeds & Co.)
ALTER TABLE public.access_tokens ADD COLUMN token_hash text;
UPDATE public.access_tokens
   SET token_hash = encode(digest(token, 'sha256'), 'hex');
ALTER TABLE public.access_tokens ALTER COLUMN token_hash SET NOT NULL;
ALTER TABLE public.access_tokens DROP COLUMN token;
CREATE UNIQUE INDEX access_tokens_token_hash_key
  ON public.access_tokens(token_hash);

-- 2) display_settings.display_token
ALTER TABLE public.display_settings ADD COLUMN display_token_hash text;
UPDATE public.display_settings
   SET display_token_hash = encode(digest(display_token, 'sha256'), 'hex');
ALTER TABLE public.display_settings ALTER COLUMN display_token_hash SET NOT NULL;
ALTER TABLE public.display_settings DROP COLUMN display_token;
CREATE UNIQUE INDEX display_settings_display_token_hash_key
  ON public.display_settings(display_token_hash);

-- 3) organizations.trmnl_token (nullable — nur bereits gesetzte Werte hashen)
ALTER TABLE public.organizations ADD COLUMN trmnl_token_hash text;
UPDATE public.organizations
   SET trmnl_token_hash = encode(digest(trmnl_token, 'sha256'), 'hex')
 WHERE trmnl_token IS NOT NULL;
ALTER TABLE public.organizations DROP COLUMN trmnl_token;
CREATE UNIQUE INDEX organizations_trmnl_token_hash_key
  ON public.organizations(trmnl_token_hash)
  WHERE trmnl_token_hash IS NOT NULL;

-- 4) staff_telegram_links.link_token (nullable — nach dem Verheiraten NULL)
ALTER TABLE public.staff_telegram_links ADD COLUMN link_token_hash text;
UPDATE public.staff_telegram_links
   SET link_token_hash = encode(digest(link_token, 'sha256'), 'hex')
 WHERE link_token IS NOT NULL;
ALTER TABLE public.staff_telegram_links DROP COLUMN link_token;
CREATE INDEX staff_telegram_links_link_token_hash_idx
  ON public.staff_telegram_links(link_token_hash)
  WHERE link_token_hash IS NOT NULL;

-- 5) leave_requests: alter anon-SELECT-Grant explizit widerrufen.
-- Die RLS-Policy hat schon geschützt; der Grant war eine tickende
-- Fehlkonfiguration.
REVOKE SELECT ON public.leave_requests FROM anon;