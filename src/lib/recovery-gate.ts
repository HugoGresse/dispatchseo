// Marks a browser as having arrived through a password-RECOVERY link, so the
// /reset-password form can tell that apart from an ordinary signed-in session.
//
// Why this exists: Supabase's `updateUser({ password })` changes the password
// of whatever session is attached to the request and never asks for the current
// one. Recovery links are exchanged for a real session at /auth/callback, and
// once that happens a recovery session and a normal session are
// indistinguishable server-side - `getUser()` reports the same thing for both.
// So the reset form, left ungated, was a no-reauthentication takeover step:
// anyone holding a live session (a shared or unlocked machine, a lifted cookie)
// could open /reset-password and lock the real owner out of their own account
// without ever knowing the old password.
//
// The marker is set only on the recovery leg of /auth/callback, httpOnly so
// script can't mint it, and cleared the moment it is spent.

export const RECOVERY_COOKIE = "pw_recovery";
