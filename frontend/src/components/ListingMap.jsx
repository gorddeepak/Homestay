import { useEffect, useRef, useState } from "react";
import {
  GPUInitializationError,
  Map,
  Marker,
  NavigationControl,
  setWorkerUrl,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";

import { getConfig } from "../api";

// MapLibre 6 is ESM-only and needs an explicit worker URL when bundled.
setWorkerUrl(workerUrl);

// The MapTiler key is the same public key the Express show page exposes.
let configPromise = null;

function loadMapKey() {
  if (!configPromise) {
    configPromise = getConfig().catch((error) => {
      configPromise = null;
      throw error;
    });
  }
  return configPromise;
}

function mapCoordinates(geometry) {
  if (
    geometry?.type !== "Point" ||
    !Array.isArray(geometry.coordinates) ||
    geometry.coordinates.length !== 2
  ) {
    return null;
  }
  return geometry.coordinates;
}

export default function ListingMap({ geometry, location }) {
  const containerRef = useRef(null);
  const [keyStatus, setKeyStatus] = useState("loading");
  const [key, setKey] = useState(null);
  const [mapFailed, setMapFailed] = useState(false);

  const coordinates = mapCoordinates(geometry);
  const longitude = coordinates ? coordinates[0] : null;
  const latitude = coordinates ? coordinates[1] : null;

  useEffect(() => {
    let active = true;

    loadMapKey()
      .then((config) => {
        if (!active) return;
        setKey(config.maptiler_key || null);
        setKeyStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setKeyStatus("unavailable");
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!key || longitude === null || latitude === null) {
      return undefined;
    }

    let map;
    try {
      map = new Map({
        container: containerRef.current,
        style: `https://api.maptiler.com/maps/streets/style.json?key=${encodeURIComponent(
          key,
        )}`,
        center: [longitude, latitude],
        zoom: 9,
      });
    } catch (error) {
      // MapLibre 6 needs WebGL2. Older devices throw instead of showing a
      // broken canvas, so fall back to the same message as a failed load.
      if (error instanceof GPUInitializationError) {
        setMapFailed(true);
        return undefined;
      }
      throw error;
    }

    map.addControl(new NavigationControl(), "top-right");
    new Marker().setLngLat([longitude, latitude]).addTo(map);
    // A rejected key or an offline network must fall back to a message
    // instead of leaving a blank, broken map on the page. Errors after the
    // first successful load are ignored so a transient tile failure does not
    // hide a working map.
    map.on("error", () => {
      if (!map.loaded()) {
        setMapFailed(true);
      }
    });

    return () => map.remove();
  }, [key, longitude, latitude]);

  let placeholder = "Loading map…";
  if (keyStatus === "unavailable") {
    placeholder = "The map is unavailable right now.";
  } else if (keyStatus === "ready" && !key) {
    placeholder = "The map is not configured for this site.";
  }

  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-bold text-ink">Where you'll be</h2>
      <p className="mt-1 text-sm text-sand">
        {location || "Location unavailable"}
      </p>

      {coordinates ? (
        <div className="relative mt-4">
          <div
            ref={containerRef}
            aria-label={`Map showing ${location || "the listing location"}`}
            className="h-[28rem] overflow-hidden rounded-3xl border border-clay"
          />
          {(!key || mapFailed) && (
            <p className="absolute inset-0 flex items-center justify-center rounded-3xl bg-clay/80 px-6 text-center text-sm text-sand">
              {mapFailed ? "The map could not be loaded." : placeholder}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-4 rounded-3xl border border-clay bg-clay/40 px-6 py-8 text-center text-sm text-sand">
          This stay does not have a map location yet.
        </p>
      )}
    </section>
  );
}
