// Geofence-Entscheidung — reine Logik, ohne I/O.
//
// Eingaben:
//  - point: GPS-Position des Mitarbeiters (lat/lng) + accuracyM (Radius
//    der Positionsunsicherheit, wie von der Geolocation API geliefert)
//  - fence: Mittelpunkt des Standorts + erlaubter Radius in Metern
//
// Regeln (entspricht „hart blockieren" aus dem Bauplan):
//  - kein Fix / NaN-Werte → `no_fix`
//  - accuracyM > fence.radiusM → `accuracy_too_low`
//    (sonst könnte ein ungenauer Fix außerhalb fälschlich als „drin" gelten)
//  - distance > radius → `outside`
//  - sonst → ok

import { distanceMeters } from "./haversine";

export type GeoPoint = { latitude: number; longitude: number };
export type GeoFix = GeoPoint & { accuracyM: number };
export type GeoFence = GeoPoint & { radiusM: number };

export type GeofenceReason = "ok" | "no_fix" | "accuracy_too_low" | "outside";

export type GeofenceDecision =
  | { ok: true; reason: "ok"; distanceM: number }
  | { ok: false; reason: Exclude<GeofenceReason, "ok">; distanceM: number | null };

export function isWithinGeofence(input: { fix: GeoFix; fence: GeoFence }): GeofenceDecision {
  const { fix, fence } = input;

  if (
    !Number.isFinite(fix.latitude) ||
    !Number.isFinite(fix.longitude) ||
    !Number.isFinite(fix.accuracyM) ||
    fix.accuracyM < 0
  ) {
    return { ok: false, reason: "no_fix", distanceM: null };
  }
  if (
    !Number.isFinite(fence.latitude) ||
    !Number.isFinite(fence.longitude) ||
    !Number.isFinite(fence.radiusM) ||
    fence.radiusM <= 0
  ) {
    return { ok: false, reason: "no_fix", distanceM: null };
  }

  if (fix.accuracyM > fence.radiusM) {
    return { ok: false, reason: "accuracy_too_low", distanceM: null };
  }

  const distanceM = distanceMeters(
    fix.latitude,
    fix.longitude,
    fence.latitude,
    fence.longitude,
  );
  if (!Number.isFinite(distanceM)) {
    return { ok: false, reason: "no_fix", distanceM: null };
  }

  if (distanceM > fence.radiusM) {
    return { ok: false, reason: "outside", distanceM };
  }
  return { ok: true, reason: "ok", distanceM };
}