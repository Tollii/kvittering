import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useIsFocused } from "expo-router";
import {
  Button,
  Copy,
  Icon,
  Notice,
  Panel,
  Screen,
  Sheet,
  Toggle,
} from "@/components/ui";
import { useHousehold } from "@/features/session";
import { saveLocalReceipts } from "@/lib/receipt-storage";

export default function Capture() {
  const { owner, household, online, synchronize } = useHousehold();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  const [ready, setReady] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [combined, setCombined] = useState(false);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) =>
      setForeground(state === "active"),
    );
    return () => listener.remove();
  }, []);
  const attachCamera = useCallback((value: CameraView | null) => {
    camera.current = value;
    if (!value) setReady(false);
  }, []);
  async function run(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Bildet kunne ikke åpnes.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function prepare(uri: string, width: number, height: number) {
    const image = ImageManipulator.manipulate(uri);
    if (Math.max(width, height) > 2400)
      image.resize(width > height ? { width: 2400 } : { height: 2400 });
    const rendered = await image.renderAsync();
    const result = await rendered.saveAsync({
      compress: 0.85,
      format: SaveFormat.JPEG,
    });
    rendered.release();
    image.release();
    return result.uri;
  }
  const takePhoto = () =>
    run(async () => {
      if (!ready || !camera.current) return;
      if (photos.length >= 8)
        throw new Error("Du kan velge opptil åtte bilder.");
      const result = await camera.current.takePictureAsync({ quality: 0.9 });
      if (!result) throw new Error("Kameraet kunne ikke ta et bilde.");
      const uri = await prepare(result.uri, result.width, result.height);
      setPhotos((current) => [...current, uri]);
      setReview(true);
    });
  const choosePhotos = () =>
    run(async () => {
      if (photos.length >= 8)
        throw new Error("Du kan velge opptil åtte bilder.");
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: 8 - photos.length,
        orderedSelection: true,
        quality: 1,
      });
      if (result.canceled) return;
      if (result.assets.length + photos.length > 8)
        throw new Error("Du kan velge opptil åtte bilder.");
      const selected: string[] = [];
      for (const asset of result.assets)
        selected.push(await prepare(asset.uri, asset.width, asset.height));
      setPhotos((current) => [...current, ...selected]);
      setReview(true);
    });
  const save = () =>
    run(async () => {
      saveLocalReceipts(owner, household.id, photos, combined);
      setPhotos([]);
      setCombined(false);
      setReview(false);
      setSaved(true);
      void synchronize();
    });
  return (
    <Screen title="Ny kvittering" subtitle={household.name} settings>
      {!online && <Notice>Uten nett. Bilder lagres på denne enheten.</Notice>}
      {Platform.OS === "web" ? (
        <Notice>
          Åpne Kvitto på iPhone for å ta og lagre kvitteringsbilder.
        </Notice>
      ) : (
        <View
          style={{
            height: 390,
            borderRadius: 28,
            overflow: "hidden",
            backgroundColor: "#14271F",
            justifyContent: "center",
          }}
        >
          {permission?.granted && focused && foreground && !review ? (
            <CameraView
              ref={attachCamera}
              style={StyleSheet.absoluteFill}
              facing="back"
              mode="picture"
              onCameraReady={() => setReady(true)}
              onMountError={() =>
                setError(
                  "Kameraet er ikke tilgjengelig. Velg et bilde fra biblioteket.",
                )
              }
            />
          ) : (
            <View style={{ padding: 28, gap: 18, alignItems: "center" }}>
              <Icon name="camera" size={56} color="#D7E8DC" />
              <Copy
                size={22}
                weight="600"
                style={{ color: "#FFFFFF", textAlign: "center" }}
              >
                Et bilde. Full oversikt.
              </Copy>
              <Copy style={{ color: "#D7E8DC", textAlign: "center" }}>
                Legg kvitteringen flatt, og få med alle linjene.
              </Copy>
              {!permission?.granted && (
                <Button
                  title={
                    permission?.canAskAgain === false
                      ? "Åpne innstillinger"
                      : "Tillat kamera"
                  }
                  onPress={() =>
                    void run(async () => {
                      if (permission?.canAskAgain === false)
                        await Linking.openSettings();
                      else await requestPermission();
                    })
                  }
                />
              )}
            </View>
          )}
          {permission?.granted && (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: 35,
                bottom: 90,
                left: 46,
                right: 46,
                borderColor: "#FFFFFFA0",
                borderWidth: 1.5,
                borderRadius: 12,
              }}
            />
          )}
          {permission?.granted && (
            <View
              style={{ position: "absolute", bottom: 14, alignSelf: "center" }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ta bilde av kvitteringen"
                disabled={!ready || busy}
                onPress={() => void takePhoto()}
                style={{
                  width: 68,
                  height: 68,
                  padding: 5,
                  borderRadius: 34,
                  borderWidth: 3,
                  borderColor: "white",
                  opacity: !ready || busy ? 0.4 : 1,
                }}
              >
                <View
                  style={{
                    flex: 1,
                    borderRadius: 28,
                    backgroundColor: "white",
                  }}
                />
              </Pressable>
            </View>
          )}
        </View>
      )}
      {Platform.OS !== "web" && (
        <Button
          title="Velg fra bilder"
          secondary
          icon="photo.on.rectangle"
          disabled={busy}
          onPress={() => void choosePhotos()}
        />
      )}
      {photos.length > 0 && (
        <Button
          title={`Se ${photos.length} valgte bilder`}
          onPress={() => setReview(true)}
        />
      )}
      {saved && (
        <Panel>
          <Copy weight="600">Kvitteringen er lagret på enheten.</Copy>
          <Copy muted>
            Hold appen åpen mens bildene lastes opp. Resultatet kommer i
            innboksen.
          </Copy>
        </Panel>
      )}
      {!!error && !review && <Notice error>{error}</Notice>}
      <Copy muted size={13}>
        Lange kvitteringer kan deles i flere bilder. Ta med litt av forrige
        bilde i neste bilde.
      </Copy>
      <Sheet
        title="Valgte bilder"
        visible={review}
        onClose={() => {
          if (!busy) setReview(false);
        }}
      >
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {photos.map((uri, index) => (
            <View key={uri} style={{ width: "46%", gap: 8 }}>
              <Image
                source={{ uri }}
                style={{ width: "100%", height: 210, borderRadius: 12 }}
                resizeMode="cover"
                accessibilityLabel={`Kvitteringsbilde ${index + 1}`}
              />
              <Button
                title={`Fjern bilde ${index + 1}`}
                secondary
                disabled={busy}
                onPress={() => {
                  setPhotos((current) =>
                    current.filter((photo) => photo !== uri),
                  );
                  if (photos.length <= 2) setCombined(false);
                }}
              />
            </View>
          ))}
        </View>
        {photos.length > 1 && (
          <Toggle
            label="Bildene er deler av samme kvittering"
            value={combined}
            onChange={setCombined}
            disabled={busy}
          />
        )}
        <Copy muted>
          {combined
            ? "Bildene leses i rekkefølgen over."
            : "Hvert bilde lagres som en egen kvittering."}
        </Copy>
        {!!error && <Notice error>{error}</Notice>}
        <Button
          title={
            combined || photos.length === 1
              ? "Lagre kvittering"
              : `Lagre ${photos.length} kvitteringer`
          }
          disabled={!photos.length}
          busy={busy}
          onPress={() => void save()}
        />
        <Button
          title="Ta flere bilder"
          secondary
          disabled={busy || photos.length >= 8}
          onPress={() => setReview(false)}
        />
        <Button
          title="Velg flere bilder"
          secondary
          disabled={busy || photos.length >= 8}
          onPress={() => void choosePhotos()}
        />
      </Sheet>
    </Screen>
  );
}
