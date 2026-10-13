import { CaptureReview } from "@/features/capture-review";
import { ManualPurchaseSheet } from "@/features/manual-purchase";
import { SaveNotePanel, saveNote, type LastSave } from "@/features/save-note";
import { recordEvent } from "@/lib/observability";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AppState,
  Image,
  Linking,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import Animated from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { useIsFocused } from "expo-router";
import type { SymbolViewProps } from "expo-symbols";
import {
  Button,
  Copy,
  Icon,
  Notice,
  Panel,
  faded,
  Press,
  SettingsButton,
  useArrival,
  useDeparture,
  useLargeText,
} from "@/components/ui";
import { useHousehold } from "@/features/household-context";
import { OfflineNotice } from "@/features/offline-notice";
import { saveLocalReceipts } from "@/lib/receipt-storage";
import { maxReceiptImages, prepareImage } from "@/lib/receipt-import";
import {
  receiveImportedFiles,
  retryImportedFiles,
  dismissImportedFiles,
  offerImportedFiles,
  usePendingImports,
} from "@/lib/pending-import";
import { nextImport, type ImportOutcome } from "@/lib/capture-import";
import { radius, useTheme } from "@/constants/theme";
import { failureMessage } from "@/lib/failure-message";
import { UserError } from "@/lib/user-errors";

/** A round control on the camera view. */
function CameraDisc({
  icon,
  label,
  disabled,
  onPress,
}: Readonly<{
  icon: SymbolViewProps["name"];
  label: string;
  disabled: boolean;
  onPress: () => void;
}>) {
  const colors = useTheme();

  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      accessibilityState={{ disabled, busy: disabled }}
      onPress={onPress}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.cameraOverlay,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name={icon} size={17} color={colors.onCamera} />
    </Press>
  );
}

