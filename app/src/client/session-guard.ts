/**
 * Wraps a fetch used mid-exercise, where the child's session could have
 * expired (or, during local dev, a server restart invalidated it) without
 * any visible sign beforehand. Without this, a 401 response silently reads
 * as `result.correct === undefined` — falsy — so a correct answer given
 * while logged out looks exactly like a wrong one, with "Het antwoord is
 * undefined" as the reported correct answer.
 */
export async function guardedFetch(url: string, options?: RequestInit): Promise<Response | null> {
  const res = await fetch(url, options);
  if (res.status === 401) {
    window.alert("Je bent uitgelogd. Log opnieuw in om verder te gaan.");
    window.location.href = "/";
    return null;
  }
  return res;
}
