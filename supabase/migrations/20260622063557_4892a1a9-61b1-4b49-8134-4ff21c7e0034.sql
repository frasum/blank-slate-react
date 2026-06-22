-- P0-Fix: 4-Arg create_order_from_cart darf NICHT direkt von Clients aufrufbar sein.
-- Aufruf ausschließlich serverseitig über supabaseAdmin (service_role) + geprüfte Server-Function.
REVOKE EXECUTE ON FUNCTION public.create_order_from_cart(uuid, uuid, text, uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_from_cart(uuid, uuid, text, uuid)
TO service_role;