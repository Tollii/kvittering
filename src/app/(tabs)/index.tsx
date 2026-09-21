import { recordEvent } from "@/lib/observability";
import { useVisionKitEnabled } from "@/features/camera-preferences";
import ReceiptIntelligence from "../../../modules/receipt-intelligence/src/ReceiptIntelligenceModule";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  AppState,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { router, useIsFocused } from "expo-router";
import {
  Button,
  Copy,
  Icon,
  IconButton,
  Notice,
  Panel,
  Sheet,
  Toggle,
  pressed,
} from "@/components/ui";
import { useHousehold } from "@/features/session";
import { saveLocalReceipts } from "@/lib/receipt-storage";
import {
  importReceiptFiles,
  maxReceiptImages,
  prepareImage,
  type ImportedFile,
} from "@/lib/receipt-import";
import {
  claimImportedFiles,
  finishImportedFiles,
  retryImportedFiles,
  dismissImportedFiles,
  offerImportedFiles,
  usePendingImports,
} from "@/lib/pending-import";
import { nextImport, type ImportOutcome } from "@/features/capture-import";
import { useTheme } from "@/constants/theme";

const cameraBackground = "#101C51";

const onCamera = "#F6F3EA";

const onCameraMuted = "#E3E7FF";

export default function Capture() {
  const colors = useTheme();
  const visionKit = useVisionKitEnabled();
  const { width } = useWindowDimensions();
  const { owner, household, online, synchronize, queue } = useHousehold();
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
  const [operation, setOperation] = useState<"idle" | "working">("idle");
  const busy = operation !== "idle";
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(0);
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

  const run = useCallback(
    async (action: () => Promise<void>): Promise<ImportOutcome> => {
      if (busyRef.current) return "busy";
      busyRef.current = true;
      setOperation("working");
      setError("");
      setSaved(0);

      try {
        await action();

        return "completed";
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Bildet kunne ikke åpnes.",
        );

        return "failed";
      } finally {
        busyRef.current = false;
        setOperation("idle");
      }
    },
    [],
  );

  /** Shared images and PDFs arrive here from the share sheet and the file picker. */
  const addFiles = useCallback(
    (files: ImportedFile[]) =>
      run(async () => {
        const room = maxReceiptImages - photos.length;

        if (room <= 0) throw new Error(`Maks ${maxReceiptImages} bilder`);
        const imported = await importReceiptFiles(files, room);

        if (!mounted.current || !imported.uris.length)
          throw new Error("Importen ble avbrutt. Prøv igjen.");
        setPhotos((current) => [...current, ...imported.uris]);

        if (imported.singleDocument && photos.length === 0) setCombined(true);
        setReview(true);
      }),
    [photos.length, run],
  );

  const takePhoto = () =>
    run(async () => {
      if (!ready || !camera.current) return;

      if (photos.length >= maxReceiptImages)
        throw new Error(`Maks ${maxReceiptImages} bilder`);
      recordEvent("receipt.capture", { operation: "camera" });
      const result = await camera.current.takePictureAsync({ quality: 0.9 });

      if (!result) throw new Error("Kameraet kunne ikke ta et bilde.");
      const uri = await prepareImage(result.uri, result.width, result.height);
      setPhotos((current) => [...current, uri]);
      setReview(true);
    });

  const scanDocument = () =>
    run(async () => {
      if (!ReceiptIntelligence?.scanDocument)
        throw new Error("Oppdater appen for å bruke VisionKit.");

      const cameraPermission = permission?.granted
        ? permission
        : await requestPermission();

      if (!cameraPermission.granted)
        throw new Error("Tillat kamera i Innstillinger for å skanne.");
      const room = maxReceiptImages - photos.length;

      if (room <= 0) throw new Error(`Maks ${maxReceiptImages} bilder`);
      recordEvent("receipt.capture", { operation: "visionkit" });
      const pages = await ReceiptIntelligence.scanDocument(room);

      if (!pages || !mounted.current) return;

      const imported = await importReceiptFiles(
        pages.map((uri) => ({ uri, mimeType: "image/jpeg" })),
        room,
      );

      if (!mounted.current) return;
      setPhotos((current) => [...current, ...imported.uris]);

      if (photos.length === 0) setCombined(true);
      setReview(true);
    });

  const choosePhotos = () =>
    run(async () => {
      if (photos.length >= maxReceiptImages)
        throw new Error(`Maks ${maxReceiptImages} bilder`);

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: maxReceiptImages - photos.length,
        orderedSelection: true,
        quality: 1,
      });

      if (result.canceled) return;

      if (result.assets.length + photos.length > maxReceiptImages)
        throw new Error(`Maks ${maxReceiptImages} bilder`);
      const selected: string[] = [];

      for (const asset of result.assets)
        selected.push(await prepareImage(asset.uri, asset.width, asset.height));
      setPhotos((current) => [...current, ...selected]);
      setReview(true);
    });

  const chooseFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/*"],
      multiple: true,
      copyToCacheDirectory: true,
    });

    if (result.canceled) return;
    offerImportedFiles(
      result.assets.map((asset) => ({
        uri: asset.uri,
        mimeType: asset.mimeType,
        name: asset.name,
      })),
    );
  };

  // Files shared from other apps wait until this screen is on show.
  const pendingImports = usePendingImports();
  useEffect(() => {
    const next = nextImport(pendingImports, focused, busy);

    if (!next || busyRef.current) return;
    const batch = claimImportedFiles(next.id);

    if (!batch) return;
    void addFiles(batch.files).then((outcome) =>
      finishImportedFiles(batch.id, outcome),
    );
  }, [addFiles, busy, focused, pendingImports]);

  const failedImports = pendingImports.filter(
    (batch) => batch.state === "failed",
  );

  const importRecovery = failedImports.map((batch) => (
    <Panel key={batch.id}>
      <Notice error>
        Importen er ikke fullført. Filene venter på nytt forsøk.
      </Notice>
      <Button
        title="Prøv importen igjen"
        disabled={busy}
        onPress={() => retryImportedFiles(batch.id)}
      />
      <Button
        title="Forkast importen"
        secondary
        disabled={busy}
        onPress={() => dismissImportedFiles(batch.id)}
      />
    </Panel>
  ));

  const save = () =>
    run(async () => {
      const count = combined ? 1 : photos.length;
      saveLocalReceipts(owner, household.id, photos, combined);
      setPhotos([]);
      setCombined(false);
      setReview(false);
      setSaved(count);
      void synchronize();
    });

  const live =
    permission?.granted && focused && foreground && !review && !visionKit;

  const uploading = queue.some((entry) => !entry.error);
  const failed = queue.some((entry) => !!entry.error);
  // Let the success note fade away on its own once the upload has landed.
  useEffect(() => {
    if (!saved || uploading || failed) return undefined;
    const timeout = setTimeout(() => setSaved(0), 8000);

    return () => clearTimeout(timeout);
  }, [saved, uploading, failed]);
  // Two tiles per row inside the sheet's 16pt padding and 10pt gap.
  const tile = Math.floor((width - 32 - 10) / 2);

  const overlay = (children: ReactNode, style?: ViewStyle) => (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 14,
          borderCurve: "continuous",
          backgroundColor: "#101C51B3",
        },
        style,
      ]}
    >
      {children}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: cameraBackground }}>
      {live && (
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
      )}
      <SafeAreaView
        edges={["top", "left", "right", "bottom"]}
        style={{ flex: 1, padding: 16, gap: 12 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {overlay(
            <>
              <Copy size={15} weight="700" style={{ color: onCamera }}>
                {visionKit ? "VisionKit-skanner" : "Ny kvittering"}
              </Copy>
              <Copy
                size={13}
                numberOfLines={1}
                style={{ color: onCameraMuted, flexShrink: 1 }}
              >
                {household.name}
              </Copy>
            </>,
            { flexShrink: 1 },
          )}
          <View style={{ flex: 1 }} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Importer PDF eller bilde fra Filer"
            disabled={busy}
            onPress={() => void chooseFiles()}
            hitSlop={6}
            style={(state) => [
              {
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: "#101C51B3",
                alignItems: "center",
                justifyContent: "center",
              },
              pressed(state),
            ]}
          >
            <Icon name="doc.badge.plus" size={17} color={onCamera} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Husstanden og innstillinger"
            onPress={() => router.push("/settings")}
            hitSlop={6}
            style={(state) => [
              {
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: "#101C51B3",
                alignItems: "center",
                justifyContent: "center",
              },
              pressed(state),
            ]}
          >
            <Icon name="person.2" size={17} color={onCamera} />
          </Pressable>
        </View>
        {!online && <Notice icon="wifi.slash">Uten nett</Notice>}
        {saved > 0 && (
          <Panel style={{ gap: 4 }}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              {uploading ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <Icon
                  name={
                    failed ? "arrow.clockwise.circle" : "checkmark.circle.fill"
                  }
                  size={22}
                  color={failed ? colors.warning : colors.success}
                />
              )}
              <Copy weight="700" style={{ flex: 1 }}>
                {uploading
                  ? online
                    ? "Laster opp …"
                    : "Venter på nett"
                  : failed
                    ? "Prøver igjen"
                    : saved === 1
                      ? "Lastet opp"
                      : `${saved} kvitteringer lastet opp`}
              </Copy>
              <IconButton
                name="xmark"
                label="Lukk"
                size={14}
                color={colors.secondary}
                onPress={() => setSaved(0)}
              />
            </View>
          </Panel>
        )}
        {!!error && !review && <Notice error>{error}</Notice>}
        {!review && importRecovery}
        <View style={{ flex: 1, justifyContent: "center" }}>
          {live ? (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: 24,
                bottom: 24,
                left: 18,
                right: 18,
              }}
            >
              {(["tl", "tr", "bl", "br"] as const).map((corner) => (
                <View
                  key={corner}
                  style={{
                    position: "absolute",
                    width: 28,
                    height: 28,
                    borderColor: "#FFFFFFCC",
                    top: corner.startsWith("t") ? 0 : undefined,
                    bottom: corner.startsWith("b") ? 0 : undefined,
                    left: corner.endsWith("l") ? 0 : undefined,
                    right: corner.endsWith("r") ? 0 : undefined,
                    borderTopWidth: corner.startsWith("t") ? 2 : 0,
                    borderBottomWidth: corner.startsWith("b") ? 2 : 0,
                    borderLeftWidth: corner.endsWith("l") ? 2 : 0,
                    borderRightWidth: corner.endsWith("r") ? 2 : 0,
                    borderTopLeftRadius: corner === "tl" ? 8 : 0,
                    borderTopRightRadius: corner === "tr" ? 8 : 0,
                    borderBottomLeftRadius: corner === "bl" ? 8 : 0,
                    borderBottomRightRadius: corner === "br" ? 8 : 0,
                  }}
                />
              ))}
            </View>
          ) : (
            !review && (
              <View style={{ padding: 28, gap: 14, alignItems: "center" }}>
                <Icon
                  name={visionKit ? "doc.viewfinder" : "camera.viewfinder"}
                  size={52}
                  color={onCameraMuted}
                />
                {visionKit && (
                  <Copy style={{ color: onCamera, textAlign: "center" }}>
                    Trykk på skanneknappen for å åpne VisionKit.
                  </Copy>
                )}
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
            )
          )}
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 20,
            paddingBottom: 4,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Velg fra bilder"
            disabled={busy}
            onPress={() => void choosePhotos()}
            style={(state) => [
              {
                width: 54,
                height: 54,
                borderRadius: 18,
                borderCurve: "continuous",
                backgroundColor: "#101C51B3",
                alignItems: "center",
                justifyContent: "center",
              },
              pressed(state),
            ]}
          >
            <Icon name="photo.on.rectangle" size={22} color={onCamera} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              visionKit
                ? "Skann kvittering med VisionKit"
                : "Ta bilde av kvitteringen"
            }
            disabled={busy || (!visionKit && (!ready || !live))}
            onPress={() => void (visionKit ? scanDocument() : takePhoto())}
            style={(state) => [
              {
                width: 78,
                height: 78,
                padding: 5,
                borderRadius: 39,
                borderWidth: 3,
                borderColor: "white",
                opacity: busy || (!visionKit && (!ready || !live)) ? 0.4 : 1,
              },
              state.pressed && { opacity: 0.7 },
            ]}
          >
            <View
              style={{ flex: 1, borderRadius: 33, backgroundColor: "white" }}
            />
          </Pressable>
          {photos.length ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Se ${photos.length} valgte bilder`}
              onPress={() => setReview(true)}
              style={(state) => [
                {
                  width: 54,
                  height: 54,
                  borderRadius: 18,
                  borderCurve: "continuous",
                  overflow: "hidden",
                  backgroundColor: "#101C51B3",
                  alignItems: "center",
                  justifyContent: "center",
                },
                pressed(state),
              ]}
            >
              <Image
                source={{ uri: photos[photos.length - 1] }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
              />
              <View
                style={{
                  position: "absolute",
                  right: 4,
                  bottom: 4,
                  minWidth: 20,
                  height: 20,
                  borderRadius: 10,
                  paddingHorizontal: 5,
                  backgroundColor: colors.primary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Copy
                  size={12}
                  weight="700"
                  style={{ color: colors.onPrimary }}
                >
                  {photos.length}
                </Copy>
              </View>
            </Pressable>
          ) : (
            // Keeps the shutter centred; nothing to review yet.
            <View style={{ width: 54, height: 54 }} />
          )}
        </View>
      </SafeAreaView>
      <Sheet
        title={
          photos.length === 1
            ? "Ett bilde valgt"
            : `${photos.length} bilder valgt`
        }
        visible={review}
        dismissible={!busy}
        onClose={() => {
          if (!busy) setReview(false);
        }}
        footer={
          <>
            {!!error && <Notice error>{error}</Notice>}
            {importRecovery}
            <Button
              title={
                combined || photos.length === 1
                  ? "Lagre kvittering"
                  : `Lagre som ${photos.length} kvitteringer`
              }
              icon="checkmark"
              disabled={!photos.length}
              busy={busy}
              onPress={() => void save()}
            />
          </>
        }
      >
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {photos.map((uri, index) => (
            <View key={uri} style={{ width: tile, height: tile * 1.33 }}>
              <Image
                source={{ uri }}
                style={{
                  width: tile,
                  height: tile * 1.33,
                  borderRadius: 14,
                  backgroundColor: colors.muted,
                }}
                resizeMode="cover"
                accessibilityLabel={`Kvitteringsbilde ${index + 1}`}
              />
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: 8,
                  top: 8,
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: "#101C51CC",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Copy size={12} weight="700" style={{ color: onCamera }}>
                  {index + 1}
                </Copy>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Fjern bilde ${index + 1}`}
                disabled={busy}
                hitSlop={8}
                onPress={() => {
                  setPhotos((current) =>
                    current.filter((photo) => photo !== uri),
                  );

                  if (photos.length <= 2) setCombined(false);
                }}
                style={(state) => [
                  {
                    position: "absolute",
                    right: 8,
                    top: 8,
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: "#101C51CC",
                    alignItems: "center",
                    justifyContent: "center",
                  },
                  pressed(state),
                ]}
              >
                <Icon name="xmark" size={12} color={onCamera} />
              </Pressable>
            </View>
          ))}
        </View>
        {photos.length > 1 && (
          <Panel style={{ gap: 4 }}>
            <Toggle
              label="Samme kvittering"
              value={combined}
              onChange={setCombined}
              disabled={busy}
            />
          </Panel>
        )}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button
              title="Ta flere"
              secondary
              icon="camera"
              disabled={busy || photos.length >= maxReceiptImages}
              onPress={() => setReview(false)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              title="Velg flere"
              secondary
              icon="photo.on.rectangle"
              disabled={busy || photos.length >= maxReceiptImages}
              onPress={() => void choosePhotos()}
            />
          </View>
        </View>
      </Sheet>
    </View>
  );
}
