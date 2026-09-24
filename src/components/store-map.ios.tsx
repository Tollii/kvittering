import { Ore } from "@/lib/domain/ore";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { useTheme } from "@/constants/theme";
import { Copy } from "@/components/ui";
import type { StoreMapProps } from "./store-map";
import { z } from "zod";

/** The effect key is serialized so amount-only updates keep the map position. */
const storeLocations = z.array(
  z.object({ latitude: z.number(), longitude: z.number() }),
);

export function StoreMap({ stores, onSelect }: Readonly<StoreMapProps>) {
  const colors = useTheme();
  const map = useRef<MapView>(null);
  const [ready, setReady] = useState(false);

  // Amount updates must not reset a map that the user has moved.
  const coordinateKey = JSON.stringify(
    [...stores]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((store) => store.location),
  );

  useEffect(() => {
    if (!ready) return;
    const coordinates = storeLocations.parse(JSON.parse(coordinateKey));

    if (coordinates.length === 1) {
      map.current?.animateToRegion(
        { ...coordinates[0], latitudeDelta: 0.02, longitudeDelta: 0.02 },
        0,
      );
    } else {
      map.current?.fitToCoordinates(coordinates, {
        edgePadding: { top: 45, right: 45, bottom: 45, left: 45 },
        animated: false,
      });
    }
  }, [coordinateKey, ready]);
  const maximum = Math.max(1, ...stores.map((store) => store.amountOre));

  return (
    <View style={{ gap: 8 }}>
      <View style={{ height: 280, borderRadius: 20, overflow: "hidden" }}>
        <MapView
          ref={map}
          style={{ flex: 1 }}
          onMapReady={() => setReady(true)}
          initialRegion={{
            ...stores[0].location,
            latitudeDelta: 0.04,
            longitudeDelta: 0.04,
          }}
          showsUserLocation={false}
          showsPointsOfInterests={false}
          rotateEnabled={false}
          pitchEnabled={false}
        >
          {stores.map((store, index) => {
            const size =
              32 + 24 * Math.sqrt(Math.max(0, store.amountOre) / maximum);

            return (
              <Marker
                key={store.id}
                coordinate={store.location}
                title={store.name}
                description={Ore.format(store.amountOre)}
                onPress={() => onSelect(store.id)}
              >
                <View
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel={`${store.name}, ${Ore.format(store.amountOre)}`}
                  style={{
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: colors.hero,
                    borderColor: colors.surface,
                    borderWidth: 3,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Copy size={14} weight="700" style={{ color: colors.onHero }}>
                    {index + 1}
                  </Copy>
                </View>
              </Marker>
            );
          })}
        </MapView>
      </View>
      <Copy size={13} muted>
        Større sirkler viser høyere vareforbruk. Trykk på en butikk for å se
        kjøpene.
      </Copy>
    </View>
  );
}