export default function Capture() {
  const colors = useTheme();
  const largeText = useLargeText();
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
  const [lastSave, setLastSave] = useState<LastSave>(null);
  const [entering, setEntering] = useState(false);
  const arrival = useArrival();
  const departure = useDeparture();
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
      setLastSave(null);

      try {
        await action();

        return "completed";
      } catch (cause) {
        setError(
          failureMessage(cause, "receipt.import", "Bildet kunne ikke åpnes."),
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
    (id: number) =>
      run(() =>
        receiveImportedFiles(
          id,
          maxReceiptImages - photos.length,
          (imported) => {
            if (!mounted.current || !imported.uris.length)
              throw new UserError({
                code: "REJECTED",
                message: "Importen ble avbrutt. Prøv igjen.",
              });
            setPhotos((current) => [...current, ...imported.uris]);

            if (imported.singleDocument && photos.length === 0)
              setCombined(true);
            setReview(true);
          },
        ),
      ),
    [photos.length, run],
  );

  const takePhoto = () =>
    run(async () => {
      if (!ready || !camera.current) return;

      if (photos.length >= maxReceiptImages)
        throw new UserError({
          code: "REJECTED",
          message: `Maks ${maxReceiptImages} bilder`,
        });
      recordEvent("receipt.capture", { operation: "camera" });
      const result = await camera.current.takePictureAsync({ quality: 0.9 });

      const uri = await prepareImage(result.uri, result.width, result.height);
      setPhotos((current) => [...current, uri]);
      setReview(true);
    });

  const choosePhotos = () =>
    run(async () => {
      if (photos.length >= maxReceiptImages)
        throw new UserError({
          code: "REJECTED",
          message: `Maks ${maxReceiptImages} bilder`,
        });

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: maxReceiptImages - photos.length,
        orderedSelection: true,
        quality: 1,
      });

      if (result.canceled) return;

      if (result.assets.length + photos.length > maxReceiptImages)
        throw new UserError({
          code: "REJECTED",
          message: `Maks ${maxReceiptImages} bilder`,
        });
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
    const next = nextImport(
      pendingImports,
      !focused ? "hidden" : busy ? "busy" : "idle",
    );

    if (!next || busyRef.current) return;
    void addFiles(next.id);
  }, [addFiles, busy, focused, pendingImports]);

  const failedImports = pendingImports.filter(
    (batch) => batch.state === "failed",
  );

  const importRecovery = failedImports.map((batch) => (
    <Panel key={batch.id}>
      <Notice tone="error">
        Importen er ikke fullført. Filene venter på nytt forsøk.
      </Notice>
      <Button
        title="Prøv importen igjen"
        disabled={busy}
        onPress={() => retryImportedFiles(batch.id)}
      />
      <Button
        title="Forkast importen"
        variant="secondary"
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
      setLastSave({ kind: "photos", count });
      void synchronize();
    });

  const live =
    permission?.granted && focused && foreground && !review && !entering;

  const shutterDisabled = busy || !ready || !live;

  const note = saveNote(lastSave, queue, online);
  const settled = !!note && !note.uploading && !note.failed;

  // Let the success note fade away on its own once the upload has landed.
  useEffect(() => {
    if (!settled) return undefined;

    const timeout = setTimeout(() => setLastSave(null), 8000);

    return () => clearTimeout(timeout);
  }, [settled, lastSave]);

  const overlay = (children: ReactNode, style?: ViewStyle) => (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: radius.tile,
          borderCurve: "continuous",
          backgroundColor: colors.cameraOverlay,
        },
        style,
      ]}
    >
      {children}
    </View>
  );

  const label = overlay(
    <>
      <Copy weight="700" style={{ color: colors.onCamera }}>
        Ny kvittering
      </Copy>
      <Copy
        role="detail"
        numberOfLines={largeText ? undefined : 1}
        style={{ color: colors.onCameraMuted, flexShrink: 1 }}
      >
        {household.name}
      </Copy>
    </>,
    largeText
      ? { flexWrap: "wrap", alignSelf: "flex-start", maxWidth: "100%" }
      : { flexShrink: 1 },
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.cameraBackground }}>
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
          {!largeText && label}
          <View style={{ flex: 1 }} />
          <CameraDisc
            icon="square.and.pencil"
            label="Legg inn kjøp uten kvittering"
            disabled={busy}
            onPress={() => setEntering(true)}
          />
          <CameraDisc
            icon="doc.badge.plus"
            label="Importer PDF eller bilde fra Filer"
            disabled={busy}
            onPress={() => void chooseFiles()}
          />
          <SettingsButton surface="camera" />
        </View>
        {/* At large text the label takes its own line under the buttons. */}
        {largeText && label}
        <OfflineNotice />
        {note && (
          <Animated.View entering={arrival} exiting={departure}>
            <SaveNotePanel note={note} onClose={() => setLastSave(null)} />
          </Animated.View>
        )}
        {!!error && !review && <Notice tone="error">{error}</Notice>}
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
                    borderColor: colors.cameraGuide,
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
                  name="camera.viewfinder"
                  size={52}
                  color={colors.onCameraMuted}
                />
                <Copy
                  accessibilityRole="header"
                  role="screenTitle"
                  style={{ color: colors.onCamera, textAlign: "center" }}
                >
                  Ta vare på kvitteringen
                </Copy>
                <Copy
                  style={{ color: colors.onCameraMuted, textAlign: "center" }}
                >
                  Ta et bilde, eller importer en kvittering fra Bilder eller
                  Filer.
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
          <Press
            accessibilityRole="button"
            accessibilityLabel="Velg fra bilder"
            disabled={busy}
            accessibilityState={{ disabled: busy, busy }}
            onPress={() => void choosePhotos()}
            style={{
              width: 54,
              height: 54,
              borderRadius: 27,
              backgroundColor: colors.cameraOverlay,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="photo.on.rectangle" size={22} color={colors.onCamera} />
          </Press>
          <Press
            accessibilityRole="button"
            accessibilityLabel="Ta bilde av kvitteringen"
            disabled={shutterDisabled}
            accessibilityState={{
              disabled: shutterDisabled,
              busy,
            }}
            onPress={() => void takePhoto()}
            style={[
              {
                width: 78,
                height: 78,
                padding: 5,
                borderRadius: 39,
                borderWidth: 3,
                borderColor: colors.onCamera,
              },
              faded(shutterDisabled),
            ]}
          >
            <View
              style={{
                flex: 1,
                borderRadius: 33,
                backgroundColor: colors.onCamera,
              }}
            />
          </Press>
          {photos.length ? (
            <Press
              accessibilityRole="button"
              accessibilityLabel={`Se ${photos.length} valgte bilder`}
              onPress={() => setReview(true)}
              style={{
                width: 54,
                height: 54,
                borderRadius: 27,
                overflow: "hidden",
                backgroundColor: colors.cameraOverlay,
                alignItems: "center",
                justifyContent: "center",
              }}
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
                  minHeight: 20,
                  borderRadius: 12,
                  borderCurve: "continuous",
                  paddingHorizontal: 5,
                  backgroundColor: colors.primary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Copy role="counter" style={{ color: colors.onPrimary }}>
                  {photos.length}
                </Copy>
              </View>
            </Press>
          ) : (
            // Keeps the shutter centred; nothing to review yet.
            <View style={{ width: 54, height: 54 }} />
          )}
        </View>
      </SafeAreaView>
      <ManualPurchaseSheet
        visible={entering}
        onClose={() => setEntering(false)}
        onSaved={() => {
          setEntering(false);
          // An upload still on its way keeps its note.
          setLastSave((current) =>
            current?.kind === "photos" && !settled
              ? current
              : { kind: "purchase" },
          );
        }}
      />
      <CaptureReview
        photos={photos}
        combined={combined}
        visible={review}
        busy={busy}
        error={error}
        importRecovery={importRecovery}
        onClose={() => setReview(false)}
        onSave={() => void save()}
        onCombinedChange={setCombined}
        onRemovePhoto={(uri) => {
          setPhotos((current) => current.filter((photo) => photo !== uri));

          if (photos.length <= 2) setCombined(false);
        }}
      />
    </View>
  );
}
