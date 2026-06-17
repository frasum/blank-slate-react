// Browser-Helper: holt einmalig einen frischen GPS-Fix.
// Nutzt `enableHighAccuracy`, kein Cache (`maximumAge: 0`),
// damit niemand alte Positionen recyclen kann.

export type GpsFix = {
  latitude: number;
  longitude: number;
  accuracyM: number;
};

export type GpsErrorReason =
  | "unsupported"
  | "permission_denied"
  | "position_unavailable"
  | "timeout";

export class GpsError extends Error {
  reason: GpsErrorReason;
  constructor(reason: GpsErrorReason, message: string) {
    super(message);
    this.reason = reason;
    this.name = "GpsError";
  }
}

export async function getCurrentPosition(options: { timeoutMs?: number } = {}): Promise<GpsFix> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new GpsError("unsupported", "Dieses Gerät unterstützt keine Standortabfrage.");
  }
  const timeoutMs = options.timeoutMs ?? 10_000;

  return new Promise<GpsFix>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
        }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(
            new GpsError(
              "permission_denied",
              "Standortfreigabe verweigert. Bitte in den Geräte-/Browsereinstellungen aktivieren.",
            ),
          );
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          reject(
            new GpsError(
              "position_unavailable",
              "Standort nicht verfügbar. Bitte im Freien erneut versuchen.",
            ),
          );
        } else if (err.code === err.TIMEOUT) {
          reject(
            new GpsError("timeout", "GPS-Abfrage hat zu lange gedauert. Bitte erneut versuchen."),
          );
        } else {
          reject(new GpsError("position_unavailable", err.message || "Standortfehler."));
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs },
    );
  });
}
