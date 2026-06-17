// Google-Maps-Geocoding über das Lovable-Connector-Gateway. Server-only.
// Wird ausschliesslich vom Admin-Flow `geocodeLocation` aufgerufen.

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

export type GeocodeResult = {
  latitude: number;
  longitude: number;
  formattedAddress: string;
};

type GeocodeApiResponse = {
  status: string;
  error_message?: string;
  results: Array<{
    formatted_address: string;
    geometry: { location: { lat: number; lng: number } };
  }>;
};

export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const trimmed = address.trim();
  if (!trimmed) throw new Error("Adresse leer — bitte Straße/PLZ/Ort am Standort hinterlegen.");

  const lovableKey = process.env.LOVABLE_API_KEY;
  const connectorKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!lovableKey || !connectorKey) {
    throw new Error("Google-Maps-Connector ist nicht konfiguriert.");
  }

  const url = `${GATEWAY_URL}/maps/api/geocode/json?address=${encodeURIComponent(trimmed)}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connectorKey,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Geocoding fehlgeschlagen (${response.status}): ${body.slice(0, 200)}`);
  }
  const data = (await response.json()) as GeocodeApiResponse;
  if (data.status !== "OK" || data.results.length === 0) {
    throw new Error(
      `Geocoding fehlgeschlagen: ${data.status}${data.error_message ? ` — ${data.error_message}` : ""}`,
    );
  }
  const first = data.results[0];
  return {
    latitude: first.geometry.location.lat,
    longitude: first.geometry.location.lng,
    formattedAddress: first.formatted_address,
  };
}
