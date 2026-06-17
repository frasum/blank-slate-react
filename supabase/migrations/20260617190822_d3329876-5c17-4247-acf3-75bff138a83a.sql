REVOKE ALL ON FUNCTION public.approve_leave_request(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_leave_request(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.approve_leave_request(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.approve_leave_request(uuid, uuid, text) TO service_role;

REVOKE INSERT, UPDATE, DELETE ON public.leave_requests FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.leave_requests FROM anon;