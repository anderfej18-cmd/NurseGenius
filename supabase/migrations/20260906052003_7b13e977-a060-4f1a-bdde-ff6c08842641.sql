REVOKE ALL ON FUNCTION public.get_daily_leaderboard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_weekly_leaderboard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_upgrade_from_receipt(text, public.user_tier, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.flag_receipt_and_revoke(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_receipt_fingerprint(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activate_subscription(public.user_tier, text, numeric) FROM PUBLIC, anon, authenticated;